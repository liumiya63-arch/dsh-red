# 致敬与致谢

DesRedTeam 平台的构建, 离不开开源社区的卓越贡献。在此郑重致谢:

---

## CyberStrike — AI 原生安全平台奠基

**GitHub: https://github.com/CyberStrikeus/cyberstrike**

CyberStrike 是 DesRedTeam 的前身与基石。它开创性地将 AI 编排引入红队工作流——
Go + Gin 后端、Eino 多代理引擎、MCP 联邦、四层记忆架构、AI 围栏(HITL)审批……
正是 CyberStrike 的这些设计, 让"AI 自主渗透 + 人工审批兜底"成为可落地的工程实践。

DesRedTeam 在其基础上完成品牌重塑、Windows 部署加固、信息收集/股权穿透/供应链模块落地、
GSL5 前端适配与 DesShell C2 深度集成。没有 CyberStrike 的开源, 就没有今天的 DesRedTeam。

---

## GSL5 (Godzilla Super) — WebShell 管理与前端适配

**GitHub: https://github.com/Xaaaa-bip/GodzillaSuper**

GSL5 作为 Godzilla 的增强管理服务, 提供了 45 个 MCP 工具:
shell 增删改查/命令执行/文件管理/数据库操作/流量伪装/进程管理……
DesRedTeam 将其以 streamable-http 方式接入外部 MCP, 平台前端直接适配——
用户在平台内即可完成哥斯拉 WebShell 的全生命周期管理。

本仓库内 gsl5/ 目录配套(jar + license + profile + jre8)即来自该项目。

---

## 其他致谢

- **DesShell**: C2 框架与免登录 URL token 桥接设计
- **fscan / spray / ehole**: A 线资产探测三件套
- **Eino**: 字节跳动开源的 Go AI 编排框架
- 以及所有被引入平台 skills/ 的安全方法论与工具的作者们

---

## 开源精神

> 我们站在巨人的肩膀上。DesRedTeam 同样保持开源——
> 平台源码完全开放, 希望它能像 CyberStrike 启发我们一样, 启发更多人。
> 欢迎 Star / Fork / PR, 一起把 AI 安全工程做得更好。
