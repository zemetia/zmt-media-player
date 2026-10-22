import { describe, it, expect } from 'vitest';
import {
  base64ToGray,
  grayToBase64,
  normalizeGray,
  nccToPercent,
  prepareSignature,
  matchProbe,
  GRAY_LEN,
} from './frameSignature';

function ramp(offset = 0, gain = 1): Uint8Array {
  const g = new Uint8Array(GRAY_LEN);
  for (let i = 0; i < GRAY_LEN; i++) g[i] = Math.min(255, Math.max(0, Math.round(((i * 13 + offset) % 200) * gain)));
  return g;
}

describe('frameSignature', () => {
  it('round-trips gray thumbnails through base64', () => {
    const g = ramp();
    expect(Array.from(base64ToGray(grayToBase64(g))!)).toEqual(Array.from(g));
    expect(base64ToGray('AAAA')).toBeNull();
  });

  it('ignores flat frames (black / white / fades)', () => {
    expect(normalizeGray(new Uint8Array(GRAY_LEN).fill(0))).toBeNull();
    expect(normalizeGray(new Uint8Array(GRAY_LEN).fill(255))).toBeNull();
  });

  it('is invariant to brightness / contrast changes', () => {
    const a = normalizeGray(ramp(0, 1))!;
    const b = normalizeGray(ramp(0, 0.6).map((v) => Math.min(255, v + 30)))!;
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    expect(nccToPercent(d)).toBeGreaterThanOrEqual(90);
  });

  it('maps NCC to percent with 0.90 => 75', () => {
    expect(nccToPercent(1)).toBe(100);
    expect(nccToPercent(0.9)).toBe(75);
    expect(nccToPercent(0.5)).toBe(0);
  });

  it('reports the offset of the best matching signature frame', () => {
    const frames = [];
    for (let o = 0; o <= 20; o++) frames.push({ o, g: grayToBase64(ramp(o * 17)) });
    const ref = prepareSignature({ frames, span: 20, builtAt: 0 })!;
    expect(ref.multi).toBe(true);
    const probe = normalizeGray(ramp(7 * 17))!;
    const m = matchProbe(ref, probe);
    expect(m.offset).toBe(7);
    expect(m.score).toBeGreaterThanOrEqual(95);
  });
});
