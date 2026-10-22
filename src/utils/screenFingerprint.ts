import { VisualFingerprint } from '../types';
import {
  base64ToGray,
  dot,
  grabGray,
  grayToBase64,
  normalizeGray,
  nccToPercent,
} from './frameSignature';

/** 64-bit difference hash + mean luminance of any image source (9x8 downsample). */
function computeDHash(source: CanvasImageSource): { dHash: string; luminance: number } | null {
  const hashCanvas = document.createElement('canvas');
  hashCanvas.width = 9;
  hashCanvas.height = 8;
  const hashCtx = hashCanvas.getContext('2d', { willReadFrequently: true });
  if (!hashCtx) return null;

  hashCtx.drawImage(source, 0, 0, 9, 8);
  const data = hashCtx.getImageData(0, 0, 9, 8).data;

  const gray: number[][] = [];
  let totalLum = 0;
  for (let y = 0; y < 8; y++) {
    gray[y] = [];
    for (let x = 0; x < 9; x++) {
      const idx = (y * 9 + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray[y][x] = lum;
      totalLum += lum;
    }
  }

  let hexHash = '';
  for (let y = 0; y < 8; y++) {
    let nibble = '';
    for (let x = 0; x < 8; x++) {
      nibble += gray[y][x] > gray[y][x + 1] ? '1' : '0';
      if (nibble.length === 4) {
        hexHash += parseInt(nibble, 2).toString(16);
        nibble = '';
      }
    }
  }

  return { dHash: hexHash, luminance: Math.round(totalLum / 72) };
}

/**
 * Computes a full reference fingerprint (preview thumbnail + dHash + 16x9 gray) from any
 * CanvasImageSource (video, image, canvas). Use this only for *capturing* references; scanning uses
 * the much lighter helpers in frameSignature.ts.
 */
export function captureSourceFingerprint(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  capturedAt = 0,
  thumbnailWidth = 160,
  thumbnailHeight = 90
): VisualFingerprint | null {
  if (!source || sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  try {
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbnailWidth;
    thumbCanvas.height = thumbnailHeight;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (!thumbCtx) return null;

    thumbCtx.drawImage(source, 0, 0, thumbnailWidth, thumbnailHeight);
    const snapshotUrl = thumbCanvas.toDataURL('image/jpeg', 0.75);

    const hash = computeDHash(source);
    if (!hash) return null;

    const gray = grabGray(source);

    return {
      snapshotUrl,
      dHash: hash.dHash,
      luminance: hash.luminance,
      capturedAt,
      gray: gray ? grayToBase64(gray) : undefined,
    };
  } catch (err) {
    console.warn('Unable to capture frame fingerprint:', err);
    return null;
  }
}

/**
 * Computes fingerprint from HTMLVideoElement.
 */
export function captureFrameFingerprint(
  video: HTMLVideoElement,
  thumbnailWidth = 160,
  thumbnailHeight = 90
): VisualFingerprint | null {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  return captureSourceFingerprint(
    video,
    video.videoWidth,
    video.videoHeight,
    video.currentTime,
    thumbnailWidth,
    thumbnailHeight
  );
}

/**
 * Computes fingerprint from an image file (e.g. uploaded screenshot).
 */
export function fingerprintFromFile(file: File): Promise<VisualFingerprint | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return resolve(null);

      const img = new Image();
      img.onload = () => {
        const fp = captureSourceFingerprint(img, img.naturalWidth, img.naturalHeight, 0);
        resolve(fp);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Compares the current video frame against a reference fingerprint (0..100).
 * Cheap: one 16x9 draw, no JPEG encoding.
 */
export function compareVideoToFingerprint(
  video: HTMLVideoElement,
  target: VisualFingerprint
): number {
  if (!video || video.videoWidth === 0 || !target) {
    return 0;
  }

  if (target.gray) {
    const ref = base64ToGray(target.gray);
    const refVec = ref ? normalizeGray(ref) : null;
    const gray = grabGray(video);
    const probe = gray ? normalizeGray(gray) : null;
    if (!refVec || !probe) return 0;
    return nccToPercent(dot(refVec, probe));
  }

  if (!target.dHash) return 0;
  try {
    const hash = computeDHash(video);
    if (!hash) return 0;
    return calculateFingerprintSimilarity(
      { snapshotUrl: '', dHash: hash.dHash, luminance: hash.luminance, capturedAt: 0 },
      target
    );
  } catch {
    return 0;
  }
}

function popcount4(n: number): number {
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1);
}

/**
 * Similarity (0..100) between two fingerprints. Uses NCC on the gray thumbnails when both have one,
 * otherwise falls back to Hamming distance of the dHash plus a small luminance penalty.
 */
export function calculateFingerprintSimilarity(
  a: VisualFingerprint,
  b: VisualFingerprint
): number {
  if (a.gray && b.gray) {
    const ga = base64ToGray(a.gray);
    const gb = base64ToGray(b.gray);
    const va = ga ? normalizeGray(ga) : null;
    const vb = gb ? normalizeGray(gb) : null;
    if (va && vb) return nccToPercent(dot(va, vb));
  }

  if (!a.dHash || !b.dHash || a.dHash.length !== b.dHash.length) {
    return 0;
  }

  let diffCount = 0;
  for (let i = 0; i < a.dHash.length; i++) {
    diffCount += popcount4(parseInt(a.dHash[i], 16) ^ parseInt(b.dHash[i], 16));
  }

  const bitSimilarity = Math.max(0, 1 - diffCount / (a.dHash.length * 4));
  const lumDiff = Math.abs(a.luminance - b.luminance) / 255;
  const lumFactor = 1 - lumDiff * 0.15;

  const score = Math.round(bitSimilarity * lumFactor * 100);
  return Math.min(100, Math.max(0, score));
}
