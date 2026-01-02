

# Set variables
$keyFile = "C:\Users\hajna\ebook-reader\apps\backend\.gcsakey.json"
$envFile = "C:\Users\hajna\ebook-reader\apps\backend\.env"
$outputDir = "C:\Users\hajna\ebook-reader\tts_audio_samples"
$text = Read-Host "Enter the text to synthesize"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$audioFile = Join-Path $outputDir "tts_$timestamp.wav"
$jsonFile = Join-Path $outputDir "tts_$timestamp.json"
$metaFile = Join-Path $outputDir "tts_$timestamp.metadata.json"

# Read .env file for project and location
$envLines = Get-Content $envFile
$project = ($envLines | Where-Object { $_ -match '^GOOGLE_CLOUD_PROJECT=' }) -replace 'GOOGLE_CLOUD_PROJECT=', ''
$location = ($envLines | Where-Object { $_ -match '^GOOGLE_CLOUD_LOCATION=' }) -replace 'GOOGLE_CLOUD_LOCATION=', ''

# Vertex AI TTS endpoint (Gemini)
$model = "gemini-2.5-flash-tts"
$apiUrl = "https://aiplatform.googleapis.com/v1beta1/projects/$project/locations/$location/publishers/google/models/$model:generateContent"

# Read the key file
$keyJson = Get-Content $keyFile -Raw | ConvertFrom-Json

# JWT header and claim
$header = @{ alg = "RS256"; typ = "JWT" }
$now = [Math]::Floor((Get-Date -UFormat %s))
$exp = $now + 3600
$claim = @{
    iss = $keyJson.client_email
    scope = "https://www.googleapis.com/auth/cloud-platform"
    aud = "https://oauth2.googleapis.com/token"
    exp = $exp
    iat = $now
}

function To-Base64Url($obj) {
    $json = $obj | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $base64 = [Convert]::ToBase64String($bytes)
    $base64.Replace('+', '-').Replace('/', '_').Replace('=', '')
}

# Set variables
$keyFile = "C:\Users\hajna\ebook-reader\apps\backend\.gcsakey.json"
$envFile = "C:\Users\hajna\ebook-reader\apps\backend\.env"
$outputDir = "C:\Users\hajna\ebook-reader\tts_audio_samples"
$text = Read-Host "Enter the text to synthesize"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$audioFile = Join-Path $outputDir "tts_$timestamp.wav"
$jsonFile = Join-Path $outputDir "tts_$timestamp.json"
$metaFile = Join-Path $outputDir "tts_$timestamp.metadata.json"

# Read .env file for project and location
$envLines = Get-Content $envFile
$project = ($envLines | Where-Object { $_ -match '^GOOGLE_CLOUD_PROJECT=' }) -replace 'GOOGLE_CLOUD_PROJECT=', ''
$location = ($envLines | Where-Object { $_ -match '^GOOGLE_CLOUD_LOCATION=' }) -replace 'GOOGLE_CLOUD_LOCATION=', ''

# Vertex AI TTS endpoint (Gemini)
$model = "gemini-2.5-flash-tts"
$apiUrl = "https://aiplatform.googleapis.com/v1beta1/projects/$project/locations/$location/publishers/google/models/$model:generateContent"

# Read the key file
$keyJson = Get-Content $keyFile -Raw | ConvertFrom-Json

# JWT header and claim
$header = @{ alg = "RS256"; typ = "JWT" }
$now = [Math]::Floor((Get-Date -UFormat %s))
$exp = $now + 3600
$claim = @{
    iss = $keyJson.client_email
    scope = "https://www.googleapis.com/auth/cloud-platform"
    aud = "https://oauth2.googleapis.com/token"
    exp = $exp
    iat = $now
}

function To-Base64Url($obj) {
    $json = $obj | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $base64 = [Convert]::ToBase64String($bytes)
    $base64.Replace('+', '-').Replace('/', '_').Replace('=', '')
}
$headerEnc = To-Base64Url $header
$claimEnc = To-Base64Url $claim
$jwtUnsigned = "$headerEnc.$claimEnc"

# Sign JWT with private key
$privateKey = $keyJson.private_key
$bytesToSign = [System.Text.Encoding]::UTF8.GetBytes($jwtUnsigned)
$pemFile = "$env:TEMP\tempkey.pem"
Set-Content -Path $pemFile -Value $privateKey
$tempDataFile = "$env:TEMP\jwt_to_sign.bin"
[System.IO.File]::WriteAllBytes($tempDataFile, $bytesToSign)
$sig = & openssl dgst -sha256 -sign $pemFile -binary $tempDataFile
Remove-Item $tempDataFile
$sigEnc = [Convert]::ToBase64String($sig).Replace('+', '-').Replace('/', '_').Replace('=', '')
$jwt = "$jwtUnsigned.$sigEnc"

# Request access token
$bodyToken = @{ grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer"; assertion = $jwt }
$responseToken = Invoke-RestMethod -Uri "https://oauth2.googleapis.com/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $bodyToken
$accessToken = $responseToken.access_token

# Prepare request body (adjust as needed for your API)
$body = @{
    "text" = $text
    "voice" = "default"  # Change if needed
    "audio_format" = "wav"
} | ConvertTo-Json

# Call the TTS API using OAuth2 Bearer token
$headers = @{ "Authorization" = "Bearer $accessToken" }
$response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body -ContentType "application/json" -OutFile $audioFile

# Save API response as JSON (if response is not the audio file itself)
if ($response) {
    $response | ConvertTo-Json | Out-File -Encoding utf8 $jsonFile
}

# Extract metadata using ffprobe (must be installed and in PATH)
ffprobe -v quiet -print_format json -show_format -show_streams $audioFile | Out-File -Encoding utf8 $metaFile

Write-Host "Audio, API response, and metadata saved to $outputDir"