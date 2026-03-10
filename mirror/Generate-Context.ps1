<#
.SYNOPSIS
    VoiceLibri Consultation Mirror - Context Snapshot Generator
    Generates a single comprehensive Markdown file from key source files
    for use with Gemini Live voice consultation and NotebookLM.

.DESCRIPTION
    This script scans the VoiceLibri repository and assembles a curated
    context snapshot file (VOICELIBRI_CONTEXT.md) containing:
    - Anti-hallucination grounding block
    - Architecture overview
    - Current development state
    - Key source code files (concatenated with headers)
    - API reference
    - Configuration files

    The output is optimized for LLM consumption (Gemini 1M+ token context).

.PARAMETER OutputPath
    Path where the context file will be written. Default: mirror/output/VOICELIBRI_CONTEXT.md

.PARAMETER RepoRoot
    Root of the VoiceLibri repository. Default: parent of this script's directory.

.PARAMETER MaxFileSizeKB
    Maximum size of individual source files to include (KB). Default: 150

.PARAMETER Verbose
    Show detailed progress output.

.EXAMPLE
    .\Generate-Context.ps1
    .\Generate-Context.ps1 -OutputPath "C:\temp\context.md"
#>

param(
    [string]$OutputPath = "",
    [string]$RepoRoot = "",
    [int]$MaxFileSizeKB = 150,
    [switch]$VerboseOutput
)

# ============================================================================
# CONFIGURATION
# ============================================================================

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if (-not $OutputPath) {
    $OutputPath = Join-Path (Join-Path $PSScriptRoot "output") "VOICELIBRI_CONTEXT.md"
}

# Ensure output directory exists
$outputDir = Split-Path $OutputPath -Parent
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Session key for anti-hallucination verification
$sessionDate = Get-Date -Format "yyyy-MM-dd"
$sessionKey = "VL-MIRROR-" + (Get-Date -Format "yyyyMMdd-HHmm")

$gitBranch = git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>$null
if (-not $gitBranch) { $gitBranch = "unknown" }
$gitCommit = git -C $RepoRoot rev-parse --short HEAD 2>$null
if (-not $gitCommit) { $gitCommit = "unknown" }
$gitCommitDate = git -C $RepoRoot log -1 --format="%ci" 2>$null
if (-not $gitCommitDate) { $gitCommitDate = "unknown" }

# ============================================================================
# KEY FILES SELECTION - Curated list of architecturally important files
# ============================================================================

# Categories with relative paths from repo root
$keyFiles = @{
    # --- BACKEND CORE (the engine) ---
    "Backend: Main Server (API routes, middleware, pipeline orchestration)" = @(
        "apps/backend/src/index.ts"
    )
    "Backend: TTS Client (Gemini TTS integration, multi-speaker synthesis)" = @(
        "apps/backend/src/ttsClient.ts"
    )
    "Backend: Book Chunker (text splitting, byte-limit compliance)" = @(
        "apps/backend/src/bookChunker.ts"
    )
    "Backend: Chapter Chunker (chapter-level splitting)" = @(
        "apps/backend/src/chapterChunker.ts"
    )
    "Backend: Two-Speaker Chunker (Gemini 2-speaker limit enforcement)" = @(
        "apps/backend/src/twoSpeakerChunker.ts"
    )
    "Backend: Temp Chunk Manager (chunk caching, WAV generation, retry logic)" = @(
        "apps/backend/src/tempChunkManager.ts"
    )
    "Backend: Audiobook Manager (file system, library management)" = @(
        "apps/backend/src/audiobookManager.ts"
    )
    "Backend: Audiobook Worker (background generation, parallel processing)" = @(
        "apps/backend/src/audiobookWorker.ts"
    )
    "Backend: Hybrid Dramatizer (LLM-powered character analysis orchestration)" = @(
        "apps/backend/src/hybridDramatizer.ts"
    )
    "Backend: LLM Character Analyzer (character extraction, dialogue attribution)" = @(
        "apps/backend/src/llmCharacterAnalyzer.ts"
    )
    "Backend: Character Registry (voice-to-character mapping persistence)" = @(
        "apps/backend/src/characterRegistry.ts"
    )
    "Backend: Hybrid Tagger (dialogue tagging with [VOICE=X] markers)" = @(
        "apps/backend/src/hybridTagger.ts"
    )
    "Backend: Gemini Voices (voice catalog, gender/style metadata)" = @(
        "apps/backend/src/geminiVoices.ts"
    )
    "Backend: Voice Assigner (character-to-voice mapping logic)" = @(
        "apps/backend/src/voiceAssigner.ts"
    )
    "Backend: Format Extractors (EPUB, TXT, PDF, DOCX parsing)" = @(
        "apps/backend/src/formatExtractors.ts"
    )
    "Backend: Prompt Config (LLM prompt templates for dramatization)" = @(
        "apps/backend/src/promptConfig.ts"
    )
    "Backend: Cost Tracker (API usage monitoring)" = @(
        "apps/backend/src/costTracker.ts"
    )
    "Backend: Text Cleaner (pre-processing, normalization)" = @(
        "apps/backend/src/textCleaner.ts"
    )

    # --- MOBILE APP (React Native / Expo) ---
    "Mobile: Root Layout (providers, navigation setup)" = @(
        "apps/mobile/app/_layout.tsx"
    )
    "Mobile: Tab Layout (bottom navigation config)" = @(
        "apps/mobile/app/(tabs)/_layout.tsx"
    )
    "Mobile: Explore Screen (home/browse)" = @(
        "apps/mobile/app/(tabs)/index.tsx"
    )
    "Mobile: Library Screen (user's audiobook collection)" = @(
        "apps/mobile/app/(tabs)/library.tsx"
    )
    "Mobile: Settings Screen" = @(
        "apps/mobile/app/(tabs)/settings.tsx"
    )
    "Mobile: Audio Player Screen (playback UI)" = @(
        "apps/mobile/app/player.tsx"
    )
    "Mobile: Create Audiobook Sheet (book upload, generation trigger)" = @(
        "apps/mobile/src/components/ui/CreateAudiobookSheet.tsx"
    )
    "Mobile: Audio Service (playback engine)" = @(
        "apps/mobile/src/services/audioService.ts"
    )
    "Mobile: Audio Storage Service (download, offline)" = @(
        "apps/mobile/src/services/audioStorageService.ts"
    )
    "Mobile: VoiceLibri API Client (backend integration)" = @(
        "apps/mobile/src/services/voiceLibriApi.ts"
    )
    "Mobile: Catalog Service (audiobook catalog)" = @(
        "apps/mobile/src/services/catalogService.ts"
    )
    "Mobile: Book Store (Zustand state)" = @(
        "apps/mobile/src/stores/bookStore.ts"
    )
    "Mobile: Player Store (Zustand state)" = @(
        "apps/mobile/src/stores/playerStore.ts"
    )
    "Mobile: Theme System" = @(
        "apps/mobile/src/theme/index.ts"
    )

    # --- CONFIGURATION ---
    "Config: Root package.json (workspace structure)" = @(
        "package.json"
    )
    "Config: Backend package.json (dependencies)" = @(
        "apps/backend/package.json"
    )
    "Config: Mobile app.json (Expo config)" = @(
        "apps/mobile/app.json"
    )
    "Config: Backend TypeScript config" = @(
        "apps/backend/tsconfig.json"
    )
}

# Documentation files to include as-is (not as code blocks)
$docFiles = @(
    "docs/DEV_MANUAL_PART1_ARCHITECTURE.md"
    "docs/DEV_MANUAL_PART2_API_BACKEND.md"
)

# ============================================================================
# GENERATOR
# ============================================================================

function Write-Status($msg) {
    if ($VerboseOutput) { Write-Host "  [*] $msg" -ForegroundColor Cyan }
}

function Get-FileContent($relPath) {
    $fullPath = Join-Path $RepoRoot $relPath
    if (Test-Path $fullPath) {
        $sizeKB = [math]::Round((Get-Item $fullPath).Length / 1KB, 1)
        if ($sizeKB -gt $MaxFileSizeKB) {
            Write-Status "SKIP (too large: ${sizeKB}KB): $relPath"
            return $null
        }
        Write-Status "Including (${sizeKB}KB): $relPath"
        return Get-Content $fullPath -Raw -Encoding UTF8
    } else {
        Write-Status "MISSING: $relPath"
        return $null
    }
}

function Get-LanguageTag($filePath) {
    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    switch ($ext) {
        ".ts"   { return "typescript" }
        ".tsx"  { return "tsx" }
        ".json" { return "json" }
        ".js"   { return "javascript" }
        ".md"   { return "markdown" }
        ".css"  { return "css" }
        ".ps1"  { return "powershell" }
        default { return "" }
    }
}

# ============================================================================
# BUILD OUTPUT
# ============================================================================

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " VoiceLibri Context Snapshot Generator" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Repository: $RepoRoot"
Write-Host "  Branch:     $gitBranch"
Write-Host "  Commit:     $gitCommit ($gitCommitDate)"
Write-Host "  Output:     $OutputPath"
Write-Host ""

$sb = [System.Text.StringBuilder]::new()

# --- GROUNDING BLOCK (anti-hallucination) ---
[void]$sb.AppendLine(@"
# VOICELIBRI — COMPLETE SYSTEM CONTEXT SNAPSHOT

> **⚠️ CRITICAL GROUNDING DIRECTIVE**
> This document is the SINGLE SOURCE OF TRUTH for VoiceLibri's codebase.
> You MUST base ALL answers exclusively on the information in this document.
> Do NOT hallucinate features, files, APIs, or architecture that are not described here.
> If something is not mentioned in this document, state: "This is not covered in the current context snapshot."

**Session Key:** ``$sessionKey``
**Generated:** $sessionDate
**Branch:** ``$gitBranch``
**Commit:** ``$gitCommit`` ($gitCommitDate)
**Generator:** mirror/Generate-Context.ps1

---

## VERIFICATION

If asked "What is the VoiceLibri session key?" — the answer is: **$sessionKey**
If you cannot answer this, you have NOT loaded this document. Stop and ask the user to provide it.

---

## WHAT VOICELIBRI IS

VoiceLibri is a **commercial-grade AI-powered multi-voice dramatized audiobook platform** that transforms ebooks into immersive audio experiences with distinct character voices.

**Tech Stack:**
- Backend: Express + TypeScript, Google Vertex AI (Gemini TTS)
- Mobile: React Native + Expo SDK 54, expo-router, TanStack Query, Zustand
- PWA (legacy/testing): React 18 + Vite + Tailwind

**Workspace:** npm monorepo with ``apps/backend/``, ``apps/mobile/``, ``apps/pwa-v2/``

## WHAT DOES NOT EXIST YET (do NOT hallucinate these)

- ❌ No user authentication / login system
- ❌ No payment/subscription system
- ❌ No cloud deployment (runs locally on dev machine only)
- ❌ No database (file-based storage + in-memory state)
- ❌ No real-time WebSocket communication
- ❌ No PDF support (partially implemented)
- ❌ No multi-user support
- ❌ No CI/CD pipeline
- ❌ No automated tests for frontend
- ❌ No App Store / TestFlight distribution yet

---

"@)

# --- ARCHITECTURE DOCUMENTATION ---
Write-Host "Adding architecture documentation..." -ForegroundColor Yellow
foreach ($docFile in $docFiles) {
    $content = Get-FileContent $docFile
    if ($content) {
        [void]$sb.AppendLine("## DOCUMENTATION: $docFile")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine($content)
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("---")
        [void]$sb.AppendLine("")
    }
}

# --- SOURCE CODE ---
Write-Host "Adding source code files..." -ForegroundColor Yellow
[void]$sb.AppendLine("## SOURCE CODE")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("The following sections contain the key source files of the VoiceLibri codebase.")
[void]$sb.AppendLine("Files are organized by subsystem. Each file includes its full path and content.")
[void]$sb.AppendLine("")

$fileCount = 0
$totalSizeKB = 0

foreach ($category in $keyFiles.GetEnumerator() | Sort-Object Name) {
    foreach ($relPath in $category.Value) {
        $content = Get-FileContent $relPath
        if ($content) {
            $lang = Get-LanguageTag $relPath
            $sizeKB = [math]::Round((Get-Item (Join-Path $RepoRoot $relPath)).Length / 1KB, 1)
            $lineCount = ($content -split "`n").Count

            [void]$sb.AppendLine("### $($category.Name)")
            [void]$sb.AppendLine("**File:** ``$relPath`` | **Size:** ${sizeKB} KB | **Lines:** $lineCount")
            [void]$sb.AppendLine("")
            [void]$sb.AppendLine("``````$lang")
            [void]$sb.AppendLine($content.TrimEnd())
            [void]$sb.AppendLine("``````")
            [void]$sb.AppendLine("")
            [void]$sb.AppendLine("---")
            [void]$sb.AppendLine("")

            $fileCount++
            $totalSizeKB += $sizeKB
        }
    }
}

# --- FOOTER ---
[void]$sb.AppendLine(@"

## CONTEXT SNAPSHOT SUMMARY

- **Total source files included:** $fileCount
- **Total source size:** $([math]::Round($totalSizeKB, 1)) KB
- **Branch:** $gitBranch
- **Commit:** $gitCommit
- **Generated:** $sessionDate
- **Session Key:** $sessionKey

> This snapshot was automatically generated by ``mirror/Generate-Context.ps1``.
> For the latest version, re-run the generator or use ``mirror/Sync-Mirror.ps1``.
"@)

# --- WRITE OUTPUT ---
$output = $sb.ToString()
[System.IO.File]::WriteAllText($OutputPath, $output, [System.Text.Encoding]::UTF8)

$outputSizeKB = [math]::Round((Get-Item $OutputPath).Length / 1KB, 1)
$outputSizeMB = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Context Snapshot Generated!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Files included: $fileCount"
Write-Host "  Output size:    ${outputSizeKB} KB (${outputSizeMB} MB)"
Write-Host "  Output path:    $OutputPath"
Write-Host "  Session key:    $sessionKey"
Write-Host ""

# Return summary object for pipeline use
[PSCustomObject]@{
    OutputPath = $OutputPath
    FileCount = $fileCount
    SizeKB = $outputSizeKB
    SizeMB = $outputSizeMB
    SessionKey = $sessionKey
    Branch = $gitBranch
    Commit = $gitCommit
}
