# DubClean

Desktop app (Electron) untuk membersihkan video hasil translate/repost — blur watermark, burn-in subtitle SRT, dan add/replace audio. Dibangun untuk produksi konten short video (drama China → Indonesia) secara lokal di laptop/PC.

## Fitur

- **Blur region** — gambar kotak di preview untuk nutup watermark/teks asli (multi-box, intensitas adjustable, time range)
- **Burn-in subtitle** — import `.srt`, render dengan style box custom via ASS (font, warna, posisi, opacity)
- **Add / Replace audio** — pasang audio baru (mp3/wav/aac/m4a) dengan kontrol volume, offset, trim/loop
- **Preset** — simpan/load template blur + subtitle style untuk series yang sama
- **Render lokal** — output `{nama}_clean.mp4` via ffmpeg (CRF 18)

## Screenshot Workflow

```
Buka video → gambar blur box → import SRT → atur style → (opsional) audio → Render
```

## Requirements

- Node.js 18+
- Windows atau Linux
- ffmpeg dibundle otomatis via `ffmpeg-static` (tidak perlu install manual)

## Install & Run

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

## Build

```bash
npm run build:win    # Windows installer
npm run build:linux  # Linux AppImage
```

## Struktur Project

```
DubClean/
├── src/
│   ├── main.js        # Electron main, IPC, ffmpeg render
│   ├── preload.js     # contextBridge API
│   ├── srtParser.js   # parser SRT
│   ├── index.html     # UI layout
│   ├── style.css      # styles
│   └── renderer.js    # UI logic, canvas editor
├── presets/           # preset JSON tersimpan
├── output/            # hasil render default
├── PRD.md             # product requirements
├── PLAN.md            # technical plan
└── CLAUDE.md          # context untuk AI coding
```

## Cara Pakai — Blur Watermark

1. Buka video (drag-drop atau **Buka Video**)
2. Di tab **Blur**, klik-drag di preview untuk gambar kotak di area watermark
3. Atur **Intensitas** (slider, 1–50) — coba `25` untuk watermark kecil
4. (Opsional) Set **Mulai/Selesai** detik kalau watermark muncul-hilang
5. Bisa tambah lebih dari 1 box

## Cara Pakai — Subtitle

1. Klik **Import SRT** di toolbar
2. Tab **Subtitle** → edit teks cue kalau perlu
3. Atur posisi, font size, warna, box opacity
4. Render → subtitle di-burn permanen ke video

## Cara Pakai — Audio

1. Tab **Audio** → **Import Audio**
2. Pilih mode **Add** (video tanpa audio) atau **Replace** (ganti audio asli)
3. Atur volume, offset, trim/loop
4. Render

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

## Stack

- Electron + Vanilla JS + Canvas
- ffmpeg-static + fluent-ffmpeg
- Subtitle burn-in via ASS

## Roadmap (v1.1)

- Live preview blur/subtitle di player
- Audio mix (gabung audio asli + baru)
- VPS/headless CLI mode

## License

MIT — Owner: 0xHulk