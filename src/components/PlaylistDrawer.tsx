import React, { useRef, useState } from 'react';
import {
  Film,
  Plus,
  Trash2,
  Play,
  Shuffle,
  Repeat,
  Sparkles,
  X,
  FileVideo,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowDownAZ,
  ArrowUpZA,
  Music
} from 'lucide-react';
import { MediaItem } from '../types';
import { formatTime } from '../utils/subtitleParser';
import {
  reorderPlaylistItem,
  movePlaylistItem,
  sortPlaylistByName
} from '../utils/playlist';

interface PlaylistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: MediaItem[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
  onAddFiles: (files: FileList) => void;
  onRemoveTrack: (index: number) => void;
  onClearPlaylist: () => void;
  onLoadSamples: () => void;
  onReorderPlaylist: (newPlaylist: MediaItem[], newCurrentIndex: number) => void;
  shuffle: boolean;
  setShuffle: React.Dispatch<React.SetStateAction<boolean>>;
  repeatMode: 'off' | 'all' | 'one';
  setRepeatMode: React.Dispatch<React.SetStateAction<'off' | 'all' | 'one'>>;
}

export const PlaylistDrawer: React.FC<PlaylistDrawerProps> = ({
  isOpen,
  onClose,
  playlist,
  currentIndex,
  onSelectTrack,
  onAddFiles,
  onRemoveTrack,
  onClearPlaylist,
  onLoadSamples,
  onReorderPlaylist,
  shuffle,
  setShuffle,
  repeatMode,
  setRepeatMode,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const cycleRepeat = () => {
    if (repeatMode === 'off') setRepeatMode('all');
    else if (repeatMode === 'all') setRepeatMode('one');
    else setRepeatMode('off');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reordering handlers
  const handleMoveUp = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index > 0) {
      const { newPlaylist, newCurrentIndex } = movePlaylistItem(playlist, index, 'up', currentIndex);
      onReorderPlaylist(newPlaylist, newCurrentIndex);
    }
  };

  const handleMoveDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index < playlist.length - 1) {
      const { newPlaylist, newCurrentIndex } = movePlaylistItem(playlist, index, 'down', currentIndex);
      onReorderPlaylist(newPlaylist, newCurrentIndex);
    }
  };

  const handleSortAZ = () => {
    const { newPlaylist, newCurrentIndex } = sortPlaylistByName(playlist, currentIndex, 'asc');
    onReorderPlaylist(newPlaylist, newCurrentIndex);
  };

  const handleSortZA = () => {
    const { newPlaylist, newCurrentIndex } = sortPlaylistByName(playlist, currentIndex, 'desc');
    onReorderPlaylist(newPlaylist, newCurrentIndex);
  };

  // HTML5 Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      const { newPlaylist, newCurrentIndex } = reorderPlaylistItem(
        playlist,
        draggedIndex,
        targetIndex,
        currentIndex
      );
      onReorderPlaylist(newPlaylist, newCurrentIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0e1422]/95 border-l border-cyan-500/30 backdrop-blur-xl shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Daftar Putar (Playlist)
              <span className="text-[11px] font-semibold text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                {playlist.length} file
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">Tarik & lepas atau gunakan tombol panah untuk mengubah urutan</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Playlist Controls & Sorting toolbar */}
      <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/40">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShuffle(!shuffle)}
            title={`Toggle Acak / Shuffle (${shuffle ? 'ON' : 'OFF'})`}
            className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
              shuffle
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono">{shuffle ? 'ON' : 'OFF'}</span>
          </button>
          <button
            onClick={cycleRepeat}
            title={`Ulangi / Repeat mode: ${repeatMode}`}
            className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
              repeatMode !== 'off'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-bold">{repeatMode}</span>
          </button>

          {/* Quick Sort Buttons */}
          <div className="h-4 w-px bg-slate-800 mx-1" />
          <button
            onClick={handleSortAZ}
            title="Urutkan Berdasarkan Nama (A-Z)"
            className="p-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-cyan-400 text-xs transition flex items-center gap-1 cursor-pointer"
          >
            <ArrowDownAZ className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium hidden sm:inline">A-Z</span>
          </button>
          <button
            onClick={handleSortZA}
            title="Urutkan Berdasarkan Nama (Z-A)"
            className="p-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-cyan-400 text-xs transition flex items-center gap-1 cursor-pointer"
          >
            <ArrowUpZA className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium hidden sm:inline">Z-A</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition flex items-center gap-1 shadow-sm shadow-cyan-500/20 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,.mkv,.mp4,.webm,.avi,.mov"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {playlist.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">Playlist Kosong</p>
              <p className="text-xs text-slate-500 mt-1">Buka file video untuk otomatis memuat semua video dalam folder</p>
            </div>
            <button
              onClick={onLoadSamples}
              className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-semibold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Muat Video Demo
            </button>
          </div>
        ) : (
          playlist.map((track, idx) => {
            const isPlaying = idx === currentIndex;
            const isDragging = draggedIndex === idx;
            const isDragOver = dragOverIndex === idx && !isDragging;

            return (
              <div
                key={track.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectTrack(idx)}
                className={`relative p-2.5 rounded-xl border flex items-center justify-between gap-2.5 group transition cursor-pointer select-none ${
                  isPlaying
                    ? 'bg-gradient-to-r from-cyan-950/80 via-slate-900 to-slate-900 border-cyan-400 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-500/40'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700'
                } ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${
                  isDragOver ? 'border-t-2 border-t-cyan-400 bg-cyan-500/10' : ''
                }`}
              >
                {/* Drag Handle & Index */}
                <div
                  className="flex items-center gap-1 text-slate-500 hover:text-cyan-400 cursor-grab active:cursor-grabbing p-1"
                  title="Tarik untuk memindahkan urutan"
                >
                  <GripVertical className="w-4 h-4 opacity-50 group-hover:opacity-100 transition" />
                  <span className={`text-[11px] font-mono font-semibold w-5 text-center ${isPlaying ? 'text-cyan-400' : 'text-slate-500'}`}>
                    {idx + 1}
                  </span>
                </div>

                {/* Track Icon / Animated Equalizer if Playing */}
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition ${
                    isPlaying
                      ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                      : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'
                  }`}
                >
                  {isPlaying ? (
                    <div className="flex items-end justify-center gap-0.5 h-3.5 w-3.5">
                      <span className="w-1 bg-black rounded-full animate-[pulse_0.6s_ease-in-out_infinite]" style={{ height: '70%' }} />
                      <span className="w-1 bg-black rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s]" style={{ height: '100%' }} />
                      <span className="w-1 bg-black rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.4s]" style={{ height: '50%' }} />
                    </div>
                  ) : (
                    <FileVideo className="w-4 h-4" />
                  )}
                </div>

                {/* Track Info */}
                <div className="overflow-hidden flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-xs truncate ${isPlaying ? 'font-bold text-cyan-300' : 'font-medium text-slate-200'}`}>
                      {track.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* Visual Now Playing Badge */}
                    {isPlaying && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full bg-cyan-500 text-black tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                        Sedang Putar
                      </span>
                    )}

                    {track.resolution && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/50 font-mono font-medium">
                        {track.resolution}
                      </span>
                    )}

                    {track.duration && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatTime(track.duration)}
                      </span>
                    )}

                    {track.subtitles && track.subtitles.length > 0 && (
                      <span className="text-[10px] text-emerald-400 font-medium">
                        {track.subtitles.length} Sub
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons: Move Up / Down, Remove */}
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleMoveUp(idx, e)}
                    disabled={idx === 0}
                    className="p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer"
                    title="Geser ke Atas"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => handleMoveDown(idx, e)}
                    disabled={idx === playlist.length - 1}
                    className="p-1 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent transition cursor-pointer"
                    title="Geser ke Bawah"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTrack(idx);
                    }}
                    className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition cursor-pointer"
                    title="Hapus dari daftar putar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs">
        <button
          onClick={onLoadSamples}
          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Muat Klip Demo
        </button>

        {playlist.length > 0 && (
          <button
            onClick={onClearPlaylist}
            className="text-slate-500 hover:text-red-400 transition cursor-pointer"
          >
            Bersihkan Playlist
          </button>
        )}
      </div>

    </div>
  );
};
