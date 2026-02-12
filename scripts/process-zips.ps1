param(
    [string]$TargetDir = (Get-Location).Path,
    [string[]]$KeepExtensions = @("waw","wav","mp3")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $TargetDir)) {
    throw "TargetDir not found: $TargetDir"
}

function Clean-Name([string]$name) {
    $clean = $name
    $clean = $clean -replace "(?i)zapsplat_pack_", ""
    $clean = $clean -replace "(?i)zapsplat[ _-]*", ""
    $clean = $clean -replace "(?i)_waw", ""
    $clean = $clean -replace "(?i)_wav", ""
    $clean = $clean -replace "(?i)audiohero_pack_", ""
    return $clean
}

function Get-UniquePath([string]$basePath) {
    if (-not (Test-Path -LiteralPath $basePath)) {
        return $basePath
    }
    $i = 1
    while ($true) {
        $candidate = "${basePath}_$i"
        if (-not (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
        $i++
    }
}

function Get-ShortExtractDir([string]$zipBaseName) {
    $safe = Clean-Name $zipBaseName
    $safe = $safe -replace "[^a-zA-Z0-9_-]", "_"
    if ([string]::IsNullOrWhiteSpace($safe)) {
        $safe = "zip"
    }
    $base = Join-Path $env:TEMP ("vl_zip_{0}" -f $safe)
    return (Get-UniquePath $base)
}

function Remove-MacosxDirs([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        return
    }
    $macDirs = Get-ChildItem -LiteralPath $path -Directory -Recurse -Force | Where-Object {
        $_.Name -like "*_MACOSX*" -or $_.Name -like "__MACOSX*" -or $_.Name -like "_MACOSX*"
    }
    foreach ($dir in $macDirs) {
        Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$zipFiles = Get-ChildItem -LiteralPath $TargetDir -File -Filter "*.zip" | Sort-Object Name
if (@($zipFiles).Count -eq 0) {
    Write-Host "No .zip files found in $TargetDir"
    exit 0
}

Remove-MacosxDirs $TargetDir

foreach ($zip in $zipFiles) {
    Write-Host "Processing: $($zip.Name)"
    $extractDir = Get-ShortExtractDir $zip.BaseName
    $movedTargets = @()

    $hadError = $false
    try {
        Expand-Archive -LiteralPath $zip.FullName -DestinationPath $extractDir -Force -ErrorAction Stop
    } catch {
        $hadError = $true
        Write-Warning "Expand failed: $($zip.Name) - $($_.Exception.Message)"
    }

    Remove-MacosxDirs $extractDir
    Remove-MacosxDirs $TargetDir

    $dirs = Get-ChildItem -LiteralPath $extractDir -Directory -Recurse -Force | Sort-Object FullName -Descending
    foreach ($dir in $dirs) {
        $newName = Clean-Name $dir.Name
        if ($newName -ne $dir.Name) {
            $newPath = Join-Path $dir.Parent.FullName $newName
            $newPath = Get-UniquePath $newPath
            Rename-Item -LiteralPath $dir.FullName -NewName (Split-Path $newPath -Leaf) -ErrorAction SilentlyContinue
        }
    }

    $keep = $KeepExtensions | ForEach-Object { $_.ToLower() }
    $files = Get-ChildItem -LiteralPath $extractDir -File -Recurse -Force
    foreach ($file in $files) {
        $cleanFileName = Clean-Name $file.Name
        if ($cleanFileName -ne $file.Name) {
            $newPath = Join-Path $file.Directory.FullName $cleanFileName
            $newPath = Get-UniquePath $newPath
            Rename-Item -LiteralPath $file.FullName -NewName (Split-Path $newPath -Leaf) -ErrorAction SilentlyContinue
            $file = Get-Item -LiteralPath $newPath -ErrorAction SilentlyContinue
            if (-not $file) {
                continue
            }
        }
        $ext = $file.Extension.TrimStart('.').ToLower()
        if ($keep -notcontains $ext) {
            Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
        }
    }

    $subDirs = Get-ChildItem -LiteralPath $extractDir -Directory -Force
    foreach ($subDir in $subDirs) {
        $destPath = Join-Path $TargetDir $subDir.Name
        $destPath = Get-UniquePath $destPath
        Move-Item -LiteralPath $subDir.FullName -Destination $destPath
        $movedTargets += $destPath
    }

    $looseFiles = @(Get-ChildItem -LiteralPath $extractDir -File -Force)
    if ($looseFiles.Count -gt 0) {
        $fallbackDir = Get-UniquePath (Join-Path $TargetDir (Clean-Name $zip.BaseName))
        New-Item -ItemType Directory -Path $fallbackDir | Out-Null
        foreach ($file in $looseFiles) {
            Move-Item -LiteralPath $file.FullName -Destination $fallbackDir
        }
        $movedTargets += $fallbackDir
    }

    $leftAudio = @(Get-ChildItem -LiteralPath $extractDir -File -Recurse -Force | Where-Object {
        $ext = $_.Extension.TrimStart('.').ToLower()
        $keep -contains $ext
    })

    if ($leftAudio.Count -eq 0) {
        Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Warning "Audio still inside: $extractDir"
    }

    Remove-Item -LiteralPath $zip.FullName -Force -ErrorAction SilentlyContinue

    foreach ($target in $movedTargets) {
        if (-not (Test-Path -LiteralPath $target)) {
            continue
        }
        $audioFiles = Get-ChildItem -LiteralPath $target -File -Recurse -Force -Include *.wav,*.waw,*.mp3
        foreach ($audio in $audioFiles) {
            $cleanAudioName = Clean-Name $audio.Name
            if ($cleanAudioName -ne $audio.Name) {
                $newAudioPath = Join-Path $audio.Directory.FullName $cleanAudioName
                $newAudioPath = Get-UniquePath $newAudioPath
                Rename-Item -LiteralPath $audio.FullName -NewName (Split-Path $newAudioPath -Leaf) -ErrorAction SilentlyContinue
            }
        }
    }

    if ($hadError) {
        Write-Warning "Finished with errors: $($zip.Name)"
    }
}

Remove-MacosxDirs $TargetDir

Write-Host "Done."
