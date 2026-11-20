import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:material_ui/material_ui.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const splitPointDefault = {
  'ph': 7.5,
  'temperature': 28.75,
  'salinityMin': 15.0,
  'salinity': 25.5,
};

void main() => runApp(const AquapenaeusApp());

class AquapenaeusApp extends StatelessWidget {
  const AquapenaeusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Aquapenaeus C4.5',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F4C81),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF4F7FB),
      ),
      home: const HomePage(),
    );
  }
}

class SensorValues {
  double ph;
  double temperature;
  double salinity;
  SensorValues(this.ph, this.temperature, this.salinity);
}

class Decision {
  final String classification;
  final String activeRule;
  final String recommendation;
  final bool phOk;
  final bool temperatureOk;
  final bool salinityOk;

  const Decision({
    required this.classification,
    required this.activeRule,
    required this.recommendation,
    required this.phOk,
    required this.temperatureOk,
    required this.salinityOk,
  });
}

Decision evaluate(SensorValues values, Map<String, double> thresholds) {
  final phOk =
      values.ph >= thresholds['ph']! && values.ph >= 7.0 && values.ph <= 8.5;
  final temperatureOk =
      values.temperature >= thresholds['temperature']! &&
      values.temperature >= 26 &&
      values.temperature <= 35;
  final salinityOk =
      values.salinity >= thresholds['salinityMin']! &&
      values.salinity < thresholds['salinity']! &&
      values.salinity >= 0 &&
      values.salinity <= 35;
  final good = phOk && temperatureOk && salinityOk;
  String recommendation;
  if (good) {
    recommendation = 'Pertahankan kincir aerator dan lanjutkan siklus deteksi rutin tiap 10 menit.';
  } else if (!phOk) {
    recommendation = 'Periksa pH ulang; evaluasi pemberian kapur dolomit bertahap sesuai SOP tambak.';
  } else if (!temperatureOk) {
    recommendation = 'Nyalakan kincir aerator dan pantau suhu; evaluasi pergantian air bila perlu.';
  } else {
    recommendation =
        'Periksa salinitas dan lakukan sirkulasi air secara bertahap.';
  }
  final classification = good ? 'BAGUS' : 'TIDAK BAGUS';
  return Decision(
    classification: classification,
    activeRule:
        'IF pH >= ${thresholds['ph']!.toStringAsFixed(2)} AND suhu >= ${thresholds['temperature']!.toStringAsFixed(2)} °C AND salinitas ${thresholds['salinityMin']!.toStringAsFixed(1)}–<${thresholds['salinity']!.toStringAsFixed(1)} ppt THEN $classification',
    recommendation: recommendation,
    phOk: phOk,
    temperatureOk: temperatureOk,
    salinityOk: salinityOk,
  );
}

class Reading {
  final String id;
  final String pond;
  final DateTime timestamp;
  final String source;
  final double ph;
  final double temperature;
  final double salinity;
  final String classification;
  final String recommendation;
  final bool isComplete;

  Reading({
    required this.id,
    required this.pond,
    required this.timestamp,
    required this.source,
    required this.ph,
    required this.temperature,
    required this.salinity,
    required this.classification,
    required this.recommendation,
    this.isComplete = true,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'pond': pond,
    'timestamp': timestamp.toIso8601String(),
    'source': source,
    'ph': ph,
    'temperature': temperature,
    'salinity': salinity,
    'classification': classification,
    'recommendation': recommendation,
    'isComplete': isComplete,
  };

  factory Reading.fromJson(Map<String, dynamic> json) => Reading(
    id: json['id'] as String,
    pond: json['pond'] as String,
    timestamp: DateTime.parse(json['timestamp'] as String),
    source: json['source'] as String,
    ph: (json['ph'] as num).toDouble(),
    temperature: (json['temperature'] as num).toDouble(),
    salinity: (json['salinity'] as num).toDouble(),
    classification: json['classification'] as String,
    recommendation: json['recommendation'] as String? ?? '',
    isComplete: json['isComplete'] as bool? ?? true,
  );
}

class _MonitorPage extends StatelessWidget {
  final SensorValues reading;
  final Decision decision;
  final bool simulated;
  final bool online;
  final ValueChanged<bool> onToggle;
  final VoidCallback onCycle;

  const _MonitorPage({
    required this.reading,
    required this.decision,
    required this.simulated,
    required this.online,
    required this.onToggle,
    required this.onCycle,
  });

  @override
  Widget build(BuildContext context) {
    final status = simulated
        ? 'SIMULASI AKTIF'
        : online
        ? 'ESP32 ONLINE'
        : 'ESP32 OFFLINE';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(status, style: const TextStyle(fontWeight: FontWeight.w700)),
            const Text(
              'SIKLUS 10 MENIT',
              style: TextStyle(fontSize: 10, color: Color(0xFF4A607A)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Card(
          child: SwitchListTile(
            title: const Text('Mode Simulasi Data'),
            subtitle: const Text('Siklus deteksi rutin tiap 10 menit'),
            value: simulated,
            onChanged: onToggle,
          ),
        ),
        Card(
          color: decision.classification == 'BAGUS'
              ? const Color(0xFFE0F2FE)
              : const Color(0xFFFEE2E2),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SISTEM CERDAS · C4.5',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
                const SizedBox(height: 8),
                Chip(
                  label: Text('KONDISI AIR: ${decision.classification}'),
                  side: BorderSide.none,
                ),
                const SizedBox(height: 10),
                const Text(
                  'Aturan aktif',
                  style: TextStyle(color: Color(0xFF4A607A)),
                ),
                Text(
                  decision.activeRule,
                  style: const TextStyle(fontFamily: 'monospace'),
                ),
                const Divider(height: 24),
                const Text(
                  'TINDAKAN LAPANGAN',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F4C81),
                  ),
                ),
                Text(decision.recommendation),
              ],
            ),
          ),
        ),
        OutlinedButton.icon(
          onPressed: onCycle,
          icon: const Icon(Icons.play_circle_outline),
          label: const Text('Uji Siklus Sekarang'),
        ),
        const SizedBox(height: 12),
        const Text(
          'Parameter air',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _MetricCard(
                label: 'SUHU AIR',
                value: '${reading.temperature.toStringAsFixed(1)} °C',
                ok: decision.temperatureOk,
              ),
            ),
            Expanded(
              child: _MetricCard(
                label: 'pH AIR',
                value: reading.ph.toStringAsFixed(2),
                ok: decision.phOk,
              ),
            ),
            Expanded(
              child: _MetricCard(
                label: 'SALINITAS',
                value: '${reading.salinity.toStringAsFixed(1)} ppt',
                ok: decision.salinityOk,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final bool ok;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.ok,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 9, color: Color(0xFF4A607A)),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 6),
            Text(
              ok ? 'DALAM BATAS' : 'DI LUAR BATAS',
              style: TextStyle(
                fontSize: 8,
                color: ok ? const Color(0xFF0F4C81) : const Color(0xFFDC2626),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AnalysisPage extends StatefulWidget {
  final SensorValues reading;
  final Map<String, double> thresholds;
  final Future<void> Function(
    SensorValues values,
    String classification,
    String recommendation,
  )
  onSave;

  const _AnalysisPage({
    required this.reading,
    required this.thresholds,
    required this.onSave,
  });

  @override
  State<_AnalysisPage> createState() => _AnalysisPageState();
}

class _AnalysisPageState extends State<_AnalysisPage> {
  late double ph;
  late double temperature;
  late double salinity;

  @override
  void initState() {
    super.initState();
    ph = widget.reading.ph;
    temperature = widget.reading.temperature;
    salinity = widget.reading.salinity;
  }

  @override
  Widget build(BuildContext context) {
    final values = SensorValues(ph, temperature, salinity);
    final decision = evaluate(values, widget.thresholds);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Chip(label: Text('C4.5 · ID3 + GAIN RATIO')),
                const SizedBox(height: 8),
                Text(
                  'Pohon keputusan tambak',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Nilai kontinu dipisah pada kandidat threshold. pH menjadi root node adaptasi; suhu dan salinitas mengikuti jalur keputusan.',
                  style: TextStyle(height: 1.5),
                ),
                const SizedBox(height: 12),
                Text(
                  decision.activeRule,
                  style: const TextStyle(fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Simulator What-If',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('pH air: ${ph.toStringAsFixed(2)}'),
                Slider(
                  value: ph,
                  min: 6.5,
                  max: 9,
                  divisions: 50,
                  onChanged: (value) => setState(() => ph = value),
                ),
                Text('Suhu air: ${temperature.toStringAsFixed(1)} °C'),
                Slider(
                  value: temperature,
                  min: 24,
                  max: 36,
                  divisions: 120,
                  onChanged: (value) => setState(() => temperature = value),
                ),
                Text('Salinitas: ${salinity.toStringAsFixed(1)} ppt'),
                Slider(
                  value: salinity,
                  min: 10,
                  max: 35,
                  divisions: 250,
                  onChanged: (value) => setState(() => salinity = value),
                ),
                const Divider(),
                Text(
                  'HASIL: ${decision.classification}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 6),
                Text(decision.recommendation),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () async {
                    await widget.onSave(
                      values,
                      decision.classification,
                      decision.recommendation,
                    );
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Skenario ditambahkan ke riwayat uji'),
                        ),
                      );
                    }
                  },
                  child: const Text('Simpan Skenario ke Riwayat Uji'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _HistoryPage extends StatefulWidget {
  final List<Reading> readings;
  final Future<void> Function() onExport;

  const _HistoryPage({required this.readings, required this.onExport});

  @override
  State<_HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<_HistoryPage> {
  String source = 'ALL';
  String status = 'ALL';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.readings.where((item) {
      final sourceMatch = source == 'ALL'
          ? true
          : source == 'SENSOR'
          ? item.source != 'SIMULASI_UJI' && item.source != 'UJI_KALIBRASI'
          : item.source == 'SIMULASI_UJI' || item.source == 'UJI_KALIBRASI';
      final statusMatch = status == 'ALL'
          ? true
          : item.classification == status;
      return sourceMatch && statusMatch;
    }).toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            title: const Text('TOTAL PEMBACAAN TERSIMPAN'),
            subtitle: Text(
              '${widget.readings.length}',
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0B1F3A),
              ),
            ),
            trailing: FilledButton(
              onPressed: widget.onExport,
              child: const Text('Ekspor CSV'),
            ),
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: source,
          decoration: const InputDecoration(labelText: 'Sumber'),
          items: const [
            DropdownMenuItem(value: 'ALL', child: Text('Semua')),
            DropdownMenuItem(value: 'SENSOR', child: Text('Sensor / Siklus')),
            DropdownMenuItem(
              value: 'SIMULASI_UJI',
              child: Text('Simulasi Uji'),
            ),
          ],
          onChanged: (value) => setState(() => source = value!),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: status,
          decoration: const InputDecoration(labelText: 'Status'),
          items: const [
            DropdownMenuItem(value: 'ALL', child: Text('Semua status')),
            DropdownMenuItem(value: 'BAGUS', child: Text('BAGUS')),
            DropdownMenuItem(value: 'TIDAK BAGUS', child: Text('TIDAK BAGUS')),
          ],
          onChanged: (value) => setState(() => status = value!),
        ),
        const SizedBox(height: 12),
        Text(
          'Pembacaan sensor · ${filtered.length} baris',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        for (final item in filtered.take(100))
          Card(
            child: ListTile(
              title: Text(
                '${item.ph.toStringAsFixed(2)} pH · ${item.temperature.toStringAsFixed(1)} °C · ${item.salinity.toStringAsFixed(1)} ppt',
              ),
              subtitle: Text(
                '${item.timestamp.toLocal()}  •  ${item.source}\n${item.recommendation}',
              ),
              trailing: Chip(
                label: Text(item.classification),
                backgroundColor: item.classification == 'BAGUS'
                    ? const Color(0xFFE0F2FE)
                    : const Color(0xFFFEE2E2),
              ),
            ),
          ),
        if (filtered.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Belum ada log sesuai filter. Pembacaan baru akan disimpan otomatis.',
              ),
            ),
          ),
      ],
    );
  }
}

class _DevicePage extends StatefulWidget {
  final String deviceId;
  final String endpoint;
  final SensorValues reading;
  final Map<String, double> calibration;
  final Map<String, double> thresholds;
  final Future<void> Function(String id, String endpoint) onSaveDevice;
  final Future<void> Function(
    Map<String, double> calibration,
    Map<String, double> thresholds,
  )
  onSaveSettings;
  final Future<void> Function(Reading record) onSaveCalibrationTest;

  const _DevicePage({
    required this.deviceId,
    required this.endpoint,
    required this.reading,
    required this.calibration,
    required this.thresholds,
    required this.onSaveDevice,
    required this.onSaveSettings,
    required this.onSaveCalibrationTest,
  });

  @override
  State<_DevicePage> createState() => _DevicePageState();
}

class _DevicePageState extends State<_DevicePage> {
  late TextEditingController idController;
  late TextEditingController endpointController;
  late Map<String, double> calibration;
  late Map<String, double> thresholds;

  @override
  void initState() {
    super.initState();
    idController = TextEditingController(text: widget.deviceId);
    endpointController = TextEditingController(text: widget.endpoint);
    calibration = {...widget.calibration};
    thresholds = {...widget.thresholds};
  }

  @override
  void dispose() {
    idController.dispose();
    endpointController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewPh = (widget.reading.ph + calibration['ph']!).toStringAsFixed(
      2,
    );
    final previewTemperature =
        (widget.reading.temperature + calibration['temperature']!)
            .toStringAsFixed(1);
    final previewSalinity = (widget.reading.salinity + calibration['salinity']!)
        .toStringAsFixed(1);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Perangkat ESP32',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: idController,
                  decoration: const InputDecoration(labelText: 'ID Perangkat'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: endpointController,
                  decoration: const InputDecoration(
                    labelText: 'Endpoint REST ESP32 / Gateway',
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () async {
                    await widget.onSaveDevice(
                      idController.text.trim(),
                      endpointController.text.trim(),
                    );
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Pengaturan perangkat disimpan'),
                        ),
                      );
                    }
                  },
                  child: const Text('Simpan koneksi'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Kalibrasi Offset Sensor',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Offset pH: ${calibration['ph']!.toStringAsFixed(2)} pH · hasil $previewPh',
                ),
                Slider(
                  value: calibration['ph']!,
                  min: -1,
                  max: 1,
                  divisions: 40,
                  onChanged: (value) =>
                      setState(() => calibration['ph'] = value),
                ),
                Text(
                  'Offset suhu: ${calibration['temperature']!.toStringAsFixed(1)} °C · hasil $previewTemperature °C',
                ),
                Slider(
                  value: calibration['temperature']!,
                  min: -5,
                  max: 5,
                  divisions: 100,
                  onChanged: (value) =>
                      setState(() => calibration['temperature'] = value),
                ),
                Text(
                  'Offset salinitas: ${calibration['salinity']!.toStringAsFixed(1)} ppt · hasil $previewSalinity ppt',
                ),
                Slider(
                  value: calibration['salinity']!,
                  min: -5,
                  max: 5,
                  divisions: 100,
                  onChanged: (value) =>
                      setState(() => calibration['salinity'] = value),
                ),
                const Divider(),
                const Text(
                  'Ambang Pohon C4.5',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                Text('Split pH: ${thresholds['ph']!.toStringAsFixed(2)}'),
                Slider(
                  value: thresholds['ph']!,
                  min: 6.5,
                  max: 8.5,
                  divisions: 40,
                  onChanged: (value) =>
                      setState(() => thresholds['ph'] = value),
                ),
                Text(
                  'Split suhu: ${thresholds['temperature']!.toStringAsFixed(2)} °C',
                ),
                Slider(
                  value: thresholds['temperature']!,
                  min: 24,
                  max: 34,
                  divisions: 40,
                  onChanged: (value) =>
                      setState(() => thresholds['temperature'] = value),
                ),
                Text(
                  'Batas bawah salinitas: ${thresholds['salinityMin']!.toStringAsFixed(1)} ppt',
                ),
                Slider(
                  value: thresholds['salinityMin']!,
                  min: 5,
                  max: 25,
                  divisions: 40,
                  onChanged: (value) =>
                      setState(() => thresholds['salinityMin'] = value),
                ),
                Text(
                  'Batas atas salinitas: ${thresholds['salinity']!.toStringAsFixed(1)} ppt',
                ),
                Slider(
                  value: thresholds['salinity']!,
                  min: 15,
                  max: 35,
                  divisions: 40,
                  onChanged: (value) =>
                      setState(() => thresholds['salinity'] = value),
                ),
                FilledButton(
                  onPressed: () async {
                    await widget.onSaveSettings(calibration, thresholds);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Offset dan ambang berhasil disimpan'),
                        ),
                      );
                    }
                  },
                  child: const Text('Simpan & Terapkan Kalibrasi'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int tab = 0;
  String pond = 'Kolam A1';
  bool simulated = true;
  bool sensorOnline = false;
  String deviceId = 'ESP32-AQP-A1';
  String endpoint = '';
  String errorMessage = '';
  Map<String, double> thresholds = {...splitPointDefault};
  final Map<String, double> calibration = {
    'ph': 0,
    'temperature': 0,
    'salinity': 0,
  };
  late SensorValues reading;
  List<Reading> logs = [];
  Timer? cycleTimer;

  @override
  void initState() {
    super.initState();
    reading = SensorValues(7.9, 29.4, 21);
    _load();
    cycleTimer = Timer.periodic(
      const Duration(minutes: 10),
      (_) => _runCycle('SIKLUS_10_MENIT'),
    );
  }

  @override
  void dispose() {
    cycleTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    deviceId = prefs.getString('deviceId') ?? deviceId;
    endpoint = prefs.getString('endpoint') ?? '';
    final thresholdJson = prefs.getString('thresholds');
    if (thresholdJson != null) {
      final decoded = jsonDecode(thresholdJson) as Map<String, dynamic>;
      thresholds = decoded.map(
        (key, value) => MapEntry(key, (value as num).toDouble()),
      );
    }
    for (final key in calibration.keys) {
      calibration[key] = prefs.getDouble('calibration_$key') ?? 0;
    }
    final logJson = prefs.getString('readings');
    if (logJson != null) {
      logs = (jsonDecode(logJson) as List)
          .map((item) => Reading.fromJson(item as Map<String, dynamic>))
          .toList();
      if (logs.isNotEmpty) {
        reading = SensorValues(
          logs.first.ph,
          logs.first.temperature,
          logs.first.salinity,
        );
      }
    }
    if (mounted) setState(() {});
  }

  Future<void> _saveLogs() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'readings',
      jsonEncode(logs.take(1500).map((item) => item.toJson()).toList()),
    );
  }

  Future<void> _runCycle([String source = 'ESP32_LIVE']) async {
    try {
      SensorValues next;
      String readingSource;
      if (simulated) {
        final random = Random();
        next = SensorValues(
          (reading.ph + (random.nextDouble() - 0.5) * 0.12).clamp(6.8, 8.8),
          (reading.temperature + (random.nextDouble() - 0.5) * 0.5).clamp(
            27.1,
            33.2,
          ),
          (reading.salinity + (random.nextDouble() - 0.5) * 1.4).clamp(
            12.0,
            28.0,
          ),
        );
        readingSource = source == 'SIKLUS_10_MENIT'
            ? 'SIKLUS_10_MENIT'
            : 'SIMULASI';
        sensorOnline = false;
      } else {
        if (endpoint.trim().isEmpty) {
          throw Exception('URL REST ESP32 belum diatur.');
        }
        final response = await http
            .get(Uri.parse(endpoint.trim()))
            .timeout(const Duration(seconds: 15));
        if (response.statusCode != 200) {
          throw Exception('REST API merespons HTTP ${response.statusCode}.');
        }
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        next = SensorValues(
          (data['ph'] as num).toDouble(),
          (data['temperature'] ?? data['suhu'] as num).toDouble(),
          (data['salinity'] ?? data['salinitas'] as num).toDouble(),
        );
        readingSource = 'ESP32_LIVE';
        sensorOnline = true;
        deviceId = data['deviceId'] as String? ?? deviceId;
      }
      next.ph += calibration['ph']!;
      next.temperature += calibration['temperature']!;
      next.salinity += calibration['salinity']!;
      final decision = evaluate(next, thresholds);
      final record = Reading(
        id: '$deviceId-${DateTime.now().millisecondsSinceEpoch}',
        pond: pond,
        timestamp: DateTime.now(),
        source: readingSource,
        ph: next.ph,
        temperature: next.temperature,
        salinity: next.salinity,
        classification: decision.classification,
        recommendation: decision.recommendation,
      );
      if (!mounted) return;
      setState(() {
        reading = next;
        logs.insert(0, record);
        logs = logs.take(1500).toList();
        errorMessage = '';
      });
      await _saveLogs();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        sensorOnline = false;
        errorMessage = 'Siklus deteksi gagal: $error';
      });
    }
  }

  Future<void> _saveDevice(String id, String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('deviceId', id);
    await prefs.setString('endpoint', url);
    setState(() {
      deviceId = id;
      endpoint = url;
    });
  }

  Future<void> _saveSettings(
    Map<String, double> calibrationDraft,
    Map<String, double> thresholdDraft,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    for (final entry in calibrationDraft.entries) {
      calibration[entry.key] = entry.value;
      await prefs.setDouble('calibration_${entry.key}', entry.value);
    }
    thresholds = Map<String, double>.from(thresholdDraft);
    await prefs.setString('thresholds', jsonEncode(thresholds));
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _MonitorPage(
        reading: reading,
        decision: evaluate(reading, thresholds),
        simulated: simulated,
        online: sensorOnline,
        onToggle: (value) => setState(() => simulated = value),
        onCycle: () => _runCycle('SIMULASI'),
      ),
      _AnalysisPage(
        reading: reading,
        thresholds: thresholds,
        onSave: (values, classification, recommendation) async {
          final now = DateTime.now();
          setState(() {
            logs.insert(
              0,
              Reading(
                id: 'SIM-UJI-${now.millisecondsSinceEpoch}',
                pond: pond,
                timestamp: now,
                source: 'SIMULASI_UJI',
                ph: values.ph,
                temperature: values.temperature,
                salinity: values.salinity,
                classification: classification,
                recommendation: recommendation,
              ),
            );
          });
          await _saveLogs();
        },
      ),
      _HistoryPage(readings: logs, onExport: _exportCsv),
      _DevicePage(
        deviceId: deviceId,
        endpoint: endpoint,
        reading: reading,
        calibration: calibration,
        thresholds: thresholds,
        onSaveDevice: _saveDevice,
        onSaveSettings: _saveSettings,
        onSaveCalibrationTest: (record) async {
          setState(() => logs.insert(0, record));
          await _saveLogs();
        },
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0B1F3A),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Aquapenaeus C4.5',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            Text(
              pond,
              style: const TextStyle(fontSize: 11, color: Color(0xFF4A607A)),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Ganti kolam',
            onPressed: () => setState(
              () => pond = pond == 'Kolam A1' ? 'Kolam A2' : 'Kolam A1',
            ),
            icon: const Icon(Icons.swap_horiz),
          ),
        ],
      ),
      body: Column(
        children: [
          if (errorMessage.isNotEmpty)
            MaterialBanner(
              content: Text(errorMessage),
              actions: [
                TextButton(
                  onPressed: () => setState(() => errorMessage = ''),
                  child: const Text('Tutup'),
                ),
              ],
            ),
          Expanded(child: pages[tab]),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (value) => setState(() => tab = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.sensors), label: 'Pantau'),
          NavigationDestination(
            icon: Icon(Icons.account_tree),
            label: 'Analisis C4.5',
          ),
          NavigationDestination(
            icon: Icon(Icons.history),
            label: 'Riwayat Log',
          ),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Perangkat'),
        ],
      ),
    );
  }

  Future<void> _exportCsv() async {
    final rows = <String>[
      'No,Waktu_Terima,Sumber_Data,pH_Terkalibrasi,Suhu_C,Salinitas_ppt,Kelengkapan_Data,Klasifikasi_C45,Rekomendasi',
      for (var i = 0; i < logs.length; i++)
        [
              i + 1,
              logs[i].timestamp.toIso8601String(),
              logs[i].source,
              logs[i].ph.toStringAsFixed(2),
              logs[i].temperature.toStringAsFixed(1),
              logs[i].salinity.toStringAsFixed(1),
              logs[i].isComplete ? 'LENGKAP' : 'TIDAK LENGKAP',
              logs[i].classification,
              logs[i].recommendation,
            ]
            .map((value) => '"${value.toString().replaceAll('"', '""')}"')
            .join(','),
    ];
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Ekspor CSV'),
        content: SelectableText(rows.join('\n'), maxLines: 12),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Tutup'),
          ),
        ],
      ),
    );
  }
}
