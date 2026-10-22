import { globalAudioEngine } from './audioEngine';
import { AudioSignature } from '../types';

/**
 * Calculates current real-time audio RMS amplitude and dB from globalAudioEngine.
 */
export function getRealtimeAudioMetrics(): { rms: number; db: number } {
  const analyser = globalAudioEngine.getAnalyser();
  if (!analyser) {
    return { rms: 0, db: -100 };
  }

  const bufferLength = analyser.fftSize;
  const timeData = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(timeData);

  let sumSquares = 0;
  for (let i = 0; i < bufferLength; i++) {
    // Normalise 0..255 to -1.0..+1.0
    const normalized = (timeData[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }

  const rms = Math.sqrt(sumSquares / bufferLength);
  // Calculate dB (clamped between -100dB and 0dB)
  const db = rms > 0.00001 ? Math.max(-100, Math.min(0, 20 * Math.log10(rms))) : -100;

  return { rms, db };
}

/**
 * Captures an audio signature at current playback moment.
 */
export function captureAudioSignature(currentTime: number): AudioSignature {
  const { rms, db } = getRealtimeAudioMetrics();
  return {
    capturedRms: Math.round(rms * 1000) / 1000,
    capturedDb: Math.round(db * 10) / 10,
    capturedAt: currentTime,
  };
}

/**
 * Checks if current audio is within a silence / scene transition dip.
 * Anime/drama episode openings are almost always preceded by a silence gap of 0.2s - 1.0s.
 */
export function isAudioSilent(silenceThresholdDb = -45): boolean {
  const { db } = getRealtimeAudioMetrics();
  return db <= silenceThresholdDb;
}
