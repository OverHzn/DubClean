// ── State ────────────────────────────────────────────────────────

const RM = window.RenderMath;

let videoPath = null;
let videoMeta = null;
let blurRegions = [];
let cues = [];
let audioFile = null;
let outputFolder = null;
let selectedBoxIndex = -1;
let editMode = false;
let isSeeking = false;
let showBlurOverlay = true;
let previewStatus = 'missing'; // missing | ready | outdated | rendering

const HANDLE_SIZE = 8;

// Canvas interaction
let isDrawing = false;
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let drawStart = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let boxAtDragStart = null;

// ── DOM refs ─────────────────────────────────────────────────────

const video = document.getElementById('videoPlayer');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const playerWrapper = document.getElementById('playerWrapper');
const playerStage = document.getElementById('playerStage');
const btnFullscreen = document.getElementById('btnFullscreen');
const videoInfo = document.getElementById('videoInfo');
const blurBoxList = document.getElementById('blurBoxList');
const srtInfo = document.getElementById('srtInfo');
const srtList = document.getElementById('srtList');
const outputInfo = document.getElementById('outputInfo');
const audioInfo = document.getElementById('audioInfo');
const btnRender = document.getElementById('btnRender');
const btnPreview = document.getElementById('btnPreview');
const previewWarning = document.getElementById('previewWarning');
const previewSection = document.getElementById('previewSection');
const previewPlayer = document.getElementById('previewPlayer');
const previewStatusText = document.getElementById('previewStatusText');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const renderResult = document.getElementById('renderResult');
const blurEmpty = document.getElementById('blurEmpty');
const srtEmpty = document.getElementById('srtEmpty');
const blurCount = document.getElementById('blurCount');
const canvasHint = document.getElementById('canvasHint');
const emptyState = document.getElementById('emptyState');
const transportBar = document.getElementById('transportBar');
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');
const seekBar = document.getElementById('seekBar');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const btnEditMode = document.getElementById('btnEditMode');
const editModeLabel = document.getElementById('editModeLabel');
const toggleShowBlur = document.getElementById('toggleShowBlur');
const previewStatusBadge = document.getElementById('previewStatusBadge');
const exportResInfo = document.getElementById('exportResInfo');
const exportPreviewDur = document.getElementById('exportPreviewDur');
const exportAspectInfo = document.getElementById('exportAspectInfo');
const renderLog = document.getElementById('renderLog');
const progressLabel = document.getElementById('progressLabel');

// ── Preview status ───────────────────────────────────────────────

function setPreviewStatus(status) {
  previewStatus = status;
  updateRenderButtons();
}

function markPreviewOutdated() {
  if (previewStatus === 'rendering') return;
  if (previewStatus === 'ready') {
    setPreviewStatus('outdated');
  } else if (previewStatus !== 'missing') {
    setPreviewStatus('outdated');
  }
}

function updateRenderButtons() {
  const hasVideo = !!videoPath && !!videoMeta;
  btnPreview.disabled = !hasVideo || previewStatus === 'rendering';

  const canRender = hasVideo && previewStatus === 'ready';
  btnRender.disabled = !canRender;

  previewWarning.classList.toggle('hidden', previewStatus === 'ready' || !hasVideo);

  const statusLabels = {
    missing: 'Belum ada preview. Klik Preview Hasil sebelum render final.',
    ready: 'Preview sesuai pengaturan saat ini. Lanjut ke Render Video Final.',
    outdated: 'Pengaturan berubah. Generate ulang preview.',
    rendering: 'Memproses preview FFmpeg...',
  };
  if (previewStatusText) {
    previewStatusText.textContent = statusLabels[previewStatus] || '';
  }

  const badgeLabels = {
    missing: 'belum ada',
    ready: 'siap',
    outdated: 'kedaluwarsa',
    rendering: 'memproses',
  };
  if (previewStatusBadge) {
    previewStatusBadge.textContent = badgeLabels[previewStatus] || '—';
    previewStatusBadge.className = `status-badge ${previewStatus}`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function setRenderResult(message, type = '') {
  if (!message) {
    renderResult.classList.add('hidden');
    renderResult.textContent = '';
    return;
  }
  renderResult.classList.remove('hidden');
  renderResult.textContent = message;
  renderResult.className = 'render-result';
  if (type) renderResult.classList.add(type);
}

function appendRenderLog(line) {
  if (!renderLog) return;
  const ts = new Date().toLocaleTimeString('id-ID', { hour12: false });
  renderLog.textContent += `[${ts}] ${line}\n`;
  renderLog.scrollTop = renderLog.scrollHeight;
}

function logRenderConfigSummary(config, mode) {
  if (!config) return;
  appendRenderLog(`── ${mode} ──`);
  appendRenderLog(`video ${config.videoWidth}×${config.videoHeight} · ${config.aspectClass} · AR ${config.aspectRatio.toFixed(3)}`);
  appendRenderLog(`subtitle ${config.subtitleFontSizePx}px · stroke ${config.subtitleStrokeWidthPx}px · margin btm ${config.subtitleBottomMargin}px`);
  appendRenderLog(`safe X=${config.subtitleSafeMarginX} · maxW=${config.subtitleMaxWidth}px`);
  if (config.blurEnabled) {
    config.blurRegions.forEach((b, i) => {
      appendRenderLog(`blur[${i}] ${(b.xPercent * 100).toFixed(1)}%,${(b.yPercent * 100).toFixed(1)}% → ${b.x},${b.y} ${b.width}×${b.height}px`);
    });
  }
}

function updateExportMeta(meta, previewDur = null) {
  if (!meta) {
    if (exportResInfo) exportResInfo.textContent = '—';
    if (exportAspectInfo) exportAspectInfo.textContent = '—';
    if (exportPreviewDur) exportPreviewDur.textContent = '—';
    return;
  }
  if (exportResInfo) exportResInfo.textContent = `${meta.width}×${meta.height}`;
  if (exportAspectInfo) {
    const cls = RM.classifyAspectRatio(meta.width, meta.height);
    exportAspectInfo.textContent = `${cls} (${(meta.width / meta.height).toFixed(2)})`;
  }
  if (exportPreviewDur && previewDur != null) {
    exportPreviewDur.textContent = `${previewDur.toFixed(1)}s`;
  }
}

function updateOutputPath(folder) {
  outputInfo.textContent = folder || 'Default: Documents/DubClean/output/';
}

function updateVideoMetaPills(name, meta) {
  if (!meta) {
    videoInfo.innerHTML = '<span class="meta-pill idle">Belum ada video</span>';
    return;
  }
  const dur = `${Math.floor(meta.duration / 60)}:${String(Math.floor(meta.duration % 60)).padStart(2, '0')}`;
  const arClass = RM.classifyAspectRatio(meta.width, meta.height);
  videoInfo.innerHTML = `
    <span class="meta-pill accent">${name}</span>
    <span class="meta-pill">${meta.width}×${meta.height}</span>
    <span class="meta-pill">${arClass}</span>
    <span class="meta-pill">${dur}</span>
    <span class="meta-pill ${meta.hasAudio ? 'success' : 'warn'}">${meta.hasAudio ? 'audio' : 'no audio'}</span>
  `;
  updateExportMeta(meta);
}

function updateBlurBadge() {
  blurCount.textContent = blurRegions.length;
  blurCount.dataset.count = blurRegions.length;
}

function updateEmptyStates() {
  const hasBlur = blurRegions.length > 0;
  blurEmpty.classList.toggle('hidden', hasBlur);
  blurBoxList.style.display = hasBlur ? '' : 'none';

  const hasSrt = cues.length > 0;
  srtEmpty.classList.toggle('hidden', hasSrt);
  srtList.style.display = hasSrt ? '' : 'none';
}

function initTabs() {
  document.querySelectorAll('.sidebar-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.sidebar-tabs .tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === target);
        t.setAttribute('aria-selected', t.dataset.tab === target ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('active', p.id === `tab-${target}`);
      });
    });
  });
}

function formatClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function getSubtitleStyle() {
  const boxEnabled = document.getElementById('subBoxEnabled').checked;
  return {
    position: document.getElementById('subPosition').value,
    custom_y_percent: parseFloat(document.getElementById('subCustomY').value) / 100 || 0.85,
    font: 'Arial',
    font_size: parseInt(document.getElementById('subFontSize').value, 10) || 42,
    text_color: document.getElementById('subTextColor').value,
    box_enabled: boxEnabled,
    box_color: document.getElementById('subBoxColor').value,
    box_opacity: boxEnabled
      ? parseInt(document.getElementById('subBoxOpacity').value, 10) / 100
      : 0,
    outline_color: '#000000',
    outline_width: parseInt(document.getElementById('subOutlineWidth').value, 10) || 3,
    margin_bottom: parseInt(document.getElementById('subMarginBottom').value, 10) || 92,
    max_width_percent: parseInt(document.getElementById('subMaxWidth').value, 10) || 78,
  };
}

function getAudioSettings() {
  return {
    mode: document.getElementById('audioMode').value,
    volume_percent: parseInt(document.getElementById('audioVolume').value, 10),
    offset_seconds: parseFloat(document.getElementById('audioOffset').value) || 0,
    fit_mode: document.getElementById('audioFitMode').value,
  };
}

function getDisplaySize() {
  const rect = playerStage.getBoundingClientRect();
  return {
    displayWidth: Math.floor(rect.width) || 0,
    displayHeight: Math.floor(rect.height) || 0,
  };
}

function buildRenderPayload() {
  const { displayWidth, displayHeight } = getDisplaySize();
  const payload = {
    videoPath,
    outputFolder: outputFolder || null,
    blurRegions,
    cues,
    subtitleStyle: getSubtitleStyle(),
    videoMeta,
    displayWidth,
    displayHeight,
    audioFile: audioFile || null,
    audioSettings: audioFile ? getAudioSettings() : null,
  };

  const config = RM.buildRenderConfig(payload);
  console.log('[Renderer] Render payload config:', config);
  return payload;
}

function getRenderConfig() {
  return RM.buildRenderConfig(buildRenderPayload());
}

function applyDynamicSubtitleDefaults(meta) {
  const defaults = RM.getDefaultSubtitleUiValues(meta.width, meta.height);
  document.getElementById('subPosition').value = 'bottom';
  document.getElementById('subFontSize').value = defaults.font_size;
  document.getElementById('subMarginBottom').value = defaults.margin_bottom;
  document.getElementById('subMaxWidth').value = defaults.max_width_percent;
  document.getElementById('subOutlineWidth').value = defaults.outline_width;
  document.getElementById('subBoxEnabled').checked = defaults.box_enabled;
  document.getElementById('subBoxOpacity').value = 0;
  document.getElementById('subBoxOpacityNum').value = 0;
  updateSubtitleBoxUi();

  const bottomPercent = ((meta.height - defaults.margin_bottom) / meta.height) * 100;
  document.getElementById('subCustomY').value = bottomPercent.toFixed(1);
}

function updateSubtitleBoxUi() {
  const enabled = document.getElementById('subBoxEnabled').checked;
  document.getElementById('subBoxColorRow').classList.toggle('hidden', !enabled);
  document.getElementById('subBoxOpacityRow').classList.toggle('hidden', !enabled);
}

function normalizeAllBlurRegions() {
  if (!videoMeta) return;
  blurRegions = blurRegions.map((r) =>
    RM.normalizeBlurRegion(r, videoMeta.width, videoMeta.height)
  );
}

function layoutPlayerStage() {
  if (!videoMeta) return;

  const bounds = playerWrapper.getBoundingClientRect();
  const transportH = transportBar.classList.contains('hidden') ? 0 : transportBar.offsetHeight;
  const availW = bounds.width;
  const availH = Math.max(0, bounds.height - transportH);
  const aspect = videoMeta.width / videoMeta.height;
  let stageW;
  let stageH;

  if (availW / availH > aspect) {
    stageH = availH;
    stageW = stageH * aspect;
  } else {
    stageW = availW;
    stageH = stageW / aspect;
  }

  stageW = Math.floor(stageW);
  stageH = Math.floor(stageH);
  playerStage.style.width = `${stageW}px`;
  playerStage.style.height = `${stageH}px`;
  playerWrapper.style.setProperty('--video-aspect', `${videoMeta.width} / ${videoMeta.height}`);
}

function setEditMode(enabled) {
  editMode = enabled;
  canvas.classList.toggle('edit-mode', editMode);
  btnEditMode.classList.toggle('active', editMode);
  editModeLabel.textContent = editMode ? 'Edit Blur' : 'Putar';
  canvasHint.classList.toggle('hidden', !editMode || !videoMeta);
}

function updatePlayPauseUi() {
  const playing = !video.paused && !video.ended;
  iconPlay.classList.toggle('hidden', playing);
  iconPause.classList.toggle('hidden', !playing);
}

function updateSeekUi() {
  const dur = video.duration || videoMeta?.duration || 0;
  timeDuration.textContent = formatClock(dur);
  if (!isSeeking && dur > 0) {
    seekBar.value = String(Math.round((video.currentTime / dur) * 1000));
  }
  timeCurrent.textContent = formatClock(video.currentTime);
}

function togglePlayPause() {
  if (!videoMeta) return;
  if (video.paused || video.ended) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
}

function updateScale() {
  if (!videoMeta || !playerStage.offsetWidth) return;
  const rect = playerStage.getBoundingClientRect();
  const w = Math.floor(rect.width);
  const h = Math.floor(rect.height);
  if (!w || !h) return;

  canvas.width = w;
  canvas.height = h;
}

function getStageCoords(clientX, clientY) {
  const rect = playerStage.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function isFullscreen() {
  return document.fullscreenElement === playerWrapper;
}

function updateFullscreenUi() {
  if (!btnFullscreen) return;
  btnFullscreen.title = isFullscreen() ? 'Keluar fullscreen (F / Esc)' : 'Fullscreen (F)';
}

async function toggleFullscreen() {
  if (!videoMeta) return;
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
    } else {
      await playerWrapper.requestFullscreen();
    }
  } catch {
    // fullscreen ditolak browser/OS — abaikan
  }
}

function refreshPlayerLayout() {
  if (!videoMeta) return;
  layoutPlayerStage();
  updateScale();
  drawCanvas();
}

function getBoxCanvasRect(region) {
  const norm = RM.normalizeBlurRegion(region, videoMeta?.width, videoMeta?.height);
  const w = canvas.width;
  const h = canvas.height;
  return {
    x: norm.xPercent * w,
    y: norm.yPercent * h,
    w: norm.widthPercent * w,
    h: norm.heightPercent * h,
  };
}

function clampRegionToBounds(region) {
  if (!videoMeta) return region;
  const norm = RM.normalizeBlurRegion(region, videoMeta.width, videoMeta.height);
  norm.xPercent = RM.clamp(norm.xPercent, 0, 1 - norm.widthPercent);
  norm.yPercent = RM.clamp(norm.yPercent, 0, 1 - norm.heightPercent);
  norm.widthPercent = RM.clamp(norm.widthPercent, 10 / videoMeta.width, 1 - norm.xPercent);
  norm.heightPercent = RM.clamp(norm.heightPercent, 10 / videoMeta.height, 1 - norm.yPercent);
  return norm;
}

function defaultBox() {
  return {
    xPercent: 0,
    yPercent: 0,
    widthPercent: 0.15,
    heightPercent: 0.05,
    blur_intensity: 20,
    time_range: { start: 0, end: null },
  };
}

function regionFromCanvasRect(x, y, w, h) {
  const cw = canvas.width;
  const ch = canvas.height;
  return clampRegionToBounds({
    xPercent: x / cw,
    yPercent: y / ch,
    widthPercent: w / cw,
    heightPercent: h / ch,
    blur_intensity: 20,
    time_range: { start: 0, end: null },
  });
}

// ── Canvas drawing ───────────────────────────────────────────────

function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!showBlurOverlay) return;

  blurRegions.forEach((region, i) => {
    const r = getBoxCanvasRect(region);
    const isSelected = i === selectedBoxIndex;

    ctx.strokeStyle = isSelected ? '#4a8fd4' : '#b8963e';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash(isSelected ? [] : [4, 3]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);

    ctx.fillStyle = isSelected ? 'rgba(74, 143, 212, 0.1)' : 'rgba(184, 150, 62, 0.08)';
    ctx.fillRect(r.x, r.y, r.w, r.h);

    if (isSelected) {
      drawHandles(r);
    }

    ctx.fillStyle = isSelected ? '#4a8fd4' : '#b8963e';
    ctx.font = '10px Consolas, monospace';
    ctx.fillText(`#${i + 1}`, r.x + 4, r.y + 14);
  });
}

function drawHandles(r) {
  const corners = [
    { x: r.x, y: r.y, handle: 'nw' },
    { x: r.x + r.w, y: r.y, handle: 'ne' },
    { x: r.x, y: r.y + r.h, handle: 'sw' },
    { x: r.x + r.w, y: r.y + r.h, handle: 'se' },
  ];
  ctx.fillStyle = '#4a8fd4';
  corners.forEach((c) => {
    ctx.fillRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  });
}

function hitTest(mx, my) {
  for (let i = blurRegions.length - 1; i >= 0; i--) {
    const r = getBoxCanvasRect(blurRegions[i]);
    const handles = [
      { x: r.x, y: r.y, handle: 'nw' },
      { x: r.x + r.w, y: r.y, handle: 'ne' },
      { x: r.x, y: r.y + r.h, handle: 'sw' },
      { x: r.x + r.w, y: r.y + r.h, handle: 'se' },
    ];
    for (const h of handles) {
      if (Math.abs(mx - h.x) < HANDLE_SIZE && Math.abs(my - h.y) < HANDLE_SIZE) {
        return { type: 'resize', index: i, handle: h.handle };
      }
    }
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      return { type: 'drag', index: i };
    }
  }
  return null;
}

// ── Canvas events ────────────────────────────────────────────────

function endBoxInteraction() {
  const needsSync = isDragging || isResizing;
  isDragging = false;
  isResizing = false;
  resizeHandle = null;
  boxAtDragStart = null;
  if (needsSync) {
    renderBlurList();
    markPreviewOutdated();
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (!videoMeta || !editMode || !showBlurOverlay) return;
  const { x: mx, y: my } = getStageCoords(e.clientX, e.clientY);

  const hit = hitTest(mx, my);
  if (hit?.type === 'resize') {
    selectedBoxIndex = hit.index;
    isResizing = true;
    resizeHandle = hit.handle;
    dragStart = { x: mx, y: my };
    boxAtDragStart = { ...RM.normalizeBlurRegion(blurRegions[hit.index], videoMeta.width, videoMeta.height) };
    renderBlurList();
    drawCanvas();
    return;
  }

  if (hit?.type === 'drag') {
    selectedBoxIndex = hit.index;
    isDragging = true;
    dragStart = { x: mx, y: my };
    boxAtDragStart = { ...RM.normalizeBlurRegion(blurRegions[hit.index], videoMeta.width, videoMeta.height) };
    renderBlurList();
    drawCanvas();
    return;
  }

  isDrawing = true;
  drawStart = { x: mx, y: my };
  selectedBoxIndex = -1;
  renderBlurList();
});

canvas.addEventListener('mousemove', (e) => {
  if (!videoMeta || !editMode || !showBlurOverlay) return;
  const { x: mx, y: my } = getStageCoords(e.clientX, e.clientY);

  if (isDrawing) {
    drawCanvas();
    ctx.strokeStyle = '#4a8fd4';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const w = mx - drawStart.x;
    const h = my - drawStart.y;
    ctx.strokeRect(drawStart.x, drawStart.y, w, h);
    ctx.setLineDash([]);
    return;
  }

  if (isDragging && boxAtDragStart) {
    const cw = canvas.width;
    const ch = canvas.height;
    const dx = (mx - dragStart.x) / cw;
    const dy = (my - dragStart.y) / ch;
    const region = blurRegions[selectedBoxIndex];
    region.xPercent = RM.clamp(boxAtDragStart.xPercent + dx, 0, 1 - boxAtDragStart.widthPercent);
    region.yPercent = RM.clamp(boxAtDragStart.yPercent + dy, 0, 1 - boxAtDragStart.heightPercent);
    drawCanvas();
    return;
  }

  if (isResizing && boxAtDragStart) {
    const cw = canvas.width;
    const ch = canvas.height;
    const dx = (mx - dragStart.x) / cw;
    const dy = (my - dragStart.y) / ch;
    const region = blurRegions[selectedBoxIndex];
    let { xPercent, yPercent, widthPercent, heightPercent } = boxAtDragStart;

    if (resizeHandle.includes('e')) widthPercent = Math.max(10 / videoMeta.width, widthPercent + dx);
    if (resizeHandle.includes('w')) {
      widthPercent = Math.max(10 / videoMeta.width, widthPercent - dx);
      xPercent = boxAtDragStart.xPercent + (boxAtDragStart.widthPercent - widthPercent);
    }
    if (resizeHandle.includes('s')) heightPercent = Math.max(10 / videoMeta.height, heightPercent + dy);
    if (resizeHandle.includes('n')) {
      heightPercent = Math.max(10 / videoMeta.height, heightPercent - dy);
      yPercent = boxAtDragStart.yPercent + (boxAtDragStart.heightPercent - heightPercent);
    }

    region.xPercent = RM.clamp(xPercent, 0, 1 - widthPercent);
    region.yPercent = RM.clamp(yPercent, 0, 1 - heightPercent);
    region.widthPercent = widthPercent;
    region.heightPercent = heightPercent;
    drawCanvas();
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (!editMode) return;
  if (isDrawing) {
    const { x: mx, y: my } = getStageCoords(e.clientX, e.clientY);

    const x1 = Math.min(drawStart.x, mx);
    const y1 = Math.min(drawStart.y, my);
    const x2 = Math.max(drawStart.x, mx);
    const y2 = Math.max(drawStart.y, my);

    if (x2 - x1 > 5 && y2 - y1 > 5) {
      const newRegion = regionFromCanvasRect(x1, y1, x2 - x1, y2 - y1);
      blurRegions.push(newRegion);
      selectedBoxIndex = blurRegions.length - 1;
      renderBlurList();
      markPreviewOutdated();
    }
    isDrawing = false;
    drawCanvas();
    return;
  }

  endBoxInteraction();
});

window.addEventListener('mouseup', () => {
  if (isDrawing) {
    isDrawing = false;
    drawCanvas();
    return;
  }
  endBoxInteraction();
});

// ── Blur list UI ─────────────────────────────────────────────────

function formatPercent(val) {
  return (val * 100).toFixed(1);
}

function renderBlurList() {
  blurBoxList.innerHTML = '';
  blurRegions.forEach((region, i) => {
    const norm = RM.normalizeBlurRegion(region, videoMeta?.width, videoMeta?.height);
    const px = videoMeta ? RM.blurRegionToPixels(norm, videoMeta.width, videoMeta.height) : null;
    const div = document.createElement('div');
    div.className = `box-item${i === selectedBoxIndex ? ' selected' : ''}`;
    div.dataset.index = i;
    div.innerHTML = `
      <div class="box-item-header">
        <div class="box-item-title">
          <span class="box-num">${i + 1}</span>
          Area Blur
        </div>
        <button class="btn btn-danger" data-action="delete" data-index="${i}">Hapus</button>
      </div>
      <div class="box-fields">
        <label>X% <input type="number" data-field="xPercent" data-index="${i}" value="${formatPercent(norm.xPercent)}" min="0" max="100" step="0.1" /></label>
        <label>Y% <input type="number" data-field="yPercent" data-index="${i}" value="${formatPercent(norm.yPercent)}" min="0" max="100" step="0.1" /></label>
        <label>Lebar% <input type="number" data-field="widthPercent" data-index="${i}" value="${formatPercent(norm.widthPercent)}" min="1" max="100" step="0.1" /></label>
        <label>Tinggi% <input type="number" data-field="heightPercent" data-index="${i}" value="${formatPercent(norm.heightPercent)}" min="1" max="100" step="0.1" /></label>
        ${px ? `<span class="box-px-hint">≈ ${px.x}, ${px.y} · ${px.width}×${px.height}px</span>` : ''}
        <label class="box-blur-row">
          Intensitas — <span class="blur-val" data-blur-val="${i}">${norm.blur_intensity}</span>
          <input type="range" class="range" data-field="blur_intensity" data-index="${i}" value="${norm.blur_intensity}" min="1" max="50" />
        </label>
        <label>Mulai (s) <input type="number" data-field="time_start" data-index="${i}" value="${norm.time_range?.start ?? 0}" min="0" step="0.1" /></label>
        <label>Selesai (s) <input type="number" data-field="time_end" data-index="${i}" value="${norm.time_range?.end ?? ''}" min="0" step="0.1" placeholder="penuh" /></label>
      </div>
    `;
    blurBoxList.appendChild(div);
  });

  blurBoxList.querySelectorAll('.box-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectedBoxIndex = parseInt(item.dataset.index, 10);
      renderBlurList();
      drawCanvas();
    });
  });

  blurBoxList.querySelectorAll('input, button').forEach((el) => {
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  blurBoxList.querySelectorAll('input').forEach((input) => {
    const handler = input.type === 'range' ? 'input' : 'change';
    input.addEventListener(handler, onBoxFieldChange);
  });

  blurBoxList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      blurRegions.splice(idx, 1);
      if (selectedBoxIndex === idx) selectedBoxIndex = -1;
      else if (selectedBoxIndex > idx) selectedBoxIndex--;
      renderBlurList();
      drawCanvas();
      markPreviewOutdated();
    });
  });

  updateBlurBadge();
  updateEmptyStates();
}

function onBoxFieldChange(e) {
  const idx = parseInt(e.target.dataset.index, 10);
  const field = e.target.dataset.field;
  const region = blurRegions[idx];
  if (!region) return;

  if (field === 'time_start') {
    region.time_range = region.time_range || { start: 0, end: null };
    region.time_range.start = parseFloat(e.target.value) || 0;
    markPreviewOutdated();
  } else if (field === 'time_end') {
    region.time_range = region.time_range || { start: 0, end: null };
    const val = e.target.value.trim();
    region.time_range.end = val === '' ? null : parseFloat(val);
    markPreviewOutdated();
  } else if (field === 'blur_intensity') {
    region.blur_intensity = parseInt(e.target.value, 10) || 20;
    const valEl = blurBoxList.querySelector(`[data-blur-val="${idx}"]`);
    if (valEl) valEl.textContent = region.blur_intensity;
    markPreviewOutdated();
  } else if (field.endsWith('Percent')) {
    region[field] = parseFloat(e.target.value) / 100 || 0;
    blurRegions[idx] = clampRegionToBounds(region);
    markPreviewOutdated();
    renderBlurList();
  }
  drawCanvas();
}

// ── SRT list UI ──────────────────────────────────────────────────

function renderSrtList() {
  srtList.innerHTML = '';
  cues.forEach((cue, i) => {
    const div = document.createElement('div');
    div.className = 'cue-item';
    div.innerHTML = `
      <div class="cue-time">#${cue.index} · ${formatTime(cue.start)} → ${formatTime(cue.end)}</div>
      <textarea data-cue-index="${i}">${cue.text}</textarea>
    `;
    srtList.appendChild(div);
  });

  srtList.querySelectorAll('textarea').forEach((ta) => {
    ta.addEventListener('input', () => {
      const idx = parseInt(ta.dataset.cueIndex, 10);
      cues[idx].text = ta.value;
      markPreviewOutdated();
    });
  });

  srtInfo.textContent = cues.length
    ? `${cues.length} cue · burn-in via ASS`
    : 'Belum ada SRT';
  updateEmptyStates();
}

// ── Video loading ────────────────────────────────────────────────

async function loadVideo(path) {
  videoPath = path;
  setRenderResult('');
  if (renderLog) renderLog.textContent = '';
  setPreviewStatus('missing');
  updateExportMeta(null);
  previewSection.classList.add('hidden');
  previewPlayer.removeAttribute('src');
  playerWrapper.classList.add('has-video');
  playerStage.classList.remove('hidden');
  transportBar.classList.remove('hidden');
  setEditMode(false);

  try {
    const [meta, src] = await Promise.all([
      window.api.getVideoMeta(path),
      window.api.getVideoSrc(path),
    ]);
    videoMeta = meta;
    video.src = src;
    video.load();

    const name = path.split(/[/\\]/).pop();
    updateVideoMetaPills(name, videoMeta);
    applyDynamicSubtitleDefaults(videoMeta);
    normalizeAllBlurRegions();

    document.getElementById('audioMode').value = videoMeta.hasAudio ? 'replace' : 'add';
    timeDuration.textContent = formatClock(videoMeta.duration);
    seekBar.value = '0';
    timeCurrent.textContent = '00:00';
    updateRenderButtons();
  } catch (err) {
    updateVideoMetaPills(null, null);
    updateExportMeta(null);
    videoInfo.innerHTML = `<span class="meta-pill warn">error: ${err}</span>`;
    updateRenderButtons();
    return;
  }

  if (video.readyState >= 1) onVideoResize();
}

function onVideoResize() {
  refreshPlayerLayout();
}

const playerResizeObserver = new ResizeObserver(() => {
  if (videoMeta) refreshPlayerLayout();
});
playerResizeObserver.observe(playerWrapper);

document.addEventListener('fullscreenchange', () => {
  updateFullscreenUi();
  if (videoMeta) {
    requestAnimationFrame(() => refreshPlayerLayout());
  }
});

playerStage.addEventListener('dblclick', (e) => {
  if (e.target.closest('.btn-fullscreen')) return;
  toggleFullscreen();
});

btnFullscreen?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

function isTypingInField() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.matches('textarea, select')) return true;
  if (el.matches('input') && !el.matches('[type="range"], [type="checkbox"]')) return true;
  return false;
}

document.addEventListener('keydown', (e) => {
  if (!videoMeta) return;

  if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingInField()) {
    e.preventDefault();
    togglePlayPause();
    return;
  }

  if (isTypingInField()) return;

  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

  if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    setEditMode(!editMode);
  }
});

btnEditMode?.addEventListener('click', () => setEditMode(!editMode));

toggleShowBlur?.addEventListener('change', (e) => {
  showBlurOverlay = e.target.checked;
  drawCanvas();
});

seekBar?.addEventListener('input', () => {
  isSeeking = true;
  const dur = video.duration || videoMeta?.duration || 0;
  if (dur > 0) {
    video.currentTime = (parseInt(seekBar.value, 10) / 1000) * dur;
    timeCurrent.textContent = formatClock(video.currentTime);
  }
});

seekBar?.addEventListener('change', () => {
  isSeeking = false;
});

video.addEventListener('play', updatePlayPauseUi);
video.addEventListener('pause', updatePlayPauseUi);
video.addEventListener('ended', updatePlayPauseUi);
video.addEventListener('timeupdate', updateSeekUi);
video.addEventListener('loadedmetadata', () => {
  if (videoMeta && video.duration && !videoMeta.duration) {
    videoMeta.duration = video.duration;
    updateVideoMetaPills(videoPath.split(/[/\\]/).pop(), videoMeta);
  }
  updateSeekUi();
});
video.addEventListener('error', () => {
  const msg = video.error?.message || 'Gagal memuat preview video';
  videoInfo.innerHTML = `<span class="meta-pill warn">Preview: ${msg}</span>`;
});

// ── Drag & drop ──────────────────────────────────────────────────

playerWrapper.addEventListener('dragover', (e) => {
  e.preventDefault();
  playerWrapper.classList.add('drag-over');
});

playerWrapper.addEventListener('dragleave', () => {
  playerWrapper.classList.remove('drag-over');
});

playerWrapper.addEventListener('drop', (e) => {
  e.preventDefault();
  playerWrapper.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.path) loadVideo(file.path);
});

// ── Button handlers ──────────────────────────────────────────────

document.getElementById('btnOpenVideo').addEventListener('click', async () => {
  const path = await window.api.openVideo();
  if (path) loadVideo(path);
});

document.getElementById('btnOpenSrt').addEventListener('click', async () => {
  const result = await window.api.openSrt();
  if (!result) return;
  cues = await window.api.parseSrt(result.content);
  renderSrtList();
  markPreviewOutdated();
});

document.getElementById('btnOpenAudio').addEventListener('click', async () => {
  const path = await window.api.openAudio();
  if (!path) return;
  audioFile = path;
  const fname = path.split(/[/\\]/).pop();
  audioInfo.textContent = `File: ${fname}`;
});

document.getElementById('btnChooseOutput').addEventListener('click', async () => {
  const folder = await window.api.chooseOutputFolder();
  if (!folder) return;
  outputFolder = folder;
  updateOutputPath(folder);
});

document.getElementById('btnAddBox').addEventListener('click', () => {
  if (!videoMeta) return;
  blurRegions.push(defaultBox());
  selectedBoxIndex = blurRegions.length - 1;
  renderBlurList();
  drawCanvas();
  markPreviewOutdated();
});

document.getElementById('btnSavePreset').addEventListener('click', async () => {
  const data = {
    preset_name: 'custom',
    blur_regions: blurRegions,
    subtitle_style: getSubtitleStyle(),
    audio_settings: getAudioSettings(),
  };
  const saved = await window.api.savePreset(data);
  if (saved) setRenderResult(`Preset disimpan: ${saved}`, 'success');
});

document.getElementById('btnLoadPreset').addEventListener('click', async () => {
  const data = await window.api.loadPreset();
  if (!data) return;

  blurRegions = (data.blur_regions || []).map((r) =>
    RM.normalizeBlurRegion(r, videoMeta?.width, videoMeta?.height)
  );
  selectedBoxIndex = -1;

  const style = data.subtitle_style || {};
  if (style.position) document.getElementById('subPosition').value = style.position;
  if (style.custom_y_percent != null) {
    document.getElementById('subCustomY').value = (style.custom_y_percent * 100).toFixed(1);
  } else if (style.custom_y != null && videoMeta) {
    document.getElementById('subCustomY').value = ((style.custom_y / videoMeta.height) * 100).toFixed(1);
  }
  if (style.font_size) document.getElementById('subFontSize').value = style.font_size;
  if (style.text_color) document.getElementById('subTextColor').value = style.text_color;
  if (style.box_color) document.getElementById('subBoxColor').value = style.box_color;
  const boxEnabled = style.box_enabled === true
    || (style.box_enabled == null && (style.box_opacity ?? 0) > 0.05);
  document.getElementById('subBoxEnabled').checked = boxEnabled;
  if (style.box_opacity != null) {
    const op = Math.round(style.box_opacity * 100);
    document.getElementById('subBoxOpacity').value = op;
    document.getElementById('subBoxOpacityNum').value = op;
  }
  updateSubtitleBoxUi();
  if (style.outline_width != null) document.getElementById('subOutlineWidth').value = style.outline_width;
  if (style.margin_bottom != null) document.getElementById('subMarginBottom').value = style.margin_bottom;
  if (style.max_width_percent != null) document.getElementById('subMaxWidth').value = style.max_width_percent;

  document.getElementById('subPosition').dispatchEvent(new Event('change'));

  const audio = data.audio_settings || {};
  if (audio.mode) document.getElementById('audioMode').value = audio.mode;
  if (audio.volume_percent != null) {
    document.getElementById('audioVolume').value = audio.volume_percent;
    document.getElementById('audioVolumeNum').value = audio.volume_percent;
  }
  if (audio.offset_seconds != null) document.getElementById('audioOffset').value = audio.offset_seconds;
  if (audio.fit_mode) document.getElementById('audioFitMode').value = audio.fit_mode;

  renderBlurList();
  drawCanvas();
  markPreviewOutdated();
  setRenderResult('Preset berhasil dimuat', 'success');
});

// ── Style panel listeners ────────────────────────────────────────

function bindStyleChange(el, eventName = 'change') {
  el.addEventListener(eventName, () => markPreviewOutdated());
}

document.getElementById('subPosition').addEventListener('change', (e) => {
  document.getElementById('customYRow').classList.toggle('hidden', e.target.value !== 'custom');
  markPreviewOutdated();
});

document.getElementById('subBoxEnabled').addEventListener('change', () => {
  updateSubtitleBoxUi();
  markPreviewOutdated();
});

[
  'subFontSize', 'subCustomY', 'subTextColor', 'subBoxColor',
  'subOutlineWidth', 'subMarginBottom', 'subMaxWidth', 'subBoxOpacityNum',
].forEach((id) => bindStyleChange(document.getElementById(id)));

function syncRangeToNum(rangeId, numId, onChange) {
  const range = document.getElementById(rangeId);
  const num = document.getElementById(numId);
  range?.addEventListener('input', () => {
    num.value = range.value;
    onChange?.();
  });
  num?.addEventListener('change', () => {
    range.value = num.value;
    onChange?.();
  });
}

syncRangeToNum('subBoxOpacity', 'subBoxOpacityNum', markPreviewOutdated);
syncRangeToNum('audioVolume', 'audioVolumeNum');

document.getElementById('subTextColor').addEventListener('input', (e) => {
  document.getElementById('subTextColorVal').textContent = e.target.value;
  markPreviewOutdated();
});

document.getElementById('subBoxColor').addEventListener('input', (e) => {
  document.getElementById('subBoxColorVal').textContent = e.target.value;
  markPreviewOutdated();
});

// ── Render & Preview ─────────────────────────────────────────────

let removeProgressListener = null;

function setupProgressListener(mode) {
  if (removeProgressListener) removeProgressListener();
  removeProgressListener = window.api.onRenderProgress((data) => {
    if (data.mode && data.mode !== mode) return;
    const pct = data.percent || 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
  });
}

btnPreview?.addEventListener('click', async () => {
  if (!videoPath || !videoMeta) return;

  setPreviewStatus('rendering');
  progressWrap.classList.remove('hidden');
  if (progressLabel) progressLabel.textContent = 'Preview FFmpeg';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  setRenderResult('Memproses preview...', 'info');
  appendRenderLog('Mulai preview render');

  const previewRange = RM.computePreviewRange(
    video.currentTime,
    cues,
    videoMeta.duration
  );

  const payload = {
    ...buildRenderPayload(),
    previewRange,
  };

  logRenderConfigSummary(getRenderConfig(), 'preview');
  appendRenderLog(`range start=${previewRange.start.toFixed(2)}s dur=${previewRange.duration.toFixed(2)}s`);

  setupProgressListener('preview');

  try {
    const result = await window.api.startPreviewRender(payload);
    progressFill.style.width = '100%';
    progressText.textContent = '100%';

    previewPlayer.src = result.previewSrc;
    previewSection.classList.remove('hidden');
    previewPlayer.load();
    previewPlayer.play().catch(() => {});

    setPreviewStatus('ready');
    updateExportMeta(videoMeta, previewRange.duration);
    appendRenderLog(`Preview selesai: ${result.outputPath || 'ok'}`);
    setRenderResult(`Preview ${previewRange.duration.toFixed(1)}s @ ${formatClock(previewRange.start)}`, 'success');
    document.querySelector('.tab[data-tab="export"]')?.click();
  } catch (err) {
    setPreviewStatus('missing');
    appendRenderLog(`Preview gagal: ${err}`);
    setRenderResult(`Preview gagal: ${err}`, 'error');
  } finally {
    if (removeProgressListener) {
      removeProgressListener();
      removeProgressListener = null;
    }
  }
});

btnRender.addEventListener('click', async () => {
  if (!videoPath || previewStatus !== 'ready') return;

  btnRender.disabled = true;
  progressWrap.classList.remove('hidden');
  if (progressLabel) progressLabel.textContent = 'Render final';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  setRenderResult('Memproses render final...', 'info');
  appendRenderLog('Mulai render final');
  logRenderConfigSummary(getRenderConfig(), 'final');

  setupProgressListener('full');

  const payload = buildRenderPayload();

  try {
    const result = await window.api.startRender(payload);
    progressFill.style.width = '100%';
    progressText.textContent = '100%';
    appendRenderLog(`Render selesai: ${result.outputPath}`);
    setRenderResult(`Output: ${result.outputPath}`, 'success');
    document.querySelector('.tab[data-tab="export"]')?.click();
  } catch (err) {
    appendRenderLog(`Render gagal: ${err}`);
    setRenderResult(`Render gagal: ${err}`, 'error');
  } finally {
    updateRenderButtons();
    if (removeProgressListener) {
      removeProgressListener();
      removeProgressListener = null;
    }
  }
});

// ── Init ─────────────────────────────────────────────────────────

video.addEventListener('loadedmetadata', onVideoResize);
video.addEventListener('loadeddata', onVideoResize);

updateFullscreenUi();
updateSubtitleBoxUi();

outputFolder = null;
initTabs();
updateBlurBadge();
updateEmptyStates();
updateOutputPath(null);
updateRenderButtons();

window.api.getAppVersion().then((v) => {
  const el = document.getElementById('appVersion');
  if (el && v) el.textContent = `v${v}`;
}).catch(() => {});