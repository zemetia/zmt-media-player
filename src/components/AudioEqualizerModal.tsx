import React, { useEffect, useRef } from 'react';
import { Volume2, VolumeX, Sliders, Zap, RotateCcw, X, Radio, Clock, Mic, Headphones } from 'lucide-react';
import { AudioSettings } from '../types';
import { EQ_FREQUENCIES, EQ_PRESETS, globalAudioEngine } from '../utils/audioEngine';

interface AudioEqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioSettings: AudioSettings;
  setAudioSettings: React.Dispatch<React.SetStateAction<AudioSettings>>;
}

export const AudioEqualizerModal: React.FC<AudioEqualizerModalProps> = ({
  isOpen,
  onClose,
  audioSettings,
  setAudioSettings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Audio visualizer loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = 64;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      globalAudioEngine.getVisualizerData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background subtle gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, 'rgba(10, 15, 29, 0.9)');
      bgGrad.addColorStop(1, 'rgba(6, 10, 19, 0.95)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw frequency spectrum bars
      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (canvas.height - 10);

        // Neon cyan-purple gradient
        const barGrad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        barGrad.addColorStop(0, '#06b6d4'); // cyan
        barGrad.addColorStop(0.6, '#3b82f6'); // blue
        barGrad.addColorStop(1, '#a855f7'); // purple

        ctx.fillStyle = barGrad;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(6, 182, 212, 0.5)';
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        ctx.shadowBlur = 0;

        x += barWidth;
        if (x > canvas.width) break;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

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

  const handleReset = () => {
    handlePresetSelect('Flat');
    setAudioSettings(prev => ({
      ...prev,
      boost: 1.0,
      balance: 0,
      audioDelay: 0,
      eqPreset: 'Flat',
    }));
    globalAudioEngine.setBoost(1.0);
    globalAudioEngine.setBalance(0);
    globalAudioEngine.setAudioDelay(0);
  };

  const handleBoostChange = (boost: number) => {
    setAudioSettings(prev => ({ ...prev, boost }));
    globalAudioEngine.setBoost(boost);
  };

  const handleBalanceChange = (balance: number) => {
    setAudioSettings(prev => ({ ...prev, balance }));
    globalAudioEngine.setBalance(balance);
  };

  const handleDelayChange = (delay: number) => {
    const safeDelay = Math.round(delay * 20) / 20; // 0.05s precision
    setAudioSettings(prev => ({ ...prev, audioDelay: safeDelay }));
    globalAudioEngine.setAudioDelay(safeDelay);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#111726] border border-cyan-500/30 w-full max-w-2xl rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Audio Processing & 10-Band Equalizer
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  DSP Studio
                </span>
              </h2>
              <p className="text-xs text-slate-400">Studio audio processor with up to 300% volume amplification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* Visualizer Canvas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                Live Frequency Spectrum Visualizer
              </span>
              <span className="text-cyan-400 font-mono">60 FPS Hardware DSP</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-800 relative shadow-inner">
              <canvas
                ref={canvasRef}
                width={580}
                height={90}
                className="w-full h-[90px] block"
              />
            </div>
          </div>

          {/* Quick Boost & Balance Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 300% Volume Booster */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${audioSettings.boost > 1.0 ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />
                  Extra Volume Boost
                </span>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  audioSettings.boost > 1.5 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-slate-800 text-cyan-400'
                }`}>
                  {Math.round(audioSettings.boost * 100)}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Amplifies faint audio dialogues beyond 100% threshold</p>
              
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">100%</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={audioSettings.boost}
                  onChange={(e) => handleBoostChange(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
                <span className="text-xs text-amber-400 font-semibold">300%</span>
              </div>

              {/* Quick boost shortcuts */}
              <div className="flex gap-2 mt-3">
                {[1.0, 1.5, 2.0, 2.5, 3.0].map((b) => (
                  <button
                    key={b}
                    onClick={() => handleBoostChange(b)}
                    className={`flex-1 py-1 text-xs font-medium rounded-lg border transition ${
                      Math.abs(audioSettings.boost - b) < 0.05
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white'
                    }`}
                  >
                    {Math.round(b * 100)}%
                  </button>
                ))}
              </div>
            </div>

            {/* Stereo Panning / Balance */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  Stereo Balance (Pan)
                </span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {audioSettings.balance === 0 ? 'Center' : audioSettings.balance < 0 ? `L ${Math.abs(Math.round(audioSettings.balance * 100))}%` : `R ${Math.round(audioSettings.balance * 100)}%`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Distribute sound between left and right audio channels</p>
              
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

              <div className="flex justify-center mt-3">
                <button
                  onClick={() => handleBalanceChange(0)}
                  className="text-xs text-slate-400 hover:text-cyan-300 underline underline-offset-2"
                >
                  Reset to Center
                </button>
              </div>
            </div>

          </div>

          {/* Audio-Video Delay Sync */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Audio-Video Sync Delay (Bluetooth / Lip-Sync Correction)
              </span>
              <span className="text-xs font-mono font-bold text-cyan-300">
                {(audioSettings.audioDelay || 0).toFixed(2)}s
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Delays audio if video frames appear ahead of the dialogue (0.00s to 2.00s)
            </p>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs text-slate-500 font-mono">0.0s</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={audioSettings.audioDelay || 0}
                onChange={(e) => handleDelayChange(parseFloat(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
              <span className="text-xs text-slate-400 font-mono">2.0s</span>
            </div>
          </div>

          {/* Equalizer Presets */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-semibold text-white">Equalizer Presets</span>
              <span className="text-xs text-slate-400">Current: <span className="text-cyan-400 font-medium">{audioSettings.eqPreset}</span></span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(EQ_PRESETS).map((pName) => (
                <button
                  key={pName}
                  onClick={() => handlePresetSelect(pName)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                    audioSettings.eqPreset === pName
                      ? 'bg-cyan-500 text-black font-semibold border-cyan-400 shadow-md shadow-cyan-500/30'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {pName}
                </button>
              ))}
            </div>
          </div>

          {/* 10-Band Graphic Equalizer */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">10-Band Graphic Equalizer (-12dB to +12dB)</span>
              <button
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Equalizer
              </button>
            </div>

            <div className="grid grid-cols-10 gap-1.5 items-end pt-4 pb-2 px-1">
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

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">Settings auto-apply in real-time</span>
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
