# PoC-in-GitHub（CVE 公开利用索引）

> 索引：https://github.com/nomi-sec/PoC-in-GitHub  
> **不要 clone、不要把仓库下到本机。** 它只告诉你「这个 CVE 的公开 PoC 在 GitHub 哪几个仓库」。现场检出 CVE 号之后再按路径取**那一条** JSON。
>
> 仓库自述：PoC 自动收集，**可能带马**。读 README / 验证步骤，不要盲跑二进制、不要 `curl | sh`。
>
> 写不写只认 `vuln-report-format.md`。本仓库默认授权 SRC；未授权目标不写 exploit。破坏性 payload 仍受最小伤害约束。

## 一、什么时候开

现场已经有 **CVE 号**（或产品+版本能唯一对上一条 CVE）才开：

- 响应头 / 登录页 / actuator / swagger 对上已知中间件版本
- nuclei 收窄模板命中（命中是线索，不是洞）
- 国产 OA / 用友 / 泛微 / 若依 对上公开 CVE
- 用户直接丢 CVE 号

没有 CVE 号：继续对象图 / 短表，不要拿本索引当开场扫描源。

## 二、怎么查（只取一条）

路径规则：

```
https://github.com/nomi-sec/PoC-in-GitHub/blob/master/<YEAR>/CVE-<YEAR>-<NNNN>.json
```

用 GitHub MCP，不要 git clone：

```
mcp__github__get_file_contents
  owner: nomi-sec
  repo:  PoC-in-GitHub
  path:  2024/CVE-2024-4577.json
```

年份从 CVE 号取。没有这个文件 = 索引里还没收录，转 NVD / 厂商公告 / `search_code` `CVE-xxxx`，不要把整个年目录 list 一遍当进度。

JSON 里是仓库列表（html_url、description、stars）。挑 1～2 个看起来像分析/复现的，再 `get_file_contents` 读那个 PoC 仓库的 README。不要把 PoC 源码抄进本知识库，也不要批量 pull。

## 三、怎么用（授权目标）

1. **对版本。** PoC 适用版本和当前站对不上 → 停，不当洞。
2. **最小复现。** 优先只读探测（path 是否在、回包是否特征页）。RCE / 写文件 / 反弹：证伪即可，不落 webshell、不扫内网。
3. **nuclei 命中之后。** 先查本索引看 PoC 怎么打，再对**当前这一个 host** 收窄打。禁止 `nuclei -t cves/` 全量当进度。
4. **报告。** 证据是你在目标上的请求/回包，不是「GitHub 上有 PoC」。PoC 链接可当参考，不当正文。

## 四、假点

- 索引有 JSON、目标版本已补 → 不是洞
- PoC 仓库是扫描器包装 / 星多但 README 是广告
- 二进制 PoC、不明 release 资产 → 不跑
- 把公开 CVE 当 0day 写进报告

## 五、和其它篇

- 暴露面 / 收窄 nuclei：`recon-methodology.md`
- 国产皮见了再对 CVE：`chinese-src-fingerprints.md`
- 反序列化 / JNDI / Struts 等已有专题的，先走专题，本索引只补「PoC 在哪」
