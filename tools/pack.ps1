# 배포용 zip 생성: dist/youtube-classroom-v<버전>.zip (확장에 필요한 파일만)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$stage = Join-Path $root 'dist\youtube-classroom'
$zip = Join-Path $root "dist\youtube-classroom-v$version.zip"

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
foreach ($item in 'manifest.json', 'src', 'icons', 'LICENSE') {
  Copy-Item -Recurse -LiteralPath (Join-Path $root $item) -Destination $stage
}
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Write-Output "created $zip"
