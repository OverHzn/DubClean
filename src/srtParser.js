/**
 * Parse konten SRT jadi array cue.
 * @param {string} content - isi file .srt
 * @returns {{ index: number, start: number, end: number, text: string }[]}
 */
function parseSrt(content) {
  if (!content || typeof content !== 'string') return [];

  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\n+/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;

    let idx = 0;
    let index = cues.length + 1;

    if (/^\d+$/.test(lines[0].trim())) {
      index = parseInt(lines[0].trim(), 10);
      idx = 1;
    }

    const timeLine = lines[idx];
    const timeMatch = timeLine.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const start = toSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const end = toSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
    const text = lines.slice(idx + 1).join('\n').trim();

    cues.push({ index, start, end, text });
  }

  return cues;
}

function toSeconds(h, m, s, ms) {
  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms, 10) / 1000
  );
}

module.exports = { parseSrt };