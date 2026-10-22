# Zmt Media Player 🎬🔊

Pemutar media video modern berperforma tinggi yang mendukung pemutaran resolusi hingga HD / Full HD / 2K / 4K UHD, manajemen Subtitle multi-format (.srt, .vtt, .ass) dengan sinkronisasi offset, serta pemrosesan audio DSP (Volume Boost hingga 300% dan 10-Band Graphic Equalizer).

---

## ✨ Fitur Utama

### 1. 🎥 Pemutaran Video Resolusi Tinggi (HD / 4K UHD)
- Mendukung format video MP4, WebM, MKV, MOV, TS.
- Otomatis mendeteksi resolusi video (`4K UHD`, `2K QHD`, `1080p FHD`, `720p HD`).
- Pengaturan rasio aspek: Fit Original, 16:9 Widescreen, 4:3 Classic, 21:9 Cinema, Stretch Fill.
- Pengaturan kecepatan pemutaran (0.25x hingga 3.0x).
- Fitur **Frame Snapshot**: Tangkap frame video beresolusi penuh dalam format PNG.
- Picture-in-Picture (PiP) & Fullscreen.
- Video Color Grading & Filters: Brightness, Contrast, Saturation, dan Hue Rotate.

### 2. 💬 Subtitle & Closed Captions Engine (.SRT, .VTT, .ASS)
- **Multi-Track Subtitles**: Pilih trek bawaan atau muat berkas subtitle kustom secara instan.
- **Drag & Drop Subtitle**: Cukup seret berkas `.srt` atau `.vtt` langsung ke jendela player.
- **Sinkronisasi Offset Delay/Advance**: Atur timing subtitle (-10s hingga +10s dengan presisi 0.1 detik) jika subtitle tidak pas dengan audio.
- **Custom Styling**: Atur ukuran teks (Small, Medium, Large, Extra), warna (White, Yellow, Cyan, Green), kotak latar belakang, dan transparansi.
- **Interactive Transcript**: Lihat daftar semua dialog teks yang dapat dicari; klik baris dialog mana saja untuk langsung lompat ke detik tersebut!

### 3. 🔊 Audio Processing & 10-Band Equalizer (Web Audio API)
- **Extra Volume Boost hingga 300%**: Mengatasi video dengan rekaman suara atau vokal dialog yang terlalu pelan.
- **10-Band Graphic Equalizer**: Frekuensi 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz (-12dB s/d +12dB).
- **Audio-Video Delay Sync**: Sinkronisasi audio dan bibir aktor (0.00s s/d 2.00s) untuk mengatasi desinkronisasi audio Bluetooth atau speaker eksternal.
- **Preset Suara Siap Pakai**: Flat, Bass Boost, Cinema / Movie, Vocal Booster, Rock, Pop, Electronic, Night Mode.
- **Stereo Balance (Pan)**: Atur distribusi suara kanal kiri (L) dan kanan (R).
- **Visualizer Frekuensi Real-Time**: Spektogram audio 60 FPS pada panel Equalizer.

### 4. 📋 Playlist & Demo Clips
- Antrean playlist dengan kontrol Shuffle & Repeat (All / One / Off).
- Sudah dilengkapi 4 klip video demo HD (Oceans Wildlife HD, Big Buck Bunny 1080p FHD, View From A Blue Moon 720p Action, Flower Timelapse) beserta subtitle Indonesia & Inggris untuk pengujian instan.
- Buka video lokal melalui tombol Open Video atau Drag & Drop berkas video dan subtitle secara bersamaan.

---

## ⌨️ Pintasan Keyboard (Shortcuts)

| Tombol | Aksi |
|---|---|
| `Space` / `K` | Putar / Jeda video (Play / Pause) |
| `Left` / `J` | Mundur 5 detik (Shift + Left: 10 detik) |
| `Right` / `L` | Maju 5 detik (Shift + Right: 10 detik) |
| `Up` / `Down` | Volume naik / turun 5% |
| `0` - `9` | Lompat ke persentase durasi (0% s/d 90%) |
| `Double Click` | Mode layar penuh (Fullscreen) |
| `M` | Matikan / Nyalakan suara (Mute) |
| `F` | Mode layar penuh (Fullscreen) |
| `P` | Mode Picture-in-Picture (PiP) |
| `Shift + P` | Putar video sebelumnya di playlist |
| `S` | Buka menu Subtitle |
| `B` | Buka Audio Equalizer & Boost 300% |
| `V` | Buka Pengatur Gambar & Kecepatan |
| `C` | Ambil tangkapan layar frame (Screenshot) |
| `N` | Putar video berikutnya di playlist |
| `[` / `]` | Kurangi / Tambah kecepatan putar |
| `?` | Buka contekan pintasan keyboard |

---

## 🚀 Menjalankan Aplikasi Windows Desktop (.EXE)

Aplikasi telah dikonfigurasi dan dipaketkan sebagai **Aplikasi Native Windows Desktop (.exe)** menggunakan Electron dan Electron Builder.

### 1. Langsung Jalankan File .EXE yang Sudah Jadi
Aplikasi Windows executable siap pakai telah di-build ke folder `release/`:

- **Portable Executable (Standalone Single .exe)**:
  ```
  release\Zmt Media Player 1.0.0.exe
  ```
  *(Cukup double click file ini untuk langsung menjalankan player tanpa perlu web browser atau port web)*

- **Unpacked Native Application Folder**:
  ```
  release\win-unpacked\Zmt Media Player.exe
  ```

---

### 2. Perintah Build & Development

```bash
# Menjalankan aplikasi desktop langsung dengan Electron
npm run electron

# Menjalankan live development desktop (Vite + Electron hot-reload)
npm run electron:dev

# Menghasilkan folder executable Windows (win-unpacked)
npm run electron:build

# Mengompilasi standalone portable single file .exe
npm run dist:win

# Menjalankan suite pengujian unit
npm run test
```
