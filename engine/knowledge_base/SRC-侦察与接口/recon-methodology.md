# recon-and-methodology

> **测绘节奏只认** `dig-scope` §1.0.1 / §2.1：只搜**当前这一个**种子；本种子剩余活面没挖完禁止新搜。认到短表形态只打当前站，禁止拿 Morph 去全网 FOFA。优质根域只回灌，本种子挖完才搜。
>
> **全量 nuclei 不当进度。** nuclei 只在需要已知 CVE / 暴露面（actuator、swagger、已知中间件）时辅助；禁止把「全量模板扫一遍」当本站矩阵。
>
> 调搜用 MCP `fofa`（`fofa__get_alerts`），不要自己 curl。Key 在 `~/.grok/config.toml` `[mcp_servers.fofa.env]`：主号 → backup → backup2，`fofa.py` 遇 429/820041 自动切。限流闸认 `dig-scope` §2.1.4。**禁止**把 email / key 写进本文件或对话。

### FOFA 最短语法（备忘，不是开场）

```
qbase64：查询语句 UTF-8 再 Base64
fields：host,ip,port,title,server
size：先小后翻；本种子结果可翻页，不是换种子

domain="target.com"
header="application/json"
body="actuator"
port="8080"
server="nginx" && domain="target.com"
cert.subject="品牌"
icon_hash="xxx"
status_code="200"
组合 && ；排除 !=
```

Quake / 凤鸟只补**当前种子**缺口，不当开场必跑。语法对照与 ROI 过滤见下文各节；过滤仍服从 `dig-scope` 去废 / 去非存活 / 股权闸。

国内 OA / 若依 / 用友 等皮见了再开 `chinese-src-fingerprints.md`。禁止拿通用 OA 指纹去全网 FOFA 当进度。小程序 AppID 走 `miniprogram-test.md`，不要当普通子域。

# Recon and Methodology


## 1. RECON HIERARCHY

```
Target Selection
└── Scope Definition (in-scope assets)
    └── Asset Discovery (subdomains, IPs, domains)
        └── Tech Fingerprinting (what's running)
            └── Endpoint Discovery (attack surface)
                └── Vulnerability Testing (per vulnerability type)
```

---

## 2. SUBDOMAIN ENUMERATION (CRITICAL FIRST STEP)

### Passive (no DNS queries to target)
```bash
# Subfinder (aggregates multiple sources):
subfinder -d target.com -o subdomains.txt

# Amass passive:
amass enum -passive -d target.com

# Certsh (certificate transparency):
curl -s "https://crt.sh/?q=%.target.com&output=json" | jq -r '.[].name_value' | sort -u

# SecurityTrails API, Shodan:
# Web: https://securitytrails.com/list/apex_domain/target.com
```

### Active (DNS brute force + resolution)
```bash
# Massdns + wordlist:
massdns -r /path/to/resolvers.txt -t A -o S -w output.txt \
  <(cat wordlist.txt | sed 's/$/.target.com/')

# ffuf for subdomain brute:
ffuf -w subdomains-wordlist.txt -u https://FUZZ.target.com \
  -mc 200,301,302,403 -H "Host: FUZZ.target.com"

# DNSx for bulk resolution:
cat subdomains.txt | dnsx -a -resp -o resolved.txt

# Recommended wordlist: SecLists/Discovery/DNS/
```

### Virtual Host Discovery
```bash
# ffuf vhost mode:
ffuf -w wordlist.txt -u https://target.com \
  -H "Host: FUZZ.target.com" -mc 200,301,403

# gobuster vhost:
gobuster vhost -u https://target.com -w wordlist.txt
```

---

## 3. SERVICE AND PORT DISCOVERY

```bash
# Fast port scan (common ports):
nmap -T4 -F target.com -oN ports.txt

# Comprehensive scan on resolved subdomains:
cat resolved_ips.txt | nmap -iL - --open -p 80,443,8080,8443,8888,3000,5000 -oG scan.txt

# httpx for HTTP probing:
cat subdomains.txt | httpx -title -tech-detect -status-code -o live_hosts.txt

# masscan for speed on large IP ranges:
masscan -p 80,443,8080,8443 10.0.0.0/8 --rate=1000
```

---

## 4. WEB TECHNOLOGY FINGERPRINTING

```bash
# Wappalyzer (browser extension) or:
whatweb https://target.com

# httpx with tech detection:
httpx -u https://target.com -tech-detect

# Check headers manually:
curl -sI https://target.com | grep -i "server\|x-powered-by\|x-generator\|cf-ray"

# Fingerprint from:
- Server header: nginx/1.18, Apache/2.4, IIS/10.0
- X-Powered-By: PHP/7.4, ASP.NET
- Cookies: PHPSESSID (PHP), JSESSIONID (Java), _rails_session (Rails)
- HTML comments: <!-- Drupal 9 -->
- Meta generator: <meta name="generator" content="WordPress 6.2">
- JS framework files: /static/js/angular.min.js
```

---

## 5. ENDPOINT DISCOVERY

### Directory Brute Force
```bash
# ffuf (fastest):
ffuf -u https://target.com/FUZZ -w /usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt \
  -mc 200,301,302,403 -t 50 -o dirs.txt

# Gobuster:
gobuster dir -u https://target.com -w wordlist.txt -x php,html,js,json

# feroxbuster (recursive):
feroxbuster -u https://target.com -w wordlist.txt -x php,html,txt -r
```

### Parameter Discovery
```bash
# Arjun (hidden parameter finder):
arjun -u https://target.com/api/endpoint

# x8:
x8 -u https://target.com/api/endpoint -w params-wordlist.txt
```

### JavaScript Source Mining
```bash
# Extract endpoints from JS files:
gau target.com | grep '\.js$' | httpx -mc 200 | xargs -I{} curl -s {} | \
  grep -oE '"/[a-zA-Z0-9/_-]+"' | sort -u

# LinkFinder:
python3 linkfinder.py -i https://target.com -d -o output.html

# GetAllURLs (gau):
gau target.com | sort -u > all_urls.txt

# Wayback URLs:
waybackurls target.com | sort -u > wayback_urls.txt
```

### API Endpoint Discovery
```bash
# Common API paths:
ffuf -u https://target.com/FUZZ -w /SecLists/Discovery/Web-Content/api/api-endpoints.txt

# Swagger/OpenAPI:
test: /swagger.json /api-docs /openapi.json /v2/api-docs /.well-known/ /docs/

# GraphQL:
test: /graphql /gql /v1/graphql /api/graphql
```

---

## 6. SOURCE CODE RECON

### GitHub / GitLab Exposure
```bash
# trufflehog (secret scanner in git history):
trufflehog git https://github.com/target-org/target-repo

# gitleaks:
gitleaks detect --source /path/to/cloned/repo

# Manual GitHub search:
# site:github.com "target.com" "api_key" OR "secret" OR "password"
# site:github.com "target.com" ".env" OR "config.php" OR "db_password"

# GitHub dorks:
# "target.com" extension:env
# "target.com" filename:*.config password
# org:target-org secret OR password OR apikey
```

### Exposed Environment Files
```
# Check common paths:
https://target.com/.env
https://target.com/.git/config
https://target.com/config.json
https://target.com/config.yaml
https://target.com/credentials.json
https://target.com/secrets.json
https://target.com/wp-config.php
https://target.com/backup.sql
https://target.com/backup.zip
```

---

## 7. ZSEANO'S TESTING METHODOLOGY

> **节奏不听本节。** 自由跳 / 一种子 / 力气先砸哪认 `dig-scope` + `src-value` §1.1。本节只当：参数怎么想、错误页/旧版本/移动端 API 别漏。命令和思路仍用。

### Core Philosophy
1. **Go deep on one program** rather than spread across many — learn the application thoroughly
2. **Build a profile of the company** — tech stack, developers, processes
3. **Look where others don't** — check error pages, admin paths, old versions, mobile API
4. **Follow the filter** — if input is filtered somewhere, that functionality exists and may be bypassed

### Testing Sequence (One Page / Feature)
```
For each input point:
1. Non-malicious HTML tags (<h2>, <img>) → are they reflected?
2. Incomplete tags → what happens? (<iframe src=//evil.com )
3. Encoding tests → %0d, %0a, %09, <%00
4. Observe the OUTPUT too (not just response) — where does your input appear?
5. Test same input in ALL similarly-structured pages (shared code → shared vuln)
6. Check if the same parameter exists in mobile/API endpoint (less protected)
```

### Parameter Insights
```
- Each parameter tells a story: "what does this do server-side?"
- Filename → OS interaction → Path Traversal / CMDi
- URL/location → HTTP fetch → SSRF
- Template/HTML parameter → render function → SSTI
- XML field → parser → XXE
- SQL filter → query → SQLi
- User-content → storage → Stored XSS
```

---

## 8. BUG BOUNTY PROGRAM TRIAGE (WHERE TO SPEND TIME)

> **节奏不听本节。** 自由跳种子/换站认 `dig-scope`；力气先砸哪认 `src-value` §1.1。下面 Priority 不是第二套测绘，也不是 SRC 定级。命令和参数思路仍用。

### High-Value Target Selection
```
✓ Programs with large scope (*.target.com)
✓ Programs that pay for P2/P3 (not just RCE)
✓ Programs with recent tech changes (migrations = new bugs)
✓ Programs with active development (new features = new attack surface)
× Avoid: frozen/old codebases with well-known CVEs (already claimed)
× Avoid: strict programs with narrow scope (less surface)
```

### High-Value Feature Focus (by bug probability)
```
Priority 1: Authentication, password reset, 2FA → account takeover
Priority 2: File upload, profile edit, API endpoints → stored XSS, IDOR
Priority 3: Admin panels, user management → BFLA, privilege escalation
Priority 4: Payment flows, subscription → business logic
Priority 5: Import/export, template rendering → XXE, SSTI
```

---

## 9. NUCLEI TEMPLATES (AUTOMATED SCANNING)

全量模板扫一遍不当进度。只在已知 CVE / 暴露面需要时收窄模板。

```bash
# 收窄：已知 CVE / 暴露面，不要当开场全量
nuclei -u https://target.com -t cves/ -severity critical,high
nuclei -u https://target.com -t exposures/
nuclei -u https://target.com -t misconfiguration/

# On subdomain list:
cat subdomains.txt | nuclei -t exposures/ -t misconfiguration/ -o exposed.txt
```

检出 **CVE 号** 之后：不要 clone 利用仓库。按 `poc-in-github.md` 用 GitHub MCP 取 `nomi-sec/PoC-in-GitHub` 里那一条 `<YEAR>/CVE-....json`，再读 1～2 个 PoC 的 README。索引不是扫描源。

---

## 10. COMMON MISCONFIGURATIONS (QUICK WINS)

```
□ CORS: SRC 永久跳过（不挖不写；见 cors-vuln-report-priority）— 勿当 quick win
□ S3 bucket public: curl https://target.s3.amazonaws.com/
□ Directory listing: response contains "Index of /"
□ .git exposed: curl https://target.com/.git/config
□ .env exposed: curl https://target.com/.env
□ Debug mode: stack traces in production (source code exposure)
□ Default credentials: admin:admin, admin:password on admin panels
□ phpinfo.php: curl https://target.com/phpinfo.php
□ Backup files: config.bak, database.sql.gz, app.zip
□ GraphQL introspection enabled: POST /graphql {"query":"{__schema{types{name}}}"}
□ Admin panels: /admin /manager /console /phpmyadmin /wp-admin
```

---

## 11. QUICK REFERENCE TOOLS

| Category | Tool |
|---|---|
| Subdomain enum | subfinder, amass, massdns |
| Port scan | nmap, masscan |
| HTTP probe | httpx |
| Dir brute | ffuf, feroxbuster, gobuster |
| JS mining | LinkFinder, gau, waybackurls |
| Secret scan | trufflehog, gitleaks |
| Parameter fuzz | arjun, x8 |
| Vuln scan | nuclei |
| Proxy/intercept | Burp Suite Pro |
| JWT attacks | jwt_tool |
| SQLi | sqlmap |
| XSS | dalfox, XSStrike |
| SSRF | SSRFmap, Gopherus |

---

## 12. JAVA MIDDLEWARE FINGERPRINT MATRIX

| Middleware | Detection Path | Key Indicators |
|---|---|---|
| Apache Tomcat | `/manager/html`, `/manager/status` | Default creds: `tomcat:tomcat`, `admin:admin` |
| JBoss / WildFly | `/jmx-console/`, `/web-console/` | JMX MBean access, WAR deployment |
| WebLogic | `/console/`, `/wls-wsat/` | T3 protocol on 7001/7002, IIOP |
| Spring Boot Actuator | `/actuator/`, `/actuator/env`, `/actuator/heapdump` | JSON endpoint listing, heap dump contains secrets |
| Spring Boot (alt paths) | `/actuator/jolokia`, `/actuator/gateway/routes` | Jolokia JMX bridge, Gateway route injection |
| Jenkins | `/script`, `/manage` | Groovy console, API token in cookie |
| GlassFish | `/common/`, `/theme/` | Admin on 4848, default empty password |
| Jetty | `/jolokia/` | JMX access |
| Resin | `/resin-admin/` | Admin panel |

### Spring Boot Actuator Exploitation Priority

```
/actuator/env          → Leak environment variables (DB creds, API keys)
/actuator/heapdump     → Download JVM heap → search for passwords in memory
/actuator/jolokia      → JMX → possible RCE via MBean manipulation
/actuator/gateway/routes → Spring Cloud Gateway → SpEL injection (CVE-2022-22947)
/actuator/configprops  → All configuration properties
/actuator/mappings     → All URL mappings (hidden endpoints)
/actuator/beans        → All Spring beans
/actuator/shutdown     → POST to shutdown application (DoS)
```

---

## 13. INFORMATION LEAK DETECTION CHECKLIST

### Version Control & Backup Leaks

```
/.git/HEAD                    → Git repository exposed
/.svn/entries                 → SVN metadata
/.svn/wc.db                   → SVN SQLite database
/.hg/requires                 → Mercurial
/.bzr/README                  → Bazaar
/.DS_Store                    → macOS directory listing
```

### Backup File Patterns

```
/backup.zip    /backup.tar.gz    /backup.sql
/wwwroot.rar   /www.zip          /web.zip
/db.sql        /database.sql     /dump.sql
/config.php.bak    /config.php~    /config.php.swp
/.config.php.swp   /wp-config.php.bak
/.env          /.env.bak         /.env.production
```

### API Documentation & Debug

```
/swagger-ui.html              → Swagger/OpenAPI
/swagger-ui/                  → Swagger UI
/api-docs                     → API documentation
/graphql                      → GraphQL playground
/graphiql                     → GraphQL IDE
/debug/                       → Debug endpoints
/phpinfo.php                  → PHP configuration
/server-status                → Apache status
/server-info                  → Apache info
/nginx_status                 → Nginx status
```

### Cloud & Infrastructure

```
/.aws/credentials             → AWS credentials
/.docker/config.json          → Docker registry auth
/robots.txt                   → Disallowed paths (hint list)
/sitemap.xml                  → Full URL listing
/crossdomain.xml              → Flash cross-domain policy
/.well-known/                 → Various well-known URIs
```

---

## 14. 国内生态：edu 专属测绘语法（本节是新增重点）

> **范围纪律先看这一条。** 下面每条语法都只服务**当前这一个种子**。搜出来的其它学校/系统只算**线索**，写进 `资产/种子队列.md`，不构成授权扩面。禁止换种子批搜。

### 14.1 site: / domain= / host= 的区别

| 语法 | 属于 | 匹配什么 | 什么时候用 |
|---|---|---|---|
| `site:edu.cn` | Google/Bing | URL 文本 | 找**已收录**的页面、文档、目录，靠搜索索引；最松 |
| `domain="xxx.edu.cn"` | FOFA | 根域 + 子域 + 证书 | 找**存活资产面**（IP/端口/标题）；测绘主力 |
| `host="xxx.edu.cn"` | FOFA | 主机名精确/后缀 | 已知域名找同主机其它端口、路径 |
| `org="..."` | FOFA | 归属组织（注册主体） | 不知道域名、只知道**单位全名**时用 |
| `ip.isp="教育"` | FOFA | 运营商/线路 | 卡**教育网出口**，捞该线路上的单位资产 |

### 14.2 时间过滤

```
after="2022-10-01"     # 只看此后更新/新上的资产，滤掉多年没人管的存量
```

用途：新上系统默认配置差、没人审过。与 `status_code="200"` 连用去废最快。

### 14.3 教育网 org 与线路

```
org="China Education and Research Network Center"
ip.isp="教育"
```

`org` 是**单位全名**，与域名无关：手上没有域名只有学校名时从这里起。命中后按 14.1 落到 `domain=` 收窄。

### 14.4 通用 edu 语法（可直接抄改）

```
city="shiyan" && "登录" && "管理平台" && status_code="200"
title="管理平台" && status_code="200" && body!="验证码" && org="China Education and Research Network Center" && after="2022-10-01"
country="CN" && body="登录" && body="管理平台" && status_code="200"
```

| 片段 | 作用 |
|---|---|
| `title="管理平台"` | 掐后台/中台类系统，比 `"登录"` 精准 |
| `body!="验证码"` | 排掉只有登录框+验证码的空壳页 |
| `status_code="200"` | 去 4xx/5xx 废面，先减量再挖 |
| `body="登录" && body="管理平台"` | 双 body 与，命中同一页里既有登录又有平台字样 |
| `country="CN"` | 兜底收窄，避免串到境外同名词 |

`fields` 建议：`host,ip,port,title,server,domain`（默认已含 org 时按需加）。

### 14.5 落地节奏

命中 → 去重去废去非存活 → **本种子活面全挖完** → 才换下一条 pending。命中一堆学校不是进度，是队列。

---

## 15. edu PII 线索的搜索语法（只作线索，不当漏洞）

> 这些语法用来**发现暴露面**（含 PII 的表格/文档被公开索引），不是用来收集数据。**只记录 URL + 页面存在性**证明，**禁止下载/汇总/转存**表内个人信息；报告只写"该文件可未授权访问"，不贴内容。

| 语法 | 找什么 |
|---|---|
| `site:sjtu.edu.cn filetype:xlsx "学号"` | 校本部域下含学号列的表格 |
| `site:edu.cn filetype:xlsx 身份证` | 教育域名下的身份证相关表格 |
| `site:"edu.cn" "学号" "身份证" AND (filetype:pdf OR filetype:doc OR filetype:xls)` | 多格式并查 |
| `site:域名 ("默认密码" OR "学号" OR "工号" OR "身份证")` | 默认口令/花名册类页面 |

变体：把 `filetype:` 换 `csv`、`mdb`、`sql`、`bak`；把关键词换 `成绩`、`花名册`、`通讯录`、`新生`。

命中后：确认**无需登录可访问**即可作为「信息泄露」线索，不点开表内容逐个核对，不做二次拼接。

---

## 16. 根域名 / 主体收集（国内生态）

| 来源 | 用途 |
|---|---|
| ICP 备案 `https://beian.miit.gov.cn/#/Integrated/index` | 主体 → 名下全部备案域（官方唯一权威） |
| 企查查 / 爱企查 | 子公司、股权、对外投资 → 圈资产范围 |
| riskbird 凤鸟 `https://www.riskbird.com/` | 股权穿透 + 备案/资产关联 |
| 小蓝本 | 收小程序 / App（**注释：不全**，只作补充） |
| 站长之家注册人反查 `https://whois.chinaz.com/reverse/register` | 注册人/邮箱 → 反查同人其它域 |
| icpapi.com | 备案查询（接口化，快；**只查当前种子那几个域**） |

| DNS 反查 / 被动 DNS | 用途 |
|---|---|
| `https://rapiddns.io/` | 子域 + 同 IP 站点 |
| `https://dnsdumpster.com/` | 子域 + DNS 记录图 |
| `https://dns.bufferover.run/dns?q=` | 被动 DNS 记录 |
| dnsgrep.cn | 国内被动 DNS |
| site.ip138.com | IP/域名互查、同 IP 站点 |

纪律：一个种子挑一个源用，别同目标多源重复拉。股权/备案结果按 `dig-scope` 的**股权闸**过滤（无控制关系的不扩面）。

---

## 17. icon hash 实操（找同一套系统）

现有备忘只有一行 `icon_hash="xxx"`，这里给完整流程。

```
1. 下载目标 favicon：https://目标/favicon.ico
2. 算/取 hash：FOFA 的 favicon 计算页或浏览器插件上传该 ico → 得 hash
3. FOFA 查同源资产：icon_hash=="-247765542"
4. 换引擎（hunter）：web.icon=="b3de49720a8385cb3940b5161659e724"
```

| 要点 | 说明 |
|---|---|
| 这是什么 | icon hash 是**同一套系统/同一套 CMS 产品**的通用指纹，不是某个站独有 |
| edu 通杀靠这个 | 一套系统铺多校，命中一套 → 同一产品/同一模板的系统成片出现 |
| 常见误报 | CDN/托管商默认图标、统一 404 页返回的图标 —— 先看 `title`/`body` 同不同，再算命中 |
| hash 不通用 | FOFA `icon_hash` 与 hunter `web.icon`（MD5，32 位）是两套值，各用各的 |

纪律：命中一批同源系统 → 仍按**一种子闭环**打完当前种子再换；把它们记队列，**禁止**拿 hash 去全网扫一遍当进度。同源系统只当「同一开发方的认知盲区可复用」，不批量提交。

---

## 18. C 段 / 旁站

```
ip="188.88.88.0/24"
```

企业自建/自购可能**整段买下**，同段里常是同一套运维、同一批系统。用法：

1. 先确认该 C 段**归属目标组织**（备案 / whois / 反查），不是纯 IDC/云厂商共享段。
2. 再同段捞活面，同段新活面**并入本种子**，不单开测绘。

误报：纯 IDC、云主机、共享托管段里同段就是陌生人，直接放弃，别连坐。

---

## 19. 工具：子域 / 公司架构 / App 资产

| 场景 | 命令 |
|---|---|
| 子域名（多源聚合） | `python oneforall.py --targets domains.txt run` |
| 公司架构 / 子公司 | ENScan_GO `https://github.com/wgpsec/ENScan_GO` |
| APK 提资产 | `python app.py android -i base.apk` |

- oneforall 与上文 subfinder/amass **同用途**，别为同一目标三个都跑；它强在多源聚合与结果导出。
- ENScan_GO 出的是**单位关系**，拿来圈范围；产出的新域并入队列，不单开测绘。
- AppInfoScanner 出的是**包内**接口/域名/硬编码配置：包体是主面，提取到的接口进 JS/接口清单按业务面打，不要只当子域列。
- 三者产出都要过 `dig-scope` 去废 / 去非存活 / 股权闸。

---

## 20. 空白页 / 默认页突破 + 网盘线索

### 20.1 空白页不是废面

```
text.xxx.com 打开是空白/默认页
  → 它很可能就是根目录
  → 试子路径：/text/user/admin/login
```

```
Google 反查同一批域下被收录的子路径：
site:imo.iqiyi.com
```

带 `site:` 的**域名本身是壳，收录到的路径才是真面**：从索引里拿 path 再回站上打。看到空白/默认页先当根目录逛，不是换资产。

### 20.2 网盘信息泄露（**只作线索来源**）

| 站点 | 说明 |
|---|---|
| `https://www.yunpz.net/wangpan.html` | 网盘资源聚合检索 |
| `http://www.zhuzhupan2.com/` | 同类聚合 |
| lingfengyun.com | **已永久关闭**，别再当入口 |

定位：网盘聚合站能**快速查到某个文件名的存在与标题**（内部文档、配置片段、备份名、系统标识），可作**命名规律与系统存在性**的线索来源。

红线：**不得从网盘下载他人 PII / 内部资料**，不得把网盘内容当授权测试对象。只把命中的**文件名/标题**当线索回灌本种子命名猜测。要真测先走授权。

---

## 21. 本节故意不收录

| 不写 | 原因 |
|---|---|
| 批量注册 / 批量爆破 / 批量提交 / 批量扫全网 | 仓库禁止批量，红线 |
| 购买学号 / 身份证；网盘下载他人 PII | 非法获取 PII，红线 |
| 免杀 / webshell / C2 / 脱库 / `--os-shell` / UDF 提权 | 用户明确不要，且违背本库定位 |
| CORS 相关任何放松 | 红线 3，不放宽 |
| 登出 / 会话失效测试 | 红线 2 |
