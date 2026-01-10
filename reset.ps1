# Reset Script - Kill Node processes and clear caches (preserve audiobooks)
# Run this after code changes before testing

Write-Host "🔄 Resetting development environment..." -ForegroundColor Cyan

# Kill all Node processes
Write-Host "Killing Node processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "✅ Node processes killed" -ForegroundColor Green

# Clear node_modules cache folders
Write-Host "Clearing Node caches..." -ForegroundColor Yellow
Remove-Item -Path "node_modules/.cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "apps/backend/node_modules/.cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "apps/frontend/node_modules/.cache" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ Node caches cleared" -ForegroundColor Green

Write-Host ""
Write-Host "✨ Reset complete! Ready for testing." -ForegroundColor Green
Write-Host "💡 Audiobooks folder preserved for testing." -ForegroundColor Cyan
