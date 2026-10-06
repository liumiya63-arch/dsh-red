# DesRedTeam 部署调试记录 (2026-08-08)

> 本文档记录部署/调试过程中踩过的坑与最终结论, 按"症状 → 根因 → 解法"组织。
> 配合 `start.bat` 一键启动使用。启动参数与端口约定:
> - 平台: `desredteam.exe --http` (8080)
> - DesShell: `desshell-server-standalone.exe -a 0.0.0.0 -p 8095 -ap 8084 -t des-redteam-2026` (8095面板/8084客户端)
> - GSL5: `jre8\bin\java.exe -jar gsl5.jar mcp 9123` (9123)

---

## 1. DesShell 启动后平台起不来 / C2 不上线

- **症状**: DesShell 裸跑 `-p 8081` 或漏 `-p`, 平台 8080 起不来; 或桥接界面能开但 API 全挂。
- **根因**: DesShell standalone **默认面板端口 = 8080**, 不带 `-p` 会抢平台端口; token 不固定时每次随机, 平台 iframe 固定 token 永远 401。
- **解法**: 显式固定参数 `-a 0.0.0.0 -p 8095 -ap 8084 -t des-redteam-2026`, token 与平台 config.yaml 的 `des_shell.token` 一致。
- **排查**: `netstat -ano | findstr ":8080 :8095"` + `tasklist /FI "PID eq <pid>"` 核对端口归属。

## 2. GSL5 连接失败 "actively refused"

- **症状**: 平台先启动, GSL5 后启动, MCP 显示 disconnected / 502。
- **根因**: GSL5 是 Java, JVM 启动慢, 平台启动时 9123 还没监听。
- **解法**: ①启动顺序 GSL5 → DesShell → 平台; ②或平台先起也没事, 有自动重连(30s 指数退避)会自愈; ③最稳是先起 GSL5。

## 3. GSL5 webshell 添加弹窗 NPE (getCryption null)

- **症状**: 平台调 `shell_add` 添加 webshell, GSL5 弹窗 `NullPointerException at core.ApplicationContext.getCryption`。
- **根因**: `shell_add`/`shell_edit` 的 `cryption` 只认**准确名**(如 `JAVA_AES_BASE64`); 模糊名 `aesbase64` 仅 `shell_create` 支持自动识别。
- **解法**: 先调 `payload_list` 查准确名 → `shell_add` 用准确 cryption。
- **速查**: Java→`JAVA_AES_BASE64`; PHP→`PHP_XOR_BASE64`/`PHP_AES_XOR_BASE64`; C#→`CSHARP_AES_BASE64`; ASP→`ASP_BASE64`; NetCore→`NETCORE_AES_BASE64`。

## 4. shell 删不掉 (提示"删除失败")

- **症状**: 连接测试过的 shell 记录 `shell_delete` 报"删除失败"。
- **根因**: GSL5 内存锁定被初始化过的 shell。
- **解法**: 重启 GSL5 进程清状态后再删, 即成功。

## 5. GSL5 弹窗中文乱码 (锟斤拷)

- **症状**: GSL5 返回的提示显示为乱码。
- **根因**: GSL5 返回 GBK 中文, 平台前端按 UTF-8 渲染 — 显示层问题, 非功能故障。

## 6. 外部 MCP enable 改了不生效

- **症状**: config.yaml 里 `external_mcp.servers.xxx.external_mcp_enable` 改成 false, 重启后仍连接。
- **根因**: 平台 `NewExternalMCPManagerWithStorage` 把启用状态**持久化在 DB**(data/conversations.db), 重启后以 DB 为准。
- **解法**: 改完 config 后, 若 DB 里已是旧状态, 需在界面/API 手动停用, 或删库重建。

## 7. 删除 conversations.db 的影响

- **症状/疑问**: 删 `conversations.db` + `-wal` + `-shm` 会不会影响运行?
- **结论**: **不影响运行**, 平台启动自动重建空库(48 张表, 结构完整); 但**数据全清**(漏洞/事实/对话/资产)且 **admin 密码重置**为初始密码(看启动日志 banner)。
- **备份恢复**: 把 `conversations.db.bak-<时间戳>` 改回 `conversations.db` 再重启即可。

## 8. admin 密码哪来的

- **首次启动/空库**: 日志 banner 的 `ADMIN SETUP REQUIRED` 段, 只显示一次。
- **带旧库启动**: 沿用库里的旧密码(本机开发库为 `vr-hP3or2kfTscAtMsjrxVxq`)。
- **忘了密码**: `desredteam.exe --reset-admin-password` 交互式重置。

## 9. 局域网/外网访问

- 服务全部监听 `0.0.0.0`(netstat 确认), 用本机 IP 替换 127.0.0.1 即可, 如 `http://172.20.10.2:8080/`。
- 平台 `--http` 模式必须(DesShell 免登录 URL token 桥接仅 http 生效)。

## 10. 平台工具 enabled 数量

- tools/*.yaml 84 个 Linux 工具禁用(Windows 不兼容), 仅 8 个启用(exec/dns-enum/icp-scan/quake-tool/sg-code-search/supply-chain-collect/xiaolanben-search/query-execution-result)。
- 平台 API 显示 enabled=39 属正常 = 8 yaml 工具 + 31 个内置 Go 工具(资产/事实/漏洞/执行控制/批量任务, 非命令行走 Linux 二进制)。

---

## 启动顺序速记

```
GSL5(9123) → DesShell(8095/8084) → 平台(8080 --http)
```

## 关键文件

| 文件 | 说明 |
|---|---|
| `start.bat` | 一键启动三服务(幂等, 已在跑的跳过) |
| `desredteam-run.log` | 平台 banner + 初始密码 + GIN 日志 |
| `desshell-run.log` | DesShell 日志 |
| `gsl5-run.log` | GSL5 日志 |
| `data/conversations.db` | 全部业务数据(漏洞/事实/对话/资产) |
