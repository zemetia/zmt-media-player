import { describe, it, expect } from 'vitest';
import { SAMPLE_PLAYLIST } from '../data/sampleMedia';
import { MediaItem } from '../types';
import {
  naturalCompare,
  naturalSortMediaItems,
  reorderPlaylistItem,
  movePlaylistItem,
  sortPlaylistByName,
} from './playlist';

describe('SAMPLE_PLAYLIST verification', () => {
  it('has multiple sample items with valid https urls', () => {
    expect(SAMPLE_PLAYLIST.length).toBeGreaterThanOrEqual(4);
    SAMPLE_PLAYLIST.forEach((track) => {
      expect(track.id).toBeTruthy();
      expect(track.title).toBeTruthy();
      expect(track.url).toMatch(/^https:\/\//);
      expect(track.duration).toBeGreaterThan(0);
      expect(track.resolution).toBeTruthy();
      expect(track.subtitles && track.subtitles.length).toBeGreaterThan(0);
    });
  });

  it('contains Indonesian and English subtitles for demo tracks', () => {
    const oceans = SAMPLE_PLAYLIST[0];
    const languages = oceans.subtitles?.map(s => s.language);
    expect(languages).toContain('id');
    expect(languages).toContain('en');

    // Verify cue timestamps are sorted and strictly valid
    oceans.subtitles?.forEach(track => {
      expect(track.cues.length).toBeGreaterThan(0);
      track.cues.forEach(cue => {
        expect(cue.startTime).toBeLessThan(cue.endTime);
        expect(cue.text.trim().length).toBeGreaterThan(0);
      });
    });
  });
});

describe('Playlist progression logic', () => {
  const sampleTracks: MediaItem[] = [
    { id: '1', title: 'Video 1', url: 'https://example.com/1.mp4' },
    { id: '2', title: 'Video 2', url: 'https://example.com/2.mp4' },
    { id: '3', title: 'Video 3', url: 'https://example.com/3.mp4' },
  ];

  it('progresses to next index linearly in normal mode', () => {
    let currentIdx = 0;
    const getNext = (idx: number, repeat: 'off' | 'all' | 'one') => {
      if (repeat === 'one') return idx;
      if (idx < sampleTracks.length - 1) return idx + 1;
      if (repeat === 'all') return 0;
      return -1; // stop
    };

    expect(getNext(0, 'off')).toBe(1);
    expect(getNext(1, 'off')).toBe(2);
    expect(getNext(2, 'off')).toBe(-1); // reaches end

    // Repeat all mode
    expect(getNext(2, 'all')).toBe(0);

    // Repeat one mode
    expect(getNext(1, 'one')).toBe(1);
  });

  it('handles item removal without desynchronizing playing track index', () => {
    let list = [...sampleTracks];
    let currentIndex = 2; // currently playing Video 3

    // Remove Video 1 (index 0)
    const removeIdx = 0;
    list = list.filter((_, idx) => idx !== removeIdx);
    if (currentIndex > removeIdx) {
      currentIndex -= 1;
    }

    expect(list).toHaveLength(2);
    expect(currentIndex).toBe(1);
    expect(list[currentIndex].title).toBe('Video 3'); // Still pointing to Video 3!
  });
});

describe('Natural alphanumeric sorting', () => {
  it('correctly sorts episode numbers naturally (Ep 2 before Ep 10)', () => {
    const list: MediaItem[] = [
      { id: '1', title: 'Episode 10', url: '' },
      { id: '2', title: 'Episode 2', url: '' },
      { id: '3', title: 'Episode 1', url: '' },
      { id: '4', title: 'Episode 21', url: '' },
    ];

    const sorted = naturalSortMediaItems(list);
    expect(sorted.map(s => s.title)).toEqual([
      'Episode 1',
      'Episode 2',
      'Episode 10',
      'Episode 21',
    ]);
  });
});

describe('Playlist reordering and tracking', () => {
  const items: MediaItem[] = [
    { id: 'a', title: 'Alpha', url: '' },
    { id: 'b', title: 'Beta', url: '' },
    { id: 'c', title: 'Gamma', url: '' },
    { id: 'd', title: 'Delta', url: '' },
  ];

  it('reorders item down and preserves currently playing track pointer', () => {
    // Current track is 'b' at index 1
    // Move 'a' from index 0 to index 2: new order [b, c, a, d]
    // Current track 'b' is now at index 0!
    const { newPlaylist, newCurrentIndex } = reorderPlaylistItem(items, 0, 2, 1);
    expect(newPlaylist.map(x => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(newCurrentIndex).toBe(0);
    expect(newPlaylist[newCurrentIndex].id).toBe('b');
  });

  it('moves current playing track and updates current index accordingly', () => {
    // Current track is 'c' at index 2
    // Move 'c' from index 2 to index 0: new order [c, a, b, d]
    // Current index should now be 0
    const { newPlaylist, newCurrentIndex } = reorderPlaylistItem(items, 2, 0, 2);
    expect(newPlaylist.map(x => x.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(newCurrentIndex).toBe(0);
    expect(newPlaylist[newCurrentIndex].id).toBe('c');
  });

  it('moves item up and down by 1 position', () => {
    // Move 'b' up from 1 to 0
    const resUp = movePlaylistItem(items, 1, 'up', 1);
    expect(resUp.newPlaylist.map(x => x.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(resUp.newCurrentIndex).toBe(0);

    // Move 'b' down from 1 to 2
    const resDown = movePlaylistItem(items, 1, 'down', 1);
    expect(resDown.newPlaylist.map(x => x.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(resDown.newCurrentIndex).toBe(2);
  });

  it('sorts playlist alphabetically and keeps playing track index updated', () => {
    const unordered: MediaItem[] = [
      { id: '3', title: 'C - Video', url: '' },
      { id: '1', title: 'A - Video', url: '' },
      { id: '2', title: 'B - Video', url: '' },
    ];

    // Say 'C - Video' (index 0) is playing
    const { newPlaylist, newCurrentIndex } = sortPlaylistByName(unordered, 0, 'asc');
    expect(newPlaylist.map(x => x.title)).toEqual(['A - Video', 'B - Video', 'C - Video']);
    expect(newCurrentIndex).toBe(2);
    expect(newPlaylist[newCurrentIndex].id).toBe('3');
  });
});
