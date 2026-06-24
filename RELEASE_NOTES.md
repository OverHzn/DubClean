## DubClean v1.0.1

Update playback preview, keyboard controls, dan perbaikan render pipeline.

### Baru

- **Transport bar** — seek bar, waktu putar/jeda, indikator status play/pause
- **Keyboard shortcuts** — `Space` putar/jeda, `E` toggle mode edit blur box (pisah dari playback)
- **Player 16:9** — layout preview aspect ratio benar, fullscreen (`F` / double-click)

### Perbaikan

- Video preview jalan di path Windows yang ada spasi (via IPC `pathToFileURL`)
- Render blur pakai filter `gblur` yang benar
- ffmpeg path di app ter-package (asar.unpacked) — render jalan dari installer/portable
- Output folder writable (default `Documents/DubClean/output/`)
- Metadata video di-probe lewat ffmpeg bundled (tanpa ffprobe terpisah)
- Interaksi blur box lebih stabil saat drag/resize

### Download

| File | Untuk |
|------|-------|
| `DubClean Setup 1.0.1.exe` | Windows — installer (disarankan) |
| `DubClean 1.0.1.exe` | Windows — portable, tanpa install |

### Install cepat (Windows)

1. Download **Setup** atau **Portable** di atas
2. Kalau SmartScreen muncul → **More info** → **Run anyway**
3. Buka app → drag-drop video → `Space` preview → `E` mode edit → atur blur/SRT → **Render**

Panduan lengkap: [README — Panduan Install](https://github.com/OverHzn/DubClean#panduan-install)