$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$server = Start-Job -ScriptBlock {
  param($projectRoot)
  Set-Location $projectRoot
  npx vite --host=127.0.0.1
} -ArgumentList $root

try {
  Start-Sleep -Seconds 3
  & npx playwright test --reporter=line
  exit $LASTEXITCODE
}
finally {
  Stop-Job $server -ErrorAction SilentlyContinue
  Remove-Job $server -Force -ErrorAction SilentlyContinue
}
