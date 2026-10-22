import { MediaItem } from '../types';

/**
 * Natural alphanumeric sort comparison for filenames/titles
 * e.g. "Episode 1", "Episode 2", "Episode 10" in correct order
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sorts an array of MediaItems by title using natural alphanumeric ordering
 */
export function naturalSortMediaItems(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => naturalCompare(a.title, b.title));
}

/**
 * Reorders an item from fromIndex to toIndex, preserving the currently playing track index
 */
export function reorderPlaylistItem(
  playlist: MediaItem[],
  fromIndex: number,
  toIndex: number,
  currentIndex: number
): { newPlaylist: MediaItem[]; newCurrentIndex: number } {
  if (
    fromIndex < 0 ||
    fromIndex >= playlist.length ||
    toIndex < 0 ||
    toIndex >= playlist.length ||
    fromIndex === toIndex
  ) {
    return { newPlaylist: [...playlist], newCurrentIndex: currentIndex };
  }

  const currentTrackId = playlist[currentIndex]?.id;
  const newPlaylist = [...playlist];
  const [movedItem] = newPlaylist.splice(fromIndex, 1);
  newPlaylist.splice(toIndex, 0, movedItem);

  let newCurrentIndex = currentIndex;
  if (currentTrackId) {
    const foundIdx = newPlaylist.findIndex((item) => item.id === currentTrackId);
    if (foundIdx !== -1) {
      newCurrentIndex = foundIdx;
    }
  }

  return { newPlaylist, newCurrentIndex };
}

/**
 * Moves a playlist item up or down by 1 position
 */
export function movePlaylistItem(
  playlist: MediaItem[],
  index: number,
  direction: 'up' | 'down',
  currentIndex: number
): { newPlaylist: MediaItem[]; newCurrentIndex: number } {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  return reorderPlaylistItem(playlist, index, targetIndex, currentIndex);
}

/**
 * Sorts the playlist by title in asc or desc order, tracking the current active track
 */
export function sortPlaylistByName(
  playlist: MediaItem[],
  currentIndex: number,
  direction: 'asc' | 'desc' = 'asc'
): { newPlaylist: MediaItem[]; newCurrentIndex: number } {
  if (playlist.length <= 1) {
    return { newPlaylist: [...playlist], newCurrentIndex: currentIndex };
  }

  const currentTrackId = playlist[currentIndex]?.id;
  const newPlaylist = [...playlist].sort((a, b) => {
    const cmp = naturalCompare(a.title, b.title);
    return direction === 'asc' ? cmp : -cmp;
  });

  let newCurrentIndex = currentIndex;
  if (currentTrackId) {
    const foundIdx = newPlaylist.findIndex((item) => item.id === currentTrackId);
    if (foundIdx !== -1) {
      newCurrentIndex = foundIdx;
    }
  }

  return { newPlaylist, newCurrentIndex };
}
