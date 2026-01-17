# ============================================================================
# VoiceLibri Development Commands
# PowerShell helper scripts for common development tasks
# ============================================================================

# Usage: Run from the project root (c:\Users\hajna\ebook-reader)
# Example: .\scripts\dev-commands.ps1 -Action kill

param(
    [Parameter(Position=0)]
    [ValidateSet('kill', 'clear', 'reset', 'expo', 'backend', 'both', 'status', 'help')]
    [string]$Action = 'help'
)

$ProjectRoot = "c:\Users\hajna\ebook-reader"
$MobileDir = "$ProjectRoot\apps\mobile"
$BackendDir = "$ProjectRoot\apps\backend"

function Kill-NodeProcesses {
    Write-Host "🔪 Killing all Node processes..." -ForegroundColor Yellow
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    
    # Also kill by port if still running
    $ports = @(3001, 8081, 19000, 19001, 19002)
    foreach ($port in $ports) {
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conn) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "✓ All Node processes killed" -ForegroundColor Green
}

function Clear-AllCaches {
    Write-Host "🧹 Clearing all caches..." -ForegroundColor Yellow
    
    # Metro bundler cache
    Remove-Item -Recurse -Force "$env:TEMP\metro-*" -ErrorAction SilentlyContinue
    
    # Expo cache
    Remove-Item -Recurse -Force "$MobileDir\.expo" -ErrorAction SilentlyContinue
    
    # Backend dist
    Remove-Item -Recurse -Force "$BackendDir\dist" -ErrorAction SilentlyContinue
    
    # Node modules cache
    Remove-Item -Recurse -Force "$ProjectRoot\node_modules\.cache" -ErrorAction SilentlyContinue
    
    # NPM cache
    npm cache clean --force 2>$null
    
    Write-Host "✓ All caches cleared" -ForegroundColor Green
}

function Start-ExpoTunnel {
    Write-Host "📱 Starting Expo with tunnel..." -ForegroundColor Cyan
    Push-Location $MobileDir
    npx expo start --tunnel --clear
    Pop-Location
}

function Start-Backend {
    Write-Host "🚀 Starting backend server..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    npm run dev:backend
    Pop-Location
}

function Start-Both {
    Write-Host "🚀 Starting both backend and PWA..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    npm run dev
    Pop-Location
}

function Show-Status {
    Write-Host "`n📊 Development Server Status" -ForegroundColor Cyan
    Write-Host "=" * 40
    
    # Check Node processes
    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        Write-Host "Node processes: $($nodeProcs.Count) running" -ForegroundColor Green
    } else {
        Write-Host "Node processes: None" -ForegroundColor Yellow
    }
    
    # Check ports
    $ports = @(
        @{Port=3001; Name="Backend"},
        @{Port=8081; Name="Metro/Expo"},
        @{Port=5180; Name="PWA"}
    )
    
    foreach ($p in $ports) {
        $conn = Get-NetTCPConnection -LocalPort $p.Port -ErrorAction SilentlyContinue
        if ($conn) {
            Write-Host "$($p.Name) (port $($p.Port)): Running ✓" -ForegroundColor Green
        } else {
            Write-Host "$($p.Name) (port $($p.Port)): Not running" -ForegroundColor Gray
        }
    }
    Write-Host ""
}

function Show-Help {
    Write-Host @"

╔════════════════════════════════════════════════════════════════════════╗
║                VoiceLibri Development Commands                         ║
╚════════════════════════════════════════════════════════════════════════╝

Usage: .\scripts\dev-commands.ps1 -Action <command>

Commands:
  kill     Kill all Node processes (backend, expo, metro)
  clear    Clear all caches (metro, expo, npm, dist)
  reset    Kill processes AND clear caches (full reset)
  expo     Start Expo with tunnel (for mobile testing)
  backend  Start backend server only
  both     Start both backend and PWA (npm run dev)
  status   Show status of development servers
  help     Show this help message

Quick Examples:
  .\scripts\dev-commands.ps1 kill        # Kill everything
  .\scripts\dev-commands.ps1 reset       # Full reset
  .\scripts\dev-commands.ps1 expo        # Fresh Expo start

═══════════════════════════════════════════════════════════════════════════
                    COPY-PASTE ONE-LINERS
═══════════════════════════════════════════════════════════════════════════

# 🔄 FRESH EXPO START (kill all, clear cache, start with tunnel):
taskkill /F /IM node.exe; Remove-Item -Recurse -Force "`$env:TEMP\metro-*" -EA 0; cd c:\Users\hajna\ebook-reader\apps\mobile; npx expo start --tunnel --clear

# 🔪 KILL ALL NODE PROCESSES:
taskkill /F /IM node.exe

# 🧹 CLEAR ALL CACHES:
Remove-Item -Recurse -Force "`$env:TEMP\metro-*",c:\Users\hajna\ebook-reader\apps\mobile\.expo,c:\Users\hajna\ebook-reader\node_modules\.cache -EA 0; npm cache clean --force

# 📱 START EXPO ONLY (from mobile dir):
cd c:\Users\hajna\ebook-reader\apps\mobile; npx expo start --tunnel --clear

# 🖥️ START BACKEND ONLY:
cd c:\Users\hajna\ebook-reader; npm run dev:backend

# 🚀 START BOTH (backend + pwa):
cd c:\Users\hajna\ebook-reader; npm run dev

# 📦 REINSTALL MOBILE DEPENDENCIES:
cd c:\Users\hajna\ebook-reader\apps\mobile; Remove-Item -Recurse -Force node_modules,package-lock.json -EA 0; npm install --legacy-peer-deps

# 🔍 CHECK WHAT'S RUNNING:
Get-Process node -EA 0 | Select-Object Id,ProcessName,StartTime

"@ -ForegroundColor White
}

# Execute based on action
switch ($Action) {
    'kill'    { Kill-NodeProcesses }
    'clear'   { Clear-AllCaches }
    'reset'   { Kill-NodeProcesses; Clear-AllCaches }
    'expo'    { Start-ExpoTunnel }
    'backend' { Start-Backend }
    'both'    { Start-Both }
    'status'  { Show-Status }
    'help'    { Show-Help }
    default   { Show-Help }
}
