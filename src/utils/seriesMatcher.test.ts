import { describe, it, expect } from 'vitest';
import { extractSeriesInfo } from './seriesMatcher';

describe('seriesMatcher', () => {
  it('extracts series title from standard anime bracket releases', () => {
    const info = extractSeriesInfo('[SubsPlease] Sousou no Frieren - 04 [1080p].mkv');
    expect(info.seriesTitle).toBe('Sousou no Frieren');
    expect(info.episodeNumber).toBe(4);
  });

  it('extracts series title and season from S01E05 naming format', () => {
    const info = extractSeriesInfo('Attack.on.Titan.S04E12.1080p.WEB-DL.mp4');
    expect(info.seriesTitle).toContain('Attack on Titan');
    expect(info.seriesTitle).toContain('S4');
    expect(info.episodeNumber).toBe(12);
    expect(info.seasonNumber).toBe(4);
  });

  it('handles K-drama episode format like Queen of Tears Ep 8', () => {
    const info = extractSeriesInfo('Queen of Tears - Episode 8 (2024)');
    expect(info.seriesTitle).toBe('Queen of Tears');
    expect(info.episodeNumber).toBe(8);
  });

  it('handles titles without episode numbers cleanly', () => {
    const info = extractSeriesInfo('Suzume [1080p Bluray]');
    expect(info.seriesTitle).toBe('Suzume');
    expect(info.episodeNumber).toBeUndefined();
  });
});
