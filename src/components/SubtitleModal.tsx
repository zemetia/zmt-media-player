import React, { useState, useRef } from 'react';
import {
  Subtitles,
  Upload,
  Clock,
  Palette,
  Search,
  Check,
  X,
  FileText,
  RotateCcw,
  Sparkles,
  Eye
} from 'lucide-react';
import { SubtitleTrack, SubtitleStyle } from '../types';
import { parseSubtitleFile, formatTime } from '../utils/subtitleParser';

interface SubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  onSelectTrack: (trackId: string | null) => void;
  onAddCustomTrack: (track: SubtitleTrack) => void;
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

export const SubtitleModal: React.FC<SubtitleModalProps> = ({
  isOpen,
  onClose,
  tracks,
  activeTrackId,
  onSelectTrack,
  onAddCustomTrack,
  subtitleStyle,
  setSubtitleStyle,
  currentTime,
  onSeek,
}) => {
  const [activeTab, setActiveTab] = useState<'tracks' | 'sync' | 'style' | 'transcript'>('tracks');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const activeTrack = tracks.find(t => t.id === activeTrackId);

  const handleOpenSubtitlePicker = async () => {
    if (window.electronAPI?.openSubtitleDialog) {
      try {
        const res = await window.electronAPI.openSubtitleDialog();
        if (res && res.content) {
          const cues = parseSubtitleFile(res.content, res.name);
          const newTrack: SubtitleTrack = {
            id: `custom-${Date.now()}`,
            label: res.name.replace(/\.[^/.]+$/, ''),
            language: 'custom',
            cues,
            isCustom: true,
          };
          onAddCustomTrack(newTrack);
          onSelectTrack(newTrack.id);
          return;
        }
      } catch (err) {
        console.error('Failed to open native subtitle dialog:', err);
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const cues = parseSubtitleFile(content, file.name);
        const newTrack: SubtitleTrack = {
          id: `custom-${Date.now()}`,
          label: file.name.replace(/\.[^/.]+$/, ''),
          language: 'custom',
          cues,
          isCustom: true,
        };
        onAddCustomTrack(newTrack);
        onSelectTrack(newTrack.id);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOffsetChange = (deltaSeconds: number) => {
    setSubtitleStyle(prev => ({
      ...prev,
      offsetSeconds: Math.round((prev.offsetSeconds + deltaSeconds) * 10) / 10,
    }));
  };

  const filteredCues = (activeTrack?.cues || []).filter(cue =>
    cue.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#111726] border border-cyan-500/30 w-full max-w-2xl rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Subtitles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Subtitle Manager
                {activeTrack && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {activeTrack.label}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">SRT, VTT, ASS subtitle engine with sync offset & transcript</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-6">
          <button
            onClick={() => setActiveTab('tracks')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'tracks'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Subtitles className="w-4 h-4" />
            Tracks ({tracks.length})
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'sync'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Sync Offset {subtitleStyle.offsetSeconds !== 0 && `(${subtitleStyle.offsetSeconds > 0 ? '+' : ''}${subtitleStyle.offsetSeconds}s)`}
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'style'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            Custom Styling
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'transcript'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Interactive Transcript
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          
          {/* TAB: TRACKS */}
          {activeTab === 'tracks' && (
            <div className="space-y-4">
              
              {/* Upload New Subtitle */}
              <div
                onClick={handleOpenSubtitlePicker}
                className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/70 bg-cyan-950/10 hover:bg-cyan-950/20 p-5 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition group"
              >
                <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition duration-200 mb-2">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-white">Load Custom Subtitle File</p>
                <p className="text-xs text-slate-400 mt-1">Supports .SRT, .VTT, and .ASS subtitle files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt,.vtt,.ass,.ssa,text/vtt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {/* Subtitle List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Available Tracks</span>
                
                {/* Off Option */}
                <div
                  onClick={() => onSelectTrack(null)}
                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                    activeTrackId === null
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-white shadow-sm shadow-cyan-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Subtitles Off</span>
                  </div>
                  {activeTrackId === null && <Check className="w-4 h-4 text-cyan-400" />}
                </div>

                {/* Track list */}
                {tracks.map((t) => {
                  const isSelected = activeTrackId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTrack(t.id)}
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/60 text-white shadow-sm shadow-cyan-500/20'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Subtitles className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{t.label}</p>
                            {t.isEmbedded && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                EMBEDDED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {t.cues.length} lines &bull; {t.language.toUpperCase()} {t.isCustom && '(Custom Upload)'} {t.isEmbedded && '(Bawaan Video)'}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* TAB: SYNC OFFSET */}
          {activeTab === 'sync' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <span className="text-xs text-slate-400 block mb-1">Current Subtitle Shift</span>
                <span className={`text-3xl font-mono font-bold ${
                  subtitleStyle.offsetSeconds === 0 ? 'text-slate-300' : 'text-cyan-400'
                }`}>
                  {subtitleStyle.offsetSeconds > 0 ? `+${subtitleStyle.offsetSeconds.toFixed(1)}` : subtitleStyle.offsetSeconds.toFixed(1)}s
                </span>
                <p className="text-xs text-slate-500 mt-2">
                  Positive values delay subtitles; negative values advance them earlier.
                </p>
              </div>

              {/* Step adjustments */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-semibold block text-center">Advance (Earlier)</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOffsetChange(-1.0)}
                      className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                    >
                      -1.0s
                    </button>
                    <button
                      onClick={() => handleOffsetChange(-0.5)}
                      className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                    >
                      -0.5s
                    </button>
                    <button
                      onClick={() => handleOffsetChange(-0.1)}
                      className="flex-1 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-500/30"
                    >
                      -0.1s
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-semibold block text-center">Delay (Later)</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOffsetChange(0.1)}
                      className="flex-1 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-500/30"
                    >
                      +0.1s
                    </button>
                    <button
                      onClick={() => handleOffsetChange(0.5)}
                      className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                    >
                      +0.5s
                    </button>
                    <button
                      onClick={() => handleOffsetChange(1.0)}
                      className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                    >
                      +1.0s
                    </button>
                  </div>
                </div>
              </div>

              {/* Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>-10.0s (Fast)</span>
                  <span>0s (Sync)</span>
                  <span>+10.0s (Slow)</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  value={subtitleStyle.offsetSeconds}
                  onChange={(e) => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: parseFloat(e.target.value) }))}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetSeconds: 0 }))}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 py-1 px-3 rounded-lg hover:bg-slate-800 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Offset to 0.0s
                </button>
              </div>

            </div>
          )}

          {/* TAB: STYLE */}
          {activeTab === 'style' && (
            <div className="space-y-5">
              
              {/* Preview Box */}
              <div className="p-6 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center min-h-[90px] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/10 via-purple-900/10 to-cyan-900/10 pointer-events-none" />
                <div
                  style={{
                    fontSize: `${subtitleStyle.fontSize}px`,
                    color: subtitleStyle.color,
                    backgroundColor: subtitleStyle.backgroundColor === 'transparent'
                      ? 'transparent'
                      : `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})`,
                    textShadow: subtitleStyle.textShadow ? '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000' : 'none',
                  }}
                  className="px-4 py-1.5 rounded text-center font-medium max-w-[90%] leading-snug whitespace-pre-line"
                >
                  Sample Subtitle Preview — HD Video Subtitle{'\n'}Line 2: Dual-speaker dialogue
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Font Size</span>
                  <span className="text-cyan-400">{subtitleStyle.fontSize}px</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Small', size: 18 },
                    { label: 'Medium', size: 24 },
                    { label: 'Large', size: 30 },
                    { label: 'Extra', size: 38 },
                  ].map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, fontSize: s.size }))}
                      className={`py-2 text-xs font-medium rounded-lg border transition ${
                        subtitleStyle.fontSize === s.size
                          ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      {s.label} ({s.size}px)
                    </button>
                  ))}
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">Text Color</span>
                  <div className="flex gap-2">
                    {[
                      { name: 'White', color: '#ffffff' },
                      { name: 'Yellow', color: '#fef08a' },
                      { name: 'Cyan', color: '#67e8f9' },
                      { name: 'Green', color: '#86efac' },
                    ].map((c) => (
                      <button
                        key={c.color}
                        onClick={() => setSubtitleStyle(prev => ({ ...prev, color: c.color }))}
                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition ${
                          subtitleStyle.color === c.color ? 'border-cyan-400 scale-110 shadow-lg' : 'border-slate-700'
                        }`}
                        style={{ backgroundColor: c.color }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">Position</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, position: 'bottom' }))}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${
                        subtitleStyle.position === 'bottom'
                          ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      Bottom
                    </button>
                    <button
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, position: 'top' }))}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${
                        subtitleStyle.position === 'top'
                          ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      Top
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Padding / Offset Y */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                  <span>Jarak Bawah / Bottom Padding (Offset Y)</span>
                  <span className="text-cyan-400 font-mono">+{subtitleStyle.offsetY || 0}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="2"
                  value={subtitleStyle.offsetY || 0}
                  onChange={(e) => setSubtitleStyle(prev => ({ ...prev, offsetY: parseInt(e.target.value, 10) }))}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex gap-1.5 pt-0.5">
                  {[
                    { label: '0px', val: 0 },
                    { label: 'Standar (20px)', val: 20 },
                    { label: 'Tinggi (40px)', val: 40 },
                    { label: 'Ekstra (70px)', val: 70 },
                  ].map(p => (
                    <button
                      key={p.val}
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, offsetY: p.val }))}
                      className={`flex-1 py-1 text-[10px] rounded border transition ${
                        (subtitleStyle.offsetY || 0) === p.val
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-semibold'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  Memberikan ruang/jarak ekstra di bagian bawah layar agar subtitle tidak bertabrakan dengan subtitle atas/bawah atau timeline.
                </p>
              </div>

              {/* Text Shadow & Background Box Style */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">Text Outline / Shadow</span>
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, textShadow: !prev.textShadow }))}
                    className={`w-full py-2 text-xs font-medium rounded-lg border transition flex items-center justify-center gap-1.5 ${
                      subtitleStyle.textShadow
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Outline: {subtitleStyle.textShadow ? 'ENABLED' : 'OFF'}
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block">Background Box</span>
                  <button
                    onClick={() => setSubtitleStyle(prev => ({
                      ...prev,
                      backgroundColor: prev.backgroundColor === 'transparent' ? '#000000' : 'transparent',
                    }))}
                    className={`w-full py-2 text-xs font-medium rounded-lg border transition flex items-center justify-center gap-1.5 ${
                      subtitleStyle.backgroundColor !== 'transparent'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    Box: {subtitleStyle.backgroundColor !== 'transparent' ? 'DARK SHIELD' : 'TRANSPARENT'}
                  </button>
                </div>
              </div>

              {/* Background Opacity */}
              {subtitleStyle.backgroundColor !== 'transparent' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-300">
                    <span>Background Box Opacity</span>
                    <span className="text-cyan-400">{Math.round(subtitleStyle.backgroundOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={subtitleStyle.backgroundOpacity}
                    onChange={(e) => setSubtitleStyle(prev => ({ ...prev, backgroundOpacity: parseFloat(e.target.value) }))}
                    className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              )}

            </div>
          )}

          {/* TAB: TRANSCRIPT */}
          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {!activeTrack ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  Please select a subtitle track first to view its dialogue transcript.
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search subtitle lines & quotes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                    {filteredCues.map((cue) => {
                      const effectiveTime = currentTime + subtitleStyle.offsetSeconds;
                      const isCurrent = effectiveTime >= cue.startTime && effectiveTime <= cue.endTime;
                      return (
                        <div
                          key={cue.id}
                          onClick={() => {
                            onSeek(cue.startTime);
                          }}
                          className={`p-2.5 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition ${
                            isCurrent
                              ? 'bg-cyan-500/20 border-cyan-500/60 text-white shadow-sm shadow-cyan-500/20'
                              : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/70 hover:text-white'
                          }`}
                        >
                          <div className="flex-1">
                            {cue.position === 'top' && (
                              <span className="inline-block text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1 mr-1.5">
                                Atas / Sign
                              </span>
                            )}
                            <p className="text-xs font-medium leading-relaxed whitespace-pre-line">{cue.text}</p>
                          </div>
                          <span className={`text-[11px] font-mono whitespace-nowrap px-2 py-0.5 rounded ${
                            isCurrent ? 'bg-cyan-400 text-black font-bold' : 'bg-slate-800 text-slate-400 hover:bg-cyan-500/30 hover:text-cyan-300'
                          }`}>
                            {formatTime(cue.startTime)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 text-center">
                    Click any dialogue timestamp above to jump immediately to that scene
                  </p>
                </>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">Sync adjustments reflect immediately in video</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition shadow-lg shadow-cyan-500/20"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
