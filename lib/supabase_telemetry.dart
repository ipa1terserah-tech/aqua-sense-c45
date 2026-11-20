import 'dart:async';
import 'dart:convert';
import 'dart:io';

class SupabaseConfig {
  const SupabaseConfig({
    required this.projectUrl,
    required this.anonKey,
    this.schema = 'public',
    this.table = 'telemetry',
  });

  static const fromEnvironment = SupabaseConfig(
    projectUrl: String.fromEnvironment('SUPABASE_URL'),
    anonKey: String.fromEnvironment('SUPABASE_ANON_KEY'),
    schema: String.fromEnvironment('SUPABASE_SCHEMA', defaultValue: 'public'),
    table: String.fromEnvironment(
      'SUPABASE_TELEMETRY_TABLE',
      defaultValue: 'telemetry',
    ),
  );

  final String projectUrl;
  final String anonKey;
  final String schema;
  final String table;

  bool get isConfigured => projectUrl.isNotEmpty && anonKey.isNotEmpty;

  Uri get telemetryUri {
    if (!isConfigured) {
      throw StateError('SUPABASE_URL dan SUPABASE_ANON_KEY belum diatur.');
    }
    final project = Uri.tryParse(projectUrl);
    if (project == null ||
        project.host.isEmpty ||
        (project.scheme != 'https' && project.scheme != 'http')) {
      throw const FormatException('SUPABASE_URL tidak valid.');
    }
    return project.replace(
      path: '/rest/v1/$table',
      queryParameters: const {'select': '*'},
    );
  }

  Uri get realtimeUri {
    final restUri = telemetryUri;
    return restUri.replace(
      scheme: restUri.scheme == 'https' ? 'wss' : 'ws',
      path: '/realtime/v1/websocket',
      queryParameters: {'apikey': anonKey, 'vsn': '1.0.0'},
    );
  }
}

class SupabaseTelemetryService {
  SupabaseTelemetryService(this.config);

  final SupabaseConfig config;

  Future<List<Map<String, dynamic>>> fetchHistory({
    required String pondId,
    int limit = 1500,
  }) async {
    final uri = config.telemetryUri.replace(
      queryParameters: {
        'select': '*',
        'pond_id': 'eq.$pondId',
        'order': 'measured_at.desc',
        'limit': '$limit',
      },
    );
    final client = HttpClient();
    try {
      final request = await client
          .getUrl(uri)
          .timeout(const Duration(seconds: 15));
      request.headers
        ..set('apikey', config.anonKey)
        ..set(HttpHeaders.authorizationHeader, 'Bearer ${config.anonKey}')
        ..set(HttpHeaders.acceptHeader, 'application/json')
        ..set('accept-profile', config.schema);
      final response = await request.close().timeout(
        const Duration(seconds: 15),
      );
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException(
          'Supabase REST merespons HTTP ${response.statusCode}: $body',
          uri: uri,
        );
      }
      final decoded = jsonDecode(body);
      if (decoded is! List) {
        throw const FormatException('Respons histori Supabase bukan array.');
      }
      return decoded.map((row) {
        if (row is! Map<String, dynamic>) {
          throw const FormatException('Baris telemetry Supabase tidak valid.');
        }
        return row;
      }).toList();
    } finally {
      client.close(force: true);
    }
  }

  Stream<Map<String, dynamic>> watchPond(
    String pondId, {
    void Function()? onConnected,
  }) {
    late final StreamController<Map<String, dynamic>> controller;
    WebSocket? socket;
    Timer? heartbeat;
    var stopped = false;
    var reconnectDelay = 1;
    var ref = 1;

    Future<void> connect() async {
      while (!stopped) {
        try {
          socket = await WebSocket.connect(
            config.realtimeUri.toString(),
            headers: {
              'apikey': config.anonKey,
              HttpHeaders.authorizationHeader: 'Bearer ${config.anonKey}',
            },
          ).timeout(const Duration(seconds: 15));
          final activeSocket = socket!;
          final joinRef = '${ref++}';
          activeSocket.add(
            jsonEncode({
              'topic': 'realtime:${config.schema}:${config.table}-$pondId',
              'event': 'phx_join',
              'payload': {
                'config': {
                  'broadcast': {'ack': false, 'self': false},
                  'presence': {'key': ''},
                  'postgres_changes': [
                    {
                      'event': 'INSERT',
                      'schema': config.schema,
                      'table': config.table,
                      'filter': 'pond_id=eq.$pondId',
                    },
                  ],
                  'private': false,
                },
                'access_token': config.anonKey,
              },
              'ref': joinRef,
              'join_ref': joinRef,
            }),
          );
          heartbeat = Timer.periodic(const Duration(seconds: 25), (_) {
            if (activeSocket.readyState == WebSocket.open) {
              activeSocket.add(
                jsonEncode({
                  'topic': 'phoenix',
                  'event': 'heartbeat',
                  'payload': {},
                  'ref': '${ref++}',
                }),
              );
            }
          });

          await for (final message in activeSocket) {
            if (message is! String) continue;
            final envelope = jsonDecode(message);
            if (envelope is! Map<String, dynamic>) continue;
            final event = envelope['event'];
            final payload = envelope['payload'];
            if (event == 'phx_reply' &&
                envelope['ref']?.toString() == joinRef &&
                payload is Map) {
              if (payload['status'] == 'error') {
                throw StateError('Supabase Realtime menolak subscription.');
              }
              if (payload['status'] == 'ok') {
                reconnectDelay = 1;
                onConnected?.call();
              }
            }
            if (event != 'postgres_changes' || payload is! Map) continue;
            final data = payload['data'];
            if (data is! Map) continue;
            final row = data['record'] ?? data['new'];
            if (row is Map<String, dynamic> &&
                row['pond_id']?.toString() == pondId) {
              controller.add(row);
            }
          }
          if (!stopped) {
            throw const WebSocketException(
              'Koneksi Supabase Realtime ditutup.',
            );
          }
        } catch (error, stackTrace) {
          if (!stopped) {
            controller.addError(error, stackTrace);
            await Future<void>.delayed(Duration(seconds: reconnectDelay));
            reconnectDelay = (reconnectDelay * 2).clamp(1, 30);
          }
        } finally {
          heartbeat?.cancel();
          heartbeat = null;
          final oldSocket = socket;
          socket = null;
          if (oldSocket != null && oldSocket.readyState != WebSocket.closed) {
            await oldSocket.close();
          }
        }
      }
      await controller.close();
    }

    controller = StreamController<Map<String, dynamic>>(
      onListen: () => unawaited(connect()),
      onCancel: () {
        stopped = true;
        heartbeat?.cancel();
        final activeSocket = socket;
        if (activeSocket != null &&
            activeSocket.readyState != WebSocket.closed) {
          unawaited(activeSocket.close());
        }
      },
    );
    return controller.stream;
  }
}
