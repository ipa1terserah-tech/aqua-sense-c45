import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:aquapenaeus_c45/supabase_telemetry.dart';

void main() {
  test('builds Supabase REST and Realtime endpoints from project config', () {
    const config = SupabaseConfig(
      projectUrl: 'https://demo-project.supabase.co',
      anonKey: 'public-anon-key',
    );

    expect(config.isConfigured, isTrue);
    expect(config.telemetryUri.path, '/rest/v1/telemetry');
    expect(config.telemetryUri.queryParameters['select'], '*');
    expect(config.realtimeUri.scheme, 'wss');
    expect(config.realtimeUri.path, '/realtime/v1/websocket');
    expect(config.realtimeUri.queryParameters['apikey'], 'public-anon-key');
  });

  test('rejects Supabase requests when project configuration is missing', () {
    const config = SupabaseConfig(projectUrl: '', anonKey: '');

    expect(config.isConfigured, isFalse);
    expect(() => config.telemetryUri, throwsStateError);
  });

  test('fetches pond history through PostgREST with the public key', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final receivedRequest = Completer<Map<String, String?>>();
    server.listen((request) async {
      receivedRequest.complete({
        'path': request.uri.path,
        'pond': request.uri.queryParameters['pond_id'],
        'limit': request.uri.queryParameters['limit'],
        'apikey': request.headers.value('apikey'),
        'profile': request.headers.value('accept-profile'),
      });
      request.response.headers.contentType = ContentType.json;
      request.response.write(
        jsonEncode([
          {
            'id': 'row-1',
            'pond_id': 'KOLAM-A1',
            'temperature': 30,
            'ph': 7.8,
            'salinity': 20,
            'measured_at': '2026-11-20T08:00:00Z',
          },
        ]),
      );
      await request.response.close();
    });

    try {
      final service = SupabaseTelemetryService(
        SupabaseConfig(
          projectUrl: 'http://127.0.0.1:${server.port}',
          anonKey: 'public-key',
        ),
      );
      final rows = await service.fetchHistory(pondId: 'KOLAM-A1', limit: 5);
      final request = await receivedRequest.future;

      expect(rows, hasLength(1));
      expect(rows.single['id'], 'row-1');
      expect(request['path'], '/rest/v1/telemetry');
      expect(request['pond'], 'eq.KOLAM-A1');
      expect(request['limit'], '5');
      expect(request['apikey'], 'public-key');
      expect(request['profile'], 'public');
    } finally {
      await server.close(force: true);
    }
  });
}
