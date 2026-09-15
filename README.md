# FakeStrava (TCX Activity Forge)

FakeStrava adalah aplikasi berbasis web (client-side) yang dirancang untuk memanipulasi, menggambar, dan menghasilkan file aktivitas olahraga realistis berformat `.tcx` atau `.gpx`. File hasil *generate* ini dapat diunggah ke platform seperti Strava, Garmin Connect, atau layanan pelacakan kebugaran lainnya, dan akan terlihat seperti aktivitas asli yang direkam menggunakan *smartwatch* atau *GPS tracker*.

---

## 🚀 Fitur Utama

### 1. Upload & Edit Aktivitas (GPX & TCX)
- Membaca file `.tcx` dan `.gpx` yang sudah ada.
- Mengekstrak jalur (trackpoints), waktu, kecepatan, dan elevasi.
- Kemampuan untuk memodifikasi kecepatan rata-rata, menambah/mengurangi iterasi (*looping*), memotong (*trim*) bagian awal dan akhir jalur, hingga membalikkan arah rute (*reverse*).

### 2. Draw Route (Pembuat Rute Interaktif)
- **Waypoints:** Pengguna dapat mengklik pada peta untuk membuat titik-titik rute.
- **OSRM Road-Snapping:** Titik-titik yang dibuat secara otomatis akan dihubungkan mengikuti kontur jalan raya yang sebenarnya menggunakan mesin *Open Source Routing Machine (OSRM)*.
- **Manual Snap Toggle:** Pengguna dapat mematikan fitur *Snap to Roads* untuk menggambar jalur lurus di area yang tidak memiliki jalan raya terdaftar (seperti dalam stadion, GBK, atau hutan). Mode manual ini didukung oleh algoritma *Catmull-Rom Spline* agar tikungan buatan manual tetap melengkung mulus dan tidak kaku.
- **Freehand Draw:** Pengguna dapat menggambar bentuk abstrak secara bebas (misal: bentuk segitiga) dengan kursor, dan sistem (*Ramer-Douglas-Peucker algorithm*) akan mengekstrak pola tersebut lalu menyelaraskannya dengan jalan nyata terdekat.
- **Undo, Redo, & Clear:** Kontrol penuh atas riwayat penggambaran titik pada peta.
- **Layer Peta:** Mendukung peta jalan biasa (*OpenStreetMap*) maupun *Satellite* (*Esri World Imagery*) untuk presisi pemetaan di alam liar.
- **Fitur Pencarian:** Terintegrasi dengan Leaflet Geocoder untuk mencari lokasi/kota di seluruh dunia dengan cepat.

### 3. Realism Engine (Mesin Simulasi Realistis)
Mesin ini adalah inti dari aplikasi, memastikan data yang diekspor tidak terlihat seperti robot/bot:
- **Elevation-based Pacing:** Kecepatan lari/sepeda otomatis melambat saat menanjak (uphill) dan sedikit bertambah saat menurun (downhill).
- **GPS Jitter (Noise):** Menambahkan fluktuasi/getaran acak dalam hitungan desimal koordinat lat/lng untuk menyimulasikan ketidakakuratan satelit GPS dunia nyata.
- **Speed Noise:** Variasi kecepatan per detik agar laju pengguna terlihat natural (tidak statis di angka yang sama).
- **Random Stops:** Menyimulasikan waktu berhenti mendadak (misal: berhenti di lampu merah atau mengikat tali sepatu).
- **Dynamic Heart Rate (BPM):** Menghasilkan grafik detak jantung yang masuk akal berdasarkan *Pacing Strategy* (Negative Split, Flat, dll), elevasi tanjakan, serta fase *Warm-up* dan *Cooldown*.

### 4. Customization Options
- **Sports:** Dukungan tipe olahraga `Running`, `Walking`, dan `Biking` (Otomatis mengubah algoritma kecepatan/pace).
- **Start Time:** Bebas memanipulasi kapan aktivitas tersebut seolah-olah dilakukan.
- **Elevation Offset:** Mengubah ketinggian dasar rute secara massal.

---

## 🛠 Teknologi & Arsitektur (Tech Stack)

Aplikasi ini dibangun tanpa *framework* berat (Vanilla JS) agar mudah dipelajari dan dimodifikasi:
- **HTML5 & CSS3 (Vanilla):** UI modern dengan tema *Minimalism* (CSS variables, flexbox/grid).
- **JavaScript (ES6):**
  - `app.js`: State management dan UI bindings.
  - `map-preview.js`: Modul integrasi Leaflet (Peta, Geocoder, OSRM request).
  - `tcx-generator.js`: Mesin pembuat struktur XML TCX.
  - `tcx-parser.js` & `gpx-parser.js`: Mesin pembaca file XML dari luar.
  - `route-engine.js` & `realism-engine.js`: Logika manipulasi jarak (Haversine), kecepatan, dan injeksi noise.
  - `route-simplifier.js`: Algoritma simplifikasi (Ramer-Douglas-Peucker) dan penghalus kurva (Catmull-Rom Spline).
- **Library Eksternal:** [Leaflet.js](https://leafletjs.com/) (Peta interaktif) & Leaflet Control Geocoder.
- **API Eksternal:** Project-OSRM Public API (untuk *road-snapping* rute sepeda dan pejalan kaki).

---

## ⚠️ Kekurangan & Keterbatasan (Limitations)

Bagi pengembang yang ingin *fork* atau melanjutkan proyek ini, harap perhatikan hal-hal berikut:

1. **Limitasi API OSRM Publik:** OSRM gratis yang saat ini digunakan tidak mengizinkan terlalu banyak titik *waypoint* (biasanya maks 100 titik) dalam satu *request*. Rute berjarak ratusan kilometer atau garis *freehand* yang teramat panjang bisa gagal (Error 400).
   * **Solusi Lanjutan:** Host server OSRM sendiri, atau gunakan Mapbox API / GraphHopper.
2. **Elevasi (Altitude) yang Hilang:** Jika pengguna menggambar rute baru di peta, OSRM gratis seringkali tidak menyediakan data ketinggian murni (Elevasi 0 meter). 
   * **Solusi Lanjutan:** Integrasikan API Topografi seperti *Open-Elevation API* atau *Google Elevation API* di dalam `route-engine.js`.
3. **Performa Client-side:** Proses *parsing* dan *generating* untuk file dengan ratusan ribu *trackpoint* (>50 km lari / >200 km sepeda) bisa membuat *browser* sedikit *lag* karena *single-threaded*.
   * **Solusi Lanjutan:** Pindahkan logika komputasi kalkulasi `realism-engine` ke dalam *Web Workers*.
4. **Otomatisasi Upload ke Strava:** Pengguna masih harus mengunduh file `.tcx` secara manual lalu membuka website Strava untuk diunggah.
   * **Solusi Lanjutan:** Implementasi *OAuth2 Strava API* dengan sebuah *backend* kecil (Node.js/Python) untuk melakukan *direct upload*.

---

## 📝 Cara Menjalankan Secara Lokal
Tidak memerlukan dependensi *NPM/Node* rumit untuk dijalankan (karena aplikasinya statis).
1. Clone / Unduh repositori ini.
2. Gunakan *Live Server* di VS Code atau jalankan perintah \`npx http-server ./ -c-1\` di folder proyek.
3. Buka \`http://localhost:8080\` di browser.

**Enjoy forging your activities!**
