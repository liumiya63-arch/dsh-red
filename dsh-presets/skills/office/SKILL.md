---
name: office
description: "Handle PDF, DOCX, XLSX, and PPTX with the local office skill notes and the office MCP. Use when the user asks to read, create, convert, or extract Office or PDF files."
---

# Office documents

Document skills from [claude-office-skills/skills](https://github.com/claude-office-skills/skills) live in this folder. The executable MCP is `mcp/office`, registered in DSH as server `office`.

## When to use which

- PDF text, merge, split, forms, watermark: MCP `office` PDF tools. If `pdf-parse` rejects a new PDF, convert it with the bundled LibreOffice kit first.
- DOCX create or extract: MCP `office` document tools, or bundled `python-docx` when the MCP result is thin.
- XLSX read, write, formulas, JSON/CSV: MCP `office` spreadsheet tools. Old `.xls` is not XLSX; convert with the bundled LibreOffice kit, then read.
- PPTX: MCP `office` presentation tools, or bundled `python-pptx`.

## Local paths

- Skill notes: `.dsh/skills/office/<skill-name>/SKILL.md`
- MCP entry: `mcp/office/dist/index.js`
- MCP notes: `mcp/office/README.dsh.md`

Open the matching child `SKILL.md` before a specialized workflow (contract text, OCR, batch convert). Do not install another Office stack when the bundled Python libraries or this MCP already cover the job.
