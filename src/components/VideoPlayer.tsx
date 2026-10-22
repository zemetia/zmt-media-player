import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MediaItem,
  SubtitleTrack,
  SubtitleStyle,
  AudioSettings,
  VideoSettings,
  SubtitleCue,
  ABLoopState,
  GeneralPreferences,
  PicturePreset,
  IntroOutroConfig
} from '../types';
import { ControlsBar } from './ControlsBar';
import { VideoSvgFilters } from './VideoSvgFilters';
import { globalAudioEngine } from '../utils/audioEngine';
import { parseSubtitleFile, formatTime, cleanSubtitleText } from '../utils/subtitleParser';
import { matchVideoFrame, prepareReference, PreparedReference } from '../utils/frameSignature';
import {
  recordEpisodeDetection,
  getTrackKey,
  collectScanPriors,
  attachLearnedSignatures,
} from '../utils/introOutroStorage';
import { scanVideoForIntroOutro } from '../utils/videoScanner';
import { Play, UploadCloud, Film, Activity, Check, RotateCcw, X, FastForward, Loader2 } from 'lucide-react';

interface VideoPlayerProps {
  currentTrack?: MediaItem;
  playlist: MediaItem[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
  onAddFiles: (files: FileList) => void;
  onAddSubtitleTrack: (track: SubtitleTrack) => void;
  audioSettings: AudioSettings;
  setAudioSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
  videoSettings: VideoSettings;
  setVideoSettings: React.Dispatch<React.SetStateAction<VideoSettings>>;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  activeSubtitleTrackId: string | null;
  setActiveSubtitleTrackId: (id: string | null) => void;
  repeatMode: 'off' | 'all' | 'one';
  shuffle: boolean;
  abLoop: ABLoopState;
  setAbLoop: React.Dispatch<React.SetStateAction<ABLoopState>>;
  preferences: GeneralPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<GeneralPreferences>>;
  onTimeUpdateSync?: (time: number, duration: number) => void;
  registerActions?: (actions: {
    seek: (time: number) => void;
    captureSnapshot: (options?: { format: 'png' | 'jpeg'; includeSubtitles: boolean; copyToClipboard?: boolean }) => void;
    stepFrame: (direction: 1 | -1) => void;
    getVideoElement?: () => HTMLVideoElement | null;
    triggerScan?: () => void;
  }) => void;
  onScanStateChange?: (state: {
    isScanning: boolean;
    scanProgress: number;
    scanStatus: string;
    detectedIntro: { start: number; end: number } | null;
    detectedOutro: { start: number; end: number } | null;
    scanSummary?: { probes: number; elapsedMs: number; introMissing: boolean; outroMissing: boolean } | null;
  }) => void;
  onOpenSubtitles: () => void;
  onOpenEqualizer: () => void;
  onOpenVideoSettings: () => void;
  onOpenStudioSettings: (tab?: 'audio' | 'video' | 'playback' | 'subtitles' | 'stats') => void;
  onOpenShortcuts: () => void;
  onOpenIntroOutro?: () => void;
  introOutroConfig?: IntroOutroConfig;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  currentTrack,
  playlist,
  currentIndex,
  onSelectTrack,
  onAddFiles,
  onAddSubtitleTrack,
  audioSettings,
  setAudioSettings,
  videoSettings,
  setVideoSettings,
  subtitleStyle,
  setSubtitleStyle,
  activeSubtitleTrackId,
  setActiveSubtitleTrackId,
  repeatMode,
  shuffle,
  abLoop,
  setAbLoop,
  preferences,
  setPreferences,
  onTimeUpdateSync,
  registerActions,
  onScanStateChange,
  onOpenSubtitles,
  onOpenEqualizer,
  onOpenVideoSettings,
  onOpenStudioSettings,
  onOpenShortcuts,
  onOpenIntroOutro,
  introOutroConfig,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [detectedResolution, setDetectedResolution] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [crossOriginMode, setCrossOriginMode] = useState<undefined | 'anonymous'>('anonymous');

  // Intro & Outro Skip state
  const [isDismissedIntro, setIsDismissedIntro] = useState(false);
  const [isDismissedOutro, setIsDismissedOutro] = useState(false);
  const [visualIntroMatched, setVisualIntroMatched] = useState(false);
  const [visualOutroMatched, setVisualOutroMatched] = useState(false);
  const [skipNotification, setSkipNotification] = useState<string | null>(null);
  const [detectedIntro, setDetectedIntro] = useState<{ start: number; end: number } | null>(null);
  const [detectedOutro, setDetectedOutro] = useState<{ start: number; end: number } | null>(null);
  const autoSkippedIntroRef = useRef(false);
  const autoSkippedOutroRef = useRef(false);
  const notificationTimerRef = useRef<number | null>(null);

  const showSkipToast = useCallback((message: string) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setSkipNotification(message);
    notificationTimerRef.current = window.setTimeout(() => {
      setSkipNotification(null);
      notificationTimerRef.current = null;
    }, 2800);
  }, []);

  // Background Video Scanning state for Intro / Outro
  const [isScanningVideo, setIsScanningVideo] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [scanSummary, setScanSummary] = useState<{
    probes: number;
    elapsedMs: number;
    introMissing: boolean;
    outroMissing: boolean;
  } | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  // Which `track|config-version` was already auto-scanned, and which track's metadata (duration) is loaded.
  const autoScanKeyRef = useRef('');
  const metadataTrackRef = useRef<string | null>(null);
  // Decoded references for the live (while playing) matcher.
  const preparedRefs = useRef<{ intro: PreparedReference | null; outro: PreparedReference | null }>({
    intro: null,
    outro: null,
  });

  // Synchronize scan status to parent
  useEffect(() => {
    if (onScanStateChange) {
      onScanStateChange({
        isScanning: isScanningVideo,
        scanProgress,
        scanStatus,
        detectedIntro,
        detectedOutro,
        scanSummary,
      });
    }
  }, [onScanStateChange, isScanningVideo, scanProgress, scanStatus, detectedIntro, detectedOutro, scanSummary]);

  // Resume Playback banner state
  const [resumePromptTime, setResumePromptTime] = useState<number | null>(null);

  // Playback quality stats
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);

  const idleTimerRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);

  // Initialize Web Audio API on video element
  const ensureAudioEngine = useCallback(() => {
    if (videoRef.current) {
      const initialized = globalAudioEngine.init(videoRef.current);
      if (initialized) {
        globalAudioEngine.setVolume(audioSettings.volume, audioSettings.muted);
        globalAudioEngine.setBoost(audioSettings.boost);
        globalAudioEngine.setBalance(audioSettings.balance);
        globalAudioEngine.applyPreset(audioSettings.eqBands);
        globalAudioEngine.setBassGain(audioSettings.bassGain);
        globalAudioEngine.setTrebleGain(audioSettings.trebleGain);
        globalAudioEngine.setVocalClarity(audioSettings.vocalClarity);
        globalAudioEngine.setDrcMode(audioSettings.drcMode);
        globalAudioEngine.setSpatialAudio(audioSettings.spatialAudio);
        globalAudioEngine.setMonoDownmix(audioSettings.monoDownmix);
        if (audioSettings.audioDelay !== undefined) {
          globalAudioEngine.setAudioDelay(audioSettings.audioDelay);
        }

        // Prevent volume squaring: video native element remains at unity gain
        videoRef.current.volume = 1.0;
        videoRef.current.muted = false;
      } else {
        // Fallback to native video volume if AudioContext is not supported
        videoRef.current.volume = audioSettings.muted ? 0 : audioSettings.volume;
        videoRef.current.muted = audioSettings.muted;
      }
    }
  }, [audioSettings]);

  // Video playback control
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    ensureAudioEngine();
    globalAudioEngine.resume();

    if (videoRef.current.paused || videoRef.current.ended) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [ensureAudioEngine]);

  const seek = useCallback((time: number) => {
    if (!videoRef.current) return;
    const safeTime = Math.max(0, Math.min(duration || 999999, time));
    videoRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
    if (onTimeUpdateSync) {
      onTimeUpdateSync(safeTime, duration);
    }
  }, [duration, onTimeUpdateSync]);

  // Frame Stepping (+-1 frame = 1/30s)
  const stepFrame = useCallback((direction: 1 | -1) => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    const frameDuration = 1 / 30; // standard 30fps step
    const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + direction * frameDuration));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    if (onTimeUpdateSync) {
      onTimeUpdateSync(target, duration);
    }
  }, [isPlaying, duration, onTimeUpdateSync]);

  // Volume & Mute handlers
  const handleVolumeChange = (vol: number) => {
    setAudioSettings(prev => ({ ...prev, volume: vol, muted: false }));
    globalAudioEngine.setVolume(vol, false);
    if (videoRef.current && !globalAudioEngine.isReady()) {
      videoRef.current.volume = vol;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !audioSettings.muted;
    setAudioSettings(prev => ({ ...prev, muted: nextMuted }));
    globalAudioEngine.setVolume(audioSettings.volume, nextMuted);
    if (videoRef.current && !globalAudioEngine.isReady()) {
      videoRef.current.muted = nextMuted;
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  // Active Subtitle lookup
  const activeSubtitle = currentTrack?.subtitles?.find(s => s.id === activeSubtitleTrackId);
  const effectiveTime = currentTime + subtitleStyle.offsetSeconds;
  const currentCue: SubtitleCue | undefined = activeSubtitle?.cues?.find(
    c => effectiveTime >= c.startTime && effectiveTime <= c.endTime
  );

  // Professional Full-Resolution Snapshot Capture (PNG/JPEG with Subtitle burn-in)
  const captureSnapshot = useCallback((options?: { format: 'png' | 'jpeg'; includeSubtitles: boolean; copyToClipboard?: boolean }) => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    try {
      const isRotated90or270 = videoSettings.rotation === 90 || videoSettings.rotation === 270;
      const canvas = document.createElement('canvas');
      canvas.width = isRotated90or270 ? video.videoHeight : video.videoWidth;
      canvas.height = isRotated90or270 ? video.videoWidth : video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Color grading filters
      const grayscaleFilter = videoSettings.grayscale > 0 ? `grayscale(${videoSettings.grayscale}%)` : '';
      const sepiaFilter = videoSettings.sepia > 0 ? `sepia(${videoSettings.sepia}%)` : '';
      const invertFilter = videoSettings.invert ? 'invert(100%)' : '';
      ctx.filter = `brightness(${videoSettings.brightness}%) contrast(${videoSettings.contrast}%) saturate(${videoSettings.saturation}%) hue-rotate(${videoSettings.hue}deg) ${grayscaleFilter} ${sepiaFilter} ${invertFilter}`.trim();

      // Transform orientation and zoom/pan
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((videoSettings.rotation * Math.PI) / 180);
      ctx.scale(videoSettings.flipHorizontal ? -1 : 1, videoSettings.flipVertical ? -1 : 1);
      ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
      ctx.restore();

      // Burn in current subtitle if option enabled
      const includeSubs = options?.includeSubtitles !== undefined ? options.includeSubtitles : true;
      if (includeSubs && currentCue) {
        ctx.save();
        const baseFontSize = (canvas.width / 1280) * subtitleStyle.fontSize * 1.5;
        ctx.font = `600 ${baseFontSize}px ${subtitleStyle.fontFamily === 'serif' ? 'serif' : subtitleStyle.fontFamily === 'mono' ? 'monospace' : 'sans-serif'}`;
        ctx.textAlign = 'center';

        const lines = currentCue.text.split('\n');
        const lineHeight = baseFontSize * 1.3;
        const totalHeight = lines.length * lineHeight;
        const subY = subtitleStyle.position === 'top' ? baseFontSize * 2 : canvas.height - totalHeight - 40;

        lines.forEach((line, i) => {
          const y = subY + (i + 1) * lineHeight;
          // Background box
          if (subtitleStyle.backgroundOpacity > 0) {
            const metrics = ctx.measureText(line);
            ctx.fillStyle = `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})`;
            ctx.fillRect(canvas.width / 2 - metrics.width / 2 - 12, y - baseFontSize, metrics.width + 24, lineHeight);
          }
          // Text Shadow / Outline
          if (subtitleStyle.textOutline === 'heavy') {
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText(line, canvas.width / 2, y);
          }
          // Main Text
          ctx.fillStyle = subtitleStyle.color;
          ctx.fillText(line, canvas.width / 2, y);
        });
        ctx.restore();
      }

      const format = options?.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const ext = options?.format === 'jpeg' ? 'jpg' : 'png';

      if (options?.copyToClipboard && typeof ClipboardItem !== 'undefined') {
        canvas.toBlob((blob) => {
          if (blob) {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(console.warn);
          }
        }, 'image/png');
      } else {
        const dataUrl = canvas.toDataURL(format, 0.95);
        const link = document.createElement('a');
        link.download = `zmt-snapshot-${currentTrack?.title || 'video'}-${Math.floor(currentTime)}s.${ext}`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.warn('Frame snapshot error:', err);
    }
  }, [videoSettings, currentTrack, currentTime, currentCue, subtitleStyle]);

  // Background video scanner function (priority-based; see utils/videoScanner.ts)
  const runBackgroundScan = useCallback(async (
    track = currentTrack,
    cfg = introOutroConfig,
    vidDuration = duration,
    force = false
  ) => {
    if (!track || !track.url || !cfg?.enabled) return;
    const introRef = cfg.introImage || cfg.screenDetection?.introFrame;
    const outroRef = cfg.outroImage || cfg.screenDetection?.outroFrame;
    if (!introRef && !outroRef) return;

    // Only look for what this episode doesn't have yet (found OR confirmed missing counts as done).
    const trackKey = getTrackKey(track);
    const cached = cfg.episodeDetections?.[trackKey];
    const needIntro = !!introRef && (force || (cached?.introStart === undefined && !cached?.introMissing));
    const needOutro = !!outroRef && (force || (cached?.outroStart === undefined && !cached?.outroMissing));
    if (!needIntro && !needOutro) return;

    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    scanAbortControllerRef.current = controller;

    setIsScanningVideo(true);
    setScanProgress(2);
    setScanStatus('Memulai pemindaian intro & outro...');
    setScanSummary(null);

    const priors = collectScanPriors(cfg, trackKey);
    const introLen = cfg.introDuration || 90;
    const outroLen = cfg.outroDuration || 90;

    try {
      const res = await scanVideoForIntroOutro({
        videoUrl: track.url,
        duration: vidDuration || track.duration,
        introImage: needIntro ? introRef : undefined,
        outroImage: needOutro ? outroRef : undefined,
        introSignature: cfg.introSignature,
        outroSignature: cfg.outroSignature,
        introDuration: introLen,
        outroDuration: outroLen,
        introSensitivity: cfg.introSensitivity || 75,
        outroSensitivity: cfg.outroSensitivity || 75,
        ...priors,
        onProgress: (pct, msg) => {
          if (controller.signal.aborted) return;
          setScanProgress(pct);
          setScanStatus(msg);
        },
        // Markers become usable the moment they are found, even while the other one is still scanning.
        onFound: (kind, marker) => {
          if (controller.signal.aborted) return;
          if (kind === 'intro') {
            setDetectedIntro(marker);
            recordEpisodeDetection(trackKey, cfg.seriesTitle, {
              introStart: marker.start,
              introEnd: marker.end,
              duration: vidDuration,
            });
            showSkipToast(`Intro terdeteksi di ${formatTime(marker.start)} (+${introLen}s)`);
          } else {
            setDetectedOutro(marker);
            recordEpisodeDetection(trackKey, cfg.seriesTitle, {
              outroStart: marker.start,
              outroEnd: marker.end,
              duration: vidDuration,
            });
            showSkipToast(`Outro terdeteksi di ${formatTime(marker.start)} (+${outroLen}s)`);
          }
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (res.introMissing || res.outroMissing) {
        recordEpisodeDetection(trackKey, cfg.seriesTitle, {
          introMissing: res.introMissing,
          outroMissing: res.outroMissing,
          duration: vidDuration,
        });
      }
      attachLearnedSignatures(trackKey, cfg.seriesTitle, {
        introSignature: res.introSignature,
        outroSignature: res.outroSignature,
      });

      setScanSummary({
        probes: res.probes,
        elapsedMs: res.elapsedMs,
        introMissing: !!res.introMissing,
        outroMissing: !!res.outroMissing,
      });
    } catch (err: any) {
      if (err?.message !== 'Scan aborted') {
        console.warn('Scan video error:', err);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsScanningVideo(false);
      }
    }
  }, [currentTrack, introOutroConfig, duration, showSkipToast]);

  // Auto-scan once per (track, saved config) as soon as the real duration is known.
  const maybeAutoScan = (track: MediaItem | undefined, cfg: IntroOutroConfig | undefined, dur: number) => {
    if (!track || !cfg?.enabled || !(dur > 0)) return;
    if (cfg.mediaTitle !== track.title) return; // config of the previous track not synced yet
    if (metadataTrackRef.current !== track.id) return;
    const key = `${track.id}|${cfg.updatedAt}`;
    if (autoScanKeyRef.current === key) return;
    autoScanKeyRef.current = key;
    runBackgroundScan(track, cfg, dur);
  };

  // Register seek, stepFrame, snapshot actions and video element to parent
  useEffect(() => {
    if (registerActions) {
      registerActions({
        seek,
        captureSnapshot,
        stepFrame,
        getVideoElement: () => videoRef.current,
        triggerScan: () => runBackgroundScan(currentTrack, introOutroConfig, duration, true),
      });
    }
  }, [registerActions, seek, captureSnapshot, stepFrame, runBackgroundScan, currentTrack, introOutroConfig, duration]);

  // Reset intro/outro states on track change (cached detections are restored instantly)
  useEffect(() => {
    setIsDismissedIntro(false);
    setIsDismissedOutro(false);
    setVisualIntroMatched(false);
    setVisualOutroMatched(false);
    autoSkippedIntroRef.current = false;
    autoSkippedOutroRef.current = false;

    if (currentTrack && introOutroConfig) {
      const trackKey = getTrackKey(currentTrack);
      const cached = introOutroConfig.episodeDetections?.[trackKey];

      if (cached?.introStart !== undefined && cached.introEnd !== undefined) {
        setDetectedIntro({ start: cached.introStart, end: cached.introEnd });
      } else {
        setDetectedIntro(null);
      }

      if (cached?.outroStart !== undefined && cached.outroEnd !== undefined) {
        setDetectedOutro({ start: cached.outroStart, end: cached.outroEnd });
      } else {
        setDetectedOutro(null);
      }
    } else {
      setDetectedIntro(null);
      setDetectedOutro(null);
    }
  }, [currentTrack?.id, introOutroConfig?.updatedAt]);

  // New track: stop the previous scan and forget its duration/metadata state.
  useEffect(() => {
    metadataTrackRef.current = null;
    setScanSummary(null);
    scanAbortControllerRef.current?.abort();
    setIsScanningVideo(false);
    return () => {
      scanAbortControllerRef.current?.abort();
    };
  }, [currentTrack?.id]);

  // Config saved/synced after the metadata arrived (e.g. user captured new references): scan again.
  useEffect(() => {
    maybeAutoScan(currentTrack, introOutroConfig, duration);
  }, [currentTrack?.id, introOutroConfig?.updatedAt, introOutroConfig?.mediaTitle, duration]);

  // Decode references once per config version for the live matcher.
  useEffect(() => {
    let cancelled = false;
    const cfg = introOutroConfig;
    preparedRefs.current = { intro: null, outro: null };
    if (!cfg) return;
    Promise.all([
      prepareReference(cfg.introImage || cfg.screenDetection?.introFrame, cfg.introSignature),
      prepareReference(cfg.outroImage || cfg.screenDetection?.outroFrame, cfg.outroSignature),
    ]).then(([intro, outro]) => {
      if (!cancelled) preparedRefs.current = { intro, outro };
    });
    return () => {
      cancelled = true;
    };
  }, [
    introOutroConfig?.updatedAt,
    introOutroConfig?.introImage,
    introOutroConfig?.outroImage,
    introOutroConfig?.introSignature,
    introOutroConfig?.outroSignature,
  ]);

  // Auto-save playback position and check resume
  useEffect(() => {
    if (!currentTrack || !duration || duration <= 0) return;

    // Check if saved position exists
    if (preferences.autoResume) {
      const saved = localStorage.getItem(`zmt_resume_${currentTrack.id}`);
      if (saved) {
        const pos = parseFloat(saved);
        if (pos > 5 && pos < duration - 10 && currentTime < 2) {
          setResumePromptTime(pos);
        }
      }
    }
  }, [currentTrack?.id, duration, preferences.autoResume]);

  // Throttled periodic save of playback progress
  useEffect(() => {
    if (!currentTrack || currentTime <= 0) return;
    const interval = setInterval(() => {
      if (preferences.autoResume && currentTime > 5 && currentTime < duration - 5) {
        localStorage.setItem(`zmt_resume_${currentTrack.id}`, currentTime.toString());
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [currentTrack?.id, currentTime, duration, preferences.autoResume]);

  // Handle single vs double click on video display
  const handleVideoClick = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      toggleFullscreen();
    } else {
      clickTimeoutRef.current = window.setTimeout(() => {
        togglePlayPause();
        clickTimeoutRef.current = null;
      }, 250);
    }
  };

  // Auto-hide controls according to preferences
  const handleMouseMove = () => {
    setShowControls(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isPlaying && preferences.autoHideDelay > 0) {
      idleTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, preferences.autoHideDelay);
    }
  };

  const handleMouseLeave = () => {
    if (isPlaying && preferences.autoHideDelay > 0) {
      setShowControls(false);
    }
  };

  // Metadata loaded
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const { videoWidth, videoHeight, duration: vidDuration } = videoRef.current;
    setDuration(vidDuration);
    if (onTimeUpdateSync) {
      onTimeUpdateSync(videoRef.current.currentTime, vidDuration);
    }

    let res = `${videoWidth}x${videoHeight}`;
    if (videoWidth >= 3840 || videoHeight >= 2160) {
      res = '4K UHD';
    } else if (videoWidth >= 2560 || videoHeight >= 1440) {
      res = '2K QHD';
    } else if (videoWidth >= 1920 || videoHeight >= 1080) {
      res = '1080p FHD';
    } else if (videoWidth >= 1280 || videoHeight >= 720) {
      res = '720p HD';
    } else if (videoWidth >= 854 || videoHeight >= 480) {
      res = '480p SD';
    }
    setDetectedResolution(res);

    videoRef.current.playbackRate = videoSettings.playbackRate;
    videoRef.current.loop = videoSettings.loop;
    videoRef.current.preservesPitch = audioSettings.preservesPitch;

    ensureAudioEngine();

    // In-band text tracks detection from HTML5 video element (Chromium native tracks)
    if (videoRef.current.textTracks && videoRef.current.textTracks.length > 0) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind === 'subtitles' || t.kind === 'captions' || !t.kind) {
          if (t.mode === 'disabled') {
            t.mode = 'hidden';
          }
          const extractCuesFromTextTrack = () => {
            if (t.cues && t.cues.length > 0) {
              const parsedCues: SubtitleCue[] = [];
              for (let c = 0; c < t.cues.length; c++) {
                const cue = t.cues[c] as VTTCue;
                parsedCues.push({
                  id: c + 1,
                  startTime: cue.startTime,
                  endTime: cue.endTime,
                  text: cleanSubtitleText(cue.text || ''),
                });
              }
              if (parsedCues.length > 0) {
                const newTrack: SubtitleTrack = {
                  id: `html5-inband-${i}-${t.language || 'und'}`,
                  label: t.label || `Embedded Subtitle #${i + 1} (${(t.language || 'Default').toUpperCase()})`,
                  language: t.language || 'und',
                  cues: parsedCues,
                  isEmbedded: true,
                };
                onAddSubtitleTrack(newTrack);
                if (!activeSubtitleTrackId) {
                  setActiveSubtitleTrackId(newTrack.id);
                }
              }
            }
          };
          t.oncuechange = extractCuesFromTextTrack;
          extractCuesFromTextTrack();
        }
      }
    }

    // Duration is now known for this track: start the (single) automatic intro/outro scan
    if (currentTrack) {
      metadataTrackRef.current = currentTrack.id;
      maybeAutoScan(currentTrack, introOutroConfig, vidDuration);
    }
  };

  // Time update & A-B Looper & Auto Skip execution
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // A-B Loop execution
    if (abLoop.enabled && abLoop.start !== null && abLoop.end !== null) {
      if (time >= abLoop.end || time < abLoop.start) {
        videoRef.current.currentTime = abLoop.start;
        setCurrentTime(abLoop.start);
      }
    }

    // Auto Skip Intro & Outro execution (supports dynamic image detection and fixed duration)
    if (introOutroConfig?.enabled) {
      const effIntroStart = detectedIntro?.start ?? null;
      const effIntroEnd = detectedIntro?.end ?? null;

      if (
        effIntroStart !== null &&
        effIntroEnd !== null &&
        introOutroConfig.autoSkipIntro &&
        !autoSkippedIntroRef.current &&
        time >= effIntroStart &&
        time < effIntroEnd
      ) {
        autoSkippedIntroRef.current = true;
        seek(effIntroEnd);
        showSkipToast(`Intro dilewati otomatis (+${introOutroConfig.introDuration || 90}s) ➔ ${formatTime(effIntroEnd)}`);
      }

      const effOutroStart = detectedOutro?.start ?? null;
      const effOutroEnd = detectedOutro?.end ?? null;

      if (
        effOutroStart !== null &&
        effOutroEnd !== null &&
        introOutroConfig.autoSkipOutro &&
        !autoSkippedOutroRef.current &&
        time >= effOutroStart &&
        time < effOutroEnd
      ) {
        autoSkippedOutroRef.current = true;
        if (duration > 0 && effOutroEnd < duration - 10) {
          seek(effOutroEnd);
          showSkipToast(`Outro dilewati otomatis ➔ Memutar After-Film / Post-Credits 🎬 (${formatTime(effOutroEnd)})`);
        } else if (currentIndex < playlist.length - 1) {
          onSelectTrack(currentIndex + 1);
          showSkipToast('Outro dilewati otomatis ➔ Memutar episode berikutnya');
        } else {
          seek(effOutroEnd);
          showSkipToast('Outro dilewati otomatis ➔ Akhir video');
        }
      }
    }

    if (onTimeUpdateSync) {
      onTimeUpdateSync(time, duration);
    }

    const buffered = videoRef.current.buffered;
    if (buffered.length > 0) {
      setBufferedEnd(buffered.end(buffered.length - 1));
    }

    // Video playback quality stats
    const video = videoRef.current as unknown as { getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number } };
    if (typeof video.getVideoPlaybackQuality === 'function') {
      const q = video.getVideoPlaybackQuality();
      setDroppedFrames(q.droppedVideoFrames);
      setTotalFrames(q.totalVideoFrames);
    }
  };

  // Video ended progression
  const handleVideoEnded = () => {
    if (videoSettings.loop || repeatMode === 'one') {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
      }
      return;
    }

    if (!preferences.autoPlayNext && repeatMode === 'off') {
      setIsPlaying(false);
      return;
    }

    if (playlist.length <= 1) {
      setIsPlaying(false);
      return;
    }

    if (shuffle) {
      let nextIdx = Math.floor(Math.random() * playlist.length);
      if (nextIdx === currentIndex) {
        nextIdx = (currentIndex + 1) % playlist.length;
      }
      onSelectTrack(nextIdx);
      return;
    }

    if (currentIndex < playlist.length - 1) {
      onSelectTrack(currentIndex + 1);
    } else if (repeatMode === 'all') {
      onSelectTrack(0);
    } else {
      setIsPlaying(false);
    }
  };

  // Live safety net while playing: recognises the intro/outro from ANY frame inside it (via the signature),
  // so skipping works even before the background scan finishes or when it was disabled.
  useEffect(() => {
    if (!introOutroConfig?.enabled || !isPlaying) return;
    if (!introOutroConfig.introImage && !introOutroConfig.outroImage && !introOutroConfig.introSignature && !introOutroConfig.outroSignature) return;

    const trackKey = currentTrack ? getTrackKey(currentTrack) : undefined;
    const cached = trackKey ? introOutroConfig.episodeDetections?.[trackKey] : undefined;

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;

      const t = video.currentTime;
      const totalDur = duration || video.duration || 1440;
      const { intro: introRef, outro: outroRef } = preparedRefs.current;

      if (introRef && !detectedIntro && !cached?.introMissing && t < Math.max(totalDur * 0.7, 720)) {
        const sensitivity = introOutroConfig.introSensitivity || 75;
        const m = matchVideoFrame(video, introRef);
        if (m && m.score >= sensitivity) {
          const len = introOutroConfig.introDuration || 90;
          const start = Math.max(0, Math.floor(t - m.offset));
          const end = Math.min(totalDur, start + len);
          setDetectedIntro({ start, end });
          setVisualIntroMatched(true);
          showSkipToast(`Intro terdeteksi di ${formatTime(start)} (+${len}s)`);

          if (currentTrack) {
            recordEpisodeDetection(getTrackKey(currentTrack), introOutroConfig.seriesTitle, {
              introStart: start,
              introEnd: end,
              duration: totalDur,
            });
          }

          if (introOutroConfig.autoSkipIntro && !autoSkippedIntroRef.current) {
            autoSkippedIntroRef.current = true;
            seek(end);
          }
        }
      }

      if (outroRef && !detectedOutro && !cached?.outroMissing && t > totalDur * 0.3) {
        const sensitivity = introOutroConfig.outroSensitivity || 75;
        const m = matchVideoFrame(video, outroRef);
        if (m && m.score >= sensitivity) {
          const len = introOutroConfig.outroDuration || 90;
          const start = Math.max(0, Math.floor(t - m.offset));
          const end = Math.min(totalDur, start + len);
          setDetectedOutro({ start, end });
          setVisualOutroMatched(true);

          const hasAfter = end < totalDur - 10;
          showSkipToast(
            hasAfter
              ? `Outro terdeteksi di ${formatTime(start)} (ada after-film di ${formatTime(end)})`
              : `Outro terdeteksi di ${formatTime(start)}`
          );

          if (currentTrack) {
            recordEpisodeDetection(getTrackKey(currentTrack), introOutroConfig.seriesTitle, {
              outroStart: start,
              outroEnd: end,
              duration: totalDur,
            });
          }

          if (introOutroConfig.autoSkipOutro && !autoSkippedOutroRef.current) {
            autoSkippedOutroRef.current = true;
            if (hasAfter) {
              seek(end);
            } else if (currentIndex < playlist.length - 1) {
              onSelectTrack(currentIndex + 1);
            } else {
              seek(end);
            }
          }
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [
    introOutroConfig,
    isPlaying,
    duration,
    detectedIntro,
    detectedOutro,
    currentTrack,
    currentIndex,
    playlist.length,
    seek,
    onSelectTrack,
    showSkipToast
  ]);

  // Skip actions
  const handleManualSkipIntro = () => {
    if (!introOutroConfig) return;
    const effEnd = effIntroEnd ?? (currentTime + (introOutroConfig.introDuration || 90));
    seek(effEnd);
    setIsDismissedIntro(true);
    showSkipToast(`Intro dilewati (+${introOutroConfig.introDuration || 90}s) ➔ ${formatTime(effEnd)}`);
  };

  const handleManualSkipOutro = () => {
    if (!introOutroConfig) return;
    setIsDismissedOutro(true);
    const effEnd = effOutroEnd ?? (currentTime + (introOutroConfig.outroDuration || 90));
    const hasAfter = duration > 0 && effEnd < duration - 10;
    if (hasAfter) {
      seek(effEnd);
      showSkipToast(`Outro dilewati (+${introOutroConfig.outroDuration || 90}s) ➔ Memutar After-Film / Post-Credits 🎬 (${formatTime(effEnd)})`);
    } else if (currentIndex < playlist.length - 1) {
      onSelectTrack(currentIndex + 1);
      showSkipToast('Outro dilewati ➔ Memutar episode berikutnya');
    } else {
      seek(effEnd);
      showSkipToast(`Outro dilewati ➔ Selesai`);
    }
  };

  // Track change auto-play
  useEffect(() => {
    if (videoRef.current && currentTrack) {
      setCrossOriginMode('anonymous');
      if (isPlaying) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(console.warn);
      }
    }
  }, [currentTrack?.id]);

  // Sync playback rate and pitch lock
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = videoSettings.playbackRate;
      videoRef.current.loop = videoSettings.loop;
      videoRef.current.preservesPitch = audioSettings.preservesPitch;
    }
  }, [videoSettings.playbackRate, videoSettings.loop, audioSettings.preservesPitch]);

  // Comprehensive Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seek(currentTime - (e.shiftKey ? 10 : 5));
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seek(currentTime + (e.shiftKey ? 10 : 5));
          break;
        case ',':
          e.preventDefault();
          stepFrame(-1);
          break;
        case '.':
          e.preventDefault();
          stepFrame(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(Math.min(1, audioSettings.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, audioSettings.volume - 0.05));
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'f':
        case 'F':
        case 'F11':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          if (e.shiftKey) {
            if (currentIndex > 0) onSelectTrack(currentIndex - 1);
          } else {
            togglePiP();
          }
          break;
        case 's':
        case 'S':
          e.preventDefault();
          if (showSkipIntroBtn) {
            handleManualSkipIntro();
          } else if (showSkipOutroBtn) {
            handleManualSkipOutro();
          } else {
            onOpenStudioSettings('subtitles');
          }
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          onOpenStudioSettings('audio');
          break;
        case 'v':
        case 'V':
          e.preventDefault();
          onOpenStudioSettings('video');
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          captureSnapshot();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          if (onOpenIntroOutro) onOpenIntroOutro();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setVideoSettings(prev => ({ ...prev, rotation: ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270 }));
          break;
        case 'D':
          if (e.shiftKey) {
            e.preventDefault();
            setPreferences(prev => ({ ...prev, showStatsForNerds: !prev.showStatsForNerds }));
          }
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          if (abLoop.start === null) {
            setAbLoop({ enabled: false, start: currentTime, end: null });
          } else if (abLoop.end === null && currentTime > abLoop.start) {
            setAbLoop(prev => ({ ...prev, end: currentTime, enabled: true }));
          } else {
            setAbLoop({ enabled: false, start: null, end: null });
          }
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          if (currentIndex < playlist.length - 1) onSelectTrack(currentIndex + 1);
          break;
        case '[':
          setVideoSettings(prev => ({ ...prev, playbackRate: Math.max(0.1, Math.round((prev.playbackRate - 0.25) * 100) / 100) }));
          break;
        case ']':
          setVideoSettings(prev => ({ ...prev, playbackRate: Math.min(4.0, Math.round((prev.playbackRate + 0.25) * 100) / 100) }));
          break;
        case '?':
          e.preventDefault();
          onOpenShortcuts();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlayPause,
    seek,
    stepFrame,
    currentTime,
    duration,
    audioSettings.volume,
    handleVolumeChange,
    handleToggleMute,
    captureSnapshot,
    currentIndex,
    playlist.length,
    onSelectTrack,
    abLoop,
    setAbLoop,
    setVideoSettings,
    setPreferences,
    onOpenStudioSettings,
    onOpenShortcuts,
  ]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const files = e.dataTransfer.files;
    const firstFile = files[0];
    const ext = firstFile.name.toLowerCase();

    if (ext.endsWith('.srt') || ext.endsWith('.vtt') || ext.endsWith('.ass') || ext.endsWith('.ssa')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text && currentTrack) {
          const cues = parseSubtitleFile(text, firstFile.name);
          const newTrack: SubtitleTrack = {
            id: `sub-drop-${Date.now()}`,
            label: firstFile.name.replace(/\.[^/.]+$/, ''),
            language: 'custom',
            cues,
            isCustom: true,
          };
          onAddSubtitleTrack(newTrack);
          setActiveSubtitleTrackId(newTrack.id);
        }
      };
      reader.readAsText(firstFile);
    } else {
      onAddFiles(files);
    }
  };

  // Aspect Ratio class mapper
  const getAspectRatioClasses = () => {
    switch (videoSettings.aspectRatio) {
      case '16:9':
        return 'w-full aspect-[16/9] object-cover';
      case '4:3':
        return 'w-full aspect-[4/3] object-cover';
      case '21:9':
        return 'w-full aspect-[21/9] object-cover';
      case '18:9':
        return 'w-full aspect-[18/9] object-cover';
      case '1:1':
        return 'w-full aspect-square object-cover';
      case 'fill':
        return 'w-full h-full object-fill';
      case 'fit':
      default:
        return 'w-full h-full object-contain';
    }
  };

  // CSS Filters
  const sharpnessFilter = videoSettings.sharpness !== 'off' ? `url(#zmt-sharpness-${videoSettings.sharpness})` : '';
  const gammaFilter = videoSettings.gamma !== 1.0 ? 'url(#zmt-gamma-filter)' : '';
  const invertFilter = videoSettings.invert ? 'invert(100%)' : '';
  const grayscaleFilter = videoSettings.grayscale > 0 ? `grayscale(${videoSettings.grayscale}%)` : '';
  const sepiaFilter = videoSettings.sepia > 0 ? `sepia(${videoSettings.sepia}%)` : '';

  // Intro & Outro detection visibility (prefers image-detected, cached episode, anchor, with fixed duration)
  const trackKey = currentTrack ? getTrackKey(currentTrack) : undefined;
  const cachedEpisode = trackKey ? introOutroConfig?.episodeDetections?.[trackKey] : undefined;

  // Positions are whatever was detected for THIS episode (never the reference episode's timestamp).
  const effIntroStart =
    detectedIntro?.start ??
    cachedEpisode?.introStart ??
    null;

  const effIntroEnd =
    detectedIntro?.end ??
    cachedEpisode?.introEnd ??
    (effIntroStart !== null ? effIntroStart + (introOutroConfig?.introDuration || 90) : null);

  const effOutroStart =
    detectedOutro?.start ??
    cachedEpisode?.outroStart ??
    null;

  const effOutroEnd =
    detectedOutro?.end ??
    cachedEpisode?.outroEnd ??
    (effOutroStart !== null ? effOutroStart + (introOutroConfig?.outroDuration || 90) : null);

  const isInIntroRange = !!(
    introOutroConfig?.enabled &&
    effIntroStart !== null &&
    effIntroEnd !== null &&
    currentTime >= effIntroStart &&
    currentTime < effIntroEnd
  );

  const isInOutroRange = !!(
    introOutroConfig?.enabled &&
    effOutroStart !== null &&
    effOutroEnd !== null &&
    currentTime >= effOutroStart &&
    currentTime < effOutroEnd
  );

  const showSkipIntroBtn = isInIntroRange && !isDismissedIntro;
  const showSkipOutroBtn = isInOutroRange && !isDismissedOutro;

  const hasAfterFilm = !!(
    effOutroEnd !== null &&
    duration > 0 &&
    effOutroEnd < duration - 10
  );

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none group ${
        isFullscreen ? 'fixed inset-0 z-50' : 'min-h-[460px] lg:min-h-[580px] rounded-2xl border border-cyan-950/40 shadow-2xl shadow-cyan-950/30'
      }`}
    >
      {/* SVG Convolution & Gamma Filters Definition */}
      <VideoSvgFilters gamma={videoSettings.gamma} />

      {/* Video Element */}
      {currentTrack ? (
        <video
          ref={videoRef}
          src={currentTrack.url}
          crossOrigin={crossOriginMode}
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoEnded}
          onError={() => {
            if (crossOriginMode === 'anonymous') {
              setCrossOriginMode(undefined);
              if (videoRef.current) {
                videoRef.current.removeAttribute('crossorigin');
                videoRef.current.load();
              }
            }
          }}
          onClick={handleVideoClick}
          className={`cursor-pointer transition-all duration-150 ${getAspectRatioClasses()}`}
          style={{
            filter: `brightness(${videoSettings.brightness}%) contrast(${videoSettings.contrast}%) saturate(${videoSettings.saturation}%) hue-rotate(${videoSettings.hue}deg) ${grayscaleFilter} ${sepiaFilter} ${invertFilter} ${sharpnessFilter} ${gammaFilter}`.trim(),
            transform: `rotate(${videoSettings.rotation}deg) scaleX(${videoSettings.flipHorizontal ? -1 : 1}) scaleY(${videoSettings.flipVertical ? -1 : 1}) scale(${videoSettings.zoom / 100}) translate(${videoSettings.panX}px, ${videoSettings.panY}px)`,
            transformOrigin: 'center center',
            imageRendering: videoSettings.renderingQuality === 'crisp' ? 'pixelated' : 'auto',
          }}
        />
      ) : (
        /* Empty State */
        <div
          onClick={onOpenSubtitles}
          className="flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-4"
        >
          <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-xl shadow-cyan-500/10">
            <Film className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-1">No Video Selected</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              Drag & Drop your video or subtitle file here, or click Open Video from the top header.
            </p>
          </div>
        </div>
      )}

      {/* Center Play Indicator */}
      {!isPlaying && currentTrack && (
        <button
          onClick={togglePlayPause}
          className="absolute z-20 w-20 h-20 rounded-full bg-cyan-500/90 hover:bg-cyan-400 text-black flex items-center justify-center shadow-2xl shadow-cyan-500/50 hover:scale-110 transition duration-200"
        >
          <Play className="w-8 h-8 fill-black ml-1" />
        </button>
      )}

      {/* Smart Resume Playback Banner */}
      {resumePromptTime !== null && (
        <div className="absolute top-6 z-40 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-cyan-500/50 text-white shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <RotateCcw className="w-4 h-4 text-cyan-400" />
          <span className="text-xs">
            Resume playback from <strong className="text-cyan-300 font-mono">{formatTime(resumePromptTime)}</strong>?
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={() => {
                seek(resumePromptTime);
                setResumePromptTime(null);
              }}
              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs"
            >
              Resume
            </button>
            <button
              onClick={() => setResumePromptTime(null)}
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats for Nerds HUD */}
      {preferences.showStatsForNerds && currentTrack && (
        <div className="absolute top-4 left-4 z-30 p-3.5 rounded-xl bg-black/85 border border-cyan-500/30 text-[11px] font-mono text-slate-200 backdrop-blur-md shadow-2xl max-w-xs space-y-1.5 pointer-events-none select-none">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-1 font-bold text-cyan-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Stats for Nerds
            </span>
            <span className="text-[10px] text-slate-400">Shift+D to hide</span>
          </div>
          <div><span className="text-slate-400">Track:</span> {currentTrack.title}</div>
          <div><span className="text-slate-400">Resolution:</span> {detectedResolution || currentTrack.resolution || 'N/A'}</div>
          <div><span className="text-slate-400">Viewport:</span> {containerRef.current ? `${containerRef.current.clientWidth}x${containerRef.current.clientHeight}` : 'N/A'}</div>
          <div><span className="text-slate-400">Aspect Ratio:</span> {videoSettings.aspectRatio}</div>
          <div><span className="text-slate-400">Speed / Pitch:</span> {videoSettings.playbackRate}x {audioSettings.preservesPitch ? '(Pitch Locked)' : '(Tape Pitch)'}</div>
          <div><span className="text-slate-400">Frames:</span> Decoded: {totalFrames || 'N/A'}, Dropped: {droppedFrames}</div>
          <div><span className="text-slate-400">Buffer:</span> {bufferedEnd > currentTime ? `${(bufferedEnd - currentTime).toFixed(1)}s ahead` : '0s'}</div>
          <div><span className="text-slate-400">Audio DSP:</span> {globalAudioEngine.getAudioStats().sampleRate}Hz | DRC: {audioSettings.drcMode}</div>
          <div><span className="text-slate-400">Rotation / Zoom:</span> {videoSettings.rotation}&deg; / {videoSettings.zoom}%</div>
        </div>
      )}

      {/* Subtitles Overlay */}
      {currentCue && (
        <div
          className={`absolute left-0 right-0 z-20 flex justify-center px-6 pointer-events-none transition-all duration-150 ${
            subtitleStyle.position === 'top'
              ? 'top-10'
              : subtitleStyle.position === 'middle'
              ? 'top-1/2 -translate-y-1/2'
              : showControls
              ? 'bottom-24'
              : 'bottom-10'
          }`}
        >
          <div
            style={{
              fontSize: `${subtitleStyle.fontSize}px`,
              color: subtitleStyle.color,
              fontFamily: subtitleStyle.fontFamily === 'serif' ? 'serif' : subtitleStyle.fontFamily === 'mono' ? 'monospace' : 'sans-serif',
              backgroundColor:
                subtitleStyle.backgroundColor === 'transparent'
                  ? 'transparent'
                  : `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})`,
              textShadow:
                subtitleStyle.textOutline === 'heavy'
                  ? '0 2px 6px rgba(0,0,0,0.95), 0 0 6px #000, 0 0 4px #000'
                  : subtitleStyle.textOutline === 'medium'
                  ? '0 1px 3px rgba(0,0,0,0.9), 0 0 3px #000'
                  : subtitleStyle.textShadow
                  ? '0 1px 2px rgba(0,0,0,0.8)'
                  : 'none',
            }}
            className="px-4 py-1.5 rounded-lg text-center font-medium max-w-[90%] leading-snug whitespace-pre-line backdrop-blur-[2px]"
          >
            {currentCue.text}
          </div>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-cyan-950/80 backdrop-blur-md border-4 border-dashed border-cyan-400 flex flex-col items-center justify-center text-white pointer-events-none animate-in fade-in">
          <UploadCloud className="w-16 h-16 text-cyan-400 mb-3 animate-bounce" />
          <p className="text-xl font-bold text-cyan-200">Drop Video or Subtitle File Here</p>
          <p className="text-xs text-cyan-400/80 mt-1">Supports MP4, MKV, WebM, SRT, VTT, ASS</p>
        </div>
      )}

      {/* Background Video Scanning Progress Badge */}
      {isScanningVideo && (
        <div className="absolute top-5 left-5 z-40 w-64 rounded-xl bg-slate-950/85 border border-white/10 text-white shadow-xl backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
          <div className="px-3 py-2 flex items-center gap-2.5">
            <Loader2 className="w-3.5 h-3.5 text-cyan-300 animate-spin flex-shrink-0" />
            <span className="flex-1 truncate text-[11px] text-slate-200 font-medium">
              {scanStatus || 'Memindai intro & outro...'}
            </span>
            <span className="text-[11px] font-mono font-bold text-cyan-300 tabular-nums">{scanProgress}%</span>
          </div>
          <div className="h-0.5 bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-cyan-300 transition-all duration-200"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Toast Notification for Skip Action */}
      {skipNotification && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-40 max-w-[85%] bg-slate-950/90 text-slate-100 border border-white/10 px-4 py-2 rounded-xl text-xs font-medium shadow-xl flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
          <FastForward className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />
          <span className="truncate">{skipNotification}</span>
        </div>
      )}

      {/* Floating skip buttons (intro and outro stack so they never overlap) */}
      {(showSkipIntroBtn || showSkipOutroBtn) && introOutroConfig && (
        <div
          className={`absolute right-5 z-30 flex flex-col items-end gap-2 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
            showControls ? 'bottom-24' : 'bottom-8'
          }`}
        >
          {showSkipIntroBtn && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleManualSkipIntro}
                className="pl-3.5 pr-3 py-2 rounded-lg bg-white/95 hover:bg-white text-slate-900 font-semibold text-xs sm:text-sm shadow-xl flex items-center gap-2.5 transition active:scale-95 cursor-pointer border-l-4 border-purple-500"
              >
                <span>Lewati Intro</span>
                <span className="text-[11px] font-mono font-medium text-slate-500 tabular-nums">
                  {effIntroEnd ? formatTime(effIntroEnd) : `+${introOutroConfig.introDuration || 90}s`}
                </span>
                <FastForward className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => setIsDismissedIntro(true)}
                className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition cursor-pointer"
                title="Tutup (dengarkan lagu opening)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {showSkipOutroBtn && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleManualSkipOutro}
                className="pl-3.5 pr-3 py-2 rounded-lg bg-white/95 hover:bg-white text-slate-900 font-semibold text-xs sm:text-sm shadow-xl flex items-center gap-2.5 transition active:scale-95 cursor-pointer border-l-4 border-rose-500"
              >
                <span>
                  {hasAfterFilm
                    ? 'Lewati Outro • After-Film'
                    : currentIndex < playlist.length - 1
                      ? 'Lewati Outro • Eps Berikutnya'
                      : 'Lewati Outro'}
                </span>
                <span className="text-[11px] font-mono font-medium text-slate-500 tabular-nums">
                  {hasAfterFilm && effOutroEnd ? formatTime(effOutroEnd) : `+${introOutroConfig.outroDuration || 90}s`}
                </span>
                <FastForward className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => setIsDismissedOutro(true)}
                className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition cursor-pointer"
                title="Tutup (dengarkan ending song)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ControlsBar
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlayPause={togglePlayPause}
          currentTime={currentTime}
          duration={duration}
          bufferedEnd={bufferedEnd}
          onSeek={seek}
          volume={audioSettings.volume}
          boost={audioSettings.boost}
          muted={audioSettings.muted}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTogglePiP={togglePiP}
          onOpenSubtitles={onOpenSubtitles}
          onOpenEqualizer={onOpenEqualizer}
          onOpenVideoSettings={onOpenVideoSettings}
          onOpenStudioSettings={onOpenStudioSettings}
          onOpenIntroOutro={onOpenIntroOutro}
          introOutroConfig={introOutroConfig}
          detectedIntro={detectedIntro}
          detectedOutro={detectedOutro}
          abLoop={abLoop}
          onStepFrame={stepFrame}
          activeSubtitleLabel={activeSubtitle?.label}
          playbackRate={videoSettings.playbackRate}
          eqPreset={audioSettings.eqPreset}
          resolution={detectedResolution || currentTrack?.resolution}
          onNextTrack={() => {
            if (shuffle) {
              const randIdx = Math.floor(Math.random() * playlist.length);
              onSelectTrack(randIdx);
            } else if (currentIndex < playlist.length - 1) {
              onSelectTrack(currentIndex + 1);
            } else if (repeatMode === 'all') {
              onSelectTrack(0);
            }
          }}
          onPrevTrack={() => {
            if (currentIndex > 0) {
              onSelectTrack(currentIndex - 1);
            } else if (repeatMode === 'all') {
              onSelectTrack(playlist.length - 1);
            }
          }}
          hasPrevTrack={currentIndex > 0 || (repeatMode === 'all' && playlist.length > 1)}
          hasNextTrack={currentIndex < playlist.length - 1 || (repeatMode === 'all' && playlist.length > 1)}
        />
      </div>

    </div>
  );
};
