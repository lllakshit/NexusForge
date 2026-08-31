$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

if (-not $env:GEMINI_API_KEY -and -not $env:GOOGLE_API_KEY) {
  Write-Host "Set GEMINI_API_KEY first, then rerun."
  exit 1
}

$env:AI_ROUTE_MODE = "cloud"
$env:AI_EVENTS_ENABLED = "false"
$env:CLOUD_PROVIDER = "gemini"
$env:CLOUD_MODEL = if ($env:CLOUD_MODEL) { $env:CLOUD_MODEL } else { "gemini-2.0-flash" }
$env:CLOUD_API_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"

if (-not (Test-Path "ai-core\.venv")) {
  python -m venv ai-core\.venv
}

& "ai-core\.venv\Scripts\python.exe" -m pip install -r ai-core\requirements-local.txt
Set-Location ai-core
& ".\.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 4011
