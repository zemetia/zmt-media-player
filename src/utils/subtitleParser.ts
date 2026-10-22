import { SubtitleCue, SubtitlePosition } from '../types';

/**
 * Detects whether a subtitle cue is positioned at the top, middle, or bottom of the screen.
 * Supports:
 * - ASS/SSA alignment tags: {\an7}, {\an8}, {\an9} (top), {\an4..6} (middle), {\an1..3} (bottom)
 * - Legacy SSA tags: {\a5..7} (top), {\a9..11} (middle), {\a1..3} (bottom)
 * - ASS \pos(x, y) coordinates
 * - WebVTT cue settings: line:0%..line:35%, line:0..4, position:top, align:top
 * - ASS Style table alignments and style names (e.g. "Sign", "Top", "TL", "Note")
 * - Bracketed on-screen sign translation conventions: [ ... ], 【 ... 】, (Catatan: ...), TL: ...
 */
export function detectCuePosition(
  rawText: string,
  timeLine?: string,
  styleAlignment?: number,
  styleName?: string
): SubtitlePosition | undefined {
// 1. Direct ASS/SSA tags on the dialogue text (supports standalone or combined tags like {\fs20\an8} or {\an8\b1})
  if (/\{[^}]*\\(an[789]|a[567])(?![0-9a-zA-Z])[^}]*\}/i.test(rawText) || /(?:^|[^a-zA-Z0-9])\\(an[789]|a[567])(?![0-9a-zA-Z])/i.test(rawText)) {
    return 'top';
  }
  if (/\{[^}]*\\(an[456]|a(9|10|11))(?![0-9a-zA-Z])[^}]*\}/i.test(rawText) || /(?:^|[^a-zA-Z0-9])\\(an[456]|a(9|10|11))(?![0-9a-zA-Z])/i.test(rawText)) {
    return 'middle';
  }
  if (/\{[^}]*\\(an[123]|a[123])(?![0-9a-zA-Z])[^}]*\}/i.test(rawText) || /(?:^|[^a-zA-Z0-9])\\(an[123]|a[123])(?![0-9a-zA-Z])/i.test(rawText)) {
    return 'bottom';
  }

  // 2. ASS \pos(x, y) tag detection (handles standalone or combined tags like {\pos(640,40)\c&HFFFFFF&})
  const posMatch = rawText.match(/\\pos\(\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
  if (posMatch) {
    const y = parseFloat(posMatch[1]);
    if (!isNaN(y)) {
      if (y <= 360) return 'top';
      if (y >= 680) return 'bottom';
      return 'middle';
    }
  }

  // 3. WebVTT cue settings on the timestamp line (e.g., "00:01.000 --> 00:03.000 line:10%")
  if (timeLine) {
    const linePercentMatch = timeLine.match(/line:(\d+)%/i);
    if (linePercentMatch) {
      const linePercent = parseInt(linePercentMatch[1], 10);
      if (linePercent <= 35) return 'top';
      if (linePercent >= 70) return 'bottom';
      return 'middle';
    }
    const lineNumMatch = timeLine.match(/line:(-?\d+)(?:\s|$|,)/i);
    if (lineNumMatch) {
      const lineNum = parseInt(lineNumMatch[1], 10);
      if (lineNum >= 0 && lineNum <= 4) return 'top';
      if (lineNum < 0 || lineNum >= 10) return 'bottom';
    }
    if (/position:(?:top|0%|10%|20%)/i.test(timeLine) || /align:top/i.test(timeLine)) {
      return 'top';
    }
  }

  // 4. ASS Style alignment or semantic style names
  if (styleAlignment !== undefined) {
    if ([7, 8, 9].includes(styleAlignment)) return 'top';
    if ([4, 5, 6].includes(styleAlignment)) return 'middle';
    if ([1, 2, 3].includes(styleAlignment)) return 'bottom';
  }

  if (styleName) {
    const lowerName = styleName.toLowerCase();
    if (/(top|sign|tl|note|title|header|screen|osd|caption|atas|staff|credit|keterangan|judul|name|banner)/i.test(lowerName)) {
      return 'top';
    }
  }

  // 5. Conventional translation / sign markers
  const trimmed = rawText.trim();
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('【') && trimmed.endsWith('】')) ||
    (trimmed.startsWith('［') && trimmed.endsWith('］')) ||
    /^(?:[([{\s])*(TL|T\/N|Sign|Catatan|Note|Info|Keterangan|Judul):?/i.test(trimmed)
  ) {
    return 'top';
  }

  return undefined;
}

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
    .replace(/\\N/gi, '\n') // ASS/SSA line breaks
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
    const rawText = textLines.join('\n');
    const position = detectCuePosition(rawText, timeLine);
    const text = cleanSubtitleText(rawText);

    if (text) {
      cues.push({
        id: idCounter++,
        startTime,
        endTime,
        text,
        ...(position ? { position } : {})
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

  // Skip WEBWTT header & metadata until the first timestamp line
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

      const rawText = textLines.join('\n');
      const position = detectCuePosition(rawText, line);
      const text = cleanSubtitleText(rawText);
      if (text) {
        cues.push({
          id: idCounter++,
          startTime,
          endTime,
          text,
          ...(position ? { position } : {})
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
  let styleIdx = 3;
  let textIdx = 9;

  // Map of Style Name -> Alignment
  const styleAlignments: Record<string, number> = {};
  let currentSection = '';
  let styleFormatNameIdx = 0;
  let styleFormatAlignIdx = -1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.toLowerCase();
      continue;
    }

    // Styles format header
    if (currentSection.includes('styles') && line.toLowerCase().startsWith('format:')) {
      const parts = line.substring(7).split(',').map(s => s.trim().toLowerCase());
      const nIdx = parts.indexOf('name');
      const aIdx = parts.indexOf('alignment');
      if (nIdx !== -1) styleFormatNameIdx = nIdx;
      if (aIdx !== -1) styleFormatAlignIdx = aIdx;
      continue;
    }

    // Style definition line
    if (currentSection.includes('styles') && line.toLowerCase().startsWith('style:')) {
      const parts = line.substring(6).split(',').map(s => s.trim());
      if (parts.length > styleFormatNameIdx) {
        const sName = parts[styleFormatNameIdx].toLowerCase();
        let alignment = 2; // default ASS bottom-center
        if (styleFormatAlignIdx !== -1 && parts.length > styleFormatAlignIdx) {
          const parsedAlign = parseInt(parts[styleFormatAlignIdx], 10);
          if (!isNaN(parsedAlign)) alignment = parsedAlign;
        }
        styleAlignments[sName] = alignment;
      }
      continue;
    }
    
    // Check for Format definition in [Events]
    if (line.toLowerCase().startsWith('format:')) {
      const formatParts = line.substring(7).split(',').map(s => s.trim().toLowerCase());
      const sIndex = formatParts.indexOf('start');
      const eIndex = formatParts.indexOf('end');
      const stIndex = formatParts.indexOf('style');
      const tIndex = formatParts.indexOf('text');
      if (sIndex !== -1) startIdx = sIndex;
      if (eIndex !== -1) endIdx = eIndex;
      if (stIndex !== -1) styleIdx = stIndex;
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
        const sName = (parts[styleIdx] || '').trim();
        const styleAlign = styleAlignments[sName.toLowerCase()];

        // Everything from textIdx to the end forms the dialogue text (which may contain commas)
        const rawText = parts.slice(textIdx).join(',').replace(/\\N/g, '\n').replace(/\\n/g, '\n');
        const position = detectCuePosition(rawText, undefined, styleAlign, sName);
        const text = cleanSubtitleText(rawText);

        if (text) {
          cues.push({
            id: idCounter++,
            startTime,
            endTime,
            text,
            ...(position ? { position } : {})
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
