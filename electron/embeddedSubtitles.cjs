const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);

// Cache for extracted embedded subtitles to avoid repeated probe/transcode:
// key: `${filePath}_${stat.mtimeMs}` -> Array of subtitle items
const subtitleCache = new Map();

// Standard 3-letter language code to human-readable language names
const LANGUAGE_NAMES = {
  ind: 'Indonesian',
  ina: 'Indonesian',
  id: 'Indonesian',
  eng: 'English',
  en: 'English',
  jpn: 'Japanese',
  ja: 'Japanese',
  kor: 'Korean',
  ko: 'Korean',
  zho: 'Chinese',
  chi: 'Chinese',
  zh: 'Chinese',
  spa: 'Spanish',
  es: 'Spanish',
  fra: 'French',
  fre: 'French',
  fr: 'French',
  deu: 'German',
  ger: 'German',
  de: 'German',
  ita: 'Italian',
  it: 'Italian',
  rus: 'Russian',
  ru: 'Russian',
  ara: 'Arabic',
  ar: 'Arabic',
  hin: 'Hindi',
  hi: 'Hindi',
  por: 'Portuguese',
  pt: 'Portuguese',
  vie: 'Vietnamese',
  vi: 'Vietnamese',
  tha: 'Thai',
  th: 'Thai',
  fil: 'Filipino',
  tl: 'Tagalog',
  msa: 'Malay',
  may: 'Malay',
  ms: 'Malay',
  und: 'Undetermined',
};

// QuickTime legacy Macintosh language code mapping
const MAC_LANG_MAP = {
  0: 'eng',
  1: 'fra',
  2: 'deu',
  3: 'ita',
  4: 'nld',
  5: 'swe',
  6: 'spa',
  7: 'dan',
  8: 'por',
  9: 'nor',
  10: 'heb',
  11: 'jpn',
  12: 'ara',
  13: 'fin',
  14: 'ell',
  15: 'isl',
  16: 'mlt',
  17: 'tur',
  18: 'hrv',
  19: 'zho',
  20: 'urd',
  21: 'hin',
  22: 'tha',
  23: 'kor',
  24: 'lit',
  25: 'pol',
  26: 'hun',
  27: 'est',
  28: 'lav',
  32: 'rus',
  81: 'ind',
};

let cachedFfmpegPath = null;
let cachedFfprobePath = null;

/**
 * Locate ffmpeg and ffprobe binaries
 */
async function findFfmpegBinaries() {
  if (cachedFfmpegPath && cachedFfprobePath) {
    return { ffmpeg: cachedFfmpegPath, ffprobe: cachedFfprobePath };
  }

  // 1. Try directly from PATH
  try {
    await execFileAsync('ffmpeg', ['-version']);
    await execFileAsync('ffprobe', ['-version']);
    cachedFfmpegPath = 'ffmpeg';
    cachedFfprobePath = 'ffprobe';
    return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
  } catch {}

  // 2. Check standard Windows WinGet / Program Files locations
  const candidateDirs = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
    'C:\\Program Files\\ffmpeg\\bin',
    'C:\\ffmpeg\\bin',
  ];

  for (const cDir of candidateDirs) {
    if (!fs.existsSync(cDir)) continue;
    try {
      const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            const found = walk(full);
            if (found) return found;
          } else if (e.name.toLowerCase() === 'ffmpeg.exe') {
            const probePath = path.join(dir, 'ffprobe.exe');
            if (fs.existsSync(probePath)) {
              return { ffmpeg: full, ffprobe: probePath };
            }
          }
        }
        return null;
      };

      const found = walk(cDir);
      if (found) {
        cachedFfmpegPath = found.ffmpeg;
        cachedFfprobePath = found.ffprobe;
        return found;
      }
    } catch {}
  }

  return { ffmpeg: null, ffprobe: null };
}

/**
 * Decode ISO 639-2 / Macintosh language code from MP4/MOV mdhd header
 */
function decodeIso639Language(code) {
  if (typeof code !== 'number' || code <= 0) return 'und';
  if (code >= 0x800) {
    const c1 = String.fromCharCode(((code >> 10) & 0x1f) + 0x60);
    const c2 = String.fromCharCode(((code >> 5) & 0x1f) + 0x60);
    const c3 = String.fromCharCode((code & 0x1f) + 0x60);
    const codeStr = c1 + c2 + c3;
    if (/^[a-z]{3}$/.test(codeStr)) {
      return codeStr;
    }
  }
  return MAC_LANG_MAP[code] || 'und';
}

function getLanguageDisplayName(langCode) {
  const norm = (langCode || '').toLowerCase().trim();
  return LANGUAGE_NAMES[norm] || (norm ? norm.toUpperCase() : 'Embedded');
}

/**
 * Format raw cues into clean WebVTT string
 */
function formatCuesToWebVTT(cues) {
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const formatTimeVTT = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    vtt += `${i + 1}\n`;
    vtt += `${formatTimeVTT(cue.startTime)} --> ${formatTimeVTT(cue.endTime)}\n`;
    vtt += `${cue.text}\n\n`;
  }
  return vtt;
}

/**
 * Primary extractor using FFprobe + FFmpeg
 */
async function extractWithFfmpeg(filePath) {
  const binaries = await findFfmpegBinaries();
  if (!binaries.ffprobe || !binaries.ffmpeg) {
    return null;
  }

  try {
    // 1. Probe for subtitle streams
    const { stdout: probeOutput } = await execFileAsync(binaries.ffprobe, [
      '-v', 'error',
      '-select_streams', 's',
      '-show_entries', 'stream=index,codec_name:stream_tags=language,title,handler_name',
      '-of', 'json',
      filePath,
    ], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });

    const data = JSON.parse(probeOutput);
    const streams = data.streams || [];
    if (streams.length === 0) {
      return [];
    }

    const results = [];

    // 2. Extract each subtitle stream to WebVTT
    for (let i = 0; i < streams.length; i++) {
      const stream = streams[i];
      const streamIndex = stream.index;
      const lang = (stream.tags?.language || 'und').toLowerCase();
      const langName = getLanguageDisplayName(lang);
      const streamTitle = stream.tags?.title || stream.tags?.handler_name;
      const label = streamTitle
        ? `${streamTitle} (${langName}) [Embedded]`
        : `${langName} [Embedded #${i + 1}]`;

      try {
        const { stdout: vttContent } = await execFileAsync(binaries.ffmpeg, [
          '-y',
          '-v', 'error',
          '-i', filePath,
          '-map', `0:${streamIndex}`,
          '-f', 'webvtt',
          '-',
        ], { timeout: 30000, maxBuffer: 50 * 1024 * 1024 });

        if (vttContent && vttContent.includes('-->')) {
          results.push({
            id: `embedded-${streamIndex}-${lang}-${i}`,
            name: `${label}.vtt`,
            label,
            language: lang,
            path: filePath,
            content: vttContent,
            isEmbedded: true,
          });
        }
      } catch (extractErr) {
        console.warn(`Failed to extract subtitle stream ${streamIndex} with ffmpeg:`, extractErr?.message || extractErr);
      }
    }

    return results;
  } catch (err) {
    console.warn('ffprobe execution failed:', err?.message || err);
    return null;
  }
}

/**
 * Pure JavaScript fallback parser for MP4/MOV container boxes
 * Reads ISO Base Media Format boxes (moov -> trak -> mdia -> minf -> stbl)
 * Parses mov_text, tx3g, text, and wvtt tracks with zero external tools
 */
function extractWithPureJs(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;

    function readBox(offset, maxOffset) {
      if (offset + 8 > maxOffset) return null;
      const buf = Buffer.alloc(8);
      fs.readSync(fd, buf, 0, 8, offset);
      let size = buf.readUInt32BE(0);
      const type = buf.toString('ascii', 4, 8);
      let headerSize = 8;
      if (size === 1) {
        const extBuf = Buffer.alloc(8);
        fs.readSync(fd, extBuf, 0, 8, offset + 8);
        size = Number(extBuf.readBigUInt64BE(0));
        headerSize = 16;
      } else if (size === 0) {
        size = maxOffset - offset;
      }
      return {
        type,
        size,
        offset,
        headerSize,
        payloadOffset: offset + headerSize,
        payloadSize: Math.max(0, size - headerSize),
      };
    }

    function findChildBoxes(offset, maxOffset) {
      const boxes = [];
      let cur = offset;
      while (cur < maxOffset) {
        const box = readBox(cur, maxOffset);
        if (!box || box.size < 8) break;
        boxes.push(box);
        cur += box.size;
      }
      return boxes;
    }

    function findBoxByType(boxes, type) {
      return boxes.find((b) => b.type === type);
    }

    const rootBoxes = findChildBoxes(0, fileSize);
    const moov = findBoxByType(rootBoxes, 'moov');
    if (!moov) return [];

    const moovChildren = findChildBoxes(moov.payloadOffset, moov.offset + moov.size);
    const traks = moovChildren.filter((b) => b.type === 'trak');
    const results = [];

    for (let trackIndex = 0; trackIndex < traks.length; trackIndex++) {
      const trak = traks[trackIndex];
      const trakChildren = findChildBoxes(trak.payloadOffset, trak.offset + trak.size);
      const mdia = findBoxByType(trakChildren, 'mdia');
      if (!mdia) continue;
      const mdiaChildren = findChildBoxes(mdia.payloadOffset, mdia.offset + mdia.size);
      const hdlr = findBoxByType(mdiaChildren, 'hdlr');
      if (!hdlr) continue;

      const hdlrBuf = Buffer.alloc(Math.min(32, hdlr.payloadSize));
      fs.readSync(fd, hdlrBuf, 0, hdlrBuf.length, hdlr.payloadOffset);
      const handlerType = hdlrBuf.toString('ascii', 8, 12).toLowerCase();
      if (!['sbtl', 'text', 'clcp', 'subt'].includes(handlerType)) {
        continue;
      }

      // Timescale and language from mdhd
      let timescale = 1000;
      let language = 'und';
      const mdhd = findBoxByType(mdiaChildren, 'mdhd');
      if (mdhd) {
        const mdhdBuf = Buffer.alloc(Math.min(36, mdhd.payloadSize));
        fs.readSync(fd, mdhdBuf, 0, mdhdBuf.length, mdhd.payloadOffset);
        const version = mdhdBuf.readUInt8(0);
        if (version === 0) {
          timescale = mdhdBuf.readUInt32BE(12) || 1000;
          language = decodeIso639Language(mdhdBuf.readUInt16BE(20));
        } else {
          timescale = mdhdBuf.readUInt32BE(20) || 1000;
          language = decodeIso639Language(mdhdBuf.readUInt16BE(32));
        }
      }

      const minf = findBoxByType(mdiaChildren, 'minf');
      if (!minf) continue;
      const minfChildren = findChildBoxes(minf.payloadOffset, minf.offset + minf.size);
      const stbl = findBoxByType(minfChildren, 'stbl');
      if (!stbl) continue;
      const stblChildren = findChildBoxes(stbl.payloadOffset, stbl.offset + stbl.size);

      const sttsBox = findBoxByType(stblChildren, 'stts');
      const stszBox = findBoxByType(stblChildren, 'stsz');
      const stscBox = findBoxByType(stblChildren, 'stsc');
      const stcoBox = findBoxByType(stblChildren, 'stco');
      const co64Box = findBoxByType(stblChildren, 'co64');

      if (!sttsBox || !stszBox || !stscBox || (!stcoBox && !co64Box)) continue;

      // Sample Durations (stts)
      const sttsBuf = Buffer.alloc(sttsBox.payloadSize);
      fs.readSync(fd, sttsBuf, 0, sttsBuf.length, sttsBox.payloadOffset);
      const sttsCount = sttsBuf.readUInt32BE(4);
      const sampleDurations = [];
      for (let s = 0; s < sttsCount; s++) {
        const count = sttsBuf.readUInt32BE(8 + s * 8);
        const delta = sttsBuf.readUInt32BE(12 + s * 8);
        for (let c = 0; c < count; c++) sampleDurations.push(delta);
      }

      // Sample Sizes (stsz)
      const stszBuf = Buffer.alloc(stszBox.payloadSize);
      fs.readSync(fd, stszBuf, 0, stszBuf.length, stszBox.payloadOffset);
      const uniformSize = stszBuf.readUInt32BE(4);
      const sampleCount = stszBuf.readUInt32BE(8);
      const sampleSizes = [];
      if (uniformSize !== 0) {
        for (let s = 0; s < sampleCount; s++) sampleSizes.push(uniformSize);
      } else {
        for (let s = 0; s < sampleCount; s++) {
          sampleSizes.push(stszBuf.readUInt32BE(12 + s * 4));
        }
      }

      // Chunk Offsets (stco or co64)
      const chunkOffsets = [];
      if (stcoBox) {
        const stcoBuf = Buffer.alloc(stcoBox.payloadSize);
        fs.readSync(fd, stcoBuf, 0, stcoBuf.length, stcoBox.payloadOffset);
        const chunkCount = stcoBuf.readUInt32BE(4);
        for (let c = 0; c < chunkCount; c++) {
          chunkOffsets.push(stcoBuf.readUInt32BE(8 + c * 4));
        }
      } else if (co64Box) {
        const co64Buf = Buffer.alloc(co64Box.payloadSize);
        fs.readSync(fd, co64Buf, 0, co64Buf.length, co64Box.payloadOffset);
        const chunkCount = co64Buf.readUInt32BE(4);
        for (let c = 0; c < chunkCount; c++) {
          chunkOffsets.push(Number(co64Buf.readBigUInt64BE(8 + c * 8)));
        }
      }

      // Sample to Chunk (stsc)
      const stscBuf = Buffer.alloc(stscBox.payloadSize);
      fs.readSync(fd, stscBuf, 0, stscBuf.length, stscBox.payloadOffset);
      const stscCount = stscBuf.readUInt32BE(4);
      const stscEntries = [];
      for (let c = 0; c < stscCount; c++) {
        stscEntries.push({
          firstChunk: stscBuf.readUInt32BE(8 + c * 12),
          samplesPerChunk: stscBuf.readUInt32BE(12 + c * 12),
        });
      }

      // Calculate file offsets for every sample
      const sampleOffsets = [];
      let currentSample = 0;
      for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
        const chunkNum = chunkIdx + 1;
        let samplesInThisChunk = 1;
        for (let e = 0; e < stscEntries.length; e++) {
          if (chunkNum >= stscEntries[e].firstChunk) {
            samplesInThisChunk = stscEntries[e].samplesPerChunk;
          } else {
            break;
          }
        }
        let offsetInChunk = chunkOffsets[chunkIdx];
        for (let s = 0; s < samplesInThisChunk && currentSample < sampleSizes.length; s++) {
          sampleOffsets.push(offsetInChunk);
          offsetInChunk += sampleSizes[currentSample];
          currentSample++;
        }
      }

      // Read text samples
      const cues = [];
      let currentTimeInTimescale = 0;
      let cueId = 1;

      for (let s = 0; s < sampleSizes.length; s++) {
        const dur = sampleDurations[s] || 0;
        const startTime = currentTimeInTimescale / timescale;
        const endTime = (currentTimeInTimescale + dur) / timescale;
        currentTimeInTimescale += dur;

        const size = sampleSizes[s];
        const offset = sampleOffsets[s];

        if (size > 2 && offset && offset < fileSize) {
          const sampleBuf = Buffer.alloc(Math.min(size, 4096));
          fs.readSync(fd, sampleBuf, 0, sampleBuf.length, offset);
          const textLen = sampleBuf.readUInt16BE(0);
          if (textLen > 0 && textLen <= sampleBuf.length - 2) {
            const text = sampleBuf.toString('utf8', 2, 2 + textLen).trim();
            if (text) {
              cues.push({ id: cueId++, startTime, endTime, text });
            }
          }
        }
      }

      if (cues.length > 0) {
        const langName = getLanguageDisplayName(language);
        const label = `${langName} [Embedded #${trackIndex + 1}]`;
        const vtt = formatCuesToWebVTT(cues);

        results.push({
          id: `embedded-purejs-${trackIndex}-${language}`,
          name: `${label}.vtt`,
          label,
          language,
          path: filePath,
          content: vtt,
          isEmbedded: true,
        });
      }
    }

    return results;
  } catch (err) {
    console.warn('Pure JS MP4 box parsing error:', err?.message || err);
    return [];
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

/**
 * Public function: get embedded subtitles for a video file
 * Checks cache, runs ffmpeg/ffprobe primary extractor, falls back to pure JS MP4 parser
 */
async function getEmbeddedSubtitles(filePath) {
  if (!filePath || typeof filePath !== 'string') return [];

  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) return [];

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) return [];

    const ext = path.extname(resolvedPath).toLowerCase();
    const videoExts = ['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.ts', '.avi'];
    if (!videoExts.includes(ext)) {
      return [];
    }

    const cacheKey = `${resolvedPath}_${stat.mtimeMs}_${stat.size}`;
    if (subtitleCache.has(cacheKey)) {
      return subtitleCache.get(cacheKey);
    }

    // 1. Try primary extractor (FFprobe + FFmpeg)
    let subtitles = await extractWithFfmpeg(resolvedPath);

    // 2. If ffmpeg is unavailable or returned null/empty and file is MP4/MOV/M4V, use pure JS parser
    if ((!subtitles || subtitles.length === 0) && (ext === '.mp4' || ext === '.mov' || ext === '.m4v')) {
      const pureJsResults = extractWithPureJs(resolvedPath);
      if (pureJsResults && pureJsResults.length > 0) {
        subtitles = pureJsResults;
      }
    }

    const result = subtitles || [];
    subtitleCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('getEmbeddedSubtitles failed for', filePath, err);
    return [];
  }
}

module.exports = {
  getEmbeddedSubtitles,
  extractWithFfmpeg,
  extractWithPureJs,
  findFfmpegBinaries,
  getLanguageDisplayName,
  decodeIso639Language,
};
