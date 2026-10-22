import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultConfig,
  getIntroOutroConfigForTrack,
  saveIntroOutroConfig,
  loadAllMediaConfigs,
  loadAllSeriesConfigs,
  clearStorageForTest,
} from './introOutroStorage';
import { MediaItem } from '../types';

describe('introOutroStorage', () => {
  beforeEach(() => {
    clearStorageForTest();
  });

  const mockTrack: MediaItem = {
    id: 'test-track-1',
    title: '[SubsPlease] Oshi no Ko - 03 (1080p).mkv',
    url: 'http://example.com/video.mp4',
    duration: 1440,
  };

  it('creates sensible default config for anime track', () => {
    const config = createDefaultConfig(mockTrack, 1440);
    expect(config.introStart).toBe(90);
    expect(config.introEnd).toBe(180);
    expect(config.outroStart).toBe(1440 - 90);
    expect(config.outroEnd).toBe(1440);
    expect(config.seriesTitle).toBe('Oshi no Ko');
  });

  it('saves and retrieves config for media item', () => {
    const config = createDefaultConfig(mockTrack, 1440);
    config.introStart = 85;
    config.introEnd = 175;

    saveIntroOutroConfig(config, mockTrack);

    const loaded = getIntroOutroConfigForTrack(mockTrack, 1440);
    expect(loaded.introStart).toBe(85);
    expect(loaded.introEnd).toBe(175);
  });

  it('inherits series configuration for episode 2 when applyToSeries is true', () => {
    const ep1Config = createDefaultConfig(mockTrack, 1440);
    ep1Config.introStart = 100;
    ep1Config.introEnd = 190;
    ep1Config.applyToSeries = true;

    saveIntroOutroConfig(ep1Config, mockTrack);

    // Episode 2 has not been specifically configured yet
    const ep2Track: MediaItem = {
      id: 'test-track-2',
      title: '[SubsPlease] Oshi no Ko - 04 (1080p).mkv',
      url: 'http://example.com/video2.mp4',
      duration: 1440,
    };

    const ep2Config = getIntroOutroConfigForTrack(ep2Track, 1440);
    expect(ep2Config.introStart).toBe(100);
    expect(ep2Config.introEnd).toBe(190);
    expect(ep2Config.isSeriesTemplate).toBe(true);
  });
});
