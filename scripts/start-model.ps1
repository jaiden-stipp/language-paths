param(
  [string]$Model = 'bartowski/SmolLM2-360M-Instruct-GGUF:Q4_K_M',
  [int]$ContextSize = 2048,
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

$installedCommand = Get-Command llama-server -ErrorAction SilentlyContinue
$serverPath = if ($installedCommand) { $installedCommand.Source } else { $null }

if (-not $serverPath) {
  $winGetPackages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path -LiteralPath $winGetPackages) {
    $serverPath = Get-ChildItem -LiteralPath $winGetPackages -Filter 'llama-server.exe' -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match 'ggml\.llamacpp' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
}

if (-not $serverPath) {
  throw "llama.cpp was not found. Install it with: winget install --id ggml.llamacpp --exact"
}

Write-Host "Starting $Model on http://127.0.0.1:$Port"
Write-Host 'Keep this terminal open while using Language Paths.'

& $serverPath `
  -hf $Model `
  -c $ContextSize `
  --port $Port `
  --cors-origins localhost
