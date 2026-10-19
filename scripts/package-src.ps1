<#
.SYNOPSIS
    Dong goi ma nguon MSB Financial Copilot (PFM) thanh file ZIP gon nhe.

.DESCRIPTION
    Script quet toan bo thu muc du an va nen cac file ma nguon, database mock (data/pfm.sqlite3),
    tai lieu (docs/), seed data va file cau hinh vao file ZIP.
    Tu dong loai bo cac thu muc nang/rac nhu:
    - node_modules
    - .next
    - .git (tuy chon kem theo qua -IncludeGit)
    - test-results, .playwright-mcp, .superpowers
    - log files (*.log)
    - .env.local (tranh lo secrets)
    - SQLite WAL files (*.sqlite3-shm, *.sqlite3-wal)
    - cac file .zip cu

.PARAMETER OutputFile
    Ten hoac duong dan file ZIP dau ra. Mac dinh: 'msb-pfm-src.zip'.

.PARAMETER AddTimestamp
    Neu bat, them timestamp (yyyyMMdd-HHmmss) vao ten file ZIP.

.PARAMETER IncludeGit
    Neu bat, dong goi ca thu muc .git (mac dinh: bo qua de tiet kiem dung luong).

.PARAMETER IncludeEnvLocal
    Neu bat, kem ca file .env.local (mac dinh: bo qua de bao mat).

.PARAMETER VerboseList
    In chi tiet tung file duoc dong goi.

.EXAMPLE
    .\scripts\package-src.ps1
    .\scripts\package-src.ps1 -AddTimestamp
    .\scripts\package-src.ps1 -OutputFile "msb-pfm-submission.zip"
#>

[CmdletBinding()]
param(
    [string]$OutputFile = "",
    [switch]$AddTimestamp,
    [switch]$IncludeGit,
    [switch]$IncludeEnvLocal,
    [switch]$VerboseList
)

$ErrorActionPreference = "Stop"

# Load .NET Compression Assemblies
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Determine project root directory (parent of scripts/)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path

# Determine Output ZIP path
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    if ($AddTimestamp) {
        $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
        $OutputFileName = "msb-pfm-src-$timestamp.zip"
    } else {
        $OutputFileName = "msb-pfm-src.zip"
    }
    $DestinationZip = Join-Path $ProjectRoot $OutputFileName
} else {
    if ([System.IO.Path]::IsPathRooted($OutputFile)) {
        $DestinationZip = $OutputFile
    } else {
        $DestinationZip = Join-Path $ProjectRoot $OutputFile
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  MSB PFM - DONG GOI MA NGUON (SOURCE CODE TO ZIP)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Root du an  : $ProjectRoot"
Write-Host " File dau ra : $DestinationZip"
Write-Host ""

# Thu muc can loai bo
$excludedDirs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$baseExcludedDirs = @(
    "node_modules",
    ".next",
    "test-results",
    ".playwright-mcp",
    ".superpowers",
    ".vscode",
    ".gemini",
    "coverage",
    "build",
    "out",
    "dist",
    "ref",
    "ref-ui-msb",
    "plans",
    "backend_docs"
)

foreach ($d in $baseExcludedDirs) {
    [void]$excludedDirs.Add($d)
}

if (-not $IncludeGit) {
    [void]$excludedDirs.Add(".git")
}

Write-Host " Thu muc bo qua: $($excludedDirs -join ', ')" -ForegroundColor DarkGray
Write-Host ""

# Quet file bang hang doi (tranh quet sau vao node_modules/.next)
$swScan = [System.Diagnostics.Stopwatch]::StartNew()
$queue = New-Object System.Collections.Generic.Queue[string]
$queue.Enqueue($ProjectRoot)

$filesToCompress = New-Object System.Collections.Generic.List[System.IO.FileInfo]
$destFullPath = [System.IO.Path]::GetFullPath($DestinationZip)

while ($queue.Count -gt 0) {
    $currentDir = $queue.Dequeue()
    
    foreach ($entry in [System.IO.Directory]::GetFileSystemEntries($currentDir)) {
        $name = [System.IO.Path]::GetFileName($entry)
        
        if ([System.IO.Directory]::Exists($entry)) {
            if (-not $excludedDirs.Contains($name)) {
                $queue.Enqueue($entry)
            }
        } elseif ([System.IO.File]::Exists($entry)) {
            $fullEntryPath = [System.IO.Path]::GetFullPath($entry)
            
            # Khong dong goi chinh file zip dau ra
            if ($fullEntryPath -eq $destFullPath) {
                continue
            }
            
            # Cac file loai bo
            $isLog = $name -like "*.log"
            $isTsBuildInfo = $name -like "*.tsbuildinfo"
            $isZip = ($name -like "*.zip") -or ($name -like "*.tar") -or ($name -like "*.gz") -or ($name -like "*.rar") -or ($name -like "*.7z")
            $isOsJunk = ($name -eq ".DS_Store") -or ($name -eq "Thumbs.db")
            $isSqliteSidecar = ($name -like "*.sqlite3-shm") -or ($name -like "*.sqlite3-wal") -or ($name -like "*.bak-*")
            $isEnvLocal = ($name -eq ".env.local") -or ($name -like ".env.*.local")
            
            if ($IncludeEnvLocal) {
                $isEnvLocal = $false
            }
            
            if ($isLog -or $isTsBuildInfo -or $isZip -or $isOsJunk -or $isSqliteSidecar -or $isEnvLocal) {
                continue
            }
            
            $filesToCompress.Add((New-Object System.IO.FileInfo($entry)))
        }
    }
}
$swScan.Stop()

Write-Host " [1/3] Da quet thay $($filesToCompress.Count) files hop le ($($swScan.ElapsedMilliseconds) ms)." -ForegroundColor Green

# Xoa file zip cu neu ton tai
if ([System.IO.File]::Exists($DestinationZip)) {
    Write-Host " [2/3] Xoa file zip cu o dich..." -ForegroundColor Yellow
    [System.IO.File]::Delete($DestinationZip)
} else {
    Write-Host " [2/3] Khoi tao archive moi..." -ForegroundColor Green
}

# Tao ZIP
Write-Host " [3/3] Dang tien hanh nen zip..." -ForegroundColor Cyan
$swZip = [System.Diagnostics.Stopwatch]::StartNew()

$archive = [System.IO.Compression.ZipFile]::Open($DestinationZip, [System.IO.Compression.ZipArchiveMode]::Create)
$totalBytes = 0

try {
    foreach ($file in $filesToCompress) {
        $relPath = $file.FullName.Substring($ProjectRoot.Length).TrimStart('\', '/').Replace('\', '/')
        if ($VerboseList) {
            Write-Host "   + $relPath" -ForegroundColor DarkGray
        }
        $totalBytes += $file.Length
        try {
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relPath, [System.IO.Compression.CompressionLevel]::Optimal)
        } catch [System.IO.IOException] {
            # Fallback cho cac file dang duoc process khac mo (nhu data/pfm.sqlite3 boi dev server)
            $entry = $archive.CreateEntry($relPath, [System.IO.Compression.CompressionLevel]::Optimal)
            $fs = [System.IO.File]::Open($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
                $es = $entry.Open()
                try {
                    $fs.CopyTo($es)
                } finally {
                    $es.Dispose()
                }
            } finally {
                $fs.Dispose()
            }
        }
    }
}
finally {
    $archive.Dispose()
}

$swZip.Stop()

$destInfo = Get-Item $DestinationZip
$uncompressedMB = [math]::Round($totalBytes / 1MB, 2)
$compressedMB = [math]::Round($destInfo.Length / 1MB, 2)
$ratio = if ($totalBytes -gt 0) { [math]::Round((1 - ($destInfo.Length / $totalBytes)) * 100, 1) } else { 0 }
$totalTime = [math]::Round(($swScan.ElapsedMilliseconds + $swZip.ElapsedMilliseconds) / 1000, 2)

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  DONG GOI THANH CONG!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " File ZIP tao tai  : $($destInfo.FullName)" -ForegroundColor White
Write-Host " So luong file nen : $($filesToCompress.Count)" -ForegroundColor White
Write-Host " Dung luong goc    : $uncompressedMB MB" -ForegroundColor White
Write-Host " Dung luong ZIP    : $compressedMB MB" -ForegroundColor White
Write-Host " Ty le nen         : $ratio %" -ForegroundColor White
Write-Host " Thoi gian thuc hien: $totalTime giay" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
