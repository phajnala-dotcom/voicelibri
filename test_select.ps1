$body = @{
    filename = "dracula.epub"
    targetLanguage = "en-US"
    dramatize = $true
} | ConvertTo-Json

Write-Host "Request body:"
Write-Host $body

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/book/select" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 120
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "Error: $_"
}
