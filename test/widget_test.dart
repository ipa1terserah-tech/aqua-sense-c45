import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';

import 'package:aquapenaeus_c45/main.dart';

void main() {
  const storeChannel = MethodChannel('aquapenaeus/local_store');

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(storeChannel, (call) async {
          if (call.method == 'read') return null;
          if (call.method == 'write') return null;
          return null;
        });
  });

  testWidgets('Aquapenaeus app renders monitor', (tester) async {
    await tester.pumpWidget(const AquapenaeusApp());
    await tester.pumpAndSettle();

    expect(find.text('Aquapenaeus C4.5'), findsWidgets);
    expect(find.text('Mode Simulasi Data'), findsOneWidget);
    expect(find.text('Parameter air'), findsOneWidget);
  });

  test('C4.5 returns BAGUS only when all sensor checks pass', () {
    final decision = evaluate(SensorValues(7.8, 30, 20), splitPointDefault);
    expect(decision.classification, 'BAGUS');

    final outsideRange = evaluate(SensorValues(7.8, 30, 27), splitPointDefault);
    expect(outsideRange.classification, 'TIDAK BAGUS');
  });
}
