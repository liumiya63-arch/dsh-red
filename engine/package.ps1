#Requires -Version 5.1
<#
  DesRedTeam 打包脚本（给另一台电脑用）

  用法：
    .\package.ps1                  # 精简版：只有平台本体（约 60MB，DSH 两个页面空白）
    .\package.ps1 -WithDSH         # 完整版：含 DSH 前端运行时（约 1.9GB，全功能）
    .\package.ps1 -WithDSH -NoZip  # 只生成文件夹，不压缩

  输出：.\dist\DesRedTeam-桌面版\  +  .zip      （或 DesRedTeam-完整版）
#>
param(
    [switch]$WithDSH,
    [switch]$NoZip,
    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $root 'dist' }

$suffix    = if ($WithDSH) { '完整版' } else { '桌面版' }
$stageName = "DesRedTeam-$suffix"
$stage     = Join-Path $OutDir $stageName

$launcher    = Join-Path $root 'DesRedTeam-Desktop.exe'
$dshHome     = Join-Path $root 'dsh-home'
$runtimeSrc  = '<PROJECT_ROOT>\deepseek-harness-new'

function Say($m) { Write-Host $m }
function DirSizeMB($p) {
    if (-not (Test-Path $p)) { return 0 }
    $s = (Get-ChildItem $p -Recurse -Force -File -ErrorAction SilentlyContinue |
          Measure-Object -Property Length -Sum).Sum
    return [math]::Round($s / 1MB, 0)
}

Say "===== DesRedTeam 打包（$suffix）====="

# ---------- 0. 前置检查 ----------
if (-not (Test-Path $launcher)) { throw "缺少 $launcher（请先编译启动器）" }
if ($WithDSH) {
    if (-not (Test-Path $dshHome)) { throw "缺少 $dshHome" }
    if (-not (Test-Path (Join-Path $runtimeSrc 'DeepSeek Harness.exe'))) {
        throw "缺少 DSH 运行时：$runtimeSrc"
    }
}

# ---------- 1. 停掉本目录下正在运行的实例（否则 exe 被占用）----------
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -in @('desredteam.exe', 'DesRedTeam-Desktop.exe', 'DeepSeek Harness.exe') -and
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, 'OrdinalIgnoreCase')
    } |
    ForEach-Object {
        Say ("  停止运行中的实例 pid=" + $_.ProcessId)
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 2

# ---------- 2. 组装 ----------
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item $launcher (Join-Path $stage 'DesRedTeam-Desktop.exe') -Force
Say "  [+] DesRedTeam-Desktop.exe"

if ($WithDSH) {
    Say '  [..] 复制 dsh-home（DSH 的独立配置与数据）'
    # /XJ 跳过 junction：@deepseek-ai 投影由启动器在新机器上自动重建
    robocopy $dshHome (Join-Path $stage 'dsh-home') /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
    Say '  [..] 复制 DSH 运行时（约 1.4GB，请耐心等）'
    robocopy $runtimeSrc (Join-Path $stage 'dsh-runtime') /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
    Say ("  [+] dsh-home + dsh-runtime 完成")
}

# ---------- 3. 使用说明 ----------
$dshNote = if ($WithDSH) {
@'

【两个 DSH 入口】
- 左侧「对话」页          → 内嵌 DSH 前端
- 「DeepSeek Harness」页  → 同一个 DSH 前端
完整版已带 dsh-home（独立配置）与 dsh-runtime（DSH 运行时），首次启动会自动
按当前路径修复内部链接与插件投影，换盘符/换目录都不用管。
'@
} else {
@'

【两个 DSH 入口】
- 左侧「对话」页 / 「DeepSeek Harness」页
精简版不含 DSH 运行时，这两个页面会空白；其余功能不受影响。
（需要 DSH 请用： .\package.ps1 -WithDSH  重新打包）
'@
}

$readme = @"
DesRedTeam 桌面版 —— 使用说明
==============================

【怎么用】
1. 把本文件夹整个拷到目标电脑（建议放纯英文路径，如 D:\DesRedTeam）
2. 双击  DesRedTeam-Desktop.exe
3. 首次启动要释放资源 + 拉起服务，等 10~60 秒会自动弹出程序窗口

【免登录】
平台已去掉登录密码，打开即进入界面。

【端口】
- 8090  平台本体
- 9119  DSH 前端（平台内嵌使用）
被占用时改 config.yaml 里的 server.port / 全局补丁端口，然后重启本程序。

【文件位置】
- 数据与配置：exe 所在目录（config.yaml、data\、logs\、tmp\）
- 启动日志：logs\startup.log（出问题先看这个）
- 想换数据目录：启动前设置环境变量 DRT_HOME=<目录>

【环境要求】
- Windows 10/11 x64
- 有 WebView2 运行时才能用原生窗口；没有会自动退回 Edge 应用窗口，功能不受影响
- 首次运行若被安全软件拦截，请加入白名单（平台含渗透测试 / C2 相关模块）
$dshNote

【安全提醒】
config.yaml 里 server.host 若为 0.0.0.0，同局域网任何人都能免密访问本平台，
建议改成 127.0.0.1（只本机可访问）。
"@
Set-Content -Path (Join-Path $stage '使用说明.txt') -Value $readme -Encoding UTF8
Say "  [+] 使用说明.txt"

$folderMB = DirSizeMB $stage
Say ("  文件夹大小：约 {0} MB" -f $folderMB)

# ---------- 4. 压缩 ----------
if (-not $NoZip) {
    $zip = Join-Path $OutDir "$stageName.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Say '  [..] 正在压缩（大包会比较慢）'
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) {
        & $tar.Source -a -c -f $zip -C $OutDir $stageName
    }
    if (-not (Test-Path $zip)) {
        Say '  [..] tar 不可用，改用 Compress-Archive'
        Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
    }
    Say ("  [+] {0}（{1} MB）" -f $zip, [math]::Round((Get-Item $zip).Length / 1MB, 0))
}

Say ''
Say '===== 打包完成 ====='
Say ("  文件夹：{0}" -f $stage)
if (-not $NoZip) { Say ("  压缩包：{0}" -f (Join-Path $OutDir "$stageName.zip")) }
Say '  拷到目标电脑后，双击其中的 DesRedTeam-Desktop.exe 即可。'
