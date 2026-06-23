# PRD — DubClean
**Tool blur region + burn-in subtitle SRT + add/replace audio untuk konten short video (drama/reels)**

Versi: 1.0
Tanggal: 24 Juni 2026
Owner: 0xHulk

---

## 1. Latar Belakang

Konten short video hasil repost/translate (misal drama China → konten IG/TikTok Indonesia) biasanya punya beberapa masalah:

1. **Watermark/teks asli (China)** menempel permanen di video sumber → perlu di-**blur** supaya tidak terlihat.
2. **Subtitle terjemahan Indonesia** perlu di-**burn-in** ke video dengan style box yang rapi (background solid/semi-transparent + teks tebal), bukan subtitle default yang polos.
3. **Audio bermasalah/tidak ada** — kadang video sumber tidak ada audio sama sekali, atau audio asli mau diganti (mis. mau pakai voice over baru / BGM) → perlu cara cepat **add/replace audio** tanpa buka editor lain.

Saat ini proses ini dilakukan manual pakai video editor (CapCut/Premiere) satu-satu per video → lambat untuk produksi konten skala banyak akun/banyak video per hari.

**Tujuan tool:** otomatisasi proses-proses ini jadi satu pipeline: drop video lokal → atur area blur (untuk nutup watermark/teks asli) → load file SRT (subtitle Indonesia) → (opsional) tambah/ganti audio → render → output video bersih, siap upload.

---

## 2. Referensi Visual (dari contoh)

| Elemen | Warna marker | Maksud |
|---|---|---|
| Kotak oranye kecil (kanan, dekat watermark "丞砚") | 🟧 | Area yang harus di-**blur** untuk nutup teks/watermark asli bahasa China |
| Kotak hijau besar (bawah, area subtitle) | 🟩 | Area tempat **subtitle Indonesia** di-burn dengan style box (background gelap + teks putih outline) |

Tool harus bisa replikasi dua region ini secara manual-adjustable, bukan hardcode posisi (karena tiap video sumber posisi watermark/subtitle bisa beda).

---

## 3. Target User

- Solo content creator / small team yang produksi video terjemahan drama China → ID dalam jumlah banyak per hari.
- User teknikal (familiar command line / sudah biasa pakai tools custom Node.js/Python), jadi UI boleh sederhana (desktop app), prioritas: **cepat dipakai berulang, bukan cantik**.

---

## 4. Scope

### 4.1 In-Scope (MVP v1.0)

1. **Input video lokal**
   - Drag & drop atau file picker, format: mp4, mov, mkv.
   - Preview video di player dengan scrubber timeline.

2. **Blur Region Tool (untuk nutup watermark/teks China)**
   - User bisa **gambar kotak (bounding box)** langsung di atas preview video (klik-drag, resize handle di 4 pojok + sisi).
   - Bisa tambah **lebih dari 1 box blur** (kadang watermark ada di 2 titik berbeda — misal pojok kanan + judul kiri).
   - Tiap box punya:
     - Posisi (x, y, width, height) — bisa input manual angka atau drag visual.
     - Intensitas blur (slider, mis. 0–50 → mapping ke `boxblur` ffmpeg).
     - Time range: apakah blur berlaku **sepanjang video** (default) atau hanya rentang waktu tertentu (start–end, untuk watermark yang muncul-hilang).
   - Di MVP: canvas menampilkan **outline box** (bukan live blur preview). Hasil blur divalidasi lewat file output setelah render.

3. **Subtitle Tool (burn-in SRT)**
   - User import file `.srt`.
   - Tool parse SRT → tampilkan list cue subtitle (timestamp + teks) yang bisa **diedit ringan** (typo fix inline) sebelum render.
   - Style subtitle bisa diatur:
     - Posisi vertikal (atas/bawah/custom Y) & area lebar (mirip box hijau di referensi).
     - Background box (warna + opacity, mis. hitam 60%).
     - Font **Arial Bold** (default MVP, safe untuk mobile).
     - Ukuran, warna teks, outline/stroke.
     - Max baris per cue & auto line-wrap.
   - Di MVP: tidak ada preview subtitle real-time di player — validasi lewat hasil render.

4. **Render / Export**
   - Render final pakai **ffmpeg** (filter `boxblur` per region + hardsub via `subtitles` filter dengan file ASS yang di-generate dari setting user).
   - Output: mp4 H.264 + AAC.
   - Kualitas default: **CRF 18** (mendekati source). Opsi bitrate manual bisa ditambah di v1.1.
   - Progress bar render (% selesai; estimasi waktu masuk v1.1).
   - Output disimpan ke folder lokal pilihan user, naming otomatis: `{nama_asli}_clean.mp4`.

5. **Project/Preset**
   - Simpan preset blur-region + subtitle-style + audio-settings sebagai template (karena tiap "series"/akun biasanya watermark di posisi sama tiap episode) → next video tinggal load preset, tinggal ganti SRT-nya (dan pilih file audio baru kalau perlu).
   - Preset **tidak** menyimpan path file audio (path beda tiap mesin/session) — hanya `audio_settings` (mode, volume, offset, fit_mode).

6. **Tambah/Ganti Audio Manual**
   - Jika video sumber tidak ada audio (atau audio bawaan mau diganti), user bisa **import file audio lokal** (mp3/wav/aac/m4a) untuk dipasang ke video.
   - Mode MVP:
     - **Add** — video tidak ada track audio → audio baru jadi track utama.
     - **Replace** — video punya audio asli tapi mau diganti total.
   - Kontrol dasar:
     - Volume audio baru (0–200%).
     - Offset/delay mulai audio (detik).
     - Jika durasi audio ≠ durasi video → **trim** (potong sesuai video) atau **loop** (ulang sampai video selesai).
   - Di MVP: tidak ada preview sinkron video+audio di player — validasi lewat hasil render.

### 4.2 Out-of-Scope (MVP v1.0)

- Transkripsi otomatis (Whisper) — asumsi SRT sudah ada (dari pipeline translate: faster-whisper → LLM → srt).
- Auto-detect watermark posisi (AI object detection) — manual box dulu.
- Batch processing banyak video sekaligus (v2).
- Upload otomatis ke platform (TikTok/FB/IG).
- VPS/headless CLI mode (Opsi B, fase 2 — lihat section 8).
- Live preview blur/subtitle overlay di player (v1.1).
- Audio **Mix** (gabung audio asli + baru dengan volume terpisah) — v1.1.
- Bitrate manual / GPU encode (`h264_nvenc`) — v1.1.

### 4.3 Planned (v1.1)

- Live preview gabungan (CSS blur overlay + subtitle overlay sinkron timeline).
- Preview audio baru sinkron dengan video player.
- Mode audio **Mix** (`amix` filter).
- Estimasi waktu sisa render.
- Opsi bitrate manual & GPU encode jika tersedia.

---

## 5. User Flow (MVP v1.0)

```
1. Buka app → drop/pilih file video lokal
2. (Opsional) Load preset blur-region + subtitle-style yang sudah disimpan
3. Gambar/atur box blur di atas preview (1 atau lebih) → atur intensitas & time range
4. Import file .srt → edit typo di list cue kalau perlu
5. Atur style subtitle (posisi, box, font, warna)
6. (Opsional) Import audio baru → atur mode Add/Replace, volume, offset, trim/loop
7. Pilih folder output → klik "Render"
8. Progress bar render via ffmpeg
9. Output video bersih tersimpan ({nama_asli}_clean.mp4) → cek hasil, siap upload
10. (Opsional) Simpan preset untuk video selanjutnya dari series yang sama
```

---

## 6. Functional Requirements

| ID | Requirement | MVP |
|---|---|---|
| FR-1 | Sistem dapat menerima input video lokal (mp4/mov/mkv) via drag-drop atau file dialog | v1.0 |
| FR-2 | Sistem menampilkan video player dengan scrubber & frame preview akurat | v1.0 |
| FR-3 | User dapat menggambar 1+ bounding box di atas frame video sebagai area blur | v1.0 |
| FR-4 | User dapat mengubah ukuran & posisi box secara visual (drag/resize) maupun input numerik | v1.0 |
| FR-5 | User dapat mengatur intensitas blur per box | v1.0 |
| FR-6 | User dapat mengatur time range aktif untuk tiap box blur (default: full duration) | v1.0 |
| FR-7 | Sistem dapat import file `.srt` dan parse jadi list cue (index, start, end, text) | v1.0 |
| FR-8 | User dapat mengedit teks subtitle dari list cue sebelum render | v1.0 |
| FR-9 | User dapat mengatur style subtitle: posisi, ukuran box, warna background, opacity, font, ukuran font, warna teks, outline | v1.0 |
| FR-10 | Sistem menampilkan preview gabungan (video + blur + subtitle) secara real-time saat scrub | v1.1 |
| FR-11 | Sistem dapat me-render output final via ffmpeg sesuai semua setting di atas | v1.0 |
| FR-12 | Sistem menampilkan progress render (% selesai) | v1.0 |
| FR-13 | User dapat menyimpan & memuat preset (blur regions + subtitle style + audio settings) sebagai file JSON | v1.0 |
| FR-14 | Output file disimpan otomatis ke folder lokal (`{nama_asli}_clean.mp4`) | v1.0 |
| FR-15 | User dapat import file audio lokal (mp3/wav/aac/m4a) untuk ditambahkan/mengganti audio video | v1.0 |
| FR-16 | Sistem dapat mendeteksi apakah video sumber punya track audio, dan menyesuaikan UI (mode Add vs Replace) | v1.0 |
| FR-17 | User dapat atur volume, offset/delay, dan mode trim/loop untuk audio baru | v1.0 |

---

## 7. Non-Functional Requirements

- **Performance:** render 1 video durasi ~1 menit target ≤ 2× durasi video (tergantung hardware, CPU encode default).
- **Reliability:** jika render gagal, tampilkan error message jelas (bukan crash silent).
- **Portability (MVP):** desktop app Electron di Windows/Linux laptop/PC. VPS headless mode masuk fase 2 (Opsi B).
- **Offline-first:** semua proses lokal, tidak butuh API eksternal. ffmpeg dibundle via `ffmpeg-static`.

---

## 8. Arsitektur Teknis

### Fase 1 — Desktop App (MVP, **dipilih**)

- **Electron** — main + renderer process, `contextIsolation` ON, preload bridge.
- **Vanilla JS + Canvas** — UI sederhana, tanpa React/webpack.
- **ffmpeg-static + fluent-ffmpeg** — render dari main process via IPC.
- **SRT parser** — custom `srtParser.js`, dipanggil dari main process, hasil parse dikirim ke renderer via IPC.
- **Subtitle burn-in** — generate file `.ass` sementara dari SRT + style settings.

### Fase 2 — CLI/Headless (Opsi B, **ditunda**)

- Input: video + preset JSON + SRT (+ audio opsional).
- Tidak ada UI, langsung jalankan ffmpeg command dari preset.
- Cocok untuk batch/automation di VPS setelah preset sudah fix dari desktop app.

> Bangun **Fase 1 dulu**. Preset JSON yang dihasilkan desktop app harus reusable untuk Fase 2 nanti.

### Contoh konsep render command (ffmpeg, ilustrasi):

```bash
ffmpeg -i input.mp4 \
  -filter_complex "
    [0:v]crop=W:H:X:Y,boxblur=10:5[blurred];
    [0:v][blurred]overlay=X:Y:enable='between(t,START,END)'[bg];
    [bg]subtitles=subs.ass[outv]
  " \
  -map "[outv]" -map 0:a? -c:v libx264 -crf 18 -c:a aac output_clean.mp4
```

---

## 9. Data Model (Preset JSON)

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
    "box_color": "#000000",
    "box_opacity": 0.6,
    "font": "Arial Bold",
    "font_size": 42,
    "text_color": "#FFFFFF",
    "outline_color": "#000000",
    "outline_width": 2,
    "margin_bottom": 120,
    "max_width_percent": 80
  },
  "audio_settings": {
    "mode": "replace",
    "volume_percent": 100,
    "offset_seconds": 0,
    "fit_mode": "trim"
  }
}
```

> `audio_settings` opsional — `null` kalau pakai audio asli video apa adanya. `mode`: `"add"` atau `"replace"` di v1.0; `"mix"` di v1.1. Path file audio **tidak** disimpan di preset.

---

## 10. Metrics Sukses

- Waktu proses 1 video dari drop sampai output bersih turun dari ~5–10 menit (manual editor) jadi **< 2 menit** (pakai preset).
- Preset bisa dipakai ulang untuk seluruh episode 1 series tanpa perlu atur ulang box tiap video.
- Output video tidak ada lagi watermark/teks China yang terlihat & subtitle Indonesia terbaca jelas dengan style konsisten.

---

## 11. Keputusan Produk (Locked)

| Topik | Keputusan |
|---|---|
| Nama project | **DubClean** (folder & package name) |
| Platform MVP | **Electron desktop** lokal di laptop/PC |
| Frontend stack | **Vanilla JS + Canvas** (bukan React) |
| Subtitle format output | **Hardsub** (subtitle nempel di video, bukan softsub terpisah) |
| Batch processing | **1-by-1** di MVP |
| Live preview blur/subtitle | **v1.1** — MVP render-only, canvas cuma outline box |
| Audio Mix | **v1.1** — MVP cuma Add & Replace |
| Font subtitle default | **Arial Bold** |
| VPS/headless | **Fase 2** — diabaikan sampai desktop app jalan |

---

## 12. Status & Next Step

**Status saat ini:** MVP scaffold selesai — `package.json`, `src/*`, `presets/`, `output/` sudah ada. Jalankan: `npm install && npm start`.

**Next step:**
1. Test end-to-end dengan video drama China + SRT + (opsional) audio
2. Fix bug dari hasil test nyata
3. Packaging via `electron-builder` (`npm run build:win`)
4. v1.1: live preview overlay, audio mix, estimasi waktu render