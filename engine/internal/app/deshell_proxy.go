package app

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"desredteam/internal/security"
)

// DesShell C2 反向代理配置
// DesShell 启动: desshell-server-standalone-new.exe -p 8095 -ap 8084 -t des-redteam-2026
// 开源版说明: 源码不含 DesShell C2 实现(官方 exe 免费发放, 不随源码发布);
// 桥接默认关闭, config 的 des_shell.enabled=true + 配置地址/令牌后启用。
const (
	deshellDefaultUpstream = "http://127.0.0.1:8095" // DesShell Web 面板默认地址
	deshellDefaultToken    = "des-redteam-2026"      // 默认 token (与 -t 参数一致)
	deshellPatchPrefix     = "DS-"                   // 补丁密钥前缀, 官方发放格式 DS-xxxxxxxx-xxxxxxxx
)

// deshellUpstream / deshellToken 从 config 读取(兼容默认值)
func (a *App) deshellUpstream() string {
	if u := strings.TrimSpace(a.config.DesShell.URL); u != "" {
		return u
	}
	return deshellDefaultUpstream
}

func (a *App) deshellToken() string {
	if t := strings.TrimSpace(a.config.DesShell.Token); t != "" {
		return t
	}
	return deshellDefaultToken
}

// desShellEnabled DesShell C2 桥接是否启用:
// DesShell C2 为独立产品(官方编译 exe, 免费用, 不随源码发布),
// 平台源码仅做桥接集成; config 的 des_shell.enabled=true + 配置地址即启用。
func (a *App) desShellEnabled() bool {
	return a.config.DesShell.Enabled
}

// registerDeshellProxy 注册 /deshell/* 反向代理，把 DesShell C2 面板挂载到平台同源路径下。
// 认证: 代理向每个请求注入 ?token=<deshellToken>，DesShell SPA 读 URL token 自动登录（免二次登录）。
// 路径: /deshell/xxx -> http://127.0.0.1:8095/xxx；HTML 内静态资源绝对路径重写为 /deshell/ 前缀。
func (a *App) registerDeshellProxy(router *gin.Engine) {
	if !a.desShellEnabled() {
		// 开源版未激活: 留补丁空间, /deshell/* 返回引导提示
		router.Any("/deshell/*path", func(c *gin.Context) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "DesShell C2 未启用",
				"hint":  "配置 config.yaml 的 des_shell.enabled=true 并填写服务地址后重启启用(官方 exe 免费发放)",
			})
		})
		return
	}
	upstream := a.deshellUpstream()
	token := a.deshellToken()
	target, _ := url.Parse(upstream)
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.Host = target.Host
			// /deshell/xxx -> /xxx；/assets、/logo.png、/favicon.ico 原样转发
			//（DesShell SPA 运行时动态 import 的 chunk 用绝对路径 /assets/*，需同源可达）
			p := req.URL.Path
			if strings.HasPrefix(p, "/deshell") {
				p = strings.TrimPrefix(p, "/deshell")
				if p == "" {
					p = "/"
				}
			}
			req.URL.Path = p
			req.URL.RawPath = ""
			// 注入 token (Header 优先，但 SPA 的 API 调用可能不带 header，query 兜底)
			q := req.URL.Query()
			q.Set("token", token)
			req.URL.RawQuery = q.Encode()
		},
		ModifyResponse: func(resp *http.Response) error {
			// 仅重写 HTML：静态资源绝对路径加 /deshell 前缀（SPA 同源加载）
			if strings.Contains(resp.Header.Get("Content-Type"), "text/html") {
				body, err := io.ReadAll(resp.Body)
				if err != nil {
					return err
				}
				s := string(body)
				s = strings.ReplaceAll(s, `"/assets/`, `"/deshell/assets/`)
				s = strings.ReplaceAll(s, `"/app.config.js`, `"/deshell/app.config.js`)
				s = strings.ReplaceAll(s, `"/favicon.ico`, `"/deshell/favicon.ico`)
				s = strings.ReplaceAll(s, `"/logo.png`, `"/deshell/logo.png`)
				s = strings.ReplaceAll(s, `"/deshell/deshell/`, `"/deshell/`)
				resp.Body = io.NopCloser(bytes.NewReader([]byte(s)))
				resp.Header.Set("Content-Length", strconv.Itoa(len(s)))
			}
			return nil
		},
	}

	proxyHandler := func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	}
	router.Any("/deshell/*path", proxyHandler)
	router.GET("/deshell", func(c *gin.Context) {
		c.Redirect(http.StatusFound, "/deshell/")
	})
	// DesShell SPA 动态资源（Vite chunk 绝对路径 /assets/*）与根路径图标
	router.Any("/assets/*path", proxyHandler)
	router.GET("/logo.png", proxyHandler)
	router.GET("/favicon.ico", proxyHandler)
}

// DesShellStats 桥接统计响应
type DeshellStats struct {
	Reachable        bool   `json:"reachable"`
	Activated        bool   `json:"activated,omitempty"`   // 补丁激活状态(开源版 false)
	ListenersRunning int    `json:"listeners_running"`
	ListenersTotal   int    `json:"listeners_total"`
	ClientsOnline    int    `json:"clients_online"`
	ClientsTotal     int    `json:"clients_total"`
	ListenerDesc     string `json:"listener_desc,omitempty"` // 如 "0.0.0.0:8084 (tcp) + 0.0.0.0:8084 (ws)"
}

// registerDeshellStats 注册 /api/deshell/stats：转发 DesShell 的监听器/客户端数据，
// 让平台 dashboard 的 C2 卡片显示 DesShell 真实状态（而非平台内置 C2 的数据）。
func (a *App) registerDeshellStats(protected *gin.RouterGroup) {
	protected.GET("/c2/deshell-stats", security.RequirePermission("c2:read"), func(c *gin.Context) {
		if !a.desShellEnabled() {
			// 开源版未激活: 返回未激活状态(前端显示补丁引导)
			c.JSON(http.StatusOK, gin.H{"stats": DeshellStats{
				Reachable:    false,
				Activated:    false,
				ListenerDesc: "DesShell C2 未启用: 配置 des_shell.enabled=true 后重启",
			}})
			return
		}
		stats := a.fetchDeshellStats()
		c.JSON(http.StatusOK, gin.H{"stats": stats})
	})
}

// fetchDeshellStats 调用 DesShell API 聚合统计（短超时，DesShell 不可达时返回 reachable=false）
func (a *App) fetchDeshellStats() DeshellStats {
	stats := DeshellStats{Reachable: false, Activated: true}
	upstream := a.deshellUpstream()
	token := a.deshellToken()
	client := &http.Client{Timeout: 2 * time.Second}

	// 1. 监听器
	var listeners []map[string]interface{}
	reqL, err := http.NewRequest("POST", upstream+"/api/listener/list", bytes.NewBufferString(`{"page":1,"pageSize":50}`))
	if err == nil {
		reqL.Header.Set("Content-Type", "application/json")
		reqL.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(reqL)
		if err == nil {
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			var lr struct {
				Result struct {
					Items []map[string]interface{} `json:"items"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &lr) == nil {
				listeners = lr.Result.Items
			}
		}
	}

	// 2. 客户端
	var clients []map[string]interface{}
	reqC, err := http.NewRequest("POST", upstream+"/api/client/list", bytes.NewBufferString(`{"page":1,"pageSize":50}`))
	if err == nil {
		reqC.Header.Set("Content-Type", "application/json")
		reqC.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(reqC)
		if err == nil {
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			var cr struct {
				Result struct {
					Items []map[string]interface{} `json:"items"`
				} `json:"result"`
			}
			if json.Unmarshal(body, &cr) == nil {
				clients = cr.Result.Items
			}
		}
	}

	stats.Reachable = listeners != nil || clients != nil
	stats.ListenersTotal = len(listeners)
	stats.ClientsTotal = len(clients)
	for _, l := range listeners {
		if st, ok := l["Status"].(bool); ok && st {
			stats.ListenersRunning++
		}
		if addr, ok := l["ListenAddr"].(string); ok && addr != "" {
			if mode, ok2 := l["Mode"].(string); ok2 {
				if stats.ListenerDesc != "" {
					stats.ListenerDesc += " + "
				}
				stats.ListenerDesc += addr + " (" + mode + ")"
			}
		}
	}
	for _, cl := range clients {
		if on, ok := cl["IsConnect"].(bool); ok && on {
			stats.ClientsOnline++
		}
	}
	return stats
}
