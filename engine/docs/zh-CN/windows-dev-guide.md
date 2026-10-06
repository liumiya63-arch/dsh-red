# Windows 部署与开发指南 (DesRedTeam)

> 本文是官方 `developer-guide.md` 的 Windows 原生补充 —— 官方文档基于 Linux/bash (run.sh)，
> 本文覆盖 Windows 10/11 上从零编译、部署、二次开发的完整实战流程与踩坑记录。
> 适用版本: DesRedTeam 1.7.11 · Go 1.26 · w64devkit gcc 16.1.0

---

## 1. 环境要求 (Windows)

| 组件 | 要求 | 本机现状 |
|---|---|---|
| Go | >= 1.25 (以 go.mod 为准) | 1.26.5 @ `D:\Program Files\Go` |
| C 编译器 | 必须 (mattn/go-sqlite3 依赖 CGO) | w64devkit gcc 16.1.0 @ `D:\app\w64devkit\w64devkit\bin` |
| Python | >= 3.10 (venv + 部分工具) | 3.12.8 |
| 网络 | GitHub 直连不通时需代理 | Clash 系统代理 `127.0.0.1:7897` |

关键点: **sqlite 驱动是 `github.com/mattn/go-sqlite3` (CGO 驱动)**, 没有 gcc 会编译失败。
代码内有 Windows 专属实现 (`//go:build windows`), 虚拟终端/C2/WebShell 在 Windows 上均可运行:
- `internal/handler/terminal_stream_windows.go` — 命令流用 stdout/stderr 管道
- `internal/handler/terminal_ws_windows.go` — WebSocket 终端
- `internal/security/procattr_windows.go` — 进程组管理 (taskkill /F /T)

## 2. 一次性环境搭建

### 2.1 升级 Go (zip 覆盖式, 可回滚)

```powershell
# 备份旧版 -> 解压新版到 D:\Program Files\go
Rename-Item "D:\Program Files\Go" "D:\Program Files\Go.1.24.4.bak"
Expand-Archive D:\app\downloads\go1.26.5.windows-amd64.zip -DestinationPath "D:\Program Files" -Force
go version   # go version go1.26.5 windows/amd64
```

### 2.2 mingw gcc (w64devkit, 免安装)

```powershell
# GitHub 需代理: 系统代理 127.0.0.1:7897 (Clash)
curl.exe -L -x http://127.0.0.1:7897 -o D:\app\downloads\w64devkit-x64-2.9.0.7z.exe `
  https://github.com/skeeto/w64devkit/releases/download/v2.9.0/w64devkit-x64-2.9.0.7z.exe

# 7z SFX 静默解压 —— 注意: 会多解出一层 w64devkit\ 子目录
D:\app\downloads\w64devkit-x64-2.9.0.7z.exe -y -oD:\app\w64devkit
# 实际 gcc 在: D:\app\w64devkit\w64devkit\bin\gcc.exe

# 写入用户 PATH (持久化)
setx Path "$env:Path;D:\app\w64devkit\w64devkit\bin"
```

### 2.3 Go 依赖代理 (国内)

```powershell
$env:GOPROXY = "https://goproxy.cn,direct"
```

## 3. 编译

```powershell
cd <DESREDTEAM_HOME>\desredteam
$env:CGO_ENABLED = "1"
go build -o desredteam.exe cmd/server/main.go
# 产物约 88MB; 首次编译 1~3 分钟 (依赖自动下载)
```

其它入口 (cmd/): `mcp-stdio` (MCP stdio 模式), `test-config`, `test-external-mcp`, `test-sse-mcp-server`。

## 4. Python 虚拟环境

```powershell
cd <DESREDTEAM_HOME>\desredteam
python -m venv venv
venv\Scripts\pip.exe install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

需要 Python 的工具 (api-fuzzer、dnslog、http-intruder 等) 自动使用该 venv。

## 5. 配置与启动

```powershell
# 首次: 复制配置模板
Copy-Item config.example.yaml config.yaml
# server.host / server.port / tls_enabled / tls_auto_self_sign 见文件顶部注释

# 启动 (HTTPS 自签, 默认 8080)
.\desredteam.exe --https
# 明文 HTTP: .\desredteam.exe --http
```

启动成功的标志 (stdout):

```
● ONLINE   https://127.0.0.1:8080/
ADMIN SETUP REQUIRED
  Username  admin
  Password  xxxxxxxxxxxx   <- 仅显示一次! 立即保存并登录后修改
```

本机已配好一键脚本: `D:\app\start-cyberstrike.bat` (参数 `start` / `stop`)。
admin 初始密码始终记录在 `D:\app\cyberstrike.log`。

## 6. 二次开发快速索引

| 想改什么 | 位置 |
|---|---|
| HTTP 路由 | `internal/app/app.go` 的 `registerRoutes` |
| Handler | `internal/handler/` |
| 数据库 | `internal/database/` (SQLite, WAL 模式) |
| 认证/Shell 执行 | `internal/security/` |
| MCP 服务器/联邦 | `internal/mcp/` |
| Eino 智能体编排 | `internal/multiagent/` |
| 工作流运行时 | `internal/workflow/` |
| 知识库 | `internal/knowledge/` |
| 内置 C2 | `internal/c2/` |
| 前端模板/静态资源 | `web/templates/` + `web/static/` (改完刷新即生效, 无需前端构建) |
| 命令工具 YAML | `tools/` (100+ 预置配方) |
| 角色/Agent/Skills | `roles/` `agents/` `skills/` |
| 供应链(股权穿透)页面 | `web/static/js/supply-chain.js` + 落库规范见 `docs/zh-CN/supply-chain-module.md` (2026-08-07) |
| 日志体系 | config.yaml `log.output`(zap 文件) + start-cyberstrike.bat 重定向(access.log), 轮转看门狗 rotate_cyberstrike_logs.py |

改动 Go 代码后重新编译 + 重启:

```powershell
taskkill /F /IM desredteam.exe
go build -o desredteam.exe cmd/server/main.go
.\desredteam.exe --https
```

详细扩展点 (插件、MCP 联邦、Agent Skills、工作流) 见官方:
`docs/zh-CN/developer-guide.md` · `plugin-development.md` · `mcp-federation.md` · `skills-guide.md` · `workflow-graph.md`

## 7. 踩坑记录 (本机实战)

1. **GitHub 直连不通** → winget 装 WinLibs 报 `InternetOpenUrl() failed 0x80072f19`。
   解决: 开 Clash 系统代理 (127.0.0.1:7897) 后用 `curl.exe -x` 下载, 或走 goproxy.cn。
2. **USTC/TUNA 镜像对脚本 UA 反爬** → 目录列表 200 但文件下载 403。用 `curl.exe -A "Mozilla/5.0"` 或换官方源。
3. **repo.msys2.org 下载龟速** (安装器 90MB) → 放弃 MSYS2 路线, 改用 w64devkit 单 zip (58MB)。
4. **7z SFX 解压多一层目录** → `-oD:\app\w64devkit` 后实际 gcc 在 `D:\app\w64devkit\w64devkit\bin\`。
5. **setx PATH 有 1024 字符截断风险** → 先 `reg query "HKCU\Environment" /v Path` 看长度, 太长用 PowerShell `Set-ItemProperty`。
6. **cmd 批处理里 echo %errorlevel% 会被预展开** → 需要 `setlocal enabledelayedexpansion` 用 `!errorlevel!`。
7. **后台启动卡住** → PowerShell `Start-Process` + `-RedirectStandardOutput` 偶发挂起, 服务实际已起; 用 `tasklist`/`netstat -ano | findstr :8080` 验证, 别只信命令返回值。
8. **0.0.0.0 监听** → config.example.yaml 默认 `host: 0.0.0.0`。渗透机在目标网络内时务必改 `127.0.0.1` 并重启, 防止平台本身被扫描。

## 8. 验证清单

```powershell
# 进程 + 端口
tasklist /FI "IMAGENAME eq desredteam.exe"
netstat -ano | findstr ":8080" | findstr LISTENING
# HTTPS 可达 (自签证书加 -k)
curl.exe -sk -o NUL -w "%{http_code}" https://127.0.0.1:8080/   # 期望 200
# http 跳 https
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" http://127.0.0.1:8080/  # 期望 308 -> https
```
