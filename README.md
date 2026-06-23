# DubClean

Desktop app (Electron) untuk membersihkan video hasil translate/repost — blur watermark, burn-in subtitle SRT, dan add/replace audio. Dibangun untuk produksi konten short video (drama China → Indonesia) secara lokal di laptop/PC.

**Repo:** https://github.com/OverHzn/DubClean

---

## Fitur

- **Blur region** — gambar kotak di preview untuk nutup watermark/teks asli (multi-box, intensitas adjustable, time range)
- **Burn-in subtitle** — import `.srt`, render dengan style box custom via ASS (font, warna, posisi, opacity)
- **Add / Replace audio** — pasang audio baru (mp3/wav/aac/m4a) dengan kontrol volume, offset, trim/loop
- **Preset** — simpan/load template blur + subtitle style untuk series yang sama
- **Render lokal** — output `{nama}_clean.mp4` via ffmpeg (CRF 18)
- **Self-contained** — ffmpeg dibundle via `ffmpeg-static`, tidak perlu install ffmpeg manual

## Workflow

```
Buka video → gambar blur box → import SRT → atur style → (opsional) audio → Render
```

### Pipeline dengan SublyAI

```
SublyAI  →  transcribe + translate → download subtitle_id.srt
DubClean →  blur watermark + burn subtitle styled + add/replace audio → {nama}_clean.mp4
```

Generate SRT di [SublyAI](https://github.com/OverHzn/sublyai) (`outputs/<job_id>/subtitle_id.srt`), lalu import ke DubClean untuk finishing.

---

## Install (Windows) — pakai installer

Cara termudah, **tanpa Node.js**:

1. Build installer (sekali, dari source) — lihat [Build](#build-installer) di bawah
2. Double-click **`dist\DubClean Setup 1.0.0.exe`**
3. Install → buka **DubClean** dari Start Menu / desktop shortcut

Atau pakai **portable** (tanpa install):

```
dist\DubClean 1.0.0.exe
```

---

## Install & Run (dari source)

### Requirements

- Node.js 18+
- Windows atau Linux

### Development

```bash
git clone https://github.com/OverHzn/DubClean.git
cd DubClean
npm install
npm start
```

Kalau `npm start` error `EBUSY` (umum di folder OneDrive):

```bash
npm run start:direct
```

---

## Build installer

```bash
# Windows
npm run build:win

# atau double-click
build-app.bat
```

### Hasil build

| File | Kegunaan |
|------|----------|
| `dist\DubClean Setup 1.0.0.exe` | Installer NSIS (~99 MB) |
| `dist\DubClean 1.0.0.exe` | Portable, tanpa install |
| `dist\win-unpacked\DubClean.exe` | Versi unpacked |

Linux:

```bash
npm run build:linux    # AppImage
```

> Folder `dist/` tidak di-commit ke git — hasil build tetap lokal setelah `npm run build:win`.

---

## Struktur Project

```
DubClean/
├── src/
│   ├── main.js        # Electron main, IPC, ffmpeg render, ASS generator
│   ├── preload.js     # contextBridge API
│   ├── srtParser.js   # parser SRT
│   ├── index.html     # UI layout (sidebar tabs)
│   ├── style.css      # dark modern theme
│   └── renderer.js    # canvas editor, SRT, audio, preset, render
├── presets/           # preset JSON tersimpan
├── output/            # hasil render default ({nama}_clean.mp4)
├── build-app.bat      # rebuild installer Windows
├── package.json
├── PRD.md             # product requirements
├── PLAN.md            # technical plan
└── CLAUDE.md          # context untuk AI coding
```

---

## Cara Pakai

### Blur watermark

1. **Buka Video** — drag-drop atau file picker
2. Tab **Blur** → klik-drag di preview untuk gambar kotak di area watermark
3. Atur **Intensitas** (slider 1–50) — coba `25` untuk watermark kecil
4. (Opsional) **Mulai/Selesai** detik kalau watermark muncul-hilang
5. Bisa tambah lebih dari 1 box

### Subtitle

1. **Import SRT** di toolbar
2. Tab **Subtitle** → edit teks cue inline kalau perlu
3. Atur posisi, font size, warna, box opacity
4. **Render** → subtitle di-burn permanen ke video

### Audio

1. Tab **Audio** → **Import Audio**
2. Mode **Add** (video tanpa audio) atau **Replace** (ganti audio asli)
3. Atur volume, offset, trim/loop
4. **Render**

### Preset (series yang sama)

1. Atur blur + subtitle style (+ audio settings)
2. **Simpan** preset → file JSON
3. Video berikutnya → **Load** preset, ganti SRT (dan audio kalau perlu)

---

## Preset JSON

```json
{
  "preset_name": "drama_series_A",
  "blur_regions": [
    {
      "x": 1010, "y": 1210, "width": 150, "height": 90,
      "blur_intensity": 20,
      "time_range": { "start": 0, "end": null }
    }
  ],
  "subtitle_style": {
    "position": "bottom",
    "font_size": 42,
    "box_opacity": 0.6
  },
  "audio_settings": {
    "mode": "replace",
    "volume_percent": 100,
    "offset_seconds": 0,
    "fit_mode": "trim"
  }
}
```

> Path file audio **tidak** disimpan di preset — hanya `audio_settings`.

---

## Stack

- Electron + Vanilla JS + Canvas
- ffmpeg-static + fluent-ffmpeg
- Subtitle burn-in via ASS

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `npm start` → `EBUSY` | Tutup app Electron lain, atau `npm run start:direct` |
| Project di OneDrive | Pindah ke `C:\Dev\DubClean` kalau file sering terkunci |
| Render gagal | Pastikan video path valid, folder output ada, cek error di UI |
| Watermark masih kelihatan | Perbesar box atau naikkan intensitas blur |

## Roadmap (v1.1)

- Live preview blur/subtitle di player
- Audio mix (gabung audio asli + baru)
- VPS/headless CLI mode

## License

MIT — Owner: 0xHulk