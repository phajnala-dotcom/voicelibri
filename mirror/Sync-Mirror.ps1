<#
.SYNOPSIS
    Master sync script — generates context snapshot, uploads to Google Drive,
    and optionally pushes to a GitHub mini-repo.

.DESCRIPTION
    Single entry point for the full consultation mirror workflow:
    1. Generate context snapshot (VOICELIBRI_CONTEXT.md)
    2. Copy Gemini instruction file to output
    3. Upload to Google Drive via rclone
    4. Optionally create GitHub issues from discussion outputs

.PARAMETER SkipDrive
    Skip Google Drive upload (useful for testing generation only).

.PARAMETER GenerateOnly
    Only generate the context file, skip all uploads.

.PARAMETER Verbose
    Show detailed progress.

.EXAMPLE
    .\Sync-Mirror.ps1                    # Full sync: generate + Drive upload
    .\Sync-Mirror.ps1 -GenerateOnly      # Only generate context file
    .\Sync-Mirror.ps1 -SkipDrive         # Generate but skip Drive upload
#>

param(
    [switch]$SkipDrive,
    [switch]$GenerateOnly,
    [switch]$VerboseOutput
)

$ErrorActionPreference = "Stop"
$mirrorDir = $PSScriptRoot
$outputDir = Join-Path $mirrorDir "output"

Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host " VoiceLibri Consultation Mirror — Full Sync" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""

# ============================================================================
# STEP 1: Generate context snapshot
# ============================================================================
Write-Host "[1/3] Generating context snapshot..." -ForegroundColor Yellow
$generateParams = @{}
if ($VerboseOutput) { $generateParams["VerboseOutput"] = $true }

$result = & (Join-Path $mirrorDir "Generate-Context.ps1") @generateParams

if (-not $result -or -not (Test-Path (Join-Path $outputDir "VOICELIBRI_CONTEXT.md"))) {
    Write-Host "ERROR: Context generation failed!" -ForegroundColor Red
    exit 1
}

# ============================================================================
# STEP 2: Copy Gemini instruction to output
# ============================================================================
Write-Host "[2/3] Preparing output files..." -ForegroundColor Yellow

$geminiInstruction = Join-Path $mirrorDir "GEMINI_INSTRUCTION_SK.md"
if (Test-Path $geminiInstruction) {
    Copy-Item $geminiInstruction -Destination $outputDir -Force
    Write-Host "  Copied GEMINI_INSTRUCTION_SK.md to output" -ForegroundColor Cyan
}

# Copy discussion output template if not already in output
$templateSrc = Join-Path $mirrorDir "templates" "DISCUSSION_OUTPUT_TEMPLATE.md"
if (Test-Path $templateSrc) {
    $templateDest = Join-Path $outputDir "DISCUSSION_OUTPUT_TEMPLATE.md"
    if (-not (Test-Path $templateDest)) {
        Copy-Item $templateSrc -Destination $templateDest -Force
        Write-Host "  Copied discussion output template to output" -ForegroundColor Cyan
    }
}

$outputFiles = Get-ChildItem -Path $outputDir -File
Write-Host "  Output directory contains $($outputFiles.Count) file(s):" -ForegroundColor Cyan
foreach ($f in $outputFiles) {
    $sizeKB = [math]::Round($f.Length / 1KB, 1)
    Write-Host "    - $($f.Name) (${sizeKB} KB)" -ForegroundColor Gray
}

if ($GenerateOnly) {
    Write-Host ""
    Write-Host "GenerateOnly mode — skipping uploads." -ForegroundColor Yellow
    Write-Host "Output: $outputDir" -ForegroundColor Green
    exit 0
}

# ============================================================================
# STEP 3: Upload to Google Drive
# ============================================================================
if (-not $SkipDrive) {
    Write-Host "[3/3] Syncing to Google Drive..." -ForegroundColor Yellow
    & (Join-Path $mirrorDir "Sync-Drive.ps1")
} else {
    Write-Host "[3/3] Skipped Google Drive upload." -ForegroundColor DarkYellow
}

# ============================================================================
# DONE
# ============================================================================
Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host " Sync Complete!" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  Context: $outputDir\VOICELIBRI_CONTEXT.md"
Write-Host "  Session: $($result.SessionKey)"
Write-Host "  Size:    $($result.SizeMB) MB"
Write-Host ""
