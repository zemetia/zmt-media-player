import { FrameSignature, SignatureFrame, VisualFingerprint } from '../types';
import { fastFindFrame } from './fastFrameFinder';
import {
  FrameGrabber,
  PreparedReference,
  grayToBase64,
  matchProbe,
  normalizeGray,
  prepareReference,
} from './frameSignature';

/**
 * Fast intro/outro locator.
 *
 * Instead of comparing every frame (or a dense grid) against one reference image, the scanner:
 *  1. Uses a multi-frame *signature* of the whole OP/ED, so ONE probe landing anywhere inside the
 *     segment is enough to recognise it and to compute where it started.
 *  2. Probes in priority order and stops at the first verified hit:
 *       prior (where previous episodes had it) -> anchors (typical places) -> sparse grid
 *       -> rare regions (intro in the middle / outro near the start).
 *  3. Verifies a candidate with 2-3 extra probes at other offsets of the signature (rejects look-alike
 *     dialogue frames) and derives the start from the median alignment.
 *  4. Runs intro and outro concurrently with a small decoder pool, honouring "outro after intro".
 */

export interface ScanResult {
  introStart?: number;
  introEnd?: number;
  outroStart?: number;
  outroEnd?: number;
  /** Full search finished without a hit: this episode has no intro/outro (cache it, don't rescan). */
  introMissing?: boolean;
  outroMissing?: boolean;
  /** Signatures learned from this episode when only a single reference frame existed. */
  introSignature?: FrameSignature;
  outroSignature?: FrameSignature;
  probes: number;
  elapsedMs: number;
  scannedAt: number;
}

export type MarkerKind = 'intro' | 'outro';

export interface ScanOptions {
  videoUrl: string;
  duration?: number;
  introImage?: VisualFingerprint;
  outroImage?: VisualFingerprint;
  introSignature?: FrameSignature;
  outroSignature?: FrameSignature;
  introDuration?: number;
  outroDuration?: number;
  introSensitivity?: number;
  outroSensitivity?: number;
  /** Intro start times (s) found in earlier episodes of the same series, most recent first. */
  introPriors?: number[];
  /** Outro start times measured from the end of earlier episodes (duration - outroStart). */
  outroPriorsFromEnd?: number[];
  /** Absolute outro start times of earlier episodes (for episodes whose duration is unknown). */
  outroPriorsAbs?: number[];
  /** Learn a multi-frame signature from the first hit when the reference is a single frame. */
  learnSignature?: boolean;
  /** Stop searching after this long (the result is then partial and nothing is marked missing). */
  budgetMs?: number;
  onProgress?: (percent: number, status: string) => void;
  onFound?: (kind: MarkerKind, marker: { start: number; end: number }) => void;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------------------------
// Probe planning (pure, unit-tested)
// ---------------------------------------------------------------------------------------------

export interface ProbeStage {
  name: string;
  times: number[];
}

interface PlanInput {
  duration: number;
  /** Length of the segment covered by the reference (signature span or configured duration). */
  span: number;
  /** True when a multi-frame signature exists (sparse probing); false = single frame (dense, slow). */
  multi: boolean;
  /** Time the reference frame was captured at in the reference episode. */
  capturedAt?: number;
}

export interface IntroPlanInput extends PlanInput {
  priors?: number[];
}

export interface OutroPlanInput extends PlanInput {
  priorsFromEnd?: number[];
  priorsAbs?: number[];
}

function clampSpan(span: number): number {
  return Math.max(30, Math.min(150, span || 90));
}

/** Grid step: dense enough that >= 2 probes always land inside a segment of length `span`. */
export function gridStep(span: number, multi: boolean): number {
  return multi ? Math.max(12, Math.min(40, clampSpan(span) * 0.45)) : 2;
}

function makeCollector(duration: number, multi: boolean) {
  const seen = new Set<number>();
  const resolution = multi ? 1 : 0.5;
  const lo = 0;
  const hi = Math.max(0, duration - 1);
  return (list: number[], t: number) => {
    if (!Number.isFinite(t)) return;
    const c = Math.min(hi, Math.max(lo, t));
    const key = Math.round(c / resolution);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(Math.round(c * 2) / 2);
  };
}

export function planIntroProbes(input: IntroPlanInput): ProbeStage[] {
  const { duration, multi, capturedAt, priors = [] } = input;
  const span = clampSpan(input.span);
  const add = makeCollector(duration, multi);
  const step = gridStep(span, multi);
  const stages: ProbeStage[] = [];

  // 1. Where previous episodes (and the reference capture) had it.
  const prior: number[] = [];
  const known = [...priors.slice(0, 5)];
  if (capturedAt !== undefined && capturedAt >= 0) known.push(capturedAt);
  for (const p of known) add(prior, p);
  for (const p of known) {
    if (multi) {
      add(prior, p + span * 0.3);
      add(prior, p - span * 0.3);
    } else {
      for (const d of [-1, 1, -2, 2]) add(prior, p + d);
    }
  }
  stages.push({ name: 'prior', times: prior });

  // 2. Typical cold-open boundaries.
  const anchors: number[] = [];
  const anchorList = multi ? [0, 45, 90, 135, 180, 240, 300] : [0, 60, 90, 120, 150, 180];
  for (const a of anchorList) {
    add(anchors, a);
    if (!multi) {
      add(anchors, a + 1);
      add(anchors, a - 1);
    }
  }
  stages.push({ name: 'anchor', times: anchors });

  // 3. Sparse grid over the first part of the episode.
  const primaryEnd = Math.min(duration * 0.45, 540);
  const grid: number[] = [];
  for (let t = 0; t <= primaryEnd; t += step) add(grid, t);
  stages.push({ name: 'grid', times: grid });

  // 4. Rare: intro in the middle / near the end.
  const mid: number[] = [];
  const midStep = multi ? step : 4;
  for (let t = primaryEnd; t <= duration - 3; t += midStep) add(mid, t);
  stages.push({ name: 'mid', times: mid });

  return stages.filter((s) => s.times.length > 0);
}

export function planOutroProbes(input: OutroPlanInput): ProbeStage[] {
  const { duration, multi, capturedAt, priorsFromEnd = [], priorsAbs = [] } = input;
  const span = clampSpan(input.span);
  const add = makeCollector(duration, multi);
  const step = gridStep(span, multi);
  const stages: ProbeStage[] = [];

  // 1. Priors measured from the end first (ED position is stable relative to the end), then absolute.
  const prior: number[] = [];
  const known = [
    ...priorsFromEnd.slice(0, 5).map((q) => duration - q),
    ...priorsAbs.slice(0, 3),
  ];
  if (capturedAt !== undefined && capturedAt >= 0) known.push(capturedAt);
  for (const p of known) add(prior, p);
  for (const p of known) {
    if (multi) {
      add(prior, p + span * 0.3);
      add(prior, p - span * 0.3);
    } else {
      for (const d of [-1, 1, -2, 2]) add(prior, p + d);
    }
  }
  stages.push({ name: 'prior', times: prior });

  // 2. Typical distances from the end (credits + next-episode preview).
  const anchors: number[] = [];
  const offsets = multi ? [40, 70, 100, 130, 160, 190, 230, 280] : [60, 75, 90, 100, 120, 150, 180];
  for (const off of offsets) {
    add(anchors, duration - off);
    if (!multi) {
      add(anchors, duration - off + 1);
      add(anchors, duration - off - 1);
    }
  }
  stages.push({ name: 'anchor', times: anchors });

  // 3. Sparse grid backwards from the end.
  const primaryStart = Math.max(duration * 0.55, duration - 540);
  const grid: number[] = [];
  for (let t = duration - 5; t >= primaryStart; t -= step) add(grid, t);
  stages.push({ name: 'grid', times: grid });

  // 4. Rare: outro in the middle (and, last of all, before an already-found intro).
  const mid: number[] = [];
  const midStep = multi ? step : 4;
  for (let t = primaryStart; t >= 3; t -= midStep) add(mid, t);
  stages.push({ name: 'mid', times: mid });

  return stages.filter((s) => s.times.length > 0);
}

// ---------------------------------------------------------------------------------------------
// Candidate verification (pure given a probe source, unit-tested)
// ---------------------------------------------------------------------------------------------

export interface ProbeSource {
  /** Normalised 16x9 vector of the frame at time t, or null when unreadable / flat. */
  probe(t: number): Promise<Float32Array | null>;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Snaps a coarse start estimate onto the real cut: the earliest time (0.5s resolution) in a +-4s
 * window whose frame matches the first frames of the signature. Static shots make the alignment
 * estimate ambiguous by a couple of seconds; the cut itself is not.
 */
async function refineStart(
  source: ProbeSource,
  ref: PreparedReference,
  estimate: number,
  sensitivity: number,
  duration: number
): Promise<number> {
  const lo = Math.max(0, Math.floor(estimate) - 4);
  const hi = Math.min(Math.max(0, duration - 0.5), estimate + 4);
  const passes = async (t: number) => {
    const v = await source.probe(t);
    return !!v && matchProbe(ref, v, { center: 0.75, radius: 1 }).score >= sensitivity - 5;
  };
  for (let t = lo; t <= hi; t += 1) {
    if (await passes(t)) {
      if (t - 0.5 >= lo && (await passes(t - 0.5))) return t - 0.5;
      return t;
    }
  }
  return estimate;
}

/**
 * Checks whether the segment described by `ref` is present around probe time `t`.
 * Returns the estimated start of the segment, or null.
 */
export async function evaluateCandidate(
  source: ProbeSource,
  ref: PreparedReference,
  t: number,
  sensitivity: number,
  duration: number
): Promise<{ start: number; confidence: number } | null> {
  const vec = await source.probe(t);
  if (!vec) return null;
  const first = matchProbe(ref, vec);

  // Single reference frame: dense probing, refine to the local peak.
  if (!ref.multi) {
    if (first.score < sensitivity) return null;
    let bestT = t;
    let bestScore = first.score;
    for (const dt of [-1, -0.5, 0.5, 1]) {
      const tt = Math.min(Math.max(0, t + dt), Math.max(0, duration - 0.5));
      const v = await source.probe(tt);
      if (!v) continue;
      const s = matchProbe(ref, v).score;
      if (s > bestScore) {
        bestScore = s;
        bestT = tt;
      }
    }
    return { start: Math.max(0, bestT - ref.frames[0].o), confidence: bestScore };
  }

  // Multi-frame signature: loose gate, then verify at other offsets.
  if (first.score < sensitivity - 12) return null;
  const s0 = t - first.offset;
  const estimates = [s0];

  const span = ref.frames[ref.frames.length - 1].o || ref.span;
  const checks = [0.18, 0.5, 0.82]
    .map((f) => span * f)
    .filter((o) => Math.abs(o - first.offset) > 4);

  let tried = 0;
  let passes = 0;
  for (const o of checks) {
    const tv = s0 + o;
    if (tv < 0 || tv > duration - 0.5) continue;
    tried++;
    const v = await source.probe(tv);
    if (!v) continue;
    const m = matchProbe(ref, v, { center: o, radius: 1.5 });
    if (m.score >= sensitivity - 8) {
      passes++;
      estimates.push(tv - m.offset);
    }
  }

  const needed = tried >= 3 ? 2 : tried;
  if (tried === 0 ? first.score < sensitivity + 5 : passes < needed) return null;

  const aligned = Math.max(0, Math.round(median(estimates) * 2) / 2);
  return {
    start: await refineStart(source, ref, aligned, sensitivity, duration),
    confidence: Math.round((first.score + (tried ? (passes / tried) * 100 : first.score)) / 2),
  };
}

// ---------------------------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------------------------

const SEEK_TIMEOUT_MS = 4000;

function openVideo(videoUrl: string, signal?: AbortSignal): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('Document is undefined'));
    if (signal?.aborted) return reject(new Error('Scan aborted'));

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      video.crossOrigin = 'anonymous';
    }

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onLoaded = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video metadata for scanning'));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('Scan aborted'));
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    video.src = videoUrl;
  });
}

class FrameProber implements ProbeSource {
  private grabber = new FrameGrabber();
  constructor(private video: HTMLVideoElement) {}

  static async open(url: string, signal?: AbortSignal): Promise<FrameProber> {
    return new FrameProber(await openVideo(url, signal));
  }

  get duration(): number {
    return this.video.duration;
  }

  private seek(t: number): Promise<boolean> {
    const v = this.video;
    const max = Number.isFinite(v.duration) ? Math.max(0, v.duration - 0.05) : t;
    const target = Math.min(Math.max(0, t), max);
    if (Math.abs(v.currentTime - target) < 0.02 && v.readyState >= 2) return Promise.resolve(true);

    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeEventListener('seeked', onSeeked);
        v.removeEventListener('error', onError);
        resolve(ok);
      };
      const onSeeked = () => finish(true);
      const onError = () => finish(false);
      const timer = setTimeout(() => finish(false), SEEK_TIMEOUT_MS);
      v.addEventListener('seeked', onSeeked);
      v.addEventListener('error', onError);
      v.currentTime = target;
    });
  }

  async probeGray(t: number): Promise<Uint8Array | null> {
    if (!(await this.seek(t))) return null;
    return this.grabber.grab(this.video);
  }

  async probe(t: number): Promise<Float32Array | null> {
    const gray = await this.probeGray(t);
    return gray ? normalizeGray(gray) : null;
  }

  close() {
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch {
      /* ignore */
    }
  }
}

/** A few decoders working on the same file; each one is opened lazily. */
class ProberPool {
  private probers: (Promise<FrameProber | null> | undefined)[];
  constructor(
    private url: string,
    readonly size: number,
    private signal?: AbortSignal
  ) {
    this.probers = new Array(size);
  }

  private get(i: number): Promise<FrameProber | null> {
    if (!this.probers[i]) {
      this.probers[i] = FrameProber.open(this.url, this.signal).catch(() => null);
    }
    return this.probers[i]!;
  }

  /** Runs `fn` over items with all workers; returns the first non-null result and stops the rest. */
  async race<T, R>(
    items: T[],
    shouldStop: () => boolean,
    fn: (p: FrameProber, item: T) => Promise<R | null>,
    onItem?: () => void
  ): Promise<R | null> {
    let next = 0;
    let found: R | null = null;
    const loop = async (w: number) => {
      while (found === null && !shouldStop()) {
        const i = next++;
        if (i >= items.length) return;
        const prober = await this.get(w);
        if (!prober) return;
        const r = await fn(prober, items[i]);
        onItem?.();
        if (r !== null && found === null) found = r;
      }
    };
    await Promise.all(Array.from({ length: this.size }, (_, w) => loop(w)));
    return found;
  }

  /** Runs `fn` over all items (no early exit) preserving order. */
  async map<T, R>(items: T[], fn: (p: FrameProber, item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const loop = async (w: number) => {
      for (;;) {
        const i = next++;
        if (i >= items.length || this.signal?.aborted) return;
        const prober = await this.get(w);
        if (!prober) return;
        out[i] = await fn(prober, items[i]);
      }
    };
    await Promise.all(Array.from({ length: this.size }, (_, w) => loop(w)));
    return out;
  }

  async readDuration(): Promise<number> {
    const p = await this.get(0);
    return p && Number.isFinite(p.duration) ? p.duration : 0;
  }

  close() {
    for (const p of this.probers) p?.then((pr) => pr?.close());
  }
}

/**
 * Samples a multi-frame signature (one 16x9 thumbnail per `step` seconds) of the segment that starts at
 * `startTime` in `videoUrl`. Used when the user captures an intro/outro reference, and to self-upgrade
 * old single-frame references after their first successful detection.
 */
export async function buildFrameSignature(
  videoUrl: string,
  startTime: number,
  span: number,
  options: {
    step?: number;
    workers?: number;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<FrameSignature | null> {
  const { step = 1, workers = 3, onProgress, signal } = options;
  const pool = new ProberPool(videoUrl, workers, signal);
  try {
    const offsets: number[] = [];
    for (let o = 0; o <= span; o += step) offsets.push(o);
    let done = 0;
    const grays = await pool.map(offsets, async (p, o) => {
      const g = await p.probeGray(startTime + o);
      onProgress?.(Math.round((++done / offsets.length) * 100));
      return g;
    });
    if (signal?.aborted) return null;

    const frames: SignatureFrame[] = [];
    grays.forEach((g, i) => {
      if (g && normalizeGray(g)) frames.push({ o: offsets[i], g: grayToBase64(g) });
    });
    if (frames.length < 8) return null;
    return { frames, span, builtAt: Date.now() };
  } catch {
    return null;
  } finally {
    pool.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------------------------

function defaultWorkers(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return cores >= 8 ? 2 : 1;
}

export async function scanVideoForIntroOutro(options: ScanOptions): Promise<ScanResult> {
  const {
    videoUrl,
    introImage,
    outroImage,
    introSignature,
    outroSignature,
    introDuration = 90,
    outroDuration = 90,
    introSensitivity = 75,
    outroSensitivity = 75,
    learnSignature = true,
    budgetMs = 60000,
    onProgress,
    onFound,
    signal,
  } = options;

  const startedAt = Date.now();
  const result: ScanResult = { probes: 0, elapsedMs: 0, scannedAt: startedAt };

  if (typeof document === 'undefined' || !videoUrl) return result;

  const [introRef, outroRef] = await Promise.all([
    prepareReference(introImage, introSignature),
    prepareReference(outroImage, outroSignature),
  ]);
  if (!introRef && !outroRef) return result;
  if (signal?.aborted) return result;

  const deadline = startedAt + budgetMs;
  const stop = () => !!signal?.aborted || Date.now() > deadline;
  const workers = defaultWorkers();

  let duration = options.duration && options.duration > 0 ? options.duration : 0;
  if (!duration) {
    const probe = new ProberPool(videoUrl, 1, signal);
    try {
      duration = await probe.readDuration();
    } finally {
      probe.close();
    }
  }
  if (!duration || signal?.aborted) return result;

  const found: Partial<Record<MarkerKind, { start: number; end: number }>> = {};
  const progress: Record<MarkerKind, number> = { intro: introRef ? 0 : 1, outro: outroRef ? 0 : 1 };
  const labels: Record<MarkerKind, string> = { intro: 'Intro', outro: 'Outro' };
  const stageLabels: Record<string, string> = {
    prior: 'lokasi episode sebelumnya',
    anchor: 'titik umum',
    grid: 'pindai jarang',
    mid: 'area langka',
  };

  const report = (kind: MarkerKind, fraction: number, text: string) => {
    progress[kind] = Math.max(progress[kind], Math.min(1, fraction));
    const pct = Math.min(99, Math.round(((progress.intro + progress.outro) / 2) * 100));
    onProgress?.(pct, text);
  };

  /** A probe may not land inside the other marker's already-found segment. */
  const allowed = (kind: MarkerKind, t: number) => {
    const other = found[kind === 'intro' ? 'outro' : 'intro'];
    return !other || t < other.start - 1 || t >= other.end;
  };

  const runTask = async (kind: MarkerKind): Promise<{ missing: boolean; signature?: FrameSignature }> => {
    const ref = kind === 'intro' ? introRef : outroRef;
    if (!ref) return { missing: false };
    const image = kind === 'intro' ? introImage : outroImage;
    const configuredSpan = kind === 'intro' ? introDuration : outroDuration;
    const sensitivity = kind === 'intro' ? introSensitivity : outroSensitivity;

    const planInput = {
      duration,
      span: ref.span || configuredSpan,
      multi: ref.multi,
      capturedAt: image?.capturedAt,
    };
    const stages =
      kind === 'intro'
        ? planIntroProbes({ ...planInput, priors: options.introPriors })
        : planOutroProbes({
            ...planInput,
            priorsFromEnd: options.outroPriorsFromEnd,
            priorsAbs: options.outroPriorsAbs,
          });

    const total = stages.reduce((n, s) => n + s.times.length, 0) || 1;
    let processed = 0;
    const pool = new ProberPool(videoUrl, workers, signal);

    const accept = async (hitStart: number): Promise<{ missing: boolean; signature?: FrameSignature }> => {
      const start = Math.floor(hitStart);
      const end = Math.min(duration, start + configuredSpan);
      found[kind] = { start, end };
      report(kind, 1, `${labels[kind]} ditemukan di ${start}s`);
      onFound?.(kind, { start, end });

      let signature: FrameSignature | undefined;
      if (learnSignature && !ref.multi && !stop()) {
        report(kind, 1, `Mempelajari pola ${labels[kind].toLowerCase()}...`);
        signature =
          (await buildFrameSignature(videoUrl, start, configuredSpan, { workers, signal })) ??
          undefined;
      }
      return { missing: false, signature };
    };

    try {
      // Screenshot only (no signature yet): let ffmpeg find the frame (keyframes first, then a local
      // refine) instead of hundreds of <video> seeks. Falls back to the probe plan below if unusable.
      if (!ref.multi && image) {
        report(kind, 0.1, `${labels[kind]}: pencarian cepat`);
        const fast = await fastFindFrame({
          videoUrl,
          duration,
          kind,
          image,
          sensitivity,
          budgetMs: Math.max(1000, deadline - Date.now()),
          signal,
        });
        if (fast) {
          result.probes += fast.keyframes + fast.windows;
          if (stop()) return { missing: false };
          if (fast.found && fast.time !== undefined && allowed(kind, fast.time)) {
            return await accept(fast.time);
          }
          // The whole file was searched: this episode has no such segment.
          return { missing: !fast.found };
        }
        if (stop()) return { missing: false };
      }

      for (const stage of stages) {
        if (stop()) return { missing: false };
        report(kind, processed / total, `${labels[kind]}: ${stageLabels[stage.name] ?? stage.name}`);

        const times = stage.times.filter((t) => allowed(kind, t));
        processed += stage.times.length - times.length;

        const hit = await pool.race(
          times,
          stop,
          async (prober, t) => {
            result.probes++;
            return evaluateCandidate(prober, ref, t, sensitivity, duration);
          },
          () => {
            processed++;
            report(kind, processed / total, `${labels[kind]}: ${stageLabels[stage.name] ?? stage.name}`);
          }
        );

        if (hit) return await accept(hit.start);
      }
      return { missing: !stop() };
    } catch (err: any) {
      if (err?.message !== 'Scan aborted') console.warn(`${kind} scan error:`, err);
      return { missing: false };
    } finally {
      pool.close();
      progress[kind] = 1;
    }
  };

  try {
    onProgress?.(2, 'Memulai pemindaian cerdas...');
    const [intro, outro] = await Promise.all([runTask('intro'), runTask('outro')]);

    if (found.intro) {
      result.introStart = found.intro.start;
      result.introEnd = found.intro.end;
      if (intro.signature) result.introSignature = intro.signature;
    } else if (introRef && intro.missing) {
      result.introMissing = true;
    }
    if (found.outro) {
      result.outroStart = found.outro.start;
      result.outroEnd = found.outro.end;
      if (outro.signature) result.outroSignature = outro.signature;
    } else if (outroRef && outro.missing) {
      result.outroMissing = true;
    }
  } catch (err: any) {
    if (err?.message !== 'Scan aborted') console.warn('Video scan error:', err);
  }

  result.elapsedMs = Date.now() - startedAt;
  if (!signal?.aborted) onProgress?.(100, 'Pemindaian selesai.');
  return result;
}
