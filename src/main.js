const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

app.setPath('userData', path.join(os.homedir(), 'AppData', 'Local', 'DubClean'));
const ffmpeg = require('fluent-ffmpeg');
const { parseSrt } = require('./srtParser');
const { version: appVersion } = require('../package.json');
const {
  generateAss,
  buildFullFilter,
  logRenderConfig,
  prepareRenderPayload,
} = require('./renderConfig');

function resolveBundledBinary(binaryPath) {
  if (!binaryPath) return null;
  if (binaryPath.includes('app.asar')) {
    return binaryPath.replace('app.asar', 'app.asar.unpacked');
  }
  return binaryPath;
}

const ffmpegPath = resolveBundledBinary(require('ffmpeg-static'));
if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  console.error('ffmpeg binary tidak ditemukan:', ffmpegPath);
} else {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

function getDefaultOutputDir() {
  return path.join(app.getPath('documents'), 'DubClean', 'output');
}

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
    defaultPath: getDefaultOutputDir(),
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

// ── Video metadata & preview src ─────────────────────────────────

function probeVideoMeta(videoPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(new Error('ffmpeg tidak tersedia — coba install ulang aplikasi'));
    }

    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', videoPath], { windowsHide: true });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => reject(err.message || String(err)));

    proc.on('close', () => {
      const dimMatch =
        stderr.match(/yuv\d+p(?:\([^)]*\))?,\s*(\d{2,5})x(\d{2,5})/) ||
        stderr.match(/Stream #\d+:\d+[^\n]*?(\d{2,5})x(\d{2,5})/);
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)[.,](\d+)/);
      const hasAudio = /Audio:/.test(stderr);

      if (!dimMatch && !durMatch) {
        return reject(new Error('Gagal membaca metadata video'));
      }

      let duration = 0;
      if (durMatch) {
        duration =
          parseInt(durMatch[1], 10) * 3600 +
          parseInt(durMatch[2], 10) * 60 +
          parseInt(durMatch[3], 10) +
          parseInt(durMatch[4], 10) / 100;
      }

      const width = dimMatch ? parseInt(dimMatch[1], 10) : 0;
      const height = dimMatch ? parseInt(dimMatch[2], 10) : 0;

      resolve({
        width,
        height,
        duration,
        hasAudio,
        aspectRatio: width && height ? width / height : 0,
      });
    });
  });
}

ipcMain.handle('video:getMeta', (_event, videoPath) => probeVideoMeta(videoPath));

ipcMain.handle('video:getSrc', (_event, videoPath) => pathToFileURL(videoPath).href);

ipcMain.handle('app:getVersion', () => appVersion);

// ── Shared render pipeline ───────────────────────────────────────

function runFfmpegRender(event, payload, options = {}) {
  const {
    videoPath,
    outputFolder,
    audioFile,
    audioSettings,
    previewRange,
  } = payload;

  const mode = options.mode || 'full';
  const isPreview = mode === 'preview';

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error('ffmpeg tidak ditemukan — coba install ulang aplikasi');
  }

  const { config, cues, blurRegions } = prepareRenderPayload(payload, {
    mode,
    previewRange,
  });

  const outDir = outputFolder || getDefaultOutputDir();
  if (!isPreview && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const base = path.basename(videoPath, path.extname(videoPath));
  const outPath = isPreview
    ? path.join(os.tmpdir(), `dubclean_preview_${Date.now()}.mp4`)
    : path.join(outDir, `${base}_clean.mp4`);

  const assPath = path.join(os.tmpdir(), `dubclean_${Date.now()}.ass`);
  const hasCues = cues && cues.length > 0;

  if (hasCues) {
    fs.writeFileSync(assPath, generateAss(cues, config), 'utf-8');
  }

  const { filterComplex, videoOut } = buildFullFilter(config, assPath, hasCues);
  const useComplex = filterComplex && (blurRegions?.length > 0 || hasCues);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(videoPath);

    if (isPreview && previewRange) {
      cmd.inputOptions(['-ss', String(previewRange.start)]);
      cmd.duration(previewRange.duration);
    }

    const hasNewAudio = !isPreview && audioFile && audioSettings;
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
    } else if (!isPreview) {
      outputOpts.push('-map', '0:a?');
      outputOpts.push('-c:a', 'aac');
    } else {
      outputOpts.push('-map', '0:a?');
      outputOpts.push('-c:a', 'aac');
      outputOpts.push('-shortest');
    }

    outputOpts.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p');
    outputOpts.push('-movflags', '+faststart');
    outputOpts.push('-y');

    cmd.outputOptions(outputOpts).output(outPath);

    let ffmpegCommand = '';
    cmd.on('start', (commandLine) => {
      ffmpegCommand = commandLine;
      logRenderConfig(config, mode, {
        previewRange: isPreview ? previewRange : null,
        ffmpegCommand: commandLine,
      });
    });

    cmd.on('progress', (progress) => {
      const pct = progress.percent ? Math.min(100, Math.round(progress.percent)) : 0;
      event.sender.send('render:progress', {
        percent: pct,
        timemark: progress.timemark,
        mode,
      });
    });

    cmd.on('end', () => {
      if (hasCues && fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch (_) { /* ignore */ }
      }
      resolve({
        success: true,
        outputPath: outPath,
        previewSrc: pathToFileURL(outPath).href,
        mode,
      });
    });

    cmd.on('error', (err, _stdout, stderr) => {
      if (hasCues && fs.existsSync(assPath)) {
        try { fs.unlinkSync(assPath); } catch (_) { /* ignore */ }
      }
      const detail = stderr?.trim() || err.message || String(err);
      reject(detail.split('\n').slice(-3).join(' ') || 'Render gagal');
    });

    cmd.run();
  });
}

ipcMain.handle('render:start', (event, payload) =>
  runFfmpegRender(event, payload, { mode: 'full' })
);

ipcMain.handle('render:preview', (event, payload) =>
  runFfmpegRender(event, payload, { mode: 'preview' })
);