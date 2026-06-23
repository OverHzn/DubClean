# PLAN.md — DubClean (Electron Desktop App)

Technical plan turunan dari `PRD.md`. Target: jalan lokal di laptop/PC, pakai Electron + vanilla JS + ffmpeg.

---

## 1. Struktur Project

```
DubClean/
├── package.json
├── PRD.md
├── PLAN.md
├── CLAUDE.md
├── presets/                  # folder default simpan preset .json
├── output/                   # folder default hasil render
└── src/
    ├── main.js               # Electron main process: window, dialog, ffmpeg render, IPC handlers
    ├── preload.js            # context bridge: expose api aman ke renderer
    ├── srtParser.js          # parser .srt -> array cue {index, start, end, text}
    ├── index.html            # layout UI: player + canvas overlay + panel kanan
    ├── style.css             # dark editorial style
    └── renderer.js           # logic UI: drag-drop, canvas box editor, srt, audio, render
```

### Status Saat Ini

| Item | Status |
|---|---|
| `PRD.md`, `PLAN.md`, `CLAUDE.md` | ✅ Ada |
| `package.json`, `src/*` | ✅ Scaffold selesai |
| `presets/`, `output/` | ✅ Ada |
| `renderer.js` | ✅ Implementasi MVP |
| Live preview overlay | ⏳ v1.1 |
| Audio Mix | ⏳ v1.1 |
| Packaging (`electron-builder`) | ⏳ Belum ditest |

---

## 2. Komponen & Tanggung Jawab

### 2.1 `main.js` (Main Process)

- Buka window Electron.
- IPC handlers:
  - `dialog:openVideo` → file picker video (mp4/mov/mkv), return path
  - `dialog:openSrt` → file picker + baca isi `.srt` sebagai string
  - `dialog:openAudio` → file picker audio (mp3/wav/aac/m4a)
  - `dialog:chooseOutputFolder` → pilih folder output
  - `dialog:savePreset` / `dialog:loadPreset` → simpan/baca preset JSON
  - `srt:parse` → terima string SRT, panggil `parseSrt()` di main, return array cues ke renderer
  - `video:getMeta` → ffprobe: width, height, duration, `hasAudio` (`streams.some(s => s.codec_type === 'audio')`)
  - `render:start` → bangun ffmpeg command (blur + subtitle ASS + audio mapping), kirim progress via `render:progress`
- Generate file `.ass` sementara di `os.tmpdir()` dari cues + subtitle style, hapus setelah render selesai.
- Output file: `{outputFolder}/{basename}_clean.mp4` (basename dari nama file video input, tanpa extension).

### 2.2 `preload.js`

- Expose `window.api` ke renderer (`contextIsolation` ON).
- Semua akses filesystem/ffmpeg lewat IPC — renderer tidak boleh `require('fs')` atau `require('fluent-ffmpeg')`.

API surface:
```js
window.api = {
  openVideo, openSrt, openAudio,
  chooseOutputFolder, savePreset, loadPreset,
  parseSrt,           // IPC ke srt:parse
  getVideoMeta,
  startRender,
  onRenderProgress,   // listener event
}
```

### 2.3 `srtParser.js`

- Pure function `parseSrt(content)` → `[{ index, start, end, text }]`.
- **Hanya di-require di main process.** Renderer akses lewat `api.parseSrt(content)` — tidak duplikasi logic.

### 2.4 `index.html` + `style.css`

Layout 2 kolom:
- **Kiri:** video player + canvas overlay (gambar box blur)
- **Kanan:** panel kontrol:
  - List blur boxes (+ time range per box)
  - List SRT cues (editable inline)
  - Subtitle style controls
  - Audio controls (mode Add/Replace, volume, offset, trim/loop)
  - Output folder picker
  - Tombol Render + progress bar

### 2.5 `renderer.js` — Implementasi UI

1. **Load video:** drag-drop ke `playerWrapper` atau klik `btnOpenVideo` → set `src` video element → `api.getVideoMeta()` untuk width/height/duration/hasAudio.
2. **Canvas box editor:**
   - State: `blurRegions = [{ x, y, width, height, blur_intensity, time_range }]` dalam **koordinat video asli**.
   - Scaling: `scaleX = videoMeta.width / canvas.width`, `scaleY = videoMeta.height / canvas.height`.
   - Mouse: mousedown (gambar box baru / pilih existing), mousemove (drag/resize), mouseup (commit).
   - Canvas render: outline rectangle + resize handles (4 pojok). **Tidak** live CSS blur di MVP.
   - Panel `#blurBoxList`: edit x/y/w/h/intensity manual, input time range start/end per box, tombol hapus.
3. **Import SRT:** `btnOpenSrt` → `api.openSrt()` → `api.parseSrt(content)` → state `cues` → tampilkan di `#srtList` dengan **inline edit teks** per cue (FR-8).
4. **Subtitle style:** baca input panel → object `subtitleStyle` (posisi, font Arial Bold, size, warna, box opacity, margin).
5. **Output folder:** `btnChooseOutput` → `api.chooseOutputFolder()` → tampil di `#outputInfo`.
6. **Audio:**
   - `btnOpenAudio` → `api.openAudio()` → state `audioFile` (path, tidak masuk preset).
   - Default mode dari `videoMeta.hasAudio`: `false` → `"add"`, `true` → `"replace"`.
   - Kontrol: dropdown mode (Add/Replace saja di v1.0), slider volume 0–200%, offset detik, fit mode trim/loop.
   - State `audioSettings` → ikut payload render & preset save.
7. **Render:** `btnRender` → payload lengkap → `api.startRender(payload)` → listen `onRenderProgress` → tampilkan path output saat selesai.
8. **Preset:** save `{ blurRegions, subtitleStyle, audioSettings }` via `api.savePreset()`. Load restore state + re-render canvas. **Tidak** restore `audioFile` path.

---

## 3. Video + Blur + Subtitle — Render Logic (ffmpeg)

Handler `render:start` di `main.js`.

**Payload:**
```js
{
  videoPath, outputFolder,
  blurRegions,   // koordinat resolusi asli
  cues,          // hasil parse + edit dari renderer
  subtitleStyle,
  videoMeta,
  audioFile,     // null = pakai audio asli / tanpa audio
  audioSettings  // null = tidak ganti audio
}
```

**Blur per region** (chain untuk tiap box):
```
[0:v]crop=W:H:X:Y,boxblur={intensity}:{intensity/2}[blurredN];
[prev][blurredN]overlay=X:Y:enable='between(t,START,END)'[stepN]
```
- Kalau `time_range.end` null → `enable` di-skip (blur aktif sepanjang video).
- Kalau `time_range.end` ada → `enable='between(t,{start},{end})'`.

**Subtitle:** generate `.ass` dari `cues` + `subtitleStyle` → filter `subtitles='{assPath}'` di akhir chain → output `[outv]`.

**Encode video:**
```
-c:v libx264 -crf 18 -preset medium
```

**Output naming:**
```js
const base = path.basename(videoPath, path.extname(videoPath));
const outPath = path.join(outputFolder, `${base}_clean.mp4`);
```

---

## 4. Audio Handling — Render Logic (ffmpeg)

**Input tambahan** (sudah termasuk di payload section 3):
```js
{
  audioFile: "/path/to/audio.mp3",  // null = tidak ada audio baru
  audioSettings: {
    mode: "add" | "replace",        // "mix" = v1.1
    volume_percent: 100,
    offset_seconds: 0,
    fit_mode: "trim" | "loop"
  }
}
```

**Logic:**

- `audioFile` null → `-map "[outv]" -map 0:a?` (audio asli kalau ada).
- `mode = "add"` atau `"replace"`:
  ```bash
  ffmpeg -i input.mp4 [-stream_loop -1] -i audio.mp3 \
    -filter_complex "...(blur+subtitle → [outv])..." \
    -map "[outv]" -map 1:a \
    -itsoffset {offset_seconds} \
    -af "volume={volume_percent/100}" \
    -c:v libx264 -crf 18 -c:a aac \
    -shortest
  ```
  - `fit_mode = "loop"` + audio lebih pendek → `-stream_loop -1` pada input audio.
  - `fit_mode = "trim"` → `-shortest` (default).
  - `mode = "replace"` → hanya map `1:a`, bukan `0:a`.
- `mode = "mix"` → **v1.1**, pakai `amix` filter.

---

## 5. Urutan Kerja (Build Order)

1. **Scaffold** — `package.json`, folder `src/`, `presets/`, `output/`, install dependencies.
2. **`main.js` + `preload.js` dasar** — window, dialog handlers, `video:getMeta`, `srt:parse`.
3. **`index.html` + `style.css`** — layout 2 kolom + semua panel kontrol.
4. **`renderer.js` — video load + canvas box editor** — validasi coordinate mapping video-asli vs canvas.
5. **Multi-box** — drag/resize/hapus + time range UI per box.
6. **Import SRT + inline edit cue** — list di panel, tanpa preview visual.
7. **Subtitle style controls** — state `subtitleStyle`.
8. **Render pipeline blur only** — tes ffmpeg end-to-end, cek output `{nama}_clean.mp4`.
9. **Tambah burn subtitle** — ASS generator + subtitles filter.
10. **Audio handling** — `dialog:openAudio`, panel audio, ffmpeg mapping (add + replace).
11. **Preset save/load** — blur + subtitle style + audio settings.
12. **Test end-to-end** — video drama China (watermark) + video tanpa audio.
13. **Packaging** — `npm run build:win` / `build:linux` via electron-builder.

### v1.1 (setelah MVP jalan)

14. Live preview overlay (CSS blur + subtitle di player).
15. Preview audio sinkron dengan video.
16. Mode audio Mix.
17. Estimasi waktu render + opsi bitrate/GPU encode.

---

## 6. Keputusan Teknis (Locked)

| Topik | Keputusan |
|---|---|
| SRT parsing | Main process only, expose `api.parseSrt()` via IPC |
| Live preview | v1.1 — MVP canvas cuma outline box, validasi lewat render |
| Audio Mix | v1.1 — MVP Add & Replace saja |
| Font subtitle | Arial Bold (system font, tidak perlu bundle) |
| Video quality | CRF 18 default |
| Preset audio path | Tidak disimpan — hanya `audio_settings` |
| Output naming | `{basename}_clean.mp4` |

### Masih Perlu dari User (bukan blocker scaffold)

- File video sample untuk validasi end-to-end (resolusi, posisi watermark referensi).

---

## 7. Dependencies

```bash
npm install
# devDependencies: electron, electron-builder
# dependencies: ffmpeg-static, fluent-ffmpeg
npm start   # jalankan app (setelah scaffold)
```

ffmpeg tidak perlu install manual — dibundle via `ffmpeg-static`.