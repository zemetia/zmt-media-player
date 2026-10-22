const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const associations = require('./associations.cjs');
const embeddedSubtitles = require('./embeddedSubtitles.cjs');
const frameFinder = require('./frameFinder.cjs');

// Single instance lock to prevent duplicate conflicting player windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Register privileged custom scheme for zero-copy local media streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'zmt-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

// Enable hardware video acceleration flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let mainWindow = null;
let pendingInitialMediaItem = null;

const MIME_TYPES = {
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

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function parseHttpRange(rangeHeader, fileSize) {
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

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { width: 1200, height: 800, isMaximized: false };
  }
}

function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const isMax = win.isMaximized();
    // Use getNormalBounds if maximized to avoid saving maximized screen coordinates
    const bounds = (isMax && typeof win.getNormalBounds === 'function')
      ? win.getNormalBounds()
      : win.getBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: isMax,
    };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

function extractMediaArgFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (let i = 1; i < argv.length; i++) {
    let arg = argv[i];
    if (!arg || typeof arg !== 'string') continue;
    arg = arg.trim().replace(/^["']|["']$/g, '');
    if (arg.startsWith('--') || arg.startsWith('-')) continue;
    if (arg === '.' || arg.endsWith('main.cjs') || arg.endsWith('main.js')) continue;

    const ext = path.extname(arg).toLowerCase();
    if (MIME_TYPES[ext]) {
      try {
        const resolved = path.resolve(arg);
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      } catch {}
    }
  }
  return null;
}

function buildMediaItem(filePath, isTarget = false) {
  const stat = fs.statSync(filePath);
  const name = path.basename(filePath);
  const dir = path.dirname(filePath);
  const baseNameWithoutExt = path.basename(filePath, path.extname(filePath));
  const subtitles = [];

  // Auto-detect matching subtitles in the same folder
  try {
    const files = fs.readdirSync(dir);
    const subExts = ['.srt', '.vtt', '.ass', '.ssa'];
    for (const f of files) {
      const fileExt = path.extname(f).toLowerCase();
      if (subExts.includes(fileExt)) {
        const fileBase = path.basename(f, fileExt);
        if (fileBase === baseNameWithoutExt || fileBase.startsWith(baseNameWithoutExt + '.')) {
          const subPath = path.join(dir, f);
          try {
            const content = fs.readFileSync(subPath, 'utf-8');
            subtitles.push({
              id: `auto-sub-${f}`,
              name: f,
              label: f,
              language: f.toLowerCase().includes('id') || f.toLowerCase().includes('ina') ? 'id' : 'default',
              path: subPath,
              content,
              isEmbedded: false,
            });
          } catch {}
        }
      }
    }
  } catch {}

  // Auto-detect embedded subtitles inside MP4/MOV if this is the target/active video
  if (isTarget) {
    try {
      const embedded = embeddedSubtitles.extractWithPureJs(filePath);
      if (Array.isArray(embedded) && embedded.length > 0) {
        subtitles.push(...embedded);
      }
    } catch (e) {
      console.warn('Sync embedded subtitles probe failed:', e);
    }
  }

  return {
    name,
    path: filePath,
    size: stat.size,
    url: `zmt-media://stream?path=${encodeURIComponent(filePath)}`,
    subtitles,
  };
}

function scanFolderMedia(targetFilePath) {
  if (!targetFilePath) return null;
  try {
    const targetResolved = path.resolve(targetFilePath);
    if (!fs.existsSync(targetResolved)) return null;
    const targetStat = fs.statSync(targetResolved);
    if (!targetStat.isFile()) return null;

    const dir = path.dirname(targetResolved);
    const targetExt = path.extname(targetResolved).toLowerCase();
    const isTargetAudio = MIME_TYPES[targetExt]?.startsWith('audio/');

    // Allowed extensions in folder scan (non-recursive, no subfolders)
    const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
    const allowedExts = isTargetAudio ? audioExts : videoExts;

    let fileNames = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      // Filter top-level files only, gausah scan subfolder
      fileNames = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => {
          const ext = path.extname(name).toLowerCase();
          return allowedExts.includes(ext);
        });
    } catch (err) {
      console.error('Failed to read directory:', dir, err);
      return {
        items: [buildMediaItem(targetResolved, true)],
        activeIndex: 0,
        folder: dir,
      };
    }

    // Natural alphanumeric sorting by name
    fileNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const items = [];
    let activeIndex = 0;

    for (let i = 0; i < fileNames.length; i++) {
      const fileName = fileNames[i];
      const fullPath = path.join(dir, fileName);
      try {
        const isTarget = fullPath.toLowerCase() === targetResolved.toLowerCase();
        const item = buildMediaItem(fullPath, isTarget);
        items.push(item);
        if (isTarget) {
          activeIndex = items.length - 1;
        }
      } catch (e) {
        console.error('Failed to build media item for', fullPath, e);
      }
    }

    // Fallback if target was not matched
    if (items.length === 0) {
      items.push(buildMediaItem(targetResolved, true));
      activeIndex = 0;
    }

    return {
      items,
      activeIndex,
      folder: dir,
    };
  } catch (err) {
    console.error('scanFolderMedia failed:', err);
    return null;
  }
}

function sendFileToWindow(win, filePath) {
  if (!win || !filePath) return;
  try {
    const scanResult = scanFolderMedia(filePath);
    if (scanResult && scanResult.items.length > 0) {
      win.webContents.send('cli-open-file', scanResult);
    }
  } catch (e) {
    console.error('Failed to send file to window:', e);
  }
}

function registerProtocolHandler() {
  protocol.handle('zmt-media', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        return new Response('Missing file path', { status: 400 });
      }

      const stat = await fs.promises.stat(filePath);
      const mimeType = getMimeType(filePath);
      const rangeHeader = request.headers.get('range');

      const commonHeaders = {
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      };

      if (rangeHeader) {
        const range = parseHttpRange(rangeHeader, stat.size);
        if (!range || range.status === 416) {
          return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: {
              ...commonHeaders,
              'Content-Range': `bytes */${stat.size}`,
            },
          });
        }

        const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
        const webStream = Readable.toWeb(stream);

        return new Response(webStream, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            ...commonHeaders,
            'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
            'Content-Length': String(range.chunkSize),
          },
        });
      } else {
        const stream = fs.createReadStream(filePath);
        const webStream = Readable.toWeb(stream);

        return new Response(webStream, {
          status: 200,
          headers: {
            ...commonHeaders,
            'Content-Length': String(stat.size),
          },
        });
      }
    } catch (err) {
      console.error('Protocol handle error:', err);
      return new Response('File error: ' + (err.message || 'unknown'), { status: 404 });
    }
  });
}

function createWindow() {
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width || 1200,
    height: windowState.height || 800,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 540,
    frame: false, // Custom frameless window controls
    titleBarStyle: 'hidden',
    backgroundColor: '#070a10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Gracefully show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Dispatch initial file if present
    if (pendingInitialMediaItem) {
      mainWindow.webContents.send('cli-open-file', pendingInitialMediaItem);
    }
  });

  // Track state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-changed', false);
  });
  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
  });

  // Safe external navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Check startup media file from CLI arguments
const initialMediaFile = extractMediaArgFromArgv(process.argv);
if (initialMediaFile) {
  try {
    pendingInitialMediaItem = scanFolderMedia(initialMediaFile);
  } catch (e) {
    console.error('Failed to process startup media file:', e);
  }
}

// Second instance handling (e.g. user double-clicked another video in Windows Explorer)
app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    const mediaFile = extractMediaArgFromArgv(commandLine);
    if (mediaFile) {
      sendFileToWindow(mainWindow, mediaFile);
    }
  }
});

// IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Initial media request by renderer on startup
ipcMain.handle('get-initial-media', () => {
  const item = pendingInitialMediaItem;
  pendingInitialMediaItem = null;
  return item;
});

// Scan folder for sibling media files (non-recursive)
ipcMain.handle('scan-folder-media', async (_event, filePath) => {
  return scanFolderMedia(filePath);
});

// Windows File Associations Registration IPC
ipcMain.handle('register-associations', async (_event, customExe) => {
  return await associations.registerAssociations(customExe);
});

ipcMain.handle('unregister-associations', async () => {
  return await associations.unregisterAssociations();
});

ipcMain.handle('check-associations', async () => {
  return await associations.checkAssociationsRegistered();
});

ipcMain.handle('open-default-apps', () => {
  associations.openDefaultAppsSettings();
});

// Dialog: Open Media Files (Videos / Audio)
ipcMain.handle('dialog-open-media', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Media Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'All Supported Media',
        extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
      },
      {
        name: 'Video Files',
        extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm4v'],
      },
      {
        name: 'Audio Files',
        extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  // If 1 file was chosen, scan its folder to populate all sibling videos in natural order
  if (result.filePaths.length === 1) {
    const scanResult = scanFolderMedia(result.filePaths[0]);
    if (scanResult && scanResult.items.length > 0) {
      return scanResult;
    }
  }

  // If multiple files selected, sort and build items
  const sortedPaths = [...result.filePaths].sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
  );
  const items = [];
  for (let i = 0; i < sortedPaths.length; i++) {
    const filePath = sortedPaths[i];
    try {
      const item = buildMediaItem(filePath, i === 0);
      items.push(item);
    } catch (e) {
      console.error('Failed to build media item:', filePath, e);
    }
  }
  return { items, activeIndex: 0 };
});

// Dialog: Open Subtitle File
ipcMain.handle('dialog-open-subtitles', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Subtitle File',
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle Files', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const name = path.basename(filePath);
    return {
      name,
      path: filePath,
      content,
    };
  } catch (err) {
    console.error('Failed to read subtitle file:', filePath, err);
    return null;
  }
});

// Read file text helper
ipcMain.handle('read-file-text', async (_event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (e) {
    console.error('read-file-text failed:', e);
    throw e;
  }
});

// Extract embedded subtitles helper (FFmpeg + pure JS fallback)
ipcMain.handle('get-embedded-subtitles', async (_event, filePath) => {
  try {
    return await embeddedSubtitles.getEmbeddedSubtitles(filePath);
  } catch (e) {
    console.error('get-embedded-subtitles failed:', e);
    return [];
  }
});

// Fast screenshot -> frame locator for intro/outro detection (ffmpeg keyframe pass + local refine)
const frameFindControllers = new Map();

ipcMain.handle('find-frame', async (_event, req) => {
  const { id, filePath, duration, kind, gray, sensitivity, budgetMs } = req || {};
  try {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !fs.existsSync(filePath)) {
      return { ok: false, reason: 'bad-file' };
    }
    if (!(duration > 0) || (kind !== 'intro' && kind !== 'outro') || typeof gray !== 'string') {
      return { ok: false, reason: 'bad-request' };
    }
    const grayBytes = Buffer.from(gray, 'base64');
    if (grayBytes.length !== frameFinder.FINE_W * frameFinder.FINE_H) {
      return { ok: false, reason: 'bad-reference' };
    }
    const { ffmpeg } = await embeddedSubtitles.findFfmpegBinaries();
    if (!ffmpeg) return { ok: false, reason: 'no-ffmpeg' };

    const controller = new AbortController();
    if (id) frameFindControllers.set(id, controller);
    const timer = setTimeout(() => controller.abort(), budgetMs > 0 ? budgetMs : 60000);
    try {
      const res = await frameFinder.findFrame({
        ffmpeg,
        filePath,
        duration,
        kind,
        gray: new Uint8Array(grayBytes),
        sensitivity,
        signal: controller.signal,
      });
      return { ok: true, ...res };
    } finally {
      clearTimeout(timer);
      if (id) frameFindControllers.delete(id);
    }
  } catch (e) {
    return { ok: false, reason: e?.message === 'aborted' ? 'aborted' : String(e?.message || e) };
  }
});

ipcMain.on('find-frame-cancel', (_event, id) => {
  frameFindControllers.get(id)?.abort();
});

app.whenReady().then(async () => {
  registerProtocolHandler();
  createWindow();

  // If running on Windows, verify/register file associations automatically in background
  if (process.platform === 'win32') {
    try {
      const isRegistered = await associations.checkAssociationsRegistered();
      if (!isRegistered) {
        await associations.registerAssociations();
      }
    } catch (e) {
      console.error('Automatic association check error:', e);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
