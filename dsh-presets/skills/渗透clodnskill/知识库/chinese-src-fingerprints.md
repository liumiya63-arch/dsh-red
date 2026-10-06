# 国内 SRC 指纹（见了再打）

> 学自 [dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model) `modes/pentest/refs/zh/chinese-srcfingerprints.md` / `default-credentials-cn.md` 的**形态索引**。不抄他们的默认口令表、不抄 10 万行 WAF payload。本仓库测绘仍认 `dig-scope` 一种子闭环；认到短表形态只打当前站。
>
> 见了才开对应模块。不要开场按本表全网 FOFA。

## 一、国产 OA / 中间件皮

| 认什么 | 先打 | 假点 |
|---|---|---|
| 泛微 ecology / `weaver` | 未授权文件 / 未授权接口；上传走 `file-upload-test.md` | 只登录页；补丁后 path 404 |
| 致远 `seeyon` / `A8` | 未授权、文件、session | 只静态资源 |
| 用友 NC / U8 / YonSuite | 未授权、反序列化线索走 `deserialization-test.md` | 只门户新闻 |
| 金蝶云 / eas | 未授权报表 / 文件 | 登录墙死 |
| 通达 OA `tongda` | 未授权 + 文件 | 版本已修且当前站打不死 |
| 蓝凌 Landray | 未授权、SSRF 预览 | 预览白名单 |
| 若依 `ruoyi` / `RuoYi` | 默认口只一眼；验证码绕过走 `authbypass-test.md`；越权走 `idor-test.md` | 改了默认口还报弱口令 |
| 若依监控 `Druid` `/druid` | 未授权控制台 | 要登录 |
| 企业微信 / 钉钉自建应用 | 回调 URL、suite_ticket、扫码登录 CSRF 走 `csrf-test.md` §18 | 只是文档站 |
| 微信小程序 AppID `wx` | `miniprogram-test.md` | 只有宣传 H5 |

中间件端口（Redis/rsync/FPM/AJP/YARN/2375/h2）仍见 `info-leak-test.md` §五，本表不重复。

对上公开 CVE 号：查 `poc-in-github.md`（只取那一条 JSON，不 clone 索引库）。版本对不上就停。

## 二、国内云 / 网关皮

| 认什么 | 先打 |
|---|---|
| 阿里云 / 腾讯云 / 华为云 IMDS | `ssrf-test.md` 路径差（元数据目录不同） |
| APISIX / Kong / 阿里云 API 网关 | `api-gateway-test.md` 路径规范化 |
| 微信 / 支付宝 JSAPI 支付 | `logic-test.md` 金额；不要真扣款 |
| 七牛 / 阿里 OSS / 腾讯 COS 带签 | `file-upload-test.md` STS / Host / Content-Type |
| 微信 `access_token` 与业务票混用 | `miniprogram-test.md` 三张票 |

## 三、怎么用 FOFA（备忘）

只搜**当前种子**。例：

```
body="RuoYi" && domain="当前种子"
app="用友-NC" && domain="当前种子"
icon_hash="当前站 favicon"
title="登录" && host="当前种子子域"
```

禁止拿 Morph / 通用 OA 指纹去全网扫当进度。股权闸、去废、去非存活仍认 `dig-scope`。

## 四、默认口

公网控制台一眼：`admin/admin`、`admin/123456`、设备铭牌。过了立刻停在「能进」，不要改配置。完整弱口令字典本仓库不存；密探弱口令模块先让用户选服务和端口，不要代选。
