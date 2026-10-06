package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"desredteam/internal/mcp"
)

// GSL5ProxyHandler 把 GSL5 外部 MCP 工具以 REST 形式暴露给前端控制台。
// 复用 ExternalMCPManager.CallTool(工具名 gsl5::xxx), 不重复实现 MCP 客户端。
type GSL5ProxyHandler struct {
	manager *mcp.ExternalMCPManager
	logger  *zap.Logger
}

func NewGSL5ProxyHandler(manager *mcp.ExternalMCPManager, logger *zap.Logger) *GSL5ProxyHandler {
	return &GSL5ProxyHandler{manager: manager, logger: logger}
}

// gsl5ToolName 把前端传入的短工具名转成 manager 需要的 "gsl5::name" 格式
func gsl5ToolName(tool string) string {
	tool = strings.TrimSpace(tool)
	if strings.Contains(tool, "::") {
		return tool
	}
	return "gsl5::" + tool
}

// Status GET /api/gsl5/status — GSL5 MCP 连接状态 + 工具数
func (h *GSL5ProxyHandler) Status(c *gin.Context) {
	status := "disconnected"
	client, exists := h.manager.GetClient("gsl5")
	if exists && client != nil {
		if client.IsConnected() {
			status = "connected"
		} else {
			status = client.GetStatus()
		}
	}
	toolCount, _ := h.manager.GetToolCount("gsl5")
	c.JSON(http.StatusOK, gin.H{
		"name":       "gsl5",
		"status":     status,
		"tool_count": toolCount,
		"error":      h.manager.GetError("gsl5"),
	})
}

// Call POST /api/gsl5/tools — 调用 GSL5 工具 {tool, args}
func (h *GSL5ProxyHandler) Call(c *gin.Context) {
	var req struct {
		Tool string                 `json:"tool"`
		Args map[string]interface{} `json:"args"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求: " + err.Error()})
		return
	}
	if strings.TrimSpace(req.Tool) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tool 不能为空"})
		return
	}
	if req.Args == nil {
		req.Args = map[string]interface{}{}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	result, _, err := h.manager.CallTool(ctx, gsl5ToolName(req.Tool), req.Args)
	if err != nil {
		h.logger.Warn("gsl5 tool call failed", zap.String("tool", req.Tool), zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	// 提取文本内容
	text := ""
	if result != nil {
		for _, ct := range result.Content {
			if ct.Type == "text" {
				text += ct.Text
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"tool":     req.Tool,
		"content":  text,
		"is_error": result != nil && result.IsError,
	})
}

// Shells GET /api/gsl5/shells — 快捷列出所有 WebShell
func (h *GSL5ProxyHandler) Shells(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	result, _, err := h.manager.CallTool(ctx, gsl5ToolName("shell_list"), map[string]interface{}{})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	text := ""
	if result != nil {
		for _, ct := range result.Content {
			if ct.Type == "text" {
				text += ct.Text
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"content": text})
}
