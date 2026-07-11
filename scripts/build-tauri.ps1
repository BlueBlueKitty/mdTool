$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vcvars = 'E:\software\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat'
$rustBin = 'C:\Program Files\Rust stable MSVC 1.97\bin'

if (-not (Test-Path $vcvars)) { throw "未找到 Visual Studio C++ 环境：$vcvars" }
if (-not (Test-Path "$rustBin\cargo.exe")) { throw "未找到 Rust MSVC 工具链：$rustBin" }

Push-Location $root
try {
  $command = "call `"$vcvars`" && set `"PATH=$rustBin;%PATH%`" && npx tauri build"
  cmd.exe /d /s /c $command
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
