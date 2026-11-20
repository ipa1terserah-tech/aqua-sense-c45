import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "AquapenaeusLocalStore")
    let channel = FlutterMethodChannel(
      name: "aquapenaeus/local_store",
      binaryMessenger: registrar.messenger()
    )
    channel.setMethodCallHandler { call, result in
      switch call.method {
      case "read":
        result(UserDefaults.standard.string(forKey: "aquapenaeus.store"))
      case "write":
        guard let serialized = call.arguments as? String else {
          result(FlutterError(
            code: "invalid_data",
            message: "Data penyimpanan harus berupa teks.",
            details: nil
          ))
          return
        }
        UserDefaults.standard.set(serialized, forKey: "aquapenaeus.store")
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }
}
