# 🌊 Liquid Glass Music Player (iOS 26 Style)

Aplikasi pemutar musik modern bergaya **Liquid Glass (ala iOS 26)** yang responsif dan mobile-first, dilengkapi efek refraksi lensa cair nyata (*SVG feDisplacementMap*), *ambient dynamic gradient mesh*, sinkronisasi lirik karaoke (*synced lyrics*), dan integrasi backend **Python FastAPI** berbasis **`ytmusicapi`** & **`yt-dlp`**.

---

## 📱 Fitur Utama

1. **Liquid Glass Aesthetic (iOS 26)**:
   - **Dynamic Ambient Mesh**: Warna latar belakang bergradasi lembut dan berubah dinamis mengikuti palet warna dari cover album lagu yang sedang diputar.
   - **Efek Kaca**: `backdrop-filter: blur(28px) saturate(190%)`, highlight specular 1px di tepi atas, border transparan halus, dan bayangan lembut berdimensi.
   - **Gelembung Navigasi Kaca Cair**: Tab bar melayang dengan indikator gelembung aktif yang dapat di-**drag/swipe** ke kiri dan kanan. Gelembung meregang (*fluid stretch & squash*) mengikuti kecepatan jari, membiaskan elemen latar belakang dengan filter refraksi SVG (`feDisplacementMap`), lalu snap ke tab tujuan dengan *spring physics*.

2. **Halaman & Navigasi**:
   - **Home**: Quick picks, trending chart YouTube Music, album pilihan, dan artis terpopuler.
   - **Search**: Pencarian instan (lagu, artis, album) dengan *real-time debounce* (300ms) dan skeleton loading.
   - **Library**: Menyimpan lagu Favorit (Liked) dan Riwayat Putar (History) di `localStorage` peramban.
   - **Profile / Glass Optics**: Panel kendali interaktif untuk mengubah intensitas blur, kekuatan pembiasan lensa (*refraction scale*), dynamic mesh, dan preferensi kualitas audio (Normal, HQ, Lossless 24-bit).

3. **Floating Mini Player & Fullscreen Glass Sheet**:
   - **Mini Player**: Mengambang tepat di atas tab bar dengan cover berputar, judul lagu, progress hairline, tombol Play/Pause & Next.
   - **Full Player**: Dapat dibuka dengan sekali tap atau swipe ke atas; dilengkapi *large glass artwork*, *scrubber slider* interaktif, lirik sinkron (*synced lyrics karaoke* baris per baris dengan lompat waktu), antrean putar (*queue manager*), mode *shuffle* dan *repeat*.
   - **Media Session API**: Terintegrasi langsung dengan kontrol media sistem operasi (lockscreen, keyboard media keys, notifikasi peripheral).

---

## 📂 Struktur Proyek

```
├── backend/                  # Python FastAPI Backend
│   ├── main.py               # Endpoint API: /home, /search, /song, /stream, /lyrics, /album, /artist
│   ├── requirements.txt      # fastapi, uvicorn, ytmusicapi, yt-dlp, httpx, pydantic
│   └── README.md             # Petunjuk khusus backend
├── src/                      # Frontend React + TypeScript
│   ├── components/
│   │   ├── LiquidGlassTabBar.tsx   # Floating tab bar & draggable refraction bubble
│   │   ├── LiquidMeshBackground.tsx# Dynamic color ambient mesh & SVG displacement filters
│   │   ├── MiniPlayer.tsx          # Floating glass mini player
│   │   ├── FullPlayer.tsx          # Fullscreen glass sheet with synced lyrics & queue
│   │   └── SkeletonLoader.tsx      # Skeleton shimmering cards
│   ├── context/
│   │   └── MusicContext.tsx        # Player state, audio element, queue & localStorage sync
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── LibraryPage.tsx
│   │   └── ProfilePage.tsx
│   ├── services/
│   │   └── api.ts                  # Integrasi endpoint backend dengan fallback resilience
│   ├── types/
│   │   └── music.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── server.ts                 # Full-stack dev server (Express + Vite middlewares + FastAPI proxy)
├── package.json
└── README.md
```

---

## 🚀 Cara Menjalankan

```bash
npm install
npm run dev        # frontend + backend Python menyala bersamaan di http://localhost:3000
```

Backend Python (FastAPI) dijalankan otomatis oleh `server.ts` dan dependency-nya dipasang otomatis
(`pip install -r backend/requirements.txt`). Butuh Python 3.9+ dan ffmpeg.

Jika memakai `vite` langsung: jalankan `npm run backend` di terminal 1 dan `npm run dev:vite` di terminal 2.

Produksi: `npm run build && npm start` (atau `npm run prod`).

## 🛠️ Mengatasi "Server error 404"

Penyebab umum dan perbaikannya (sudah ditangani di versi ini):

1. **Port backend bentrok dengan Jupyter (8888)** → backend kini memakai port **8765** dan otomatis
   pindah ke port bebas berikutnya jika terpakai. `server.ts` memverifikasi `/health` (`app: liquid-music`)
   sebelum meneruskan request, jadi tidak pernah nyasar ke server lain.
2. **Dijalankan tanpa `server.ts`** (mis. hanya `vite` / hosting statis) → endpoint `/music-api` tidak ada.
   Jalankan lewat `npm run dev`/`npm start`, atau hosting backend terpisah lalu set `VITE_API_BASE`.
3. **Beda prefix** → backend menerima `/music-api/x`, `/api/x`, dan `/x`; klien mencoba kedua prefix otomatis.
4. Saat backend masih booting, proxy membalas **503** (bukan 404) dan klien mencoba ulang otomatis.

Cek cepat: buka `http://localhost:3000/music-api/_status` dan `http://localhost:3000/music-api/diag`.

## ℹ️ Dengar bersama
Sinkronisasi memakai `BroadcastChannel`, jadi bekerja antartab di peramban yang sama. Untuk antar-perangkat
dibutuhkan server realtime (WebSocket) di backend.
