import { FrameSignature, VisualFingerprint } from '../types';

/**
 * Low-level frame matching used by the intro/outro scanner.
 *
 * A frame is reduced to a 16x9 grayscale thumbnail and compared with normalised cross-correlation
 * (NCC), which ignores brightness/contrast shifts caused by different encodes. A whole intro/outro is
 * represented by a `FrameSignature` (one thumbnail per second), so a single probe frame taken
 * *anywhere* inside the segment identifies it and tells us how far into the segment we are.
 */

export const GRAY_W = 16;
export const GRAY_H = 9;
export const GRAY_LEN = GRAY_W * GRAY_H;

/** Frames flatter than this (std-dev of 0..255 luma) carry no information (black / white / fades). */
const MIN_STD = 4;

/** Maps NCC (-1..1) to a 0..100 score. 0.90 NCC => 75 %, 0.98 NCC => 95 %. */
export function nccToPercent(ncc: number): number {
  return Math.round(Math.max(0, Math.min(1, (ncc - 0.6) / 0.4)) * 100);
}

export function grayToBase64(gray: Uint8Array): string {
  let s = '';
  for (let i = 0; i < gray.length; i++) s += String.fromCharCode(gray[i]);
  return btoa(s);
}

export function base64ToGray(b64: string): Uint8Array | null {
  try {
    const s = atob(b64);
    if (s.length !== GRAY_LEN) return null;
    const out = new Uint8Array(GRAY_LEN);
    for (let i = 0; i < GRAY_LEN; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Zero-mean, unit-norm vector so that a dot product equals the NCC. Null for flat frames. */
export function normalizeGray(gray: ArrayLike<number>): Float32Array | null {
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

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Re-usable canvas that turns any image source into a 16x9 gray byte array. */
export class FrameGrabber {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  grab(source: CanvasImageSource): Uint8Array | null {
    if (typeof document === 'undefined') return null;
    try {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = GRAY_W;
        this.canvas.height = GRAY_H;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      }
      if (!this.ctx) return null;
      this.ctx.drawImage(source, 0, 0, GRAY_W, GRAY_H);
      const data = this.ctx.getImageData(0, 0, GRAY_W, GRAY_H).data;
      const gray = new Uint8Array(GRAY_LEN);
      for (let i = 0; i < GRAY_LEN; i++) {
        const j = i * 4;
        gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
      }
      return gray;
    } catch {
      return null;
    }
  }
}

const sharedGrabber = new FrameGrabber();

export function grabGray(source: CanvasImageSource): Uint8Array | null {
  return sharedGrabber.grab(source);
}

// ---------------------------------------------------------------------------------------------
// Prepared (decoded + normalised) references
// ---------------------------------------------------------------------------------------------

export interface PreparedFrame {
  o: number;
  v: Float32Array;
}

export interface PreparedReference {
  frames: PreparedFrame[];
  span: number;
  /** True when built from a real multi-frame signature (enables sparse probing + verification). */
  multi: boolean;
}

export function prepareSignature(sig: FrameSignature | undefined): PreparedReference | null {
  if (!sig || !sig.frames?.length) return null;
  const frames: PreparedFrame[] = [];
  for (const f of sig.frames) {
    const gray = base64ToGray(f.g);
    const v = gray ? normalizeGray(gray) : null;
    if (v) frames.push({ o: f.o, v });
  }
  if (frames.length < 3) return frames.length ? { frames, span: sig.span, multi: false } : null;
  return { frames, span: sig.span, multi: true };
}

/** Decodes the stored 160x90 JPEG of a legacy fingerprint to a gray thumbnail (only if `gray` is missing). */
export async function ensureFingerprintGray(fp: VisualFingerprint): Promise<VisualFingerprint> {
  if (fp.gray || !fp.snapshotUrl || typeof Image === 'undefined') return fp;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const gray = grabGray(img);
      resolve(gray ? { ...fp, gray: grayToBase64(gray) } : fp);
    };
    img.onerror = () => resolve(fp);
    img.src = fp.snapshotUrl;
  });
}

/**
 * Builds the best available reference: the multi-frame signature when present, otherwise the single
 * captured frame (slow fallback mode).
 */
export async function prepareReference(
  fp: VisualFingerprint | undefined,
  sig: FrameSignature | undefined
): Promise<PreparedReference | null> {
  const multi = prepareSignature(sig);
  if (multi?.multi) return multi;
  if (!fp) return multi;
  const withGray = await ensureFingerprintGray(fp);
  const gray = withGray.gray ? base64ToGray(withGray.gray) : null;
  const v = gray ? normalizeGray(gray) : null;
  if (!v) return multi;
  return { frames: [{ o: 0, v }], span: sig?.span ?? 0, multi: false };
}

export interface ProbeMatch {
  offset: number;
  score: number; // 0..100
}

/** Best match of a normalised probe against the reference; optionally restricted to an offset window. */
export function matchProbe(
  ref: PreparedReference,
  probe: Float32Array,
  window?: { center: number; radius: number }
): ProbeMatch {
  let bestNcc = -1;
  let bestOffset = 0;
  for (const f of ref.frames) {
    if (window && Math.abs(f.o - window.center) > window.radius) continue;
    const c = dot(f.v, probe);
    if (c > bestNcc) {
      bestNcc = c;
      bestOffset = f.o;
    }
  }
  return { offset: bestOffset, score: nccToPercent(bestNcc) };
}

/** Matches the current frame of a (playing) video against a prepared reference. */
export function matchVideoFrame(video: HTMLVideoElement, ref: PreparedReference): ProbeMatch | null {
  if (!video || video.videoWidth === 0 || video.readyState < 2) return null;
  const gray = grabGray(video);
  const probe = gray ? normalizeGray(gray) : null;
  return probe ? matchProbe(ref, probe) : null;
}
