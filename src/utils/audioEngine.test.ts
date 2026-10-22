import { describe, it, expect } from 'vitest';
import { EQ_FREQUENCIES, EQ_PRESETS, AudioEngine, globalAudioEngine } from './audioEngine';

describe('AudioEngine Constants & Presets', () => {
  it('has 10 defined equalizer frequencies covering sub-bass to air', () => {
    expect(EQ_FREQUENCIES).toHaveLength(10);
    expect(EQ_FREQUENCIES[0]).toBe(32);
    expect(EQ_FREQUENCIES[9]).toBe(16000);
  });

  it('all presets contain exactly 10 frequency band gain values', () => {
    Object.entries(EQ_PRESETS).forEach(([name, gains]) => {
      expect(gains, `Preset ${name} should have 10 values`).toHaveLength(10);
      gains.forEach((g) => {
        expect(g).toBeGreaterThanOrEqual(-12);
        expect(g).toBeLessThanOrEqual(12);
      });
    });
  });

  it('Flat preset has all zero gains', () => {
    expect(EQ_PRESETS['Flat']).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Bass Boost elevates lower frequencies', () => {
    const bass = EQ_PRESETS['Bass Boost'];
    expect(bass[0]).toBeGreaterThan(bass[9]);
  });
});

describe('AudioEngine State & Parameter Clamping', () => {
  it('instantiates AudioEngine cleanly', () => {
    const engine = new AudioEngine();
    expect(engine.isReady()).toBe(false);
  });

  it('handles setVolume, setBoost, setBalance, and setAudioDelay safely without throwing before init', () => {
    const engine = new AudioEngine();
    expect(() => {
      engine.setVolume(0.5, false);
      engine.setVolume(1.5, false); // should clamp safely
      engine.setBoost(2.5);
      engine.setBoost(5.0); // should clamp to 3.0
      engine.setBalance(-0.5);
      engine.setBalance(2.0); // should clamp to 1.0
      engine.setAudioDelay(0.35);
      engine.setAudioDelay(5.0); // should clamp to 3.0s
      engine.setBandGain(0, 6);
      engine.applyPreset(EQ_PRESETS['Cinema / Movie']);
      engine.resume();
    }).not.toThrow();
  });

  it('handles advanced audio processing parameters without throwing before init', () => {
    const engine = new AudioEngine();
    expect(() => {
      engine.setBassGain(8);
      engine.setBassGain(-20); // clamps to -12
      engine.setTrebleGain(5);
      engine.setTrebleGain(18); // clamps to 12
      engine.setVocalClarity(true);
      engine.setVocalClarity(false);
      engine.setDrcMode('cinema');
      engine.setDrcMode('night');
      engine.setSpatialAudio('wide');
      engine.setSpatialAudio('cinema');
      engine.setMonoDownmix(true);
    }).not.toThrow();
  });

  it('fills visualizer array with zeros when uninitialized', () => {
    const engine = new AudioEngine();
    const data = new Uint8Array(16).fill(255);
    engine.getVisualizerData(data);
    expect(Array.from(data)).toEqual(new Array(16).fill(0));
  });

  it('fills time domain data with 128 (centerline) when uninitialized', () => {
    const engine = new AudioEngine();
    const data = new Uint8Array(16).fill(0);
    engine.getTimeDomainData(data);
    expect(Array.from(data)).toEqual(new Array(16).fill(128));
  });

  it('returns valid audio stats structure', () => {
    const engine = new AudioEngine();
    const stats = engine.getAudioStats();
    expect(stats).toHaveProperty('sampleRate');
    expect(stats).toHaveProperty('channelCount');
    expect(stats).toHaveProperty('state');
  });

  it('globalAudioEngine singleton exists and is accessible', () => {
    expect(globalAudioEngine).toBeInstanceOf(AudioEngine);
  });
});
