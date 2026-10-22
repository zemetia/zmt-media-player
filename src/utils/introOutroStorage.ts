import { FrameSignature, IntroOutroConfig, IntroOutroPattern, MediaItem } from '../types';
import { extractSeriesInfo } from './seriesMatcher';

const MEDIA_CONFIG_STORAGE_KEY = 'zmt_intro_outro_configs_v1';
const SERIES_CONFIG_STORAGE_KEY = 'zmt_series_intro_outro_v1';

// In-memory fallback if localStorage is unavailable (e.g. node test environments)
const memoryStore: Record<string, string> = {};

// In-memory cache for folder-level configurations (loaded from zmt.config.json)
const folderConfigCache = new Map<string, IntroOutroConfig>();

export function getFolderPath(filePath?: string): string | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return null;
  return filePath.slice(0, lastSlash);
}

export function getFileBasename(filePath?: string): string | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
}

export function registerFolderConfig(folderOrFilePath: string, config: IntroOutroConfig): void {
  if (!folderOrFilePath || !config) return;
  const folder = getFolderPath(folderOrFilePath) || folderOrFilePath;
  const key = folder.toLowerCase().replace(/\\/g, '/');
  folderConfigCache.set(key, syncPrimaryPatterns({ ...config, folderPath: folder }));
}

export function getFolderConfigFromCache(folderOrFilePath?: string): IntroOutroConfig | null {
  if (!folderOrFilePath) return null;
  const folder = getFolderPath(folderOrFilePath) || folderOrFilePath;
  const key = folder.toLowerCase().replace(/\\/g, '/');
  return folderConfigCache.get(key) || null;
}

export function getIntroPatterns(config?: IntroOutroConfig): IntroOutroPattern[] {
  if (!config) return [];
  if (Array.isArray(config.intros) && config.intros.length > 0) {
    return config.intros;
  }
  const frame = config.introImage || config.screenDetection?.introFrame;
  return [
    {
      id: 'intro-1',
      label: 'Intro 1 (OP 1)',
      kind: 'intro',
      duration: config.introDuration || 90,
      sensitivity: config.introSensitivity || 75,
      image: frame,
      signature: config.introSignature,
    },
  ];
}

export function getOutroPatterns(config?: IntroOutroConfig): IntroOutroPattern[] {
  if (!config) return [];
  if (Array.isArray(config.outros) && config.outros.length > 0) {
    return config.outros;
  }
  const frame = config.outroImage || config.screenDetection?.outroFrame;
  return [
    {
      id: 'outro-1',
      label: 'Outro 1 (ED 1)',
      kind: 'outro',
      duration: config.outroDuration || 90,
      sensitivity: config.outroSensitivity || 75,
      image: frame,
      signature: config.outroSignature,
    },
  ];
}

export function syncPrimaryPatterns(config: IntroOutroConfig): IntroOutroConfig {
  const intros = getIntroPatterns(config);
  const outros = getOutroPatterns(config);

  const primaryIntro = intros[0];
  const primaryOutro = outros[0];

  return {
    ...config,
    intros,
    outros,
    introDuration: primaryIntro?.duration ?? config.introDuration ?? 90,
    introSensitivity: primaryIntro?.sensitivity ?? config.introSensitivity ?? 75,
    introImage: primaryIntro?.image ?? config.introImage,
    introSignature: primaryIntro?.signature ?? config.introSignature,
    outroDuration: primaryOutro?.duration ?? config.outroDuration ?? 90,
    outroSensitivity: primaryOutro?.sensitivity ?? config.outroSensitivity ?? 75,
    outroImage: primaryOutro?.image ?? config.outroImage,
    outroSignature: primaryOutro?.signature ?? config.outroSignature,
  };
}

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
  folderConfigCache.clear();
}

export function getTrackKey(track: MediaItem | undefined): string {
  if (!track) return 'default';
  return track.filePath || track.id || track.title || 'default';
}

/** True when the user gave this series/track a visual reference to detect intro/outro from. */
export function hasIntroOutroSetup(config: IntroOutroConfig | undefined): boolean {
  if (!config?.enabled) return false;
  const intros = getIntroPatterns(config);
  const outros = getOutroPatterns(config);
  const hasIntro = intros.some((p) => p.image || p.signature);
  const hasOutro = outros.some((p) => p.image || p.signature);
  return (
    hasIntro ||
    hasOutro ||
    !!(
      config.introImage ||
      config.outroImage ||
      config.introSignature ||
      config.outroSignature ||
      config.screenDetection?.introFrame ||
      config.screenDetection?.outroFrame
    )
  );
}

export function createDefaultConfig(track?: MediaItem, duration?: number): IntroOutroConfig {
  const title = track?.title || 'Unknown Media';
  const seriesInfo = extractSeriesInfo(title);
  const totalDuration = duration || track?.duration || 1440; // Default ~24min anime length if unknown
  const filePath = track?.filePath;
  const folderPath = getFolderPath(filePath) || undefined;

  const initialIntros: IntroOutroPattern[] = [
    {
      id: 'intro-1',
      label: 'Intro 1 (OP 1)',
      kind: 'intro',
      duration: 90,
      sensitivity: 75,
    },
  ];

  const initialOutros: IntroOutroPattern[] = [
    {
      id: 'outro-1',
      label: 'Outro 1 (ED 1)',
      kind: 'outro',
      duration: 90,
      sensitivity: 75,
    },
  ];

  return {
    id: getTrackKey(track),
    mediaTitle: title,
    seriesTitle: seriesInfo.seriesTitle,
    folderPath,
    enabled: true,
    intros: initialIntros,
    outros: initialOutros,
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
 * Loads the active config for a given track, intelligently inheriting from folder config or series template if available.
 */
export function getIntroOutroConfigForTrack(
  track: MediaItem | undefined,
  currentDuration?: number
): IntroOutroConfig {
  if (!track) {
    return createDefaultConfig(undefined, currentDuration);
  }

  const trackKey = getTrackKey(track);
  const seriesInfo = extractSeriesInfo(track.title);
  const folderPath = getFolderPath(track.filePath);
  const folderConfig = folderPath ? getFolderConfigFromCache(folderPath) : null;
  const baseName = getFileBasename(track.filePath);

  // 1. Local folder configuration exists (saved locally per folder in zmt.config.json)
  if (folderConfig) {
    const merged = syncPrimaryPatterns({
      ...folderConfig,
      id: trackKey,
      mediaTitle: track.title,
      seriesTitle: folderConfig.seriesTitle || seriesInfo.seriesTitle,
      folderPath: folderPath || undefined,
      isSeriesTemplate: true,
    });

    const cached =
      merged.episodeDetections?.[trackKey] ||
      (baseName ? merged.episodeDetections?.[baseName] : undefined) ||
      merged.episodeDetections?.[track.title];

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

  const mediaConfigs = loadAllMediaConfigs();
  const directConfig = mediaConfigs[trackKey];
  const seriesConfigs = loadAllSeriesConfigs();
  const seriesConfig = seriesConfigs[seriesInfo.seriesTitle.toLowerCase()];

  // 2. Direct configuration exists
  if (directConfig) {
    const merged = syncPrimaryPatterns({
      ...directConfig,
      mediaTitle: track.title,
      seriesTitle: seriesInfo.seriesTitle,
      folderPath: folderPath || directConfig.folderPath,
    });
    return merged;
  }

  // 3. Inherit from series configuration
  if (seriesConfig) {
    const merged = syncPrimaryPatterns({
      ...seriesConfig,
      id: trackKey,
      mediaTitle: track.title,
      seriesTitle: seriesInfo.seriesTitle,
      folderPath: folderPath || seriesConfig.folderPath,
      isSeriesTemplate: true,
    });

    // Check if this specific episode has already been detected
    const cached =
      merged.episodeDetections?.[trackKey] ||
      (baseName ? merged.episodeDetections?.[baseName] : undefined) ||
      merged.episodeDetections?.[track.title];

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

  // 4. Fallback default
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
export function collectScanPriors(
  config: IntroOutroConfig | undefined,
  excludeTrackKey?: string,
  patternIds?: { introId?: string; outroId?: string }
): ScanPriors {
  const priors: ScanPriors = { introPriors: [], outroPriorsFromEnd: [], outroPriorsAbs: [] };
  const entries = Object.entries(config?.episodeDetections || {})
    .filter(([key]) => key !== excludeTrackKey)
    .sort((a, b) => (b[1].detectedAt || 0) - (a[1].detectedAt || 0));

  const pushUnique = (list: number[], v: number) => {
    if (!list.some((x) => Math.abs(x - v) < 2)) list.push(v);
  };

  for (const [, d] of entries) {
    if (d.introStart !== undefined) {
      if (!patternIds?.introId || d.introPatternId === patternIds.introId) {
        pushUnique(priors.introPriors, d.introStart);
      }
    }
    if (d.outroStart !== undefined) {
      if (!patternIds?.outroId || d.outroPatternId === patternIds.outroId) {
        if (d.duration) pushUnique(priors.outroPriorsFromEnd, d.duration - d.outroStart);
        else pushUnique(priors.outroPriorsAbs, d.outroStart);
      }
    }
  }
  return priors;
}

/**
 * Persists multi-frame signatures learned during a scan into the media, series, and local folder configs.
 */
export function attachLearnedSignatures(
  trackKey: string,
  seriesTitle: string | undefined,
  signatures: { introSignature?: FrameSignature; outroSignature?: FrameSignature },
  patternIds?: { introId?: string; outroId?: string },
  track?: MediaItem
): void {
  if (!signatures.introSignature && !signatures.outroSignature) return;
  const patch = (cfg: IntroOutroConfig) => {
    if (signatures.introSignature) {
      cfg.introSignature = signatures.introSignature;
      if (patternIds?.introId && Array.isArray(cfg.intros)) {
        const p = cfg.intros.find((x) => x.id === patternIds.introId);
        if (p) p.signature = signatures.introSignature;
      } else if (Array.isArray(cfg.intros) && cfg.intros.length > 0) {
        cfg.intros[0].signature = signatures.introSignature;
      }
    }
    if (signatures.outroSignature) {
      cfg.outroSignature = signatures.outroSignature;
      if (patternIds?.outroId && Array.isArray(cfg.outros)) {
        const p = cfg.outros.find((x) => x.id === patternIds.outroId);
        if (p) p.signature = signatures.outroSignature;
      } else if (Array.isArray(cfg.outros) && cfg.outros.length > 0) {
        cfg.outros[0].signature = signatures.outroSignature;
      }
    }
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

    // Persist to local folder config if available
    const filePath = track?.filePath || (trackKey.includes('/') || trackKey.includes('\\') ? trackKey : undefined);
    const folderPath = getFolderPath(filePath);
    if (folderPath) {
      const folderCfg = getFolderConfigFromCache(folderPath);
      if (folderCfg) {
        patch(folderCfg);
        registerFolderConfig(folderPath, folderCfg);
        if (typeof window !== 'undefined' && window.electronAPI?.saveFolderIntroOutro) {
          window.electronAPI.saveFolderIntroOutro(folderPath, folderCfg).catch((err) => {
            console.warn('Failed to update signatures in folder:', folderPath, err);
          });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to store learned signatures:', err);
  }
}

/**
 * Records detected timestamps for a specific episode in mediaConfigs, seriesConfigs, and local folder config.
 */
export function recordEpisodeDetection(
  trackKey: string,
  seriesTitle: string | undefined,
  detection: {
    introStart?: number;
    introEnd?: number;
    outroStart?: number;
    outroEnd?: number;
    introPatternId?: string;
    outroPatternId?: string;
    duration?: number;
    introMissing?: boolean;
    outroMissing?: boolean;
  },
  track?: MediaItem
): void {
  // Undefined fields must not wipe values recorded earlier; a found marker clears its "missing" flag.
  const clean = Object.fromEntries(
    Object.entries(detection).filter(([, v]) => v !== undefined)
  ) as typeof detection;
  if (clean.introStart !== undefined) clean.introMissing = false;
  if (clean.outroStart !== undefined) clean.outroMissing = false;
  detection = clean;

  const baseName = track?.filePath
    ? getFileBasename(track.filePath)
    : trackKey.includes('/') || trackKey.includes('\\')
      ? getFileBasename(trackKey)
      : null;

  const applyToDetections = (cfg: IntroOutroConfig) => {
    cfg.episodeDetections = cfg.episodeDetections || {};
    const existing =
      cfg.episodeDetections[trackKey] ||
      (baseName ? cfg.episodeDetections[baseName] : undefined) ||
      {};
    const updated = {
      ...existing,
      ...detection,
      detectedAt: Date.now(),
    };
    cfg.episodeDetections[trackKey] = updated;
    if (baseName && baseName !== trackKey) {
      cfg.episodeDetections[baseName] = updated;
    }
  };

  try {
    const mediaConfigs = loadAllMediaConfigs();
    if (mediaConfigs[trackKey]) {
      const cfg = mediaConfigs[trackKey];
      applyToDetections(cfg);
      setStorageItem(MEDIA_CONFIG_STORAGE_KEY, JSON.stringify(mediaConfigs));
    }

    if (seriesTitle) {
      const seriesConfigs = loadAllSeriesConfigs();
      const sKey = seriesTitle.trim().toLowerCase();
      if (seriesConfigs[sKey]) {
        const scfg = seriesConfigs[sKey];
        applyToDetections(scfg);
        setStorageItem(SERIES_CONFIG_STORAGE_KEY, JSON.stringify(seriesConfigs));
      }
    }

    // Persist to local folder config (zmt.config.json)
    const filePath = track?.filePath || (trackKey.includes('/') || trackKey.includes('\\') ? trackKey : undefined);
    const folderPath = getFolderPath(filePath);
    if (folderPath) {
      const folderCfg = getFolderConfigFromCache(folderPath);
      if (folderCfg) {
        applyToDetections(folderCfg);
        registerFolderConfig(folderPath, folderCfg);
        if (typeof window !== 'undefined' && window.electronAPI?.saveFolderIntroOutro) {
          window.electronAPI.saveFolderIntroOutro(folderPath, folderCfg).catch((err) => {
            console.warn('Failed to update episode detection in local folder:', folderPath, err);
          });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to record episode detection:', err);
  }
}

/**
 * Saves configuration both for the individual media item, for the series, and locally in the folder.
 */
export function saveIntroOutroConfig(config: IntroOutroConfig, track?: MediaItem): void {
  try {
    const trackKey = track ? getTrackKey(track) : config.id;
    const now = Date.now();
    const filePath = track?.filePath || (trackKey.includes('/') || trackKey.includes('\\') ? trackKey : undefined);
    const folderPath = getFolderPath(filePath) || config.folderPath;

    const updatedConfig: IntroOutroConfig = syncPrimaryPatterns({
      ...config,
      id: trackKey,
      folderPath,
      updatedAt: now,
    });

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

    // Save locally per folder (zmt.config.json)
    if (folderPath) {
      registerFolderConfig(folderPath, updatedConfig);
      if (typeof window !== 'undefined' && window.electronAPI?.saveFolderIntroOutro) {
        window.electronAPI.saveFolderIntroOutro(folderPath, updatedConfig).catch((err) => {
          console.warn('Failed to save intro/outro config to local folder:', folderPath, err);
        });
      }
    }
  } catch (err) {
    console.error('Failed to save intro/outro config:', err);
  }
}

/**
 * Deletes configuration for a track or series.
 */
export function deleteIntroOutroConfig(trackKey: string, seriesTitle?: string, folderPath?: string): void {
  try {
    const mediaConfigs = loadAllMediaConfigs();
    delete mediaConfigs[trackKey];
    setStorageItem(MEDIA_CONFIG_STORAGE_KEY, JSON.stringify(mediaConfigs));

    if (seriesTitle) {
      const seriesConfigs = loadAllSeriesConfigs();
      delete seriesConfigs[seriesTitle.trim().toLowerCase()];
      setStorageItem(SERIES_CONFIG_STORAGE_KEY, JSON.stringify(seriesConfigs));
    }

    const folder = folderPath || getFolderPath(trackKey);
    if (folder) {
      folderConfigCache.delete(folder.toLowerCase().replace(/\\/g, '/'));
    }
  } catch (err) {
    console.error('Failed to delete intro/outro config:', err);
  }
}
