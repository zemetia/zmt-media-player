# ==============================================================================
# Zmt Media Player - Windows File Associations Registrar
# Associates video (.mp4, .mkv, .webm, .avi, .mov, etc.) & audio formats
# with Zmt Media Player under Current User (No Admin privileges required)
# ==============================================================================

param(
    [string]$TargetExe = ""
)

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Zmt Media Player - Windows Association Setup   " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = Split-Path -Parent $ScriptDir

# Auto-detect executable
if (-not $TargetExe -or -not (Test-Path $TargetExe)) {
    $Candidates = @(
        "$BaseDir\release\win-unpacked\Zmt Media Player.exe",
        "$BaseDir\release\Zmt Media Player 1.0.0.exe"
    )

    foreach ($cand in $Candidates) {
        if (Test-Path $cand) {
            $TargetExe = (Resolve-Path $cand).Path
            break
        }
    }
}

if (-not $TargetExe -or -not (Test-Path $TargetExe)) {
    Write-Host "[ERROR] Tidak dapat menemukan 'Zmt Media Player.exe'!" -ForegroundColor Red
    Write-Host "Silakan build aplikasi terlebih dahulu dengan: npm run electron:build" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Target Executable: $TargetExe" -ForegroundColor Green

$ProgId = "ZmtMediaPlayer.MediaFile"
$AppTitle = "Zmt Media Player"
$Extensions = @(
    ".mp4", ".mkv", ".webm", ".avi", ".mov", ".ts", ".m4v",
    ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"
)

# 1. Base ProgID
$progPath = "HKCU:\Software\Classes\$ProgId"
New-Item -Path $progPath -Force | Out-Null
Set-ItemProperty -Path $progPath -Name "(Default)" -Value "Zmt Media Player File"
New-Item -Path "$progPath\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$progPath\DefaultIcon" -Name "(Default)" -Value "`"$TargetExe`",0"
New-Item -Path "$progPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$progPath\shell\open\command" -Name "(Default)" -Value "`"$TargetExe`" `"%1`""

# 2. Explorer Context Menu: SystemFileAssociations for Video and Audio
$videoMenu = "HKCU:\Software\Classes\SystemFileAssociations\video\shell\ZmtMediaPlayer"
New-Item -Path "$videoMenu\command" -Force | Out-Null
Set-ItemProperty -Path $videoMenu -Name "(Default)" -Value "Play with Zmt Media Player"
Set-ItemProperty -Path $videoMenu -Name "Icon" -Value "`"$TargetExe`""
Set-ItemProperty -Path "$videoMenu\command" -Name "(Default)" -Value "`"$TargetExe`" `"%1`""

$audioMenu = "HKCU:\Software\Classes\SystemFileAssociations\audio\shell\ZmtMediaPlayer"
New-Item -Path "$audioMenu\command" -Force | Out-Null
Set-ItemProperty -Path $audioMenu -Name "(Default)" -Value "Play with Zmt Media Player"
Set-ItemProperty -Path $audioMenu -Name "Icon" -Value "`"$TargetExe`""
Set-ItemProperty -Path "$audioMenu\command" -Name "(Default)" -Value "`"$TargetExe`" `"%1`""

# 3. Windows Registered Applications & Capabilities
$capPath = "HKCU:\Software\Clients\Media\ZmtMediaPlayer\Capabilities"
New-Item -Path "$capPath\FileAssociations" -Force | Out-Null
Set-ItemProperty -Path $capPath -Name "ApplicationName" -Value $AppTitle
Set-ItemProperty -Path $capPath -Name "ApplicationDescription" -Value "Ultra-fast modern media player"

$regApp = "HKCU:\Software\RegisteredApplications"
New-Item -Path $regApp -Force | Out-Null
Set-ItemProperty -Path $regApp -Name $AppTitle -Value "Software\Clients\Media\ZmtMediaPlayer\Capabilities"

# 4. OpenWithProgids & Capabilities for extensions
foreach ($ext in $Extensions) {
    $openWithPath = "HKCU:\Software\Classes\$ext\OpenWithProgids"
    New-Item -Path $openWithPath -Force | Out-Null
    Set-ItemProperty -Path $openWithPath -Name $ProgId -Value ""
    Set-ItemProperty -Path "$capPath\FileAssociations" -Name $ext -Value $ProgId
    Write-Host "  -> Asosiasi format: $ext terdaftar" -ForegroundColor Gray
}

# 5. Notify Windows Explorer of association changes
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

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host " [SUKSES] Asosiasi file berhasil didaftarkan!" -ForegroundColor Green
Write-Host " Sekarang kamu bisa:" -ForegroundColor White
Write-Host " 1. Klik kanan file .mp4 / .mkv -> 'Play with Zmt Media Player'" -ForegroundColor Cyan
Write-Host " 2. Klik kanan file -> 'Open with' -> Pilih 'Zmt Media Player'" -ForegroundColor Cyan
Write-Host " 3. Atur default player di Windows Settings (Default Apps)" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Green
