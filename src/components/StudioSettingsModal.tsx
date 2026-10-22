import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Zap,
  RotateCcw,
  X,
  Radio,
  Clock,
  Mic,
  Headphones,
  Sparkles,
  Maximize2,
  Camera,
  Repeat,
  Gauge,
  Activity,
  Layers,
  Settings,
  Tv,
  Subtitles,
  Upload,
  Check,
  Compass,
  Monitor,
  Eye,
  Copy,
  Download,
  Flame,
  Moon,
  Sun,
  ShieldAlert,
  HelpCircle,
  FileText
} from 'lucide-react';
import {
  AudioSettings,
  VideoSettings,
  SubtitleStyle,
  SubtitleTrack,
  ABLoopState,
  GeneralPreferences,
  PicturePreset,
  VideoSharpness,
  VideoAspectRatio,
  VideoRotation,
  SubtitleFontFamily,
  SubtitleTextOutline
} from '../types';
import { EQ_FREQUENCIES, EQ_PRESETS, globalAudioEngine } from '../utils/audioEngine';
import { formatTime, parseSubtitleFile } from '../utils/subtitleParser';

export type SettingsTabId = 'audio' | 'video' | 'playback' | 'subtitles' | 'stats';

interface StudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
  audioSettings: AudioSettings;
  setAudioSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
  videoSettings: VideoSettings;
  setVideoSettings: React.Dispatch<React.SetStateAction<VideoSettings>>;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleTrackId: string | null;
  onSelectSubtitleTrack: (trackId: string | null) => void;
  onAddSubtitleTrack: (track: SubtitleTrack) => void;
  abLoop: ABLoopState;
  setAbLoop: React.Dispatch<React.SetStateAction<ABLoopState>>;
  preferences: GeneralPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<GeneralPreferences>>;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onStepFrame: (direction: 1 | -1) => void;
  onCaptureSnapshot: (options?: { format: 'png' | 'jpeg'; includeSubtitles: boolean; copyToClipboard?: boolean }) => void;
  resolution?: string;
  videoElement?: HTMLVideoElement | null;
}

export const StudioSettingsModal: React.FC<StudioSettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'audio',
  audioSettings,
  setAudioSettings,
  videoSettings,
  setVideoSettings,
  subtitleStyle,
  setSubtitleStyle,
  subtitleTracks,
  activeSubtitleTrackId,
  onSelectSubtitleTrack,
  onAddSubtitleTrack,
  abLoop,
  setAbLoop,
  preferences,
  setPreferences,
  currentTime,
  duration,
  onSeek,
  onStepFrame,
  onCaptureSnapshot,
  resolution,
  videoElement,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [snapshotSubtitles, setSnapshotSubtitles] = useState(true);
  const [snapshotFormat, setSnapshotFormat] = useState<'png' | 'jpeg'>('png');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const subFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Toast notification helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Enumerate output devices if supported
  useEffect(() => {
    if (!isOpen) return;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const outputs = devices.filter((d) => d.kind === 'audiooutput');
          setAudioDevices(outputs);
        })
        .catch(console.warn);
    }
  }, [isOpen]);

  // Audio Visualizer Loop
  useEffect(() => {
    if (!isOpen || activeTab !== 'audio') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = 64;
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background subtle gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, 'rgba(8, 12, 22, 0.95)');
      bgGrad.addColorStop(1, 'rgba(4, 7, 14, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (audioSettings.visualizerMode === 'bars') {
        globalAudioEngine.getVisualizerData(freqData);
        const barWidth = (canvas.width / bufferLength) * 2.2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (freqData[i] / 255) * (canvas.height - 12);
          const barGrad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          barGrad.addColorStop(0, '#06b6d4'); // cyan
          barGrad.addColorStop(0.5, '#3b82f6'); // blue
          barGrad.addColorStop(1, '#a855f7'); // purple

          ctx.fillStyle = barGrad;
          ctx.shadowBlur = 6;
          ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          ctx.shadowBlur = 0;

          x += barWidth;
          if (x > canvas.width) break;
        }
      } else if (audioSettings.visualizerMode === 'wave') {
        globalAudioEngine.getTimeDomainData(timeData);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#06b6d4';
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Peaks / Stereo VU meter
        globalAudioEngine.getVisualizerData(freqData);
        let sumLeft = 0;
        let sumRight = 0;
        const half = bufferLength / 2;
        for (let i = 0; i < half; i++) sumLeft += freqData[i];
        for (let i = half; i < bufferLength; i++) sumRight += freqData[i];
        const avgL = sumLeft / half / 255;
        const avgR = sumRight / half / 255;

        const w = canvas.width - 40;
        const h = 18;
        const yL = 20;
        const yR = 50;

        // Channel L
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(20, yL, w, h);
        const lGrad = ctx.createLinearGradient(20, 0, 20 + w, 0);
        lGrad.addColorStop(0, '#10b981');
        lGrad.addColorStop(0.7, '#f59e0b');
        lGrad.addColorStop(1, '#ef4444');
        ctx.fillStyle = lGrad;
        ctx.fillRect(20, yL, w * avgL, h);

        // Channel R
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(20, yR, w, h);
        ctx.fillStyle = lGrad;
        ctx.fillRect(20, yR, w * avgR, h);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`L ${(avgL * 100).toFixed(0)}%`, 24, yL + 13);
        ctx.fillText(`R ${(avgR * 100).toFixed(0)}%`, 24, yR + 13);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isOpen, activeTab, audioSettings.visualizerMode]);

  if (!isOpen) return null;

  // --- AUDIO HANDLERS ---
  const handleBandChange = (index: number, val: number) => {
    const updated = [...audioSettings.eqBands];
    updated[index] = val;
    setAudioSettings(prev => ({
      ...prev,
      eqPreset: 'Custom',
      eqBands: updated,
    }));
    globalAudioEngine.setBandGain(index, val);
  };

  const handlePresetSelect = (presetName: string) => {
    const gains = EQ_PRESETS[presetName];
    if (gains) {
      setAudioSettings(prev => ({
        ...prev,
        eqPreset: presetName,
        eqBands: [...gains],
      }));
      globalAudioEngine.applyPreset(gains);
    }
  };

  const handleBoostChange = (boost: number) => {
    setAudioSettings(prev => ({ ...prev, boost }));
    globalAudioEngine.setBoost(boost);
  };

  const handleBalanceChange = (balance: number) => {
    setAudioSettings(prev => ({ ...prev, balance }));
    globalAudioEngine.setBalance(balance);
  };

  const handleBassGainChange = (bassGain: number) => {
    setAudioSettings(prev => ({ ...prev, bassGain }));
    globalAudioEngine.setBassGain(bassGain);
  };

  const handleTrebleGainChange = (trebleGain: number) => {
    setAudioSettings(prev => ({ ...prev, trebleGain }));
    globalAudioEngine.setTrebleGain(trebleGain);
  };

  const handleVocalClarityToggle = () => {
    const nextVal = !audioSettings.vocalClarity;
    setAudioSettings(prev => ({ ...prev, vocalClarity: nextVal }));
    globalAudioEngine.setVocalClarity(nextVal);
  };

  const handleDrcModeSelect = (mode: AudioSettings['drcMode']) => {
    setAudioSettings(prev => ({ ...prev, drcMode: mode }));
    globalAudioEngine.setDrcMode(mode);
  };

  const handleSpatialModeSelect = (mode: AudioSettings['spatialAudio']) => {
    setAudioSettings(prev => ({ ...prev, spatialAudio: mode }));
    globalAudioEngine.setSpatialAudio(mode);
  };

  const handleMonoToggle = () => {
    const nextMono = !audioSettings.monoDownmix;
    setAudioSettings(prev => ({ ...prev, monoDownmix: nextMono }));
    globalAudioEngine.setMonoDownmix(nextMono);
  };

  const handleDelayChange = (delay: number) => {
    const safeDelay = Math.round(delay * 20) / 20;
    setAudioSettings(prev => ({ ...prev, audioDelay: safeDelay }));
    globalAudioEngine.setAudioDelay(safeDelay);
  };

  const handleAudioDeviceChange = (deviceId: string) => {
    setAudioSettings(prev => ({ ...prev, audioDeviceId: deviceId }));
    if (videoElement && typeof (videoElement as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
      (videoElement as unknown as { setSinkId: (id: string) => Promise<void> })
        .setSinkId(deviceId)
        .then(() => showToast('Audio output device updated'))
        .catch((err) => console.warn('setSinkId failed:', err));
    }
  };

  const handleResetAudio = () => {
    handlePresetSelect('Flat');
    setAudioSettings(prev => ({
      ...prev,
      boost: 1.0,
      balance: 0,
      audioDelay: 0,
      bassGain: 0,
      trebleGain: 0,
      vocalClarity: false,
      drcMode: 'off',
      spatialAudio: 'off',
      monoDownmix: false,
      eqPreset: 'Flat',
    }));
    globalAudioEngine.setBoost(1.0);
    globalAudioEngine.setBalance(0);
    globalAudioEngine.setAudioDelay(0);
    globalAudioEngine.setBassGain(0);
    globalAudioEngine.setTrebleGain(0);
    globalAudioEngine.setVocalClarity(false);
    globalAudioEngine.setDrcMode('off');
    globalAudioEngine.setSpatialAudio('off');
    globalAudioEngine.setMonoDownmix(false);
    showToast('Audio settings reset to defaults');
  };

  // --- VIDEO HANDLERS ---
  const applyPicturePreset = (preset: PicturePreset) => {
    let b = 100;
    let c = 100;
    let s = 100;
    let h = 0;
    let g = 1.0;
    let sh: VideoSharpness = 'off';
    let gs = 0;
    let sep = 0;

    switch (preset) {
      case 'cinema':
        b = 98;
        c = 115;
        s = 105;
        h = 0;
        g = 1.05;
        sh = 'subtle';
        sep = 5;
        break;
      case 'vivid':
        b = 104;
        c = 120;
        s = 135;
        h = 0;
        g = 0.95;
        sh = 'medium';
        break;
      case 'hdr':
        b = 110;
        c = 125;
        s = 120;
        h = 0;
        g = 1.1;
        sh = 'medium';
        break;
      case 'anime':
        b = 105;
        c = 110;
        s = 140;
        h = 0;
        g = 1.0;
        sh = 'high';
        break;
      case 'night':
        b = 85;
        c = 95;
        s = 85;
        h = 10;
        g = 1.0;
        sh = 'off';
        sep = 15;
        break;
      case 'noir':
        b = 105;
        c = 130;
        s = 0;
        h = 0;
        g = 1.0;
        sh = 'medium';
        gs = 100;
        break;
      case 'normal':
      default:
        b = 100;
        c = 100;
        s = 100;
        h = 0;
        g = 1.0;
        sh = 'off';
        gs = 0;
        sep = 0;
        break;
    }

    setVideoSettings(prev => ({
      ...prev,
      picturePreset: preset,
      brightness: b,
      contrast: c,
      saturation: s,
      hue: h,
      gamma: g,
      sharpness: sh,
      grayscale: gs,
      sepia: sep,
      invert: false,
    }));
    showToast(`Preset ${preset.toUpperCase()} applied`);
  };

  const handleResetVideo = () => {
    applyPicturePreset('normal');
    setVideoSettings(prev => ({
      ...prev,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      zoom: 100,
      panX: 0,
      panY: 0,
      aspectRatio: 'fit',
      renderingQuality: 'auto',
      deinterlace: false,
    }));
    showToast('Video picture & geometry reset');
  };

  const handleRotate = () => {
    const nextRot = ((videoSettings.rotation + 90) % 360) as VideoRotation;
    setVideoSettings(prev => ({ ...prev, rotation: nextRot }));
  };

  // --- PLAYBACK & SNAPSHOT ---
  const speedPresets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];
  const aspectRatios: Array<{ id: VideoAspectRatio; label: string; desc: string }> = [
    { id: 'fit', label: 'Fit Original', desc: 'Preserves native aspect ratio' },
    { id: '16:9', label: '16:9 Wide', desc: 'HDTV / YouTube widescreen' },
    { id: '4:3', label: '4:3 Classic', desc: 'Standard definition TV' },
    { id: '21:9', label: '21:9 Cinema', desc: 'UltraWide anamorphic movie' },
    { id: '18:9', label: '18:9 Mobile', desc: 'Modern smartphone displays' },
    { id: '1:1', label: '1:1 Square', desc: 'Square aspect ratio' },
    { id: 'fill', label: 'Stretch Fill', desc: 'Fills viewport completely' },
  ];

  // A-B Looper controls
  const handleSetPointA = () => {
    setAbLoop(prev => ({
      ...prev,
      start: currentTime,
      enabled: prev.end !== null && currentTime < prev.end,
    }));
    showToast(`Point A set at ${formatTime(currentTime)}`);
  };

  const handleSetPointB = () => {
    if (abLoop.start !== null && currentTime <= abLoop.start) {
      showToast('Point B must be ahead of Point A');
      return;
    }
    setAbLoop(prev => ({
      ...prev,
      end: currentTime,
      enabled: prev.start !== null,
    }));
    showToast(`Point B set at ${formatTime(currentTime)} (Loop Active)`);
  };

  const handleClearLoop = () => {
    setAbLoop({ enabled: false, start: null, end: null });
    showToast('A-B Loop cleared');
  };

  // Subtitle Custom File Upload
  const handleSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const cues = parseSubtitleFile(text, file.name);
        const newTrack: SubtitleTrack = {
          id: `custom-modal-${Date.now()}`,
          label: file.name.replace(/\.[^/.]+$/, ''),
          language: 'custom',
          cues,
          isCustom: true,
        };
        onAddSubtitleTrack(newTrack);
        onSelectSubtitleTrack(newTrack.id);
        showToast(`Loaded subtitle: ${file.name}`);
      }
    };
    reader.readAsText(file);
    if (subFileInputRef.current) subFileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-semibold text-xs shadow-2xl shadow-cyan-500/40 animate-in slide-in-from-top-4 duration-150">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-[#0e1320] border border-cyan-500/30 w-full max-w-4xl rounded-2xl shadow-2xl shadow-cyan-950/60 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Settings className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                ZMT Pro Studio & Master Controls
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Broadcast Suite
                </span>
              </h2>
              <p className="text-xs text-slate-400">Studio DSP audio processing, GPU video grading, A-B loop & typography</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="flex border-b border-slate-800 bg-[#0a0d16] px-4 overflow-x-auto custom-scrollbar">
          {[
            { id: 'audio', label: 'Audio Pro Studio', icon: Sliders, badge: audioSettings.boost > 1 ? `${Math.round(audioSettings.boost * 100)}%` : undefined },
            { id: 'video', label: 'Video & Picture', icon: SlidersHorizontal, badge: videoSettings.picturePreset !== 'normal' ? videoSettings.picturePreset : undefined },
            { id: 'playback', label: 'Playback & A-B Loop', icon: Gauge, badge: abLoop.enabled ? 'LOOP' : undefined },
            { id: 'subtitles', label: 'Subtitles & Style', icon: Subtitles, badge: activeSubtitleTrackId ? 'ACTIVE' : undefined },
            { id: 'stats', label: 'Stats for Nerds', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTabId)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body Contents */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
          
          {/* ========================================================= */}
          {/* 1. AUDIO TAB */}
          {/* ========================================================= */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              
              {/* Visualizer with Mode Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    Live Hardware DSP Visualizer
                  </span>
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
                    {(['bars', 'wave', 'peaks'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setAudioSettings(prev => ({ ...prev, visualizerMode: m }))}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                          audioSettings.visualizerMode === m
                            ? 'bg-cyan-500 text-black font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 relative shadow-inner">
                  <canvas ref={canvasRef} width={760} height={90} className="w-full h-[90px] block" />
                </div>
              </div>

              {/* Master Boost & Balance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 300% Volume Booster */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      <Zap className={`w-4 h-4 ${audioSettings.boost > 1.0 ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />
                      Extra Volume Amplification
                    </span>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      audioSettings.boost > 1.5
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-cyan-400'
                    }`}>
                      {Math.round(audioSettings.boost * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Amplifies faint dialogue up to 300% beyond native threshold</p>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono">100%</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={audioSettings.boost}
                      onChange={(e) => handleBoostChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs text-amber-400 font-semibold font-mono">300%</span>
                  </div>

                  <div className="flex gap-2 mt-3">
                    {[1.0, 1.5, 2.0, 2.5, 3.0].map((b) => (
                      <button
                        key={b}
                        onClick={() => handleBoostChange(b)}
                        className={`flex-1 py-1 text-xs font-medium rounded-lg border transition ${
                          Math.abs(audioSettings.boost - b) < 0.05
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white'
                        }`}
                      >
                        {Math.round(b * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stereo Balance (Pan) & Mono Downmixing */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      Stereo Balance & Pan
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {audioSettings.balance === 0 ? 'Center' : audioSettings.balance < 0 ? `L ${Math.abs(Math.round(audioSettings.balance * 100))}%` : `R ${Math.round(audioSettings.balance * 100)}%`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Distribute sound channels across left and right monitors</p>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-medium">L</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={audioSettings.balance}
                      onChange={(e) => handleBalanceChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs text-slate-400 font-medium">R</span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => handleBalanceChange(0)}
                      className="text-xs text-slate-400 hover:text-cyan-300 underline underline-offset-2"
                    >
                      Reset to Center
                    </button>
                    <button
                      onClick={handleMonoToggle}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                        audioSettings.monoDownmix
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      Mono Downmix: {audioSettings.monoDownmix ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

              </div>

              {/* Advanced Audio Enhancers: DRC Night Mode, Vocal Clarity & 3D Spatial Audio */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Studio Acoustic Processors & Dynamic Range Leveling
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  {/* Vocal Clarity */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-cyan-400" />
                        Dialogue Vocal Clarity
                      </span>
                      <button
                        onClick={handleVocalClarityToggle}
                        className={`text-xs px-2.5 py-0.5 rounded font-bold transition ${
                          audioSettings.vocalClarity
                            ? 'bg-emerald-500 text-black'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {audioSettings.vocalClarity ? 'ACTIVE' : 'OFF'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Boosts speech presence band (2.5kHz) and cuts muddy low sub-rumble.
                    </p>
                  </div>

                  {/* DRC / Night Mode */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 text-amber-400" />
                        DRC / Night Mode
                      </span>
                      <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase">
                        {audioSettings.drcMode}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Tames sudden explosion peaks while leveling quiet whispered dialogue.
                    </p>
                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {(['off', 'gentle', 'cinema', 'night'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => handleDrcModeSelect(d)}
                          className={`py-1 text-[10px] font-semibold rounded border uppercase transition ${
                            audioSettings.drcMode === d
                              ? 'bg-cyan-500 text-black border-cyan-400'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Spatial 3D Virtual Surround */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Headphones className="w-3.5 h-3.5 text-purple-400" />
                        3D Spatial Acoustic
                      </span>
                      <span className="text-[11px] font-mono text-purple-400 font-bold uppercase">
                        {audioSettings.spatialAudio}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Virtualizes cinema soundstage expansion using synthetic impulse convolution.
                    </p>
                    <div className="grid grid-cols-4 gap-1 pt-1">
                      {(['off', 'subtle', 'wide', 'cinema'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => handleSpatialModeSelect(s)}
                          className={`py-1 text-[10px] font-semibold rounded border uppercase transition ${
                            audioSettings.spatialAudio === s
                              ? 'bg-purple-500 text-black border-purple-400 font-bold'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Dedicated Bass & Treble Knobs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">Dedicated Deep Bass Gain</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {audioSettings.bassGain > 0 ? `+${audioSettings.bassGain}` : audioSettings.bassGain} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={audioSettings.bassGain}
                      onChange={(e) => handleBassGainChange(parseInt(e.target.value))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">Dedicated Air Treble Gain</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {audioSettings.trebleGain > 0 ? `+${audioSettings.trebleGain}` : audioSettings.trebleGain} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={audioSettings.trebleGain}
                      onChange={(e) => handleTrebleGainChange(parseInt(e.target.value))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

              </div>

              {/* Audio Output Device & Pitch Lock */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Audio Output Device */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                    Audio Output Device
                  </span>
                  <select
                    value={audioSettings.audioDeviceId || ''}
                    onChange={(e) => handleAudioDeviceChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="">System Default Audio Output</option>
                    {audioDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Audio Device (${d.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lip Sync Delay & Pitch Lock */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      Lip-Sync Delay
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {(audioSettings.audioDelay || 0).toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.05"
                    value={audioSettings.audioDelay || 0}
                    onChange={(e) => handleDelayChange(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>0.0s</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={audioSettings.preservesPitch}
                        onChange={(e) => setAudioSettings(prev => ({ ...prev, preservesPitch: e.target.checked }))}
                        className="rounded accent-cyan-400"
                      />
                      <span>Lock Natural Pitch on Speed Change</span>
                    </label>
                  </div>
                </div>

              </div>

              {/* 10-Band Graphic Equalizer */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-semibold text-white">10-Band Graphic Equalizer</span>
                    <span className="ml-2 text-xs text-cyan-400 font-mono">(-12dB to +12dB)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetAudio}
                      className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Audio Engine
                    </button>
                  </div>
                </div>

                {/* EQ Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(EQ_PRESETS).map((pName) => (
                    <button
                      key={pName}
                      onClick={() => handlePresetSelect(pName)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition ${
                        audioSettings.eqPreset === pName
                          ? 'bg-cyan-500 text-black font-semibold border-cyan-400 shadow-sm shadow-cyan-500/30'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {pName}
                    </button>
                  ))}
                </div>

                {/* Sliders Grid */}
                <div className="grid grid-cols-10 gap-1.5 items-end pt-3 pb-1 px-1">
                  {EQ_FREQUENCIES.map((freq, idx) => {
                    const gain = audioSettings.eqBands[idx] || 0;
                    const freqLabel = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                    return (
                      <div key={freq} className="flex flex-col items-center gap-2 group w-full">
                        <span className="text-[10px] font-mono font-medium text-slate-400 group-hover:text-cyan-400">
                          {gain > 0 ? `+${gain}` : gain}dB
                        </span>
                        <div className="h-32 w-full flex items-center justify-center relative overflow-visible">
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="1"
                            value={gain}
                            onChange={(e) => handleBandChange(idx, parseInt(e.target.value))}
                            className="accent-cyan-400 w-28 h-2 bg-slate-700 rounded-lg cursor-pointer -rotate-90 origin-center"
                            style={{ margin: 'auto' }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-slate-300 group-hover:text-white">
                          {freqLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* 2. VIDEO TAB */}
          {/* ========================================================= */}
          {activeTab === 'video' && (
            <div className="space-y-6">
              
              {/* Picture Presets */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Cinematic Color Profiles & Picture Presets
                  </span>
                  <button
                    onClick={handleResetVideo}
                    className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Picture
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {[
                    { id: 'normal', label: 'Standard', desc: 'Neutral studio grade' },
                    { id: 'cinema', label: 'Cinema Film', desc: 'Warm organic contrast' },
                    { id: 'vivid', label: 'Vivid Dynamic', desc: 'Punchy saturated' },
                    { id: 'hdr', label: 'Simulated HDR', desc: 'High dynamic tone' },
                    { id: 'anime', label: 'Anime Crisp', desc: 'Sharp edges & colors' },
                    { id: 'night', label: 'Night Eye-Care', desc: 'Warm blue-light cut' },
                    { id: 'noir', label: 'Classic Noir', desc: 'Black & white movie' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPicturePreset(p.id as PicturePreset)}
                      className={`p-2.5 rounded-xl border text-left flex flex-col transition ${
                        videoSettings.picturePreset === p.id
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-800/80 border-slate-700/70 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{p.label}</span>
                      <span className="text-[10px] text-slate-400 truncate">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Grading Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Sliders Left Column */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                  <span className="text-xs font-semibold text-white">Tone & Exposure</span>
                  
                  {/* Brightness */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Brightness</span>
                      <span className="font-mono text-cyan-400">{videoSettings.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      step="2"
                      value={videoSettings.brightness}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, picturePreset: 'custom', brightness: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Contrast</span>
                      <span className="font-mono text-cyan-400">{videoSettings.contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      step="2"
                      value={videoSettings.contrast}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, picturePreset: 'custom', contrast: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Gamma Correction */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Gamma Midtone Curve</span>
                      <span className="font-mono text-cyan-400">{videoSettings.gamma.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={videoSettings.gamma}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, picturePreset: 'custom', gamma: parseFloat(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Sliders Right Column */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                  <span className="text-xs font-semibold text-white">Chrominance & Detail</span>
                  
                  {/* Saturation */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Saturation (Color Vibrance)</span>
                      <span className="font-mono text-cyan-400">{videoSettings.saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="5"
                      value={videoSettings.saturation}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, picturePreset: 'custom', saturation: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Hue Rotate */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Hue Angle</span>
                      <span className="font-mono text-cyan-400">{videoSettings.hue}&deg;</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={videoSettings.hue}
                      onChange={(e) => setVideoSettings(prev => ({ ...prev, picturePreset: 'custom', hue: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Hardware Edge Sharpness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Hardware Convolution Sharpness</span>
                      <span className="font-mono text-cyan-400 uppercase font-semibold">{videoSettings.sharpness}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['off', 'subtle', 'medium', 'high'] as VideoSharpness[]).map(sh => (
                        <button
                          key={sh}
                          onClick={() => setVideoSettings(prev => ({ ...prev, picturePreset: 'custom', sharpness: sh }))}
                          className={`py-1 text-xs font-medium rounded border uppercase transition ${
                            videoSettings.sharpness === sh
                              ? 'bg-cyan-500 text-black border-cyan-400 font-bold'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {sh}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Geometry: Rotation, Flip, Zoom & Pan */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-cyan-400" />
                    Video Geometry, Orientation & Zoom
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Rotation: {videoSettings.rotation}&deg; | Zoom: {videoSettings.zoom}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Rotation Buttons */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Orientation</span>
                      <span className="text-[11px] text-slate-400">Current: {videoSettings.rotation}&deg;</span>
                    </div>
                    <button
                      onClick={handleRotate}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-semibold text-xs transition"
                    >
                      Rotate +90&deg;
                    </button>
                  </div>

                  {/* Mirror Flip Horizontal */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Mirror Flip H</span>
                      <span className="text-[11px] text-slate-400">Horizontal reflection</span>
                    </div>
                    <button
                      onClick={() => setVideoSettings(prev => ({ ...prev, flipHorizontal: !prev.flipHorizontal }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        videoSettings.flipHorizontal
                          ? 'bg-cyan-500 text-black border-cyan-400'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {videoSettings.flipHorizontal ? 'FLIPPED' : 'OFF'}
                    </button>
                  </div>

                  {/* Zoom Slider */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-white">Video Zoom</span>
                      <span className="font-mono text-cyan-400 font-bold">{videoSettings.zoom}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="50"
                        max="300"
                        step="5"
                        value={videoSettings.zoom}
                        onChange={(e) => setVideoSettings(prev => ({ ...prev, zoom: parseInt(e.target.value) }))}
                        className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded cursor-pointer"
                      />
                      <button
                        onClick={() => setVideoSettings(prev => ({ ...prev, zoom: 100, panX: 0, panY: 0 }))}
                        className="text-[10px] text-slate-400 hover:text-cyan-300 underline"
                      >
                        100%
                      </button>
                    </div>
                  </div>

                </div>

              </div>

              {/* Display Aspect Ratio */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  Aspect Ratio Scaling
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {aspectRatios.map(ar => (
                    <button
                      key={ar.id}
                      onClick={() => setVideoSettings(prev => ({ ...prev, aspectRatio: ar.id }))}
                      className={`p-2.5 rounded-xl border text-left flex flex-col transition ${
                        videoSettings.aspectRatio === ar.id
                          ? 'bg-cyan-500 text-black font-semibold border-cyan-400 shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold">{ar.label}</span>
                      <span className={`text-[10px] truncate ${videoSettings.aspectRatio === ar.id ? 'text-black/70' : 'text-slate-400'}`}>
                        {ar.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* 3. PLAYBACK & A-B LOOP TAB */}
          {/* ========================================================= */}
          {activeTab === 'playback' && (
            <div className="space-y-6">
              
              {/* Playback Speed */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-xs font-semibold text-white">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    Playback Rate
                  </span>
                  <span className="text-cyan-400 font-mono font-bold text-sm">{videoSettings.playbackRate}x</span>
                </div>
                
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.05"
                  value={videoSettings.playbackRate}
                  onChange={(e) => setVideoSettings(prev => ({ ...prev, playbackRate: parseFloat(e.target.value) }))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {speedPresets.map(speed => (
                    <button
                      key={speed}
                      onClick={() => setVideoSettings(prev => ({ ...prev, playbackRate: speed }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                        videoSettings.playbackRate === speed
                          ? 'bg-cyan-500 text-black font-semibold border-cyan-400 shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* A-B Segment Repeat Looper */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <Repeat className="w-3.5 h-3.5 text-cyan-400" />
                    A-B Segment Repeat Looper
                  </span>
                  {abLoop.enabled && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                      LOOPING ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Select a section of the video between Point A and Point B to loop continuously.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Point A */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white">Point A (Start)</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {abLoop.start !== null ? formatTime(abLoop.start) : '--:--'}
                      </span>
                    </div>
                    <button
                      onClick={handleSetPointA}
                      className="w-full py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition"
                    >
                      Set A to Current ({formatTime(currentTime)})
                    </button>
                  </div>

                  {/* Point B */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white">Point B (End)</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {abLoop.end !== null ? formatTime(abLoop.end) : '--:--'}
                      </span>
                    </div>
                    <button
                      onClick={handleSetPointB}
                      className="w-full py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition"
                    >
                      Set B to Current ({formatTime(currentTime)})
                    </button>
                  </div>

                  {/* Clear / Status */}
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700 flex flex-col justify-between">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white">Loop Duration</span>
                      <span className="font-mono text-slate-300">
                        {abLoop.start !== null && abLoop.end !== null ? `${(abLoop.end - abLoop.start).toFixed(1)}s` : '--'}
                      </span>
                    </div>
                    <button
                      onClick={handleClearLoop}
                      className="w-full py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition"
                    >
                      Clear A-B Loop
                    </button>
                  </div>

                </div>
              </div>

              {/* Frame-by-Frame Stepper */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    Frame-by-Frame Precision Stepper
                  </span>
                  <span className="font-mono text-xs text-cyan-400">
                    Exact Timecode: {currentTime.toFixed(3)}s
                  </span>
                </div>
                <div className="flex items-center justify-center gap-4 py-2">
                  <button
                    onClick={() => onStepFrame(-1)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition"
                  >
                    &larr; Step -1 Frame (-0.033s)
                  </button>
                  <div className="px-5 py-2 rounded-xl bg-black border border-cyan-500/30 text-cyan-300 font-mono text-sm font-bold">
                    {formatTime(currentTime)}.{Math.floor((currentTime % 1) * 1000).toString().padStart(3, '0')}
                  </div>
                  <button
                    onClick={() => onStepFrame(1)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition"
                  >
                    Step +1 Frame (+0.033s) &rarr;
                  </button>
                </div>
              </div>

              {/* Professional Frame Snapshot Studio */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  Full-Resolution Frame Snapshot Studio
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-300 block">Export Format</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSnapshotFormat('png')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                          snapshotFormat === 'png'
                            ? 'bg-cyan-500 text-black border-cyan-400'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        PNG (Lossless Master)
                      </button>
                      <button
                        onClick={() => setSnapshotFormat('jpeg')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                          snapshotFormat === 'jpeg'
                            ? 'bg-cyan-500 text-black border-cyan-400'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        JPEG (High Quality)
                      </button>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={snapshotSubtitles}
                        onChange={(e) => setSnapshotSubtitles(e.target.checked)}
                        className="rounded accent-cyan-400"
                      />
                      <span>Burn active subtitles onto screenshot</span>
                    </label>
                  </div>

                  <div className="flex flex-col justify-end gap-2">
                    <button
                      onClick={() => {
                        onCaptureSnapshot({ format: snapshotFormat, includeSubtitles: snapshotSubtitles });
                        showToast('Snapshot downloaded');
                      }}
                      className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/20"
                    >
                      <Download className="w-4 h-4" />
                      Save Frame to File
                    </button>
                    <button
                      onClick={() => {
                        onCaptureSnapshot({ format: snapshotFormat, includeSubtitles: snapshotSubtitles, copyToClipboard: true });
                        showToast('Snapshot copied to clipboard');
                      }}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
                    >
                      <Copy className="w-4 h-4 text-cyan-400" />
                      Copy Image to Clipboard
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* 4. SUBTITLES & STYLE TAB */}
          {/* ========================================================= */}
          {activeTab === 'subtitles' && (
            <div className="space-y-6">
              
              {/* Track Selector & Upload */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <Subtitles className="w-3.5 h-3.5 text-cyan-400" />
                    Select Subtitle Track
                  </span>
                  <input
                    type="file"
                    ref={subFileInputRef}
                    accept=".srt,.vtt,.ass,.ssa"
                    onChange={handleSubtitleUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => subFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Load External SRT / VTT
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => onSelectSubtitleTrack(null)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                      activeSubtitleTrackId === null
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    None (Subtitles Off)
                  </button>
                  {subtitleTracks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => onSelectSubtitleTrack(t.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                        activeSubtitleTrackId === t.id
                          ? 'bg-cyan-500 text-black border-cyan-400 shadow-md shadow-cyan-500/30'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      <span>{t.label}</span>
                      {t.isEmbedded && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${activeSubtitleTrackId === t.id ? 'bg-black/30 text-black' : 'bg-cyan-500/20 text-cyan-300'}`}>
                          EMBEDDED
                        </span>
                      )}
                      {t.language && (
                        <span className={`text-[10px] px-1 rounded uppercase ${activeSubtitleTrackId === t.id ? 'bg-black/20 text-black' : 'bg-slate-700 text-slate-300'}`}>
                          {t.language}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtitle Sync Calibration */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    Subtitle Delay Synchronization
                  </span>
                  <span className="font-mono text-cyan-400 font-bold text-xs">
                    {subtitleStyle.offsetSeconds > 0 ? `+${subtitleStyle.offsetSeconds.toFixed(1)}s` : `${subtitleStyle.offsetSeconds.toFixed(1)}s`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: Math.round((prev.offsetSeconds - 0.5) * 10) / 10 }))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-mono"
                  >
                    -0.5s
                  </button>
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: Math.round((prev.offsetSeconds - 0.1) * 10) / 10 }))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-mono"
                  >
                    -0.1s
                  </button>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="0.1"
                    value={subtitleStyle.offsetSeconds}
                    onChange={(e) => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                  />
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: Math.round((prev.offsetSeconds + 0.1) * 10) / 10 }))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-mono"
                  >
                    +0.1s
                  </button>
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: Math.round((prev.offsetSeconds + 0.5) * 10) / 10 }))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-mono"
                  >
                    +0.5s
                  </button>
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: 0 }))}
                    className="text-xs text-slate-400 hover:text-cyan-400 underline whitespace-nowrap pl-2"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Typography & Visual Style */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                  <span className="text-xs font-semibold text-white">Font Family & Outline</span>
                  
                  {/* Font Family */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-400">Typeface</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['sans', 'serif', 'mono', 'trebuchet', 'impact'] as SubtitleFontFamily[]).map(f => (
                        <button
                          key={f}
                          onClick={() => setSubtitleStyle(prev => ({ ...prev, fontFamily: f }))}
                          className={`py-1.5 text-xs rounded-lg border capitalize transition ${
                            subtitleStyle.fontFamily === f
                              ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Outline / Stroke */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-400">Outline & Text Shadow</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['none', 'thin', 'medium', 'heavy'] as SubtitleTextOutline[]).map(o => (
                        <button
                          key={o}
                          onClick={() => setSubtitleStyle(prev => ({ ...prev, textOutline: o }))}
                          className={`py-1.5 text-xs rounded-lg border capitalize transition ${
                            subtitleStyle.textOutline === o
                              ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Font Size</span>
                      <span className="font-mono text-cyan-400">{subtitleStyle.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="48"
                      step="2"
                      value={subtitleStyle.fontSize}
                      onChange={(e) => setSubtitleStyle(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                  <span className="text-xs font-semibold text-white">Colors & Positioning</span>

                  {/* Text Color */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-400">Text Color</span>
                    <div className="flex gap-2">
                      {['#ffffff', '#facc15', '#38bdf8', '#4ade80', '#f472b6'].map(c => (
                        <button
                          key={c}
                          onClick={() => setSubtitleStyle(prev => ({ ...prev, color: c }))}
                          className={`w-7 h-7 rounded-full border-2 transition ${
                            subtitleStyle.color === c ? 'border-white scale-110 shadow-lg' : 'border-slate-700'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Background Opacity */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Box Background Opacity</span>
                      <span className="font-mono text-cyan-400">{Math.round(subtitleStyle.backgroundOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={subtitleStyle.backgroundOpacity}
                      onChange={(e) => setSubtitleStyle(prev => ({ ...prev, backgroundOpacity: parseFloat(e.target.value) }))}
                      className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Vertical Position */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-400">Screen Position</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['bottom', 'middle', 'top'] as const).map(pos => (
                        <button
                          key={pos}
                          onClick={() => setSubtitleStyle(prev => ({ ...prev, position: pos }))}
                          className={`py-1.5 text-xs rounded-lg border capitalize transition ${
                            subtitleStyle.position === pos
                              ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              {/* Subtitle Live Preview Box */}
              <div className="p-4 rounded-xl bg-black border border-slate-800 text-center space-y-1 shadow-inner relative overflow-hidden">
                <span className="absolute top-2 left-3 text-[10px] text-slate-500 font-mono uppercase">
                  Subtitle Typography Preview
                </span>
                <div className="pt-4 pb-2">
                  <span
                    style={{
                      fontSize: `${subtitleStyle.fontSize}px`,
                      color: subtitleStyle.color,
                      backgroundColor: `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})`,
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontFamily: subtitleStyle.fontFamily === 'serif' ? 'serif' : subtitleStyle.fontFamily === 'mono' ? 'monospace' : 'sans-serif',
                      textShadow: subtitleStyle.textOutline === 'heavy' ? '0 0 6px #000, 0 0 10px #000' : subtitleStyle.textOutline === 'medium' ? '0 0 4px #000' : 'none',
                    }}
                  >
                    The cinematic experience you’ve always wanted.
                  </span>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* 5. STATS FOR NERDS & SYSTEM PREFERENCES */}
          {/* ========================================================= */}
          {activeTab === 'stats' && (
            <div className="space-y-6">
              
              {/* Technical Diagnostics */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Real-time Video & Engine Diagnostics
                  </span>
                  <label className="flex items-center gap-2 text-xs text-cyan-300 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.showStatsForNerds}
                      onChange={(e) => setPreferences(prev => ({ ...prev, showStatsForNerds: e.target.checked }))}
                      className="rounded accent-cyan-400"
                    />
                    <span>Show On-Screen Stats HUD</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
                    <span className="text-slate-400 block text-[11px]">Native Resolution</span>
                    <span className="text-white font-mono font-bold">{resolution || 'Detecting...'}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
                    <span className="text-slate-400 block text-[11px]">Audio Engine Sample Rate</span>
                    <span className="text-cyan-400 font-mono font-bold">
                      {globalAudioEngine.getAudioStats().sampleRate} Hz
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
                    <span className="text-slate-400 block text-[11px]">Audio Channels</span>
                    <span className="text-white font-mono font-bold">
                      {audioSettings.monoDownmix ? '1.0 Mono (Downmixed)' : '2.0 Stereo Master'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
                    <span className="text-slate-400 block text-[11px]">Hardware Acceleration</span>
                    <span className="text-emerald-400 font-mono font-bold">GPU Active</span>
                  </div>
                </div>
              </div>

              {/* General Behavior Preferences */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5 text-cyan-400" />
                  Player Behavior & UI Preferences
                </span>

                <div className="space-y-3">
                  {/* Auto-Resume */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/60 cursor-pointer hover:bg-slate-800/50 transition">
                    <div>
                      <span className="text-xs font-bold text-white block">Smart Resume Playback</span>
                      <span className="text-[11px] text-slate-400">Remember last watched timestamp for each video file</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoResume}
                      onChange={(e) => setPreferences(prev => ({ ...prev, autoResume: e.target.checked }))}
                      className="rounded accent-cyan-400 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  {/* Auto-Play Next */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/60 cursor-pointer hover:bg-slate-800/50 transition">
                    <div>
                      <span className="text-xs font-bold text-white block">Auto-Play Next in Playlist</span>
                      <span className="text-[11px] text-slate-400">Automatically proceed to next video when playback finishes</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.autoPlayNext}
                      onChange={(e) => setPreferences(prev => ({ ...prev, autoPlayNext: e.target.checked }))}
                      className="rounded accent-cyan-400 w-4 h-4 cursor-pointer"
                    />
                  </label>

                  {/* Auto-Hide Timeout */}
                  <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Controls Inactivity Auto-Hide</span>
                      <span className="text-[11px] text-slate-400">How quickly on-screen controls fade out when playing</span>
                    </div>
                    <select
                      value={preferences.autoHideDelay}
                      onChange={(e) => setPreferences(prev => ({ ...prev, autoHideDelay: parseInt(e.target.value) }))}
                      className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-400"
                    >
                      <option value={1500}>1.5 seconds</option>
                      <option value={2500}>2.5 seconds (Default)</option>
                      <option value={4000}>4.0 seconds</option>
                      <option value={0}>Never Auto-Hide</option>
                    </select>
                  </div>
                </div>

                {/* Factory Reset All */}
                <div className="pt-3 border-t border-slate-800 flex justify-end">
                  <button
                    onClick={() => {
                      handleResetAudio();
                      handleResetVideo();
                      showToast('All settings restored to factory defaults');
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Factory Reset All Player Settings
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            All audio & video adjustments apply in real-time
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition shadow-lg shadow-cyan-500/20"
          >
            Done & Apply
          </button>
        </div>

      </div>
    </div>
  );
};
