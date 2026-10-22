import { afterAll, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ff = require('../../electron/frameFinder.cjs');

describe('frameFinder (pure helpers)', () => {
  it('ignores flat frames and matches brightness-shifted copies', () => {
    expect(ff.normalizeGray(new Uint8Array(64).fill(10))).toBeNull();
    const a = Uint8Array.from({ length: 64 }, (_, i) => (i * 13) % 200);
    const b = a.map((v) => Math.min(255, v + 20));
    const va = ff.normalizeGray(a);
    const vb = ff.normalizeGray(b);
    let d = 0;
    for (let i = 0; i < va.length; i++) d += va[i] * vb[i];
    expect(ff.nccToPercent(d)).toBeGreaterThanOrEqual(99);
  });

  it('box-filters by two', () => {
    const g = Uint8Array.from([0, 4, 10, 10, 8, 4, 10, 10]);
    expect(Array.from(ff.downsample2x(g, 4, 2))).toEqual([4, 10]);
  });

  it('parses showinfo timestamps in order', () => {
    const log =
      '[Parsed_showinfo_2 @ 0x1] n:   0 pts:      0 pts_time:0       duration: 1\n' +
      '[Parsed_showinfo_2 @ 0x1] n:   1 pts:   4004 pts_time:4.004   duration: 1\n';
    expect(ff.parseShowinfoTimes(log)).toEqual([0, 4.004]);
  });

  it('searches the likely end of the file first', () => {
    expect(ff.planRegions('intro', 1440)).toEqual([[0, 540], [540, 1440]]);
    expect(ff.planRegions('outro', 1440)).toEqual([[900, 1440], [0, 900]]);
    expect(ff.planRegions('intro', 100)).toEqual([[0, 45], [45, 100]]);
  });

  it('splits a range into contiguous chunks', () => {
    expect(ff.splitRange(0, 30, 6)).toEqual([[0, 30]]);
    const parts = ff.splitRange(100, 640, 4);
    expect(parts).toHaveLength(4);
    expect(parts[0][0]).toBe(100);
    expect(parts[3][1]).toBe(640);
    parts.slice(1).forEach((p: number[], i: number) => expect(p[0]).toBe(parts[i][1]));
  });

  it('ranks the best keyframes above the gate and windows both neighbouring gaps', () => {
    const times = [0, 4, 8, 12, 16];
    const scores = [0.1, 0.9, 0.2, 0.7, 0.5];
    expect(ff.rankCandidates(times, scores, 2)).toEqual([1, 3]);
    expect(ff.candidateWindow(times, 1, 100)).toEqual([0, 8]);
    expect(ff.candidateWindow(times, 4, 100)).toEqual([12, 26]);
    // sparse keyframes: each side is capped
    expect(ff.candidateWindow([0, 100, 200], 1, 300)).toEqual([80, 120]);
  });
});

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasFfmpeg())('frameFinder (ffmpeg integration)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zmt-ff-'));
  const file = path.join(dir, 'scenes.mp4');
  const DURATION = 120;

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const refAt = (t: number) =>
    new Uint8Array(
      execFileSync(
        'ffmpeg',
        ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf',
          `scale=${ff.FINE_W}:${ff.FINE_H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
        { maxBuffer: 1e7 }
      )
    );

  // Hard-cut 2.5 s "shots" with their own motion, so every frame is distinguishable.
  const makeVideo = () =>
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i',
      `nullsrc=size=160x90:rate=24:duration=${DURATION},geq=lum='128+60*sin(X*(0.05+0.011*mod(floor(T/2.5)*7,13))+Y*(0.06+0.009*mod(floor(T/2.5)*5,11))+T*(0.8+mod(floor(T/2.5),5)*0.3))+50*sin(X*Y*0.002*(1+mod(floor(T/2.5)*3,7))+T)':cb=128:cr=128,scale=640:360,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-g', '240', '-bf', '2', file,
    ]);

  it('finds a shot-start screenshot near the start and near the end (keyframe pass)', async () => {
    makeVideo();
    for (const [kind, t] of [['intro', 17.5], ['outro', DURATION - 22.5]] as const) {
      const res = await ff.findFrame({ ffmpeg: 'ffmpeg', filePath: file, duration: DURATION, kind, gray: refAt(t) });
      expect(res.found).toBe(true);
      expect(Math.abs(res.time - t)).toBeLessThan(0.25);
      expect(res.score).toBeGreaterThanOrEqual(90);
    }
  }, 60000);

  it('finds a frame deep inside a shot via the dense fallback', async () => {
    // 17.3 s is 2.3 s into a shot whose motion makes it unlike the shot's keyframe.
    const res = await ff.findFrame({ ffmpeg: 'ffmpeg', filePath: file, duration: DURATION, kind: 'intro', gray: refAt(17.3) });
    expect(res.found).toBe(true);
    expect(Math.abs(res.time - 17.3)).toBeLessThan(0.25);
  }, 60000);

  it('reports not found for a frame that is not in the file', async () => {
    const other = Uint8Array.from({ length: ff.FINE_W * ff.FINE_H }, (_, i) => ((i * 37) ^ (i >> 3)) & 255);
    const res = await ff.findFrame({ ffmpeg: 'ffmpeg', filePath: file, duration: DURATION, kind: 'intro', gray: other });
    expect(res.found).toBe(false);
  }, 60000);

  it('stops when aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      ff.findFrame({ ffmpeg: 'ffmpeg', filePath: file, duration: DURATION, kind: 'intro', gray: refAt(5), signal: c.signal })
    ).rejects.toThrow('aborted');
  }, 60000);
});
