import 'package:flutter_test/flutter_test.dart';

import 'package:aquapenaeus_c45/main.dart';

void main() {
  testWidgets('Aquapenaeus app renders monitor', (tester) async {
    await tester.pumpWidget(const AquapenaeusApp());
    await tester.pumpAndSettle();

    expect(find.text('Aquapenaeus C4.5'), findsWidgets);
    expect(find.text('Mode Simulasi Data'), findsOneWidget);
    expect(find.text('Parameter air'), findsOneWidget);
  });
}
