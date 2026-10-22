const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { shell } = require('electron');

const SUPPORTED_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.webm',
  '.avi',
  '.mov',
  '.ts',
  '.m4v',
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
];

const PROG_ID = 'ZmtMediaPlayer.MediaFile';
const APP_TITLE = 'Zmt Media Player';

function getEffectiveExePath() {
  // If app is packaged, use the running executable path
  if (process.resourcesPath && !process.defaultApp) {
    return process.execPath;
  }

  // If in development or workspace, look for the compiled executable in release
  const candidates = [
    path.resolve(__dirname, '../release/win-unpacked/Zmt Media Player.exe'),
    path.resolve(process.cwd(), 'release/win-unpacked/Zmt Media Player.exe'),
    path.resolve(__dirname, '../release/Zmt Media Player 1.0.0.exe'),
    path.resolve(process.cwd(), 'release/Zmt Media Player 1.0.0.exe'),
    process.execPath,
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }

  return process.execPath;
}

function runRegCommand(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => {
      resolve({ success: !err, output: stdout });
    });
  });
}

function refreshWindowsShell() {
  try {
    // Notify Windows Explorer of association changes
    const psScript = `
      $sig = @'
      using System;
      using System.Runtime.InteropServices;
      public class ShellNotif {
          [DllImport("shell32.dll")]
          public static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
      }
'@
      Add-Type -TypeDefinition $sig
      [ShellNotif]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    `;
    execSync(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\r?\n/g, ' ')}"`, {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch (e) {
    // Fallback: continue even if SHChangeNotify fails
  }
}

async function registerAssociations(customExe) {
  if (process.platform !== 'win32') {
    return { success: false, message: 'File associations are only applicable on Windows.' };
  }

  const exePath = customExe || getEffectiveExePath();
  const iconPath = `"${exePath}",0`;
  const openCommand = `"${exePath}" "%1"`;

  const commands = [
    // 1. Base ProgID registration
    ['add', `HKCU\\Software\\Classes\\${PROG_ID}`, '/ve', '/d', 'Zmt Media Player File', '/f'],
    ['add', `HKCU\\Software\\Classes\\${PROG_ID}\\DefaultIcon`, '/ve', '/d', iconPath, '/f'],
    ['add', `HKCU\\Software\\Classes\\${PROG_ID}\\shell\\open\\command`, '/ve', '/d', openCommand, '/f'],

    // 2. Video Context Menu (Right Click -> Play with Zmt Media Player)
    ['add', `HKCU\\Software\\Classes\\SystemFileAssociations\\video\\shell\\ZmtMediaPlayer`, '/ve', '/d', 'Play with Zmt Media Player', '/f'],
    ['add', `HKCU\\Software\\Classes\\SystemFileAssociations\\video\\shell\\ZmtMediaPlayer`, '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${exePath}"`, '/f'],
    ['add', `HKCU\\Software\\Classes\\SystemFileAssociations\\video\\shell\\ZmtMediaPlayer\\command`, '/ve', '/d', openCommand, '/f'],

    // 3. Audio Context Menu (Right Click -> Play with Zmt Media Player)
    ['add', `HKCU\\Software\\Classes\\SystemFileAssociations\\audio\\shell\\ZmtMediaPlayer`, '/ve', '/d', 'Play with Zmt Media Player', '/f'],
    ['add', `HKCU\\Software\\Classes\\SystemFileAssociations\\audio\\shell\\ZmtMediaPlayer`, '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${exePath}"`, '/f'],
    ['add', `HKCU\\Software\\Classes\\SystemFileAssociations\\audio\\shell\\ZmtMediaPlayer\\command`, '/ve', '/d', openCommand, '/f'],

    // 4. Windows Registered Applications & Capabilities
    ['add', `HKCU\\Software\\RegisteredApplications`, '/v', APP_TITLE, '/t', 'REG_SZ', '/d', 'Software\\Clients\\Media\\ZmtMediaPlayer\\Capabilities', '/f'],
    ['add', `HKCU\\Software\\Clients\\Media\\ZmtMediaPlayer\\Capabilities`, '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', APP_TITLE, '/f'],
    ['add', `HKCU\\Software\\Clients\\Media\\ZmtMediaPlayer\\Capabilities`, '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', 'Ultra-fast hardware accelerated media player', '/f'],
  ];

  // 5. Register OpenWithProgids & Capabilities for each supported media extension
  for (const ext of SUPPORTED_EXTENSIONS) {
    commands.push(['add', `HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, '/v', PROG_ID, '/t', 'REG_SZ', '/d', '', '/f']);
    commands.push(['add', `HKCU\\Software\\Clients\\Media\\ZmtMediaPlayer\\Capabilities\\FileAssociations`, '/v', ext, '/t', 'REG_SZ', '/d', PROG_ID, '/f']);
  }

  // Execute all reg commands sequentially
  for (const cmd of commands) {
    await runRegCommand(cmd);
  }

  refreshWindowsShell();

  return {
    success: true,
    exePath,
    message: `Format media (${SUPPORTED_EXTENSIONS.join(', ')}) berhasil diasosiasikan ke ${APP_TITLE}.`,
  };
}

async function unregisterAssociations() {
  if (process.platform !== 'win32') return { success: false };

  const commands = [
    ['delete', `HKCU\\Software\\Classes\\${PROG_ID}`, '/f'],
    ['delete', `HKCU\\Software\\Classes\\SystemFileAssociations\\video\\shell\\ZmtMediaPlayer`, '/f'],
    ['delete', `HKCU\\Software\\Classes\\SystemFileAssociations\\audio\\shell\\ZmtMediaPlayer`, '/f'],
    ['delete', `HKCU\\Software\\RegisteredApplications`, '/v', APP_TITLE, '/f'],
    ['delete', `HKCU\\Software\\Clients\\Media\\ZmtMediaPlayer`, '/f'],
  ];

  for (const ext of SUPPORTED_EXTENSIONS) {
    commands.push(['delete', `HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, '/v', PROG_ID, '/f']);
  }

  for (const cmd of commands) {
    await runRegCommand(cmd);
  }

  refreshWindowsShell();

  return { success: true, message: 'File associations berhasil dihapus.' };
}

async function checkAssociationsRegistered() {
  if (process.platform !== 'win32') return false;
  const res = await runRegCommand(['query', `HKCU\\Software\\Classes\\${PROG_ID}`]);
  return res.success;
}

function openDefaultAppsSettings() {
  if (process.platform === 'win32') {
    shell.openExternal('ms-settings:defaultapps');
  }
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  PROG_ID,
  getEffectiveExePath,
  registerAssociations,
  unregisterAssociations,
  checkAssociationsRegistered,
  openDefaultAppsSettings,
};
