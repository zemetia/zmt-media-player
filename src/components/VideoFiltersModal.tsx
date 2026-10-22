import React from 'react';
import {
  SlidersHorizontal,
  Gauge,
  Maximize2,
  Camera,
  RotateCcw,
  X,
  Repeat,
  Sparkles
} from 'lucide-react';
import { VideoSettings } from '../types';

interface VideoFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoSettings: VideoSettings;
  setVideoSettings: React.Dispatch<React.SetStateAction<VideoSettings>>;
  onCaptureSnapshot: () => void;
}

export const VideoFiltersModal: React.FC<VideoFiltersModalProps> = ({
  isOpen,
  onClose,
  videoSettings,
  setVideoSettings,
  onCaptureSnapshot,
}) => {
  if (!isOpen) return null;

  const handleResetFilters = () => {
    setVideoSettings(prev => ({
      ...prev,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      playbackRate: 1.0,
      aspectRatio: 'fit',
    }));
  };

  const speedPresets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  const aspectRatios: Array<{ id: VideoSettings['aspectRatio']; label: string }> = [
    { id: 'fit', label: 'Fit Original' },
    { id: '16:9', label: '16:9 Wide' },
    { id: '4:3', label: '4:3 Classic' },
    { id: '21:9', label: '21:9 Cinema' },
    { id: 'fill', label: 'Stretch Fill' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#111726] border border-cyan-500/30 w-full max-w-xl rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Video Picture & Playback Controls
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  HD Enhancer
                </span>
              </h2>
              <p className="text-xs text-slate-400">Color grading, aspect ratio, playback speed & snapshots</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* Quick Actions (Snapshot & Loop) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                onCaptureSnapshot();
                onClose();
              }}
              className="p-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center gap-2 font-semibold text-xs transition"
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              Capture HD Frame Screenshot
            </button>

            <button
              onClick={() => setVideoSettings(prev => ({ ...prev, loop: !prev.loop }))}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-semibold text-xs transition ${
                videoSettings.loop
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Repeat className="w-4 h-4" />
              Loop Video: {videoSettings.loop ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              Display Aspect Ratio
            </span>
            <div className="grid grid-cols-5 gap-2">
              {aspectRatios.map(ar => (
                <button
                  key={ar.id}
                  onClick={() => setVideoSettings(prev => ({ ...prev, aspectRatio: ar.id }))}
                  className={`py-2 text-xs font-medium rounded-lg border transition ${
                    videoSettings.aspectRatio === ar.id
                      ? 'bg-cyan-500 text-black font-semibold border-cyan-400 shadow-sm shadow-cyan-500/20'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          {/* Playback Speed */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Playback Speed
              </span>
              <span className="text-cyan-400 font-mono font-bold">{videoSettings.playbackRate}x</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {speedPresets.map(speed => (
                <button
                  key={speed}
                  onClick={() => setVideoSettings(prev => ({ ...prev, playbackRate: speed }))}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition ${
                    videoSettings.playbackRate === speed
                      ? 'bg-cyan-500 text-black font-semibold border-cyan-400'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Video Visual Filters (CSS Filter Controls) */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Color Grading & Picture Enhancement
              </span>
              <button
                onClick={handleResetFilters}
                className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Picture
              </button>
            </div>

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
                onChange={(e) => setVideoSettings(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
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
                onChange={(e) => setVideoSettings(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

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
                onChange={(e) => setVideoSettings(prev => ({ ...prev, saturation: parseInt(e.target.value) }))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Hue Rotate */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Hue Rotate</span>
                <span className="font-mono text-cyan-400">{videoSettings.hue}&deg;</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={videoSettings.hue}
                onChange={(e) => setVideoSettings(prev => ({ ...prev, hue: parseInt(e.target.value) }))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">Accelerated GPU Shader Filters</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition shadow-lg shadow-cyan-500/20"
          >
            Apply & Close
          </button>
        </div>

      </div>
    </div>
  );
};
