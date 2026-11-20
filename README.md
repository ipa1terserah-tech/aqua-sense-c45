# Aquapenaeus C4.5

Aplikasi Expo/React Native untuk pemantauan kualitas air tambak udang vaname (*Litopenaeus vannamei*) dan demonstrasi Sistem Pendukung Keputusan C4.5 di **Tambak Maneron (Maneron, Kec. Sepulu, Kab. Bangkalan, Madura)**.

## Fitur

- Pembacaan suhu, pH, dan salinitas; mode simulasi serta integrasi REST dengan pencatatan latensi respons, waktu terima, dan kelengkapan data.
- Siklus deteksi dan pencatatan rutin setiap **10 menit**; tombol **Uji Siklus Sekarang** untuk demonstrasi.
- Klasifikasi BAGUS/TIDAK BAGUS, jalur aturan, simulator What-If yang dapat disimpan ke riwayat uji, dan ekspor CSV pengujian.
- Fallback offline-first ke pembacaan terakhir di AsyncStorage saat REST API tidak tersedia.
- Tema instrumen Tactile Field-Instrument dengan palet Biru Maritim & Putih.

## Menjalankan aplikasi

Gunakan Node.js LTS 22.13+ dan npm, lalu:

```bash
npm ci
npm run typecheck
npx expo start
```

### Windows (PowerShell atau CMD)

Pasang Node.js LTS dan Android Studio bila memakai emulator. Dari direktori proyek jalankan `npm ci` lalu `npx expo start`. Untuk emulator Android, boot sebuah AVD sebelum menekan `a` di terminal Expo CLI.

Atur Android SDK jika shell belum menemukannya:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator"
adb devices
```

Expo CLI biasanya menemukan ADB melalui `ANDROID_HOME` atau `PATH`. `ADB_PATH` bukan variabel wajib Expo; setel hanya jika skrip lokal Anda memerlukannya, misalnya `$env:ADB_PATH = "$env:ANDROID_HOME\platform-tools\adb.exe"`.

### Android Studio Emulator (Windows/macOS/Linux)

Instal Android SDK Platform Tools dan Emulator, buat serta jalankan AVD, lalu pastikan `adb devices` menampilkan emulator. Set `ANDROID_HOME` ke lokasi Android SDK dan tambahkan `platform-tools` serta `emulator` ke `PATH`. Lokasi umum:

- Windows: `%LOCALAPPDATA%\Android\Sdk`
- macOS: `$HOME/Library/Android/sdk`
- Linux: `$HOME/Android/Sdk`

Jalankan `npx expo start`, kemudian tekan **`a`**. Untuk membangun APK native secara lokal diperlukan Android Studio/JDK/SDK yang sesuai. Profil EAS untuk APK internal telah disediakan:

```bash
npx eas-cli build --platform android --profile preview
```

Profil `production` menghasilkan Android App Bundle untuk distribusi produksi.

### HP fisik Android atau iOS

Pasang Expo Go yang cocok dengan SDK 58 pada ponsel, jalankan `npx expo start --host lan`, lalu pindai QR code. Komputer dan ponsel perlu berada di jaringan yang dapat saling menjangkau. Jika jaringan LAN membatasi koneksi, gunakan `npx expo start --tunnel` (memerlukan akses internet). Untuk simulator iOS native diperlukan macOS dan Xcode.

### Browser Web (Windows/macOS/Linux)

```bash
npx expo start --web
```

Pilih tab **Perangkat** untuk menyimpan ID perangkat dan URL REST API. Aplikasi membaca endpoint dengan HTTP GET; respons harus berisi `temperature`, `ph`, dan `salinity` (atau alias `suhu` dan `salinitas`), serta dapat menyertakan `deviceId` dan `timestamp`:

```json
{"deviceId":"ESP32-AQP-A1","temperature":29.4,"ph":7.9,"salinity":21,"timestamp":"2026-01-01T10:00:00Z"}
```

`src/services/iotBackend.ts` menyediakan adapter REST dan kontrak adapter untuk backend lain. Server REST, Supabase, atau Firebase harus disediakan/diimplementasikan terpisah; proyek tidak menyimpan kredensial backend. Firmware mengirim telemetry HTTP POST ke server penerima, sedangkan aplikasi mengambil data terbaru dengan GET.

## Firmware ESP32

Sketch Arduino tersedia di [firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino](./firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino). Instal pustaka OneWire dan DallasTemperature, isi SSID/kata sandi serta URL API pada sketch, kalibrasikan sensor menggunakan larutan standar, lalu unggah ke ESP32. Pinout dan langkah kalibrasi lengkap ada pada [LAPORAN.md](./LAPORAN.md).

## Struktur utama

- `src/engine/c45/`: metrik entropy, information gain, gain ratio, Gini, dan evaluator.
- `src/services/iot/`, `src/services/iotBackend.ts`: simulasi, REST, adapter, klasifikasi dan fallback lokal.
- `src/storage/`: AsyncStorage, alert, ambang, dan ekspor CSV.
- `src/screens/`, `src/components/`, `src/theme/`: layar, komponen instrumen, dan token UI.
- `firmware/`: sketch ESP32.

## Metodologi dan referensi

Penelitian Iqbal et al. menggunakan 76 data latih dan enam atribut (Tinggi Air, Salinitas, DO, pH, Suhu, dan Alkalinitas). Nilai split empiris yang dilaporkan: pH 7,495 (Gini 0,346; Gain Node 1 0,234; Node 1.1 0,438), suhu 28,755 °C (Gini 0,413; Gain 0,135), serta salinitas 25,635 ppt (Gini 0,480; Gain 0,038). Karena perangkat Maneron hanya memasang sensor pH, suhu DS18B20, dan salinitas, pH menjadi Root Node acuan di antara tiga sensor tersebut; aplikasi tidak mengklaim melatih ulang pohon enam atribut jurnal.

Tabel 1 artikel mengutip standar WWF-Indonesia (Badrudin, 2014): pH optimal 7,5–8,0 (toleransi 7,0–8,5), suhu optimal 28–32 °C (toleransi 26–35 °C), salinitas optimal 15–25 ppt (toleransi 0–35 ppt). Untuk resolusi slider, profil bawaan aplikasi memakai split pH 7,50, suhu 28,75 °C, batas bawah salinitas 15 ppt dan batas atas 25,5 ppt. Nilai 25,5 adalah posisi slider terdekat dari split jurnal 25,635 (step 0,5), bukan angka jurnal atau batas optimal WWF. Angka split jurnal presisi ditampilkan terpisah di layar Analisis.

Artikel mengklasifikasikan hasil budidaya BAGUS sebagai target ukuran panen ≤ 50 ekor/kg (≥ 20 g/ekor) dan TIDAK BAGUS sebagai > 50 ekor/kg (< 20 g/ekor). Evaluasi pada 17 data uji yang dilaporkan artikel: TP=8, TN=5, FP=3, FN=1; akurasi 76,47%, presisi 72,72%, dan recall 88,88% (*Fair Classification*). Ini adalah metrik jurnal, bukan hasil validasi aplikasi. Dataset 10 baris layar Analisis merupakan data demonstrasi.

Referensi utama: Iqbal, M., Usino, W., & Triono. (2020, April). “Sistem Pendukung Keputusan Menentukan Hasil Budidaya Udang Vaname Dengan Metode Algoritma C4.5 (PT Anugerah Sumber Laut Jaya).” *Jurnal Tekno Insentif, 14*(1), 28–39. https://doi.org/10.36787/jti.v14i1.148

## Kalibrasi dan validasi

Tab **Perangkat** menyediakan slider offset pH (−1 hingga +1, step 0,05), suhu dan salinitas (−5 hingga +5, step 0,1), pratinjau nilai raw/terkalibrasi, serta tombol untuk menolkan semua offset. Slider split memiliki rentang pH 6,50–8,50 (step 0,05), suhu 24–34 °C (step 0,25), batas bawah salinitas 5–25 ppt dan atas 15–35 ppt (keduanya step 0,5). Profil Standar Jurnal & Tambak Maneron, Intensif/Padat Tebar, dan Pasca-Hujan mengatur seluruh split dalam satu ketukan; tombol simpan menerapkan ke AsyncStorage dan reset mengembalikan default.

Kartu Kalibrasi Offset juga menyediakan uji pembanding terhadap pH meter, termometer, dan refraktometer standar. Status akurasi memakai batas error 2% atau toleransi pembanding lapangan yang ditampilkan pada kartu; hasilnya dapat dicatat ke riwayat uji. Riwayat membedakan log **Sensor / Siklus** dari **Simulasi Uji** dan mengekspor waktu terima, sumber, nilai sensor, latensi, kelengkapan data, klasifikasi, serta rekomendasi sebagai CSV.

Kalibrasi lapangan, validasi model, dan tindakan korektif tetap harus mengikuti SOP tambak. Rekomendasi aplikasi bukan pengganti pengukuran laboratorium atau keputusan teknisi; rentang dan metrik sumber dijelaskan lengkap di [LAPORAN.md](./LAPORAN.md).
