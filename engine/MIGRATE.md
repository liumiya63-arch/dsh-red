# DesRedTeam 便携版迁移指南 (MIGRATE.md)

> 本包 = 编译好的 exe + 配套配置 + 前端 + AI 行为配置, 解压即用。
> 目标机: Windows 10/11 x64。无需 Go / gcc / 数据库, 已全部编进 exe。

## 一、包内容

| 路径 | 说明 |
|---|---|
| desredteam.exe | 平台主程序 (Go + Gin + Eino, 含 sqlite3, 免安装) |
| config.yaml | 平台配置 (含密钥, 见「安全必做」) |
| config.example.yaml | 干净配置模板 |
| setup_env.py / setup-env.ps1 | 密钥配置向导 (环境变量, 不落盘) |
| init.py / init.ps1 | 一键初始化 + 启动 + 自检 (本文件配套) |
| web/ | 前端页面与静态资源 |
| tools/ roles/ skills/ agents/ recon/ | AI 工具/角色/技能/编排配置 |
| knowledge_base/ | 知识库文档 |
| data/ | 数据目录 (空: 首次启动自动建库) |
| docs/ images/ | 文档与图片 |

## 二、三步启动

1. 解压到目标机任意目录 (路径建议纯英文, 如 D:\DesRedTeam)
2. 配置密钥: 运行  setup_env.py  (交互录入 DEEPSEEK_API_KEY 等; 或 setup-env.ps1)
3. 初始化并启动: 运行  python init.py   (自检 → 建目录 → 配 key → 启动 → 验证 8080)

启动完成后浏览器访问 http://127.0.0.1:8080/  (admin 密码见启动日志/系统提示)

## 三、安全必做 (防止密钥泄露)

1. **首次登录后立即改 admin 密码** (系统设置 → 账号)
2. **改 gsl5 token**: config.yaml 里 external_mcp.servers.gsl5 的 Bearer 值,
   同时改 DesShell 侧; 否则旧 token 失效风险由你承担
3. **AI key 走环境变量**: 用 setup_env.py 配置, 不要写进 config.yaml
   (平台读取优先级: 环境变量 > config.yaml; 写 config 会明文落盘)
4. 本 zip 若经他人之手流转, 交付前先运行:
   setup_env.py --key GSL5_TOKEN --clear   以及重置 config.yaml 密钥行

## 四、带数据迁移 (可选, 要保留记忆/资产/漏洞库时)

1. 旧机停服 (taskkill /F /IM desredteam.exe)
2. 拷旧机 data\ 下四件套到新机 data\:
   - conversations.db  + conversations.db-wal + conversations.db-shm
   - conversation_artifacts\  (对话产物)
3. 旧机的知识库目录 knowledge_base\ 如有自定义内容一并拷贝
4. 启动后: 重置 admin 密码 + 改 gsl5 token (数据里可能含旧凭据)

## 五、常见问题

| 症状 | 处理 |
|---|---|
| 8080 端口被占 | init.py --check 看监听; 改 config.yaml http.port |
| 启动后页面打不开 | 确认 exe 未被杀软拦截; 看日志 (见下) |
| 日志在哪 | config.yaml log.output 指定 (默认 D:/app/cyberstrike.log, 建议改到包内 logs/) |
| 浏览器 MCP 不可用 | 需 Edge + 固定 profile (参考 Hermes skill desredteam-dev) |
| workflow-pipeline 工具失败 | 该 MCP 指向旧机绝对路径, 需在新机重新配置或删除 |

## 六、路径修复

旧机的绝对路径 (D:/app/...、C:/Users/Administrator/...) 可能残留:
运行  python init.py --fix-config  自动检测并提示/替换 (改前自动备份)。

## 七、MCP 与 Skills 安装 (学员 / 新机必读)

【Python 依赖】工具脚本需要 Python 3.10+:  pip install -r requirements.txt
  (requests/httpx/arjun/impacket 等; 缺哪个工具会报错, 按需补装)

【Skills / 工具 / 角色】零安装
  skills/  tools/  roles/  agents/  目录解压即用, 平台启动自动扫描, 无需注册。
  验证: python init.py --check   (显示已识别: Skills 26 / 工具 92 / 角色 13 / Agent 15)

【外部 MCP】需要"外部进程/服务", 打包文件替代不了, 目标机要具备运行时:

| MCP | 类型 | 目标机要求 | 缺依赖怎么办 |
|---|---|---|---|
| workflow-pipeline | stdio (python) | Python + Des_workflow 管线 (旧机 C:/Users/.../desworkflow 目录) | 部署管线后改 config.yaml 路径, 或禁用 |
| chrome-devtools | stdio (node) | Node.js + npx + Edge 浏览器 | 装 Node 后改 npx/Edge 路径, 或禁用 |
| gsl5 | http | 本机 9123 端口 (Godzilla webshell 管理器服务) | 部署 GSL5 后改 token, 或禁用 |

  一键检测:   python init.py --setup-mcp
  自动禁用失效: python init.py --setup-mcp --disable-broken   (改前自动备份 config.yaml)
  恢复:      装好依赖后把 config.yaml 里该 server 的 external_mcp_enable 改回 true

【mcp-servers/ 与 plugins/ 目录】
  是 Claude Code 工作流子项目 (pent_claude_agent / reverse_shell) 和浏览器/Burp 插件源码,
  **不是平台 MCP**, 按需单独部署, 详见各自 README。
