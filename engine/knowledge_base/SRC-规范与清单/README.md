# 知识库索引

实战方法论 / 测试清单 / 场景矩阵。与 `SKILL.md` 流程配合使用。

## 使用约定

- 进站先读 `打穿短表.md`；对得上再打开对应模块看细节。文件不长就整篇开；超长篇可先开点名节，不够就继续开。禁止每站通读本目录
- 磁盘有 `*src经验.md` 才开专篇，没有不算缺。开 `SKILL.md` 不会再带集团日记
- 短表和「注入/SSRF/XSS/RCE」都不是上限。本站过全类型矩阵；四件套打在有差分面上（防空窗），不是只测这四类，也不是每个 path 喷 `'`。有会话时越权/逻辑与四件套同硬（`dig-scope` §4.2.3）
- 方便和能力优先；省 token 是顺带，不挡开模块
- 短表点名的手法用标题搜。有指针的肥篇只留实战中文 + 指针段；禁开/几乎不交的篇已收成一行。手法行不删、算成不改矮。
- 篇内跳转已改成本目录真实文件（`idor-test.md` 一类）；不要再跟 `../xxx/SKILL.md`
- 与 `~/.grok/rules` 冲突时 **以 rules 为准**（挖什么 `src-value`；CORS 不挖 `cors-vuln-report-priority`；写不写 `vuln-report-format`）
- **`cors-test.md` / `llm-security-test.md`：不挖/禁开越狱。** `401-403-bypass.md` 不磨登录 HTML。
- 正式 SRC 报告：`~/.grok/rules/vuln-report-format.md`

## 文件清单

| 文件 | 说明 |
|------|------|
| `打穿短表.md` | 挖洞手法索引（一行/指针；正文仍在各模块） |
| `漏洞不收清单.md` | **收不收 / 边界的唯一依据**（不许自己放宽，也不许自己往里加） |
| `skillopt-self-evolve.md` | 技能自进化：把 skill 文档当权重训（学自 microsoft/SkillOpt）；**不进站**，只用于让本库自己变强 |
| `报告写法.md` | SRC 报告版式下限（结构 / 资产证明 ICP / 提交平台）；**rules 不在时按它写** |
| `401-403-bypass.md` | **禁开磨登录 HTML**（已收成一行）；业务 API 401 现场自己打 |
| `api-gateway-test.md` | API 网关 |
| `agent-tool-exec-test.md` | 对话口工具真执行（不是越狱、不是云 IDE RPC） |
| `authbypass-test.md` | 认证绕过（登录口标准清单/验证码/任意注册 + 未登录改密/IDaaS + 短表指针；英文字典已砍） |
| `cache-poisoning-test.md` | 缓存投毒/欺骗（原有+补充） |
| `clickjacking-test.md` | 缺头不写（已收成一行） |
| `cloud-ide-codex-rce-chain.md` | 云 IDE/Codex 系：弱口令→RPC RCE→集群/API Key 链（短表有指针） |
| `cors-test.md` | **不挖勿开**（已收成一行） |
| `crlf-injection-test.md` | 几乎不交（已收成一行） |
| `csp-bypass-test.md` | 几乎不交（已收成一行）；XSS 走 `xss-test.md` |
| `csrf-test.md` | 专题知识（hack-skills 导入或融合） |
| `csv-formula-injection-test.md` | 几乎不交（已收成一行） |
| `dangling-markup-test.md` | 几乎不交（已收成一行） |
| `dependency-confusion-test.md` | 几乎不交（已收成一行） |
| `deserialization-test.md` | 专题知识（hack-skills 导入或融合） |
| `dns-rebinding-test.md` | 几乎不交（已收成一行）；SSRF 走 `ssrf-test.md` |
| `el-injection-test.md` | 专题知识（hack-skills 导入或融合） |
| `email-header-injection-test.md` | 几乎不交（已收成一行） |
| `file-upload-test.md` | 文件上传（STS/列桶/分享鉴权等指针） |
| `ghost-bits-cast-test.md` | Ghost Bits 原理+常用字+公式；逐字节两套表已砍 |
| `graphql-test.md` | GraphQL（原有+补充） |
| `hpp-test.md` | 几乎不交（已收成一行） |
| `http-host-header-test.md` | 专题知识（hack-skills 导入或融合） |
| `http-smuggling-test.md` | 请求走私（原有+补充） |
| `http2-attacks-test.md` | 几乎不交（已收成一行）；走私走 `http-smuggling-test.md` |
| `idor-test.md` | 越权（中文主线 + 短表指针） |
| `info-leak-test.md` | 信息泄露 |
| `injection-test.md` | 注入（**SQL 快速判断：报错真假辨析/四单引号/order by/JSON 型** + OR+total / 邮件订阅 iframe / SSTI；英文百科已砍） |
| `insecure-scm-test.md` | 专题知识（hack-skills 导入或融合） |
| `jndi-injection-test.md` | 专题知识（hack-skills 导入或融合） |
| `js-reverse-guide.md` | JS 逆向（+ **前后端分离：前端路由 vs baseurl / vue 路由守卫 / SpringBoot-Scan**） |
| `llm-security-test.md` | **禁开越狱教材**（已收成一行）；对话工具走 `agent-tool-exec-test.md` |
| `logic-test.md` | 业务逻辑（支付/流程 + 商家促销绑定） |
| `oauth-jwt-test.md` | OAuth/JWT/SAML/OIDC（原有+多源补充） |
| `open-redirect-test.md` | 专题知识（hack-skills 导入或融合） |
| `path-traversal-lfi-test.md` | 专题知识（hack-skills 导入或融合） |
| `prototype-pollution-test.md` | 专题知识（hack-skills 导入或融合） |
| `race-condition-test.md` | 竞态（原有+补充；**§13 中文实操：Turbo Intruder %s / 组并发第 4 模式 / 明确不做清单**） |
| `recon-methodology.md` | 侦察方法论（+ **§14–21 国内生态：edu 专属 FOFA 语法 / icon hash / C 段 / 主体收集**） |
| `ssrf-test.md` | SSRF（IMDS 路径差 / GOPROXY / 对象存储回源） |
| `subdomain-takeover-test.md` | 专题知识（hack-skills 导入或融合） |
| `type-juggling-test.md` | 专题知识（hack-skills 导入或融合） |
| `waf-bypass.md` | WAF 绕过（+ §0 中文先读：规则绕过 vs 架构绕过、**迂回战术**打同款无 WAF 站点） |
| `websocket-test.md` | WebSocket（原有+补充） |
| `xslt-injection-test.md` | 几乎不交（已收成一行） |
| `xss-test.md` | XSS（中文开场 + 冷门事件 + **探测判定/关键字替代 + §9 场景 XSS（swagger/jsonp/OSS png）** + XSS→RCE / 自定义协议） |
| `xxe-test.md` | 专题知识（hack-skills 导入或融合） |

| `miniprogram-test.md` | 微信小程序 / 企微：三张票、解包、越权、密钥假点（+ **强开 F12 / 反编译工具 / App 侧**） |
| `control-gap-hunting.md` | 控制缺口：敏感操作 ↔ 应有控制 |
| `grpc-sse-test.md` | gRPC 反射 / metadata；SSE query 票 |
| `chinese-src-fingerprints.md` | 国内 OA/云皮索引，见了再打当前种子 |
| `poc-in-github.md` | CVE 公开 PoC 索引（[nomi-sec/PoC-in-GitHub](https://github.com/nomi-sec/PoC-in-GitHub)）；不 clone，只取一条 JSON |

**合计：56 个知识文件**（不含本 README）。SRC 报告版式优先认 `~/.grok/rules/vuln-report-format.md`；**该 rules 本机不存在**（2026-09 实测），不存在时按 `报告写法.md` 写。定级只认 format，本库不定级。学打法可参考 [dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model) 的 pentest refs；**不装那个插件**，webshell / 免杀 / C2 模式不进本库。
