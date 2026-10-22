import { describe, it, expect } from 'vitest';
import {
  parseTimestampToSeconds,
  formatTime,
  parseSRT,
  parseVTT,
  parseASS,
  parseSubtitleFile,
  cleanSubtitleText,
  detectCuePosition
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

describe('detectCuePosition', () => {
  it('detects ASS/SSA top alignment tags like {\\an8} and legacy {\\a6}', () => {
    expect(detectCuePosition('{\\an8}Teks atas')).toBe('top');
    expect(detectCuePosition('{\\an7}Teks pojok atas kiri')).toBe('top');
    expect(detectCuePosition('{\\an9}Teks pojok atas kanan')).toBe('top');
    expect(detectCuePosition('{\\a6}Legacy SSA top')).toBe('top');
    expect(detectCuePosition('{\\fs20\\an8}Combined ASS tag')).toBe('top');
    expect(detectCuePosition('{\\an8\\b1}Combined ASS tag')).toBe('top');
    expect(detectCuePosition('{\\pos(640,50)\\c&HFFFFFF&}Position top')).toBe('top');
  });

  it('detects ASS bottom alignment tags like {\\an2} and legacy {\\a2}', () => {
    expect(detectCuePosition('{\\an2}Teks bawah')).toBe('bottom');
    expect(detectCuePosition('{\\a2}Legacy SSA bottom')).toBe('bottom');
  });

  it('detects WebVTT cue settings on the timeline', () => {
    expect(detectCuePosition('Subtitle', '00:01.000 --> 00:04.000 line:10%')).toBe('top');
    expect(detectCuePosition('Subtitle', '00:01.000 --> 00:04.000 line:0%')).toBe('top');
    expect(detectCuePosition('Subtitle', '00:01.000 --> 00:04.000 line:90%')).toBe('bottom');
  });

  it('detects ASS style table alignment and style names', () => {
    expect(detectCuePosition('Dialogue', undefined, 8, 'Default')).toBe('top');
    expect(detectCuePosition('Dialogue', undefined, 2, 'Default')).toBe('bottom');
    expect(detectCuePosition('Dialogue', undefined, undefined, 'Sign_Header')).toBe('top');
    expect(detectCuePosition('Dialogue', undefined, undefined, 'TL_Note')).toBe('top');
  });

  it('detects bracketed sign or explanation prefixes', () => {
    expect(detectCuePosition('[Papan Nama: Rumah Sakit]')).toBe('top');
    expect(detectCuePosition('【Toko Serba Ada】')).toBe('top');
    expect(detectCuePosition('Catatan: Ini adalah istilah kuno')).toBe('top');
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

  it('parses parallel overlapping SRT cues with top and bottom positioning', () => {
    const srt = `1
00:00:10,000 --> 00:00:15,000
{\\an8}[Papan Nama: Rumah Sakit Tokyo]

2
00:00:10,500 --> 00:00:14,000
Cepat, kita harus bawa dia ke dalam!`;

    const cues = parseSRT(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('[Papan Nama: Rumah Sakit Tokyo]');
    expect(cues[0].position).toBe('top');

    expect(cues[1].text).toBe('Cepat, kita harus bawa dia ke dalam!');
    expect(cues[1].position).toBeUndefined(); // defaults to bottom
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

  it('parses parallel WebVTT cues with line positioning', () => {
    const vtt = `WEBVTT - Demo

cue-top
00:01:00.000 --> 00:01:05.000 line:0%
Sign translation at top

cue-bottom
00:01:00.000 --> 00:01:05.000 line:90%
Dialogue speech at bottom`;

    const cues = parseVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Sign translation at top');
    expect(cues[0].position).toBe('top');

    expect(cues[1].text).toBe('Dialogue speech at bottom');
    expect(cues[1].position).toBe('bottom');
  });
});

describe('parseASS', () => {
  it('parses ASS dialogue lines and extracts {\\an8} styling tags as top position', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:05.50,0:01:10.20,Default,,0,0,0,,{\\an8}High Definition Subtitle\\NSecond Line`;

    const cues = parseASS(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].startTime).toBeCloseTo(65.5);
    expect(cues[0].endTime).toBeCloseTo(70.2);
    expect(cues[0].text).toBe('High Definition Subtitle\nSecond Line');
    expect(cues[0].position).toBe('top');
  });

  it('parses parallel ASS cues with Style table alignments', () => {
    const ass = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
Style: Sign,Arial,18,&H00FFFF00,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,8,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:02:00.00,0:02:05.00,Sign,,0,0,0,,Stasiun Shibuya
Dialogue: 0,0:02:00.50,0:02:04.00,Default,,0,0,0,,Kereta berikutnya akan segera tiba.`;

    const cues = parseASS(ass);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Stasiun Shibuya');
    expect(cues[0].position).toBe('top');

    expect(cues[1].text).toBe('Kereta berikutnya akan segera tiba.');
    expect(cues[1].position).toBe('bottom');
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
