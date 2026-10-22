import { SubtitleCue } from '../types';

/**
 * Converts timestamp string (SRT "00:01:23,456" or VTT "00:01:23.456" or "01:23.456" or ASS "1:23.45") to seconds.
 */
export function parseTimestampToSeconds(timestamp: string): number {
  if (!timestamp) return 0;
  // Isolate the timestamp token from any trailing cue settings (e.g., "00:01:23.456 align:center")
  const token = timestamp.trim().split(/\s+/)[0].replace(',', '.');
  const parts = token.split(':');
  
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds)) return 0;
    return minutes * 60 + seconds;
  }
  const val = parseFloat(token);
  return isNaN(val) ? 0 : val;
}

/**
 * Format seconds into HH:MM:SS or MM:SS string
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formattedMins = String(mins).padStart(2, '0');
  const formattedSecs = String(secs).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${formattedMins}:${formattedSecs}`;
}

/**
 * Cleans styling tags like <b>, <i>, <font>, {\an8}, {\pos(x,y)}, etc.
 */
export function cleanSubtitleText(raw: string): string {
  return raw
    .replace(/\{[^}]+\}/g, '') // remove ASS style tags
    .replace(/<\/?[^>]+(>|$)/g, '') // remove HTML tags
    .replace(/\\h/g, ' ') // ASS non-breaking space
    .trim();
}

/**
 * Parses SRT content into an array of SubtitleCue
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);

  let idCounter = 1;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    let timeLineIdx = 0;
    // Check if line 0 is an index number
    if (/^\d+$/.test(lines[0].trim()) && lines.length > 1) {
      timeLineIdx = 1;
    }

    const timeLine = lines[timeLineIdx];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
    const startTime = parseTimestampToSeconds(startStr);
    const endTime = parseTimestampToSeconds(endStr);

    const textLines = lines.slice(timeLineIdx + 1);
    const text = cleanSubtitleText(textLines.join('\n'));

    if (text) {
      cues.push({
        id: idCounter++,
        startTime,
        endTime,
        text
      });
    }
  }

  return cues;
}

/**
 * Parses WebVTT content
 */
export function parseVTT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  let idCounter = 1;
  let i = 0;

  // Skip WEBVTT header & metadata until the first timestamp line
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startRaw, endRaw] = line.split('-->').map(s => s.trim().split(' ')[0]);
      const startTime = parseTimestampToSeconds(startRaw);
      const endTime = parseTimestampToSeconds(endRaw);

      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i]);
        i++;
      }

      const text = cleanSubtitleText(textLines.join('\n'));
      if (text) {
        cues.push({
          id: idCounter++,
          startTime,
          endTime,
          text
        });
      }
    } else {
      i++;
    }
  }

  return cues;
}

/**
 * Parses ASS/SSA content
 */
export function parseASS(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let idCounter = 1;

  let startIdx = 1;
  let endIdx = 2;
  let textIdx = 9;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    
    // Check for Format definition in [Events]
    if (line.toLowerCase().startsWith('format:')) {
      const formatParts = line.substring(7).split(',').map(s => s.trim().toLowerCase());
      const sIndex = formatParts.indexOf('start');
      const eIndex = formatParts.indexOf('end');
      const tIndex = formatParts.indexOf('text');
      if (sIndex !== -1) startIdx = sIndex;
      if (eIndex !== -1) endIdx = eIndex;
      if (tIndex !== -1) textIdx = tIndex;
      continue;
    }

    if (line.toLowerCase().startsWith('dialogue:')) {
      const prefixLength = line.indexOf(':') + 1;
      const parts = line.substring(prefixLength).split(',');
      const minRequired = Math.max(startIdx, endIdx, textIdx) + 1;
      
      if (parts.length >= minRequired) {
        const startStr = parts[startIdx].trim();
        const endStr = parts[endIdx].trim();
        const startTime = parseTimestampToSeconds(startStr);
        const endTime = parseTimestampToSeconds(endStr);
        // Everything from textIdx to the end forms the dialogue text (which may contain commas)
        const rawText = parts.slice(textIdx).join(',').replace(/\\N/g, '\n').replace(/\\n/g, '\n');
        const text = cleanSubtitleText(rawText);

        if (text) {
          cues.push({
            id: idCounter++,
            startTime,
            endTime,
            text
          });
        }
      }
    }
  }

  return cues;
}

/**
 * Automatically detect format and parse
 */
export function parseSubtitleFile(content: string, filename: string): SubtitleCue[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.vtt') || content.trim().startsWith('WEBVTT')) {
    return parseVTT(content);
  } else if (lower.endsWith('.ass') || lower.endsWith('.ssa') || content.includes('[Events]')) {
    return parseASS(content);
  }
  // Default to SRT
  return parseSRT(content);
}
