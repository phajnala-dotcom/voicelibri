<#
.SYNOPSIS
    VoiceLibri - GitHub Issue Creator from Gemini Consultation Outputs

.DESCRIPTION
    Parses structured discussion output files (Markdown) from mirror/discussions/
    and creates GitHub Issues in the voicelibri repository via gh CLI.

    Each "Návrh" (proposal) section becomes a separate GitHub Issue.

.PARAMETER InputFile
    Path to a discussion output Markdown file. If not specified, processes all
    .md files in mirror/discussions/.

.PARAMETER DryRun
    Parse and display what would be created without actually creating issues.

.PARAMETER Repo
    GitHub repository in owner/repo format. Default: phajnala-dotcom/voicelibri

.EXAMPLE
    .\Create-Issues.ps1 -InputFile "mirror/discussions/2025-01-15_architecture.md"
    .\Create-Issues.ps1 -DryRun
    .\Create-Issues.ps1
#>

param(
    [string]$InputFile,
    [switch]$DryRun,
    [string]$Repo = "phajnala-dotcom/voicelibri"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DiscussionsDir = Join-Path $ScriptDir "discussions"

# -- Helpers ----------------------------------------------------------------

function Write-Status($icon, $msg) { Write-Host "$icon $msg" }
function Write-Ok($msg) { Write-Status "[OK]" $msg }
function Write-Info($msg) { Write-Status "[..]" $msg }
function Write-Warn($msg) { Write-Status "[!!]" $msg }
function Write-Err($msg) { Write-Status "[XX]" $msg }

# -- Prerequisite Check -----------------------------------------------------

function Test-Prerequisites {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Err "GitHub CLI (gh) is not installed."
        Write-Host "  Install: winget install GitHub.cli"
        Write-Host "  Then:    gh auth login"
        exit 1
    }

    # Check authentication
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "GitHub CLI is not authenticated."
        Write-Host "  Run: gh auth login"
        exit 1
    }

    Write-Ok "GitHub CLI authenticated"
}

# ── Parser ───────────────────────────────────────────────────────────────────

function Parse-DiscussionFile {
    param([string]$FilePath)

    $content = Get-Content $FilePath -Raw -Encoding UTF8
    $lines = Get-Content $FilePath -Encoding UTF8

    # Extract metadata from header
    $date = ""
    $sessionKey = ""
    $topic = ""
    $branch = ""

    foreach ($line in $lines) {
        if ($line -match '^\*\*Dátum:\*\*\s*(.+)') { $date = $Matches[1].Trim() }
        if ($line -match '^\*\*Session Key:\*\*\s*(.+)') { $sessionKey = $Matches[1].Trim() }
        if ($line -match '^\*\*Téma:\*\*\s*(.+)') { $topic = $Matches[1].Trim() }
        if ($line -match '^\*\*Branch:\*\*\s*(.+)') { $branch = $Matches[1].Trim() }
    }

    # Extract proposals (### Návrh sections)
    $proposals = @()
    $proposalPattern = '(?ms)### Návrh \d+:\s*(.+?)(?=\n### Návrh|\n## Otvorené|\n## Poznámky|$)'
    $matches = [regex]::Matches($content, $proposalPattern)

    foreach ($match in $matches) {
        $block = $match.Value
        $titleMatch = [regex]::Match($block, '### Návrh \d+:\s*(.+)')
        $title = if ($titleMatch.Success) { $titleMatch.Groups[1].Value.Trim() } else { "Untitled" }

        # Skip template placeholders
        if ($title -eq "[Názov]") { continue }

        # Parse fields
        $type = ""; $priority = ""; $effort = ""; $desc = ""; $labels = @()
        $steps = @(); $files = @(); $risks = ""

        if ($block -match '(?m)^\- \*\*Typ:\*\*\s*(.+)') { $type = $Matches[1].Trim() }
        if ($block -match '(?m)^\- \*\*Priorita:\*\*\s*(.+)') { $priority = $Matches[1].Trim() }
        if ($block -match '(?m)^\- \*\*Náročnosť:\*\*\s*(.+)') { $effort = $Matches[1].Trim() }
        if ($block -match '(?m)^\- \*\*Riziká:\*\*\s*(.+)') { $risks = $Matches[1].Trim() }

        # Extract description
        $descMatch = [regex]::Match($block, '(?ms)\- \*\*Popis:\*\*\s*\n(.+?)(?=\n- \*\*)')
        if ($descMatch.Success) { $desc = $descMatch.Groups[1].Value.Trim() }

        # Extract labels
        if ($block -match '(?m)^\- \*\*Labels:\*\*\s*(.+)') {
            $labelsRaw = $Matches[1].Trim()
            $labels = $labelsRaw -split ',\s*' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
        }

        # Extract implementation steps
        $stepsMatch = [regex]::Match($block, '(?ms)\- \*\*Implementačné kroky:\*\*\s*\n(.+?)(?=\n- \*\*)')
        if ($stepsMatch.Success) {
            $steps = $stepsMatch.Groups[1].Value.Trim() -split "`n" |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ -match '^\d+\.' }
        }

        # Extract affected files
        $filesMatch = [regex]::Match($block, '(?ms)\- \*\*Dotknuté súbory:\*\*\s*\n(.+?)(?=\n- \*\*)')
        if ($filesMatch.Success) {
            $files = $filesMatch.Groups[1].Value.Trim() -split "`n" |
                ForEach-Object { $_.Trim() -replace '^\-\s*', '' } |
                Where-Object { $_ -match '`' }
        }

        $proposals += @{
            Title    = $title
            Type     = $type
            Priority = $priority
            Effort   = $effort
            Desc     = $desc
            Steps    = $steps
            Files    = $files
            Risks    = $risks
            Labels   = $labels
        }
    }

    return @{
        Date       = $date
        SessionKey = $sessionKey
        Topic      = $topic
        Branch     = $branch
        Proposals  = $proposals
    }
}

# ── Issue Builder ────────────────────────────────────────────────────────────

function Build-IssueBody {
    param($Proposal, $Meta)

    $body = @"
## Popis

$($Proposal.Desc)

## Detaily

| Pole | Hodnota |
|------|---------|
| **Typ** | $($Proposal.Type) |
| **Priorita** | $($Proposal.Priority) |
| **Náročnosť** | $($Proposal.Effort) |
| **Zdroj** | Gemini konzultácia ($($Meta.Date)) |
| **Session** | $($Meta.SessionKey) |

"@

    if ($Proposal.Steps.Count -gt 0) {
        $body += "`n## Implementačné kroky`n`n"
        foreach ($step in $Proposal.Steps) {
            $body += "- [ ] $($step -replace '^\d+\.\s*', '')`n"
        }
    }

    if ($Proposal.Files.Count -gt 0) {
        $body += "`n## Dotknuté súbory`n`n"
        foreach ($file in $Proposal.Files) {
            $body += "- $file`n"
        }
    }

    if ($Proposal.Risks -and $Proposal.Risks -ne "[prípadné riziká alebo komplikácie]") {
        $body += "`n## Riziká`n`n$($Proposal.Risks)`n"
    }

    $body += "`n---`n*Automaticky vytvorené z Gemini konzultácie pomocou Create-Issues.ps1*`n"

    return $body
}

function Get-IssueTitle {
    param($Proposal, $Meta)
    
    # Map type to prefix
    $prefixMap = @{
        "feature"      = "feat"
        "refactoring"  = "refactor"
        "bugfix"       = "fix"
        "performance"  = "perf"
        "architecture" = "arch"
    }
    $prefix = if ($prefixMap.ContainsKey($Proposal.Type)) { $prefixMap[$Proposal.Type] } else { "task" }
    
    return "[$prefix] $($Proposal.Title)"
}

# ── Main ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "========================================================"
Write-Host "  VoiceLibri - GitHub Issue Creator                     "
Write-Host "  From Gemini Consultation Outputs                     "
Write-Host "========================================================"
Write-Host ""

if (-not $DryRun) {
    Test-Prerequisites
}

# Determine input files
$filesToProcess = @()

if ($InputFile) {
    if (-not (Test-Path $InputFile)) {
        Write-Err "File not found: $InputFile"
        exit 1
    }
    $filesToProcess += (Resolve-Path $InputFile).Path
} else {
    if (-not (Test-Path $DiscussionsDir)) {
        Write-Warn "No discussions directory found."
        Write-Host "  Expected: $DiscussionsDir"
        Write-Host "  Create discussion files from template: mirror/templates/DISCUSSION_OUTPUT_TEMPLATE.md"
        exit 0
    }

    $filesToProcess = Get-ChildItem -Path $DiscussionsDir -Filter "*.md" |
        Sort-Object Name |
        ForEach-Object { $_.FullName }

    if ($filesToProcess.Count -eq 0) {
        Write-Warn "No .md files in $DiscussionsDir"
        exit 0
    }
}

Write-Info "Files to process: $($filesToProcess.Count)"
if ($DryRun) { Write-Warn "DRY RUN - no issues will be created" }
Write-Host ""

$totalCreated = 0
$totalSkipped = 0

foreach ($file in $filesToProcess) {
    $fileName = Split-Path -Leaf $file
    Write-Host "-- Processing: $fileName --" -ForegroundColor Cyan

    $parsed = Parse-DiscussionFile -FilePath $file

    if ($parsed.Proposals.Count -eq 0) {
        Write-Warn "  No proposals found in file"
        continue
    }

    Write-Info "  Date: $($parsed.Date) | Topic: $($parsed.Topic)"
    Write-Info "  Proposals found: $($parsed.Proposals.Count)"
    Write-Host ""

    foreach ($proposal in $parsed.Proposals) {
        $issueTitle = Get-IssueTitle -Proposal $proposal -Meta $parsed
        $issueBody = Build-IssueBody -Proposal $proposal -Meta $parsed

        # Build label arguments
        $labelArgs = @()
        foreach ($label in $proposal.Labels) {
            $labelArgs += "--label"
            $labelArgs += $label
        }

        Write-Host "  Issue: $issueTitle" -ForegroundColor Yellow
        Write-Host "    Priority: $($proposal.Priority) | Effort: $($proposal.Effort)"
        if ($proposal.Labels.Count -gt 0) {
            Write-Host "    Labels: $($proposal.Labels -join ', ')"
        }

        if ($DryRun) {
            Write-Info "    [DRY RUN] Would create issue"
            $totalSkipped++
        } else {
            try {
                $result = $issueBody | gh issue create `
                    --repo $Repo `
                    --title $issueTitle `
                    --body-file - `
                    @labelArgs `
                    2>&1

                if ($LASTEXITCODE -eq 0) {
                    Write-Ok "    Created: $result"
                    $totalCreated++
                } else {
                    Write-Err "    Failed: $result"
                    $totalSkipped++
                }
            } catch {
                Write-Err "    Error: $_"
                $totalSkipped++
            }
        }
        Write-Host ""
    }
}

# Summary
Write-Host "-- Summary --" -ForegroundColor Cyan
if ($DryRun) {
    Write-Info "DRY RUN complete. $totalSkipped issues would be created."
} else {
    Write-Ok "Created: $totalCreated issues"
    if ($totalSkipped -gt 0) { Write-Warn "Skipped/Failed: $totalSkipped" }
}
Write-Host ""
