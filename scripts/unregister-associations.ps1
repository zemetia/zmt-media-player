# ==============================================================================
# Zmt Media Player - Windows File Associations Remover
# ==============================================================================

Write-Host "Menghapus asosiasi Zmt Media Player..." -ForegroundColor Yellow

$ProgId = "ZmtMediaPlayer.MediaFile"
$AppTitle = "Zmt Media Player"
$Extensions = @(
    ".mp4", ".mkv", ".webm", ".avi", ".mov", ".ts", ".m4v",
    ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"
)

Remove-Item -Path "HKCU:\Software\Classes\$ProgId" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\video\shell\ZmtMediaPlayer" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\audio\shell\ZmtMediaPlayer" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Clients\Media\ZmtMediaPlayer" -Recurse -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\RegisteredApplications" -Name $AppTitle -ErrorAction SilentlyContinue

foreach ($ext in $Extensions) {
    Remove-ItemProperty -Path "HKCU:\Software\Classes\$ext\OpenWithProgids" -Name $ProgId -ErrorAction SilentlyContinue
}

try {
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
} catch {}

Write-Host "[OK] Asosiasi file berhasil dibersihkan dari Registry." -ForegroundColor Green
