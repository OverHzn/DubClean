// ── State ────────────────────────────────────────────────────────

let videoPath = null;
let videoMeta = null;
let blurRegions = [];
let cues = [];
let audioFile = null;
let outputFolder = null;
let selectedBoxIndex = -1;

let scaleX = 1;
let scaleY = 1;

// Canvas interaction
let isDrawing = false;
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let drawStart = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let boxAtDragStart = null;

const HANDLE_SIZE = 8;

// ── DOM refs ─────────────────────────────────────────────────────

const video = document.getElementById('videoPlayer');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');
const playerWrapper = document.getElementById('playerWrapper');
const videoInfo = document.getElementById('videoInfo');
const blurBoxList = document.getElementById('blurBoxList');
const srtInfo = document.getElementById('srtInfo');
const srtList = document.getElementById('srtList');
const outputInfo = document.getElementById('outputInfo');
const audioInfo = document.getElementById('audioInfo');
const btnRender = document.getElementById('btnRender');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const renderResult = document.getElementById('renderResult');
const blurEmpty = document.getElementById('blurEmpty');
const srtEmpty = document.getElementById('srtEmpty');
const blurCount = document.getElementById('blurCount');
const canvasHint = document.getElementById('canvasHint');
const emptyState = document.getElementById('emptyState');

// ── Helpers ──────────────────────────────────────────────────────

function setRenderResult(message, type = '') {
  renderResult.textContent = message;
  renderResult.className = 'render-result';
  if (type) renderResult.classList.add(type);
}

function updateOutputPath(folder) {
  const label = folder || 'output/';
  outputInfo.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    <span>${folder ? folder : 'Default: <code>output/</code>'}</span>
  `;
}

function updateVideoMetaPills(name, meta) {
  if (!meta) {
    videoInfo.innerHTML = '<span class="meta-pill idle">Belum ada video</span>';
    return;
  }
  const dur = `${Math.floor(meta.duration / 60)}:${String(Math.floor(meta.duration % 60)).padStart(2, '0')}`;
  videoInfo.innerHTML = `
    <span class="meta-pill accent">${name}</span>
    <span class="meta-pill">${meta.width}×${meta.height}</span>
    <span class="meta-pill">${dur}</span>
    <span class="meta-pill ${meta.hasAudio ? 'success' : 'warn'}">${meta.hasAudio ? 'Audio ada' : 'Tanpa audio'}</span>
  `;
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

function pathToFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function getSubtitleStyle() {
  return {
    position: document.getElementById('subPosition').value,
    custom_y: parseInt(document.getElementById('subCustomY').value, 10) || 900,
    font: 'Arial',
    font_size: parseInt(document.getElementById('subFontSize').value, 10) || 42,
    text_color: document.getElementById('subTextColor').value,
    box_color: document.getElementById('subBoxColor').value,
    box_opacity: parseInt(document.getElementById('subBoxOpacity').value, 10) / 100,
    outline_color: '#000000',
    outline_width: parseInt(document.getElementById('subOutlineWidth').value, 10) || 2,
    margin_bottom: parseInt(document.getElementById('subMarginBottom').value, 10) || 120,
    max_width_percent: parseInt(document.getElementById('subMaxWidth').value, 10) || 80,
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

function updateScale() {
  if (!videoMeta || !video.videoWidth) return;
  const rect = video.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  scaleX = videoMeta.width / rect.width;
  scaleY = videoMeta.height / rect.height;
}

function canvasToVideo(cx, cy) {
  return {
    x: Math.round(cx * scaleX),
    y: Math.round(cy * scaleY),
  };
}

function videoToCanvas(vx, vy) {
  return { x: vx / scaleX, y: vy / scaleY };
}

function getBoxCanvasRect(region) {
  const tl = videoToCanvas(region.x, region.y);
  return {
    x: tl.x,
    y: tl.y,
    w: region.width / scaleX,
    h: region.height / scaleY,
  };
}

function defaultBox() {
  const w = videoMeta ? Math.round(videoMeta.width * 0.15) : 150;
  const h = videoMeta ? Math.round(videoMeta.height * 0.05) : 80;
  return {
    x: 0,
    y: 0,
    width: w,
    height: h,
    blur_intensity: 20,
    time_range: { start: 0, end: null },
  };
}

// ── Canvas drawing ───────────────────────────────────────────────

function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  blurRegions.forEach((region, i) => {
    const r = getBoxCanvasRect(region);
    const isSelected = i === selectedBoxIndex;

    ctx.strokeStyle = isSelected ? '#7c6cf0' : '#fbbf24';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.setLineDash(isSelected ? [] : [6, 4]);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);

    ctx.fillStyle = isSelected ? 'rgba(124, 108, 240, 0.15)' : 'rgba(251, 191, 36, 0.1)';
    ctx.fillRect(r.x, r.y, r.w, r.h);

    if (isSelected) {
      drawHandles(r);
    }

    ctx.fillStyle = isSelected ? '#9d8ff7' : '#fbbf24';
    ctx.font = '11px Segoe UI';
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
  ctx.fillStyle = '#7c6cf0';
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
  if (needsSync) renderBlurList();
}

canvas.addEventListener('mousedown', (e) => {
  if (!videoMeta) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const hit = hitTest(mx, my);
  if (hit?.type === 'resize') {
    selectedBoxIndex = hit.index;
    isResizing = true;
    resizeHandle = hit.handle;
    dragStart = { x: mx, y: my };
    boxAtDragStart = { ...blurRegions[hit.index] };
    renderBlurList();
    drawCanvas();
    return;
  }

  if (hit?.type === 'drag') {
    selectedBoxIndex = hit.index;
    isDragging = true;
    dragStart = { x: mx, y: my };
    boxAtDragStart = { ...blurRegions[hit.index] };
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
  if (!videoMeta) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (isDrawing) {
    drawCanvas();
    ctx.strokeStyle = '#6c8cff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    const w = mx - drawStart.x;
    const h = my - drawStart.y;
    ctx.strokeRect(drawStart.x, drawStart.y, w, h);
    ctx.setLineDash([]);
    return;
  }

  if (isDragging && boxAtDragStart) {
    const dx = (mx - dragStart.x) * scaleX;
    const dy = (my - dragStart.y) * scaleY;
    const region = blurRegions[selectedBoxIndex];
    region.x = Math.max(0, Math.round(boxAtDragStart.x + dx));
    region.y = Math.max(0, Math.round(boxAtDragStart.y + dy));
    if (videoMeta) {
      region.x = Math.min(region.x, videoMeta.width - region.width);
      region.y = Math.min(region.y, videoMeta.height - region.height);
    }
    drawCanvas();
    return;
  }

  if (isResizing && boxAtDragStart) {
    const region = blurRegions[selectedBoxIndex];
    const dx = Math.round((mx - dragStart.x) * scaleX);
    const dy = Math.round((my - dragStart.y) * scaleY);
    let { x, y, width, height } = boxAtDragStart;

    if (resizeHandle.includes('e')) width = Math.max(10, width + dx);
    if (resizeHandle.includes('w')) {
      width = Math.max(10, width - dx);
      x = boxAtDragStart.x + (boxAtDragStart.width - width);
    }
    if (resizeHandle.includes('s')) height = Math.max(10, height + dy);
    if (resizeHandle.includes('n')) {
      height = Math.max(10, height - dy);
      y = boxAtDragStart.y + (boxAtDragStart.height - height);
    }

    region.x = Math.max(0, x);
    region.y = Math.max(0, y);
    region.width = width;
    region.height = height;
    drawCanvas();
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (isDrawing) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const x1 = Math.min(drawStart.x, mx);
    const y1 = Math.min(drawStart.y, my);
    const x2 = Math.max(drawStart.x, mx);
    const y2 = Math.max(drawStart.y, my);

    if (x2 - x1 > 5 && y2 - y1 > 5) {
      const tl = canvasToVideo(x1, y1);
      const br = canvasToVideo(x2, y2);
      blurRegions.push({
        x: tl.x,
        y: tl.y,
        width: br.x - tl.x,
        height: br.y - tl.y,
        blur_intensity: 20,
        time_range: { start: 0, end: null },
      });
      selectedBoxIndex = blurRegions.length - 1;
      renderBlurList();
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

function renderBlurList() {
  blurBoxList.innerHTML = '';
  blurRegions.forEach((region, i) => {
    const div = document.createElement('div');
    div.className = `box-item${i === selectedBoxIndex ? ' selected' : ''}`;
    div.dataset.index = i;
    div.innerHTML = `
      <div class="box-item-header">
        <div class="box-item-title">
          <span class="box-num">${i + 1}</span>
          Blur Region
        </div>
        <button class="btn btn-danger" data-action="delete" data-index="${i}">Hapus</button>
      </div>
      <div class="box-fields">
        <label>X <input type="number" data-field="x" data-index="${i}" value="${region.x}" min="0" /></label>
        <label>Y <input type="number" data-field="y" data-index="${i}" value="${region.y}" min="0" /></label>
        <label>Lebar <input type="number" data-field="width" data-index="${i}" value="${region.width}" min="10" /></label>
        <label>Tinggi <input type="number" data-field="height" data-index="${i}" value="${region.height}" min="10" /></label>
        <label class="box-blur-row">
          Intensitas — <span class="blur-val" data-blur-val="${i}">${region.blur_intensity}</span>
          <input type="range" class="range" data-field="blur_intensity" data-index="${i}" value="${region.blur_intensity}" min="1" max="50" />
        </label>
        <label>Mulai (s) <input type="number" data-field="time_start" data-index="${i}" value="${region.time_range?.start ?? 0}" min="0" step="0.1" /></label>
        <label>Selesai (s) <input type="number" data-field="time_end" data-index="${i}" value="${region.time_range?.end ?? ''}" min="0" step="0.1" placeholder="penuh" /></label>
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
  } else if (field === 'time_end') {
    region.time_range = region.time_range || { start: 0, end: null };
    const val = e.target.value.trim();
    region.time_range.end = val === '' ? null : parseFloat(val);
  } else if (field === 'blur_intensity') {
    region.blur_intensity = parseInt(e.target.value, 10) || 20;
    const valEl = blurBoxList.querySelector(`[data-blur-val="${idx}"]`);
    if (valEl) valEl.textContent = region.blur_intensity;
  } else {
    region[field] = parseInt(e.target.value, 10) || 0;
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
    });
  });

  srtInfo.textContent = cues.length
    ? `${cues.length} cue siap di-burn ke video`
    : 'Belum ada SRT — import dari toolbar atas';
  updateEmptyStates();
}

// ── Video loading ────────────────────────────────────────────────

async function loadVideo(path) {
  videoPath = path;
  video.src = pathToFileUrl(path);
  setRenderResult('');
  playerWrapper.classList.add('has-video');
  canvasHint.classList.remove('hidden');

  try {
    videoMeta = await window.api.getVideoMeta(path);
    const name = path.split(/[/\\]/).pop();
    updateVideoMetaPills(name, videoMeta);

    document.getElementById('audioMode').value = videoMeta.hasAudio ? 'replace' : 'add';
    btnRender.disabled = false;
  } catch (err) {
    updateVideoMetaPills(null, null);
    videoInfo.innerHTML = `<span class="meta-pill warn">Error: ${err}</span>`;
    btnRender.disabled = true;
    return;
  }

  if (video.readyState >= 1) onVideoResize();
}

function onVideoResize() {
  updateScale();
  drawCanvas();
}

window.addEventListener('resize', () => {
  if (videoMeta) {
    updateScale();
    drawCanvas();
  }
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

  blurRegions = data.blur_regions || [];
  selectedBoxIndex = -1;

  const style = data.subtitle_style || {};
  if (style.position) document.getElementById('subPosition').value = style.position;
  if (style.custom_y != null) document.getElementById('subCustomY').value = style.custom_y;
  if (style.font_size) document.getElementById('subFontSize').value = style.font_size;
  if (style.text_color) document.getElementById('subTextColor').value = style.text_color;
  if (style.box_color) document.getElementById('subBoxColor').value = style.box_color;
  if (style.box_opacity != null) {
    document.getElementById('subBoxOpacity').value = Math.round(style.box_opacity * 100);
    document.getElementById('subBoxOpacityVal').textContent = `${Math.round(style.box_opacity * 100)}%`;
  }
  if (style.outline_width != null) document.getElementById('subOutlineWidth').value = style.outline_width;
  if (style.margin_bottom != null) document.getElementById('subMarginBottom').value = style.margin_bottom;
  if (style.max_width_percent != null) document.getElementById('subMaxWidth').value = style.max_width_percent;

  document.getElementById('subPosition').dispatchEvent(new Event('change'));

  const audio = data.audio_settings || {};
  if (audio.mode) document.getElementById('audioMode').value = audio.mode;
  if (audio.volume_percent != null) {
    document.getElementById('audioVolume').value = audio.volume_percent;
    document.getElementById('audioVolumeVal').textContent = `${audio.volume_percent}%`;
  }
  if (audio.offset_seconds != null) document.getElementById('audioOffset').value = audio.offset_seconds;
  if (audio.fit_mode) document.getElementById('audioFitMode').value = audio.fit_mode;

  renderBlurList();
  drawCanvas();
  setRenderResult('Preset berhasil dimuat', 'success');
});

// ── Style panel listeners ────────────────────────────────────────

document.getElementById('subPosition').addEventListener('change', (e) => {
  document.getElementById('customYRow').classList.toggle('hidden', e.target.value !== 'custom');
});

document.getElementById('subBoxOpacity').addEventListener('input', (e) => {
  document.getElementById('subBoxOpacityVal').textContent = `${e.target.value}%`;
});

document.getElementById('audioVolume').addEventListener('input', (e) => {
  document.getElementById('audioVolumeVal').textContent = `${e.target.value}%`;
});

document.getElementById('subTextColor').addEventListener('input', (e) => {
  document.getElementById('subTextColorVal').textContent = e.target.value;
});

document.getElementById('subBoxColor').addEventListener('input', (e) => {
  document.getElementById('subBoxColorVal').textContent = e.target.value;
});

// ── Render ───────────────────────────────────────────────────────

let removeProgressListener = null;

document.getElementById('btnRender').addEventListener('click', async () => {
  if (!videoPath) return;

  btnRender.disabled = true;
  progressWrap.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  setRenderResult('Rendering video...', 'info');

  if (removeProgressListener) removeProgressListener();
  removeProgressListener = window.api.onRenderProgress((data) => {
    const pct = data.percent || 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
  });

  const payload = {
    videoPath,
    outputFolder: outputFolder || null,
    blurRegions,
    cues,
    subtitleStyle: getSubtitleStyle(),
    videoMeta,
    audioFile: audioFile || null,
    audioSettings: audioFile ? getAudioSettings() : null,
  };

  try {
    const result = await window.api.startRender(payload);
    progressFill.style.width = '100%';
    progressText.textContent = '100%';
    setRenderResult(`Selesai! ${result.outputPath}`, 'success');
    document.querySelector('.tab[data-tab="export"]')?.click();
  } catch (err) {
    setRenderResult(`Error: ${err}`, 'error');
  } finally {
    btnRender.disabled = false;
    if (removeProgressListener) {
      removeProgressListener();
      removeProgressListener = null;
    }
  }
});

// ── Init ─────────────────────────────────────────────────────────

video.addEventListener('loadedmetadata', onVideoResize);

outputFolder = null;
initTabs();
updateBlurBadge();
updateEmptyStates();
updateOutputPath(null);