package agent

import (
	"os"
	"path/filepath"
	"strings"
)

// 强制技能指令注入 (2026-08-07)
//
// 背景: 平台 skills/ 走 Eino ADK 渐进式披露 (multi_agent.eino_skills) ——
// 模型必须主动调用 `skill` 工具才会把 SKILL.md 内容加载进上下文。
// 实战中 AI 经常不触发加载, 导致不按自定义技能执行。
// 本模块把指定 SKILL.md 的「核心指令段」直接拼进系统提示词, 每轮强制可见。
//
// 要强制更多技能: 在 forcedSkills 列表加目录名, 并在 extractSkillCore 加提取规则。
// 注意控制注入体积。

// forcedSkills 需要强制注入的系统技能目录名(小写连字符, 与 skills/ 子目录一致)
// 开源版: 无强制技能注入(无); 如需强制其他技能在此添加目录名
var forcedSkills = []string{}

const forcedBlockHead = "\n\n## 强制技能指令(系统注入, 优先级最高, 必须遵守)\n"
const forcedBlockTail = "\n## 强制技能指令结束\n"

// BuildForcedSkillDirectives 从 baseDir(通常 config.yaml 所在目录)下的 skills/
// 读取强制技能核心指令, 拼成提示词块。skills 目录缺失或技能不存在时返回空串。
func BuildForcedSkillDirectives(baseDir string) string {
	skillsDir := strings.TrimSpace(baseDir)
	if skillsDir == "" {
		return ""
	}
	skillsDir = filepath.Join(skillsDir, "skills")
	var b strings.Builder
	wrote := false
	for _, name := range forcedSkills {
		body := readForcedSkill(skillsDir, name)
		if body == "" {
			continue
		}
		if !wrote {
			b.WriteString(forcedBlockHead)
			wrote = true
		}
		b.WriteString(body)
		b.WriteString("\n")
	}
	if !wrote {
		return ""
	}
	b.WriteString(forcedBlockTail)
	return b.String()
}

func readForcedSkill(skillsDir, name string) string {
	p := filepath.Join(skillsDir, name, "SKILL.md")
	data, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return extractSkillCore(string(data), name)
}

// extractSkillCore 提取 SKILL.md 核心指令段, 避免全文注入
func extractSkillCore(content, name string) string {
	switch name {
	}
	return ""
}


func extractDesChromeCore(content string) string {
	var b strings.Builder
	// 1) 头部: "# SKILL:" 到第一个 "\n## " 之前
	if i := strings.Index(content, "# SKILL:"); i >= 0 {
		end := len(content)
		if j := strings.Index(content[i:], "\n## "); j > 0 {
			end = i + j
		}
		b.WriteString(content[i:end])
		b.WriteString("\n")
	}
	// 2) "## 1.9 工具替换映射" 到下一个 "## 2." 之前
	const anchor = "## 1.9 工具替换映射"
	if i := strings.Index(content, anchor); i >= 0 {
		end := len(content)
		if j := strings.Index(content[i:], "\n## 2."); j > 0 {
			end = i + j
		}
		b.WriteString("\n")
		b.WriteString(content[i:end])
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}
