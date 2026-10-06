#Requires -Version 5.1
<#
.SYNOPSIS
  DesRedTeam 便携版 初始化 + 启动 (PowerShell 版, 功能与 init.py 等价)

  用法:
    .\init.ps1              一键: 自检 -> 建目录 -> 启动 -> 验证
    .\init.ps1 -Check       环境自检
    .\init.ps1 -Start       启动平台
    .\init.ps1 -Stop        停止平台
    .\init.ps1 -FixConfig   修复 config.yaml 旧机绝对路径 (备份后改)
#>
param(
  [switch]$Check,
  [switch]$Start,
  [switch]$Stop,
  [switch]$FixConfig,
  [switch]$Restart
)
$ErrorActionPreference = 'Stop'
$dir = Split-Path $MyInvocation.MyCommand.Path -Parent
$exe = Join-Path $dir 'desredteam.exe'
if (-not (Test-Path $exe)) { $exe = Join-Path $dir 'cyberstrike-ai.exe' }
$base = 'http://127.0.0.1:8080/'

function Test-Port2([int]$port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $t = $c.ConnectAsync('127.0.0.1', $port)
    if ($t.Wait(500) -and $c.Connected) { $c.Close(); return $true }
    $c.Close(); return $false
  } catch { return $false }
}
function Start-Platform {
  if (Test-Port2 8080) { Write-Host '  [提示] 8080 已有服务, 跳过启动' -ForegroundColor Yellow; return }
  if (-not (Test-Path $exe)) { Write-Host '  [失败] 未找到主程序 exe' -ForegroundColor Red; return }
  Write-Host "  [启动] $([IO.Path]::GetFileName($exe)) --http"
  Start-Process $exe -ArgumentList '--http' -WorkingDirectory $dir -WindowStyle Hidden
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { Write-Host "  [OK] $base -> 200 (${i}s)" -ForegroundColor Green; return }
    } catch {}
  }
  Write-Host '  [警告] 30 秒未等到 200, 请查看日志' -ForegroundColor Yellow
}
function Stop-Platform {
  if (Test-Path $exe) {
    $name = [IO.Path]::GetFileName($exe)
    taskkill /F /IM $name 2>$null | Out-Null
    Write-Host "  [停止] $name" -ForegroundColor Green
  }
}

foreach ($d in @('data','chat_uploads','logs','tmp')) {
  $p = Join-Path $dir $d
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

if ($Check)     { & (Join-Path $dir 'setup-env.ps1') -CheckOnly; exit 0 }
if ($Stop)      { Stop-Platform; exit 0 }
if ($FixConfig) {
  $cfg = Join-Path $dir 'config.yaml'
  if (-not (Test-Path $cfg)) { Write-Host '  config.yaml 不存在' -ForegroundColor Yellow; exit 0 }
  $raw = Get-Content $cfg -Raw -Encoding UTF8
  if ($raw -match 'D:[\\/]app|C:[\\/]Users[\\/]Administrator') {
    $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
    Copy-Item $cfg "$cfg.fix-config.bak-$ts"
    $new = $raw -replace '(log:\s*\n\s*output:\s*)[^\r\n]*', ("$1" + (Join-Path $dir 'logs\desredteam.log').Replace('\','/'))
    [IO.File]::WriteAllText($cfg, $new, (New-Object Text.UTF8Encoding($true)))
    Write-Host "  [已修] log.output 已指向包内 logs\desredteam.log (备份: fix-config.bak-$ts)" -ForegroundColor Green
  } else { Write-Host '  [OK] 未发现旧机绝对路径' -ForegroundColor Green }
  exit 0
}
if ($Restart)  { Stop-Platform; Start-Sleep 1 }

Write-Host '========== DesRedTeam 一键初始化 ==========' -ForegroundColor Cyan
& (Join-Path $dir 'setup-env.ps1') -CheckOnly
Start-Platform
Write-Host '  完成。浏览器访问 http://127.0.0.1:8080/  (admin 密码见日志)' -ForegroundColor DarkGray
