import React, { useRef, useState, useEffect } from 'react';
import {
  Film,
  FolderOpen,
  ListMusic,
  HelpCircle,
  Sparkles,
  Zap,
  Minus,
  Square,
  Copy,
  X,
  Settings
} from 'lucide-react';
import { MediaItem } from '../types';

interface HeaderProps {
  currentTrack?: MediaItem;
  currentIndex?: number;
  playlistCount: number;
  onOpenPlaylist: () => void;
  onOpenShortcuts: () => void;
  onOpenStudioSettings?: (tab?: 'audio' | 'video' | 'playback' | 'subtitles' | 'stats') => void;
  onAddFiles: (files: FileList) => void;
  onAddMediaItems?: (items: MediaItem[]) => void;
  onLoadFolderMedia?: (payload: import('../electron').FolderScanResult) => void;
  onLoadSamples: () => void;
  isBoosted: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTrack,
  currentIndex = 0,
  playlistCount,
  onOpenPlaylist,
  onOpenShortcuts,
  onOpenStudioSettings,
  onAddFiles,
  onAddMediaItems,
  onLoadFolderMedia,
  onLoadSamples,
  isBoosted,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
      const unsubscribe = window.electronAPI.onMaximizedChange((max) => {
        setIsMaximized(max);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, []);

  const handleOpenMedia = async () => {
    if (isElectron && window.electronAPI) {
      try {
        const result = await window.electronAPI.openMediaDialog();
        if (result && onLoadFolderMedia) {
          onLoadFolderMedia(result);
          return;
        }
      } catch (err) {
        console.error('Failed to open native media dialog:', err);
      }
    }
    // Fallback to web input
    fileInputRef.current?.click();
  };

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header
      className="w-full bg-[#0a0d14]/95 backdrop-blur-md border-b border-cyan-950/60 px-3 sm:px-5 py-2 flex items-center justify-between z-20 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget && isElectron) {
          handleMaximize();
        }
      }}
    >
      {/* Brand & Current Playing Title */}
      <div className="flex items-center gap-3 min-w-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 via-cyan-400 to-blue-500 flex items-center justify-center shadow-md shadow-cyan-500/20 text-black flex-shrink-0">
          <Film className="w-4 h-4 fill-black" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5 whitespace-nowrap">
              <span>Zmt</span>
              <span className="text-cyan-400">Media Player</span>
            </h1>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
              {isElectron ? 'Windows App' : 'HD Player'}
            </span>
            {isBoosted && (
              <span className="hidden md:inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Zap className="w-2.5 h-2.5 fill-amber-300" />
                DSP BOOST
              </span>
            )}
          </div>
          {currentTrack && (
            <p className="text-[11px] text-slate-400 truncate max-w-[160px] sm:max-w-xs md:max-w-md flex items-center gap-1.5">
              <span className="text-cyan-400 font-bold font-mono px-1 py-0.2 rounded bg-cyan-950/80 border border-cyan-800/40 text-[10px] flex-shrink-0">
                #{currentIndex + 1}/{playlistCount}
              </span>
              <span className="truncate">{currentTrack.title}</span>
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons & Desktop Window Controls */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Load Samples button */}
        <button
          onClick={onLoadSamples}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
          title="Load built-in HD video samples"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Demo Clips</span>
        </button>

        {/* Open Local Video File */}
        <button
          onClick={handleOpenMedia}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold shadow-md shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
          title={isElectron ? 'Open media file from PC (Native Dialog)' : 'Open media file'}
        >
          <FolderOpen className="w-3.5 h-3.5 fill-black" />
          <span className="hidden sm:inline">Open Video</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,.mkv,.mp4,.webm,.avi,.mov"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
            }
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        />

        {/* Studio Master Settings Button */}
        {onOpenStudioSettings && (
          <button
            onClick={() => onOpenStudioSettings('audio')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:text-white text-xs font-medium transition cursor-pointer"
            title="Studio Settings & Equalizer (B / V / S)"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Studio Settings</span>
          </button>
        )}

        {/* Playlist Drawer Toggle */}
        <button
          onClick={onOpenPlaylist}
          className="relative p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
          title="Open Playlist Queue"
        >
          <ListMusic className="w-4 h-4" />
          {playlistCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-black text-[9px] font-bold flex items-center justify-center">
              {playlistCount}
            </span>
          )}
        </button>

        {/* Shortcuts Help */}
        <button
          onClick={onOpenShortcuts}
          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-400 transition cursor-pointer"
          title="Keyboard Shortcuts (?)"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Native Windows Window Controls */}
        {isElectron && (
          <div className="flex items-center ml-2 pl-2 border-l border-slate-800 space-x-1">
            <button
              onClick={handleMinimize}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/20 transition cursor-pointer"
              title="Minimize"
              aria-label="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/20 transition cursor-pointer"
              title={isMaximized ? 'Restore' : 'Maximize'}
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Copy className="w-3 h-3 rotate-180" />
              ) : (
                <Square className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 active:bg-red-700 transition cursor-pointer"
              title="Close"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
