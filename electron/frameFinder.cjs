/**
 * Fast "find this screenshot in the video" for intro/outro detection (main process, ffmpeg).
 *
 * Seeking an <video> element ~700 times to probe a 24 min episode is slow. Here ffmpeg does the work
 * in two cheap passes instead:
 *
 *  1. Coarse: decode ONLY keyframes (`-skip_frame nokey`) of the region where an intro/outro can be
 *     (first / last 9 min first, the rest of the file only if needed) as 32x18 gray thumbnails and rank
 *     them against the screenshot with NCC. Roughly one keyframe per 2-10 s => 100-250 tiny frames.
 *  2. Fine: for the few best candidates decode the frames around them (the neighbouring GOPs, skipping
 *     non-reference frames) as 64x36 gray thumbnails and pick the NCC peak. Stops at the first
 *     confident window.
 *
 * Everything runs in low-priority child processes with a couple of decoder threads, no hwaccel (its
 * start-up cost is larger than the saving for this little work) and no temp files.
 */

const { spawn } = require('child_process');
const os = require('os');

const COARSE_W = 32;
const COARSE_H = 18;
const FINE_W = 64;
const FINE_H = 36;

/** Frames flatter than this (std-dev of luma) carry no information (black / white / fades). */
const MIN_STD = 4;
/** Region (seconds) searched first at each end of the file. */
const PRIMARY_SPAN = 540;
/** Coarse gate: a keyframe only becomes a candidate above this NCC, and at most this many are tried. */
const COARSE_MIN_NCC = 0.45;
const MAX_CANDIDATES = 4;
/** Longest stretch decoded on each side of a candidate keyframe (sparse-keyframe files). */
const MAX_SIDE_SECONDS = 20;
/** A window whose best score reaches this is accepted without looking at the remaining candidates. */
const CONFIDENT_PERCENT = 90;
/** At 64x36 a real match scores 95+; look-alike shots of the same scene land in the 70s-80s. */
const MIN_ACCEPT_PERCENT = 85;

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------------------------

/** Zero-mean, unit-norm vector so that a dot product equals the NCC. Null for flat frames. */
function normalizeGray(gray) {
  const n = gray.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const mean = sum / n;
  const out = new Float32Array(n);
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = gray[i] - mean;
    out[i] = d;
    sq += d * d;
  }
  if (Math.sqrt(sq / n) < MIN_STD) return null;
  const inv = 1 / Math.sqrt(sq);
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Same mapping as the renderer (src/utils/frameSignature.ts): 0.90 NCC => 75 %, 0.98 => 95 %. */
function nccToPercent(ncc) {
  return Math.round(Math.max(0, Math.min(1, (ncc - 0.6) / 0.4)) * 100);
}

/** Box-filter a w x h gray image down by 2 in both directions. */
function downsample2x(gray, w, h) {
  const ow = w >> 1;
  const oh = h >> 1;
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const i = y * 2 * w + x * 2;
      out[y * ow + x] = (gray[i] + gray[i + 1] + gray[i + w] + gray[i + w + 1] + 2) >> 2;
    }
  }
  return out;
}

/** Frame timestamps (seconds, in output order) from ffmpeg's `showinfo` log lines. */
function parseShowinfoTimes(log) {
  const times = [];
  const re = /pts_time:\s*(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(log))) times.push(parseFloat(m[1]));
  return times;
}

/** Search regions in the order they are tried: the likely end of the file first, then the rest. */
function planRegions(kind, duration) {
  if (kind === 'intro') {
    const cut = Math.min(duration * 0.45, PRIMARY_SPAN);
    return [
      [0, cut],
      [cut, duration],
    ].filter(([a, b]) => b - a > 1);
  }
  const cut = Math.max(duration * 0.55, duration - PRIMARY_SPAN);
  return [
    [cut, duration],
    [0, cut],
  ].filter(([a, b]) => b - a > 1);
}

/** Best coarse keyframes (highest NCC first), above the gate. */
function rankCandidates(times, scores, limit = MAX_CANDIDATES, minNcc = COARSE_MIN_NCC) {
  const idx = [];
  for (let i = 0; i < times.length; i++) if (scores[i] >= minNcc) idx.push(i);
  idx.sort((a, b) => scores[b] - scores[a]);
  return idx.slice(0, limit);
}

/**
 * Time window to decode for the keyframe at `i`: the frame being looked for lies between the previous
 * and the next keyframe, so both gaps are covered (each capped for files with sparse keyframes).
 */
function candidateWindow(times, i, duration) {
  const t = times[i];
  const prev = i > 0 ? times[i - 1] : Math.max(0, t - MAX_SIDE_SECONDS);
  const next = i + 1 < times.length ? times[i + 1] : Math.min(duration, t + 10);
  const start = Math.max(prev, t - MAX_SIDE_SECONDS, 0);
  const end = Math.min(next, t + MAX_SIDE_SECONDS, duration);
  return [start, Math.max(end, start + 0.5)];
}

// ---------------------------------------------------------------------------------------------
// ffmpeg plumbing
// ---------------------------------------------------------------------------------------------

let useFpsMode = true;

const CORES = os.cpus()?.length || 4;
/** ffmpeg processes alive at once (across intro + outro + chunks): enough to be fast, few enough to stay light. */
const MAX_PROCS = Math.max(2, Math.min(6, Math.floor(CORES / 2)));

let activeProcs = 0;
const waiting = [];

/** Runs `fn` once a process slot is free. */
async function withSlot(fn) {
  if (activeProcs >= MAX_PROCS) await new Promise((resolve) => waiting.push(resolve));
  activeProcs++;
  try {
    return await fn();
  } finally {
    activeProcs--;
    waiting.shift()?.();
  }
}

/** Frame threading helps P/B decoding; a keyframe-only pass is entropy-decode bound, so 1 thread. */
function decoderThreads(keyframesOnly) {
  return keyframesOnly ? '1' : String(Math.max(2, Math.min(4, Math.floor(CORES / 4))));
}

/**
 * Runs ffmpeg and returns the raw gray frames (concatenated) plus the timestamp of every frame.
 * `start` is where the window begins; output timestamps are relative to it, so they are shifted back.
 */
function decodeGrayFrames(ffmpeg, filePath, opts) {
  const { start, length, width, height, keyframesOnly, signal, threads } = opts;
  const frameBytes = width * height;

  const attempt = () =>
    withSlot(() => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('aborted'));

      const args = [
        '-hide_banner',
        '-nostdin',
        '-nostats',
        '-loglevel',
        'info',
        '-threads',
        threads || decoderThreads(keyframesOnly),
        '-skip_loop_filter',
        'all',
        '-skip_frame',
        keyframesOnly ? 'nokey' : 'noref',
        '-ss',
        start.toFixed(3),
        '-t',
        length.toFixed(3),
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-an',
        '-sn',
        '-dn',
        '-vf',
        `scale=${width}:${height}:flags=area,format=gray,showinfo`,
        ...(useFpsMode ? ['-fps_mode', 'passthrough'] : ['-vsync', '0']),
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        'pipe:1',
      ];

      const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      try {
        if (child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        /* priority is best-effort */
      }

      const out = [];
      let err = '';
      child.stdout.on('data', (c) => out.push(c));
      child.stderr.on('data', (c) => {
        err += c.toString('latin1');
      });

      const onAbort = () => child.kill();
      signal?.addEventListener('abort', onAbort, { once: true });

      child.on('error', (e) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      });
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) return reject(new Error('aborted'));
        if (code !== 0) {
          const e = new Error(`ffmpeg exited with ${code}`);
          e.stderr = err;
          return reject(e);
        }
        const buf = Buffer.concat(out);
        const times = parseShowinfoTimes(err);
        const count = Math.min(Math.floor(buf.length / frameBytes), times.length);
        resolve({ buf, count, times: times.slice(0, count).map((t) => start + t) });
      });
    }));

  return attempt().catch((e) => {
    // Pre-5.1 ffmpeg has no -fps_mode.
    if (useFpsMode && /fps_mode/i.test(e?.stderr || '')) {
      useFpsMode = false;
      return attempt();
    }
    throw e;
  });
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

/** Longest stretch one keyframe-pass process handles. */
const CHUNK_SECONDS = 60;

/** Splits [start, end) into at most `maxParts` equal chunks of roughly CHUNK_SECONDS or more. */
function splitRange(start, end, maxParts = MAX_PROCS) {
  const parts = Math.max(1, Math.min(maxParts, Math.ceil((end - start) / CHUNK_SECONDS)));
  const step = (end - start) / parts;
  return Array.from({ length: parts }, (_, i) => [start + i * step, start + (i + 1) * step]);
}

/** Keyframe times of [start, end) and each one's coarse NCC against `refCoarse`, in time order. */
async function keyframePass(ffmpeg, filePath, start, end, refCoarse, signal) {
  const fb = COARSE_W * COARSE_H;
  const chunks = await Promise.all(
    splitRange(start, end).map(async ([a, b]) => {
      const r = await decodeGrayFrames(ffmpeg, filePath, {
        start: a,
        length: b - a,
        width: COARSE_W,
        height: COARSE_H,
        keyframesOnly: true,
        signal,
      });
      const scores = new Float32Array(r.count).fill(-1);
      for (let i = 0; i < r.count; i++) {
        const v = normalizeGray(r.buf.subarray(i * fb, (i + 1) * fb));
        if (v) scores[i] = dot(refCoarse, v);
      }
      return { times: r.times, scores };
    })
  );

  const times = [];
  const scores = [];
  for (const c of chunks) {
    for (let i = 0; i < c.times.length; i++) {
      if (times.length && c.times[i] - times[times.length - 1] < 0.001) continue; // chunk seam
      times.push(c.times[i]);
      scores.push(c.scores[i]);
    }
  }
  return { times, scores };
}

/**
 * Last resort for a region whose keyframes did not resemble the screenshot (dark fade-ins, a frame
 * deep inside a moving shot): decode every reference frame of the region, split over a few processes,
 * and take the NCC peak directly.
 */
async function densePass(ffmpeg, filePath, start, end, refFine, signal) {
  const fb = FINE_W * FINE_H;
  const parts = await Promise.all(
    splitRange(start, end).map(async ([a, b]) => {
      const r = await decodeGrayFrames(ffmpeg, filePath, {
        start: a,
        length: b - a,
        width: FINE_W,
        height: FINE_H,
        keyframesOnly: false,
        threads: '2',
        signal,
      });
      let best = null;
      for (let f = 0; f < r.count; f++) {
        const v = normalizeGray(r.buf.subarray(f * fb, (f + 1) * fb));
        if (!v) continue;
        const ncc = dot(refFine, v);
        if (!best || ncc > best.ncc) best = { ncc, time: r.times[f] };
      }
      return { best, frames: r.count };
    })
  );
  let best = null;
  let frames = 0;
  for (const part of parts) {
    frames += part.frames;
    if (part.best && (!best || part.best.ncc > best.ncc)) best = part.best;
  }
  return { best, frames };
}

/**
 * @param {object} p
 * @param {string} p.ffmpeg      path to ffmpeg
 * @param {string} p.filePath    video file
 * @param {number} p.duration    seconds
 * @param {'intro'|'outro'} p.kind
 * @param {Uint8Array} p.gray    reference screenshot as FINE_W x FINE_H gray
 * @param {number} [p.sensitivity] 0..100 (same scale as the renderer)
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<{found:boolean,time?:number,score?:number,keyframes:number,windows:number,elapsedMs:number}>}
 */
async function findFrame(p) {
  const { ffmpeg, filePath, duration, kind, gray, signal } = p;
  const sensitivity = Math.max(p.sensitivity ?? 75, MIN_ACCEPT_PERCENT);
  const startedAt = Date.now();
  const stats = { keyframes: 0, windows: 0, denseFrames: 0 };

  const refFine = normalizeGray(gray);
  if (!refFine) throw new Error('reference frame is flat');
  const refCoarse = normalizeGray(downsample2x(gray, FINE_W, FINE_H));
  if (!refCoarse) throw new Error('reference frame is flat at coarse size');

  const finish = (extra) => ({ found: false, ...stats, elapsedMs: Date.now() - startedAt, ...extra });
  const evaluated = []; // windows already decoded in full

  const regions = planRegions(kind, duration);
  for (let ri = 0; ri < regions.length; ri++) {
    const [rs, re] = regions[ri];
    // 1. keyframes of the region (split over a few processes: I-frame decoding is single-threaded)
    const coarse = await keyframePass(ffmpeg, filePath, rs, re, refCoarse, signal);
    const scores = coarse.scores;
    stats.keyframes += coarse.times.length;

    // 2. frames around the best keyframes
    let best = null;
    for (const i of rankCandidates(coarse.times, scores)) {
      const t = coarse.times[i];
      if (evaluated.some(([a, b]) => t >= a && t <= b)) continue;
      const [ws, we] = candidateWindow(coarse.times, i, duration);
      evaluated.push([ws, we]);

      const fine = await decodeGrayFrames(ffmpeg, filePath, {
        start: ws,
        length: we - ws,
        width: FINE_W,
        height: FINE_H,
        keyframesOnly: false,
        signal,
      });
      stats.windows++;
      const ffb = FINE_W * FINE_H;
      for (let f = 0; f < fine.count; f++) {
        const v = normalizeGray(fine.buf.subarray(f * ffb, (f + 1) * ffb));
        if (!v) continue;
        const ncc = dot(refFine, v);
        if (!best || ncc > best.ncc) best = { ncc, time: fine.times[f] };
      }
      if (best && nccToPercent(best.ncc) >= Math.max(sensitivity, CONFIDENT_PERCENT)) break;
    }

    if (best && nccToPercent(best.ncc) >= sensitivity) {
      return finish({ found: true, time: Math.max(0, best.time), score: nccToPercent(best.ncc) });
    }

    // Likely region only: look at every reference frame before moving on to the rest of the file.
    if (ri === 0) {
      const dense = await densePass(ffmpeg, filePath, rs, re, refFine, signal);
      stats.denseFrames += dense.frames;
      if (dense.best && nccToPercent(dense.best.ncc) >= sensitivity) {
        return finish({
          found: true,
          time: Math.max(0, dense.best.time),
          score: nccToPercent(dense.best.ncc),
        });
      }
    }
  }
  return finish({});
}

module.exports = {
  FINE_W,
  FINE_H,
  findFrame,
  normalizeGray,
  nccToPercent,
  downsample2x,
  parseShowinfoTimes,
  planRegions,
  rankCandidates,
  candidateWindow,
  splitRange,
};
