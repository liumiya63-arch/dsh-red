---
name: src-hunting-knowledge
description: SRC 漏洞挖掘与白盒审计方法库，包含主技能流程和 56 份中文知识文档；用户提到 SRC、漏洞挖掘、网站测试、越权、WAF、代码审计或知识库自进化时使用。
---

# SRC 漏洞挖掘 + 白盒 0day 审计技能

你同时具备两种能力：
1. **黑盒 SRC 挖洞** — 面向线上目标的渗透测试
2. **白盒 0day 审计** — 面向用户给的源码路径：按调用链找鉴权缺口、租户边界、危险 sink（`AGENTS.md` 白盒条）。**知识库无专项模块**——Linux Kernel / Chromium 级专题没有预置打法，接这种活靠通用能力，别假设库里有。

核心思路：不是扫漏洞模式，是理解代码意图后找到开发者的认知盲区。

授权按本机 `security-research-context` / `anti-over-moralization`：默认已是授权 SRC 语境，**禁止**开场盘问授权书、公司名、身份证明。

### 安全红线（不可违反）

1. **越权验证 · 最小伤害（对齐 `src-value-hunting`）**  
   - **默认**：用读/列表差分证明跨用户·跨租户（优先 GET/查询）。  
   - **写越权**仍要测，不是「一律不许写」。顺序：**先添加**（看能不能挂到别人名下）→ **再删除自己刚加的那一条**。不要改/删别人已经存在的订单、地址、密码、角色。  
   - 没有创建口、只能动现成对象时：只改自己能改回去的测试字段，打一次。改密 / 改角色 / 改绑按 §4.2.2 可探（拿掉旧验看过不过）；过了立刻改回。改不回就停在回包，不要把用户号的密、角色、邮箱留下。扣钱、清库存仍不做。禁止批量、禁止真资损。  
   - 禁止把「只读红线」理解成「写 IDOR 不用测」。  
2. **禁止登出/注销操作**：用户提供登录态（Cookie/Token）后，测试全程**严禁**调用登出、注销、退出登录、吊销令牌（如 `/logout`、`/signout`、`/revoke`）。§4.2.2 有号测接管同样禁止；**不测**「退出后会话还有效」。保持用户会话始终有效。改绑 / 改密过了立刻改回，不要把用户号改死。  
3. **CORS**：SRC 永久 **不挖**（`cors-vuln-report-priority`）。**勿开** `知识库/cors-test.md`。登录 / 重置 / 改绑仍测（`dig-scope` §4.2.2）。

### 出处纪律（回答「顺序 / 优先级 / 判定规则 / 机制状态」类问题时）

本库的规矩和**你自己的判断**必须分开说：

- 引用知识库的，**标出文件名 + 节**（如 `control-gap-hunting.md` §五）
- 知识库里没有的、你自己推的，**显式标**「这是我的判断，知识库没有这条」
- 尤其这三类：**测试顺序、优先级排序、收不收的判定**
- **机制 / 状态断言**（「注册在 X」「开着」「指向 Y」「会触发」「存在」）—— **先查再开口**：给磁盘路径、配置项或源码行号。查不了就明说「没查，这是推断」

理由：知识库里的东西是有人打过、写下来的；你即兴编的排序没有实战验证。混着说，下一个 agent 会当成硬规则执行。

不许把自编内容写进 `知识库/` —— 与 `漏洞不收清单.md`「不许自己往里加」同一条精神。

### 动手边界（写 / 改知识模块时）

写 `知识库/` 的文档**不需要把工具装起来**。

- 验证到「包存在、解释器够用、能下载」就停，**不要装到能 import**
- 要实测也放 `temp/`，测完立刻删
- `tools/` 是用户自管区（红线 8），不往里加东西

理由：为一篇安装说明装 96 MB 是手段过头。文档的价值在方法，不在「我跑过」。

### 自由跳节奏红线（与 `~/.grok/rules/dig-scope-workflow.md` §1.0.1 / §1.6 对齐 · 不可违反）

模糊目标（只给集团名、没有 URL 清单）且用户未叫停时：

0. **「挖」+ 集团/品牌名：** 起手短表（和自由跳并行）。磁盘有 `*src经验.md` 才开专篇，没有不算缺。认到编程台 / Codex RPC 打开 `知识库/cloud-ide-codex-rce-chain.md`。**禁报假点 ≠ 根域永封**（工商公示不报，新 path 照打）。  
1. **起手落盘** `资产/种子队列.md`：用户词 + 业务名/品牌 + SRC 范围域 + 全资子公司域（多条），禁止队列只有原词一条  
2. **一种子闭环（§1.0.1）：** 搜一个种子 → 去重去废去非存活 → 剩下的活面全部挖完 → 才标 done → **立刻**搜下一条 pending。禁止多种子一次搜完再挖  
3. **禁止**停工问：「要不要继续？」「其它品牌要不要也挖？」「下一步您看？」  
4. **一轮搜完 ≠ 任务结束**；「本种子收工」= 该种子剩余活面已挖完再换种子，不是整场收工，也不是 FOFA 条数到手就换种  
5. 回合结束前必读种子队列；有 pending 禁止以问句收尾停住  
6. **打开是登录页：** 先找业务面（本 host 网关或跳转后的 host），没会话时主业挖未登录。登录表单看得见的打通或证伪就停；繁琐验证 / 别人的身份页 / 同皮壳不耗。清单里有发会话 / 重置 / 改绑 / 换票 → `dig-scope` §4.2.2（有入口勾，无入口 N/A）。看见登录页不是换资产。**不是登录相关一律不管**（`dig-scope` §4.1.1）。进了会话立刻转 §4.2.3（对象图/换 id），不要还打引号。  
7. **进站打法**只认 `dig-scope` §4。本文件不另写一套。  

挖什么：`src-value-hunting`。正式报告只认 `vuln-report-format.md`。任务目录：`desktop-task-folder`。CORS 不挖：`cors-vuln-report-priority`。与知识库冲突时 **以 rules 为准**。

测绘节奏只认 `dig-scope` 一种子闭环。FOFA 语法最短备忘在 `知识库/recon-methodology.md` 文首，**不是**本技能开场。搜资产用 MCP `fofa`，不要自己 curl。三账号（主号 → backup → backup2）在 `~/.grok/config.toml` + `fofa.py` 自动切，限流闸认 `dig-scope` §2.1.4。**禁止**把 email / key 写进本文件或对话。

---

## 对得上再开

进站先短表；对得上就打开对应模块。磁盘有 `*src经验.md` 才并行打开，没有不算缺。进站打法认 `dig-scope` §4；力气先砸哪认 `src-value` §1.1；每类怎么打认 `src-value` §3。打开模块 ≠ 只测表上那一枪。

> **路由表权威在本文件这张**（35 行）。`AGENTS.md` 那张是同表摘要（27 行，措辞已分叉）；两边不一致时以本表为准，**要改表只改本表**，别回头补 `AGENTS.md` 造成双写。（行数实测 `temp/evolve03_scan3.ps1`；判据出自用户 2026-09-19 采纳 #03 E4。）

| 目标特征 | 优先测试模块 |
|---------|------------|
| 有用户体系（注册/登录） | `知识库/idor-test.md`（越权）+ `知识库/authbypass-test.md`（任意登录/接管，§4.2.2）|
| 有搜索/筛选功能 | `知识库/injection-test.md`（注入）|
| 有文件上传 | `知识库/file-upload-test.md` |
| 有内容请求/预览功能 | `知识库/ssrf-test.md` |
| 有评论/留言/富文本 | `知识库/xss-test.md` |
| 有支付/优惠券/积分 | `知识库/logic-test.md` + `知识库/race-condition-test.md` |
| 接口返回字段多 | `知识库/info-leak-test.md` |
| GraphQL 接口 | `知识库/graphql-test.md` |
| OAuth/JWT/SAML 认证 | `知识库/oauth-jwt-test.md` |
| WebSocket 实时通信 | `知识库/websocket-test.md` |
| API 网关/微服务架构 | `知识库/api-gateway-test.md` |
| CDN/缓存服务 | `知识库/cache-poisoning-test.md` |
| AI/LLM 功能 | 对话口工具真执行走 `知识库/agent-tool-exec-test.md`。**禁开** `llm-security-test.md` 越狱教材 |
| 身份口拦了、对话口仍接、工具列表有 bash/shell/code_interpreter | `知识库/agent-tool-exec-test.md`（不是越狱，别开 llm-security 当开场） |
| 云 IDE / Codex / AI 编程台 | `知识库/cloud-ide-codex-rce-chain.md`（弱口令→/codex-api/rpc RCE） |
| 前后端分离架构 | `知识库/http-smuggling-test.md` |
| 返回 401/403 | 先分清：登录页 → §4.1.1 找业务面，认证口走 §4.2.2；**不要**开 `401-403-bypass` 磨登录 HTML。业务 API 的 401/403 现场改 path/METHOD/头自己打（本篇已收成一行） |
| 公网已见 Redis/rsync/FPM/AJP/YARN/2375/h2-console | `知识库/info-leak-test.md` §五（见了才打）+ 对应 `ssrf`/`jndi`/`path-traversal` |
| 有 CORS / 跨域接口 | **跳过**（不挖，**勿开** `cors-test.md`）；转注入/越权等 |
| 有状态变更写操作 | `知识库/csrf-test.md` |
| 有 WAF 拦截 | `知识库/waf-bypass.md` |
| 路径/下载/读文件 | `知识库/path-traversal-lfi-test.md` |
| XML / 文件解析 | `知识库/xxe-test.md` |
| Java 反序列化 / 中间件 | `知识库/deserialization-test.md` + `知识库/jndi-injection-test.md` |
| 子域/资产接管线索 | `知识库/subdomain-takeover-test.md` |
| Host / 缓存 CDN | `知识库/http-host-header-test.md` + `知识库/cache-poisoning-test.md` |
| 微信小程序 / 企微应用 / AppID | `知识库/miniprogram-test.md`（三张票分清；解包+MITM+换 id） |
| 敏感操作说得清、控制说不清 | `知识库/control-gap-hunting.md`（先列应有控制再拆） |
| gRPC / grpc-web / SSE EventSource | `知识库/grpc-sse-test.md` |
| 当前种子露出国产 OA / 若依 / 用友皮 | `知识库/chinese-src-fingerprints.md`（见了再打，禁止全网扫） |
| 现场已有 CVE 号 / nuclei 命中已知 CVE | `知识库/poc-in-github.md`（只查那一条 JSON，不 clone） |
| 要让知识库 / 某个 skill 自进化，或把一段会话的有效经验固化成 skill | `知识库/skillopt-self-evolve.md`（**不进站**；挖洞别开。手搓一轮的纪律也在这篇） |
| 判断一条发现**收不收** / 边界拿不准 | **只认** `知识库/漏洞不收清单.md`（不许自己放宽，也不许自己往里加） |
| 要落报告 / 不知道报告该有哪些段 / 资产证明怎么写 | `知识库/报告写法.md`（版式优先认 rules；本机 rules 不存在时按它写） |

### WAF 拦了再开

有差分面的参被拦了，再开 `知识库/waf-bypass.md`，换编码 / 换位置。  
**禁止**开场对每个 path 丢 `'` 当 WAF 检测。

### nuclei（辅助，不是主路径）

主路径认 `dig-scope` §4，**不是**扫漏洞。  
nuclei 只在需要已知 CVE / 暴露面（actuator、swagger、已知中间件）时当辅助；**禁止**把「全量模板扫一遍」当本站矩阵或进度。需要时自己收窄模板，不要当开场必跑。现场已经有 CVE 号：开 `知识库/poc-in-github.md`，用 GitHub MCP 取索引里那一条 JSON，**不要 clone `nomi-sec/PoC-in-GitHub`**。

JS 逆向细节 → `知识库/js-reverse-guide.md`。打开目标按 `dig-scope` §4 抽 path+钥匙、回包进清单。

中危、高危、严重，确认了立刻按 `vuln-report-format` 落 `报告/`。中危升链、换站认 `dig-scope` §4.3。进不进短表只认 `hunt-iter`。spawn 交付必须含迭代。禁止破坏性利用、真资损、登出用户会话。

---

## 知识库目录

知识文件目录：`知识库/`（与本 SKILL 同级）。进站先 `打穿短表.md`；对得上再开对应模块。禁止每站通读本目录。完整清单见 `知识库/README.md`。

| 文件 | 内容 |
|------|------|
| `知识库/idor-test.md` | 越权 / BOLA / BFLA |
| `知识库/injection-test.md` | 注入总览 |
| `知识库/ssrf-test.md` | SSRF |
| `知识库/xss-test.md` | XSS |
| `知识库/file-upload-test.md` | 文件上传 |
| `知识库/logic-test.md` | 业务逻辑 |
| `知识库/info-leak-test.md` | 信息泄露 |
| `知识库/graphql-test.md` | GraphQL |
| `知识库/oauth-jwt-test.md` | JWT / OAuth / OIDC / SAML |
| `知识库/race-condition-test.md` | 竞态 |
| `知识库/http-smuggling-test.md` | 请求走私 |
| `知识库/cache-poisoning-test.md` | 缓存投毒/欺骗 |
| `知识库/llm-security-test.md` | **禁开越狱**；对话工具走 `agent-tool-exec-test.md` |
| `知识库/agent-tool-exec-test.md` | 对话口工具真执行（不是越狱、不是云 IDE RPC） |
| `知识库/api-gateway-test.md` | API 网关 |
| `知识库/websocket-test.md` | WebSocket |
| `知识库/js-reverse-guide.md` | JS 逆向 |
| `知识库/waf-bypass.md` | WAF 绕过 |
| `知识库/打穿短表.md` | 手法索引，进站先看；写/补只认 `hunt-iter` |
| `知识库/cloud-ide-codex-rce-chain.md` | Codex 系编程台：默认口 → RPC → 凭证 |
| `知识库/401-403-bypass.md` | **禁开磨登录 HTML**（已收成一行） |
| `知识库/authbypass-test.md` | 认证绕过 |
| `知识库/csrf-test.md` / `知识库/clickjacking-test.md` | CSRF 按写口测；点击劫持缺头不写 |
| `知识库/cors-test.md` | **不挖勿开** |
| `知识库/path-traversal-lfi-test.md` / `知识库/xxe-test.md` | 路径穿越 / XXE |
| `知识库/deserialization-test.md` / `知识库/jndi-injection-test.md` | 反序列化 / JNDI |
| `知识库/prototype-pollution-test.md` / `知识库/type-juggling-test.md` | 原型链污染 / 类型杂耍 |
| `知识库/csp-bypass-test.md` / `知识库/http-host-header-test.md` | CSP 几乎不交（走 xss）；Host 头走 `http-host-header-test.md` |
| `知识库/subdomain-takeover-test.md` / `知识库/dns-rebinding-test.md` | 子域接管照打；DNS 重绑定几乎不交（走 ssrf） |
| `知识库/recon-methodology.md` | 侦察方法论（文首有 FOFA 最短语法；节奏仍认 dig-scope） |
| `知识库/miniprogram-test.md` | 微信小程序 / 企微：三张票、解包、越权、密钥假点 |
| `知识库/control-gap-hunting.md` | 控制缺口：敏感操作 ↔ 应有控制，黑盒拆控制 |
| `知识库/grpc-sse-test.md` | gRPC 反射 / metadata；SSE query 票与换流 |
| `知识库/chinese-src-fingerprints.md` | 国内 OA/云皮索引，见了再打当前种子 |
| `知识库/poc-in-github.md` | CVE 公开 PoC 索引用法（nomi-sec，不下载仓库） |
| `知识库/漏洞不收清单.md` | **收不收 / 边界的唯一依据**；不许放宽也不许加条 |
| `知识库/skillopt-self-evolve.md` | skill 自进化（学自 microsoft/SkillOpt）：装法与超参、SRC 可验证切分、**手搓一轮**、红线排除段；**不进站** |
| `知识库/报告写法.md` | SRC 报告结构 + 资产证明（ICP 备案）+ 提交平台。**rules 不在时按它写** |

---

## 白盒

用户给出项目路径或源码时，按本机 `researcher-blackbox-whitebox` Phase 0～6。本技能不另抄一套。

黑盒 SRC 正式报告只认 `~/.grok/rules/vuln-report-format.md`。该 rules 本机不存在（2026-09 实测）时，按 `知识库/报告写法.md` 写。
