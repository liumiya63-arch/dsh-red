package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"desredteam/internal/audit"
	"desredteam/internal/config"
	"desredteam/internal/database"
	"desredteam/internal/skillpackage"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
)

// SkillsHandler Skills处理器（磁盘 + Eino 规范；运行时由 Eino ADK skill 中间件加载）
type SkillsHandler struct {
	config     *config.Config
	configPath string
	logger     *zap.Logger
	db         *database.DB // 数据库连接（遗留统计；MCP list/read 已移除）
	audit      *audit.Service

	// HermesSkillsProxyURL 非空时, GetSkills 转发到 Hermes API server /v1/skills
	// (让 DesRedTeam 技能页展示 Hermes 引擎的 skills)
	HermesSkillsProxyURL string
	HermesSkillsAPIKey   string
}

// SetAudit wires platform audit logging.
func (h *SkillsHandler) SetAudit(s *audit.Service) {
	h.audit = s
}

// NewSkillsHandler 创建新的Skills处理器
func NewSkillsHandler(cfg *config.Config, configPath string, logger *zap.Logger) *SkillsHandler {
	return &SkillsHandler{
		config:     cfg,
		configPath: configPath,
		logger:     logger,
	}
}

func (h *SkillsHandler) skillsRootAbs() string {
	skillsDir := h.config.SkillsDir
	if skillsDir == "" {
		skillsDir = "skills"
	}
	configDir := filepath.Dir(h.configPath)
	if !filepath.IsAbs(skillsDir) {
		skillsDir = filepath.Join(configDir, skillsDir)
	}
	return skillsDir
}

// SetDB 设置数据库连接（用于获取调用统计）
func (h *SkillsHandler) SetDB(db *database.DB) {
	h.db = db
}

// GetSkills 获取所有skills列表（支持分页和搜索）
func (h *SkillsHandler) GetSkills(c *gin.Context) {
	// ── Hermes skills 代理: 配置 HermesSkillsProxyURL 时转发到 Hermes API server ──
	if h.HermesSkillsProxyURL != "" {
		h.getHermesSkills(c)
		return
	}
	allSummaries, err := skillpackage.ListSkillSummaries(h.skillsRootAbs())
	if err != nil {
		h.logger.Error("获取skills列表失败", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	searchKeyword := strings.TrimSpace(c.Query("search"))

	allSkillsInfo := make([]map[string]interface{}, 0, len(allSummaries))
	for _, s := range allSummaries {
		skillInfo := map[string]interface{}{
			"id":           s.ID,
			"name":         s.Name,
			"dir_name":     s.DirName,
			"description":  s.Description,
			"version":      s.Version,
			"path":         s.Path,
			"tags":         s.Tags,
			"triggers":     s.Triggers,
			"script_count": s.ScriptCount,
			"file_count":   s.FileCount,
			"progressive":  s.Progressive,
			"file_size":    s.FileSize,
			"mod_time":     s.ModTime,
		}
		allSkillsInfo = append(allSkillsInfo, skillInfo)
	}

	filteredSkillsInfo := allSkillsInfo
	if searchKeyword != "" {
		keywordLower := strings.ToLower(searchKeyword)
		filteredSkillsInfo = make([]map[string]interface{}, 0)
		for _, skillInfo := range allSkillsInfo {
			id := strings.ToLower(fmt.Sprintf("%v", skillInfo["id"]))
			name := strings.ToLower(fmt.Sprintf("%v", skillInfo["name"]))
			description := strings.ToLower(fmt.Sprintf("%v", skillInfo["description"]))
			path := strings.ToLower(fmt.Sprintf("%v", skillInfo["path"]))
			version := strings.ToLower(fmt.Sprintf("%v", skillInfo["version"]))
			tagsJoined := ""
			if tags, ok := skillInfo["tags"].([]string); ok {
				tagsJoined = strings.ToLower(strings.Join(tags, " "))
			}
			trigJoined := ""
			if tr, ok := skillInfo["triggers"].([]string); ok {
				trigJoined = strings.ToLower(strings.Join(tr, " "))
			}
			if strings.Contains(id, keywordLower) ||
				strings.Contains(name, keywordLower) ||
				strings.Contains(description, keywordLower) ||
				strings.Contains(path, keywordLower) ||
				strings.Contains(version, keywordLower) ||
				strings.Contains(tagsJoined, keywordLower) ||
				strings.Contains(trigJoined, keywordLower) {
				filteredSkillsInfo = append(filteredSkillsInfo, skillInfo)
			}
		}
	}

	// 分页参数
	limit := 20 // 默认每页20条
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := parseInt(limitStr); err == nil && parsed > 0 {
			// 允许更大的limit用于搜索场景，但设置一个合理的上限（10000）
			if parsed <= 10000 {
				limit = parsed
			} else {
				limit = 10000
			}
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := parseInt(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	// 计算分页范围
	total := len(filteredSkillsInfo)
	start := offset
	end := offset + limit
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	// 获取当前页的skill列表
	var paginatedSkillsInfo []map[string]interface{}
	if start < end {
		paginatedSkillsInfo = filteredSkillsInfo[start:end]
	} else {
		paginatedSkillsInfo = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{
		"skills": paginatedSkillsInfo,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// getHermesSkills 转发到 Hermes API server /v1/skills, 转换为 DesRedTeam 前端兼容格式。
func (h *SkillsHandler) getHermesSkills(c *gin.Context) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", strings.TrimRight(h.HermesSkillsProxyURL, "/")+"/v1/skills", nil)
	if err != nil {
		h.logger.Error("构建 Hermes skills 请求失败", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.HermesSkillsAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+h.HermesSkillsAPIKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		h.logger.Error("获取 Hermes skills 失败", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": "Hermes skills 不可用: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	var payload struct {
		Data []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Category    string `json:"category"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		h.logger.Error("解析 Hermes skills 响应失败", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	searchKeyword := strings.ToLower(strings.TrimSpace(c.Query("search")))
	allSkillsInfo := make([]map[string]interface{}, 0, len(payload.Data))
	for _, s := range payload.Data {
		skillInfo := map[string]interface{}{
			"id":           s.Name,
			"name":         s.Name,
			"dir_name":     s.Name,
			"description":  s.Description,
			"version":      "1.0.0",
			"path":         "/hermes-skills/" + s.Name,
			"tags":         []string{},
			"triggers":     []string{},
			"script_count": 0,
			"file_count":   0,
			"progressive":  false,
			"file_size":    0,
			"mod_time":     "",
			"source":       "hermes",
		}
		if searchKeyword != "" {
			hay := strings.ToLower(s.Name + " " + s.Description + " " + s.Category)
			if !strings.Contains(hay, searchKeyword) {
				continue
			}
		}
		allSkillsInfo = append(allSkillsInfo, skillInfo)
	}

	// 分页参数（与本地版一致）
	limit := 20
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := parseInt(limitStr); err == nil && parsed > 0 && parsed <= 10000 {
			limit = parsed
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := parseInt(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	total := len(allSkillsInfo)
	start := offset
	if start > total {
		start = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	paginated := []map[string]interface{}{}
	if start < end {
		paginated = allSkillsInfo[start:end]
	}

	c.JSON(http.StatusOK, gin.H{
		"skills": paginated,
		"total":  total,
		"limit":  limit,
		"offset": offset,
		"source": "hermes",
	})
}

// hermesProxy 转发请求到 Hermes API server（技能查看/编辑/创建/删除）。
// Hermes 错误响应为 {"error":{"message":...}} 信封, 提取 message 转 502 返回。
func (h *SkillsHandler) hermesProxy(c *gin.Context, method, path string, query url.Values, body any, out any) error {
	client := &http.Client{Timeout: 10 * time.Second}
	u := strings.TrimRight(h.HermesSkillsProxyURL, "/") + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("序列化请求体失败: %w", err)
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, u, rd)
	if err != nil {
		return err
	}
	if h.HermesSkillsAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+h.HermesSkillsAPIKey)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("Hermes 不可用: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &e)
		msg := e.Error.Message
		if msg == "" {
			msg = strings.TrimSpace(string(raw))
			if len(msg) > 200 {
				msg = msg[:200]
			}
		}
		return fmt.Errorf("Hermes(%d): %s", resp.StatusCode, msg)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// hermesSkillNameEscape 生成 Hermes 路径段用的 skill 名(skill 名仅小写字母/数字/连字符)。
func hermesSkillNameEscape(name string) string {
	return url.PathEscape(name)
}

// GetSkill 获取单个skill的详细信息
func (h *SkillsHandler) GetSkill(c *gin.Context) {
	skillName := c.Param("name")
	if skillName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill名称不能为空"})
		return
	}

	resPath := strings.TrimSpace(c.Query("resource_path"))
	if resPath == "" {
		resPath = strings.TrimSpace(c.Query("skill_script_path"))
	}

	// ── Hermes 代理: 详情/脚本读取全部转发 ──
	if h.HermesSkillsProxyURL != "" {
		if resPath != "" {
			var payload struct {
				Data struct {
					Path    string `json:"path"`
					Content string `json:"content"`
				} `json:"data"`
			}
			if err := h.hermesProxy(c, http.MethodGet, "/v1/skills/"+hermesSkillNameEscape(skillName)+"/file",
				url.Values{"path": {resPath}}, nil, &payload); err != nil {
				h.logger.Warn("读取 Hermes skill 资源失败", zap.String("skill", skillName), zap.String("path", resPath), zap.Error(err))
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"skill": map[string]interface{}{"id": skillName},
				"resource": map[string]interface{}{
					"path":    payload.Data.Path,
					"content": payload.Data.Content,
				},
			})
			return
		}

		depth := c.DefaultQuery("depth", "full")
		var payload struct {
			Data struct {
				Name        string                   `json:"name"`
				Description string                   `json:"description"`
				Version     string                   `json:"version"`
				Path        string                   `json:"path"`
				ModTime     string                   `json:"mod_time"`
				Content     string                   `json:"content"`
				Scripts     []map[string]interface{} `json:"scripts"`
			} `json:"data"`
		}
		if err := h.hermesProxy(c, http.MethodGet, "/v1/skills/"+hermesSkillNameEscape(skillName),
			url.Values{"depth": {depth}}, nil, &payload); err != nil {
			h.logger.Error("获取 Hermes skill 详情失败", zap.String("skill", skillName), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		d := payload.Data
		c.JSON(http.StatusOK, gin.H{
			"skill": map[string]interface{}{
				"id":          d.Name,
				"name":        d.Name,
				"description": d.Description,
				"version":     d.Version,
				"content":     d.Content,
				"path":        d.Path,
				"mod_time":    d.ModTime,
				"scripts":     d.Scripts,
				"depth":       depth,
			},
		})
		return
	}

	if resPath != "" {
		content, err := skillpackage.ReadScriptText(h.skillsRootAbs(), skillName, resPath, 0)
		if err != nil {
			h.logger.Warn("读取skill资源失败", zap.String("skill", skillName), zap.String("path", resPath), zap.Error(err))
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"skill": map[string]interface{}{
				"id": skillName,
			},
			"resource": map[string]interface{}{
				"path":    resPath,
				"content": content,
			},
		})
		return
	}

	depthStr := strings.ToLower(strings.TrimSpace(c.DefaultQuery("depth", "full")))
	section := strings.TrimSpace(c.Query("section"))
	opt := skillpackage.LoadOptions{Section: section}
	switch depthStr {
	case "summary":
		opt.Depth = "summary"
	case "full", "":
		opt.Depth = "full"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "depth 仅支持 summary 或 full"})
		return
	}

	skill, err := skillpackage.LoadSkill(h.skillsRootAbs(), skillName, opt)
	if err != nil {
		h.logger.Warn("加载skill失败", zap.String("skill", skillName), zap.Error(err))
		c.JSON(http.StatusNotFound, gin.H{"error": "skill不存在: " + err.Error()})
		return
	}

	skillPath := skill.Path
	skillFile := filepath.Join(skillPath, "SKILL.md")

	fileInfo, _ := os.Stat(skillFile)
	var fileSize int64
	var modTime string
	if fileInfo != nil {
		fileSize = fileInfo.Size()
		modTime = fileInfo.ModTime().Format("2006-01-02 15:04:05")
	}

	c.JSON(http.StatusOK, gin.H{
		"skill": map[string]interface{}{
			"id":            skill.DirName,
			"name":          skill.Name,
			"description":   skill.Description,
			"content":       skill.Content,
			"path":          skill.Path,
			"version":       skill.Version,
			"tags":          skill.Tags,
			"scripts":       skill.Scripts,
			"sections":      skill.Sections,
			"package_files": skill.PackageFiles,
			"file_size":     fileSize,
			"mod_time":      modTime,
			"depth":         depthStr,
			"section":       section,
		},
	})
}

// ListSkillPackageFiles lists all files in a skill directory (Agent Skills layout).
func (h *SkillsHandler) ListSkillPackageFiles(c *gin.Context) {
	skillID := c.Param("name")
	if h.HermesSkillsProxyURL != "" {
		var payload struct {
			Data []map[string]interface{} `json:"data"`
		}
		if err := h.hermesProxy(c, http.MethodGet, "/v1/skills/"+hermesSkillNameEscape(skillID)+"/files", nil, nil, &payload); err != nil {
			h.logger.Error("获取 Hermes skill 文件列表失败", zap.String("skill", skillID), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		files := payload.Data
		if files == nil {
			files = []map[string]interface{}{}
		}
		c.JSON(http.StatusOK, gin.H{"files": files})
		return
	}
	files, err := skillpackage.ListPackageFiles(h.skillsRootAbs(), skillID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"files": files})
}

// GetSkillPackageFile returns one file by relative path (?path=).
func (h *SkillsHandler) GetSkillPackageFile(c *gin.Context) {
	skillID := c.Param("name")
	rel := strings.TrimSpace(c.Query("path"))
	if rel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query path is required"})
		return
	}
	if h.HermesSkillsProxyURL != "" {
		var payload struct {
			Data struct {
				Path    string `json:"path"`
				Content string `json:"content"`
			} `json:"data"`
		}
		if err := h.hermesProxy(c, http.MethodGet, "/v1/skills/"+hermesSkillNameEscape(skillID)+"/file",
			url.Values{"path": {rel}}, nil, &payload); err != nil {
			h.logger.Error("读取 Hermes skill 文件失败", zap.String("skill", skillID), zap.String("path", rel), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"path": payload.Data.Path, "content": payload.Data.Content})
		return
	}
	b, err := skillpackage.ReadPackageFile(h.skillsRootAbs(), skillID, rel, 0)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"path": rel, "content": string(b)})
}

// PutSkillPackageFile writes a file inside the skill package.
func (h *SkillsHandler) PutSkillPackageFile(c *gin.Context) {
	skillID := c.Param("name")
	var req struct {
		Path    string `json:"path" binding:"required"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求参数: " + err.Error()})
		return
	}
	if h.HermesSkillsProxyURL != "" {
		var out struct {
			Data struct {
				Path string `json:"path"`
			} `json:"data"`
		}
		if err := h.hermesProxy(c, http.MethodPut, "/v1/skills/"+hermesSkillNameEscape(skillID)+"/file", nil,
			map[string]string{"path": req.Path, "content": req.Content}, &out); err != nil {
			h.logger.Error("写入 Hermes skill 文件失败", zap.String("skill", skillID), zap.String("path", req.Path), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "saved", "path": out.Data.Path})
		return
	}
	if req.Path == "SKILL.md" {
		if err := skillpackage.ValidateSkillMDPackage([]byte(req.Content), skillID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if err := skillpackage.WritePackageFile(h.skillsRootAbs(), skillID, req.Path, []byte(req.Content)); err != nil {
		h.logger.Error("写入 skill 文件失败", zap.String("skill", skillID), zap.String("path", req.Path), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "saved", "path": req.Path})
}

// GetSkillBoundRoles 获取绑定指定skill的角色列表
func (h *SkillsHandler) GetSkillBoundRoles(c *gin.Context) {
	skillName := c.Param("name")
	if skillName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill名称不能为空"})
		return
	}

	boundRoles := h.getRolesBoundToSkill(skillName)
	c.JSON(http.StatusOK, gin.H{
		"skill":       skillName,
		"bound_roles": boundRoles,
		"bound_count": len(boundRoles),
	})
}

// getRolesBoundToSkill 预留：角色不再配置 skill 绑定，始终返回空列表。
func (h *SkillsHandler) getRolesBoundToSkill(skillName string) []string {
	_ = skillName
	return nil
}

// CreateSkill 创建新 skill（标准 Agent Skills：生成 SKILL.md + YAML front matter）
func (h *SkillsHandler) CreateSkill(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description" binding:"required"`
		Content     string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求参数: " + err.Error()})
		return
	}

	// ── Hermes 代理: 创建 skill 转发 ──
	if h.HermesSkillsProxyURL != "" {
		var out struct {
			Data struct {
				Name string `json:"name"`
				Path string `json:"path"`
			} `json:"data"`
		}
		if err := h.hermesProxy(c, http.MethodPost, "/v1/skills", nil,
			map[string]string{"name": req.Name, "description": req.Description, "content": req.Content}, &out); err != nil {
			h.logger.Error("创建 Hermes skill 失败", zap.String("skill", req.Name), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		h.logger.Info("创建 Hermes skill 成功", zap.String("skill", req.Name))
		if h.audit != nil {
			h.audit.RecordOK(c, "skill", "create", "创建 Skill", "skill", req.Name, nil)
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "skill已创建",
			"skill": map[string]interface{}{
				"name": out.Data.Name,
				"path": out.Data.Path,
			},
		})
		return
	}

	if !isValidSkillName(req.Name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill 目录名须为小写字母、数字、连字符（与 Agent Skills name 一致）"})
		return
	}

	manifest := &skillpackage.SkillManifest{
		Name:        req.Name,
		Description: strings.TrimSpace(req.Description),
	}
	skillMD, err := skillpackage.BuildSkillMD(manifest, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := skillpackage.ValidateSkillMDPackage(skillMD, req.Name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	skillDir := filepath.Join(h.skillsRootAbs(), req.Name)
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		h.logger.Error("创建skill目录失败", zap.String("skill", req.Name), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建skill目录失败: " + err.Error()})
		return
	}

	if _, err := os.Stat(filepath.Join(skillDir, "SKILL.md")); err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill已存在"})
		return
	}

	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), skillMD, 0644); err != nil {
		h.logger.Error("创建 SKILL.md 失败", zap.String("skill", req.Name), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建 SKILL.md 失败: " + err.Error()})
		return
	}

	h.logger.Info("创建skill成功", zap.String("skill", req.Name))
	if h.audit != nil {
		h.audit.RecordOK(c, "skill", "create", "创建 Skill", "skill", req.Name, nil)
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "skill已创建",
		"skill": map[string]interface{}{
			"name": req.Name,
			"path": skillDir,
		},
	})
}

// UpdateSkill 更新 SKILL.md（保留 front matter 中除 description 外的字段；可选覆盖 description）
func (h *SkillsHandler) UpdateSkill(c *gin.Context) {
	skillName := c.Param("name")
	if skillName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill名称不能为空"})
		return
	}

	var req struct {
		Description string `json:"description"`
		Content     string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求参数: " + err.Error()})
		return
	}

	// ── Hermes 代理: 更新 SKILL.md 转发 ──
	if h.HermesSkillsProxyURL != "" {
		if err := h.hermesProxy(c, http.MethodPut, "/v1/skills/"+hermesSkillNameEscape(skillName), nil,
			map[string]string{"description": req.Description, "content": req.Content}, nil); err != nil {
			h.logger.Error("更新 Hermes skill 失败", zap.String("skill", skillName), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		h.logger.Info("更新 Hermes skill 成功", zap.String("skill", skillName))
		if h.audit != nil {
			h.audit.RecordOK(c, "skill", "update", "更新 Skill", "skill", skillName, nil)
		}
		c.JSON(http.StatusOK, gin.H{"message": "skill已更新"})
		return
	}

	mdPath := filepath.Join(h.skillsRootAbs(), skillName, "SKILL.md")
	raw, err := os.ReadFile(mdPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skill不存在: " + err.Error()})
		return
	}
	m, _, err := skillpackage.ParseSkillMD(raw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Description != "" {
		m.Description = strings.TrimSpace(req.Description)
	}
	skillMD, err := skillpackage.BuildSkillMD(m, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := skillpackage.ValidateSkillMDPackage(skillMD, skillName); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	skillDir := filepath.Join(h.skillsRootAbs(), skillName)

	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), skillMD, 0644); err != nil {
		h.logger.Error("更新 SKILL.md 失败", zap.String("skill", skillName), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新 SKILL.md 失败: " + err.Error()})
		return
	}

	h.logger.Info("更新skill成功", zap.String("skill", skillName))
	if h.audit != nil {
		h.audit.RecordOK(c, "skill", "update", "更新 Skill", "skill", skillName, nil)
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "skill已更新",
	})
}

// DeleteSkill 删除skill
func (h *SkillsHandler) DeleteSkill(c *gin.Context) {
	skillName := c.Param("name")
	if skillName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill名称不能为空"})
		return
	}

	// ── Hermes 代理: 删除 skill 转发 ──
	if h.HermesSkillsProxyURL != "" {
		if err := h.hermesProxy(c, http.MethodDelete, "/v1/skills/"+hermesSkillNameEscape(skillName), nil, nil, nil); err != nil {
			h.logger.Error("删除 Hermes skill 失败", zap.String("skill", skillName), zap.Error(err))
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		h.logger.Info("删除 Hermes skill 成功", zap.String("skill", skillName))
		if h.audit != nil {
			h.audit.RecordOK(c, "skill", "delete", "删除 Skill", "skill", skillName, nil)
		}
		c.JSON(http.StatusOK, gin.H{"message": "skill已删除", "affected_roles": []string{}})
		return
	}

	// 检查是否有角色绑定了该skill，如果有则自动移除绑定
	affectedRoles := h.removeSkillFromRoles(skillName)
	if len(affectedRoles) > 0 {
		h.logger.Info("从角色中移除skill绑定",
			zap.String("skill", skillName),
			zap.Strings("roles", affectedRoles))
	}

	skillDir := filepath.Join(h.skillsRootAbs(), skillName)
	if err := os.RemoveAll(skillDir); err != nil {
		h.logger.Error("删除skill失败", zap.String("skill", skillName), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除skill失败: " + err.Error()})
		return
	}
	responseMsg := "skill已删除"
	if len(affectedRoles) > 0 {
		responseMsg = fmt.Sprintf("skill已删除，已自动从 %d 个角色中移除绑定: %s",
			len(affectedRoles), strings.Join(affectedRoles, ", "))
	}

	h.logger.Info("删除skill成功", zap.String("skill", skillName))
	if h.audit != nil {
		h.audit.RecordOK(c, "skill", "delete", "删除 Skill", "skill", skillName, map[string]interface{}{
			"affected_roles": affectedRoles,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"message":        responseMsg,
		"affected_roles": affectedRoles,
	})
}

// GetSkillStats 获取skills调用统计信息
func (h *SkillsHandler) GetSkillStats(c *gin.Context) {
	skillList, err := skillpackage.ListSkillDirNames(h.skillsRootAbs())
	if err != nil {
		h.logger.Error("获取skills列表失败", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	skillsDir := h.skillsRootAbs()

	// 从数据库加载调用统计
	var skillStatsMap map[string]*database.SkillStats
	if h.db != nil {
		dbStats, err := h.db.LoadSkillStats()
		if err != nil {
			h.logger.Warn("从数据库加载Skills统计信息失败", zap.Error(err))
			skillStatsMap = make(map[string]*database.SkillStats)
		} else {
			skillStatsMap = dbStats
		}
	} else {
		skillStatsMap = make(map[string]*database.SkillStats)
	}

	// 构建统计信息（包含所有skills，即使没有调用记录）
	statsList := make([]map[string]interface{}, 0, len(skillList))
	totalCalls := 0
	totalSuccess := 0
	totalFailed := 0

	for _, skillName := range skillList {
		stat, exists := skillStatsMap[skillName]
		if !exists {
			stat = &database.SkillStats{
				SkillName:    skillName,
				TotalCalls:   0,
				SuccessCalls: 0,
				FailedCalls:  0,
			}
		}

		totalCalls += stat.TotalCalls
		totalSuccess += stat.SuccessCalls
		totalFailed += stat.FailedCalls

		lastCallTimeStr := ""
		if stat.LastCallTime != nil {
			lastCallTimeStr = stat.LastCallTime.Format("2006-01-02 15:04:05")
		}

		statsList = append(statsList, map[string]interface{}{
			"skill_name":     stat.SkillName,
			"total_calls":    stat.TotalCalls,
			"success_calls":  stat.SuccessCalls,
			"failed_calls":   stat.FailedCalls,
			"last_call_time": lastCallTimeStr,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"total_skills":  len(skillList),
		"total_calls":   totalCalls,
		"total_success": totalSuccess,
		"total_failed":  totalFailed,
		"skills_dir":    skillsDir,
		"stats":         statsList,
	})
}

// ClearSkillStats 清空所有Skills统计信息
func (h *SkillsHandler) ClearSkillStats(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库连接未配置"})
		return
	}

	if err := h.db.ClearSkillStats(); err != nil {
		h.logger.Error("清空Skills统计信息失败", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清空统计信息失败: " + err.Error()})
		return
	}

	h.logger.Info("已清空所有Skills统计信息")
	c.JSON(http.StatusOK, gin.H{
		"message": "已清空所有Skills统计信息",
	})
}

// ClearSkillStatsByName 清空指定skill的统计信息
func (h *SkillsHandler) ClearSkillStatsByName(c *gin.Context) {
	skillName := c.Param("name")
	if skillName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skill名称不能为空"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库连接未配置"})
		return
	}

	if err := h.db.ClearSkillStatsByName(skillName); err != nil {
		h.logger.Error("清空指定skill统计信息失败", zap.String("skill", skillName), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清空统计信息失败: " + err.Error()})
		return
	}

	h.logger.Info("已清空指定skill统计信息", zap.String("skill", skillName))
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("已清空skill '%s' 的统计信息", skillName),
	})
}

// removeSkillFromRoles 预留：角色不再存储 skill 绑定，无操作。
func (h *SkillsHandler) removeSkillFromRoles(skillName string) []string {
	_ = skillName
	return nil
}

// saveRolesConfig 保存角色配置到文件（从SkillsHandler调用）
func (h *SkillsHandler) saveRolesConfig() error {
	configDir := filepath.Dir(h.configPath)
	rolesDir := h.config.RolesDir
	if rolesDir == "" {
		rolesDir = "roles" // 默认目录
	}

	// 如果是相对路径，相对于配置文件所在目录
	if !filepath.IsAbs(rolesDir) {
		rolesDir = filepath.Join(configDir, rolesDir)
	}

	// 确保目录存在
	if err := os.MkdirAll(rolesDir, 0755); err != nil {
		return fmt.Errorf("创建角色目录失败: %w", err)
	}

	// 保存每个角色到独立的文件
	if h.config.Roles != nil {
		for roleName, role := range h.config.Roles {
			// 确保角色名称正确设置
			if role.Name == "" {
				role.Name = roleName
			}

			// 使用角色名称作为文件名（安全化文件名，避免特殊字符）
			safeFileName := sanitizeRoleFileName(role.Name)
			roleFile := filepath.Join(rolesDir, safeFileName+".yaml")

			// 将角色配置序列化为YAML
			roleData, err := yaml.Marshal(&role)
			if err != nil {
				h.logger.Error("序列化角色配置失败", zap.String("role", roleName), zap.Error(err))
				continue
			}

			// 处理icon字段：确保包含\U的icon值被引号包围（YAML需要引号才能正确解析Unicode转义）
			roleDataStr := string(roleData)
			if role.Icon != "" && strings.HasPrefix(role.Icon, "\\U") {
				// 匹配 icon: \UXXXXXXXX 格式（没有引号），排除已经有引号的情况
				re := regexp.MustCompile(`(?m)^(icon:\s+)(\\U[0-9A-F]{8})(\s*)$`)
				roleDataStr = re.ReplaceAllString(roleDataStr, `${1}"${2}"${3}`)
				roleData = []byte(roleDataStr)
			}

			// 写入文件
			if err := os.WriteFile(roleFile, roleData, 0644); err != nil {
				h.logger.Error("保存角色配置文件失败", zap.String("role", roleName), zap.String("file", roleFile), zap.Error(err))
				continue
			}

			h.logger.Info("角色配置已保存到文件", zap.String("role", roleName), zap.String("file", roleFile))
		}
	}

	return nil
}

// sanitizeRoleFileName 将角色名称转换为安全的文件名
func sanitizeRoleFileName(name string) string {
	// 替换可能不安全的字符
	replacer := map[rune]string{
		'/':  "_",
		'\\': "_",
		':':  "_",
		'*':  "_",
		'?':  "_",
		'"':  "_",
		'<':  "_",
		'>':  "_",
		'|':  "_",
		' ':  "_",
	}

	var result []rune
	for _, r := range name {
		if replacement, ok := replacer[r]; ok {
			result = append(result, []rune(replacement)...)
		} else {
			result = append(result, r)
		}
	}

	fileName := string(result)
	// 如果文件名为空，使用默认名称
	if fileName == "" {
		fileName = "role"
	}

	return fileName
}

// isValidSkillName 验证 skill 目录名（与 Agent Skills 的 name 字段一致：小写、数字、连字符）
func isValidSkillName(name string) bool {
	if name == "" || len(name) > 100 {
		return false
	}
	for _, r := range name {
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-') {
			return false
		}
	}
	return true
}
