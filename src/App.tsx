import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MediaItem,
  SubtitleTrack,
  SubtitleStyle,
  AudioSettings,
  VideoSettings,
  ABLoopState,
  GeneralPreferences,
  IntroOutroConfig
} from './types';
import { SAMPLE_PLAYLIST } from './data/sampleMedia';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { SubtitleModal } from './components/SubtitleModal';
import { StudioSettingsModal, SettingsTabId } from './components/StudioSettingsModal';
import { PlaylistDrawer } from './components/PlaylistDrawer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { IntroOutroModal } from './components/IntroOutroModal';
import { getIntroOutroConfigForTrack, hasIntroOutroSetup, registerFolderConfig } from './utils/introOutroStorage';
import { parseSubtitleFile, formatTime } from './utils/subtitleParser';
import {
  Sliders,
  Subtitles,
  SlidersHorizontal,
  FolderOpen,
  Sparkles,
  Zap,
  Volume2,
  Tv,
  Film,
  CheckCircle2,
  Settings,
  Repeat,
  FastForward
} from 'lucide-react';

export const App: React.FC = () => {
  // Playlist & Track State
  const [playlist, setPlaylist] = useState<MediaItem[]>(SAMPLE_PLAYLIST);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  // Subtitle State
  const [activeSubtitleTrackId, setActiveSubtitleTrackId] = useState<string | null>(
    SAMPLE_PLAYLIST[0]?.subtitles?.[0]?.id || null // Defaults to first Indonesian subtitle track
  );
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>({
    fontSize: 24,
    fontFamily: 'sans',
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.65,
    position: 'bottom',
    offsetY: 20, // default comfortable bottom padding (px)
    textShadow: true,
    textOutline: 'medium',
    offsetSeconds: 0,
  });

  // Audio & DSP Studio State
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    volume: 0.85,
    boost: 1.0,
    muted: false,
    balance: 0,
    audioDelay: 0,
    eqPreset: 'Flat',
    eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bassGain: 0,
    trebleGain: 0,
    vocalClarity: false,
    drcMode: 'off',
    spatialAudio: 'off',
    monoDownmix: false,
    preservesPitch: true,
    visualizerMode: 'bars',
  });

  // Video Picture & Geometry State
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    gamma: 1.0,
    sharpness: 'off',
    grayscale: 0,
    sepia: 0,
    invert: false,
    picturePreset: 'normal',
    playbackRate: 1.0,
    aspectRatio: 'fit',
    loop: false,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    zoom: 100,
    panX: 0,
    panY: 0,
    deinterlace: false,
    renderingQuality: 'smooth',
  });

  // A-B Segment Repeat State
  const [abLoop, setAbLoop] = useState<ABLoopState>({
    enabled: false,
    start: null,
    end: null,
  });

  // System & Behavior Preferences
  const [preferences, setPreferences] = useState<GeneralPreferences>(() => {
    try {
      const saved = localStorage.getItem('zmt_player_prefs');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {
      autoPlayNext: true,
      autoResume: true,
      autoHideDelay: 2500,
      showStatsForNerds: false,
    };
  });

  // Sync preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('zmt_player_prefs', JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  // Real-time playback synchronization for modals
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerActionsRef = useRef<{
    seek: (time: number) => void;
    captureSnapshot: (options?: { format: 'png' | 'jpeg'; includeSubtitles: boolean; copyToClipboard?: boolean }) => void;
    stepFrame: (direction: 1 | -1) => void;
    getVideoElement?: () => HTMLVideoElement | null;
    triggerScan?: () => void;
  } | null>(null);

  // Background intro/outro scan state
  const [introScanState, setIntroScanState] = useState<{
    isScanning: boolean;
    scanProgress: number;
    scanStatus: string;
    detectedIntro: { start: number; end: number } | null;
    detectedOutro: { start: number; end: number } | null;
    scanSummary?: { probes: number; elapsedMs: number; introMissing: boolean; outroMissing: boolean } | null;
  }>({
    isScanning: false,
    scanProgress: 0,
    scanStatus: '',
    detectedIntro: null,
    detectedOutro: null,
  });

  // Modals Visibility
  const [isStudioSettingsOpen, setIsStudioSettingsOpen] = useState(false);
  const [studioInitialTab, setStudioInitialTab] = useState<SettingsTabId>('audio');
  const [isSubtitlesOpen, setIsSubtitlesOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isIntroOutroOpen, setIsIntroOutroOpen] = useState(false);

  const currentTrack = playlist[currentIndex];

  // Intro & Outro configuration state with automatic persistence
  const [introOutroConfig, setIntroOutroConfig] = useState<IntroOutroConfig>(() =>
    getIntroOutroConfigForTrack(SAMPLE_PLAYLIST[0], 0)
  );

  // Synchronize introOutroConfig when track or duration changes
  useEffect(() => {
    if (currentTrack) {
      const cfg = getIntroOutroConfigForTrack(currentTrack, duration);
      setIntroOutroConfig(cfg);

      // Also ensure folder-level intro/outro is loaded from disk if available
      if (currentTrack.filePath && window.electronAPI?.loadFolderIntroOutro) {
        window.electronAPI.loadFolderIntroOutro(currentTrack.filePath).then((folderCfg) => {
          if (folderCfg) {
            registerFolderConfig(currentTrack.filePath!, folderCfg);
            const reloaded = getIntroOutroConfigForTrack(currentTrack, duration);
            setIntroOutroConfig(reloaded);
          }
        });
      }
    }
  }, [currentTrack?.id, currentTrack?.filePath, duration]);

  // Asynchronously probe & enrich embedded subtitles for the current active track
  useEffect(() => {
    if (!currentTrack || !currentTrack.filePath || !window.electronAPI?.getEmbeddedSubtitles) {
      return;
    }

    let isMounted = true;
    const currentTrackId = currentTrack.id;
    const filePath = currentTrack.filePath;

    window.electronAPI.getEmbeddedSubtitles(filePath).then((rawSubs) => {
      if (!isMounted || !rawSubs || rawSubs.length === 0) return;

      const newEmbeddedTracks: SubtitleTrack[] = [];
      for (const s of rawSubs) {
        const cues = parseSubtitleFile(s.content, s.name);
        if (cues && cues.length > 0) {
          newEmbeddedTracks.push({
            id: s.id || `embedded-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: s.label || s.name,
            language: s.language || 'und',
            cues,
            isEmbedded: true,
          });
        }
      }

      if (newEmbeddedTracks.length === 0) return;

      setPlaylist((prevList) => {
        const idx = prevList.findIndex((item) => item.id === currentTrackId);
        if (idx === -1) return prevList;

        const track = prevList[idx];
        const existingSubs = track.subtitles || [];
        const existingLabels = new Set(existingSubs.map((es) => es.label.toLowerCase()));

        const toAdd = newEmbeddedTracks.filter((nt) => !existingLabels.has(nt.label.toLowerCase()));
        if (toAdd.length === 0) return prevList;

        const mergedSubs = [...existingSubs, ...toAdd];
        const updatedTrack = { ...track, subtitles: mergedSubs };
        const updatedList = [...prevList];
        updatedList[idx] = updatedTrack;

        return updatedList;
      });

      // Auto-select subtitle if none is active or active is missing, prioritizing Indonesian
      setActiveSubtitleTrackId((currActive) => {
        if (!currActive) {
          const indSub = newEmbeddedTracks.find((s) =>
            s.language.toLowerCase().includes('id') ||
            s.language.toLowerCase().includes('ina') ||
            s.label.toLowerCase().includes('indonesian') ||
            s.label.toLowerCase().includes('indonesia')
          );
          return indSub ? indSub.id : newEmbeddedTracks[0].id;
        }
        return currActive;
      });
    }).catch((err) => {
      console.warn('Failed to load embedded subtitles for current track:', err);
    });

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, currentTrack?.filePath]);

  const openStudioSettings = (tab: SettingsTabId = 'audio') => {
    setStudioInitialTab(tab);
    setIsStudioSettingsOpen(true);
  };

  // Handler: Add local media files
  const handleAddFiles = useCallback((files: FileList | File[]) => {
    const videoFiles: File[] = [];
    const subFiles: File[] = [];

    Array.from(files).forEach((file) => {
      const ext = file.name.toLowerCase();
      if (ext.endsWith('.srt') || ext.endsWith('.vtt') || ext.endsWith('.ass') || ext.endsWith('.ssa')) {
        subFiles.push(file);
      } else {
        videoFiles.push(file);
      }
    });

    const newItems: MediaItem[] = videoFiles.map((file) => {
      let filePath: string | undefined = undefined;
      if (window.electronAPI?.getPathForFile) {
        filePath = window.electronAPI.getPathForFile(file) || undefined;
      }
      if (!filePath) {
        filePath = (file as unknown as { path?: string }).path;
      }
      const url = filePath && window.electronAPI?.getStreamUrlForPath
        ? window.electronAPI.getStreamUrlForPath(filePath)
        : URL.createObjectURL(file);
      return {
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        url,
        filePath,
        isLocal: true,
        file,
        size: file.size,
        subtitles: [],
      };
    });

    const subPromises = subFiles.map(subFile => {
      return new Promise<SubtitleTrack | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          if (!text) return resolve(null);
          const cues = parseSubtitleFile(text, subFile.name);
          resolve({
            id: `custom-sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            label: subFile.name.replace(/\.[^/.]+$/, ''),
            language: 'custom',
            cues,
            isCustom: true,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(subFile);
      });
    });

    const videoEmbeddedPromises = newItems.map(async (item) => {
      if (item.filePath && window.electronAPI?.getEmbeddedSubtitles) {
        try {
          const rawEmbedded = await window.electronAPI.getEmbeddedSubtitles(item.filePath);
          if (rawEmbedded && rawEmbedded.length > 0) {
            const parsedEmbedded: SubtitleTrack[] = rawEmbedded.map((s) => ({
              id: s.id || `embedded-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              label: s.label || s.name,
              language: s.language || 'und',
              cues: parseSubtitleFile(s.content, s.name),
              isEmbedded: true,
            }));
            item.subtitles = [...(item.subtitles || []), ...parsedEmbedded];
          }
        } catch {}
      }
      return item;
    });

    Promise.all([Promise.all(subPromises), Promise.all(videoEmbeddedPromises)]).then(([loadedSubs, hydratedItems]) => {
      const validSubs = loadedSubs.filter((s): s is SubtitleTrack => s !== null);

      if (hydratedItems.length > 0) {
        if (validSubs.length > 0) {
          hydratedItems[0].subtitles = [...(hydratedItems[0].subtitles || []), ...validSubs];
        }
        const activeSubs = hydratedItems[0].subtitles || [];
        if (activeSubs.length > 0) {
          const indSub = activeSubs.find(s =>
            s.language.toLowerCase().includes('id') ||
            s.language.toLowerCase().includes('ina') ||
            s.label.toLowerCase().includes('indonesian') ||
            s.label.toLowerCase().includes('indonesia')
          );
          setActiveSubtitleTrackId(indSub ? indSub.id : activeSubs[0].id);
        }
        setPlaylist(prev => {
          const next = [...prev, ...hydratedItems];
          return next;
        });
        if (playlist.length === 0) {
          setCurrentIndex(0);
        }
      } else if (validSubs.length > 0) {
        setPlaylist(prev => {
          if (!prev[currentIndex]) return prev;
          const current = prev[currentIndex];
          const updated = [...prev];
          updated[currentIndex] = {
            ...current,
            subtitles: [...(current.subtitles || []), ...validSubs],
          };
          return updated;
        });
        setActiveSubtitleTrackId(validSubs[0].id);
      }
    });
  }, [currentIndex, playlist.length]);

  const handleAddMediaItems = useCallback((items: MediaItem[]) => {
    if (items.length > 0) {
      setPlaylist(prev => [...prev, ...items]);
      if (playlist.length === 0) {
        setCurrentIndex(0);
      }
    }
  }, [playlist.length]);

  // Handler: Load folder scan or external media files (natural sorted folder playlist)
  const handleLoadExternalMedia = useCallback((payload: import('./electron').FolderScanResult | import('./electron').NativeMediaFile) => {
    if ('folderConfig' in payload && payload.folderConfig) {
      const folderKey = payload.folder || (payload.items && payload.items[0]?.path);
      if (folderKey) {
        registerFolderConfig(folderKey, payload.folderConfig);
      }
    }

    const rawItems: import('./electron').NativeMediaFile[] = ('items' in payload && Array.isArray(payload.items))
      ? payload.items
      : [payload as import('./electron').NativeMediaFile];
    const initialIndex = ('activeIndex' in payload && typeof payload.activeIndex === 'number')
      ? payload.activeIndex
      : 0;

    const newItems: MediaItem[] = rawItems.map((item) => {
      let parsedSubs: SubtitleTrack[] = [];
      if (item.subtitles && item.subtitles.length > 0) {
        parsedSubs = item.subtitles.map((s) => {
          const cues = parseSubtitleFile(s.content, s.name);
          return {
            id: s.id || `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            label: s.label || s.name,
            language: s.language || 'default',
            cues,
            isCustom: !s.isEmbedded,
            isEmbedded: s.isEmbedded,
          };
        });
      }

      return {
        id: `ext-${item.path || item.name}-${Math.random().toString(36).substr(2, 5)}`,
        title: item.name.replace(/\.[^/.]+$/, ''),
        url: item.url,
        filePath: item.path,
        isLocal: true,
        size: item.size,
        subtitles: parsedSubs,
      };
    });

    if (newItems.length === 0) return;

    setPlaylist(newItems);
    const safeIndex = Math.max(0, Math.min(initialIndex, newItems.length - 1));
    setCurrentIndex(safeIndex);
    setAbLoop({ enabled: false, start: null, end: null });

    const activeTrack = newItems[safeIndex];
    if (activeTrack?.subtitles && activeTrack.subtitles.length > 0) {
      const indSub = activeTrack.subtitles.find(s =>
        s.language.toLowerCase().includes('id') ||
        s.language.toLowerCase().includes('ina') ||
        s.label.toLowerCase().includes('indonesian') ||
        s.label.toLowerCase().includes('indonesia')
      );
      setActiveSubtitleTrackId(indSub ? indSub.id : activeTrack.subtitles[0].id);
    } else {
      setActiveSubtitleTrackId(null);
    }
  }, []);

  // Handler: Reorder playlist
  const handleReorderPlaylist = useCallback((newPlaylist: MediaItem[], newCurrentIndex: number) => {
    setPlaylist(newPlaylist);
    setCurrentIndex(newCurrentIndex);
  }, []);

  // Window drag and drop
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (e.dataTransfer.files.length === 1 && window.electronAPI?.scanFolderMedia) {
          const file = e.dataTransfer.files[0];
          const filePath = window.electronAPI.getPathForFile?.(file) || (file as unknown as { path?: string }).path;
          if (filePath) {
            try {
              const scanRes = await window.electronAPI.scanFolderMedia(filePath);
              if (scanRes && scanRes.items.length > 0) {
                handleLoadExternalMedia(scanRes);
                return;
              }
            } catch (err) {
              console.error('Failed to scan folder on drop:', err);
            }
          }
        }
        handleAddFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleAddFiles, handleLoadExternalMedia]);

  // Listen to CLI open file & check initial media
  useEffect(() => {
    if (window.electronAPI?.getInitialMedia) {
      window.electronAPI.getInitialMedia()
        .then((initial) => {
          if (initial) {
            handleLoadExternalMedia(initial);
          }
        })
        .catch((e) => console.error('Failed to get initial media:', e));
    }

    if (window.electronAPI?.onCliOpenFile) {
      const unsubscribe = window.electronAPI.onCliOpenFile((item) => {
        handleLoadExternalMedia(item);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [handleLoadExternalMedia]);

  const handleSelectTrack = (index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentIndex(index);
      setAbLoop({ enabled: false, start: null, end: null });
      const nextTrack = playlist[index];
      if (nextTrack?.subtitles && nextTrack.subtitles.length > 0) {
        const indSub = nextTrack.subtitles.find(s =>
          s.language.toLowerCase().includes('id') ||
          s.language.toLowerCase().includes('ina') ||
          s.label.toLowerCase().includes('indonesian') ||
          s.label.toLowerCase().includes('indonesia')
        );
        setActiveSubtitleTrackId(indSub ? indSub.id : nextTrack.subtitles[0].id);
      } else {
        setActiveSubtitleTrackId(null);
      }
    }
  };

  const handleAddCustomTrack = (track: SubtitleTrack) => {
    if (!currentTrack) return;
    const existingSubs = currentTrack.subtitles || [];
    if (existingSubs.some(s => s.id === track.id || s.label.toLowerCase() === track.label.toLowerCase())) {
      return;
    }
    const updatedSubtitles = [...existingSubs, track];
    const updatedPlaylist = [...playlist];
    updatedPlaylist[currentIndex] = {
      ...currentTrack,
      subtitles: updatedSubtitles,
    };
    setPlaylist(updatedPlaylist);
  };

  const handleLoadSamples = () => {
    setPlaylist(SAMPLE_PLAYLIST);
    setCurrentIndex(0);
    setAbLoop({ enabled: false, start: null, end: null });
    setActiveSubtitleTrackId(SAMPLE_PLAYLIST[0]?.subtitles?.[0]?.id || null);
  };

  const handleRemoveTrack = (index: number) => {
    const trackToRemove = playlist[index];
    if (trackToRemove?.isLocal && trackToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(trackToRemove.url);
    }
    const updated = playlist.filter((_, idx) => idx !== index);
    setPlaylist(updated);

    if (currentIndex > index) {
      setCurrentIndex(currentIndex - 1);
    } else if (currentIndex >= updated.length) {
      setCurrentIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleClearPlaylist = () => {
    playlist.forEach(track => {
      if (track.isLocal && track.url.startsWith('blob:')) {
        URL.revokeObjectURL(track.url);
      }
    });
    setPlaylist([]);
    setCurrentIndex(0);
    setAbLoop({ enabled: false, start: null, end: null });
  };

  return (
    <div className="min-h-screen bg-[#070a10] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      
      {/* Top Header Bar */}
      <Header
        currentTrack={currentTrack}
        currentIndex={currentIndex}
        playlistCount={playlist.length}
        onOpenPlaylist={() => setIsPlaylistOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenStudioSettings={openStudioSettings}
        onAddFiles={handleAddFiles}
        onAddMediaItems={handleAddMediaItems}
        onLoadFolderMedia={handleLoadExternalMedia}
        onLoadSamples={handleLoadSamples}
        isBoosted={audioSettings.boost > 1.0}
      />

      {/* Main Player Container */}
      <main className="flex-1 flex flex-col p-3 sm:p-6 max-w-7xl w-full mx-auto justify-center">
        
        {/* Video Player Display */}
        <div className="w-full flex-1 flex flex-col justify-center">
          <VideoPlayer
            currentTrack={currentTrack}
            playlist={playlist}
            currentIndex={currentIndex}
            onSelectTrack={handleSelectTrack}
            onAddFiles={handleAddFiles}
            onAddSubtitleTrack={handleAddCustomTrack}
            audioSettings={audioSettings}
            setAudioSettings={setAudioSettings}
            videoSettings={videoSettings}
            setVideoSettings={setVideoSettings}
            subtitleStyle={subtitleStyle}
            setSubtitleStyle={setSubtitleStyle}
            activeSubtitleTrackId={activeSubtitleTrackId}
            setActiveSubtitleTrackId={setActiveSubtitleTrackId}
            repeatMode={repeatMode}
            shuffle={shuffle}
            abLoop={abLoop}
            setAbLoop={setAbLoop}
            preferences={preferences}
            setPreferences={setPreferences}
            onTimeUpdateSync={(t, d) => {
              setCurrentTime(t);
              setDuration(d);
            }}
            registerActions={(actions) => {
              playerActionsRef.current = actions;
            }}
            onScanStateChange={setIntroScanState}
            onOpenSubtitles={() => openStudioSettings('subtitles')}
            onOpenEqualizer={() => openStudioSettings('audio')}
            onOpenVideoSettings={() => openStudioSettings('video')}
            onOpenStudioSettings={openStudioSettings}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onOpenIntroOutro={() => setIsIntroOutroOpen(true)}
            introOutroConfig={introOutroConfig}
          />
        </div>

        {/* Media Details & Quick Control Deck below video */}
        {currentTrack && (
          <div className="mt-4 p-4 rounded-2xl bg-[#0f1422] border border-cyan-950/60 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Title & Metadata */}
            <div className="flex items-center gap-3.5 overflow-hidden w-full md:w-auto">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                <Tv className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                    {currentTrack.title}
                  </h3>
                  {currentTrack.resolution && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      {currentTrack.resolution}
                    </span>
                  )}
                  {videoSettings.picturePreset !== 'normal' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                      {videoSettings.picturePreset}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>{currentTrack.isLocal ? 'Local Media File' : 'Stream HD'}</span>
                  <span>&bull;</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    GPU Accelerated
                  </span>
                  {activeSubtitleTrackId && (
                    <>
                      <span>&bull;</span>
                      <span className="text-cyan-400 font-medium">CC Active</span>
                    </>
                  )}
                  {hasIntroOutroSetup(introOutroConfig) && (
                    <>
                      <span>&bull;</span>
                      <span className="text-purple-400 font-medium flex items-center gap-1">
                        <FastForward className="w-3 h-3" />
                        Auto-Skip Ready
                      </span>
                    </>
                  )}
                  {abLoop.enabled && (
                    <>
                      <span>&bull;</span>
                      <span className="text-amber-400 font-medium flex items-center gap-1">
                        <Repeat className="w-3 h-3" />
                        A-B Loop
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Action Badges / Controls */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
              
              {/* Skip Intro & Outro Quick Button */}
              <button
                onClick={() => setIsIntroOutroOpen(true)}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  hasIntroOutroSetup(introOutroConfig)
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
                title="Setup Deteksi & Tombol Skip Intro / Outro Anime (I)"
              >
                <FastForward className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  Skip Intro/Outro
                </span>
              </button>

              {/* Equalizer Quick Button */}
              <button
                onClick={() => openStudioSettings('audio')}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  audioSettings.boost > 1.0 || audioSettings.eqPreset !== 'Flat' || audioSettings.drcMode !== 'off'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Audio EQ {audioSettings.boost > 1 ? `(${Math.round(audioSettings.boost * 100)}%)` : ''}</span>
              </button>

              {/* Subtitles Quick Button */}
              <button
                onClick={() => openStudioSettings('subtitles')}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                  activeSubtitleTrackId
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Subtitles ({currentTrack.subtitles?.length || 0})</span>
              </button>

              {/* Video Picture Filters Button */}
              <button
                onClick={() => openStudioSettings('video')}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Picture & Speed</span>
              </button>

              {/* Studio Master Settings */}
              <button
                onClick={() => openStudioSettings('audio')}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-cyan-500/10"
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>Studio Suite</span>
              </button>

            </div>

          </div>
        )}

      </main>

      {/* MASTER STUDIO SETTINGS MODAL */}
      <StudioSettingsModal
        isOpen={isStudioSettingsOpen}
        onClose={() => setIsStudioSettingsOpen(false)}
        initialTab={studioInitialTab}
        audioSettings={audioSettings}
        setAudioSettings={setAudioSettings}
        videoSettings={videoSettings}
        setVideoSettings={setVideoSettings}
        subtitleStyle={subtitleStyle}
        setSubtitleStyle={setSubtitleStyle}
        subtitleTracks={currentTrack?.subtitles || []}
        activeSubtitleTrackId={activeSubtitleTrackId}
        onSelectSubtitleTrack={setActiveSubtitleTrackId}
        onAddSubtitleTrack={handleAddCustomTrack}
        abLoop={abLoop}
        setAbLoop={setAbLoop}
        preferences={preferences}
        setPreferences={setPreferences}
        currentTime={currentTime}
        duration={duration}
        onSeek={(seconds) => {
          playerActionsRef.current?.seek(seconds);
        }}
        onStepFrame={(direction) => {
          playerActionsRef.current?.stepFrame(direction);
        }}
        onCaptureSnapshot={(options) => {
          playerActionsRef.current?.captureSnapshot(options);
        }}
        resolution={currentTrack?.resolution}
      />

      {/* Subtitles Dedicated Modal (Also accessible standalone) */}
      <SubtitleModal
        isOpen={isSubtitlesOpen}
        onClose={() => setIsSubtitlesOpen(false)}
        tracks={currentTrack?.subtitles || []}
        activeTrackId={activeSubtitleTrackId}
        onSelectTrack={setActiveSubtitleTrackId}
        onAddCustomTrack={handleAddCustomTrack}
        subtitleStyle={subtitleStyle}
        setSubtitleStyle={setSubtitleStyle}
        currentTime={currentTime}
        onSeek={(seconds) => {
          playerActionsRef.current?.seek(seconds);
        }}
      />

      {/* Playlist Drawer */}
      <PlaylistDrawer
        isOpen={isPlaylistOpen}
        onClose={() => setIsPlaylistOpen(false)}
        playlist={playlist}
        currentIndex={currentIndex}
        onSelectTrack={handleSelectTrack}
        onAddFiles={handleAddFiles}
        onRemoveTrack={handleRemoveTrack}
        onClearPlaylist={handleClearPlaylist}
        onLoadSamples={handleLoadSamples}
        onReorderPlaylist={handleReorderPlaylist}
        shuffle={shuffle}
        setShuffle={setShuffle}
        repeatMode={repeatMode}
        setRepeatMode={setRepeatMode}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Intro & Outro Manager Modal */}
      <IntroOutroModal
        isOpen={isIntroOutroOpen}
        onClose={() => setIsIntroOutroOpen(false)}
        currentTrack={currentTrack}
        currentTime={currentTime}
        duration={duration}
        videoElement={playerActionsRef.current?.getVideoElement?.() || null}
        config={introOutroConfig}
        onUpdateConfig={setIntroOutroConfig}
        onSeek={(seconds) => {
          playerActionsRef.current?.seek(seconds);
        }}
        isScanning={introScanState.isScanning}
        scanProgress={introScanState.scanProgress}
        scanStatus={introScanState.scanStatus}
        onTriggerScan={() => {
          playerActionsRef.current?.triggerScan?.();
        }}
        detectedIntro={introScanState.detectedIntro}
        detectedOutro={introScanState.detectedOutro}
        scanSummary={introScanState.scanSummary}
      />

    </div>
  );
};
