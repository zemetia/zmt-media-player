import { describe, it, expect } from 'vitest';
import {
  scanVideoForIntroOutro,
  planIntroProbes,
  planOutroProbes,
  evaluateCandidate,
  gridStep,
  ProbeSource,
} from './videoScanner';
import { grayToBase64, normalizeGray, prepareSignature, GRAY_LEN } from './frameSignature';
import { FrameSignature, VisualFingerprint } from '../types';

// Deterministic pseudo-random gray frame for a given seed.
function fakeGray(seed: number): Uint8Array {
  let x = (seed * 2654435761) >>> 0 || 1;
  const out = new Uint8Array(GRAY_LEN);
  for (let i = 0; i < GRAY_LEN; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x % 256;
  }
  return out;
}

const SPAN = 90;

function makeSignature(seedBase: number): FrameSignature {
  const frames = [];
  for (let o = 0; o <= SPAN; o++) frames.push({ o, g: grayToBase64(fakeGray(seedBase + o)) });
  return { frames, span: SPAN, builtAt: 0 };
}

/** Fake episode: the segment starts at `start`; every other second is unrelated "dialogue". */
function fakeEpisode(seedBase: number, start: number | null): ProbeSource & { probes: number } {
  const src = {
    probes: 0,
    async probe(t: number) {
      src.probes++;
      const rel = start === null ? -1 : t - start;
      if (rel >= -0.01 && rel <= SPAN + 0.01) {
        const g = fakeGray(seedBase + Math.round(rel));
        // mild compression noise
        for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, g[i] + ((i * 7) % 5) - 2));
        return normalizeGray(g);
      }
      return normalizeGray(fakeGray(900000 + Math.floor(t * 2)));
    },
  };
  return src;
}

describe('planIntroProbes', () => {
  it('probes previous-episode locations first, then anchors, then a sparse grid', () => {
    const stages = planIntroProbes({ duration: 1440, span: 90, multi: true, priors: [75, 100] });
    expect(stages[0].name).toBe('prior');
    expect(stages[0].times.slice(0, 2)).toEqual([75, 100]);
    expect(stages.map((s) => s.name)).toEqual(['prior', 'anchor', 'grid', 'mid']);
  });

  it('never repeats a probe time across stages', () => {
    const stages = planIntroProbes({ duration: 1440, span: 90, multi: true, priors: [90], capturedAt: 90 });
    const all = stages.flatMap((s) => s.times);
    expect(new Set(all).size).toBe(all.length);
  });

  it('uses a sparse grid in signature mode (far fewer probes than 5s brute force)', () => {
    const stages = planIntroProbes({ duration: 1440, span: 90, multi: true });
    const primary = stages.find((s) => s.name === 'grid')!;
    expect(gridStep(90, true)).toBeGreaterThanOrEqual(30);
    expect(primary.times.length).toBeLessThan(25);
    // a 90s segment must always contain >= 2 grid probes
    expect(gridStep(90, true) * 2).toBeLessThanOrEqual(90);
  });

  it('stays inside the video', () => {
    const stages = planIntroProbes({ duration: 300, span: 90, multi: true, priors: [5000] });
    for (const t of stages.flatMap((s) => s.times)) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(300);
    }
  });
});

describe('planOutroProbes', () => {
  it('anchors priors to the end of the episode', () => {
    const stages = planOutroProbes({ duration: 1440, span: 90, multi: true, priorsFromEnd: [120] });
    expect(stages[0].name).toBe('prior');
    expect(stages[0].times[0]).toBe(1320);
  });

  it('searches the end region first (descending grid) and the middle last', () => {
    const stages = planOutroProbes({ duration: 1440, span: 90, multi: true });
    const grid = stages.find((s) => s.name === 'grid')!.times;
    const mid = stages.find((s) => s.name === 'mid')!.times;
    expect(grid[0]).toBeGreaterThan(grid[grid.length - 1]);
    expect(Math.min(...grid)).toBeGreaterThan(Math.max(...mid));
  });
});

describe('evaluateCandidate', () => {
  const ref = prepareSignature(makeSignature(1000))!;

  it('finds the true start from a single probe landing anywhere inside the segment', async () => {
    const ep = fakeEpisode(1000, 137);
    for (const probeAt of [140, 170, 200, 226]) {
      const hit = await evaluateCandidate(ep, ref, probeAt, 75, 1440);
      expect(hit).not.toBeNull();
      expect(Math.abs(hit!.start - 137)).toBeLessThanOrEqual(0.5);
    }
  });

  it('uses only a handful of probes per candidate (no brute force)', async () => {
    const ep = fakeEpisode(1000, 137);
    await evaluateCandidate(ep, ref, 170, 75, 1440);
    expect(ep.probes).toBeLessThanOrEqual(16); // 1 probe + 3 verifications + cut refinement
  });

  it('rejects frames outside the segment cheaply', async () => {
    const ep = fakeEpisode(1000, 137);
    const hit = await evaluateCandidate(ep, ref, 600, 75, 1440);
    expect(hit).toBeNull();
    expect(ep.probes).toBe(1);
  });

  it('finds nothing in an episode that has no intro', async () => {
    const ep = fakeEpisode(1000, null);
    for (let t = 0; t < 600; t += 30) {
      expect(await evaluateCandidate(ep, ref, t, 75, 1440)).toBeNull();
    }
  });

  it('rejects look-alike frames from a different segment', async () => {
    const other = fakeEpisode(7000, 100); // different song
    for (let t = 100; t < 190; t += 30) {
      expect(await evaluateCandidate(other, ref, t, 75, 1440)).toBeNull();
    }
  });
});

describe('scanVideoForIntroOutro', () => {
  it('returns empty result when videoUrl or references are missing', async () => {
    const res1 = await scanVideoForIntroOutro({ videoUrl: '' });
    expect(res1.introStart).toBeUndefined();
    expect(res1.outroStart).toBeUndefined();

    const res2 = await scanVideoForIntroOutro({ videoUrl: 'http://example.com/test.mp4' });
    expect(res2.introStart).toBeUndefined();
    expect(res2.outroStart).toBeUndefined();
  });

  it('handles abort signal gracefully without throwing', async () => {
    const abortCtrl = new AbortController();
    abortCtrl.abort();

    const dummyFp: VisualFingerprint = {
      snapshotUrl: 'data:image/jpeg;base64,mock',
      dHash: '1234567890abcdef',
      luminance: 120,
      capturedAt: 10,
    };

    const res = await scanVideoForIntroOutro({
      videoUrl: 'http://example.com/test.mp4',
      introImage: dummyFp,
      signal: abortCtrl.signal,
    });

    expect(res.introStart).toBeUndefined();
  });
});
