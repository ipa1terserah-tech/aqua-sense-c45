# Product Requirements Document

## Aquapenaeus C4.5 — Monitoring Kualitas Air Tambak

| Atribut | Nilai |
|---|---|
| Versi | 0.1 |
| Status | Draft untuk validasi |
| Tanggal | 20 November 2026 |
| Platform aplikasi | Flutter (Dart), Android dan iOS |
| Backend target | Supabase |

## 1. Ringkasan produk

Aquapenaeus C4.5 membantu operator tambak memantau suhu, pH, dan salinitas, melihat klasifikasi kualitas air, menerima pembaruan telemetry, serta meninjau histori pengukuran. ESP32 mengambil data sensor dan mengirimkannya ke Supabase. Aplikasi Flutter mengambil data awal dan histori melalui HTTPS, lalu menerima pembacaan baru melalui Supabase Realtime.

**Supabase bukan broker MQTT.** Supabase adalah backend berbasis PostgreSQL dengan REST API dan layanan Realtime. Rancangan produk ini menggunakan HTTPS/JSON untuk ingest dan query, serta WebSocket Secure (WSS) untuk event realtime. MQTT tidak digunakan dalam rancangan MVP.

> **Status saat ini:** repository telah memiliki client Flutter berbasis Dart SDK untuk REST dan Realtime, schema SQL awal, serta firmware yang disiapkan untuk Edge Function. Belum ada URL/key project, policy final, atau Edge Function yang aktif, jadi alur end-to-end belum bisa digunakan sampai temanmu mengisi konfigurasi dan menyiapkan project. `service_role` tidak boleh dimasukkan ke aplikasi atau firmware.

## 2. Masalah dan peluang

- Operator perlu melihat kondisi kolam tanpa membaca serial monitor ESP32.
- Data terbaru dan data historis perlu tersedia di satu aplikasi.
- Koneksi tambak dapat terputus; aplikasi perlu tetap menampilkan data lokal terakhir dan membedakan data lama dari data realtime.
- Klasifikasi dan rekomendasi harus bisa dijelaskan serta tidak disalahartikan sebagai pengganti SOP teknisi.

## 3. Tujuan dan indikator keberhasilan

### Tujuan

1. Menampilkan pengukuran ESP32 dan status kesegaran datanya per kolam.
2. Memperbarui tampilan setelah telemetry tersimpan di Supabase tanpa menunggu polling layar.
3. Menyediakan pencarian histori berdasarkan kolam dan rentang waktu.
4. Menampilkan keputusan C4.5, ambang yang digunakan, dan rekomendasi secara transparan.
5. Tetap berguna saat perangkat atau jaringan sedang offline.

### Indikator keberhasilan MVP

- Setelah satu baris telemetry tersimpan, dashboard menerima dan menampilkan event dalam **≤5 detik pada jaringan normal**.
- Pengguna dapat memuat histori untuk kolam dan rentang tanggal tertentu, dengan pagination tanpa kehilangan atau duplikasi baris.
- Data yang ditampilkan memuat waktu pengukuran dan waktu penerimaan agar keterlambatan dapat diketahui.
- Saat koneksi backend terputus, aplikasi menandai data cache dan menampilkan waktu pengukuran terakhir.
- Tidak ada Supabase `service_role` key di firmware, aplikasi mobile, atau repository.

## 4. Pengguna dan kebutuhan

### Operator tambak

- Melihat kondisi terbaru untuk kolam yang dipilih.
- Mengetahui apakah sensor online, offline, atau data yang terlihat adalah cache.
- Melihat tren dan membuka detail pembacaan terdahulu.
- Memahami alasan klasifikasi dan tindakan yang disarankan.

### Administrator/teknisi

- Mendaftarkan perangkat dan menghubungkannya ke kolam.
- Mengatur endpoint/kredensial perangkat secara aman.
- Menyetel offset kalibrasi dan ambang C4.5.
- Menelusuri data ketika terjadi sensor gagal, koneksi terputus, atau nilai tidak wajar.

Autentikasi pengguna dan hak akses multi-operator perlu dikonfirmasi sebelum implementasi backend produksi.

## 5. Ruang lingkup

### Termasuk MVP

- Dashboard per kolam: suhu, pH, salinitas, waktu pengukuran, sumber, status koneksi/kesegaran data, dan klasifikasi.
- Ingest telemetry dari ESP32 ke Supabase melalui HTTPS.
- Pembacaan histori melalui REST API Supabase, dengan filter kolam, tanggal, status, dan sumber.
- Subscription Supabase Realtime untuk event telemetry baru.
- Perhitungan C4.5, aturan aktif, dan rekomendasi pada aplikasi.
- Kalibrasi offset, pengaturan ambang, simulator What-If, dan penyimpanan lokal.
- Ekspor histori ke CSV.
- Banner/peringatan in-app ketika data stale, backend tidak tersedia, sensor tidak valid, atau kelas berubah menjadi TIDAK BAGUS.

### Tidak termasuk MVP

- Kontrol jarak jauh terhadap kincir, pompa, atau aktuator.
- Protokol MQTT atau pengoperasian broker MQTT.
- Otomatisasi tindakan budidaya berdasarkan klasifikasi.
- Prediksi hasil panen atau klaim pelatihan ulang model penelitian.
- Push notification di luar aplikasi sebelum kebutuhan dan kanalnya disetujui.

## 6. Arsitektur dan protokol komunikasi

```text
Sensor pH / suhu / EC
        │ GPIO / ADC / OneWire
        ▼
      ESP32
        │ HTTPS POST + JSON
        ▼
Supabase Edge Function (ingest dan validasi perangkat)
        │ insert
        ▼
PostgreSQL: telemetry
        ├──────── HTTPS REST / PostgREST ────────┐
        └──────── Realtime over WSS ─────────────┤
                                                  ▼
                                           Flutter app
                                      dashboard + histori
```

### Protokol target

| Jalur | Protokol | Fungsi |
|---|---|---|
| ESP32 → Supabase Edge Function | HTTPS `POST`, JSON | Mengirim telemetry dan autentikasi perangkat |
| Edge Function → PostgreSQL | Supabase server-side client/SQL | Validasi, normalisasi, dan penyimpanan |
| Flutter → Supabase REST | HTTPS `GET` | Memuat pembacaan terakhir dan histori dengan filter/pagination |
| Supabase → Flutter | WSS, Supabase Realtime/Postgres Changes | Mengirim event saat baris telemetry baru masuk |

Supabase Realtime menggunakan WebSocket dengan protokol channel Supabase (berbasis Phoenix Channels); ini **bukan MQTT**. Jika kelak MQTT diwajibkan, broker seperti EMQX/Mosquitto dan bridge ke Supabase menjadi komponen tambahan yang terpisah dari MVP.

### Batas arti “real-time”

Realtime berarti UI menerima event segera setelah data berhasil masuk ke database, bukan bahwa sensor mengukur terus-menerus. Firmware saat ini mengirim satu siklus setiap **10 menit**. Dengan interval itu, pembacaan baru hanya tersedia setelah siklus berikutnya. Mempercepat siklus membutuhkan keputusan terpisah mengenai interval, daya, kualitas sensor, biaya koneksi, dan beban database.

### Keamanan

- Gunakan HTTPS/WSS; jangan mengirim telemetry produksi melalui HTTP biasa.
- ESP32 hanya memakai kredensial perangkat terbatas yang dapat dicabut/dirotasi. Jangan pernah menanam `service_role` key ke firmware.
- Edge Function memvalidasi identitas perangkat, kolam yang diizinkan, tipe/rentang nilai, timestamp, dan ukuran payload sebelum insert.
- `service_role` hanya disimpan sebagai secret server-side pada Supabase Edge Function.
- Aktifkan Row Level Security (RLS). Aplikasi hanya membaca kolam yang diizinkan bagi akun pengguna.
- Jangan mengirim secret backend di source, log, atau CSV.
- Simpan event kesalahan tanpa menyalin token atau kredensial.

Schema awal memberi akses baca `anon` untuk MVP agar aplikasi tanpa login dapat menampilkan telemetry. Artinya data telemetry dapat dibaca publik menggunakan project URL dan anon key. Ganti policy ini dengan autentikasi dan RLS per kolam sebelum menyimpan data yang tidak boleh publik.

## 7. Data dan kontrak telemetry

### Payload ingest yang diusulkan

```json
{
  "device_id": "ESP32-AQP-A1",
  "pond_id": "KOLAM-A1",
  "location": "Tambak Maneron, Bangkalan Madura",
  "temperature": 29.4,
  "ph": 7.9,
  "salinity": 21.0,
  "measured_at": "2026-11-20T08:00:00Z"
}
```

Edge Function menetapkan `received_at` dari waktu server. Timestamp perangkat tetap disimpan sebagai `measured_at`; aplikasi tidak boleh menyamakan keduanya.

### Tabel `telemetry` yang diusulkan

| Kolom | Tipe konseptual | Catatan |
|---|---|---|
| `id` | UUID | Primary key, dibuat server |
| `pond_id` | text/UUID | Relasi ke kolam |
| `device_id` | text/UUID | Identitas perangkat terdaftar |
| `temperature` | numeric | °C |
| `ph` | numeric | pH |
| `salinity` | numeric | ppt |
| `measured_at` | timestamptz | Waktu sampel dari perangkat |
| `received_at` | timestamptz | Waktu diterima backend |
| `is_complete` | boolean | Kelengkapan nilai sensor |
| `source` | text | Contoh: `ESP32_LIVE` atau `SIMULASI` |
| `classification` | text, opsional | Hasil yang dihitung aplikasi |
| `recommendation` | text, opsional | Ringkasan rekomendasi saat dicatat |

Indeks minimum: `(pond_id, measured_at DESC)` dan `(device_id, measured_at DESC)`. Batas retensi dan strategi partisi ditetapkan berdasarkan volume dan kebijakan operasional.

## 8. Persyaratan fungsional

| ID | Prioritas | Persyaratan | Kriteria penerimaan |
|---|---|---|---|
| FR-01 | P0 | Memuat pembacaan terakhir saat aplikasi dibuka | Kolam terpilih menampilkan nilai, `measured_at`, dan status kesegaran |
| FR-02 | P0 | Menerima telemetry baru via Realtime | Insert baru tampil tanpa refresh manual dalam ≤5 detik pada koneksi normal |
| FR-03 | P0 | Menampilkan histori | Filter kolam dan rentang waktu menghasilkan data terurut terbaru dahulu |
| FR-04 | P0 | Memuat histori bertahap | Pagination memuat halaman berikut tanpa duplikasi atau menghilangkan baris |
| FR-05 | P0 | Menandai data stale/cache | Saat tidak ada event melewati ambang stale atau koneksi putus, UI menandai status dan waktu data terakhir |
| FR-06 | P0 | Mengklasifikasi kualitas air | Kelas, aturan, split, dan rekomendasi menggunakan ambang tersimpan yang sama |
| FR-07 | P1 | Mengatur perangkat dan kolam | Perangkat terikat ke satu kolam terdaftar; input tidak valid ditolak dengan pesan jelas |
| FR-08 | P1 | Kalibrasi dan ambang C4.5 | Nilai tersimpan lokal dan perubahan ditampilkan sebelum diterapkan |
| FR-09 | P1 | Peringatan in-app | Status TIDAK BAGUS atau telemetry stale terlihat; transisi kelas tidak membuat alert duplikat berulang |
| FR-10 | P1 | Ekspor CSV | CSV berisi waktu sampel/terima, kolam/perangkat, parameter, status, dan klasifikasi |
| FR-11 | P2 | Sinkronisasi saat offline | Data lokal terakhir dapat dibaca; telemetry tertunda dapat diantrekan dan dikirim ulang tanpa duplikasi |

## 9. Persyaratan non-fungsional

- **Latency:** event Realtime sampai UI ≤5 detik setelah insert, di bawah kondisi jaringan normal.
- **Kebenaran data:** nilai mentah, nilai terkoreksi, timestamp sampel, dan timestamp penerimaan tidak tertukar.
- **Reliabilitas:** reconnect Realtime harus melakukan fetch ulang data terakhir agar celah event tertutup.
- **Skalabilitas awal:** asumsi awal 1–10 kolam; angka ini perlu dikonfirmasi.
- **Keamanan:** RLS dan validasi server aktif sebelum data dipakai lintas pengguna.
- **Privasi:** hanya data perangkat/kolam yang diperlukan disimpan; akses histori dibatasi sesuai peran.
- **Usability:** stale/offline terlihat jelas; rekomendasi menyertakan catatan bahwa SOP teknisi tetap utama.

## 10. Alur utama

1. Operator memilih kolam; aplikasi memuat data terakhir dan histori ringkas dari Supabase REST.
2. Aplikasi membuka channel Realtime yang difilter untuk kolam terpilih.
3. ESP32 mengambil sensor, menambahkan `device_id`, `pond_id`, dan `measured_at`, lalu mengirim HTTPS POST.
4. Edge Function memvalidasi token dan payload, lalu menulis ke tabel `telemetry`.
5. Supabase Realtime menerbitkan event insert; aplikasi memperbarui dashboard, klasifikasi, dan daftar histori.
6. Saat pengguna membuka histori, aplikasi melakukan REST query berfilter dan pagination.
7. Jika koneksi terputus, aplikasi menampilkan cache lokal dan waktu update terakhir; setelah reconnect, aplikasi fetch ulang untuk sinkronisasi.

## 11. Validasi dan pengujian

- Uji payload valid, field hilang, tipe nonnumerik, nilai di luar batas, token salah, timestamp invalid, dan device/pond tidak terdaftar.
- Uji insert ESP32 → Edge Function → Postgres → Realtime → Flutter end-to-end.
- Ukur waktu insert sampai render event dengan jaringan lokal dan jaringan seluler.
- Uji pagination histori untuk rentang pendek/panjang, termasuk beberapa baris dengan timestamp berdekatan.
- Putus-sambungkan Wi-Fi dan WebSocket; pastikan UI menandai cache dan melakukan resync setelah koneksi pulih.
- Uji RLS dengan akun dari kolam berbeda dan pastikan akses lintas kolam ditolak.
- Cocokkan hasil C4.5 di aplikasi dengan kasus batas split dan toleransi.
- Pastikan CSV dapat dibuka dan karakter koma, tanda kutip, serta timestamp ditangani benar.

## 12. Tahapan implementasi

1. **Supabase foundation:** teman pengelola membuat project, menjalankan `supabase/schema.sql`, menetapkan policy/akses, dan mengisi secret.
2. **Secure ingest:** deploy Edge Function `/functions/v1/telemetry-ingest`, validasi token perangkat, lalu uji dengan payload simulasi.
3. **Konfigurasi perangkat:** isi file lokal `secrets.h` dan pasang CA TLS yang benar; jangan commit credential.
4. **Flutter REST/Realtime:** client dasar, fetch histori, subscribe, reconnect, dedup, dan cache sudah ada; uji end-to-end setelah project aktif.
5. **Offline, alert, dan ekspor:** lengkapi antrean telemetry, status stale, alert, uji lapangan, serta evaluasi latensi.

Setiap tahap harus memiliki project Supabase pengujian terpisah dari produksi; credential produksi tidak dimasukkan ke repository.

## 13. Risiko, asumsi, dan keputusan terbuka

### Asumsi PRD

- Supabase menjadi database utama telemetry dan histori untuk MVP.
- ESP32 mengirim telemetry tiap 10 menit mengikuti firmware saat ini.
- Data baru dihasilkan saat telemetry masuk; Realtime tidak mengubah interval sampling.
- Flutter tidak menggunakan package pihak ketiga; REST dan WebSocket menggunakan API Dart SDK dan protokol Supabase.

### Keputusan yang perlu dikonfirmasi

1. Apakah autentikasi operator memakai email/password, akun bersama per tambak, atau tanpa login pada MVP?
2. Berapa jumlah kolam dan perangkat yang harus didukung?
3. Berapa lama histori telemetry disimpan dan apakah data harus diekspor/diarsipkan?
4. Apakah interval 10 menit dipertahankan atau perlu lebih sering?
5. Apakah peringatan cukup in-app atau memerlukan push notification/WhatsApp?
6. Apakah setiap device memperoleh token individual dan bagaimana proses provisioning/rotasinya?
7. Apakah hasil C4.5 hanya dihitung di Flutter atau juga disimpan/divalidasi di server?

