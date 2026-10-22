export interface NativeSubtitleFile {
  name: string;
  path: string;
  content: string;
  id?: string;
  label?: string;
  language?: string;
  isEmbedded?: boolean;
}

export interface NativeMediaFile {
  name: string;
  path: string;
  size: number;
  url: string;
  subtitles?: NativeSubtitleFile[];
}

export interface FolderScanResult {
  items: NativeMediaFile[];
  activeIndex: number;
  folder?: string;
}

export interface AssociationResult {
  success: boolean;
  message?: string;
  exePath?: string;
}

export interface FindFrameRequest {
  /** Lets the renderer cancel a running search with cancelFindFrame. */
  id?: string;
  filePath: string;
  duration: number;
  kind: 'intro' | 'outro';
  /** 64x36 grayscale of the reference screenshot, base64 (2304 bytes). */
  gray: string;
  sensitivity?: number;
  budgetMs?: number;
}

export type FindFrameResult =
  | {
      ok: true;
      found: boolean;
      /** Time (s) of the best matching frame, when found. */
      time?: number;
      score?: number;
      keyframes: number;
      windows: number;
      elapsedMs: number;
    }
  | { ok: false; reason: string };

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMax: boolean) => void) => () => void;
  openMediaDialog: () => Promise<FolderScanResult | null>;
  openSubtitleDialog: () => Promise<NativeSubtitleFile | null>;
  getEmbeddedSubtitles: (filePath: string) => Promise<NativeSubtitleFile[]>;
  findFrame: (request: FindFrameRequest) => Promise<FindFrameResult>;
  cancelFindFrame: (id: string) => void;
  readFileAsText: (filePath: string) => Promise<string>;
  getStreamUrlForPath: (filePath: string) => string;
  getPathForFile: (file: File) => string;
  getInitialMedia: () => Promise<FolderScanResult | NativeMediaFile | null>;
  scanFolderMedia: (filePath: string) => Promise<FolderScanResult | null>;
  onCliOpenFile: (callback: (fileItem: FolderScanResult | NativeMediaFile) => void) => () => void;
  registerAssociations: (customExe?: string) => Promise<AssociationResult>;
  unregisterAssociations: () => Promise<AssociationResult>;
  checkAssociations: () => Promise<boolean>;
  openDefaultApps: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
