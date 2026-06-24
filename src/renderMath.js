/**
 * Pure math untuk layout render — dipakai renderer (browser) dan main (Node).
 * Jangan require modul Node di sini.
 */

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function classifyAspectRatio(videoWidth, videoHeight) {
  const aspectRatio = videoWidth / videoHeight;
  if (aspectRatio < 0.9) return 'vertical';
  if (aspectRatio <= 1.1) return 'square';
  return 'horizontal';
}

function computeDynamicFontSize(videoWidth, videoHeight) {
  return clamp(Math.round(videoHeight * 0.045), 28, 68);
}

function computeSafeMargins(videoWidth, videoHeight) {
  const safeMarginX = Math.round(videoWidth * 0.04);
  const safeMarginY = Math.round(videoHeight * 0.04);
  const safeBottomMargin = clamp(Math.round(videoHeight * 0.085), 55, 150);
  return { safeMarginX, safeMarginY, safeBottomMargin };
}

function computeMaxWidthPercent(aspectClass, userPercent) {
  if (userPercent != null && userPercent > 0) return clamp(userPercent, 30, 100);
  if (aspectClass === 'vertical') return 86;
  if (aspectClass === 'horizontal') return 78;
  return 84;
}

function computeStrokeWidth(fontSize, userWidth) {
  if (userWidth != null && userWidth >= 0) return clamp(Math.round(userWidth), 0, 10);
  return clamp(Math.round(fontSize * 0.1), 3, 6);
}

function computePadding(fontSize) {
  return clamp(Math.round(fontSize * 0.35), 10, 22);
}

function percentToPx(percent, dimension) {
  return Math.round(percent * dimension);
}

function pxToPercent(px, dimension) {
  if (!dimension) return 0;
  return clamp(px / dimension, 0, 1);
}

function normalizeBlurRegion(region, videoWidth, videoHeight) {
  if (!region) return null;
  if (region.xPercent != null) {
    return {
      xPercent: region.xPercent,
      yPercent: region.yPercent,
      widthPercent: region.widthPercent,
      heightPercent: region.heightPercent,
      blur_intensity: region.blur_intensity ?? 20,
      time_range: region.time_range || { start: 0, end: null },
    };
  }
  if (region.x != null && videoWidth && videoHeight) {
    return {
      xPercent: pxToPercent(region.x, videoWidth),
      yPercent: pxToPercent(region.y, videoHeight),
      widthPercent: pxToPercent(region.width, videoWidth),
      heightPercent: pxToPercent(region.height, videoHeight),
      blur_intensity: region.blur_intensity ?? 20,
      time_range: region.time_range || { start: 0, end: null },
    };
  }
  return region;
}

function blurRegionToPixels(region, videoWidth, videoHeight) {
  const norm = normalizeBlurRegion(region, videoWidth, videoHeight);
  const x = percentToPx(norm.xPercent, videoWidth);
  const y = percentToPx(norm.yPercent, videoHeight);
  let width = percentToPx(norm.widthPercent, videoWidth);
  let height = percentToPx(norm.heightPercent, videoHeight);
  width = clamp(width, 10, videoWidth - x);
  height = clamp(height, 10, videoHeight - y);
  return {
    x: clamp(x, 0, videoWidth - 10),
    y: clamp(y, 0, videoHeight - 10),
    width,
    height,
    blur_intensity: norm.blur_intensity,
    time_range: norm.time_range,
    xPercent: norm.xPercent,
    yPercent: norm.yPercent,
    widthPercent: norm.widthPercent,
    heightPercent: norm.heightPercent,
  };
}

function computeSubtitleLayout(videoWidth, videoHeight, userStyle) {
  const style = userStyle || {};
  const aspectClass = classifyAspectRatio(videoWidth, videoHeight);
  const aspectRatio = videoWidth / videoHeight;

  const dynamicFontSize = computeDynamicFontSize(videoWidth, videoHeight);
  const fontSizePx = style.font_size != null ? clamp(Math.round(style.font_size), 12, 120) : dynamicFontSize;
  const fontSizePercent = fontSizePx / videoHeight;
  const lineHeight = 1.2;

  const margins = computeSafeMargins(videoWidth, videoHeight);
  const marginBottom =
    style.margin_bottom != null
      ? clamp(Math.round(style.margin_bottom), 0, Math.round(videoHeight * 0.4))
      : margins.safeBottomMargin;

  const maxWidthPercent = computeMaxWidthPercent(aspectClass, style.max_width_percent);
  const subtitleMaxWidth = Math.round(videoWidth * (maxWidthPercent / 100));
  const strokeWidthPx = computeStrokeWidth(fontSizePx, style.outline_width);
  const padding = computePadding(fontSizePx);

  const marginL = Math.max(margins.safeMarginX, Math.round((videoWidth - subtitleMaxWidth) / 2));
  const marginR = marginL;

  let alignment = 2;
  let subtitleXPercent = 0.5;
  let subtitleYPercent = 1 - marginBottom / videoHeight;
  let marginV = Math.round(marginBottom + strokeWidthPx);

  if (style.position === 'top') {
    alignment = 8;
    marginV = Math.round(margins.safeMarginY + strokeWidthPx);
    subtitleYPercent = marginV / videoHeight;
  } else if (style.position === 'center') {
    alignment = 5;
    marginV = 0;
    subtitleYPercent = 0.5;
  } else if (style.position === 'custom') {
    alignment = 2;
    if (style.custom_y_percent != null) {
      subtitleYPercent = clamp(style.custom_y_percent, 0.05, 0.95);
    } else if (style.custom_y != null) {
      subtitleYPercent = clamp(style.custom_y / videoHeight, 0.05, 0.95);
    }
    marginV = Math.round((1 - subtitleYPercent) * videoHeight);
  }

  const subtitleX = Math.round(subtitleXPercent * videoWidth);
  const subtitleY = Math.round(subtitleYPercent * videoHeight);

  return {
    videoWidth,
    videoHeight,
    aspectRatio,
    aspectClass,
    subtitlePosition: style.position || 'bottom',
    subtitleXPercent,
    subtitleYPercent,
    subtitleX,
    subtitleY,
    subtitleFontSizePercent: fontSizePercent,
    subtitleFontSizePx: fontSizePx,
    subtitleStrokeWidthPx: strokeWidthPx,
    subtitleSafeMarginX: margins.safeMarginX,
    subtitleSafeMarginY: margins.safeMarginY,
    subtitleBottomMargin: marginBottom,
    subtitlePadding: padding,
    subtitleMaxWidth,
    subtitleMaxWidthPercent: maxWidthPercent,
    subtitleMarginL: marginL,
    subtitleMarginR: marginR,
    subtitleMarginV: marginV,
    subtitleAlignment: alignment,
    lineHeight,
  };
}

function buildRenderConfig(payload) {
  const {
    videoMeta,
    blurRegions = [],
    subtitleStyle = {},
    displayWidth = 0,
    displayHeight = 0,
  } = payload;

  const videoWidth = videoMeta?.width || 0;
  const videoHeight = videoMeta?.height || 0;
  const subtitle = computeSubtitleLayout(videoWidth, videoHeight, subtitleStyle);

  const blurPx = blurRegions.map((r) => blurRegionToPixels(r, videoWidth, videoHeight));
  const blurEnabled = blurPx.length > 0;

  const primaryBlur = blurPx[0] || null;

  return {
    videoWidth,
    videoHeight,
    aspectRatio: subtitle.aspectRatio,
    aspectClass: subtitle.aspectClass,
    displayWidth,
    displayHeight,

    subtitleText: null,
    subtitlePosition: subtitle.subtitlePosition,
    subtitleXPercent: subtitle.subtitleXPercent,
    subtitleYPercent: subtitle.subtitleYPercent,
    subtitleFontSizePercent: subtitle.subtitleFontSizePercent,
    subtitleFontSizePx: subtitle.subtitleFontSizePx,
    subtitleStrokeWidthPx: subtitle.subtitleStrokeWidthPx,
    subtitleSafeMarginX: subtitle.subtitleSafeMarginX,
    subtitleSafeMarginY: subtitle.subtitleSafeMarginY,
    subtitleBottomMargin: subtitle.subtitleBottomMargin,
    subtitlePadding: subtitle.subtitlePadding,
    subtitleMaxWidth: subtitle.subtitleMaxWidth,
    subtitleMaxWidthPercent: subtitle.subtitleMaxWidthPercent,
    subtitleMarginL: subtitle.subtitleMarginL,
    subtitleMarginR: subtitle.subtitleMarginR,
    subtitleMarginV: subtitle.subtitleMarginV,
    subtitleAlignment: subtitle.subtitleAlignment,
    lineHeight: subtitle.lineHeight,

    blurEnabled,
    blurRegions: blurPx,
    blurXPercent: primaryBlur?.xPercent ?? 0,
    blurYPercent: primaryBlur?.yPercent ?? 0,
    blurWidthPercent: primaryBlur?.widthPercent ?? 0,
    blurHeightPercent: primaryBlur?.heightPercent ?? 0,
    blurX: primaryBlur?.x ?? 0,
    blurY: primaryBlur?.y ?? 0,
    blurWidth: primaryBlur?.width ?? 0,
    blurHeight: primaryBlur?.height ?? 0,

    subtitleStyle,
    videoMeta,
  };
}

function computePreviewRange(currentTime, cues, videoDuration) {
  const DEFAULT_DURATION = 9;
  const BUFFER = 0.5;
  const MAX_DURATION = 10;
  const MIN_DURATION = 3;

  let start = Math.max(0, currentTime);
  let duration = DEFAULT_DURATION;

  const activeCue = (cues || []).find((c) => currentTime >= c.start && currentTime < c.end);
  if (activeCue) {
    start = Math.max(0, activeCue.start - BUFFER);
    duration = activeCue.end - activeCue.start + BUFFER * 2;
    duration = clamp(duration, MIN_DURATION, MAX_DURATION);
  }

  if (videoDuration > 0) {
    if (start + duration > videoDuration) {
      duration = Math.min(duration, videoDuration - start);
    }
    if (duration < MIN_DURATION && videoDuration >= MIN_DURATION) {
      start = Math.max(0, videoDuration - MIN_DURATION);
      duration = Math.min(MIN_DURATION, videoDuration);
    }
  }

  duration = clamp(duration, 1, MAX_DURATION);
  return { start, duration };
}

function adjustCuesForPreview(cues, previewStart, previewDuration) {
  const previewEnd = previewStart + previewDuration;
  return (cues || [])
    .filter((c) => c.end > previewStart && c.start < previewEnd)
    .map((c) => ({
      ...c,
      start: Math.max(0, c.start - previewStart),
      end: Math.min(previewDuration, c.end - previewStart),
    }));
}

function adjustBlurForPreview(blurRegions, previewStart) {
  return (blurRegions || []).map((r) => {
    const tr = r.time_range || { start: 0, end: null };
    const start = Math.max(0, (tr.start || 0) - previewStart);
    let end = tr.end != null && tr.end !== '' ? tr.end - previewStart : null;
    if (end != null && end < 0) end = 0;
    return {
      ...r,
      time_range: { start, end: end != null && end > 0 ? end : null },
    };
  });
}

function getDefaultSubtitleUiValues(videoWidth, videoHeight) {
  const aspectClass = classifyAspectRatio(videoWidth, videoHeight);
  const fontSize = computeDynamicFontSize(videoWidth, videoHeight);
  const margins = computeSafeMargins(videoWidth, videoHeight);
  const maxWidth = computeMaxWidthPercent(aspectClass);
  const stroke = computeStrokeWidth(fontSize);
  return {
    font_size: fontSize,
    margin_bottom: margins.safeBottomMargin,
    max_width_percent: maxWidth,
    outline_width: stroke,
    box_enabled: false,
    box_opacity: 0,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clamp,
    classifyAspectRatio,
    computeDynamicFontSize,
    computeSafeMargins,
    computeMaxWidthPercent,
    computeStrokeWidth,
    computePadding,
    percentToPx,
    pxToPercent,
    normalizeBlurRegion,
    blurRegionToPixels,
    computeSubtitleLayout,
    buildRenderConfig,
    computePreviewRange,
    adjustCuesForPreview,
    adjustBlurForPreview,
    getDefaultSubtitleUiValues,
  };
}

if (typeof window !== 'undefined') {
  window.RenderMath = {
    clamp,
    classifyAspectRatio,
    computeDynamicFontSize,
    computeSafeMargins,
    computeMaxWidthPercent,
    computeStrokeWidth,
    computePadding,
    percentToPx,
    pxToPercent,
    normalizeBlurRegion,
    blurRegionToPixels,
    computeSubtitleLayout,
    buildRenderConfig,
    computePreviewRange,
    adjustCuesForPreview,
    adjustBlurForPreview,
    getDefaultSubtitleUiValues,
  };
}