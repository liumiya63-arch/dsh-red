# gRPC / SSE 测试手册

> 学自 [dsh-redteam-model](https://github.com/SeaOf0/dsh-redteam-model) `modes/pentest/refs/api/grpc-security.md` 与 `sse-security.md`。本仓库知识库原先只有 WebSocket / HTTP 网关，缺这两面。不装插件。写不写只认 `vuln-report-format.md`。

## 一、什么时候开

| 认什么 | 开本篇 |
|---|---|
| 响应 `Content-Type: application/grpc` / `application/grpc+proto`；或 JS 里 `@grpc` / `grpc-web` | gRPC |
| 端口常见 50051 / 9090，或网关 path `/grpc.reflection` `/twirp` | gRPC |
| `text/event-stream`；前端 `EventSource` / `fetch` + `ReadableStream` | SSE |
| 对话口 / 通知 / 任务进度长连接，不是 WebSocket | SSE（WS 仍走 `websocket-test.md`） |

没这些指纹不要为了本篇去扫端口。

## 二、gRPC

### 2.1 反射

服务开了 server reflection，方法清单等于一份 Swagger。

```
grpcurl -plaintext host:50051 list
grpcurl -plaintext host:50051 describe pkg.UserService
grpcurl -plaintext host:50051 pkg.UserService/GetUser
```

TLS 去掉 `-plaintext`，加 `-insecure` 只为连上；证书钉死再换对的 CA。grpc-web 走 HTTP/1.1 网关时，Yakit 里看 `grpc-status` / base64 proto body，不要当 JSON 乱改。

算成：未授权列出业务方法，或普通票调到 `Admin` / `Delete` / `GetUser` 换邻 id 出别人数据。

假点：反射 401 且业务方法也 401；只能 `grpc.health.v1.Health`；方法存在但对象仍绑死自己。

### 2.2 鉴权缺口

gRPC metadata 才是头。常见：

- HTTP 网关验了 Bearer，grpc 端口没验
- `:authorization` / `authorization` / 自定义 `token` 只挡了部分方法
- 反射开着、业务方法以为「内网才到」

打：无票 list；有普通票调看起来像管理的方法；把 HTTP 上已证伪的对象 id 用同一张票打 grpc 同名方法。

### 2.3 对象级

protobuf 字段号乱猜不如：反射 describe → 填邻 `user_id` / `house_id`。回包用 `grpcurl -d '{"id":"..."}'`。差分仍是业务数据，不是 `OK`。

不要把 YSO / 反序列化 gadget 往 grpc 上套，除非现场明确是 Java 序列化字段。

## 三、SSE

### 3.1 鉴权在哪

`EventSource` **不能自定义头**。所以很多实现把票放 query：`/events?token=` / `?access_token=`。这张票等于进 URL、进日志、进 Referer。

打：

1. 无票 / 假票对照。
2. 把 query token 换到别人的流 id（`channel` / `taskId` / `userId`）。
3. 能用 `fetch` + `Authorization` 的实现，再试去头只留 query、或去 query 只留头——看哪一层真验。
4. Last-Event-ID 回放：改成更早的 id，看会不会把别人的事件吐出来。

算成：未授权订到别人的通知流；或 query 票能当会话调业务 API。

假点：流只推广播公告；token 过期立刻断；Last-Event-ID 忽略。

### 3.2 注入 / 跨用户

SSE 字段是 `data:` 行。如果事件内容把用户输入原样推给别人，按 XSS 收（收件端是浏览器时）。服务端推 URL 再去拉，按 SSRF 收。本篇不另写一套 payload。

## 四、和网关篇的关系

路径规范化、host 切换、grpc-web 前缀（`/pkg.Service/Method`）走 `api-gateway-test.md`。本篇只补：反射、metadata 鉴权、SSE query 票、事件流换 id。
