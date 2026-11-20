import 'dart:convert';

import 'package:flutter/services.dart';

class LocalStore {
  static const MethodChannel _channel = MethodChannel(
    'aquapenaeus/local_store',
  );

  static Future<Map<String, dynamic>> read() async {
    final serialized = await _channel.invokeMethod<String>('read');
    if (serialized == null || serialized.isEmpty) return {};
    final decoded = jsonDecode(serialized);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException(
        'Penyimpanan lokal memiliki format tidak valid.',
      );
    }
    return decoded;
  }

  static Future<void> write(Map<String, dynamic> value) =>
      _channel.invokeMethod<void>('write', jsonEncode(value));
}
