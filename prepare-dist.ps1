# ==============================================================================
# Script: prepare-dist.ps1
# Purpose: Prepares a fully self-contained, isolated Python runtime + Playwright Chromium
#          inside ./python_dist for packaging with Electron / electron-builder.
# ==============================================================================

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$distDir = Join-Path $scriptDir "python_dist"
$browsersDir = Join-Path $distDir "browsers"
$pythonExe = Join-Path $distDir "python.exe"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Preparing Portable Python Runtime for Electron Packaging " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Clean previous dist
if (Test-Path $distDir) {
    Write-Host "[1/4] Cleaning existing python_dist..." -ForegroundColor Yellow
    Remove-Item $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir | Out-Null

# 2. Copy base Python runtime from C:\Python314
Write-Host "[2/4] Copying base Python runtime..." -ForegroundColor Yellow
Copy-Item "C:\Python314\*" -Destination $distDir -Recurse -Force

# Copy installed dependencies from .venv\Lib\site-packages
Write-Host "[2/4] Copying site-packages dependencies into portable runtime..." -ForegroundColor Yellow
$sitePackagesDest = Join-Path $distDir "Lib\site-packages"
if (-not (Test-Path $sitePackagesDest)) {
    New-Item -ItemType Directory -Path $sitePackagesDest | Out-Null
}
Copy-Item ".\.venv\Lib\site-packages\*" -Destination $sitePackagesDest -Recurse -Force

# 3. Setup Playwright Chromium inside python_dist\browsers
Write-Host "[3/4] Copying Playwright Chromium binary..." -ForegroundColor Yellow
if (-not (Test-Path $browsersDir)) {
    New-Item -ItemType Directory -Path $browsersDir | Out-Null
}

$localPlaywright = Join-Path $env:LOCALAPPDATA "ms-playwright"
if (Test-Path $localPlaywright) {
    Write-Host "      Copying all local Playwright browser binaries..." -ForegroundColor Gray
    Copy-Item -Path (Join-Path $localPlaywright "*") -Destination $browsersDir -Recurse -Force
} else {
    Write-Host "      Downloading Chromium via Playwright..." -ForegroundColor Yellow
    $env:PLAYWRIGHT_BROWSERS_PATH = $browsersDir
    & "$pythonExe" -m playwright install chromium
}

# 4. Verify self-contained runtime integrity
Write-Host "[4/4] Verifying isolated portable environment..." -ForegroundColor Yellow
$verifyCmd = "import fastapi, uvicorn, playwright, pydantic, dotenv; print('ALL_MODULES_OK')"
$res = & "$pythonExe" -s -c "$verifyCmd" 2>&1

if ($res -like "*ALL_MODULES_OK*") {
    Write-Host "`nSUCCESS: Portable Python & Playwright runtime is 100% ready in ./python_dist" -ForegroundColor Green
} else {
    Write-Host "`nERROR during verification: $res" -ForegroundColor Red
    exit 1
}
