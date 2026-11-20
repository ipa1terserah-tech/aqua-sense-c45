# Aquapenaeus C4.5

Aplikasi Flutter untuk memantau kualitas air tambak udang vaname dan membantu evaluasi kualitas air dengan aturan C4.5. Aplikasi menggunakan Dart dan Flutter SDK tanpa package pihak ketiga.

## Supabase dan protokol

Supabase adalah database utama telemetry, bukan broker MQTT. Flutter sudah memiliki client tanpa package pihak ketiga untuk histori melalui HTTPS REST dan pembaruan baru melalui Supabase Realtime over WSS. Firmware disiapkan untuk mengirim HTTPS POST ke Supabase Edge Function. **Koneksi live belum aktif** karena URL/key project, schema/policy, dan Edge Function harus diisi temanmu. Rincian alur ada di [PRD.md](./PRD.md) dan [supabase/README.md](./supabase/README.md).

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
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_LEGACY_ANON_JWT_KEY
```

Jika project belum disiapkan, jalankan tanpa `--dart-define` untuk mode lokal/simulasi. Supabase menjadi sumber utama pembacaan ESP32 dan histori setelah konfigurasi tersedia; data simulasi tetap lokal.

Bangun APK debug dengan:

```bash
flutter build apk --debug
```

Proyek ini ditujukan untuk Android dan iOS. Endpoint ESP32 dapat diatur di tab **Perangkat**. Aplikasi membaca endpoint dengan HTTP GET; payload JSON perlu berisi `temperature`, `ph`, dan `salinity` (atau alias `suhu` dan `salinitas`), dan opsional `deviceId`:

```json
{"deviceId":"ESP32-AQP-A1","temperature":29.4,"ph":7.9,"salinity":21}
```

Schema awal Supabase tersedia di [supabase/schema.sql](./supabase/schema.sql). Firmware tersedia di [firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino](./firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino); salin `secrets.example.h` menjadi `secrets.h` lokal dan isi nilai sebenarnya. Jangan commit secret atau Supabase `service_role` key. Panduan sensor, kalibrasi, metodologi, dan batasan sistem ada di [LAPORAN.md](./LAPORAN.md).

## Struktur

- `lib/`: UI Flutter, evaluasi kualitas air, cache lokal, dan client Supabase REST/Realtime berbasis Dart SDK.
- `android/`, `ios/`: host native minimal untuk penyimpanan lokal bawaan OS dan konfigurasi jaringan.
- `supabase/`: schema SQL dan petunjuk handoff backend.
- `test/`: widget test dan test aturan klasifikasi.
- `firmware/`: sketch ESP32.
