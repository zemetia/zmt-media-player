import { describe, it, expect } from 'vitest';
import { calculateFingerprintSimilarity } from './screenFingerprint';
import { VisualFingerprint } from '../types';

describe('screenFingerprint', () => {
  it('calculates 100% similarity for identical fingerprints', () => {
    const fp: VisualFingerprint = {
      snapshotUrl: 'data:image/jpeg;base64,mock',
      dHash: 'ffff0000ffff0000',
      luminance: 120,
      capturedAt: 90,
    };

    const similarity = calculateFingerprintSimilarity(fp, fp);
    expect(similarity).toBe(100);
  });

  it('calculates 0% or low similarity for completely opposite hashes', () => {
    const fpA: VisualFingerprint = {
      snapshotUrl: 'data:image/jpeg;base64,mockA',
      dHash: '0000000000000000',
      luminance: 10,
      capturedAt: 90,
    };
    const fpB: VisualFingerprint = {
      snapshotUrl: 'data:image/jpeg;base64,mockB',
      dHash: 'ffffffffffffffff',
      luminance: 250,
      capturedAt: 95,
    };

    const similarity = calculateFingerprintSimilarity(fpA, fpB);
    expect(similarity).toBeLessThan(10);
  });
});
