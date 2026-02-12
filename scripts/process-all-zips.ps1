$ErrorActionPreference = "Continue"
$aoib = "C:\Users\hajna\VoiceLibri\soundscape\assets\_archive\AOIB"
$ogg  = "C:\Users\hajna\VoiceLibri\soundscape\assets\_archive\aoib_ogg"
$py   = "C:\Users\hajna\VoiceLibri\.venv\Scripts\python.exe"
$conv = "C:\Users\hajna\VoiceLibri\scripts\convert_wav_to_ogg.py"
$7z   = "C:\Program Files\7-Zip\7z.exe"

$zips = Get-ChildItem $aoib -Filter "*.zip" | Where-Object { $_.Name -notmatch '\(\d+\)' } | Sort-Object Length

Write-Host "=== PROCESSING $($zips.Count) ZIPS ===" -ForegroundColor Cyan
Write-Host ""

$totalProcessed = 0
$totalFailed = 0

foreach ($zip in $zips) {
    $name = $zip.BaseName
    $zipPath = $zip.FullName
    $extractDir = Join-Path $aoib $name
    $oggDir = Join-Path $ogg $name
    $sizeMB = [math]::Round($zip.Length / 1MB)

    Write-Host "-------------------------------------------" -ForegroundColor DarkGray
    Write-Host ">> $name ($sizeMB MB)" -ForegroundColor Yellow

    $freeGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
    Write-Host "   Disk free: $freeGB GB" -ForegroundColor Gray

    if ($freeGB -lt 5) {
        Write-Host "   SKIPPED - less than 5 GB free!" -ForegroundColor Red
        $totalFailed++
        continue
    }

    # Extract if needed
    $needExtract = $true
    if (Test-Path $extractDir) {
        $wavCount = (Get-ChildItem $extractDir -Recurse -Filter "*.wav" -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($wavCount -gt 0) {
            Write-Host "   Already extracted ($wavCount WAVs)" -ForegroundColor Gray
            $needExtract = $false
        }
        else {
            Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    if ($needExtract) {
        Write-Host "   Extracting..." -ForegroundColor Cyan
        & $7z x $zipPath -o"$extractDir" -y -bsp0 -bso0 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   FAILED: 7-Zip exit code $LASTEXITCODE" -ForegroundColor Red
            $totalFailed++
            continue
        }
    }

    $wavCount = (Get-ChildItem $extractDir -Recurse -Filter "*.wav" -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host "   WAVs found: $wavCount" -ForegroundColor Gray

    if ($wavCount -eq 0) {
        Write-Host "   No WAV files found, skipping" -ForegroundColor Yellow
        continue
    }

    # Convert
    Write-Host "   Converting WAV to OGG..." -ForegroundColor Cyan
    & $py $conv $aoib $ogg --folder $name

    # Verify
    $oggCount = (Get-ChildItem $oggDir -Recurse -Filter "*.ogg" -ErrorAction SilentlyContinue | Measure-Object).Count
    $missing = $wavCount - $oggCount

    if ($missing -le 0) {
        Write-Host "   COMPLETE: $oggCount / $wavCount OGGs" -ForegroundColor Green
        $totalProcessed++
    }
    else {
        Write-Host "   INCOMPLETE: $oggCount / $wavCount ($missing missing) - retrying..." -ForegroundColor Yellow
        & $py $conv $aoib $ogg --folder $name
        $oggCount = (Get-ChildItem $oggDir -Recurse -Filter "*.ogg" -ErrorAction SilentlyContinue | Measure-Object).Count
        $missing = $wavCount - $oggCount
        if ($missing -le 0) {
            Write-Host "   COMPLETE after retry: $oggCount / $wavCount OGGs" -ForegroundColor Green
            $totalProcessed++
        }
        else {
            Write-Host "   STILL INCOMPLETE: $oggCount / $wavCount ($missing missing)" -ForegroundColor Red
            $totalFailed++
        }
    }

    # Cleanup extracted WAVs to free disk
    Write-Host "   Cleaning up extracted folder..." -ForegroundColor Gray
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $extractDir) {
        cmd /c "rmdir /s /q `"$extractDir`"" 2>$null
    }

    $freeGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
    Write-Host "   Disk free now: $freeGB GB" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "-------------------------------------------" -ForegroundColor DarkGray
Write-Host "=== DONE ===" -ForegroundColor Cyan
Write-Host "   Processed: $totalProcessed" -ForegroundColor Green
if ($totalFailed -gt 0) {
    Write-Host "   Failed:    $totalFailed" -ForegroundColor Red
}
else {
    Write-Host "   Failed:    0" -ForegroundColor Green
}

$finalOggs = (Get-ChildItem $ogg -Recurse -Filter "*.ogg" -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "   Total OGGs: $finalOggs" -ForegroundColor Cyan
