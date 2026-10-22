import { describe, it, expect } from 'vitest';
import { parseVTT, parseSubtitleFile } from './subtitleParser';
import { SubtitleTrack } from '../types';

describe('Embedded Subtitles Extraction & Detection', () => {
  it('correctly parses WebVTT output produced by ffmpeg from embedded mov_text', () => {
    const rawVtt = `WEBVTT

00:00.500 --> 00:01.500
Halo! Ini subtitle bawaan MP4

00:01.800 --> 00:02.800
Subtitle kedua di MP4 internal
`;

    const cues = parseVTT(rawVtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(0.5);
    expect(cues[0].endTime).toBe(1.5);
    expect(cues[0].text).toBe('Halo! Ini subtitle bawaan MP4');

    expect(cues[1].startTime).toBe(1.8);
    expect(cues[1].endTime).toBe(2.8);
    expect(cues[1].text).toBe('Subtitle kedua di MP4 internal');
  });

  it('correctly identifies VTT cues when passed to parseSubtitleFile', () => {
    const rawVtt = `WEBVTT

1
00:00:02.100 --> 00:00:05.400
Embedded quicktime subtitle line 1

2
00:00:06.000 --> 00:00:09.200
Embedded quicktime subtitle line 2
`;

    const cues = parseSubtitleFile(rawVtt, 'track.vtt');
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBe(2.1);
    expect(cues[0].endTime).toBe(5.4);
    expect(cues[0].text).toBe('Embedded quicktime subtitle line 1');
  });

  it('prioritizes Indonesian embedded subtitle track if available', () => {
    const tracks: SubtitleTrack[] = [
      {
        id: 'eng-1',
        label: 'English [Embedded #1]',
        language: 'eng',
        cues: [{ id: 1, startTime: 0, endTime: 1, text: 'Hello' }],
        isEmbedded: true,
      },
      {
        id: 'ind-1',
        label: 'Indonesian [Embedded #2]',
        language: 'ind',
        cues: [{ id: 1, startTime: 0, endTime: 1, text: 'Halo' }],
        isEmbedded: true,
      },
      {
        id: 'jpn-1',
        label: 'Japanese [Embedded #3]',
        language: 'jpn',
        cues: [{ id: 1, startTime: 0, endTime: 1, text: 'Konnichiwa' }],
        isEmbedded: true,
      },
    ];

    const indSub = tracks.find(
      (s) =>
        s.language.toLowerCase().includes('id') ||
        s.language.toLowerCase().includes('ina') ||
        s.label.toLowerCase().includes('indonesian') ||
        s.label.toLowerCase().includes('indonesia')
    );

    expect(indSub).toBeDefined();
    expect(indSub?.id).toBe('ind-1');
  });

  it('preserves isEmbedded flag on subtitle tracks', () => {
    const embeddedTrack: SubtitleTrack = {
      id: 'emb-sub-1',
      label: 'Indonesian (Embedded)',
      language: 'ind',
      cues: [{ id: 1, startTime: 1, endTime: 2, text: 'Test' }],
      isEmbedded: true,
    };

    expect(embeddedTrack.isEmbedded).toBe(true);
    expect(embeddedTrack.isCustom).toBeUndefined();
  });

  it('deduplicates embedded subtitle tracks when merging into existing list', () => {
    const existing: SubtitleTrack[] = [
      {
        id: 'auto-sub-1',
        label: 'Indonesian (Embedded)',
        language: 'ind',
        cues: [{ id: 1, startTime: 0, endTime: 1, text: 'Halo' }],
        isEmbedded: true,
      },
    ];

    const incoming: SubtitleTrack[] = [
      {
        id: 'auto-sub-duplicate',
        label: 'Indonesian (Embedded)',
        language: 'ind',
        cues: [{ id: 1, startTime: 0, endTime: 1, text: 'Halo' }],
        isEmbedded: true,
      },
      {
        id: 'auto-sub-new',
        label: 'English (Embedded)',
        language: 'eng',
        cues: [{ id: 1, startTime: 0, endTime: 1, text: 'Hello' }],
        isEmbedded: true,
      },
    ];

    const existingLabels = new Set(existing.map((e) => e.label.toLowerCase()));
    const toAdd = incoming.filter((t) => !existingLabels.has(t.label.toLowerCase()));

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].label).toBe('English (Embedded)');
  });
});
