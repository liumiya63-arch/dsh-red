package agent

import (
	"strings"

	"desredteam/internal/config"
)

// AI 围栏 — 纯提示词层 (2026-08-11)
//
// 设计: 不依赖工具拦截(approvals/白名单), 只向系统提示词注入 CRUD 边界规则。
// 用户通过 config.yaml 的 agent.fence 控制:
//   - enabled: 总开关, 默认 false (不注入)
//   - crud_rule: 自定义边界文本; 空则用内置默认
//
// 软约束说明: 提示词围栏是"说服"模型, 不是"强制"模型 — 对抗性 prompt
// injection 或模型幻觉时可能被穿透; 硬边界仍需工具层(approvals/白名单)兜底。
//
// 默认规则: 读取(read/query/list/get/枚举/探测)自主执行; 写操作
// (create/update/delete/新增/修改/删除/变更/执行)拿到后台权限后必须先询问用户。

const fenceBlockHead = "\n\n## AI 围栏(系统注入, 优先级最高, 必须遵守)\n"
const fenceBlockTail = "\n## AI 围栏结束\n"

// DefaultFenceCrudRule 内置默认 CRUD 边界规则
const DefaultFenceCrudRule = `CRUD 操作边界:
1. 读取(Read): 查询/枚举/探测/只读接口/信息收集 — 可自主执行, 无需确认。
2. 写操作(Create/Update/Delete): 新增/修改/删除/变更数据、创建账号、执行配置变更、
   发送消息/命令、上传文件 — 在【拿到后台权限之后】必须先询问用户确认,
   用户明确同意后方可执行; 未经确认不得执行, 也不得用"试探性"写操作代替询问。
3. 若用户已在本轮明确授权某次写操作, 该次可执行; 授权不可跨轮次延续。
4. 拿不准是否属于写操作时, 按写操作对待 — 先询问。`

// BuildFenceDirectives 根据配置构建围栏提示词块; 未启用或配置为空时返回空串。
func BuildFenceDirectives(cfg *config.FenceConfig) string {
	if cfg == nil || !cfg.Enabled {
		return ""
	}
	rule := strings.TrimSpace(cfg.CrudRule)
	if rule == "" {
		rule = DefaultFenceCrudRule
	}
	var b strings.Builder
	b.WriteString(fenceBlockHead)
	b.WriteString(rule)
	b.WriteString("\n")
	b.WriteString(fenceBlockTail)
	return b.String()
}
