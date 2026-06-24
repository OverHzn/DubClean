## DubClean v1.1.0

Preview render sebelum export penuh — subtitle, blur, dan outline sekarang konsisten di semua resolusi video.

### Baru

- **Preview Hasil** — render cuplikan ~8–10 detik dari posisi playhead (pipeline FFmpeg sama dengan export penuh)
- **Validasi sebelum render** — tombol *Render Video* aktif hanya setelah preview berhasil; perubahan SRT/blur/style menandai preview kedaluwarsa
- **Koordinat ternormalisasi** — blur & subtitle dihitung dari resolusi video asli, bukan ukuran canvas preview
- **Toggle Tampilkan Area Blur** — overlay blur bisa disembunyikan di editor
- **Subtitle dinamis** — font size, safe margin, max width, dan stroke menyesuaikan vertical / horizontal / square otomatis

### Perbaikan

- Subtitle tidak bergeser setelah export (posisi, outline, safe area)
- Blur box preview = hasil render final
- Outline subtitle tidak ter-clip di frame video
- Dukungan multi-resolusi: 480×854, 720×1280, 1080×1920, 1280×720, 1920×1080, 1080×1080, dan aspect ratio custom
- Shared render config (`renderMath.js` + `renderConfig.js`) untuk preview dan export
- Debug log render config + perintah FFmpeg di console

### Download

| File | Untuk |
|------|-------|
| `DubClean Setup 1.1.0.exe` | Windows — installer (disarankan) |
| `DubClean 1.1.0.exe` | Windows — portable, tanpa install |

### Install cepat (Windows)

1. Download **Setup** atau **Portable** di atas
2. Kalau SmartScreen muncul → **More info** → **Run anyway**
3. Buka app → atur blur/SRT → **Preview Hasil** → cek hasil → **Render Video**

Panduan lengkap: [README — Panduan Install](https://github.com/OverHzn/DubClean#panduan-install)