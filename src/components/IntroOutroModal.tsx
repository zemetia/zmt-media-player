import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FastForward,
  X,
  Camera,
  Upload,
  CheckCircle2,
  Check,
  RotateCcw,
  Clock,
  Tv,
  Search,
  Loader2,
  Play,
  Minus,
  Plus,
  Zap,
  ChevronDown,
  Info,
  TriangleAlert,
  Folder,
} from 'lucide-react';
import { FrameSignature, IntroOutroConfig, IntroOutroPattern, MediaItem } from '../types';
import { formatTime } from '../utils/subtitleParser';
import { extractSeriesInfo } from '../utils/seriesMatcher';
import { captureFrameFingerprint, fingerprintFromFile } from '../utils/screenFingerprint';
import {
  saveIntroOutroConfig,
  createDefaultConfig,
  getTrackKey,
  getIntroPatterns,
  getOutroPatterns,
  syncPrimaryPatterns,
} from '../utils/introOutroStorage';
import { PreparedReference, matchVideoFrame, prepareReference } from '../utils/frameSignature';
import { buildFrameSignature } from '../utils/videoScanner';

type Kind = 'intro' | 'outro';

interface IntroOutroModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack?: MediaItem;
  currentTime: number;
  duration: number;
  videoElement: HTMLVideoElement | null;
  config: IntroOutroConfig;
  onUpdateConfig: (config: IntroOutroConfig) => void;
  onSeek: (seconds: number) => void;
  // Scanner state & controls
  isScanning?: boolean;
  scanProgress?: number;
  scanStatus?: string;
  onTriggerScan?: () => void;
  detectedIntro?: { start: number; end: number } | null;
  detectedOutro?: { start: number; end: number } | null;
  scanSummary?: { probes: number; elapsedMs: number; introMissing: boolean; outroMissing: boolean } | null;
}

// Static class maps (Tailwind needs literal class names)
const THEME = {
  intro: {
    label: 'Intro (Opening)',
    short: 'OP',
    dot: 'bg-violet-400',
    text: 'text-violet-300',
    border: 'border-violet-500/25',
    soft: 'bg-violet-500/10',
    solid: 'bg-violet-500',
    ring: 'focus-visible:ring-violet-400/60',
    btn: 'bg-violet-500/15 hover:bg-violet-500/25 border-violet-400/30 text-violet-100',
    chipOn: 'bg-violet-500 text-white',
    accent: '#8b5cf6',
    bar: 'bg-violet-400',
  },
  outro: {
    label: 'Outro (Ending)',
    short: 'ED',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    border: 'border-rose-500/25',
    soft: 'bg-rose-500/10',
    solid: 'bg-rose-500',
    ring: 'focus-visible:ring-rose-400/60',
    btn: 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/30 text-rose-100',
    chipOn: 'bg-rose-500 text-white',
    accent: '#f43f5e',
    bar: 'bg-rose-400',
  },
} as const;

const DURATION_PRESETS = [60, 80, 90, 120];

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; tone: Kind | 'cyan' }> = ({
  checked,
  onChange,
  label,
  hint,
  tone,
}) => {
  const on = tone === 'intro' ? 'bg-violet-500' : tone === 'outro' ? 'bg-rose-500' : 'bg-cyan-500';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-200 group-hover:text-white">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500 leading-snug">{hint}</span>}
      </span>
      <span className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? on : 'bg-slate-700'}`}>
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </span>
    </button>
  );
};

/** Episode timeline: detected intro / outro segments, playhead, click to seek. */
const Timeline: React.FC<{
  duration: number;
  currentTime: number;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  onSeek: (t: number) => void;
}> = ({ duration, currentTime, intro, outro, onSeek }) => {
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;
  const seg = (m: { start: number; end: number }, cls: string, title: string) => (
    <div
      key={title}
      title={`${title} ${formatTime(m.start)} – ${formatTime(m.end)}`}
      className={`absolute top-0 bottom-0 rounded-sm ${cls}`}
      style={{ left: pct(m.start), width: `${Math.max(0.6, ((Math.min(m.end, duration) - m.start) / duration) * 100)}%` }}
    />
  );
  return (
    <div
      className="relative h-3 rounded-full bg-slate-800 cursor-pointer overflow-hidden"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * duration);
      }}
    >
      {intro && seg(intro, 'bg-violet-500/80', 'Intro')}
      {outro && seg(outro, 'bg-rose-500/80', 'Outro')}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ left: pct(currentTime) }} />
    </div>
  );
};

interface MarkerCardProps {
  kind: Kind;
  config: IntroOutroConfig;
  currentTime: number;
  hasVideo: boolean;
  signatureProgress: number | null;
  liveMatch: { score: number; offset: number } | null;
  activePatternId: string;
  onSelectPattern: (id: string) => void;
  onAddPattern: () => void;
  onDeletePattern: (id: string) => void;
  onRenamePattern: (id: string, label: string) => void;
  onCapture: (patternId: string) => void;
  onUpload: (patternId: string, file: File) => void;
  onClear: (patternId: string) => void;
  onDuration: (patternId: string, d: number) => void;
  onAutoSkip: (v: boolean) => void;
  onSensitivity: (patternId: string, v: number) => void;
}

const MarkerCard: React.FC<MarkerCardProps> = ({
  kind,
  config,
  currentTime,
  hasVideo,
  signatureProgress,
  liveMatch,
  activePatternId,
  onSelectPattern,
  onAddPattern,
  onDeletePattern,
  onRenamePattern,
  onCapture,
  onUpload,
  onClear,
  onDuration,
  onAutoSkip,
  onSensitivity,
}) => {
  const t = THEME[kind];
  const fileRef = useRef<HTMLInputElement | null>(null);

  const patterns = kind === 'intro' ? getIntroPatterns(config) : getOutroPatterns(config);
  const currentPattern = patterns.find((p) => p.id === activePatternId) || patterns[0] || {
    id: `${kind}-1`,
    label: `${t.short} 1`,
    kind,
    duration: 90,
    sensitivity: 75,
  };

  const frame = currentPattern.image;
  const signature: FrameSignature | undefined = currentPattern.signature;
  const duration = currentPattern.duration || 90;
  const sensitivity = currentPattern.sensitivity || 75;
  const autoSkip = kind === 'intro' ? config.autoSkipIntro : config.autoSkipOutro;
  const building = signatureProgress !== null;

  const mode = building
    ? { text: `Membangun pola ${signatureProgress}%`, cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' }
    : signature
      ? { text: 'Mode cepat', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
      : frame
        ? { text: 'Frame tunggal • lambat', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
        : { text: 'Belum diatur', cls: 'bg-slate-700/60 text-slate-400 border-slate-600/50' };

  return (
    <section className={`rounded-2xl bg-slate-900/60 border ${t.border} p-4 space-y-4`}>
      {/* Title */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
          <h3 className="text-sm font-semibold text-white truncate">{t.label}</h3>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${mode.cls}`}>
          {building && <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />}
          {!building && signature && <Zap className="inline w-3 h-3 mr-1" />}
          {mode.text}
        </span>
      </div>

      {/* Multiple Patterns Tab Selector (Supports Anime Cour 1 / Cour 2 multiple OPs & EDs) */}
      <div className="space-y-2 pt-1 border-t border-white/5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-slate-400 mr-1">Varian:</span>
            {patterns.map((p, idx) => {
              const isActive = p.id === currentPattern.id;
              const hasData = !!(p.image || p.signature);
              return (
                <div key={p.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => onSelectPattern(p.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      isActive
                        ? `${t.chipOn} font-semibold shadow-sm`
                        : 'bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60'
                    }`}
                  >
                    {hasData ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    )}
                    <span>{p.label || `${t.short} ${idx + 1}`}</span>
                  </button>
                  {patterns.length > 1 && isActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePattern(p.id);
                      }}
                      className="ml-1 p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition cursor-pointer"
                      title={`Hapus varian ${p.label}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onAddPattern}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition cursor-pointer"
            title={`Tambah varian ${t.label} baru (misal: OP 2 untuk episode 13+)`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah</span>
          </button>
        </div>

        {/* Label Editor */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Nama Varian:</span>
          <input
            type="text"
            value={currentPattern.label}
            onChange={(e) => onRenamePattern(currentPattern.id, e.target.value)}
            placeholder="Nama varian (contoh: Opening 2 - Eps 13-24)"
            className="bg-slate-950/70 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1 flex-1 focus:outline-none focus:border-cyan-400 transition"
          />
        </div>
      </div>

      {/* Reference thumbnail */}
      <div className="flex gap-3">
        <div className="relative w-36 aspect-video flex-shrink-0 rounded-lg overflow-hidden bg-black border border-white/10">
          {frame?.snapshotUrl ? (
            <img src={frame.snapshotUrl} alt={`Frame acuan ${kind}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500 text-center px-2">
              Belum ada frame acuan
            </div>
          )}
          {building && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${signatureProgress}%` }} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2 justify-center">
          <button
            onClick={() => onCapture(currentPattern.id)}
            disabled={!hasVideo || building}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${t.btn}`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Tangkap saat ini ({formatTime(currentTime)})</span>
          </button>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(currentPattern.id, f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={building}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Gambar</span>
            </button>
            {frame && (
              <button
                onClick={() => onClear(currentPattern.id)}
                disabled={building}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-500/40 text-slate-400 hover:text-red-300 text-xs flex items-center gap-1 transition disabled:opacity-40 cursor-pointer"
                title="Hapus acuan"
              >
                <X className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {frame && !signature && !building && (
        <p className="flex gap-2 text-[11px] leading-relaxed text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Acuan berupa satu frame, pemindaian harus rapat sehingga lebih lambat. Tangkap dari video agar pola seluruh{' '}
            {kind === 'intro' ? 'opening' : 'ending'} dipelajari (mode cepat), atau biarkan sistem mempelajarinya otomatis
            setelah deteksi pertama berhasil.
          </span>
        </p>
      )}

      {/* Live match meter */}
      {frame && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Kecocokan layar sekarang ({currentPattern.label})</span>
            <span className={`font-mono tabular-nums ${liveMatch && liveMatch.score >= sensitivity ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
              {liveMatch ? `${liveMatch.score}%` : '—'}
              {liveMatch && liveMatch.score >= sensitivity && signature && liveMatch.offset > 0
                ? ` • +${Math.round(liveMatch.offset)}s dari awal`
                : ''}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${liveMatch && liveMatch.score >= sensitivity ? 'bg-emerald-400' : t.bar}`}
              style={{ width: `${liveMatch?.score ?? 0}%` }}
            />
            <div className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${sensitivity}%` }} />
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <Clock className={`w-3.5 h-3.5 ${t.text}`} />
          <span className="font-medium">Lompat sejauh</span>
          <span className="text-slate-500">dari titik terdeteksi ({currentPattern.label})</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg bg-slate-800 border border-slate-700 overflow-hidden">
            <button
              onClick={() => onDuration(currentPattern.id, duration - 1)}
              className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
              aria-label="Kurangi 1 detik"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min={10}
              max={300}
              value={duration}
              onChange={(e) => onDuration(currentPattern.id, parseInt(e.target.value, 10) || 90)}
              className="w-14 text-center bg-transparent text-sm font-mono text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-slate-500 pr-1">dtk</span>
            <button
              onClick={() => onDuration(currentPattern.id, duration + 1)}
              className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
              aria-label="Tambah 1 detik"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-1">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => onDuration(currentPattern.id, p)}
                className={`px-2 py-1 rounded-md text-[11px] font-mono transition cursor-pointer ${
                  duration === p ? t.chipOn : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {p}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sensitivity + auto skip */}
      <div className="space-y-3 pt-3 border-t border-white/5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">Sensitivitas ({currentPattern.label})</span>
            <span className={`font-mono font-bold tabular-nums ${t.text}`}>{sensitivity}%</span>
          </div>
          <input
            type="range"
            min={55}
            max={95}
            step={5}
            value={sensitivity}
            onChange={(e) => onSensitivity(currentPattern.id, parseInt(e.target.value, 10))}
            style={{ accentColor: t.accent }}
            className="w-full h-1.5 rounded-lg bg-slate-700 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Toleran</span>
            <span>Ketat</span>
          </div>
        </div>
        <Toggle
          tone={kind}
          checked={autoSkip}
          onChange={onAutoSkip}
          label={`Lewati ${kind === 'intro' ? 'intro' : 'outro'} otomatis`}
          hint={
            kind === 'outro'
              ? 'Melompat ke after-film bila ada, atau ke episode berikutnya.'
              : 'Langsung melompat saat opening terdeteksi.'
          }
        />
      </div>
    </section>
  );
};

export const IntroOutroModal: React.FC<IntroOutroModalProps> = ({
  isOpen,
  onClose,
  currentTrack,
  currentTime,
  duration,
  videoElement,
  config,
  onUpdateConfig,
  onSeek,
  isScanning = false,
  scanProgress = 0,
  scanStatus = '',
  onTriggerScan,
  detectedIntro,
  detectedOutro,
  scanSummary,
}) => {
  const [localConfig, setLocalConfig] = useState<IntroOutroConfig>(config);
  const localRef = useRef(localConfig);
  localRef.current = localConfig;
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [activeIntroId, setActiveIntroId] = useState<string>('intro-1');
  const [activeOutroId, setActiveOutroId] = useState<string>('outro-1');
  const [buildProgress, setBuildProgress] = useState<Record<Kind, number | null>>({ intro: null, outro: null });
  const buildAbort = useRef<Record<Kind, AbortController | null>>({ intro: null, outro: null });
  const [liveMatch, setLiveMatch] = useState<Record<Kind, { score: number; offset: number } | null>>({
    intro: null,
    outro: null,
  });
  const prepared = useRef<Record<Kind, PreparedReference | null>>({ intro: null, outro: null });

  // Synchronize when incoming config or track changes
  useEffect(() => {
    setLocalConfig(config);
    const curIntros = getIntroPatterns(config);
    const curOutros = getOutroPatterns(config);
    if (!curIntros.some((p) => p.id === activeIntroId)) {
      setActiveIntroId(curIntros[0]?.id || 'intro-1');
    }
    if (!curOutros.some((p) => p.id === activeOutroId)) {
      setActiveOutroId(curOutros[0]?.id || 'outro-1');
    }
  }, [config, currentTrack?.id]);

  // Stop any signature build when the modal closes or the track changes
  useEffect(() => {
    return () => {
      buildAbort.current.intro?.abort();
      buildAbort.current.outro?.abort();
    };
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!isOpen) {
      buildAbort.current.intro?.abort();
      buildAbort.current.outro?.abort();
    }
  }, [isOpen]);

  const intros = getIntroPatterns(localConfig);
  const outros = getOutroPatterns(localConfig);
  const selectedIntroPattern = intros.find((p) => p.id === activeIntroId) || intros[0];
  const selectedOutroPattern = outros.find((p) => p.id === activeOutroId) || outros[0];

  // Decode references for the live meter whenever selected pattern changes
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      prepareReference(selectedIntroPattern?.image, selectedIntroPattern?.signature),
      prepareReference(selectedOutroPattern?.image, selectedOutroPattern?.signature),
    ]).then(([intro, outro]) => {
      if (!cancelled) prepared.current = { intro, outro };
    });
    return () => {
      cancelled = true;
    };
  }, [
    selectedIntroPattern?.image,
    selectedIntroPattern?.signature,
    selectedOutroPattern?.image,
    selectedOutroPattern?.signature,
  ]);

  // Live image comparison loop while the modal is open (cheap: 16x9 draw + dot products)
  useEffect(() => {
    if (!isOpen || !videoElement) return;
    const interval = setInterval(() => {
      const next: Record<Kind, { score: number; offset: number } | null> = { intro: null, outro: null };
      (['intro', 'outro'] as Kind[]).forEach((k) => {
        const ref = prepared.current[k];
        next[k] = ref ? matchVideoFrame(videoElement, ref) : null;
      });
      setLiveMatch(next);
    }, 400);
    return () => clearInterval(interval);
  }, [isOpen, videoElement]);

  const commit = useCallback(
    (next: IntroOutroConfig) => {
      setLocalConfig(next);
      saveIntroOutroConfig(next, currentTrack);
      onUpdateConfig(next);
    },
    [currentTrack, onUpdateConfig]
  );

  if (!isOpen) return null;

  const seriesInfo = extractSeriesInfo(currentTrack?.title || '');
  const seriesName = localConfig.seriesTitle || seriesInfo.seriesTitle || 'Serial';
  const trackKey = getTrackKey(currentTrack);

  const handleSave = () => {
    const updated = syncPrimaryPatterns({
      ...localConfig,
      updatedAt: Date.now(),
    });
    saveIntroOutroConfig(updated, currentTrack);
    onUpdateConfig(updated);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2500);

    const hasRef = intros.some((p) => p.image) || outros.some((p) => p.image);
    if (hasRef && onTriggerScan) {
      setTimeout(() => onTriggerScan(), 300);
    }
  };

  const handleReset = () => {
    setLocalConfig(createDefaultConfig(currentTrack, duration));
  };

  /** Captures the reference frame for the selected pattern, marks this episode, then learns whole segment. */
  const handleCapture = (kind: Kind, patternId: string) => {
    if (!videoElement) return;
    const fp = captureFrameFingerprint(videoElement);
    if (!fp) return;

    const start = Math.floor(currentTime);
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const targetPattern = currentList.find((p) => p.id === patternId) || currentList[0];
    const len = targetPattern?.duration || 90;

    const updatedPatterns = currentList.map((p) =>
      p.id === patternId ? { ...p, image: fp, signature: undefined } : p
    );

    const prev = localRef.current;
    const marker = isIntro
      ? { introStart: start, introEnd: start + len, introPatternId: patternId, introMissing: false }
      : { outroStart: start, outroEnd: start + len, outroPatternId: patternId, outroMissing: false };

    const next: IntroOutroConfig = syncPrimaryPatterns({
      ...prev,
      ...(isIntro ? { intros: updatedPatterns } : { outros: updatedPatterns }),
      screenDetection: {
        ...prev.screenDetection,
        enabled: true,
      },
      episodeDetections: {
        ...prev.episodeDetections,
        ...(currentTrack
          ? {
              [trackKey]: {
                ...(prev.episodeDetections?.[trackKey] || {}),
                ...marker,
                duration,
                detectedAt: Date.now(),
              },
            }
          : {}),
      },
    });
    commit(next);

    // Learn the full segment (one thumbnail per second) so later scans need only a few probes.
    if (currentTrack?.url) {
      buildAbort.current[kind]?.abort();
      const ctrl = new AbortController();
      buildAbort.current[kind] = ctrl;
      setBuildProgress((p) => ({ ...p, [kind]: 0 }));
      buildFrameSignature(currentTrack.url, start, len, {
        signal: ctrl.signal,
        onProgress: (pct) => !ctrl.signal.aborted && setBuildProgress((p) => ({ ...p, [kind]: pct })),
      })
        .then((sig) => {
          if (ctrl.signal.aborted) return;
          if (sig) {
            const curPats = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
            const withSig = curPats.map((p) => (p.id === patternId ? { ...p, signature: sig } : p));
            commit(
              syncPrimaryPatterns({
                ...localRef.current,
                ...(isIntro ? { intros: withSig } : { outros: withSig }),
              })
            );
          }
        })
        .finally(() => {
          if (buildAbort.current[kind] === ctrl) {
            buildAbort.current[kind] = null;
            setBuildProgress((p) => ({ ...p, [kind]: null }));
          }
        });
    }
  };

  const handleUpload = async (kind: Kind, patternId: string, file: File) => {
    const fp = await fingerprintFromFile(file);
    if (!fp) return;
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const updated = currentList.map((p) => (p.id === patternId ? { ...p, image: fp, signature: undefined } : p));
    commit(
      syncPrimaryPatterns({
        ...localRef.current,
        ...(isIntro ? { intros: updated } : { outros: updated }),
        screenDetection: {
          ...localRef.current.screenDetection,
          enabled: true,
        },
      })
    );
  };

  const handleClear = (kind: Kind, patternId: string) => {
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const updated = currentList.map((p) => (p.id === patternId ? { ...p, image: undefined, signature: undefined } : p));
    commit(
      syncPrimaryPatterns({
        ...localRef.current,
        ...(isIntro ? { intros: updated } : { outros: updated }),
      })
    );
  };

  const handleDuration = (kind: Kind, patternId: string, value: number) => {
    const dur = Math.max(10, Math.min(300, Math.round(value)));
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const updated = currentList.map((p) => (p.id === patternId ? { ...p, duration: dur } : p));

    const prev = localRef.current;
    const detected = isIntro ? detectedIntro : detectedOutro;
    const cached = prev.episodeDetections?.[trackKey];
    const startNow = detected?.start ?? (isIntro ? cached?.introStart : cached?.outroStart);

    const episodeDetections = { ...prev.episodeDetections };
    if (startNow !== undefined && currentTrack) {
      episodeDetections[trackKey] = {
        ...(episodeDetections[trackKey] || {}),
        ...(isIntro
          ? { introStart: startNow, introEnd: startNow + dur, introPatternId: patternId }
          : { outroStart: startNow, outroEnd: startNow + dur, outroPatternId: patternId }),
      };
    }
    commit(
      syncPrimaryPatterns({
        ...prev,
        ...(isIntro ? { intros: updated } : { outros: updated }),
        episodeDetections,
      })
    );
  };

  const handleSensitivity = (kind: Kind, patternId: string, value: number) => {
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const updated = currentList.map((p) => (p.id === patternId ? { ...p, sensitivity: value } : p));
    commit(
      syncPrimaryPatterns({
        ...localRef.current,
        ...(isIntro ? { intros: updated } : { outros: updated }),
      })
    );
  };

  const handleAddPattern = (kind: Kind) => {
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const nextNum = currentList.length + 1;
    const newId = `${kind}-${Date.now()}`;
    const newPattern: IntroOutroPattern = {
      id: newId,
      label: `${isIntro ? 'Intro' : 'Outro'} ${nextNum} (${isIntro ? 'OP' : 'ED'} ${nextNum})`,
      kind,
      duration: 90,
      sensitivity: 75,
    };
    const updated = [...currentList, newPattern];
    commit(
      syncPrimaryPatterns({
        ...localRef.current,
        ...(isIntro ? { intros: updated } : { outros: updated }),
      })
    );
    if (isIntro) setActiveIntroId(newId);
    else setActiveOutroId(newId);
  };

  const handleDeletePattern = (kind: Kind, patternId: string) => {
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    if (currentList.length <= 1) return;
    const updated = currentList.filter((p) => p.id !== patternId);
    commit(
      syncPrimaryPatterns({
        ...localRef.current,
        ...(isIntro ? { intros: updated } : { outros: updated }),
      })
    );
    if (isIntro) setActiveIntroId(updated[0]?.id || 'intro-1');
    else setActiveOutroId(updated[0]?.id || 'outro-1');
  };

  const handleRenamePattern = (kind: Kind, patternId: string, label: string) => {
    const isIntro = kind === 'intro';
    const currentList = isIntro ? getIntroPatterns(localRef.current) : getOutroPatterns(localRef.current);
    const updated = currentList.map((p) => (p.id === patternId ? { ...p, label } : p));
    commit(
      syncPrimaryPatterns({
        ...localRef.current,
        ...(isIntro ? { intros: updated } : { outros: updated }),
      })
    );
  };

  const hasReference = intros.some((p) => p.image || p.signature) || outros.some((p) => p.image || p.signature);
  const summaryText = (() => {
    if (!scanSummary) return null;
    const secs = (scanSummary.elapsedMs / 1000).toFixed(1);
    return `Selesai dalam ${secs} dtk • ${scanSummary.probes} titik diperiksa`;
  })();

  const statusRow = (kind: Kind, marker?: { start: number; end: number } | null, missing?: boolean) => {
    const t = THEME[kind];
    const cached = localConfig.episodeDetections?.[trackKey];
    const patternId = kind === 'intro' ? cached?.introPatternId : cached?.outroPatternId;
    const currentList = kind === 'intro' ? intros : outros;
    const matchedPattern = currentList.find((p) => p.id === patternId);

    return (
      <div className={`flex items-center justify-between gap-2 rounded-xl border ${t.border} ${t.soft} px-3 py-2`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-semibold ${t.text}`}>{t.label}</span>
            {matchedPattern && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-200 font-medium">
                {matchedPattern.label}
              </span>
            )}
          </div>
          {marker ? (
            <div className="text-sm font-mono font-semibold text-white tabular-nums">
              {formatTime(marker.start)} → {formatTime(marker.end)}
              <span className="ml-1.5 text-[11px] font-normal text-slate-400">(+{Math.round(marker.end - marker.start)}s)</span>
            </div>
          ) : missing ? (
            <div className="text-xs text-slate-400">Tidak ada di episode ini</div>
          ) : (
            <div className="text-xs text-slate-500">Belum terdeteksi</div>
          )}
        </div>
        {marker && (
          <button
            onClick={() => onSeek(marker.start)}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 transition cursor-pointer"
            title="Lompat ke awal"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-[#0e1320] border border-white/10 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <header className="px-5 py-4 border-b border-white/5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/25 to-cyan-500/20 border border-white/10 text-violet-200">
              <FastForward className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white">Skip Intro & Outro</h2>
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Tv className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{seriesName}</span>
                  {localConfig.isSeriesTemplate && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/15 text-violet-300 border border-violet-500/25 whitespace-nowrap">
                      Template serial
                    </span>
                  )}
                </div>
                {localConfig.folderPath && (
                  <div
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 max-w-xs truncate"
                    title={`Data disimpan lokal di: ${localConfig.folderPath}/zmt.config.json`}
                  >
                    <Folder className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">Tersimpan di folder lokal</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Scan result */}
          <section className="rounded-2xl bg-slate-900/60 border border-white/10 p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-300" />
                <h3 className="text-sm font-semibold text-white">Hasil pindai episode ini</h3>
              </div>
              {onTriggerScan && (
                <button
                  onClick={onTriggerScan}
                  disabled={isScanning || !hasReference}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-100 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="tabular-nums">Memindai {scanProgress}%</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Pindai ulang</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {duration > 0 && (
              <div className="space-y-1.5">
                <Timeline
                  duration={duration}
                  currentTime={currentTime}
                  intro={detectedIntro}
                  outro={detectedOutro}
                  onSeek={onSeek}
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 tabular-nums">
                  <span>0:00</span>
                  <span>
                    <span className="text-slate-300">{formatTime(currentTime)}</span> / {formatTime(duration)}
                  </span>
                </div>
              </div>
            )}

            {isScanning && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-cyan-200">
                  <span className="truncate">{scanStatus || 'Memindai...'}</span>
                  <span className="font-mono tabular-nums">{scanProgress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-all duration-200"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {statusRow('intro', detectedIntro, scanSummary?.introMissing)}
              {statusRow('outro', detectedOutro, scanSummary?.outroMissing)}
            </div>

            {!isScanning && summaryText && <p className="text-[11px] text-slate-500">{summaryText}</p>}
            {!hasReference && (
              <p className="flex gap-2 text-[11px] text-slate-400">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Jeda video tepat di awal opening/ending lalu tekan <strong className="text-slate-200">Tangkap</strong>. Setelah itu
                  episode lain dalam serial yang sama dideteksi otomatis.
                </span>
              </p>
            )}
          </section>

          {/* Intro / Outro setup */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MarkerCard
              kind="intro"
              config={localConfig}
              currentTime={currentTime}
              hasVideo={!!videoElement}
              signatureProgress={buildProgress.intro}
              liveMatch={liveMatch.intro}
              activePatternId={activeIntroId}
              onSelectPattern={setActiveIntroId}
              onAddPattern={() => handleAddPattern('intro')}
              onDeletePattern={(pid) => handleDeletePattern('intro', pid)}
              onRenamePattern={(pid, lbl) => handleRenamePattern('intro', pid, lbl)}
              onCapture={(pid) => handleCapture('intro', pid)}
              onUpload={(pid, f) => handleUpload('intro', pid, f)}
              onClear={(pid) => handleClear('intro', pid)}
              onDuration={(pid, d) => handleDuration('intro', pid, d)}
              onAutoSkip={(v) =>
                setLocalConfig((p) => syncPrimaryPatterns({ ...p, autoSkipIntro: v }))
              }
              onSensitivity={(pid, v) => handleSensitivity('intro', pid, v)}
            />
            <MarkerCard
              kind="outro"
              config={localConfig}
              currentTime={currentTime}
              hasVideo={!!videoElement}
              signatureProgress={buildProgress.outro}
              liveMatch={liveMatch.outro}
              activePatternId={activeOutroId}
              onSelectPattern={setActiveOutroId}
              onAddPattern={() => handleAddPattern('outro')}
              onDeletePattern={(pid) => handleDeletePattern('outro', pid)}
              onRenamePattern={(pid, lbl) => handleRenamePattern('outro', pid, lbl)}
              onCapture={(pid) => handleCapture('outro', pid)}
              onUpload={(pid, f) => handleUpload('outro', pid, f)}
              onClear={(pid) => handleClear('outro', pid)}
              onDuration={(pid, d) => handleDuration('outro', pid, d)}
              onAutoSkip={(v) =>
                setLocalConfig((p) => syncPrimaryPatterns({ ...p, autoSkipOutro: v }))
              }
              onSensitivity={(pid, v) => handleSensitivity('outro', pid, v)}
            />
          </div>

          {/* How it works */}
          <details className="group rounded-xl bg-slate-900/40 border border-white/5">
            <summary className="flex items-center justify-between gap-2 px-4 py-3 text-xs font-medium text-slate-300 cursor-pointer list-none">
              <span className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                Cara kerja pemindaian cepat
              </span>
              <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="px-4 pb-4 space-y-1.5 text-[11px] leading-relaxed text-slate-400 list-disc list-inside">
              <li>Sistem mempelajari pola seluruh opening/ending (satu thumbnail per detik), sehingga satu frame di mana pun di dalamnya sudah cukup untuk mengenali dan menghitung titik awalnya.</li>
              <li>Pemeriksaan berurutan sesuai prioritas: posisi di episode sebelumnya, lalu titik umum, lalu grid jarang, dan terakhir area langka (intro/outro di tengah). Berhenti begitu terverifikasi.</li>
              <li>Outro dicari dari akhir episode dan tidak boleh bertabrakan dengan intro. Episode tanpa intro tetap bisa punya outro (dan sebaliknya); hasilnya disimpan sehingga tidak dipindai ulang.</li>
              <li>Setiap kandidat diverifikasi di 2–3 titik lain agar adegan dialog yang mirip tidak salah terdeteksi.</li>
            </ul>
          </details>
        </div>

        {/* Footer */}
        <footer className="px-5 py-3.5 border-t border-white/5 bg-slate-950/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="sm:max-w-xs w-full">
            <Toggle
              tone="cyan"
              checked={localConfig.applyToSeries}
              onChange={(v) => setLocalConfig((p) => ({ ...p, applyToSeries: v }))}
              label="Terapkan ke seluruh serial"
              hint={seriesName}
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-violet-950/50 active:scale-95 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Simpan</span>
            </button>
          </div>
        </footer>

        {showSavedToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 px-4 py-2 rounded-xl font-semibold text-xs shadow-2xl flex items-center gap-2 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4" />
            <span>Tersimpan untuk {seriesName}</span>
          </div>
        )}
      </div>
    </div>
  );
};
