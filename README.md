# dsh-red

DSH（DeepSeek Harness）红队模式：Agent 预设 + 角色引擎 + 方法论知识库。

本仓库是**脱敏后的源码发布副本**，不含任何运行数据、凭据或实战记录。

---

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `engine/` | DesRedTeam 引擎源码（Go） |
| `engine/cmd/` `engine/internal/` | 服务入口与核心实现 |
| `engine/web/` | 内嵌 Web 控制台（模板 / 静态资源 / i18n） |
| `engine/roles/` | 8 个红队角色定义 |
| `engine/agents/` | 角色人格与作业规程 |
| `engine/skills/` | 引擎侧技能包 |
| `engine/knowledge_base/` | SRC 实战方法论知识库 |
| `dsh-presets/` | DSH 侧集成：Agent 预设、技能、profile 补丁 |
| `companion/` | DSH 二开配套：预设与记忆注入插件 |

## 引擎快速开始

```bash
cd engine

# 1. 编译
go build ./...

# 2. 生成配置（填入自己的 API key）
cp config.example.yaml config.yaml

# 3. 启动 HTTP 服务
./desredteam.exe --http
```

Web 控制台默认监听 `http://127.0.0.1:8090`。

## 角色分工

| 角色 | 阶段职责 |
| --- | --- |
| `engagement-planning` | 开局规划 |
| `recon` | 信息收集 |
| `assess` | 资产梳理与优先级评估 |
| `vuln-scan` | 漏洞发现 |
| `exploit` | 漏洞利用、权限落地、隧道 |
| `internal` | 内网渗透与横向 |
| `reporting-remediation` | 报告与整改建议 |
| `cleanup-rollback` | 清场与回滚 |

## DSH 预设安装

`dsh-presets/agent-presets/` 下的预设目录复制到 `$DSH_HOME/.agent-presets/`，
`dsh-presets/profiles/web/cordis.patch.yml` 为 profile 补丁参考。

## 脱敏范围

发布前已移除运行数据、凭据与实战记录，改写本机路径标识。详见 [SANITIZATION.md](SANITIZATION.md)。

## 授权声明

本项目仅用于**已获得明确书面授权**的渗透测试、红队演练与自有资产安全评估。

使用者须自行确保其行为符合所在地法律法规；未经授权对第三方系统使用本项目造成的后果由使用者自负。
