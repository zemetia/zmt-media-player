import { describe, it, expect } from 'vitest';
import {
  parseTimestampToSeconds,
  formatTime,
  parseSRT,
  parseVTT,
  parseASS,
  parseSubtitleFile,
  cleanSubtitleText
} from './subtitleParser';

describe('formatTime', () => {
  it('formats 0 seconds correctly', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats MM:SS correctly', () => {
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(599)).toBe('09:59');
  });

  it('formats HH:MM:SS correctly when >= 1 hour', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
  });

  it('handles negative, NaN, and Infinity values gracefully', () => {
    expect(formatTime(-10)).toBe('00:00');
    expect(formatTime(NaN)).toBe('00:00');
    expect(formatTime(Infinity)).toBe('00:00');
    expect(formatTime(-Infinity)).toBe('00:00');
  });
});

describe('parseTimestampToSeconds', () => {
  it('parses HH:MM:SS,mmm SRT timestamps', () => {
    expect(parseTimestampToSeconds('01:02:03,500')).toBeCloseTo(3723.5);
  });

  it('parses MM:SS.mmm VTT timestamps', () => {
    expect(parseTimestampToSeconds('02:15.500')).toBeCloseTo(135.5);
  });

  it('isolates timestamp token from trailing positioning parameters', () => {
    expect(parseTimestampToSeconds('00:01:23.456 line:90% position:50% align:start')).toBeCloseTo(83.456);
  });

  it('handles malformed string safely', () => {
    expect(parseTimestampToSeconds('invalid')).toBe(0);
    expect(parseTimestampToSeconds('')).toBe(0);
  });
});

describe('parseSRT', () => {
  it('parses standard SRT blocks with index numbers and formatting tags', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,500
<b>Hello</b> world!

2
00:00:05,200 --> 00:00:08,000
<i>Second subtitle line</i>`;

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBeCloseTo(1.0);
    expect(cues[0].endTime).toBeCloseTo(4.5);
    expect(cues[0].text).toBe('Hello world!');

    expect(cues[1].startTime).toBeCloseTo(5.2);
    expect(cues[1].endTime).toBeCloseTo(8.0);
    expect(cues[1].text).toBe('Second subtitle line');
  });

  it('handles trailing coordinates and multi-line dialogue', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,500 X1:100 Y1:200
- Who is there?
- It is me, your friend.`;

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].startTime).toBeCloseTo(1.0);
    expect(cues[0].endTime).toBeCloseTo(4.5);
    expect(cues[0].text).toBe('- Who is there?\n- It is me, your friend.');
  });

  it('handles empty or broken SRT strings gracefully', () => {
    expect(parseSRT('')).toEqual([]);
    expect(parseSRT('random gibberish without timestamps')).toEqual([]);
  });
});

describe('parseVTT', () => {
  it('parses standard WebVTT cue syntax', () => {
    const vtt = `WEBVTT

00:00:02.000 --> 00:00:06.000
Welcome to Zmt Media Player

00:00:07.500 --> 00:00:10.000
Enjoy HD video playback`;

    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBeCloseTo(2.0);
    expect(cues[0].endTime).toBeCloseTo(6.0);
    expect(cues[0].text).toBe('Welcome to Zmt Media Player');

    expect(cues[1].startTime).toBeCloseTo(7.5);
    expect(cues[1].endTime).toBeCloseTo(10.0);
    expect(cues[1].text).toBe('Enjoy HD video playback');
  });

  it('handles cue identifiers and cue settings in WebVTT', () => {
    const vtt = `WEBVTT - Demo

cue-1
00:01:00.000 --> 00:01:05.000 align:center size:50%
First line of speech

cue-2
00:01:10.000 --> 00:01:15.000 line:10%
Second line of speech`;

    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTime).toBeCloseTo(60.0);
    expect(cues[0].endTime).toBeCloseTo(65.0);
    expect(cues[0].text).toBe('First line of speech');
  });
});

describe('parseASS', () => {
  it('parses ASS dialogue lines and strips {\\an8} styling tags', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:05.50,0:01:10.20,Default,,0,0,0,,{\\an8}High Definition Subtitle\\NSecond Line`;

    const cues = parseASS(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].startTime).toBeCloseTo(65.5);
    expect(cues[0].endTime).toBeCloseTo(70.2);
    expect(cues[0].text).toBe('High Definition Subtitle\nSecond Line');
  });

  it('preserves commas within the ASS dialogue text itself', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,One, two, three, and four!`;

    const cues = parseASS(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('One, two, three, and four!');
  });

  it('supports custom column orders defined in ASS Format header', () => {
    const ass = `[Events]
Format: Start, End, Text
Dialogue: 0:00:05.00,0:00:08.50,Simplified ASS format subtitle`;

    const cues = parseASS(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].startTime).toBeCloseTo(5.0);
    expect(cues[0].endTime).toBeCloseTo(8.5);
    expect(cues[0].text).toBe('Simplified ASS format subtitle');
  });

  it('replaces \\h with spaces and \\n with newlines', () => {
    const ass = `[Events]
Format: Start, End, Text
Dialogue: 0:00:01.00,0:00:03.00,Non-breaking\\hspace\\nsecond line`;

    const cues = parseASS(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Non-breaking space\nsecond line');
  });
});

describe('parseSubtitleFile Auto Detection', () => {
  it('detects .vtt by extension', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
VTT line`;
    const cues = parseSubtitleFile(vtt, 'movie.vtt');
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('VTT line');
  });

  it('detects .srt by extension', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
SRT line`;
    const cues = parseSubtitleFile(srt, 'movie.srt');
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('SRT line');
  });

  it('detects .ass and .ssa by extension', () => {
    const ass = `[Events]
Format: Start, End, Text
Dialogue: 0:00:01.00,0:00:03.00,ASS line`;
    const cues = parseSubtitleFile(ass, 'anime.ass');
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('ASS line');
  });
});
