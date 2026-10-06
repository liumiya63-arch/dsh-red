# 微信小程序 / 企微应用测试手册

> 学自 [dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model) pentest 客户端作战线 + 本仓库实战。**不装那个插件。** 解包走密探 `wechat`；用户手动解包目录仍是 `E:\Function-soft-all\mitan\decompile\<appid>`。流量走 Yakit MITM。破坏性写口（绑房、支付、开断电）默认不打，用户明说才打。
>
> 写不写只认 `vuln-report-format.md`。进站仍过 `dig-scope` §4：先说清 AppID / 网关 / 登录态，再对象图换 id。

## 一、先分清三张票

小程序现场最容易把票混了，混了就会报假点。

| 名字 | 长什么样 | 谁发 | 能干什么 | 不算洞 |
|---|---|---|---|---|
| 客户端 `appid` | `wx` + 16 位 | 写死在 `app-service` / `project.config` | 公开标识 | 前端本来就有 |
| `wx.login` / 手机号 `code` | `0c` / `0a` 开头短串，约 5 分钟失效 | 微信客户端 | 交给**业务后端**换 openid / 解手机号 | 本机 MITM 抓到自己的 code |
| `encryptedData` + `iv` | Base64 密文 | `getPhoneNumber` / `getUserInfo` | 要微信 `session_key` 才能解 | 本机授权流量里出现 |
| 业务 `ACCESS_TOKEN` / `accessToken` | 网关头，常 32 hex | 业务 `getOpenid/{code}` 一类 | 调业务 API | 自己的会话票 |
| 微信官方 `access_token` | `cgi-bin/token` 那种 | 服务端用 **AppSecret** 换 | 调微信开放接口、解别人密文 | — |
| `AppSecret` / `session_key` | 32+ 随机 | 微信后台 / `jscode2session` | 真正的密钥 | — |

**没有 AppSecret / session_key / cgi-bin token，前端写死 appid + 自己的 code/encryptedData 不算密钥泄露。**

对照：

1. 解包 grep `AppSecret` / `secret` / `session_key` / `cgi-bin`。Vue `__secret_vfa_state__` 一类框架字段丢掉。
2. Yakit 搜 `api.weixin.qq.com`、`jscode2session`、`cgi-bin/token`。业务网关不算。
3. GitHub / FOFA 搜这个 AppID。出 AppSecret 才报。
4. `getPhoneNumber?code=&encryptedData=&iv=` 是本机授权，不是别人的密钥。

## 一点五、强开 F12 与反编译工具

**强开调试。** 微信 / 企业微信里 `Ctrl+Shift+Alt+D` 强制打开调试面板，看本地存储、改前端逻辑、直接读 `app-service` 变量。**有签名校验就别硬刚**——静态参数签名、请求体签名一旦动了就 400，改前端也只是自己机子上骗自己，对服务端没用。一句话：**有签名就跑**，换看包/打接口那条线。

**反编译工具（顺序：先 fine 二开，再补扫）：**

| 工具 | 地址 | 用途 |
|---|---|---|
| Mfinder | `https://github.com/wuchulonly/Mfinder` | fine 二开，反编译 + 找 appid / 接口线索 |
| onyx | 同生态 | fine 二开的另一选项，Mfinder 跑不通时换它 |
| MPScan | `https://github.com/i-am-xjizhi/MPScan/releases/tag/MPScan_v2.0` | v2.0 扫描器，批量过小程序资产 |

关键词就一个：**`applet`**。搜包、搜目录、搜工具输出统一用它，别换同义词。

**影子小程序 appid 跳转。** `edu.cn` 系小程序反编译拿到 appid 后，appid 可跨端跳：微信跳微信、微信跳支付宝。拿到 appid 先试另一端能不能直接拉起同一个小程序，能跳就是一条新的资产线（同一后端、另一套前端壳）。跳过去仍按三张票对照，不要因为换了端就把公开 appid 当泄露。

**小程序 cookie 与管理端通用（考试型 / 商城类最常见）。** 在小程序里正常注册登录，把拿到的个人 cookie 放进后台站点的凭证位置，或者抓包直接把 Cookie 头替换成小程序那份，可能直接进管理后台，也可能能拿这张票调后台接口。这属于越权/认证面，走只读差分：先无票对照，再有票读自己的数据，最后才换对象；**不要动别人的订单、角色、密码**。算成看的是「后台接口真的回了管理数据 / 真的进了后台页」，不是「cookie 名字一样」。

**小程序登录态转到网页端渗透。** 小程序登录后拿到的票，先去网页端试：能拼接出路径就直接拼（同一后端换 `Host` / 前缀），拼不出就扫目录找后台入口。这条路常常比在小程序里死磕更快，因为网页端少一层签名。

**有的手机端小程序电脑上找不到** → 用模拟器（装微信 / 企业微信，在模拟器里打开目标小程序再走 MITM；证书装模拟器系统区）。PC 端搜不到不等于不存在，只说明这个入口是移动端专属。

这一节产出的是**入口**，不是洞。强开 F12 本身、装模拟器本身都不报。

## 二、进站顺序

1. **说清这摊。** AppID、小程序名、生产网关、有没有登录态。密探默认项目 `edusrc`（`project_id=3`）直到用户改。
2. **解包。** `mcp__mitan__wechat` unpack / extract；或读已有 `decompile\<appid>\<version>\source\`。先 `app.json` 页面清单，再 `app-service.compiled.js` 环境块：`serverUrl` / `appid` / 支付终端号 / 内网 IP。
3. **抽钥匙。** path + 头名（`ACCESS_TOKEN` / `token` / `openid`）+ 对象 id。回包进清单。JSFinder 误报 uni_modules 组件路径丢掉。
4. **MITM。** 自己走一遍登录 / 列表 / 详情。Yakit 按 host 滤。登录 code 过期快，复现用业务票，不要死磕旧 js_code。
5. **有号：对象图 / 换 id。** 列表回的 `houseId` / `orderId` / `userId` / 区域树 id 换邻号。query 里的 `openid` 常被服务端丢掉、只认头——那不是洞，记假点。
6. **没号：未登录差分。** 去 token、去票据。401「mobile token required」和 PMS「票据和token都不存在」是对照，不是洞。

## 三、解包打什么

认：`app.json` 有房间绑定 / 缴费 / 管理 / 授权页；环境块有多套 `serverUrl`（生产 / 备用 / 内网）。

打：

1. 生产网关 + 备用网关都记。内网 `192.168.x` 只当线索，别拿本机去打别人内网。
2. 登录链：`wx.login` → `GET /mobile/api/getOpenid/{code}` → 回 `accessToken` / `openid` / `userId`。
3. 手机号链：`getPhoneNumber` 把 `code, encryptedData, iv, userId` 交给后端。后端解完回明文手机。前端不解。
4. 页面里的管理 / 绑房 / 开断电 path 进清单，**先读后写**。用户没授权破坏性检测时停在读。

算成：解包出 AppSecret / 云 AKSK / 数据库账密；或内网地址 + 未授权管理口真通。

假点：只有公开 appid；只有支付 `terminalCode`；只有订阅消息模板 ID；crypto 分类空。

## 四、水平越权（小程序最肥）

认：业务票绑的是「当前用户」，详情 / 仪表 / 用量 / 管理员口却吃路径或 query 里的对象 id。区域树 `getRegionLevelOrHouse?id=` 不校验这个人有没有这个学校/楼栋。

打（只读）：

1. 无票对照 → 应 401 / 缺票。
2. 自己的对象一枪，记下 id 和回包关键字段（表号、余量、姓名）。
3. 从区域树往下钻：学校 → 楼栋 → 楼层 → 房间，抄邻房 id。邻号不要自己猜 hex。
4. 同一张票换邻房 id 打详情 / 用量 / 管理员。
5. 树口 `propertyCompanyId=` 没吃就换 `?id=`。缺 `suiteId` 报「请求失败」不是越权失败，把树里的配套参补上再打。

算成：邻房表号、余量、昨日用电、管理员姓名手机和自己的不一致。

假点：换 id 仍只回自己的；openid 改了回包不变（票绑死，query 被忽略）；无票也能读公开楼栋名但没有住户数据。

写越权（绑房 / 改绑 / 开断电 / 代付）：最小伤害，先加自己的再删自己加的。用户明说「不要破坏性」时整段跳过。

## 五、认证绕过（小程序皮）

认：登录口吃 `openId` / `code` / `userId`；前端把 openid 当身份。

打：

1. 空 `openId` / 空 `code`（见 `authbypass-test.md`「空 openId 进已有号」）。
2. 别人的 openid 塞进 query，头仍是自己的票——通常忽略，记假点。
3. 把业务票拿到未登录的管理 path / 另一套网关（`gateway1` vs 生产）。
4. 改绑 / 解绑手机：过了立刻改回。

算成：空串进已有号出手机；或别人的 openid 真换成别人的票。

假点：openid 被忽略；code 过期 400；只出游客空号。

## 六、信息泄露怎么报

| 现场 | 报不报 |
|---|---|
| 前端 appid | 不报 |
| 本机 MITM 的 code / encryptedData / iv | 不报（自己的授权流量） |
| 业务 ACCESS_TOKEN | 当会话材料，不当微信密钥 |
| 解包 / 仓库 / 配置里的 AppSecret、session_key、cgi-bin token | 报，假值对照 |
| 越权读到邻房用电 / 管理员手机 | 报越权，不报「手机号泄露」单独条（同一条链） |
| 内网 IP + 端口 | 线索，通了未授权口再报 |

## 六点五、App 侧

小程序搜不到时，同一个业务通常还有 App。流程和小程序一致：**先提资产 → 再解包 → 再对象图**。

1. **收集渠道。** 应用商城、应用小蓝本类聚合站。同一业务在多个商城上架，版本号、包名、签名可能不一样，都记。
2. **版本迭代。** `https://www.wandoujia.com/` 可翻历史版本。**软件可能强制升级**，所以要主动去找旧版本——**老版本往往更好打**（旧接口未下线、旧逻辑没修、旧版本没加壳/没加固），新版本逼你升级不代表旧接口没了。
3. **APK 提资产。** AppInfoScanner：`python app.py android -i base.apk`。抽出的域名 / path / 密钥回到同一张清单，和 `miniprogram-test.md` 小程序那份合并去重，不要分两套证据写。
4. **提完照旧过三张票。** App 里的 appid / 包名 / 签名是公开信息，不算泄露；只有真 AppSecret / 云 AKSK / 数据库账密才算。

**边界：** 只对已授权 SRC 目标做。提资产是读操作；反编译出来的管理口先读后写，破坏性写口用户没明说就停。

## 七、工具边界

- 密探 `wechat`：unpack / extract / batch。不要改解包目录。
- Yakit：MITM + Fuzzer 分组复现。多步越权一个组、每步一 tab。
- 不要用 dsh-redteam-model 的 e0e1wx / WMPF debugger 插件；本仓库已有密探 + Yakit。
- nuclei 全量模板不当小程序进度。

## 八、检查清单

```
□ AppID / 网关 / 环境块三套 URL 说清
□ 解包 grep AppSecret / session_key / cgi-bin（框架 secret 字段丢掉）
□ 登录链：code → 业务票；手机号链：encryptedData 交给后端
□ 无票对照 vs 有票自己的对象
□ 区域树 / 列表抄邻 id，换 id 只读
□ query openid 是否被忽略（假点）
□ 写口（绑房/支付/开断电）用户没授权就停
□ 有请求签名就别改前端硬刚，转看包/打接口
□ 小程序 cookie 试过放进后台凭证（只读差分，不动别人数据）
□ 电脑找不到的小程序走模拟器
□ App 侧：商城 / 小蓝本 + 旧版本 + AppInfoScanner 提资产，并入同一张清单
□ 报告里不要贴活 token / 自己的手机号全文
```
