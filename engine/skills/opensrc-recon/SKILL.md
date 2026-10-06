---
name: opensrc-recon
description: 开源版资产探测与网络请求铁律。AI 做资产发现用 a_scan.py; 所有 curl/网络请求默认 60 秒超时, 大任务异步执行。
---

# opensrc-recon — 资产探测与请求铁律(开源版)

## 资产探测(替代 Des_workflow A 线)
平台已移除 Des_workflow A/B 线, 资产发现使用内置精简工具:

### a_scan.py(一键 A 线精简版)
位置: `tools/opensrc/a_scan.py`(依赖同目录 fscan 二进制)

```
python tools/opensrc/a_scan.py --target <IP/域名/CIDR>
python tools/opensrc/a_scan.py --target <目标> --ports "80,443,8080"
python tools/opensrc/a_scan.py --target <目标> --spray-only   # 只做路由探测
```

三阶段:
1. 端口扫描: fscan 默认常用端口(1000 常用子集), 不爆破不扫 ping
2. Web 识别: 对 http 服务取 status/title/长度 + 指纹(nginx/tomcat/spring/shiro 等)
3. 路由探测: 常见路由字典(~50 路径: /admin /api /swagger /actuator /druid 等)

输出: 资产清单写 `a_scan_result_<目标>.txt`, 包含端口/服务/URL/指纹/路由。

### 规则
- 拿到目标先跑 a_scan 探资产, 再决定渗透路径
- 发现 200/301 的敏感路由(swagger/actuator/druid/api-docs)优先深入
- 发现 403 的路由尝试 401/403 bypass(路径变异/方法篡改/头注入)

## 网络请求铁律(所有 AI 发起的网络请求)
1. **默认 60 秒超时**: 所有 curl 必须带 `-m 60`(或更小); 禁止无超时同步请求
2. **异步优先**: 超过 60s 的任务(大范围扫描/批量请求)用 exec 后台执行,
   拿 execution_id 后 wait_tool_execution 轮询, 不阻塞对话
3. **浏览器首选做渗透验证**: 需要登录态/JS 渲染/交互验证时用 chrome-devtools
   (navigate/fill/click/take_snapshot); 纯信息获取(头/状态/接口探测)用 curl 更高效
4. curl 标配: `curl -s -m 60 -k -H "User-Agent: Mozilla/5.0 ..."`
5. 禁止: 无超时请求、同步等待长任务、重复轮询高频请求

## 与浏览器 MCP 的分工
- 资产发现/接口枚举/指纹: a_scan.py + curl(快)
- 登录/交互/JS 页面验证: chrome-devtools(准)
- 二者结合: a_scan 找入口 → 浏览器验证利用 → 落库
