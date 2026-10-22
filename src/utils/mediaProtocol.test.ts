import { describe, it, expect } from 'vitest';
import {
  parseHttpRange,
  extractStreamPath,
  getMimeType,
  isSupportedMediaExtension,
  cleanCommandLineArg,
  extractMediaArgFromArgList,
  MIME_TYPES,
} from './mediaProtocol';

describe('mediaProtocol utilities', () => {
  describe('getMimeType', () => {
    it('returns correct MIME type for known video and audio formats', () => {
      expect(getMimeType('C:\\videos\\sample.mp4')).toBe('video/mp4');
      expect(getMimeType('movie.MKV')).toBe('video/x-matroska');
      expect(getMimeType('/path/to/stream.webm')).toBe('video/webm');
      expect(getMimeType('track.mp3')).toBe('audio/mpeg');
      expect(getMimeType('sound.FLAC')).toBe('audio/flac');
    });

    it('returns application/octet-stream for unknown or missing extensions', () => {
      expect(getMimeType('mystery_file')).toBe('application/octet-stream');
      expect(getMimeType('file.xyz123')).toBe('application/octet-stream');
    });
  });

  describe('extractStreamPath', () => {
    it('extracts unencoded and percent-encoded paths correctly', () => {
      const normal = 'zmt-media://stream?path=C%3A%5CMovies%5CTest.mp4';
      expect(extractStreamPath(normal)).toBe('C:\\Movies\\Test.mp4');

      const withSpaces = 'zmt-media://stream?path=D%3A%5CMy%20Videos%5CHoliday%202026.mkv';
      expect(extractStreamPath(withSpaces)).toBe('D:\\My Videos\\Holiday 2026.mkv');
    });

    it('handles filenames with literal percent signs without malformed URI crash', () => {
      // e.g. "Tutorial 100% complete.mp4"
      const pathWithPercent = 'D:\\Media\\100% real clip.mp4';
      const url = `zmt-media://stream?path=${encodeURIComponent(pathWithPercent)}`;
      expect(extractStreamPath(url)).toBe(pathWithPercent);
    });

    it('returns null for missing path parameter or invalid URL', () => {
      expect(extractStreamPath('zmt-media://stream')).toBeNull();
      expect(extractStreamPath('zmt-media://stream?other=value')).toBeNull();
      expect(extractStreamPath('not-a-valid-url:::')).toBeNull();
    });
  });

  describe('parseHttpRange', () => {
    const FILE_SIZE = 10000;

    it('returns null when rangeHeader is missing or not bytes=', () => {
      expect(parseHttpRange(null, FILE_SIZE)).toBeNull();
      expect(parseHttpRange(undefined, FILE_SIZE)).toBeNull();
      expect(parseHttpRange('', FILE_SIZE)).toBeNull();
      expect(parseHttpRange('items=0-10', FILE_SIZE)).toBeNull();
    });

    it('parses standard range request bytes=0-1023', () => {
      const res = parseHttpRange('bytes=0-1023', FILE_SIZE);
      expect(res).toEqual({
        start: 0,
        end: 1023,
        chunkSize: 1024,
        status: 206,
      });
    });

    it('parses open-ended range request bytes=5000-', () => {
      const res = parseHttpRange('bytes=5000-', FILE_SIZE);
      expect(res).toEqual({
        start: 5000,
        end: 9999,
        chunkSize: 5000,
        status: 206,
      });
    });

    it('parses suffix range request bytes=-500 (last 500 bytes)', () => {
      const res = parseHttpRange('bytes=-500', FILE_SIZE);
      expect(res).toEqual({
        start: 9500,
        end: 9999,
        chunkSize: 500,
        status: 206,
      });
    });

    it('clamps suffix range when suffix exceeds file size', () => {
      const res = parseHttpRange('bytes=-20000', FILE_SIZE);
      expect(res).toEqual({
        start: 0,
        end: 9999,
        chunkSize: 10000,
        status: 206,
      });
    });

    it('returns 416 Range Not Satisfiable when start >= file size', () => {
      const res = parseHttpRange('bytes=10000-', FILE_SIZE);
      expect(res?.status).toBe(416);
    });

    it('returns 416 Range Not Satisfiable when start > end', () => {
      const res = parseHttpRange('bytes=5000-2000', FILE_SIZE);
      expect(res?.status).toBe(416);
    });

    it('returns 416 on malformed range values', () => {
      expect(parseHttpRange('bytes=abc-def', FILE_SIZE)?.status).toBe(416);
      expect(parseHttpRange('bytes=-', FILE_SIZE)?.status).toBe(416);
    });
  });

  describe('isSupportedMediaExtension', () => {
    it('recognizes valid video and audio extensions', () => {
      expect(isSupportedMediaExtension('clip.mp4')).toBe(true);
      expect(isSupportedMediaExtension('movie.MKV')).toBe(true);
      expect(isSupportedMediaExtension('stream.webm')).toBe(true);
      expect(isSupportedMediaExtension('song.mp3')).toBe(true);
      expect(isSupportedMediaExtension('.wav')).toBe(true);
      expect(isSupportedMediaExtension('flac')).toBe(true);
    });

    it('rejects unsupported extensions', () => {
      expect(isSupportedMediaExtension('document.pdf')).toBe(false);
      expect(isSupportedMediaExtension('text.txt')).toBe(false);
      expect(isSupportedMediaExtension('app.exe')).toBe(false);
      expect(isSupportedMediaExtension('')).toBe(false);
    });
  });

  describe('cleanCommandLineArg', () => {
    it('strips leading and trailing quotes and whitespaces', () => {
      expect(cleanCommandLineArg('"C:\\Videos\\clip.mp4"')).toBe('C:\\Videos\\clip.mp4');
      expect(cleanCommandLineArg("'D:\\Movies\\test.mkv'")).toBe('D:\\Movies\\test.mkv');
      expect(cleanCommandLineArg('  C:\\test.mp4  ')).toBe('C:\\test.mp4');
    });

    it('handles empty or non-string inputs safely', () => {
      expect(cleanCommandLineArg('')).toBe('');
      expect(cleanCommandLineArg(null as unknown as string)).toBe('');
    });
  });

  describe('extractMediaArgFromArgList', () => {
    it('extracts media path from CLI args skipping electron flags and entry scripts', () => {
      const args = [
        'C:\\electron.exe',
        '--enable-features=VaapiVideoDecoder',
        'electron/main.cjs',
        '"D:\\Videos\\Movie 2026.mp4"',
      ];
      expect(extractMediaArgFromArgList(args)).toBe('D:\\Videos\\Movie 2026.mp4');
    });

    it('extracts media path when passed directly to packaged exe', () => {
      const args = [
        'Zmt Media Player.exe',
        'C:\\My Videos\\vacation.mkv',
      ];
      expect(extractMediaArgFromArgList(args)).toBe('C:\\My Videos\\vacation.mkv');
    });

    it('returns null when no media arguments are present', () => {
      const args = ['electron.exe', '--flag', 'some_text.txt'];
      expect(extractMediaArgFromArgList(args)).toBeNull();
    });
  });
});
