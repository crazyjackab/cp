param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [string]$SetupPath,

    [string]$Notes = "版本 $Version 更新",
    [string]$GitHubRepo = "crazyjackab/cp",
    [string]$OutputPath = "updates/latest.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SetupPath)) {
    throw "找不到安装包: $SetupPath"
}

$sigPath = "$SetupPath.sig"
if (-not (Test-Path $sigPath)) {
    throw "找不到签名文件: $sigPath，请先设置 TAURI_SIGNING_PRIVATE_KEY 并执行 npm run tauri build"
}

$fileName = Split-Path $SetupPath -Leaf
# GitHub Release 上传后常将文件名中的空格替换为点号
$fileNameForUrl = $fileName -replace ' ', '.'
$encodedName = [uri]::EscapeDataString($fileNameForUrl)
$signature = (Get-Content $sigPath -Raw).Trim()
$url = "https://github.com/$GitHubRepo/releases/download/v$Version/$encodedName"

$payload = [ordered]@{
    version  = $Version
    notes    = $Notes
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url       = $url
        }
    }
}

$json = $payload | ConvertTo-Json -Depth 5
$dir = Split-Path $OutputPath -Parent
if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Set-Content -Path $OutputPath -Value $json -Encoding utf8
Write-Host "已生成 $OutputPath"
Write-Host "请将安装包与 latest.json 一并上传到 GitHub Release v$Version"
