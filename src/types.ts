export interface SubtitleCue {
  id: number;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
  position?: SubtitlePosition;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  cues: SubtitleCue[];
  isCustom?: boolean;
  isEmbedded?: boolean;
}

export type SubtitleFontFamily = 'sans' | 'serif' | 'mono' | 'trebuchet' | 'impact';
export type SubtitleTextOutline = 'none' | 'thin' | 'medium' | 'heavy';
export type SubtitlePosition = 'bottom' | 'top' | 'middle';

export interface SubtitleStyle {
  fontSize: number; // px, e.g. 24
  fontFamily: SubtitleFontFamily;
  color: string; // hex
  backgroundColor: string; // hex or transparent
  backgroundOpacity: number; // 0 to 1
  position: SubtitlePosition;
  offsetY: number; // margin bottom / top offset (0% to 30%)
  textShadow: boolean;
  textOutline: SubtitleTextOutline;
  offsetSeconds: number; // sync shift (-10 to +10s)
}

export interface MediaItem {
  id: string;
  title: string;
  url: string;
  duration?: number;
  resolution?: string; // e.g. "4K UHD", "1080p FHD", "720p HD"
  subtitles?: SubtitleTrack[];
  isLocal?: boolean;
  file?: File;
  filePath?: string;
  size?: number;
}

export type DrcPresetMode = 'off' | 'gentle' | 'cinema' | 'night';
export type SpatialAudioMode = 'off' | 'subtle' | 'wide' | 'cinema';
export type VisualizerMode = 'bars' | 'wave' | 'peaks';

export interface AudioSettings {
  volume: number; // 0.0 to 1.0
  boost: number; // 1.0 (100%) to 3.0 (300%)
  muted: boolean;
  balance: number; // -1 (left) to 1 (right)
  eqPreset: string;
  eqBands: number[]; // 10 bands gain in dB (-12 to +12)
  audioDelay?: number; // audio sync delay in seconds (0.0 to 3.0s)
  bassGain: number; // dedicated bass knob in dB (-12 to +12)
  trebleGain: number; // dedicated treble knob in dB (-12 to +12)
  vocalClarity: boolean; // speech presence boost & low rumble cut
  drcMode: DrcPresetMode; // Dynamic Range Compressor / Night Mode dialogue leveler
  spatialAudio: SpatialAudioMode; // 3D virtual surround acoustic space
  monoDownmix: boolean; // downmix stereo to mono
  preservesPitch: boolean; // pitch lock during speed change
  audioDeviceId?: string; // selected output device sinkId
  visualizerMode: VisualizerMode; // bars / wave oscilloscope / VU meters
}

export type PicturePreset = 'custom' | 'normal' | 'cinema' | 'vivid' | 'hdr' | 'anime' | 'night' | 'noir';
export type VideoSharpness = 'off' | 'subtle' | 'medium' | 'high';
export type VideoAspectRatio = 'fit' | '16:9' | '4:3' | '21:9' | '18:9' | '1:1' | 'fill';
export type VideoRotation = 0 | 90 | 180 | 270;
export type RenderingQuality = 'auto' | 'smooth' | 'crisp';

export interface VideoSettings {
  brightness: number; // 50 to 150 %
  contrast: number;   // 50 to 150 %
  saturation: number; // 0 to 200 %
  hue: number;        // 0 to 360 deg
  gamma: number;      // 0.5 to 2.0 (default 1.0)
  sharpness: VideoSharpness; // hardware convolution sharpness
  grayscale: number;  // 0 to 100 %
  sepia: number;      // 0 to 100 %
  invert: boolean;    // high contrast invert
  picturePreset: PicturePreset;
  playbackRate: number; // 0.1 to 4.0
  aspectRatio: VideoAspectRatio;
  loop: boolean;
  rotation: VideoRotation;
  flipHorizontal: boolean; // mirror
  flipVertical: boolean;
  zoom: number;       // 50 to 300 %
  panX: number;       // -100 to 100 px
  panY: number;       // -100 to 100 px
  deinterlace: boolean;
  renderingQuality: RenderingQuality;
}

export interface EqualizerPreset {
  name: string;
  gains: number[];
}

export interface VisualFingerprint {
  snapshotUrl: string; // base64 preview thumbnail (e.g. 160x90)
  dHash: string;       // difference hash string
  luminance: number;   // average brightness (0-255)
  capturedAt: number;  // timestamp in seconds where captured
  gray?: string;       // base64 16x9 grayscale thumbnail used for fast NCC matching
}

/** One sampled frame of an intro/outro: `o` is the offset (s) from the segment start, `g` a base64 16x9 gray thumbnail. */
export interface SignatureFrame {
  o: number;
  g: string;
}

/**
 * Single pattern/variant for an Intro (OP) or Outro (ED).
 * Supports multiple OPs / EDs in a series (e.g. OP1 for eps 1-12, OP2 for eps 13-24).
 */
export interface IntroOutroPattern {
  id: string;
  label: string;
  kind: 'intro' | 'outro';
  duration: number; // in seconds (default 90s)
  sensitivity: number; // 50 to 95 (%) (default 75)
  image?: VisualFingerprint;
  signature?: FrameSignature;
}

/**
 * Multi-frame "fingerprint" of a whole intro/outro. Lets the scanner recognise the segment from a
 * single probe anywhere inside it (instead of needing to land on its exact first frame).
 */
export interface FrameSignature {
  frames: SignatureFrame[];
  span: number; // seconds covered by the signature
  builtAt: number;
}

export interface AudioSignature {
  capturedRms: number;  // RMS amplitude (0.0 to 1.0)
  capturedDb: number;   // dB level
  capturedAt: number;   // timestamp in seconds where captured
}

export interface DetectedMarker {
  introStart?: number;
  introEnd?: number;
  outroStart?: number;
  outroEnd?: number;
  introPatternId?: string; // id of IntroOutroPattern that matched (e.g. 'intro-1', 'intro-2')
  outroPatternId?: string; // id of IntroOutroPattern that matched (e.g. 'outro-1', 'outro-2')
  duration?: number;       // episode duration when detected (lets outro priors be anchored to the end)
  introMissing?: boolean;  // full scan finished and this episode has no intro
  outroMissing?: boolean;  // full scan finished and this episode has no outro
  detectedAt?: number;
}

export interface IntroOutroConfig {
  id: string; // unique identifier (file hash/path, trackId, or series key)
  mediaTitle?: string;
  seriesTitle?: string;
  folderPath?: string; // local directory path when saved per folder
  enabled: boolean;
  
  // Multiple Intro & Outro Patterns (e.g. OP 1, OP 2, ED 1, ED 2)
  intros?: IntroOutroPattern[];
  outros?: IntroOutroPattern[];

  // Fixed Durations (Standard Anime/Film default 90s, consistent across episodes)
  introDuration: number; // in seconds (default 90s)
  outroDuration: number; // in seconds (default 90s)
  
  // Image References for visual detection
  introImage?: VisualFingerprint;
  outroImage?: VisualFingerprint;
  introSensitivity: number; // 50 to 95 (%) (default 75)
  outroSensitivity: number; // 50 to 95 (%) (default 75)
  introSignature?: FrameSignature; // multi-frame signature of the whole intro (fast scan mode)
  outroSignature?: FrameSignature; // multi-frame signature of the whole outro (fast scan mode)
  
  // Auto Skip toggles
  autoSkipIntro: boolean;
  autoSkipOutro: boolean;

  // Cached detected timestamps for specific episodes (so once detected, it is remembered)
  episodeDetections?: Record<string, DetectedMarker>;

  // Fallback timestamp ranges
  introEnabled: boolean;
  introStart: number; // in seconds
  introEnd: number;   // in seconds
  outroEnabled: boolean;
  outroStart: number; // in seconds
  outroEnd: number;   // in seconds
  
  // Detection Mode
  detectionMode: 'screen' | 'timestamp' | 'audio' | 'hybrid';
  
  // Screen / Visual Detection
  screenDetection: {
    enabled: boolean;
    sensitivity: number; // 50 to 95 (%)
    introFrame?: VisualFingerprint;
    outroFrame?: VisualFingerprint;
  };

  // Sound / Audio Detection
  audioDetection: {
    enabled: boolean;
    detectSilence: boolean; // detect silence dip / fade before OP/ED
    silenceThresholdDb: number; // e.g. -45 dB
    musicEnergyThreshold: number; // 0.0 to 1.0 (relative volume/energy)
    introAudio?: AudioSignature;
    outroAudio?: AudioSignature;
  };

  // Series application
  applyToSeries: boolean;
  isSeriesTemplate?: boolean;
  updatedAt: number;
}


export interface ABLoopState {
  enabled: boolean;
  start: number | null;
  end: number | null;
}

export interface GeneralPreferences {
  autoPlayNext: boolean;
  autoResume: boolean;
  autoHideDelay: number; // ms: 1500, 2500, 4000, 0 (never)
  showStatsForNerds: boolean;
}
