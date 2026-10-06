# SkillOpt 技能自进化（把 skill 文档当权重训）

> 学自 [microsoft/SkillOpt](https://github.com/microsoft/SkillOpt)（[文档站](https://microsoft.github.io/SkillOpt/docs/)）。本库**吸收方法论 + 装本地 CLI**，不改本库红线。
> 想让知识库 / 某个 skill 自己变强，或想把一段会话的有效经验固化成 skill 时开这篇。**挖洞进站不要开这篇**，进站只认 `打穿短表.md` + `dig-scope` §4。
> 与 `~/.grok/rules` 冲突时**以 rules 为准**。本篇不定义挖什么、不定义报告怎么写。

---

## 一、一句话

把自然语言 skill 文档（Markdown）当**模型权重**来训：模型冻结，只改文档。

官方给的映射表就是全部思想：

| 深度学习 | SkillOpt |
|---|---|
| 权重 | skill 文档（Markdown） |
| 前向传播 | Rollout：target 拿当前 skill 跑任务 |
| loss / 梯度 | Reflect：optimizer 看轨迹产出 edit patch |
| 梯度裁剪 | 选编辑条数（`learning_rate` = 每步最多改几条） |
| SGD 步 | 把 patch 应用到文档 |
| 验证集 | 在 selection split 上跑门控 |
| LR schedule | `cosine` / `linear` / `constant` |
| epoch | 多轮 + slow update + meta skill 记忆 |

**本库的 `SKILL.md` 和 `知识库/*.md` 就是这套"权重"。** 这篇讲怎么安全地改它，以及不装工具时怎么手搓同一套纪律。

流程一环不省：`Rollout → Reflect → Aggregate → Select(裁剪) → Update → Gate(验证接受)`，epoch 边界做 Slow Update + Meta Skill。

---

## 二、什么时候开 / 不开

**开：**

- 用户说「让 skill 自进化 / 优化知识库 / 让 agent 从会话里学 / 训练 skill」
- 同一个坑反复踩：假点反复报、模块反复选错、报告反复缺段
- 想把某段会话里跑通的有效打法固化成文件

**不开：**

- **挖洞进站**。本节用途单一，别拿它顶短表
- 目标是「再多写几篇文档」——那是人写，不是训
- 任务不重复，或没有可验证的对错信号

最后一条是硬边界。官方自己写的 honest scope：收益只在**任务会重复 + 正确性可验证**时成立；在饱和或噪声大的基准上「平得落在 run-to-run 噪声里」，单 seed 基线方差 ±1–2 pts，**小于 ~1.5 pt 的差异当噪声看**。别把噪声当进步写进汇报。

---

## 三、本机预检（2026-09 实测，别照抄别的机器）

| 项 | 实测值 |
|---|---|
| 默认 `python` | **3.8.8 —— 不够**。SkillOpt 要 Python ≥3.10 |
| 该用哪个解释器 | `py -3.10` → `/mnt/c/Users/<USER>\AppData\Local\Programs\Python\Python310\python.exe`（3.10.11 / pip 26.2.1） |
| 3.8 的 pip 出网 | **坏**（`ProxyError: Cannot connect to proxy`）。别在 3.8 上试 |
| 3.10 的 pip 出网 | **通**。实测下到 `skillopt-0.2.0-py3-none-any.whl` |
| `git` / pwsh 直连 GitHub | **坏**（`schannel: SEC_E_NO_CREDENTIALS`）。要源码用 `pip download`，或用 MCP `github` |
| 无代理配置 | `pip config list` 空、User/Machine 级无 proxy 变量；不是代理写错，就是这条链路不通 |
| **venv 自带 pip 23.0.1 会卡死** | **实测踩坑**：`py -3.10 -m venv` 建的 venv 里 pip 是 23.0.1，`pip install skillopt` **稳定卡在下载完 `openai` 之后**，site-packages 不增长、pip cache 不增长（三次复现，非网络慢）。**换系统 pip 26.2.1 走 `--target` 立刻就好** |

**纪律：本机一切 SkillOpt 命令显式走 3.10，不要写裸 `python`。**

```powershell
$py = "/mnt/c/Users/<USER>\AppData\Local\Programs\Python\Python310\python.exe"
```

---

## 四、装（**本机当前未装** —— 实测完已按需清掉）

> 2026-09 实测装通过一次（96 MB），随后按用户要求删除。**要用就按下面重装**；下面的命令和坑是实测结果，不是抄文档。
> 文档照旧可读：§八「手搓一轮」不需要装任何东西。

装到 `tools/skillopt/`，**不动** `tools/` 下用户自管的其它树。

**用系统 pip + `--target`，不要用 venv。** venv 自带的 pip 23.0.1 解析器会卡死（见 §三）。实测有效的命令：

```powershell
$lib = "<PROJECT_ROOT>\deepseek\tools\skillopt\pylib"
py -3.10 -m pip install --no-cache-dir --progress-bar off --target $lib skillopt
# 实测：skillopt-0.2.0 + 33 个依赖（openai / pydantic / cryptography / azure-identity
#       / numpy / openpyxl / httpx …）共 96 MB，exit 0
```

跑的时候把 `pylib` 挂上（`--target` 装的包不在默认 `sys.path`）：

```powershell
$env:PYTHONPATH = "<PROJECT_ROOT>\deepseek\tools\skillopt\pylib"
$py = "/mnt/c/Users/<USER>\AppData\Local\Programs\Python\Python310\python.exe"
& $py -c "import skillopt; print('ok')"
```

> **入口**：`--target` 装法**不会**生成 `skillopt-train` / `skillopt-eval` / `skillopt-sleep` 这类 console script（那要进 `Scripts\`）。用模块形式调：`python -m skillopt.…`。要现成命令就换成正常 site-packages 安装。

> PyPI 0.2.0 **不含**仓库里的 benchmark configs、数据 materializer、`plugins/` 集成壳、开发测试。要这些得源码检出，而本机 git 出网坏 —— 走 `pip download skillopt --no-deps` 拿 wheel，或 MCP `github` 读文件，别硬 clone。

---

## 五、两条路，先分清

| | 研究引擎 | SkillOpt-Sleep（preview） |
|---|---|---|
| 入口 | `skillopt-train` / `skillopt-eval` | `skillopt-sleep` |
| 干什么 | 在明确 benchmark split 上训 / 评 skill 文档，产出 `best_skill.md` | 复盘你自己的本地 coding agent 会话，把重复任务固化成记忆 / skill |
| 要什么 | 一套 **optimizer + target 的模型 backend 凭据** | 一个 backend + 本地 transcript |
| 产出 | `best_skill.md` | staged proposal，**人工 adopt** |
| 本库适不适合 | 要自己造可验证切分（见 §七） | 边界风险高（见 §九），默认只跑 mock |

### 研究引擎要点

- optimizer 和 target **分开配**（`model.optimizer` / `model.target` + `*_backend`）。target 是"被优化的那个 agent"，optimizer 是"负责改文档的那个"。
- 支持 benchmark：DocVQA、ALFWorld、OfficeQA、SearchQA、LiveMathematicianBench、SpreadsheetBench。
- 加自己的 benchmark：官方说约 100 行。要对上 `env.*` 那套键（`skill_init` / `split_mode` / `split_ratio` / `data_path` / `exec_timeout`）。

### Backend 速查（配哪个认哪个，别全灌）

| backend | optimizer | target | 备注 |
|---|:---:|:---:|---|
| `openai_chat` | ✓ | ✓ | Azure OpenAI；`AZURE_OPENAI_*` |
| `openai_compatible` | ✓ | ✓ | vLLM / Ollama / DeepSeek 一类；`OPENAI_COMPATIBLE_BASE_URL` / `_API_KEY` / `_MODEL` |
| `claude_chat` | ✓ | ✓ | **名字骗人**：它启动已装的 `claude -p` CLI，不是 Anthropic API 客户端 |
| `qwen_chat` | ✓ | ✓ | 兼容 vLLM/SGLang；`thinking_mode` 三态：`server_default`(不送字段) / `enabled` / `disabled`，要可复现就钉死 |
| `minimax_chat` | ✓ | ✓ | 单部署，混搭 backend 时 optimizer 侧选不了别的 MiniMax 模型 |
| `codex_exec` / `claude_code_exec` | ✓ | ✓ | 执行型 |
| `cursor_exec` / `copilot_exec` | — | ✓ | **只能当 target** |

坑：`model.optimizer` / `model.target` 在 backend 初始化**之后**才应用，会**覆盖** `*_MODEL` 环境变量。用 `openai_compatible` 或 Qwen 时两个角色都要显式写死。

---

## 六、超参速查（要动才查，别开场读全表）

| 键 | 默认 | 人话 |
|---|---|---|
| `optimizer.learning_rate` | `4` | 每步最多改几条。**这是编辑预算，不是越大越好** |
| `optimizer.lr_scheduler` | `cosine` | `constant` / `linear` / `cosine` / `autonomous` |
| `optimizer.skill_update_mode` | `patch` | `patch` / `rewrite_from_suggestions` / `full_rewrite_minibatch` |
| `optimizer.use_slow_update` | `true` | epoch 边界做纵向更新 |
| `optimizer.use_meta_skill` | `true` | 跨 epoch 的 optimizer 记忆 |
| `optimizer.use_skill_aware_reflection` | `false` | 区分「skill 文档有缺陷」vs「模型这次执行失手」 |
| `evaluation.use_gate` | `true` | **只在有提升时才接受。默认必须留着** |
| `evaluation.gate_metric` | `hard` | `hard` / `soft` / `mixed` |
| `gradient.failure_only` | `false` | 只从失败反思 |
| `train.num_epochs` | `4` | 轮数 |
| `train.seed` | `42` | 随机种子 |

**不要关 gate。** 官方原话：验证门控把最坏情况兜住，默认开着。关掉等于让"改坏了"直接落地。

---

## 七、SRC 场景怎么造可验证切分（本篇重点）

研究引擎要的是「任务 + 可判分的对错」。SRC 大多数动作（"这个站有没有洞"）没有干净信号，硬套只会得到噪声。**本库真正可判分的是下面这几类**——它们都有现成 ground truth：

| 切分 | 任务（给什么 → 要什么） | Ground truth | 判分 | 价值 |
|---|---|---|---|---|
| **A. 不收清单判定** | 一条发现（标题 + 请求/回包摘要 + 差分）→ **收 / 不收** | `漏洞不收清单.md` | hard，二元 | **最高**。本库最贵的错误就是报假点 |
| **B. 短表路由** | 目标特征（如「附件是带 sign 的下载 URL」）→ 该开哪个模块 | `打穿短表.md` 的「认什么 → 打哪」列 | 模块名精确匹配 | 高。97 行现成标注数据 |
| **C. 报告版式** | 一个 finding → 合规报告 | `vuln-report-format` | rule judge 形状检查 **+ outcome check** | 中 |

**A 怎么造样本**：正样本取 `报告/` 里已确认落盘的；负样本取短表「假点」列 + 历史被否的假点。**必须先脱敏**：真实域名、Cookie、Token、手机号、身份证一律不出本机（见 §九）。

**C 的坑（官方明说）**：`section_present` / `section_contains` 这类**只查形状**，必须配一条结果检查，否则模型学会的是「背格式、不报实质」。`section_present` 保留旧严格行为——ATX 标题后不能追加文字；要放宽用 `section_contains`。

**D. JS 抽接口**（可选）：给 bundle → 抽 endpoint 列表，与已知 endpoint 集合比 recall/precision。真值可从 `temp/` 里历史抽取脚本的输出攒。

> **状态说明（别当已跑通）**：以上切分是**为本库设计**的，本机**没有跑过训练** —— 缺 backend 凭据，且直连 GitHub 坏。第一次真跑前，先在 mock 路径把管线走通（见 §十），再配真 backend。

---

## 八、不装工具也能用的那部分：手搓一轮

**这才是"学会这个功能"的核心**，也是最该被其他 agent 复制的部分。没有 backend、没有 Python 也能做，纪律一模一样：

| 步 | 做什么 | 对应的官方环节 |
|---|---|---|
| 1. Harvest | 从本会话 / `报告/` / `temp/` 挑出**重复出现**的任务，列成清单。**证据源必须包含 `temp/skillopt-cycle-*.md` 里状态≠已采纳的留案**：开工先把它们捞进本轮 §0 台账，逐条标「仍留案 / 已落地 / 撤回」——留案没人捞就是永久沉底（#02 E2/E3 实例） | Rollout |
| 2. Reflect | 对每条写候选编辑，**有界**（≤ `learning_rate` 条，默认 4） | Reflect + Select |
| 3. Gate | 拿一批**没参与写编辑**的 held-out 任务回放，**必须不降分** | Gate |
| 4. Stage | 写成 diff 提案，**不进正文** | staged proposal |
| 5. Adopt | **人工点头**才落地 | adopt |

三条硬纪律：

1. **编辑预算有界。** 一次改一堆等于没门控。默认 ≤4 条，照 `optimizer.learning_rate` 来。
2. **门控不许省。** 没有 held-out 就退回"只提提案、不落地"。
3. **红线段不可编辑。** `SKILL.md` 的安全红线段、`漏洞不收清单.md`、`cors-test.md` / `llm-security-test.md` 的禁开标记，**一律排除在自动编辑范围外**。这是本库特有的补丁——通用的 SkillOpt 没这个概念，它会开心地把"不挖 CORS"优化掉。

第 3 条不是洁癖：自动优化一个 skill 文档，完全可能把「不挖 CORS」「禁开越狱」当成"限制性能的冗余指令"删掉。**本库的红线优先于任何指标提升。**

---

## 九、红线（Sleep / 真实 backend 进本库前必读）

SkillOpt-Sleep 采集本地 transcript 发给模型 provider。它自己的数据边界原文要点：

- 采集**本地只读**；`mock` backend **完全不发网络请求**；`handoff` 也不发。
- **真实 backend 会把截断的会话片段发给 provider**（mining / replay / judging / reflection 四环），官方原话：**出站 prompt 目前不保证无密钥**。
- 有 `redact_secrets`（best-effort，非保证）、`evidence_log` 默认写本地 `evidence.jsonl`（含脱敏后的 prompt/reply，按敏感数据管；`"evidence_log": false` 关）。

**映射到本库红线（10 / 6），所以：**

1. **禁止**在带真实目标凭据（Cookie / Token / AppSecret / 身份证 / 手机号）的会话上跑真实 backend。
2. 要跑先走它推荐的流程：**harvest 到 task 文件 → 人工检查/删改 → 标 `"reviewed": true` → 再回放**。
3. 默认只用 `mock` / `handoff`；`dry-run` 也不是零成本 —— 真实 backend 的 `dry-run` **照样产生 provider 调用和花费**。
4. session / task 上限**不是**调用数、token、时间的硬预算。
5. 本库红线 6：**任何 key 不写进文件、对话、报告。** 配 backend 只写环境变量名，值进 `.env` 且不进版本库。

**Sleep 支持的 source 与 DSH 的关系**：它认 Claude Code / Codex / VS Code Copilot / Cursor / Pi / OpenCode。**DSH 不在列表里** —— 想复盘本工作区会话得自己写 source adapter，别假装能直接用。（DSH 会话在 `DSH_HOME` = `/mnt/c/Users/<USER>\.dsh`，`DSH_SESSION_ID` 在环境里。）

---

## 十、验收纪律

- **先跑零凭据的自检**（装完后；官方给的 deterministic proof，不花 API key）：
  ```powershell
  $env:PYTHONPATH = "<PROJECT_ROOT>\deepseek\tools\skillopt\pylib"
  & py -3.10 -m skillopt_sleep.experiments.run_experiment --persona researcher --assert-improves
  ```
  管线都走不通就别谈训练。
- **gate 必须开**。关掉的结果不能进任何汇报。
- **比 A/B 不能用单跑单元格**。用它自带的 evalkit（McNemar 检验 + bootstrap CI）：
  ```
  python -m skillopt_sleep.evalkit --manifest tasks.json --a cond_a.json --b cond_b.json
  ```
- **差分 <1.5 pt 当噪声。** 单 seed 基线方差 ±1–2 pts。
- **没有可验证信号就不报收益。** 按本库「不报假点」的同一套纪律办。

---

## 十一、和本库其他篇的关系

- **进站打法**：只认 `打穿短表.md` + `dig-scope` §4。本篇不参与进站。
- **收不收 / 边界判定**：只认 `漏洞不收清单.md`。本篇 §七A 是想训一个**辅助判断**，**不能替代**那份清单。
- **报告版式**：只认 `vuln-report-format`。本篇不定义版式。
- **写进知识库的纪律**：短表只认 `hunt-iter`。本条同样适用于手搓一轮的产出——**提案不等于落地**。
- **红线**：`AGENTS.md` 的红线 > 本库任何指标提升、> SkillOpt 的任何优化建议。
