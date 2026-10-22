const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    const handler = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window-maximized-changed', handler);
    return () => {
      ipcRenderer.removeListener('window-maximized-changed', handler);
    };
  },
  openMediaDialog: () => ipcRenderer.invoke('dialog-open-media'),
  openSubtitleDialog: () => ipcRenderer.invoke('dialog-open-subtitles'),
  getEmbeddedSubtitles: (filePath) => ipcRenderer.invoke('get-embedded-subtitles', filePath),
  findFrame: (request) => ipcRenderer.invoke('find-frame', request),
  cancelFindFrame: (id) => ipcRenderer.send('find-frame-cancel', id),
  readFileAsText: (filePath) => ipcRenderer.invoke('read-file-text', filePath),
  getStreamUrlForPath: (filePath) => `zmt-media://stream?path=${encodeURIComponent(filePath)}`,
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {}
    return file?.path || '';
  },
  getInitialMedia: () => ipcRenderer.invoke('get-initial-media'),
  scanFolderMedia: (filePath) => ipcRenderer.invoke('scan-folder-media', filePath),
  onCliOpenFile: (callback) => {
    const handler = (_event, fileItem) => callback(fileItem);
    ipcRenderer.on('cli-open-file', handler);
    return () => {
      ipcRenderer.removeListener('cli-open-file', handler);
    };
  },
  registerAssociations: (customExe) => ipcRenderer.invoke('register-associations', customExe),
  unregisterAssociations: () => ipcRenderer.invoke('unregister-associations'),
  checkAssociations: () => ipcRenderer.invoke('check-associations'),
  openDefaultApps: () => ipcRenderer.invoke('open-default-apps'),
});
