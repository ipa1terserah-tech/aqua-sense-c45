package com.aquapenaeus.aquapenaeus_c45

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "aquapenaeus/local_store",
        ).setMethodCallHandler { call, result ->
            val preferences = getSharedPreferences("aquapenaeus", MODE_PRIVATE)
            when (call.method) {
                "read" -> result.success(preferences.getString("store", null))
                "write" -> {
                    val serialized = call.arguments as? String
                    if (serialized == null) {
                        result.error("invalid_data", "Data penyimpanan harus berupa teks.", null)
                    } else {
                        preferences.edit().putString("store", serialized).apply()
                        result.success(null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }
}
