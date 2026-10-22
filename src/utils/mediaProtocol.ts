export const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.ts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

export function getMimeType(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return 'application/octet-stream';
  const ext = filePath.slice(dotIndex).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function isSupportedMediaExtension(filePathOrExt: string): boolean {
  if (!filePathOrExt) return false;
  const dotIndex = filePathOrExt.lastIndexOf('.');
  const ext = dotIndex === -1 ? `.${filePathOrExt.toLowerCase()}` : filePathOrExt.slice(dotIndex).toLowerCase();
  return ext in MIME_TYPES;
}

export function cleanCommandLineArg(arg: string): string {
  if (!arg || typeof arg !== 'string') return '';
  return arg.trim().replace(/^["']|["']$/g, '');
}

export function extractMediaArgFromArgList(argv: string[]): string | null {
  if (!Array.isArray(argv)) return null;
  for (let i = 1; i < argv.length; i++) {
    const raw = argv[i];
    const cleaned = cleanCommandLineArg(raw);
    if (!cleaned || cleaned.startsWith('--') || cleaned.startsWith('-')) continue;
    if (cleaned === '.' || cleaned.endsWith('main.cjs') || cleaned.endsWith('main.js')) continue;

    if (isSupportedMediaExtension(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

export interface RangeResult {
  start: number;
  end: number;
  chunkSize: number;
  status: 206 | 416;
}

export function parseHttpRange(rangeHeader: string | null | undefined, fileSize: number): RangeResult | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const rangeValue = rangeHeader.slice(6).trim();
  const parts = rangeValue.split('-');
  if (parts.length !== 2) return { start: 0, end: 0, chunkSize: 0, status: 416 };

  let start = 0;
  let end = fileSize - 1;

  if (parts[0] === '' && parts[1] !== '') {
    // Suffix range: e.g. bytes=-500 means the last 500 bytes of the file
    const suffix = parseInt(parts[1], 10);
    if (isNaN(suffix) || suffix <= 0) return { start: 0, end: 0, chunkSize: 0, status: 416 };
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else if (parts[0] !== '') {
    start = parseInt(parts[0], 10);
    if (isNaN(start) || start < 0) return { start: 0, end: 0, chunkSize: 0, status: 416 };
    if (parts[1] !== '') {
      end = parseInt(parts[1], 10);
      if (isNaN(end)) return { start: 0, end: 0, chunkSize: 0, status: 416 };
    }
  } else {
    return { start: 0, end: 0, chunkSize: 0, status: 416 };
  }

  if (start > end || start >= fileSize) {
    return { start: 0, end: 0, chunkSize: 0, status: 416 };
  }

  end = Math.min(end, fileSize - 1);
  const chunkSize = end - start + 1;

  return {
    start,
    end,
    chunkSize,
    status: 206,
  };
}

export function extractStreamPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const pathParam = url.searchParams.get('path');
    if (!pathParam) return null;
    return pathParam; // Already decoded by WHATWG URLSearchParams, no secondary decode needed
  } catch {
    return null;
  }
}
