# Liquid Glass Music Backend (FastAPI + ytmusicapi + yt-dlp)

Backend untuk aplikasi pemutar musik bergaya **Liquid Glass (ala iOS 26)**.

## 🛠️ Fitur Utama
1. **Unofficial YouTube Music API (`ytmusicapi`)**:
   - `/home`: Mendapatkan rekomendasi lagu, trending charts, quick picks, dan featured albums.
   - `/search?q={query}&filter={filter}`: Pencarian real-time lagu, artis, album, dan playlist dengan debounce.
   - `/song/{id}`: Metadata lagu mendalam beserta track terkait.
   - `/lyrics/{id}`: Lirik tersinkron asli per baris (timestamp YouTube Music, fallback LRCLIB, lalu teks biasa).
   - `/related/{id}`: Radio / lagu serupa.
   - `/album/{id}`: Detail album dan tracklist.
   - `/artist/{id}`: Profil artis, jumlah subscriber, dan lagu populer.
2. **Audio Streaming Engine (`yt-dlp`)**:
   - `/stream/{id}`: Mengekstrak direct audio stream URL dan mendukung proxy stream dengan HTTP Range Chunking untuk scrub/seeking tanpa lag.
3. **CORS Terbuka**: Siap diakses langsung oleh frontend React Vite.
4. **Tanpa data palsu**: jika YouTube Music tidak bisa dijangkau, API mengembalikan error 503 (atau data cache terakhir) dan UI menampilkan tombol *Coba lagi*.

---

## 🚀 Cara Install & Menjalankan Backend

### Prasyarat:
- Python 3.9+
- ffmpeg (`sudo apt-get install ffmpeg` di Ubuntu/Debian atau `brew install ffmpeg` di macOS)

### 1. Buat Virtual Environment (Opsional tapi direkomendasikan):
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Di Linux/macOS
# atau venv\Scripts\activate di Windows
```

### 2. Install Dependencies:
```bash
pip install -r requirements.txt
```

### 3. Jalankan Server FastAPI:
```bash
python3 main.py
# atau
uvicorn main:app --host 0.0.0.0 --port 8765 --reload
```

Server backend akan berjalan di:
`http://localhost:8765`

Dokumentasi interaktif Swagger UI tersedia di:
`http://localhost:8765/docs`


## 🔴 Real-time
- `/home` = `get_home()` (rekomendasi/quick picks) + `get_charts()` (trending per negara) + `get_explore()` (rilis baru) + kategori mood asli YT Music.
- Cache 5-10 menit dengan *stale-while-error*; frontend refresh otomatis tiap 5 menit dan saat tab kembali aktif.
- Atur lokasi lewat `.env` (`YTM_LOCATION`, `YTM_CHART_COUNTRY`). Untuk rekomendasi personal, set `YTM_AUTH` ke file auth ytmusicapi.
