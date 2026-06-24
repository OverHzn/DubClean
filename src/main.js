const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Simpan cache/userData di luar OneDrive — hindari EBUSY & "Access denied" di folder sync
app.setPath('userData', path.join(os.homedir(), 'AppData', 'Local', 'DubClean'));
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { parseSrt } = require('./srtParser');

ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'DubClean',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Dialog handlers ──────────────────────────────────────────────

ipcMain.handle('dialog:openVideo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih Video',
    properties: ['openFile'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:openSrt', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih File SRT',
    properties: ['openFile'],
    filters: [{ name: 'Subtitle', extensions: ['srt'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { path: filePath, content };
});

ipcMain.handle('dialog:openAudio', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih File Audio',
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:chooseOutputFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih Folder Output',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: path.join(app.getAppPath(), 'output'),
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:savePreset', async (_event, presetData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Simpan Preset',
    defaultPath: path.join(app.getAppPath(), 'presets', 'preset.json'),
    filters: [{ name: 'Preset JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, JSON.stringify(presetData, null, 2), 'utf-8');
  return result.filePath;
});

ipcMain.handle('dialog:loadPreset', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Preset',
    properties: ['openFile'],
    defaultPath: path.join(app.getAppPath(), 'presets'),
    filters: [{ name: 'Preset JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const content = fs.readFileSync(result.filePaths[0], 'utf-8');
  return JSON.parse(content);
});

// ── SRT parse ────────────────────────────────────────────────────

ipcMain.handle('srt:parse', (_event, content) => parseSrt(content));

// ── Video metadata ───────────────────────────────────────────────

ipcMain.handle('video:getMeta', (_event, videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err.message || String(err));
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
      resolve({
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        duration: metadata.format?.duration || 0,
        hasAudio,
      });
    });
  });
});

// ── ASS generator ────────────────────────────────────────────────

function hexToAssColor(hex, opacity = 1) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.round((1 - opacity) * 255);
  const pad = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `&H${pad(a)}${pad(b)}${pad(g)}${pad(r)}`;
}

function secondsToAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function generateAss(cues, style, videoMeta) {
  const s = style || {};
  const font = s.font || 'Arial';
  const fontSize = s.font_size || 42;
  const primary = hexToAssColor(s.text_color || '#FFFFFF');
  const outline = hexToAssColor(s.outline_color || '#000000');
  const back = hexToAssColor(s.box_color || '#000000', s.box_opacity ?? 0.6);
  const outlineWidth = s.outline_width ?? 2;
  const marginV = s.margin_bottom ?? 120;
  const marginL = 40;
  const marginR = 40;

  let alignment = 2; // bottom center
  if (s.position === 'top') alignment = 8;
  else if (s.position === 'center') alignment = 5;

  const playResX = videoMeta?.width || 1080;
  const playResY = videoMeta?.height || 1920;

  const header = `[Script Info]
Title: DubClean
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${fontSize},${primary},&H000000FF,${outline},${back},-1,0,0,0,100,100,0,0,3,${outlineWidth},0,${alignment},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = (cues || []).map((cue) => {
    const start = secondsToAssTime(cue.start);
    const end = secondsToAssTime(cue.end);
    const text = (cue.text || '').replace(/\n/g, '\\N');
    let prefix = '';
    if (s.position === 'custom' && s.custom_y != null) {
      const x = Math.round(playResX / 2);
      const y = Math.round(s.custom_y);
      prefix = `{\\pos(${x},${y})}`;
    }
    const maxW = s.max_width_percent ?? 80;
    if (maxW < 100) {
      prefix += `{\\q2}`;
    }
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${prefix}${text}`;
  });

  return header + lines.join('\n') + '\n';
}

// ── FFmpeg filter builders ───────────────────────────────────────

function buildBlurChain(blurRegions) {
  if (!blurRegions || blurRegions.length === 0) {
    return { filter: null, lastLabel: '0:v' };
  }

  const parts = [];
  let current = '0:v';

  blurRegions.forEach((region, i) => {
    const { x, y, width, height, blur_intensity, time_range } = region;
    const intensity = Math.max(1, blur_intensity || 20);
    const ratio = Math.max(1, Math.round(intensity / 2));
    const blurLabel = `blur${i}`;
    const outLabel = `v${i}`;

    parts.push(
      `[${current}]crop=${width}:${height}:${x}:${y},boxblur=${intensity}:${ratio}[${blurLabel}]`
    );

    let overlay = `[${current}][${blurLabel}]overlay=${x}:${y}`;
    if (time_range && time_range.end != null && time_range.end !== '') {
      const start = time_range.start || 0;
      const end = time_range.end;
      overlay += `:enable='between(t\\,${start}\\,${end})'`;
    }
    overlay += `[${outLabel}]`;
    parts.push(overlay);
    current = outLabel;
  });

  return { filter: parts.join(';'), lastLabel: current };
}

function escapeFfmpegPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function buildFullFilter(blurRegions, assPath, hasCues) {
  const { filter: blurFilter, lastLabel } = buildBlurChain(blurRegions);
  const escapedAss = escapeFfmpegPath(assPath);

  let chain = blurFilter;
  let videoOut = lastLabel;

  if (hasCues) {
    const subPart = `[${lastLabel}]subtitles='${escapedAss}'[outv]`;
    chain = chain ? `${chain};${subPart}` : subPart;
    videoOut = 'outv';
  } else if (blurFilter) {
    chain = `${chain};[${lastLabel}]null[outv]`;
    videoOut = 'outv';
  }

  return { filterComplex: chain, videoOut };
}

// ── Render ───────────────────────────────────────────────────────

ipcMain.handle('render:start', async (event, payload) => {
  const {
    videoPath,
    outputFolder,
    blurRegions,
    cues,
    subtitleStyle,
    videoMeta,
    audioFile,
    audioSettings,
  } = payload;

  const outDir = outputFolder || path.join(app.getAppPath(), 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const base = path.basename(videoPath, path.extname(videoPath));
  const outPath = path.join(outDir, `${base}_clean.mp4`);

  const assPath = path.join(os.tmpdir(), `dubclean_${Date.now()}.ass`);
  const hasCues = cues && cues.length > 0;

  if (hasCues) {
    fs.writeFileSync(assPath, generateAss(cues, subtitleStyle, videoMeta), 'utf-8');
  }

  const { filterComplex, videoOut } = buildFullFilter(blurRegions, assPath, hasCues);
  const useComplex = filterComplex && (blurRegions?.length > 0 || hasCues);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath);

    const hasNewAudio = audioFile && audioSettings;
    if (hasNewAudio) {
      const inputOpts = [];
      if (audioSettings.fit_mode === 'loop') {
        inputOpts.push('-stream_loop', '-1');
      }
      const offset = audioSettings.offset_seconds || 0;
      if (offset > 0) {
        inputOpts.push('-itsoffset', String(offset));
      }
      cmd.input(audioFile);
      if (inputOpts.length) cmd.inputOptions(inputOpts);
    }

    if (useComplex) {
      cmd.complexFilter(filterComplex);
    }

    const outputOpts = [];

    if (useComplex) {
      outputOpts.push('-map', `[${videoOut}]`);
    } else {
      outputOpts.push('-map', '0:v');
    }

    if (hasNewAudio) {
      outputOpts.push('-map', '1:a');
      const vol = (audioSettings.volume_percent || 100) / 100;
      outputOpts.push('-af', `volume=${vol}`);
      outputOpts.push('-c:a', 'aac');
      if (audioSettings.fit_mode === 'trim' || audioSettings.fit_mode === 'loop') {
        outputOpts.push('-shortest');
      }
    } else {
      outputOpts.push('-map', '0:a?');
      outputOpts.push('-c:a', 'aac');
    }

    outputOpts.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium');
    outputOpts.push('-y');

    cmd.outputOptions(outputOpts).output(outPath);

    cmd.on('progress', (progress) => {
      const pct = progress.percent ? Math.min(100, Math.round(progress.percent)) : 0;
      event.sender.send('render:progress', { percent: pct, timemark: progress.timemark });
    });

    cmd.on('end', () => {
      if (hasCues && fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch (_) { /* ignore */ }
      }
      resolve({ success: true, outputPath: outPath });
    });

    cmd.on('error', (err) => {
      if (hasCues && fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch (_) { /* ignore */ }
      }
      reject(err.message || String(err));
    });

    cmd.run();
  });
});