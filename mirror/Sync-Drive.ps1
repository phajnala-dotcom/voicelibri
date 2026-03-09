<#
.SYNOPSIS
    Upload VoiceLibri context snapshot to Google Drive for Gemini Live consultation.

.DESCRIPTION
    Uses rclone to sync the context snapshot and Gemini instruction files
    to a Google Drive folder. Rclone must be installed and configured with
    a remote named "gdrive" (or specify via -RemoteName).

    First-time setup:
    1. Install rclone: winget install Rclone.Rclone
    2. Configure: rclone config
       - Choose "Google Drive"
       - Name it "gdrive"
       - Follow OAuth flow

.PARAMETER RemoteName
    Name of the rclone remote. Default: "gdrive"

.PARAMETER DriveFolderPath
    Path within Google Drive. Default: "VoiceLibri/consultation-mirror"

.PARAMETER SourceDir
    Local directory to upload. Default: mirror/output/

.EXAMPLE
    .\Sync-Drive.ps1
    .\Sync-Drive.ps1 -RemoteName "mygdrive" -DriveFolderPath "MyProject/mirror"
#>

param(
    [string]$RemoteName = "gdrive",
    [string]$DriveFolderPath = "VoiceLibri/consultation-mirror",
    [string]$SourceDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $SourceDir) {
    $SourceDir = Join-Path $PSScriptRoot "output"
}

# Check rclone is available
$rclone = Get-Command rclone -ErrorAction SilentlyContinue
if (-not $rclone) {
    Write-Host ""
    Write-Host "ERROR: rclone is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it with:" -ForegroundColor Yellow
    Write-Host "  winget install Rclone.Rclone" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Then configure Google Drive:" -ForegroundColor Yellow
    Write-Host "  rclone config" -ForegroundColor Cyan
    Write-Host "  -> New remote -> name: gdrive -> type: Google Drive" -ForegroundColor Cyan
    Write-Host "  -> Follow OAuth browser flow" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Check remote exists
$remotes = rclone listremotes 2>&1
if ($remotes -notmatch "${RemoteName}:") {
    Write-Host ""
    Write-Host "ERROR: rclone remote '$RemoteName' not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Available remotes:" -ForegroundColor Yellow
    rclone listremotes
    Write-Host ""
    Write-Host "Configure with: rclone config" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Check source directory
if (-not (Test-Path $SourceDir)) {
    Write-Host "ERROR: Source directory not found: $SourceDir" -ForegroundColor Red
    Write-Host "Run Generate-Context.ps1 first." -ForegroundColor Yellow
    exit 1
}

$files = Get-ChildItem -Path $SourceDir -File
if ($files.Count -eq 0) {
    Write-Host "ERROR: No files in $SourceDir to upload." -ForegroundColor Red
    Write-Host "Run Generate-Context.ps1 first." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Google Drive Sync" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Remote:      ${RemoteName}:${DriveFolderPath}"
Write-Host "  Source:      $SourceDir"
Write-Host "  Files:       $($files.Count)"
Write-Host ""

# Sync files to Drive
Write-Host "Uploading to Google Drive..." -ForegroundColor Yellow
rclone sync $SourceDir "${RemoteName}:${DriveFolderPath}" --progress --transfers 4

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Upload Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Files synced to: ${RemoteName}:${DriveFolderPath}"
    Write-Host ""
    Write-Host "  In Gemini Live, reference:" -ForegroundColor Yellow
    Write-Host "  'Pozri subor VOICELIBRI_CONTEXT.md na mojom Google Drive'" -ForegroundColor Cyan
    Write-Host "  'v priecinku VoiceLibri/consultation-mirror'" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "ERROR: rclone sync failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
