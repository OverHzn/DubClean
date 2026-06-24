const {
  buildRenderConfig,
  adjustCuesForPreview,
  adjustBlurForPreview,
} = require('./renderMath');

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

function generateAss(cues, config) {
  const style = config.subtitleStyle || {};
  const font = style.font || 'Arial';
  const fontSize = config.subtitleFontSizePx;
  const primary = hexToAssColor(style.text_color || '#FFFFFF');
  const outline = hexToAssColor(style.outline_color || '#000000');
  const back = hexToAssColor(style.box_color || '#000000', style.box_opacity ?? 0.6);
  const outlineWidth = config.subtitleStrokeWidthPx;
  const marginV = config.subtitleMarginV;
  const marginL = config.subtitleMarginL;
  const marginR = config.subtitleMarginR;
  const alignment = config.subtitleAlignment;
  const playResX = config.videoWidth;
  const playResY = config.videoHeight;

  const header = `[Script Info]
Title: DubClean
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

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
    let prefix = '{\\q2}';

    if (style.position === 'custom') {
      const x = Math.round(config.subtitleX);
      const y = Math.round(config.subtitleY);
      const pad = config.subtitlePadding;
      const stroke = config.subtitleStrokeWidthPx;
      const clampedX = Math.max(
        config.subtitleSafeMarginX + stroke,
        Math.min(x, config.videoWidth - config.subtitleSafeMarginX - stroke)
      );
      const clampedY = Math.max(
        config.subtitleSafeMarginY + stroke + pad,
        Math.min(y, config.videoHeight - config.subtitleBottomMargin - stroke)
      );
      prefix = `{\\pos(${clampedX},${clampedY})\\q2}`;
    }

    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${prefix}${text}`;
  });

  return header + lines.join('\n') + '\n';
}

function buildBlurChain(blurRegions) {
  if (!blurRegions || blurRegions.length === 0) {
    return { filter: null, lastLabel: '0:v' };
  }

  const parts = [];
  let current = '0:v';

  blurRegions.forEach((region, i) => {
    const { x, y, width, height, blur_intensity, time_range } = region;
    const intensity = Math.max(1, blur_intensity || 20);
    const sigma = Math.max(1, Math.round(intensity / 3));
    const blurLabel = `blur${i}`;
    const outLabel = `v${i}`;

    parts.push(
      `[${current}]crop=${width}:${height}:${x}:${y},gblur=sigma=${sigma}:steps=1[${blurLabel}]`
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
  return filePath
    .replace(/\\/g, '/')
    .replace(/^([a-zA-Z]):/, '$1\\:')
    .replace(/'/g, "'\\''");
}

function buildFullFilter(config, assPath, hasCues) {
  const { filter: blurFilter, lastLabel } = buildBlurChain(config.blurRegions);
  const escapedAss = escapeFfmpegPath(assPath);

  let chain = blurFilter;
  let videoOut = lastLabel;

  if (hasCues) {
    const subPart = `[${lastLabel}]subtitles='${escapedAss}'[outv]`;
    chain = chain ? `${chain};${subPart}` : subPart;
    videoOut = 'outv';
  }

  return { filterComplex: chain, videoOut };
}

function logRenderConfig(config, mode, extra = {}) {
  const tag = mode === 'preview' ? '[Preview Render]' : '[Final Render]';
  console.log(`\n${tag} ── Render Config Debug ──`);
  console.log(`  Video: ${config.videoWidth}x${config.videoHeight} (AR: ${config.aspectRatio.toFixed(3)}, ${config.aspectClass})`);
  console.log(`  Display: ${config.displayWidth}x${config.displayHeight}`);
  console.log(`  Subtitle position: ${config.subtitlePosition} (${(config.subtitleXPercent * 100).toFixed(1)}%, ${(config.subtitleYPercent * 100).toFixed(1)}%)`);
  console.log(`  Subtitle render: (${config.subtitleX}, ${config.subtitleY})`);
  console.log(`  Font: ${config.subtitleFontSizePx}px (${(config.subtitleFontSizePercent * 100).toFixed(2)}% height)`);
  console.log(`  Stroke: ${config.subtitleStrokeWidthPx}px, Padding: ${config.subtitlePadding}px`);
  console.log(`  Safe margins: X=${config.subtitleSafeMarginX}, Y=${config.subtitleSafeMarginY}, bottom=${config.subtitleBottomMargin}`);
  console.log(`  Max width: ${config.subtitleMaxWidth}px, Margins L/R/V: ${config.subtitleMarginL}/${config.subtitleMarginR}/${config.subtitleMarginV}`);
  if (config.blurEnabled) {
    config.blurRegions.forEach((b, i) => {
      console.log(`  Blur[${i}] norm: (${(b.xPercent * 100).toFixed(2)}%, ${(b.yPercent * 100).toFixed(2)}%, ${(b.widthPercent * 100).toFixed(2)}%, ${(b.heightPercent * 100).toFixed(2)}%)`);
      console.log(`  Blur[${i}] px: (${b.x}, ${b.y}, ${b.width}, ${b.height})`);
    });
  } else {
    console.log('  Blur: disabled');
  }
  if (extra.previewRange) {
    console.log(`  Preview range: start=${extra.previewRange.start}s, duration=${extra.previewRange.duration}s`);
  }
  if (extra.ffmpegCommand) {
    console.log(`  FFmpeg: ${extra.ffmpegCommand}`);
  }
  console.log('─────────────────────────────\n');
}

function prepareRenderPayload(payload, options = {}) {
  const config = buildRenderConfig(payload);
  let cues = payload.cues || [];
  let blurRegions = config.blurRegions;

  if (options.mode === 'preview' && options.previewRange) {
    const { start, duration } = options.previewRange;
    cues = adjustCuesForPreview(cues, start, duration);
    blurRegions = adjustBlurForPreview(blurRegions, start);
    config.blurRegions = blurRegions;
  }

  return { config, cues, blurRegions };
}

module.exports = {
  buildRenderConfig,
  generateAss,
  buildBlurChain,
  buildFullFilter,
  logRenderConfig,
  prepareRenderPayload,
  escapeFfmpegPath,
};