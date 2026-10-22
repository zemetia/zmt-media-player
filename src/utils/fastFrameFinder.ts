import type { FindFrameResult } from '../electron';
import { VisualFingerprint } from '../types';
import { extractStreamPath } from './mediaProtocol';
import { grayToBase64 } from './frameSignature';

/**
 * Renderer side of the fast screenshot -> frame locator (electron/frameFinder.cjs).
 *
 * The reference is the stored 160x90 snapshot reduced to 64x36 gray; the main process then does
 * a keyframe-only ffmpeg pass plus a local refine instead of hundreds of <video> seeks.
 */

export const FAST_W = 64;
export const FAST_H = 36;

let nextId = 0;
let cachedRef: { url: string; gray: string } | null = null;

/** Local file behind a zmt-media:// URL, or null when the fast path cannot be used. */
export function fastFinderPath(videoUrl: string): string | null {
  if (typeof window === 'undefined' || typeof window.electronAPI?.findFrame !== 'function') return null;
  if (!videoUrl.startsWith('zmt-media://')) return null;
  return extractStreamPath(videoUrl);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 64x36 luma of the reference snapshot (base64), downscaled with the browser's best filter. */
export async function referenceGray64(fp: VisualFingerprint): Promise<string | null> {
  if (!fp.snapshotUrl || typeof document === 'undefined') return null;
  if (cachedRef?.url === fp.snapshotUrl) return cachedRef.gray;

  const img = await loadImage(fp.snapshotUrl);
  if (!img) return null;
  const canvas = document.createElement('canvas');
  canvas.width = FAST_W;
  canvas.height = FAST_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, FAST_W, FAST_H);
  const data = ctx.getImageData(0, 0, FAST_W, FAST_H).data;

  const gray = new Uint8Array(FAST_W * FAST_H);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }
  const b64 = grayToBase64(gray);
  cachedRef = { url: fp.snapshotUrl, gray: b64 };
  return b64;
}

/**
 * Runs the main-process search. Resolves null when it cannot be used (not Electron, not a local file,
 * no ffmpeg, bad reference, aborted, error): the caller then falls back to the slow <video> scan.
 */
export async function fastFindFrame(opts: {
  videoUrl: string;
  duration: number;
  kind: 'intro' | 'outro';
  image: VisualFingerprint;
  sensitivity: number;
  budgetMs?: number;
  signal?: AbortSignal;
}): Promise<Extract<FindFrameResult, { ok: true }> | null> {
  const { videoUrl, duration, kind, image, sensitivity, budgetMs, signal } = opts;
  const api = window.electronAPI;
  const filePath = fastFinderPath(videoUrl);
  if (!api || !filePath || !(duration > 0) || signal?.aborted) return null;

  const gray = await referenceGray64(image);
  if (!gray || signal?.aborted) return null;

  const id = `ff-${Date.now()}-${nextId++}`;
  const onAbort = () => api.cancelFindFrame(id);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await api.findFrame({ id, filePath, duration, kind, gray, sensitivity, budgetMs });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
