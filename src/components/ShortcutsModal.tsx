import React, { useState, useEffect } from 'react';
import { Keyboard, X, FileVideo, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'Space / K', action: 'Play / Pause pemutaran' },
  { key: 'Left / J', action: 'Mundur 5 detik' },
  { key: 'Right / L', action: 'Maju 5 detik' },
  { key: 'Shift + Left / Right', action: 'Mundur / Maju cepat 10 detik' },
  { key: ', (Koma)', action: 'Langkah mundur 1 frame (-0.033s)' },
  { key: '. (Titik)', action: 'Langkah maju 1 frame (+0.033s)' },
  { key: 'A', action: 'A-B Loop (Set Titik A -> Titik B -> Hapus Loop)' },
  { key: 'R', action: 'Rotasi orientasi video +90°' },
  { key: 'Up / Down', action: 'Atur volume suara (5%)' },
  { key: 'M', action: 'Bisu / Aktifkan suara (Mute)' },
  { key: 'F / F11', action: 'Layar penuh (Fullscreen)' },
  { key: 'P', action: 'Picture-in-Picture (PiP floating window)' },
  { key: 'B', action: 'Buka Audio Pro Studio & 10-Band EQ' },
  { key: 'V', action: 'Buka Video Picture Grading & Profil' },
  { key: 'S', action: 'Buka Pengaturan Subtitle & Gaya Font' },
  { key: 'I', action: 'Buka Setup Skip Intro & Outro (Anime/Drama Mode)' },
  { key: 'C', action: 'Ambil snapshot screenshot frame master HD' },
  { key: 'Shift + D', action: 'Tampilkan / Sembunyikan Stats for Nerds HUD' },
  { key: '[ / ]', action: 'Perlambat / Percepat kecepatan putar' },
  { key: 'N', action: 'Putar video berikutnya di playlist' },
  { key: 'Shift + P', action: 'Putar video sebelumnya' },
  { key: '0 - 9', action: 'Lompat ke persentase durasi (0% - 90%)' },
  { key: 'Double Click', action: 'Masuk / Keluar layar penuh' },
  { key: '?', action: 'Buka panduan tombol pintas keyboard' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  useEffect(() => {
    if (isOpen && isElectron && (window.electronAPI as unknown as { checkAssociations?: () => Promise<boolean> })?.checkAssociations) {
      (window.electronAPI as unknown as { checkAssociations: () => Promise<boolean> }).checkAssociations().then(setIsRegistered).catch(() => {});
    }
  }, [isOpen, isElectron]);

  const handleRegisterAssociations = async () => {
    const api = window.electronAPI as unknown as { registerAssociations?: () => Promise<{ success: boolean; message?: string }> };
    if (!api?.registerAssociations) return;
    setIsRegistering(true);
    setStatusMessage(null);
    try {
      const res = await api.registerAssociations();
      if (res.success) {
        setIsRegistered(true);
        setStatusMessage('Format mp4, mkv, webm, avi, dll berhasil diasosiasikan!');
      } else {
        setStatusMessage(res.message || 'Gagal mendaftarkan asosiasi file.');
      }
    } catch {
      setStatusMessage('Terjadi kesalahan saat registrasi.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleOpenDefaultApps = () => {
    (window.electronAPI as unknown as { openDefaultApps?: () => void })?.openDefaultApps?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#111726] border border-cyan-500/30 w-full max-w-lg rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Shortcuts & Integrasi Sistem</h2>
              <p className="text-xs text-slate-400">Tombol pintas & pengaturan integrasi Windows</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">

          {/* Windows File Associations Card (Electron only) */}
          {isElectron && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-cyan-950/30 border border-cyan-500/30 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                    <FileVideo className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>Buka Langsung File Media (.mp4, .mkv, .webm, dll)</span>
                      {isRegistered && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Aktif
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Klik ganda file video atau audio di Windows Explorer akan otomatis membuka Zmt Media Player.
                    </p>
                  </div>
                </div>
              </div>

              {statusMessage && (
                <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={handleRegisterAssociations}
                  disabled={isRegistering}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm shadow-cyan-500/20"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegistering ? 'animate-spin' : ''}`} />
                  <span>{isRegistered ? 'Perbarui Asosiasi Windows' : 'Hubungkan Format File (.mp4 dll)'}</span>
                </button>
                <button
                  onClick={handleOpenDefaultApps}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pengaturan Default Apps Windows</span>
                </button>
              </div>
            </div>
          )}

          {/* Hotkeys Section Header */}
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Daftar Tombol Pintas Studio
          </div>

          {/* List */}
          <div className="space-y-2">
            {SHORTCUTS.map((s, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between"
              >
                <span className="text-xs text-slate-300 font-medium">{s.action}</span>
                <kbd className="px-2.5 py-1 text-[11px] font-mono font-semibold bg-slate-800 text-cyan-400 rounded-md border border-slate-700 shadow-sm">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
