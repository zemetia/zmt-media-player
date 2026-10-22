import { FrameSignature, IntroOutroConfig, MediaItem } from '../types';
import { extractSeriesInfo } from './seriesMatcher';

const MEDIA_CONFIG_STORAGE_KEY = 'zmt_intro_outro_configs_v1';
const SERIES_CONFIG_STORAGE_KEY = 'zmt_series_intro_outro_v1';

// In-memory fallback if localStorage is unavailable (e.g. node test environments)
const memoryStore: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return memoryStore[key] || null;
  } catch {
    return memoryStore[key] || null;
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {}
  memoryStore[key] = value;
}

export function clearStorageForTest(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MEDIA_CONFIG_STORAGE_KEY);
      localStorage.removeItem(SERIES_CONFIG_STORAGE_KEY);
    }
  } catch {}
  delete memoryStore[MEDIA_CONFIG_STORAGE_KEY];
  delete memoryStore[SERIES_CONFIG_STORAGE_KEY];
}

export function getTrackKey(track: MediaItem | undefined): string {
  if (!track) return 'default';
  return track.filePath || track.id || track.title || 'default';
}

/** True when the user gave this series/track a visual reference to detect intro/outro from. */
export function hasIntroOutroSetup(config: IntroOutroConfig | undefined): boolean {
  return !!(
    config?.enabled &&
    (config.introImage ||
      config.outroImage ||
      config.introSignature ||
      config.outroSignature ||
      config.screenDetection?.introFrame ||
      config.screenDetection?.outroFrame)
  );
}

export function createDefaultConfig(track?: MediaItem, duration?: number): IntroOutroConfig {
  const title = track?.title || 'Unknown Media';
  const seriesInfo = extractSeriesInfo(title);
  const totalDuration = duration || track?.duration || 1440; // Default ~24min anime length if unknown

  return {
    id: getTrackKey(track),
    mediaTitle: title,
    seriesTitle: seriesInfo.seriesTitle,
    enabled: true,
    // Image-based Visual Detection (Primary)
    introDuration: 90, // Standard 90s anime opening
    outroDuration: 90, // Standard 90s anime ending
    introSensitivity: 75,
    outroSensitivity: 75,
    autoSkipIntro: false,
    autoSkipOutro: false,
    episodeDetections: {},
    // Timestamps
    // Manual timestamps are fallback-only and have no UI; leaving them on invented skip buttons at 1:30.
    introEnabled: false,
    introStart: 90,
    introEnd: 180,
    outroEnabled: false,
    outroStart: Math.max(0, totalDuration - 90),
    outroEnd: totalDuration,
    detectionMode: 'screen',
    screenDetection: {
      enabled: true,
      sensitivity: 75,
    },
    audioDetection: {
      enabled: false,
      detectSilence: true,
      silenceThresholdDb: -45,
      musicEnergyThreshold: 0.5,
    },
    applyToSeries: true,
    updatedAt: Date.now(),
  };
}

export function loadAllMediaConfigs(): Record<string, IntroOutroConfig> {
  try {
    const raw = getStorageItem(MEDIA_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to parse media intro/outro configs from storage:', err);
    return {};
  }
}

export function loadAllSeriesConfigs(): Record<string, IntroOutroConfig> {
  try {
    const raw = getStorageItem(SERIES_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to parse series intro/outro configs from storage:', err);
    return {};
  }
}

/**
 * Loads the active config for a given track, intelligently inheriting from series template if available.
 */
export function getIntroOutroConfigForTrack(
  track: MediaItem | undefined,
  currentDuration?: number
): IntroOutroConfig {
  if (!track) {
    return createDefaultConfig(undefined, currentDuration);
  }

  const trackKey = getTrackKey(track);
  const mediaConfigs = loadAllMediaConfigs();
  const directConfig = mediaConfigs[trackKey];

  const seriesInfo = extractSeriesInfo(track.title);
  const seriesConfigs = loadAllSeriesConfigs();
  const seriesConfig = seriesConfigs[seriesInfo.seriesTitle.toLowerCase()];

  // 1. Direct configuration exists
  if (directConfig) {
    const merged = {
      ...directConfig,
      mediaTitle: track.title,
      seriesTitle: seriesInfo.seriesTitle,
    };
    if (!merged.introImage && merged.screenDetection?.introFrame) {
      merged.introImage = merged.screenDetection.introFrame;
    }
    if (!merged.outroImage && merged.screenDetection?.outroFrame) {
      merged.outroImage = merged.screenDetection.outroFrame;
    }
    if (merged.introDuration === undefined) merged.introDuration = 90;
    if (merged.outroDuration === undefined) merged.outroDuration = 90;
    if (merged.introSensitivity === undefined) merged.introSensitivity = 75;
    if (merged.outroSensitivity === undefined) merged.outroSensitivity = 75;
    return merged;
  }

  // 2. Inherit from series configuration
  if (seriesConfig) {
    const merged = {
      ...seriesConfig,
      id: trackKey,
      mediaTitle: track.title,
      seriesTitle: seriesInfo.seriesTitle,
      isSeriesTemplate: true,
    };
    if (!merged.introImage && merged.screenDetection?.introFrame) {
      merged.introImage = merged.screenDetection.introFrame;
    }
    if (!merged.outroImage && merged.screenDetection?.outroFrame) {
      merged.outroImage = merged.screenDetection.outroFrame;
    }
    if (merged.introDuration === undefined) merged.introDuration = 90;
    if (merged.outroDuration === undefined) merged.outroDuration = 90;
    if (merged.introSensitivity === undefined) merged.introSensitivity = 75;
    if (merged.outroSensitivity === undefined) merged.outroSensitivity = 75;

    // Check if this specific episode has already been detected
    const cached = merged.episodeDetections?.[trackKey];
    if (cached?.introStart !== undefined && cached.introEnd !== undefined) {
      merged.introStart = cached.introStart;
      merged.introEnd = cached.introEnd;
    }
    if (cached?.outroStart !== undefined && cached.outroEnd !== undefined) {
      merged.outroStart = cached.outroStart;
      merged.outroEnd = cached.outroEnd;
    }

    return merged;
  }

  // 3. Fallback default
  return createDefaultConfig(track, currentDuration);
}

export interface ScanPriors {
  introPriors: number[];
  outroPriorsFromEnd: number[];
  outroPriorsAbs: number[];
}

/**
 * Collects where the intro/outro were found in OTHER episodes of the same series (most recent first).
 * The scanner probes those spots first, which usually finds the segment in 1-3 seeks.
 */
export function collectScanPriors(config: IntroOutroConfig | undefined, excludeTrackKey?: string): ScanPriors {
  const priors: ScanPriors = { introPriors: [], outroPriorsFromEnd: [], outroPriorsAbs: [] };
  const entries = Object.entries(config?.episodeDetections || {})
    .filter(([key]) => key !== excludeTrackKey)
    .sort((a, b) => (b[1].detectedAt || 0) - (a[1].detectedAt || 0));

  const pushUnique = (list: number[], v: number) => {
    if (!list.some((x) => Math.abs(x - v) < 2)) list.push(v);
  };

  for (const [, d] of entries) {
    if (d.introStart !== undefined) pushUnique(priors.introPriors, d.introStart);
    if (d.outroStart !== undefined) {
      if (d.duration) pushUnique(priors.outroPriorsFromEnd, d.duration - d.outroStart);
      else pushUnique(priors.outroPriorsAbs, d.outroStart);
    }
  }
  return priors;
}

/**
 * Persists multi-frame signatures learned during a scan into the media + series configs.
 */
export function attachLearnedSignatures(
  trackKey: string,
  seriesTitle: string | undefined,
  signatures: { introSignature?: FrameSignature; outroSignature?: FrameSignature }
): void {
  if (!signatures.introSignature && !signatures.outroSignature) return;
  const patch = (cfg: IntroOutroConfig) => {
    if (signatures.introSignature) cfg.introSignature = signatures.introSignature;
    if (signatures.outroSignature) cfg.outroSignature = signatures.outroSignature;
  };
  try {
    const mediaConfigs = loadAllMediaConfigs();
    if (mediaConfigs[trackKey]) {
      patch(mediaConfigs[trackKey]);
      setStorageItem(MEDIA_CONFIG_STORAGE_KEY, JSON.stringify(mediaConfigs));
    }
    if (seriesTitle) {
      const seriesConfigs = loadAllSeriesConfigs();
      const sKey = seriesTitle.trim().toLowerCase();
      if (seriesConfigs[sKey]) {
        patch(seriesConfigs[sKey]);
        setStorageItem(SERIES_CONFIG_STORAGE_KEY, JSON.stringify(seriesConfigs));
      }
    }
  } catch (err) {
    console.warn('Failed to store learned signatures:', err);
  }
}

/**
 * Records detected timestamps for a specific episode.
 */
export function recordEpisodeDetection(
  trackKey: string,
  seriesTitle: string | undefined,
  detection: {
    introStart?: number;
    introEnd?: number;
    outroStart?: number;
    outroEnd?: number;
    duration?: number;
    introMissing?: boolean;
    outroMissing?: boolean;
  }
): void {
  // Undefined fields must not wipe values recorded earlier; a found marker clears its "missing" flag.
  const clean = Object.fromEntries(
    Object.entries(detection).filter(([, v]) => v !== undefined)
  ) as typeof detection;
  if (clean.introStart !== undefined) clean.introMissing = false;
  if (clean.outroStart !== undefined) clean.outroMissing = false;
  detection = clean;

  try {
    const mediaConfigs = loadAllMediaConfigs();
    if (mediaConfigs[trackKey]) {
      const cfg = mediaConfigs[trackKey];
      cfg.episodeDetections = cfg.episodeDetections || {};
      cfg.episodeDetections[trackKey] = {
        ...cfg.episodeDetections[trackKey],
        ...detection,
        detectedAt: Date.now(),
      };
      setStorageItem(MEDIA_CONFIG_STORAGE_KEY, JSON.stringify(mediaConfigs));
    }

    if (seriesTitle) {
      const seriesConfigs = loadAllSeriesConfigs();
      const sKey = seriesTitle.trim().toLowerCase();
      if (seriesConfigs[sKey]) {
        const scfg = seriesConfigs[sKey];
        scfg.episodeDetections = scfg.episodeDetections || {};
        scfg.episodeDetections[trackKey] = {
          ...scfg.episodeDetections[trackKey],
          ...detection,
          detectedAt: Date.now(),
        };
        setStorageItem(SERIES_CONFIG_STORAGE_KEY, JSON.stringify(seriesConfigs));
      }
    }
  } catch (err) {
    console.warn('Failed to record episode detection:', err);
  }
}

/**
 * Saves configuration to localStorage both for the individual media item and (if enabled) for the series.
 */
export function saveIntroOutroConfig(config: IntroOutroConfig, track?: MediaItem): void {
  try {
    const trackKey = track ? getTrackKey(track) : config.id;
    const now = Date.now();
    const updatedConfig: IntroOutroConfig = {
      ...config,
      id: trackKey,
      updatedAt: now,
    };

    // Synchronize image properties
    if (updatedConfig.introImage) {
      updatedConfig.screenDetection = {
        ...updatedConfig.screenDetection,
        enabled: true,
        introFrame: updatedConfig.introImage,
      };
    }
    if (updatedConfig.outroImage) {
      updatedConfig.screenDetection = {
        ...updatedConfig.screenDetection,
        enabled: true,
        outroFrame: updatedConfig.outroImage,
      };
    }

    // Save media-specific
    const mediaConfigs = loadAllMediaConfigs();
    mediaConfigs[trackKey] = updatedConfig;
    setStorageItem(MEDIA_CONFIG_STORAGE_KEY, JSON.stringify(mediaConfigs));

    // Save series-wide if enabled
    if (config.applyToSeries && config.seriesTitle) {
      const seriesKey = config.seriesTitle.trim().toLowerCase();
      const seriesConfigs = loadAllSeriesConfigs();
      seriesConfigs[seriesKey] = {
        ...updatedConfig,
        id: `series-${seriesKey}`,
        isSeriesTemplate: true,
      };
      setStorageItem(SERIES_CONFIG_STORAGE_KEY, JSON.stringify(seriesConfigs));
    }
  } catch (err) {
    console.error('Failed to save intro/outro config:', err);
  }
}

/**
 * Deletes configuration for a track or series.
 */
export function deleteIntroOutroConfig(trackKey: string, seriesTitle?: string): void {
  try {
    const mediaConfigs = loadAllMediaConfigs();
    delete mediaConfigs[trackKey];
    setStorageItem(MEDIA_CONFIG_STORAGE_KEY, JSON.stringify(mediaConfigs));

    if (seriesTitle) {
      const seriesConfigs = loadAllSeriesConfigs();
      delete seriesConfigs[seriesTitle.trim().toLowerCase()];
      setStorageItem(SERIES_CONFIG_STORAGE_KEY, JSON.stringify(seriesConfigs));
    }
  } catch (err) {
    console.error('Failed to delete intro/outro config:', err);
  }
}
