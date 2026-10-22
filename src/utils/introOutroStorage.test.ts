import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultConfig,
  getIntroOutroConfigForTrack,
  saveIntroOutroConfig,
  loadAllMediaConfigs,
  loadAllSeriesConfigs,
  clearStorageForTest,
  getIntroPatterns,
  getOutroPatterns,
  syncPrimaryPatterns,
  getFolderPath,
  registerFolderConfig,
  recordEpisodeDetection,
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
    filePath: 'D:/Anime/Oshi no Ko/Oshi no Ko - 03.mkv',
    duration: 1440,
  };

  it('creates sensible default config for anime track', () => {
    const config = createDefaultConfig(mockTrack, 1440);
    expect(config.introStart).toBe(90);
    expect(config.introEnd).toBe(180);
    expect(config.outroStart).toBe(1440 - 90);
    expect(config.outroEnd).toBe(1440);
    expect(config.seriesTitle).toBe('Oshi no Ko');
    expect(config.intros?.length).toBe(1);
    expect(config.outros?.length).toBe(1);
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

  it('supports multiple intro and outro patterns (e.g. OP1 & OP2)', () => {
    const config = createDefaultConfig(mockTrack, 1440);

    const initialIntros = getIntroPatterns(config);
    expect(initialIntros.length).toBe(1);
    expect(initialIntros[0].label).toBe('Intro 1 (OP 1)');

    // Add OP 2 (e.g. for Episode 13+)
    config.intros = [
      ...initialIntros,
      {
        id: 'intro-op2',
        label: 'Opening 2 (Cour 2)',
        kind: 'intro',
        duration: 88,
        sensitivity: 80,
      },
    ];

    // Add ED 2
    config.outros = [
      ...getOutroPatterns(config),
      {
        id: 'outro-ed2',
        label: 'Ending 2 (Cour 2)',
        kind: 'outro',
        duration: 95,
        sensitivity: 85,
      },
    ];

    const synced = syncPrimaryPatterns(config);
    expect(synced.intros?.length).toBe(2);
    expect(synced.outros?.length).toBe(2);
    expect(synced.intros?.[1].label).toBe('Opening 2 (Cour 2)');
    expect(synced.intros?.[1].duration).toBe(88);
  });

  it('stores and retrieves local per-folder intro/outro configuration', () => {
    const folder = 'D:/Anime/Frieren';
    const ep1: MediaItem = {
      id: 'frieren-01',
      title: 'Frieren - 01',
      url: 'zmt-media://stream?path=D:/Anime/Frieren/Frieren - 01.mkv',
      filePath: 'D:/Anime/Frieren/Frieren - 01.mkv',
      duration: 1440,
    };

    const ep13: MediaItem = {
      id: 'frieren-13',
      title: 'Frieren - 13',
      url: 'zmt-media://stream?path=D:/Anime/Frieren/Frieren - 13.mkv',
      filePath: 'D:/Anime/Frieren/Frieren - 13.mkv',
      duration: 1440,
    };

    expect(getFolderPath(ep1.filePath)).toBe('D:/Anime/Frieren');

    // Setup folder-level config with 2 OPs
    const folderCfg = createDefaultConfig(ep1, 1440);
    folderCfg.seriesTitle = 'Sousou no Frieren';
    folderCfg.intros = [
      { id: 'op-1', label: 'OP 1 (Yuusha)', kind: 'intro', duration: 90, sensitivity: 75 },
      { id: 'op-2', label: 'OP 2 (Haru)', kind: 'intro', duration: 90, sensitivity: 75 },
    ];
    folderCfg.episodeDetections = {
      'Frieren - 01.mkv': {
        introStart: 60,
        introEnd: 150,
        introPatternId: 'op-1',
        detectedAt: Date.now(),
      },
    };

    registerFolderConfig(folder, folderCfg);

    // Ep 1 loads from folder config
    const ep1Config = getIntroOutroConfigForTrack(ep1, 1440);
    expect(ep1Config.seriesTitle).toBe('Sousou no Frieren');
    expect(ep1Config.introStart).toBe(60);
    expect(ep1Config.introEnd).toBe(150);
    expect(ep1Config.intros?.length).toBe(2);

    // Record OP 2 detection for Ep 13
    recordEpisodeDetection('frieren-13', 'Sousou no Frieren', {
      introStart: 120,
      introEnd: 210,
      introPatternId: 'op-2',
      duration: 1440,
    }, ep13);

    const ep13Config = getIntroOutroConfigForTrack(ep13, 1440);
    expect(ep13Config.introStart).toBe(120);
    expect(ep13Config.introEnd).toBe(210);
    expect(ep13Config.episodeDetections?.['frieren-13']?.introPatternId).toBe('op-2');
  });
});
