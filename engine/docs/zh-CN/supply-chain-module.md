# 供应链/股权穿透 模块 — 开发文档

> 版本: 2026-08-07 v2.0（双页面拆分） | 数据源: 项目事实图 + 资产库

## 1. 功能定位

两个顶级菜单页（信息收集配套展示）:
- **「股权穿透」** (`#supply-chain`): 子孙公司股权树 + 公司详情/域名 + 融资/邮箱/ICP/finding/infra 事实区块
- **「供应链」** (`#supply-network`): 供应链公司网格 + 供应链数字化资产**按主域名集群可视化** + 供应链事实

设计原则: 公司/关系/事实 → 项目事实图（facts + fact-edges）; 域名/IP → 资产库。
页面不存数据, 只渲染——数据由 AI 信息收集按落库规范写入。

## 2. 数据模型（落库规范, AI 收集时必须遵守）

| 数据 | 存储 | fact_key 约定 | 说明 |
|---|---|---|---|
| 公司节点 | project_fact | `company/<cid>` | category=company, body=工商信息 JSON(**建议带 website/domains 字段, 股权穿透页显示域名**) |
| 持股关系 | fact_edge | source=母公司, target=子公司 | edge_type=`contains`(合法: depends_on/leads_to/enables/exploits/discovered_on/contains/part_of/supports) |
| 融资记录 | project_fact | `financing/<root-cid>` | category=financing, body={"list":[{date,round,amount,investors}]} |
| 联系人邮箱 | project_fact | `contacts/<root-cid>` | category=contacts, body={"list":[{email,remark}]} |
| ICP 备案 | project_fact | `icp/<域名>` | category=icp, body={"icp","subject"} |
| 供应链结论 | project_fact | `supplychain/<name>` | category=supplychain/target, body=结论文本 |
| 基础设施 | project_fact | `infra/<name>` | category=infra, body=资产详情(对象数组如 resolved=[{domain,ips}]) |
| 域名/IP | 资产库 assets | — | source=xiaolanben/dns/websearch/fofa/icp/infogather; 备案号存 tags `icp:<号>` |

**约束**:
- `fact_key` 只允许 `[A-Za-z0-9._/-]` 且字母数字开头（**冒号 : 非法 → 400**）
- 落库前会话必须绑定项目（`PUT /api/conversations/{id}/project`），否则项目黑板工具 403
- **禁止引用未创建的 fact_key 建边**（graph 生成 category="missing" 占位节点污染页面）
- body 建议纯 JSON; 若用 upsert_project_fact, 平台自动追加"## 关联"尾部文本 → 前端需兼容
- 根公司识别: 无入边(contains)的 company 节点自动作为根

## 3. 相关 API

```
GET  /api/projects/:id/fact-graph?view=tree   # 图数据(节点+边), 前端主数据源
     # ⚠️ 节点不含 body 字段 → 需另拉 facts 合并详情
GET  /api/projects/:id/facts                  # 全部事实(含 body)
POST /api/projects/:id/facts                  # 建事实 {fact_key,category,summary,body,confidence}
POST /api/projects/:id/fact-edges             # 建边 {source_fact_key,target_fact_key,edge_type,confidence}
DELETE /api/projects/:id/fact-edges/:edgeId   # 删边(清坏边)
GET  /api/assets?project_id=&source=&page_size=  # 资产列表(source 单值, 不支持逗号多值!)
POST /api/assets/import                       # 批量导入 {assets:[],source}
PUT  /api/assets/:id                           # 更新(⚠️ 绑定整个 Asset, 只传 tags 会 400"资产目标不能为空")
```

## 4. 前端实现

| 文件 | 说明 |
|---|---|
| `web/templates/index.html` | 菜单 nav-item ×2 + page div ×2 + script 引用(版本号) |
| `web/static/js/supply-chain.js` | 股权穿透页: graph+facts 合并→构建树→公司卡片(详情+域名)→事实区块→资产 |
| `web/static/js/supply-network.js` | 供应链页: 供应链公司识别→资产按主域名集群分组→事实 |
| `web/static/js/router.js` | 页面注册(见下) |

**router.js 页面注册(每页三处, 漏一不可)**:
1. `initRouter()` ~L84 白名单数组加 `'supply-chain'` / `'supply-network'`
2. `hashchange` 监听 ~L588 白名单数组加 `'supply-chain'` / `'supply-network'`
3. `initPage()` switch-case 加 `case 'supply-chain': supplyChainInit(); break;` 等

**股权穿透页数据流**: supplyChainInit → loadProjects → loadGraph(pid): ①GET fact-graph ②GET facts →
factBodies[fact_key]=body → buildTree(contains 边) → findRoots → renderTree(卡片+详情+域名chips)
+ renderFactBlocks(按 category 分组渲染) + renderAssets(全来源资产, icp tag 标记)

**供应链页可视化编排**:
- 供应链公司 = company facts 名称含 供应链/供应/物流 → 卡片网格(持股/法人/城市)
- 资产集群: 按 registrableDomain(去 www/子域, .com.cn 等两级后缀)分组 → 每个主域名一个折叠卡片,
  子域按业务标签分组(HWWT_TAGS 映射: vysccp=供应商协同门户/esp=需求预测/esign=电子签等),
  未知子域归"其他功能"; 子域带 IP
- 供应链事实: supplychain/ 前缀 + category=infra 的节点

**parseBody 防御**(两个页面): body 可能 ①纯 JSON ②JSON+"## 关联"尾部文本(upsert_project_fact 自动追加)
③markdown 纯文本(hwwt2-supplychain) → 依次尝试 JSON.parse → 正则提取 {...} → 返回 {}

**渲染防御**(对象数组): contacts list=[{email,remark}] / infra resolved=[{domain,ips}] 等 → 按 typeof
分支: 对象取 email/domain/url/name 字段, 数组递归, 纯字符串直接 esc — 严禁直接 esc(对象)([object Object])

**CSS**: 页面内动态注入(injectStyle), 不改 style.css。

## 5. 版本与缓存

- JS 引用带 `?v=` 版本号; **改 JS 必须 bump 版本号**(浏览器缓存旧资源, reload 绕不过)
- 改 index.html(模板) → LoadHTMLGlob 启动时加载 → **必须重启服务**
- 验证导航: `/?nc=<时间戳>#<page>` 强制新文档(裸 #hash 会用缓存 HTML)
- 重启后自动登录: POST /api/auth/login → 组装 {token,expiresAt,user,roles,permissions,scope}
  写入 localStorage['cyberstrike-auth'] → 刷新即登录(见 desredteam-dev skill #25)

## 6. 验证清单

- [ ] 菜单「股权穿透」「供应链」可见, 点击切页, hash 不跳走
- [ ] `document.querySelectorAll('.page')` 父级全是 content-area(div 嵌套正确)
- [ ] 股权穿透: 统计卡/公司树/详情(法人/信用代码/持股)/域名chips/融资/邮箱(带备注)/ICP/事实区块
- [ ] 供应链: 供应链公司网格(持股/法人) + 主域名集群(业务分组/子域IP) + 供应链事实
- [ ] 无 [object Object] 显示(对象数组渲染防御)

## 7. 踩坑记录

1. fact-graph 节点无 body → 前端必须另拉 facts 合并(否则所有详情空白)
2. router.js 两处白名单 + initPage case, 漏任意一处: hash 被 fallback 跳走/切换不渲染
3. JS 缓存: 改 JS 忘 bump 版本号 = 白改; 模板改动忘重启 = 白改
4. assets Update 只传 tags → 400 "资产目标不能为空"(需带 domain/host/ip)
5. fact_key 冒号 → 400 格式无效
6. source 参数单值: `source=xiaolanben,dns` 匹配不到, 需分开查
7. AI 建坏边(引用不存在 fact_key) → graph missing 占位节点 → DELETE 坏边
8. upsert_project_fact 在 body 尾部追加"## 关联"文本 → JSON.parse 失败 → 正则提取兼容
9. body 对象数组 → esc 直接 [object Object] → typeof 分支防御渲染

## 8. 后续扩展方向

- 二级孙公司穿透(AI 递归收集, xiaolanben-equity skill Phase 5)
- 备案号批量补全(icp-scan 工具/浏览器收集)
- 供应链证书反查(supply-chain-collect, 需 FOFA key)
- 供应链→资产库双向跳转
- 资产集群关系图(可视化连线)
