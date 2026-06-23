# CLAUDE.md

Context file untuk Claude (Claude Code) saat bekerja di project ini.

## Tentang Project

**DubClean** — desktop app (Electron) untuk bersihin video hasil translate/repost (misal drama China → konten Indonesia). Tiga fungsi utama:

1. **Blur region** — user gambar kotak di atas preview video untuk nutup watermark/teks asli (China). Bisa lebih dari 1 box, intensitas blur adjustable, time range per box (muncul-hilang).
2. **Burn-in subtitle dari SRT** — import `.srt`, burn ke video dengan style box custom (background semi-transparent, font, warna, posisi) via file ASS.
3. **Add/Replace audio** — import audio lokal (mp3/wav/aac/m4a). Mode MVP: Add (video tanpa audio), Replace (ganti audio asli). Mix ditunda v1.1. Kontrol volume, offset, trim/loop.

Dijalankan **lokal di laptop/PC**. VPS/headless (Opsi B) **ditunda ke fase 2** — fokus MVP desktop app dulu.

Dokumen referensi:
- `PRD.md` — requirement & keputusan produk.
- `PLAN.md` — breakdown teknis, build order, render logic.

## Stack

- **Electron** — main + renderer, `contextIsolation` ON, preload bridge (jangan expose Node API ke renderer).
- **Vanilla JS + Canvas** — tanpa React/webpack.
- **ffmpeg-static + fluent-ffmpeg** — render dari main process saja.
- **ASS** — subtitle burn-in (generate dari SRT + style settings).

## Struktur File (Target)

```
DubClean/
├── package.json
├── PRD.md
├── PLAN.md
├── CLAUDE.md
├── presets/              # preset JSON (blur + subtitle style + audio settings)
├── output/               # default output folder
└── src/
    ├── main.js           # Electron main: window, IPC, ffmpeg render, ASS generator
    ├── preload.js        # contextBridge → window.api
    ├── srtParser.js      # parseSrt(content) — hanya di main process
    ├── index.html        # player + canvas kiri, panel kontrol kanan
    ├── style.css         # dark editorial theme
    └── renderer.js       # logic utama UI
```

## Status Saat Ini

**MVP scaffold selesai.** Semua file di `src/` sudah ada dan bisa dijalankan via `npm start`.

Belum dikerjakan: live preview overlay (v1.1), audio mix (v1.1), packaging `electron-builder`.

## Arsitektur Penting

- Semua filesystem/ffmpeg lewat **IPC main process**. Renderer tidak boleh `require('fs')` atau `require('fluent-ffmpeg')`.
- **SRT parsing:** `srtParser.js` di main process → renderer panggil `api.parseSrt(content)` via IPC. Jangan duplikasi parser di renderer.
- **Koordinat blur box:** simpan dalam resolusi video asli, bukan resolusi canvas tampilan. Scaling wajib saat gambar di canvas vs kirim ke render payload.
- **Preset JSON:** simpan `blur_regions` + `subtitle_style` + `audio_settings`. **Jangan** simpan path `audioFile` (beda tiap mesin).
- **MVP tidak punya live preview** blur/subtitle — canvas cuma outline box. Validasi lewat file output setelah render. Live preview masuk v1.1.
- Output render: `{basename}_clean.mp4`, video encode CRF 18.

## `renderer.js` — Yang Harus Diimplementasi

- Drag-drop / open video → `api.getVideoMeta()` (termasuk `hasAudio`)
- Canvas box editor: gambar/drag/resize/hapus, time range per box, koordinat video asli
- Import SRT → `api.openSrt()` → `api.parseSrt()` → list cue dengan **inline edit teks**
- Kontrol subtitle style → state `subtitleStyle`
- Import audio → `api.openAudio()`, mode add/replace, volume, offset, trim/loop → state `audioSettings`
- Render → kumpulkan payload → `api.startRender()` → `onRenderProgress` untuk progress bar
- Preset save/load → `api.savePreset()` / `api.loadPreset()`

## `main.js` — Yang Harus Diimplementasi

- IPC: `dialog:openVideo`, `openSrt`, `openAudio`, `chooseOutputFolder`, `savePreset`, `loadPreset`
- IPC: `srt:parse`, `video:getMeta` (return `hasAudio`), `render:start`
- Render: blur chain per box dengan `enable='between(t,...)'` untuk time range
- Render: ASS generator + subtitles filter
- Render: audio mapping add/replace (lihat `PLAN.md` section 4)
- Progress event: `render:progress`

## Konvensi & Aturan Kerja

- Jangan tambah dependency besar (React, webpack) kecuali user minta.
- Bahasa komentar/komunikasi: Bahasa Indonesia informal (gaya Massive / 0xHulk).
- User prefer **file lengkap siap pakai** — edit langsung di file, bukan snippet setengah-setengah.

## Testing

Belum ada automated test. Setelah scaffold:

1. `npm install && npm start`
2. Tes dengan video drama China (watermark) + file `.srt` terjemahan ID.
3. Tes video tanpa audio + import audio (mode Add).
4. Cek output `{nama}_clean.mp4`: watermark ke-blur, subtitle ID dengan style yang diatur, audio sesuai mode.