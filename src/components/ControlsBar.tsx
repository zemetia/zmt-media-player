import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  Sliders,
  SlidersHorizontal,
  PictureInPicture,
  Zap,
  Repeat,
  Settings,
  Activity,
  ChevronLeft,
  ChevronRight,
  FastForward
} from 'lucide-react';
import { formatTime } from '../utils/subtitleParser';
import { ABLoopState, IntroOutroConfig, MediaItem } from '../types';
import { getTrackKey, hasIntroOutroSetup } from '../utils/introOutroStorage';

interface ControlsBarProps {
  currentTrack?: MediaItem;
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  onSeek: (seconds: number) => void;
  volume: number;
  boost: number;
  muted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  onOpenSubtitles: () => void;
  onOpenEqualizer: () => void;
  onOpenVideoSettings: () => void;
  onOpenStudioSettings?: (tab?: 'audio' | 'video' | 'playback' | 'subtitles' | 'stats') => void;
  onOpenIntroOutro?: () => void;
  introOutroConfig?: IntroOutroConfig;
  detectedIntro?: { start: number; end: number } | null;
  detectedOutro?: { start: number; end: number } | null;
  abLoop?: ABLoopState;
  onStepFrame?: (direction: 1 | -1) => void;
  activeSubtitleLabel?: string;
  playbackRate: number;
  eqPreset: string;
  resolution?: string;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  hasPrevTrack: boolean;
  hasNextTrack: boolean;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  currentTrack,
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  bufferedEnd,
  onSeek,
  volume,
  boost,
  muted,
  onVolumeChange,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  onTogglePiP,
  onOpenSubtitles,
  onOpenEqualizer,
  onOpenVideoSettings,
  onOpenStudioSettings,
  onOpenIntroOutro,
  introOutroConfig,
  detectedIntro,
  detectedOutro,
  abLoop,
  onStepFrame,
  activeSubtitleLabel,
  playbackRate,
  eqPreset,
  resolution,
  onNextTrack,
  onPrevTrack,
  hasPrevTrack,
  hasNextTrack,
}) => {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const calculatePosTime = useCallback((clientX: number) => {
    if (!progressBarRef.current || duration <= 0) return { pos: 0, time: 0 };
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { pos: pos * 100, time: pos * duration };
  }, [duration]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { pos, time } = calculatePosTime(e.clientX);
    setHoverPosition(pos);
    setHoverTime(time);
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setHoverTime(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const { pos, time } = calculatePosTime(e.clientX);
    setHoverPosition(pos);
    setHoverTime(time);
    onSeek(time);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onGlobalMouseMove = (e: MouseEvent) => {
      const { pos, time } = calculatePosTime(e.clientX);
      setHoverPosition(pos);
      setHoverTime(time);
      onSeek(time);
    };

    const onGlobalMouseUp = () => {
      setIsDragging(false);
      setHoverTime(null);
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  }, [isDragging, calculatePosTime, onSeek]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  // Dynamic Intro & Outro Timeline Highlights (supports image-detected, cached, anchor, and fallback)
  const trackKey = currentTrack ? getTrackKey(currentTrack) : undefined;
  const cachedEpisode = trackKey ? introOutroConfig?.episodeDetections?.[trackKey] : undefined;

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

  const hasIntroMarker = !!(
    introOutroConfig?.enabled &&
    duration > 0 &&
    effIntroStart !== null &&
    effIntroEnd !== null &&
    effIntroEnd > effIntroStart
  );
  const introLeft = hasIntroMarker ? (effIntroStart! / duration) * 100 : 0;
  const introWidth = hasIntroMarker
    ? ((effIntroEnd! - effIntroStart!) / duration) * 100
    : 0;

  const hasOutroMarker = !!(
    introOutroConfig?.enabled &&
    duration > 0 &&
    effOutroStart !== null &&
    effOutroEnd !== null &&
    effOutroEnd > effOutroStart
  );
  const outroLeft = hasOutroMarker ? (effOutroStart! / duration) * 100 : 0;
  const outroWidth = hasOutroMarker
    ? ((Math.min(duration, effOutroEnd!) - effOutroStart!) / duration) * 100
    : 0;

  const isHoverInIntro =
    hoverTime !== null &&
    hasIntroMarker &&
    hoverTime >= effIntroStart! &&
    hoverTime <= effIntroEnd!;

  const isHoverInOutro =
    hoverTime !== null &&
    hasOutroMarker &&
    hoverTime >= effOutroStart! &&
    hoverTime <= effOutroEnd!;

  const isHoverInAfterFilm =
    hoverTime !== null &&
    hasOutroMarker &&
    effOutroEnd! < duration - 10 &&
    hoverTime > effOutroEnd!;

  // A-B loop percentage calculations
  const loopStartPct = duration > 0 && abLoop?.start !== null && abLoop?.start !== undefined ? (abLoop.start / duration) * 100 : null;
  const loopEndPct = duration > 0 && abLoop?.end !== null && abLoop?.end !== undefined ? (abLoop.end / duration) * 100 : null;

  return (
    <div className="w-full bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 sm:px-6 pt-8 pb-4 text-white select-none transition-opacity duration-300">
      
      {/* Timeline Scrubber Bar with smooth dragging & A-B markers */}
      <div
        ref={progressBarRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-4 group cursor-pointer flex items-center mb-3"
      >
        {/* Background Track */}
        <div className="absolute inset-x-0 h-1.5 group-hover:h-2.5 bg-slate-700/60 rounded-full overflow-hidden transition-all duration-150">
          {/* Buffered Progress */}
          <div
            className="h-full bg-slate-500/40 rounded-full"
            style={{ width: `${bufferedPercent}%` }}
          />
        </div>

        {/* PROMINENT INTRO BLOCK ON TIMELINE */}
        {hasIntroMarker && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-2.5 group-hover:h-3.5 rounded-sm z-15 pointer-events-none transition-all duration-150 flex items-center justify-center overflow-visible ${
              currentTime >= effIntroStart! && currentTime < effIntroEnd!
                ? 'bg-purple-500/90 border-x-2 border-purple-200 shadow-lg shadow-purple-500/80 animate-pulse'
                : 'bg-purple-600/70 border-x-2 border-purple-400 shadow-md shadow-purple-500/40'
            }`}
            style={{ left: `${introLeft}%`, width: `${introWidth}%` }}
          >
            {/* Chapter Notch Flag */}
            <div className="absolute -top-3.5 left-0 px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-600 text-white shadow border border-purple-300 opacity-90 group-hover:opacity-100 flex items-center gap-0.5 whitespace-nowrap">
              <span>⚡ OP</span>
              <span className="hidden sm:inline">+{introOutroConfig?.introDuration || 90}s</span>
            </div>
          </div>
        )}

        {/* PROMINENT OUTRO BLOCK ON TIMELINE */}
        {hasOutroMarker && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-2.5 group-hover:h-3.5 rounded-sm z-15 pointer-events-none transition-all duration-150 flex items-center justify-center overflow-visible ${
              currentTime >= effOutroStart! && currentTime < effOutroEnd!
                ? 'bg-rose-500/90 border-x-2 border-rose-200 shadow-lg shadow-rose-500/80 animate-pulse'
                : 'bg-rose-600/70 border-x-2 border-rose-400 shadow-md shadow-rose-500/40'
            }`}
            style={{ left: `${outroLeft}%`, width: `${outroWidth}%` }}
          >
            {/* Chapter Notch Flag */}
            <div className="absolute -top-3.5 left-0 px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-600 text-white shadow border border-rose-300 opacity-90 group-hover:opacity-100 flex items-center gap-0.5 whitespace-nowrap">
              <span>⚡ ED</span>
              <span className="hidden sm:inline">+{introOutroConfig?.outroDuration || 90}s</span>
            </div>
          </div>
        )}

        {/* AFTER-FILM BLOCK ON TIMELINE */}
        {hasOutroMarker && effOutroEnd! < duration - 10 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-2 group-hover:h-2.5 rounded-r-full bg-emerald-500/35 border-l-2 border-emerald-400 z-12 pointer-events-none"
            style={{
              left: `${(effOutroEnd! / duration) * 100}%`,
              width: `${((duration - effOutroEnd!) / duration) * 100}%`,
            }}
          >
            <div className="absolute -top-3.5 right-0 px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-700/90 text-emerald-200 border border-emerald-400/60 opacity-80 group-hover:opacity-100 whitespace-nowrap">
              🎬 After-Film
            </div>
          </div>
        )}

        {/* A-B Loop Highlight Range on Timeline */}
        {loopStartPct !== null && loopEndPct !== null && (
          <div
            className="absolute h-1.5 group-hover:h-2.5 bg-amber-400/40 border-l border-r border-amber-300 z-10 pointer-events-none"
            style={{
              left: `${loopStartPct}%`,
              width: `${Math.max(0, loopEndPct - loopStartPct)}%`,
            }}
          />
        )}

        {/* Played Progress Bar */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 group-hover:h-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-75 pointer-events-none z-10"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Scrubber Playhead Handle */}
        <div
          className="absolute w-3.5 h-3.5 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/50 scale-0 group-hover:scale-100 transition-transform duration-150 -ml-1.5 pointer-events-none z-20 top-1/2 -translate-y-1/2"
          style={{ left: `${progressPercent}%` }}
        />

        {/* A-B Loop Visual Marker Flags */}
        {loopStartPct !== null && (
          <div
            className="absolute top-[-10px] w-2 h-2 bg-amber-400 rounded-full shadow z-20 pointer-events-none -ml-1"
            style={{ left: `${loopStartPct}%` }}
            title="Loop Point A"
          />
        )}
        {loopEndPct !== null && (
          <div
            className="absolute top-[-10px] w-2 h-2 bg-amber-400 rounded-full shadow z-20 pointer-events-none -ml-1"
            style={{ left: `${loopEndPct}%` }}
            title="Loop Point B"
          />
        )}

        {/* Time Hover Preview Tooltip */}
        {hoverTime !== null && (
          <div
            className={`absolute -top-8 px-2 py-1 text-xs font-mono font-medium rounded-md shadow-lg pointer-events-none -translate-x-1/2 whitespace-nowrap z-30 flex items-center gap-1.5 ${
              isHoverInIntro
                ? 'bg-purple-950/95 border border-purple-500/60 text-purple-300'
                : isHoverInOutro
                ? 'bg-rose-950/95 border border-rose-500/60 text-rose-300'
                : 'bg-black/90 text-cyan-300 border border-cyan-500/30'
            }`}
            style={{ left: `${hoverPosition}%` }}
          >
            <span>{formatTime(hoverTime)}</span>
            {isHoverInIntro && <span className="font-bold text-[10px] text-purple-200">[Intro OP • Lewati +{introOutroConfig?.introDuration || 90}s ➔ {formatTime(effIntroEnd!)}]</span>}
            {isHoverInOutro && <span className="font-bold text-[10px] text-rose-200">[Outro ED • Lewati +{introOutroConfig?.outroDuration || 90}s ➔ {formatTime(effOutroEnd!)}]</span>}
            {isHoverInAfterFilm && <span className="font-bold text-[10px] text-emerald-300">[After-Film / Post-Credits 🎬]</span>}
          </div>
        )}
      </div>

      {/* Primary Bottom Controls Row */}
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left Side: Playback & Volume */}
        <div className="flex items-center gap-1 sm:gap-2">
          
          {/* Previous Track */}
          <button
            onClick={onPrevTrack}
            disabled={!hasPrevTrack}
            className={`p-2 rounded-xl transition ${
              hasPrevTrack
                ? 'text-slate-300 hover:text-white hover:bg-white/10 active:scale-95'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Previous Video (Shift+P)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Jump -10s */}
          <button
            onClick={() => onSeek(currentTime - 10)}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition active:scale-95 hidden sm:block"
            title="Rewind 10s (Left Arrow)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Play / Pause Main Button */}
          <button
            onClick={onPlayPause}
            className="p-2.5 sm:p-3 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl font-bold transition shadow-lg shadow-cyan-500/30 active:scale-95"
            title={isPlaying ? 'Pause (Space / K)' : 'Play (Space / K)'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-black" />
            ) : (
              <Play className="w-5 h-5 fill-black ml-0.5" />
            )}
          </button>

          {/* Jump +10s */}
          <button
            onClick={() => onSeek(currentTime + 10)}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition active:scale-95 hidden sm:block"
            title="Fast Forward 10s (Right Arrow)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Next Track */}
          <button
            onClick={onNextTrack}
            disabled={!hasNextTrack}
            className={`p-2 rounded-xl transition ${
              hasNextTrack
                ? 'text-slate-300 hover:text-white hover:bg-white/10 active:scale-95'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Next Video (N)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Frame Stepping buttons (Hidden on tiny screens) */}
          {onStepFrame && (
            <div className="hidden lg:flex items-center gap-0.5 ml-1 border-l border-slate-700/60 pl-2">
              <button
                onClick={() => onStepFrame(-1)}
                className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-white/10 rounded-lg transition"
                title="Step -1 Frame (Comma ,)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onStepFrame(1)}
                className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-white/10 rounded-lg transition"
                title="Step +1 Frame (Period .)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Volume Control Deck with Expandable Slider */}
          <div
            className="relative flex items-center ml-1 sm:ml-2"
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
          >
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-xl transition ${
                muted || volume === 0
                  ? 'text-rose-400 hover:bg-rose-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title={muted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            {/* Slider container with smooth expand on hover */}
            <div
              className={`flex items-center overflow-hidden transition-all duration-200 ${
                isVolumeHovered ? 'w-20 sm:w-24 opacity-100 ml-1' : 'w-0 opacity-0'
              }`}
            >
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* Boost percentage indicator */}
            {boost > 1.0 && (
              <span
                onClick={() => onOpenStudioSettings ? onOpenStudioSettings('audio') : onOpenEqualizer()}
                className="ml-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition"
                title="Amplified via DSP Audio Boost"
              >
                <Zap className="w-2.5 h-2.5 inline mr-0.5" />
                {Math.round(boost * 100)}%
              </span>
            )}
          </div>

          {/* Current / Duration Time Display */}
          <div className="text-xs font-mono text-slate-300 ml-2 select-none whitespace-nowrap">
            <span className="text-white font-medium">{formatTime(currentTime)}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-400">{formatTime(duration)}</span>
          </div>

        </div>

        {/* Right Side: Quick Tools, Subtitles, Studio Settings, Fullscreen */}
        <div className="flex items-center gap-1 sm:gap-1.5">

          {/* A-B Loop indicator button */}
          {abLoop?.enabled && (
            <button
              onClick={() => onOpenStudioSettings ? onOpenStudioSettings('playback') : onOpenVideoSettings()}
              className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 animate-pulse"
              title="A-B Loop Active (Click to configure)"
            >
              <Repeat className="w-3 h-3" />
              <span>A-B</span>
            </button>
          )}

          {/* Video Picture Filters Button */}
          <button
            onClick={() => onOpenStudioSettings ? onOpenStudioSettings('video') : onOpenVideoSettings()}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition relative"
            title="Video Picture & Color Grading (V)"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Audio Equalizer Button */}
          <button
            onClick={() => onOpenStudioSettings ? onOpenStudioSettings('audio') : onOpenEqualizer()}
            className={`p-2 rounded-xl transition relative ${
              boost > 1.0 || eqPreset !== 'Flat'
                ? 'text-cyan-300 bg-cyan-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={`Audio DSP & Equalizer (${eqPreset}) (B)`}
          >
            <Sliders className="w-4 h-4" />
            {boost > 1.0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          {/* Subtitles Button */}
          <button
            onClick={() => onOpenStudioSettings ? onOpenStudioSettings('subtitles') : onOpenSubtitles()}
            className={`p-2 rounded-xl transition relative ${
              activeSubtitleLabel
                ? 'text-cyan-400 bg-cyan-500/15'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={activeSubtitleLabel ? `Subtitles Active: ${activeSubtitleLabel} (S)` : 'Subtitles (S)'}
          >
            <Subtitles className="w-4 h-4" />
            {activeSubtitleLabel && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400" />
            )}
          </button>

          {/* Skip Intro & Outro Setup Button */}
          {onOpenIntroOutro && (
            <button
              onClick={onOpenIntroOutro}
              className={`p-2 rounded-xl transition relative ${
                hasIntroOutroSetup(introOutroConfig)
                  ? 'text-purple-300 bg-purple-500/20 border border-purple-500/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Skip Intro & Outro Manager (I)"
            >
              <FastForward className="w-4 h-4" />
              {hasIntroOutroSetup(introOutroConfig) && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              )}
            </button>
          )}

          {/* Picture in Picture */}
          <button
            onClick={onTogglePiP}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition hidden sm:block"
            title="Picture in Picture (P)"
          >
            <PictureInPicture className="w-4 h-4" />
          </button>

          {/* Master Studio Settings Button */}
          {onOpenStudioSettings && (
            <button
              onClick={() => onOpenStudioSettings('audio')}
              className="p-2 text-cyan-400 hover:text-white hover:bg-cyan-500/20 rounded-xl transition border border-cyan-500/30"
              title="Studio Master Settings & Controls"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={onToggleFullscreen}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen (F / F11)' : 'Fullscreen (F / F11)'}
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>

        </div>

      </div>

    </div>
  );
};
