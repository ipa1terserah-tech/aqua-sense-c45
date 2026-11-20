# LAPORAN PROYEK
## Aquapenaeus C4.5 — Sistem Tertanam IoT dan SPK Kualitas Air Tambak

**Lokasi studi kasus:** Tambak Maneron (Maneron, Kecamatan Sepulu, Kabupaten Bangkalan, Madura)  
**Komoditas:** Udang vaname (*Litopenaeus vannamei*)  
**Platform:** ESP32 dan aplikasi mobile Flutter (Dart)  
**Periode deteksi:** 10 menit

---

## Bab 1 — Pendahuluan dan Studi Kasus

### 1.1 Latar belakang

Budidaya udang vaname sangat dipengaruhi oleh kondisi fisik-kimia air. Perubahan suhu, pH, dan salinitas dapat mengganggu kenyamanan organisme, konsumsi pakan, serta kestabilan lingkungan tambak. Pengukuran berkala dengan alat terpisah berisiko menyisakan jeda informasi dan menyulitkan pencatatan tren.

Proyek Aquapenaeus C4.5 menggabungkan sensor, mikrokontroler ESP32, layanan komunikasi, penyimpanan lokal, dan aplikasi mobile untuk menampilkan tiga parameter tersebut di Tambak Maneron (Maneron, Kec. Sepulu, Kab. Bangkalan, Madura). Aplikasi mengelompokkan pembacaan sebagai BAGUS atau TIDAK BAGUS dan menampilkan aturan serta saran tindak lanjut.

### 1.2 Tujuan

1. Mengakuisisi suhu air, pH, dan salinitas menggunakan node ESP32.
2. Mengirimkan telemetry melalui HTTP dan menampilkan pembacaan di aplikasi.
3. Menyimpan riwayat klasifikasi agar tetap tersedia ketika koneksi pantai tidak stabil.
4. Menyediakan simulasi What-If dan uji satu siklus untuk demonstrasi.

### 1.3 Alasan interval 10 menit

Siklus 600.000 ms menjadi kompromi operasional antara keterkinian pemantauan, beban komunikasi, dan pencatatan berkala. Interval ini merupakan konfigurasi sistem, bukan jaminan bahwa setiap perubahan air berbahaya akan terdeteksi seketika. Risiko yang membutuhkan respons cepat tetap memerlukan pengamatan langsung, alarm tambahan, dan SOP lapangan. Penguji dapat memakai tombol **Uji Siklus Sekarang** agar tidak menunggu interval penuh.

---

## Bab 2 — Arsitektur Sistem Tertanam dan IoT

### 2.1 Alur data

```text
DS18B20 ─┐
Probe pH ─┼─> ADC/GPIO ESP32 ─> moving average + kalibrasi
Probe EC ─┘                         │
                                    ├─ HTTP POST telemetry
                                    v
                         Supabase Edge Function
                         + PostgreSQL / Realtime
                                    │ HTTP GET data terbaru
                                    v
                         Aplikasi Aquapenaeus C4.5
                         ├─ klasifikasi C4.5
                         ├─ riwayat dan simulator What-If
                         └─ penyimpanan lokal Android/iOS
                            melalui Flutter MethodChannel
```

Supabase ditetapkan sebagai database utama telemetry, bukan broker MQTT. Client Flutter sudah disiapkan untuk HTTPS REST (histori/pembacaan terakhir) dan WSS Supabase Realtime (insert baru). Firmware juga disiapkan untuk HTTPS POST ke Edge Function. Project Supabase, key, policy, dan Edge Function masih harus diisi/dideploy; sampai itu selesai aplikasi memakai cache/simulasi atau endpoint fallback. Rincian dan handoff ada di [PRD.md](./PRD.md), [supabase/README.md](./supabase/README.md), dan [supabase/schema.sql](./supabase/schema.sql).

Aplikasi Flutter menggunakan `HttpClient` dari Dart SDK dan penyimpanan lokal melalui API platform bawaan Android/iOS. Tidak ada package pihak ketiga pada aplikasi saat ini. Integrasi Supabase harus menambahkan konfigurasi endpoint yang aman tanpa memasukkan `service_role` key ke firmware, aplikasi, atau repository.

### 2.2 Pinout ESP32

| Komponen | Sambungan ESP32 | Catatan |
|---|---:|---|
| DS18B20 data | GPIO 4 | Resistor pull-up 4,7 kΩ dari data ke 3V3 |
| Output modul pH analog | GPIO 34 (ADC1) | Input-only; keluaran harus berada di rentang aman ADC |
| Output modul EC/TDS analog | GPIO 35 (ADC1) | Input-only; gunakan pembagi tegangan bila keluaran >3,3 V |
| VCC sensor | 3V3 sesuai spesifikasi modul | Jangan memasok sensor 5 V tanpa memastikan level output aman |
| Ground | GND bersama | Ground sensor dan ESP32 harus tersambung bersama |

GPIO 34 dan 35 dipilih dari ADC1 agar tidak berbagi ADC2 dengan Wi-Fi. Koneksi analog wajib diperiksa sebelum ESP32 diberi daya; tegangan berlebih dapat merusak perangkat.

### 2.3 Payload dan interval

Contoh payload HTTP POST:

```json
{
  "pond_id": "KOLAM-A1",
  "location": "Tambak Maneron, Bangkalan",
  "temperature": 29.4,
  "ph": 7.9,
  "salinity": 21.0,
  "timestamp": "2026-01-01T10:00:00Z"
}
```

Firmware menjadwalkan pengiriman berdasarkan selisih `millis()` sebesar `600000UL`. Pembacaan analog diratakan dengan moving average 10 sampel; suhu juga dirata-ratakan lintas konversi. Waktu payload memakai UTC dari NTP. Bila Wi-Fi atau NTP tidak tersedia, siklus tersebut dilaporkan melalui Serial dan tidak dikirim.

---

## Bab 3 — Sistem Pendukung Keputusan C4.5

### 3.1 Target klasifikasi

Label penelitian mengacu pada hasil budidaya, bukan diagnosis klinis udang. Kelas **BAGUS** mewakili kondisi yang mendukung target ukuran panen ≤ 50 ekor/kg (bobot ≥ 20 g/ekor); **TIDAK BAGUS** mewakili ukuran > 50 ekor/kg (bobot < 20 g/ekor) [1, Tabel 4]. Hasil aplikasi adalah indikator berbasis aturan dan bukan prediksi panen yang tervalidasi di Tambak Maneron.

### 3.2 Entropy, Information Gain, dan diskretisasi Gini

Entropy himpunan berlabel \(S\) dihitung sebagai:

$$
H(S)=-\sum_i p_i\log_2(p_i)
$$

Information Gain membandingkan entropy sebelum dan sesudah pemisahan atribut:

$$
Gain(S,A)=H(S)-\sum_{v\in Values(A)}\frac{|S_v|}{|S|}H(S_v)
$$

Untuk nilai sensor kontinu, titik kandidat \(t\) membagi data menjadi \(S_{<t}\) dan \(S_{\ge t}\). Gini Index mengukur impuritas kelas pada partisi:

$$
GINI(t)=1-\sum_j[p(j|t)]^2
$$

Split position dipilih dari kandidat dengan Gini terkecil. Rumus weighted Gini untuk kedua anak adalah:

$$
Gini_{split}(t)=\frac{|S_{<t}|}{|S|}Gini(S_{<t})+
\frac{|S_{\ge t}|}{|S|}Gini(S_{\ge t})
$$

Artikel melaporkan diskretisasi berdasarkan 76 data latih [1, hlm. 31, 34–37]. Angka empirisnya:

| Atribut | Split position jurnal | Gini Index terkecil | Gain Node 1 | Gain Node 1.1 |
|---|---|---:|---:|---:|
| pH | < 7,495 / ≥ 7,495 | 0,346 | 0,234 | 0,438 |
| Suhu | < 28,755 °C / ≥ 28,755 °C | 0,413 | 0,135 | — |
| Salinitas | < 25,635 ppt / ≥ 25,635 ppt | 0,480 | 0,038 | — |

Penelitian asli memakai enam atribut: Tinggi Air, Salinitas, DO, pH, Suhu, dan Alkalinitas. Untuk DO, artikel melaporkan nilai Gain 0,245 dan 0,254 pada perhitungan cabang yang disajikan; pH memiliki Gain 0,234 pada Node 1 dan 0,438 pada Node 1.1 [1, hlm. 34–37]. Node dan cabang tersebut berasal dari pohon serta data jurnal, bukan perhitungan ulang aplikasi ini.

Node IoT Maneron hanya memasang sensor pH, DS18B20, dan salinitas. Di antara tiga atribut yang tersedia itu, Gain Node 1 yang dilaporkan untuk pH (0,234) lebih tinggi daripada suhu (0,135) dan salinitas (0,038), sehingga pH dipakai sebagai Root Node acuan; suhu dan salinitas mengikuti pada jalur keputusan. Ini adalah adaptasi jujur atas subset sensor, bukan klaim bahwa pohon enam atribut jurnal berhasil direplikasi dengan tiga sensor.

### 3.3 Standar parameter dan resolusi slider

Tabel 1 artikel mengutip standar WWF-Indonesia (Badrudin, 2014) [1]:

| Parameter | Rentang optimal | Rentang toleransi |
|---|---:|---:|
| pH | 7,5–8,0 | 7,0–8,5 |
| Suhu | 28–32 °C | 26–35 °C |
| Salinitas | 15–25 ppt | 0–35 ppt |

Nilai split jurnal yang presisi tetap ditampilkan di layar Analisis. Agar posisi bawaan Perangkat dapat direpresentasikan oleh resolusi slider, profil **Standar Jurnal & Tambak Maneron** memakai nilai terdekat: pH 7,50 (step 0,05), suhu 28,75 °C (step 0,25), salinitas bawah 15 ppt, dan batas atas 25,5 ppt (step 0,5; terdekat dari split jurnal 25,635). Angka 25,5 adalah kuantisasi UI, bukan nilai yang dilaporkan penelitian. Rentang optimal WWF ditampilkan terpisah dari rentang toleransi.

Pada evaluator aplikasi, BAGUS mensyaratkan pH dan suhu berada di atas split aktif serta dalam toleransi, dan salinitas berada pada rentang bawah yang diprofilkan sampai sebelum batas split atas. Batas bawah 15 ppt menjadi pengaman operasional terhadap air tawar berlebih. Profil intensif dan pasca-hujan dapat mengubah split, tetapi tidak mengubah data empiris jurnal.

### 3.4 Evaluasi model rujukan dan batas implementasi

Untuk 17 data uji, confusion matrix artikel adalah TP=8, TN=5, FP=3, FN=1. Metrik yang dilaporkan: Accuracy = 76,47%, Precision = 72,72%, Recall = 88,88%, dengan kategori *Fair Classification* [1, Tabel 11]. Angka ini merupakan tolok ukur hasil penelitian asli dan **bukan** hasil pengujian aplikasi atau sensor Tambak Maneron.

Layar Analisis memisahkan angka empiris artikel dari metrik demo yang dihitung ulang memakai dataset ilustrasi 10 baris. Aplikasi tidak memuat 76 data latih maupun 17 data uji asli, dan evaluatornya merupakan aturan IF–THEN yang dapat dijelaskan—bukan pelatihan ulang pohon C4.5 dari data lapangan. Validasi model baru memerlukan dataset lokal berlabel, pemisahan train/test, dan evaluasi tersendiri.

---

## Bab 4 — Perancangan UI/UX dan Pengujian Sistem

### 4.1 Filosofi antarmuka

Antarmuka menggunakan widget Material bawaan Flutter dengan struktur kartu, hierarki informasi, dan palet biru maritim, putih, amber, serta merah untuk status. Warna dipakai sebagai indikator status yang konsisten, bukan dekorasi berlebihan.

Tab Perangkat menyediakan pengaturan ID perangkat dan endpoint REST, slider offset pH/suhu/salinitas, serta slider ambang split C4.5. Pengaturan dan riwayat disimpan secara lokal melalui API platform bawaan, tanpa plugin penyimpanan eksternal.

### 4.2 Rencana uji fungsional

| Uji | Langkah | Hasil yang diharapkan |
|---|---|---|
| Sensor | Bandingkan serial ESP32 dengan termometer dan larutan buffer/EC standar | Nilai terkirim setelah koreksi kalibrasi; selisih dicatat |
| Siklus rutin | Amati timestamp dua pengiriman berturut-turut | Perbedaan sekitar 600.000 ms, di luar variasi koneksi/jadwal loop |
| Uji manual | Tekan **Uji Siklus Sekarang** pada aplikasi | Satu pembacaan simulasi atau satu polling REST dijalankan tanpa menunggu 10 menit |
| Koneksi terputus | Putuskan akses endpoint setelah satu pembacaan tersimpan | Aplikasi menandai data cache dan menampilkan timestamp pembacaan lokal terakhir |
| Klasifikasi | Masukkan nilai dalam rentang ideal lalu nilai di luar salah satu rentang | BAGUS untuk semua syarat valid; TIDAK BAGUS jika ada syarat gagal |
| What-If | Geser slider pH, suhu, dan salinitas | Kelas/saran simulator berubah tanpa mengubah telemetry perangkat |
| Riwayat dan ekspor | Jalankan siklus, buka riwayat, ekspor CSV | Log memuat klasifikasi dan metadata aplikasi/lokasi/interval |

Pengujian interval penuh sebaiknya dilakukan dengan timestamp/log perangkat dan backend, bukan hanya pengamatan UI. Pengujian ini perlu diulang di lapangan dengan jaringan dan sensor yang sebenarnya.

---

## Bab 5 — Panduan Instalasi, Kalibrasi, dan Menjalankan

### 5.1 Aplikasi Flutter

1. Pasang Flutter SDK dan Android Studio untuk Android atau Xcode untuk iOS.
2. Dari root repository, jalankan `flutter pub get`, `flutter analyze`, lalu `flutter test`.
3. Hubungkan perangkat atau jalankan emulator, kemudian jalankan `flutter run`.
4. Untuk membuat APK debug, jalankan `flutter build apk --debug`; Android SDK/JDK harus tersedia.
5. Untuk mode demo, biarkan **Mode Simulasi Data** aktif dan gunakan **Uji Siklus Sekarang**.
6. Untuk sensor nyata, simpan endpoint GET backend di tab **Perangkat**, lalu matikan mode simulasi.

Proyek ini memakai Flutter/Dart SDK tanpa package pihak ketiga. Aplikasi ditargetkan untuk Android dan iOS. Backend penerima POST dari firmware harus menyediakan endpoint GET untuk data terbaru.

### 5.3 Flashing ESP32

1. Instal Arduino IDE, board package ESP32, serta library OneWire dan DallasTemperature.
2. Buka `firmware/esp32_aquapenaeus_c45/esp32_aquapenaeus_c45.ino`.
3. Periksa pinout, sambungan ground, resistor pull-up DS18B20, serta batas tegangan ADC.
4. Salin `secrets.example.h` menjadi `secrets.h`, lalu isi Wi-Fi, URL Supabase Edge Function, anon key publik, token perangkat, dan CA certificate TLS. Jangan commit `secrets.h`.
5. Kalibrasikan pH dan EC sesuai petunjuk di bawah, pilih board/port, lalu unggah sketch.
6. Buka Serial Monitor pada 115200 baud. Pastikan pembacaan masuk akal dan API merespons HTTP 2xx.

### 5.4 Kalibrasi sensor

- **DS18B20:** bandingkan dengan termometer referensi pada rentang suhu operasi, pastikan sensor terendam sesuai spesifikasi probe tahan air, dan periksa stabilitas pembacaan.
- **pH analog:** gunakan buffer pH 4, 7, dan 10. Catat tegangan keluaran yang telah stabil pada setiap buffer, masukkan ke `PH_CAL_VOLTAGE`, lalu verifikasi pada buffer yang tidak dipakai untuk penyetelan bila tersedia. Persamaan regresi linear dihitung dari tiga titik itu.
- **EC/salinitas:** gunakan standar EC 1,413 dan 12,88 mS/cm untuk memperbarui `EC_VOLTAGE_AT_1_413` dan `EC_VOLTAGE_AT_12_88`. Faktor EC-ke-ppt dalam sketch hanya pendekatan awal; validasi dengan larutan/alat salinitas berstandar pada rentang operasi tambak. Modul TDS murah tidak otomatis setara dengan probe salinitas laut.
- Bilas probe sesuai petunjuk produsen, hindari kontaminasi silang larutan standar, dan ulangi kalibrasi sesuai jadwal pemeliharaan.

### 5.5 Batasan operasional

Firmware saat ini tidak menyimpan antrean pengiriman offline pada ESP32. Ketika jaringan gagal, siklus itu dicatat di Serial namun tidak dikirim; aplikasi menggunakan pembacaan lokal terakhir yang pernah diterima. Supabase client dan kontrak database sudah disiapkan, tetapi project Supabase, Edge Function penerima POST, policy final, dan credential perangkat masih harus disiapkan serta diuji. Validasi data lapangan, keamanan jaringan, penyimpanan kredensial, autentikasi API, dan SOP tindakan tambak tetap diperlukan sebelum produksi.

## Daftar Pustaka

[1] Iqbal, M., Usino, W., & Triono. (2020, April). Sistem Pendukung Keputusan Menentukan Hasil Budidaya Udang Vaname Dengan Metode Algoritma C4.5 (PT Anugerah Sumber Laut Jaya). *Jurnal Tekno Insentif, 14*(1), 28–39. https://doi.org/10.36787/jti.v14i1.148

Catatan sumber standar: rentang kualitas air WWF-Indonesia yang diatribusikan kepada Badrudin (2014) dirujuk secara sekunder melalui Iqbal et al. (2020, Tabel 1); detail bibliografi sumber primer tersebut tidak ditambahkan tanpa verifikasi.
