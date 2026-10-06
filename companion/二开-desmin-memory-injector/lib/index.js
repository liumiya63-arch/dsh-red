/**
 * desmin-memory-injector — DesMin 模式记忆自动注入插件
 *
 * 作用：
 *   DSH 每次组装 system prompt 时，自动读取 mcp_memory.json，
 *   把铁律/项目映射/已确认凭据/下一步清单/进化日志注入为一个 section。
 *   新会话即使不手动“加载模式”，也会自动带上记忆。
 *
 * 安装：
 *   dev_inject_plugin C:/Users/test/Documents/dsh-deepseek/desmin-memory-injector
 *   或 dev_install_package 落 bundles（重启持久）
 */

import { readFileSync } from 'node:fs'

export const name = 'desmin-memory-injector'
export const inject = ['systemPrompt']

const MEMORY_FILE = 'C:/app/encode/DRT便携迁移包/06-MCP/desworkflow/memory/mcp_memory.json'

function readMemory() {
  try {
    const raw = readFileSync(MEMORY_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatSection(data) {
  const lines = []
  lines.push('# DesMin 模式持久记忆（自动注入）')
  lines.push('')
  lines.push('## 铁律（必须遵守）')
  const rules = data.iron_rules || []
  rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
  lines.push('')
  lines.push('## 项目映射')
  const pm = data.project_map || {}
  for (const [name, ids] of Object.entries(pm)) {
    lines.push(`- ${name}: pentrack=${ids.pentrack || '?'} platform=${ids.platform || '?'}`)
  }
  lines.push('')
  lines.push('## 已确认凭据（只读/验证用）')
  const creds = data.credentials || []
  creds.forEach((c, i) => {
    const u = c.username || c.user || ''
    const p = c.password || c.pwd || ''
    lines.push(`- ${c.target || '?'}: ${u} / ${p}${c.note ? ` (${c.note})` : ''}`)
  })
  lines.push('')
  lines.push('## 下一步清单')
  const steps = data.next_steps || []
  steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
  lines.push('')
  lines.push('## 进化日志')
  const evo = data.evolution_log || []
  evo.forEach((e) => lines.push(`- ${e}`))
  return lines.join('\n')
}

export function apply(ctx, config) {
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    try {
      const data = readMemory()
      if (!data) return assembled
      const text = formatSection(data)
      const sections = Array.isArray(assembled.sections) ? assembled.sections : []
      // 幂等：已注入过就不再重复
      if (sections.some((s) => s && s.name === 'desmin-memory')) return assembled
      assembled.sections = [...sections, { name: 'desmin-memory', text }]
    } catch (e) {
      // 注入失败不影响正常会话
    }
    return assembled
  })
}
