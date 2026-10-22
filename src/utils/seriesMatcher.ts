/**
 * Utility to extract clean series title and episode info from anime and drama video titles/filenames.
 */

export interface SeriesInfo {
  seriesTitle: string;
  episodeNumber?: number;
  seasonNumber?: number;
  rawTitle: string;
}

export function extractSeriesInfo(rawTitle: string): SeriesInfo {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return { seriesTitle: 'Unknown Series', rawTitle: '' };
  }

  // Remove file extensions if present
  let clean = rawTitle.replace(/\.(mp4|mkv|webm|avi|mov|flv|ts|m4v)$/i, '').trim();

  // Remove release groups at start like [SubsPlease], [Erai-raws], [Judas], etc.
  clean = clean.replace(/^\[[^\]]+\]\s*/, '');

  // Remove trailing bracketed/parenthesized tags like [1080p][HEVC], (1920x1080), [Dual Audio]
  clean = clean.replace(/(\[[^\]]*\]|\([^\)]*\))$/g, '').trim();

  // Replace dots/underscores commonly used in scene releases if there are few spaces
  if (!clean.includes(' ') && (clean.includes('.') || clean.includes('_'))) {
    clean = clean.replace(/[._]/g, ' ');
  }

  let episodeNumber: number | undefined;
  let seasonNumber: number | undefined;

  // Pattern 1: S01E05 or S1E5 or s02e12
  const seasonEpMatch = clean.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  if (seasonEpMatch) {
    seasonNumber = parseInt(seasonEpMatch[1], 10);
    episodeNumber = parseInt(seasonEpMatch[2], 10);
    clean = clean.slice(0, seasonEpMatch.index).trim();
  } else {
    // Pattern 2: Season 2 Episode 4
    const seasonMatch = clean.match(/\bSeason\s*(\d{1,2})\b/i);
    if (seasonMatch) {
      seasonNumber = parseInt(seasonMatch[1], 10);
    }

    // Pattern 3: EP05, Ep. 5, Episode 5, Ep 5
    const epMatch = clean.match(/\b(?:Episode|Ep\.?)\s*(\d{1,3})\b/i);
    if (epMatch) {
      episodeNumber = parseInt(epMatch[1], 10);
      clean = clean.slice(0, epMatch.index).trim();
    } else {
      // Pattern 4: Anime standard dash episode number: "Anime Name - 04" or "Anime Name - 04v2"
      const dashEpMatch = clean.match(/\s+-\s+(\d{1,4})(?:v\d+)?(?:\s|$)/);
      if (dashEpMatch) {
        episodeNumber = parseInt(dashEpMatch[1], 10);
        clean = clean.slice(0, dashEpMatch.index).trim();
      } else {
        // Pattern 5: Trailing episode number: "Anime Name 04"
        const trailingEpMatch = clean.match(/\s+(\d{1,3})$/);
        if (trailingEpMatch) {
          episodeNumber = parseInt(trailingEpMatch[1], 10);
          clean = clean.slice(0, trailingEpMatch.index).trim();
        }
      }
    }
  }

  // Remove common quality tags that might be remaining
  clean = clean
    .replace(/\b(1080p|720p|480p|2160p|4k|bluray|bdrip|web-dl|webrip|hdtv|x264|x265|hevc|av1|aac|dts)\b/gi, '')
    .replace(/[-_–—\s]+$/, '')
    .trim();

  // If Season was found, append it neatly to series title if not already present
  let seriesTitle = clean || rawTitle;
  if (seasonNumber && !seriesTitle.toLowerCase().includes(`season ${seasonNumber}`) && !seriesTitle.toLowerCase().includes(`s${seasonNumber}`)) {
    seriesTitle = `${seriesTitle} S${seasonNumber}`;
  }

  return {
    seriesTitle: seriesTitle.trim(),
    episodeNumber,
    seasonNumber,
    rawTitle,
  };
}
