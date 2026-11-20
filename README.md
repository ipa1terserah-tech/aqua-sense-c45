# Aquapenaeus C4.5

Aplikasi Flutter untuk memantau kualitas air tambak udang vaname dan membantu evaluasi kualitas air dengan aturan C4.5. Aplikasi menggunakan Dart dan Flutter SDK tanpa package pihak ketiga.

## Fitur

- Pantau suhu, pH, dan salinitas, dengan mode simulasi atau pembacaan REST ESP32.
- Siklus pencatatan rutin setiap 10 menit dan tombol uji manual.
- Klasifikasi BAGUS/TIDAK BAGUS, aturan aktif, dan rekomendasi lapangan.
- Simulator What-If dan penyimpanan skenario ke riwayat.
- Riwayat lokal, filter sumber/status, kalibrasi offset, dan pengaturan ambang.
- Ekspor CSV melalui dialog yang dapat disalin.
- Penyimpanan lokal memakai API platform bawaan Android/iOS melalui Flutter MethodChannel.

## Menjalankan aplikasi

Pasang Flutter SDK dan Android Studio untuk Android, atau Xcode untuk iOS. Dari root repository:

```bash
flutter pub get
flutter analyze
flutter test
flutter run
```

Bangun APK debug dengan:

```bash
flutter build apk --debug
```

Proyek ini ditujukan untuk Android dan iOS. Endpoint ESP32 dapat diatur di tab **Perangkat**. Aplikasi membaca endpoint dengan HTTP GET; payload JSON perlu berisi `temperature`, `ph`, dan `salinity` (atau alias `suhu` dan `salinitas`), dan opsional `deviceId`:

```json
{"deviceId":"ESP32-AQP-A1","temperature":29.4,"ph":7.9,"salinity":21}
```

Firmware tersedia di [firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino](./firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino). Panduan sensor, kalibrasi, metodologi, dan batasan sistem tersedia pada [LAPORAN.md](./LAPORAN.md).

## Struktur

- `lib/`: UI Flutter, evaluasi kualitas air, serta akses penyimpanan melalui API platform.
- `android/`, `ios/`: host native minimal untuk penyimpanan lokal bawaan OS dan konfigurasi jaringan.
- `test/`: widget test dan test aturan klasifikasi.
- `firmware/`: sketch ESP32.
