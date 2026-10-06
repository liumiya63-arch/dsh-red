package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"desredteam/internal/config"
	"desredteam/internal/openai"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// LLMProxyHandler OpenAI 兼容代理: 把 /v1/chat/completions 请求转发到
// Hermes 网关 (hermes-engine 通道 / localhost:8642/v1), 流式回传 SSE。
// 让前端 (DSH iframe 等) 通过 DRT 同源代理调用 Hermes, 规避浏览器 CORS。
type LLMProxyHandler struct {
	client *openai.Client
	logger *zap.Logger
}

// NewLLMProxyHandler 构造代理 handler。
// openAICfg 应为 hermes-engine 通道的 OpenAIConfig (base_url=localhost:8642/v1)。
func NewLLMProxyHandler(openAICfg *config.OpenAIConfig, logger *zap.Logger) *LLMProxyHandler {
	httpClient := &http.Client{Timeout: 300 * time.Second}
	client := openai.NewClient(openAICfg, httpClient, logger)
	return &LLMProxyHandler{client: client, logger: logger}
}

// OpenAICompatibleChatRequest 标准 OpenAI chat/completions 请求体 (子集)。
type OpenAICompatibleChatRequest struct {
	Model       string            `json:"model"`
	Messages    []LLMProxyMessage `json:"messages"`
	Stream      bool              `json:"stream"`
	MaxTokens   *int              `json:"max_tokens"`
	Temperature *float64          `json:"temperature"`
	TopP        *float64          `json:"top_p"`
}

// LLMProxyMessage 消息体。
type LLMProxyMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatCompletions POST /api/llm/v1/chat/completions
func (h *LLMProxyHandler) ChatCompletions(c *gin.Context) {
	var req OpenAICompatibleChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages required"})
		return
	}

	model := req.Model
	if model == "" {
		model = "hermes-agent"
	}

	// 构造转发给 Hermes 的 payload (OpenAI 兼容, 直接透传)
	payload := map[string]interface{}{
		"model":    model,
		"messages": req.Messages,
	}
	if req.Stream {
		payload["stream"] = true
	}
	if req.MaxTokens != nil {
		payload["max_tokens"] = *req.MaxTokens
	}
	if req.Temperature != nil {
		payload["temperature"] = *req.Temperature
	}
	if req.TopP != nil {
		payload["top_p"] = *req.TopP
	}

	h.logger.Info("LLM proxy → hermes",
		zap.String("model", model),
		zap.Int("messages", len(req.Messages)),
		zap.Bool("stream", req.Stream),
	)

	if !req.Stream {
		// 非流式: 直接返回 OpenAI 格式 JSON
		var out map[string]interface{}
		if err := h.client.ChatCompletion(c.Request.Context(), payload, &out); err != nil {
			h.logger.Error("LLM proxy chat failed", zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, out)
		return
	}

	// 流式: SSE 转发 Hermes 的 delta
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	now := time.Now().Unix()
	callID := fmt.Sprintf("chatcmpl-%d", now)

	// 先发 role chunk
	writeSSEChunk(c, map[string]interface{}{
		"id":      callID,
		"object":  "chat.completion.chunk",
		"created": now,
		"model":   model,
		"choices": []map[string]interface{}{
			{"index": 0, "delta": map[string]interface{}{"role": "assistant"}, "finish_reason": nil},
		},
	})

	var finalText strings.Builder
	_, err := h.client.ChatCompletionStream(c.Request.Context(), payload, func(delta string) error {
		finalText.WriteString(delta)
		writeSSEChunk(c, map[string]interface{}{
			"id":      callID,
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   model,
			"choices": []map[string]interface{}{
				{"index": 0, "delta": map[string]interface{}{"content": delta}, "finish_reason": nil},
			},
		})
		return nil
	})
	if err != nil {
		h.logger.Error("LLM proxy stream failed", zap.Error(err))
	}

	// 结束 chunk
	writeSSEChunk(c, map[string]interface{}{
		"id":      callID,
		"object":  "chat.completion.chunk",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []map[string]interface{}{
			{"index": 0, "delta": map[string]interface{}{}, "finish_reason": "stop"},
		},
	})
	// 结束标记
	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}
}

func writeSSEChunk(c *gin.Context, obj map[string]interface{}) {
	b, err := json.Marshal(obj)
	if err != nil {
		return
	}
	fmt.Fprintf(c.Writer, "data: %s\n\n", b)
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}
}
