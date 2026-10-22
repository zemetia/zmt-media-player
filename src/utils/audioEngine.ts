import { DrcPresetMode, SpatialAudioMode } from '../types';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [8, 7, 5, 2, 0, 0, 0, 0, 0, 0],
  'Cinema / Movie': [5, 4, 1, -1, 0, 2, 4, 3, 2, 1],
  'Vocal Booster': [-3, -2, -1, 2, 4, 5, 4, 2, 0, -1],
  'Rock': [5, 4, 2, -1, -2, 1, 3, 4, 5, 5],
  'Pop': [-1, 1, 3, 4, 4, 2, -1, 1, 3, 4],
  'Electronic': [6, 5, 2, 0, -2, 2, 1, 3, 5, 5],
  'Night Mode': [-6, -4, -2, 1, 3, 4, 3, 1, -2, -4],
  'Acoustic': [4, 3, 1, 1, 2, 2, 3, 3, 4, 3],
  'Classical': [5, 4, 3, 2, -1, -1, 0, 2, 4, 4],
};

// Global WeakMap to guarantee createMediaElementSource is never called twice on the same media element
const elementSourceMap = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  // Audio Nodes
  private filters: BiquadFilterNode[] = [];
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private vocalFilter: BiquadFilterNode | null = null;
  private vocalRumbleCut: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  
  // Spatial Audio & Reverb
  private spatialConvolver: ConvolverNode | null = null;
  private spatialDryGain: GainNode | null = null;
  private spatialWetGain: GainNode | null = null;

  // Mono Downmixing
  private monoSplitter: ChannelSplitterNode | null = null;
  private monoMerger: ChannelMergerNode | null = null;
  private monoPassGain: GainNode | null = null;
  private monoMixGain: GainNode | null = null;

  private pannerNode: StereoPannerNode | null = null;
  private gainNode: GainNode | null = null;
  private boostNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private attachedElement: HTMLMediaElement | null = null;

  // Cached state to restore upon initialization
  private cachedVolume = 0.85;
  private cachedMuted = false;
  private cachedBoost = 1.0;
  private cachedBalance = 0;
  private cachedDelay = 0;
  private cachedGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private cachedBassGain = 0;
  private cachedTrebleGain = 0;
  private cachedVocalClarity = false;
  private cachedDrcMode: DrcPresetMode = 'off';
  private cachedSpatialMode: SpatialAudioMode = 'off';
  private cachedMonoDownmix = false;

  public init(mediaElement: HTMLMediaElement): boolean {
    if (this.attachedElement === mediaElement && this.ctx && this.source) {
      return true;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) {
        return false;
      }

      if (!this.ctx) {
        this.ctx = new AudioCtxClass();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      // Check if node already created for this element
      if (elementSourceMap.has(mediaElement)) {
        this.source = elementSourceMap.get(mediaElement)!;
      } else {
        this.source = this.ctx.createMediaElementSource(mediaElement);
        elementSourceMap.set(mediaElement, this.source);
      }
      this.attachedElement = mediaElement;

      // Master Gain, Boost & Analyser
      this.gainNode = this.ctx.createGain();
      this.boostNode = this.ctx.createGain();
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Delay node for lip-sync correction
      if (typeof this.ctx.createDelay === 'function') {
        this.delayNode = this.ctx.createDelay(3.0);
        this.delayNode.delayTime.setValueAtTime(this.cachedDelay, this.ctx.currentTime);
      } else {
        this.delayNode = null;
      }

      // Stereo panner
      if (typeof this.ctx.createStereoPanner === 'function') {
        this.pannerNode = this.ctx.createStereoPanner();
      } else {
        this.pannerNode = null;
      }

      // 10-band Graphic Equalizer filters
      this.filters = EQ_FREQUENCIES.map((freq, index) => {
        const filter = this.ctx!.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = this.cachedGains[index] || 0;
        return filter;
      });

      // Dedicated Bass & Treble Shelving Filters
      this.bassFilter = this.ctx.createBiquadFilter();
      this.bassFilter.type = 'lowshelf';
      this.bassFilter.frequency.value = 150;
      this.bassFilter.gain.value = this.cachedBassGain;

      this.trebleFilter = this.ctx.createBiquadFilter();
      this.trebleFilter.type = 'highshelf';
      this.trebleFilter.frequency.value = 6000;
      this.trebleFilter.gain.value = this.cachedTrebleGain;

      // Vocal Clarity Peaking Filter & Highpass Rumble Cut
      this.vocalFilter = this.ctx.createBiquadFilter();
      this.vocalFilter.type = 'peaking';
      this.vocalFilter.frequency.value = 2500;
      this.vocalFilter.Q.value = 1.3;
      this.vocalFilter.gain.value = this.cachedVocalClarity ? 5.5 : 0;

      this.vocalRumbleCut = this.ctx.createBiquadFilter();
      this.vocalRumbleCut.type = 'highpass';
      this.vocalRumbleCut.frequency.value = this.cachedVocalClarity ? 85 : 10;

      // Dynamics Compressor (DRC / Night Mode / Dialogue Leveler)
      this.compressorNode = this.ctx.createDynamicsCompressor();
      this.applyDrcSettings(this.cachedDrcMode);

      // Spatial Audio Convolver & Dry/Wet Mixers
      this.spatialDryGain = this.ctx.createGain();
      this.spatialWetGain = this.ctx.createGain();
      this.spatialConvolver = this.ctx.createConvolver();
      this.updateSpatialImpulse(this.cachedSpatialMode);

      // Connect Chain:
      // Source -> 10-band EQ -> Bass Filter -> Treble Filter -> Vocal Clarity -> Vocal Rumble Cut -> Delay -> Compressor
      let currentChain: AudioNode = this.source;
      for (const filter of this.filters) {
        currentChain.connect(filter);
        currentChain = filter;
      }
      currentChain.connect(this.bassFilter);
      this.bassFilter.connect(this.trebleFilter);
      this.trebleFilter.connect(this.vocalFilter);
      this.vocalFilter.connect(this.vocalRumbleCut);

      let postEChain: AudioNode = this.vocalRumbleCut;
      if (this.delayNode) {
        postEChain.connect(this.delayNode);
        postEChain = this.delayNode;
      }
      postEChain.connect(this.compressorNode);

      // Spatial Audio Routing: Compressor splits to Dry & Wet (Convolver) -> Recombines to Spatial Mixer
      const spatialMixer = this.ctx.createGain();
      this.compressorNode.connect(this.spatialDryGain);
      this.spatialDryGain.connect(spatialMixer);

      this.compressorNode.connect(this.spatialConvolver);
      this.spatialConvolver.connect(this.spatialWetGain);
      this.spatialWetGain.connect(spatialMixer);

      // Mono / Panner routing:
      let preMasterNode: AudioNode = spatialMixer;
      if (this.pannerNode) {
        spatialMixer.connect(this.pannerNode);
        preMasterNode = this.pannerNode;
      }

      // Master Gain -> Boost -> Analyser -> Destination
      preMasterNode.connect(this.gainNode);
      this.gainNode.connect(this.boostNode);
      this.boostNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);

      // Restore cached values
      this.setVolume(this.cachedVolume, this.cachedMuted);
      this.setBoost(this.cachedBoost);
      this.setBalance(this.cachedBalance);
      this.applyPreset(this.cachedGains);
      this.setBassGain(this.cachedBassGain);
      this.setTrebleGain(this.cachedTrebleGain);
      this.setVocalClarity(this.cachedVocalClarity);
      this.setDrcMode(this.cachedDrcMode);
      this.setSpatialAudio(this.cachedSpatialMode);

      return true;
    } catch (e) {
      console.warn('AudioEngine WebAudio initialization notice:', e);
      return false;
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(volume: number, muted: boolean): void {
    this.cachedVolume = volume;
    this.cachedMuted = muted;
    if (this.gainNode && this.ctx) {
      const target = muted ? 0 : Math.max(0, Math.min(1, volume));
      this.gainNode.gain.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  public setBoost(boostMultiplier: number): void {
    this.cachedBoost = boostMultiplier;
    // 1.0 (100%) to 3.0 (300%)
    if (this.boostNode && this.ctx) {
      const safeBoost = Math.max(1.0, Math.min(3.0, boostMultiplier));
      this.boostNode.gain.setValueAtTime(safeBoost, this.ctx.currentTime);
    }
  }

  public setBalance(pan: number): void {
    this.cachedBalance = pan;
    // -1 (Left) to +1 (Right)
    if (this.pannerNode && this.ctx) {
      const safePan = Math.max(-1, Math.min(1, pan));
      this.pannerNode.pan.setValueAtTime(safePan, this.ctx.currentTime);
    }
  }

  public setAudioDelay(seconds: number): void {
    const safeDelay = Math.max(0, Math.min(3.0, seconds));
    this.cachedDelay = safeDelay;
    if (this.delayNode && this.ctx) {
      this.delayNode.delayTime.setValueAtTime(safeDelay, this.ctx.currentTime);
    }
  }

  public setBandGain(bandIndex: number, gainDb: number): void {
    const clampedGain = Math.max(-12, Math.min(12, gainDb));
    this.cachedGains[bandIndex] = clampedGain;
    if (this.filters[bandIndex] && this.ctx) {
      this.filters[bandIndex].gain.setValueAtTime(clampedGain, this.ctx.currentTime);
    }
  }

  public applyPreset(gains: number[]): void {
    this.cachedGains = [...gains];
    if (!this.ctx) return;
    gains.forEach((gain, idx) => {
      if (this.filters[idx]) {
        this.filters[idx].gain.setValueAtTime(gain, this.ctx!.currentTime);
      }
    });
  }

  public setBassGain(gainDb: number): void {
    const safeGain = Math.max(-12, Math.min(12, gainDb));
    this.cachedBassGain = safeGain;
    if (this.bassFilter && this.ctx) {
      this.bassFilter.gain.setValueAtTime(safeGain, this.ctx.currentTime);
    }
  }

  public setTrebleGain(gainDb: number): void {
    const safeGain = Math.max(-12, Math.min(12, gainDb));
    this.cachedTrebleGain = safeGain;
    if (this.trebleFilter && this.ctx) {
      this.trebleFilter.gain.setValueAtTime(safeGain, this.ctx.currentTime);
    }
  }

  public setVocalClarity(enabled: boolean): void {
    this.cachedVocalClarity = enabled;
    if (this.vocalFilter && this.vocalRumbleCut && this.ctx) {
      const gain = enabled ? 5.5 : 0;
      const rumbleFreq = enabled ? 85 : 10;
      this.vocalFilter.gain.setValueAtTime(gain, this.ctx.currentTime);
      this.vocalRumbleCut.frequency.setValueAtTime(rumbleFreq, this.ctx.currentTime);
    }
  }

  public setDrcMode(mode: DrcPresetMode): void {
    this.cachedDrcMode = mode;
    this.applyDrcSettings(mode);
  }

  private applyDrcSettings(mode: DrcPresetMode): void {
    if (!this.compressorNode || !this.ctx) return;
    const now = this.ctx.currentTime;

    switch (mode) {
      case 'gentle':
        this.compressorNode.threshold.setValueAtTime(-24, now);
        this.compressorNode.knee.setValueAtTime(25, now);
        this.compressorNode.ratio.setValueAtTime(4, now);
        this.compressorNode.attack.setValueAtTime(0.005, now);
        this.compressorNode.release.setValueAtTime(0.25, now);
        break;
      case 'cinema':
        this.compressorNode.threshold.setValueAtTime(-30, now);
        this.compressorNode.knee.setValueAtTime(18, now);
        this.compressorNode.ratio.setValueAtTime(8, now);
        this.compressorNode.attack.setValueAtTime(0.003, now);
        this.compressorNode.release.setValueAtTime(0.2, now);
        break;
      case 'night':
        // High compression: heavily boosts whisper dialogues and compresses loud action explosions
        this.compressorNode.threshold.setValueAtTime(-38, now);
        this.compressorNode.knee.setValueAtTime(12, now);
        this.compressorNode.ratio.setValueAtTime(14, now);
        this.compressorNode.attack.setValueAtTime(0.001, now);
        this.compressorNode.release.setValueAtTime(0.15, now);
        break;
      case 'off':
      default:
        this.compressorNode.threshold.setValueAtTime(0, now);
        this.compressorNode.knee.setValueAtTime(0, now);
        this.compressorNode.ratio.setValueAtTime(1, now);
        this.compressorNode.attack.setValueAtTime(0.01, now);
        this.compressorNode.release.setValueAtTime(0.25, now);
        break;
    }
  }

  public setSpatialAudio(mode: SpatialAudioMode): void {
    this.cachedSpatialMode = mode;
    this.updateSpatialImpulse(mode);
  }

  private updateSpatialImpulse(mode: SpatialAudioMode): void {
    if (!this.ctx || !this.spatialConvolver || !this.spatialDryGain || !this.spatialWetGain) return;
    const now = this.ctx.currentTime;

    if (mode === 'off') {
      this.spatialDryGain.gain.setValueAtTime(1.0, now);
      this.spatialWetGain.gain.setValueAtTime(0.0, now);
      return;
    }

    let duration = 0.8;
    let decay = 3.5;
    let wet = 0.2;
    let dry = 0.9;

    if (mode === 'subtle') {
      duration = 0.5;
      decay = 4.0;
      wet = 0.18;
      dry = 0.92;
    } else if (mode === 'wide') {
      duration = 1.1;
      decay = 2.8;
      wet = 0.35;
      dry = 0.82;
    } else if (mode === 'cinema') {
      duration = 1.8;
      decay = 2.0;
      wet = 0.45;
      dry = 0.75;
    }

    try {
      const buffer = this.createSyntheticImpulse(duration, decay);
      this.spatialConvolver.buffer = buffer;
      this.spatialDryGain.gain.setValueAtTime(dry, now);
      this.spatialWetGain.gain.setValueAtTime(wet, now);
    } catch (err) {
      console.warn('Spatial impulse synthesis notice:', err);
    }
  }

  private createSyntheticImpulse(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.ctx!.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx!.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const factor = Math.exp(-decay * t);
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    return impulse;
  }

  public setMonoDownmix(enabled: boolean): void {
    this.cachedMonoDownmix = enabled;
    // Handled via channelCount on audio nodes
    if (this.gainNode) {
      if (enabled) {
        this.gainNode.channelCount = 1;
        this.gainNode.channelCountMode = 'clamped-max';
        this.gainNode.channelInterpretation = 'speakers';
      } else {
        this.gainNode.channelCount = 2;
        this.gainNode.channelCountMode = 'max';
      }
    }
  }

  public getVisualizerData(dataArray: Uint8Array<ArrayBuffer>): void {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(dataArray);
    } else {
      dataArray.fill(0);
    }
  }

  public getTimeDomainData(dataArray: Uint8Array<ArrayBuffer>): void {
    if (this.analyserNode) {
      this.analyserNode.getByteTimeDomainData(dataArray);
    } else {
      dataArray.fill(128);
    }
  }

  public getAudioStats(): { sampleRate: number; channelCount: number; state: string } {
    return {
      sampleRate: this.ctx?.sampleRate || 48000,
      channelCount: this.ctx?.destination?.channelCount || 2,
      state: this.ctx?.state || 'uninitialized',
    };
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public isReady(): boolean {
    return this.ctx !== null && this.gainNode !== null;
  }
}

export const globalAudioEngine = new AudioEngine();
