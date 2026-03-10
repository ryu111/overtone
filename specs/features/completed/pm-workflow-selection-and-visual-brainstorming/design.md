---
feature: pm-workflow-selection-and-visual-brainstorming
stage: ARCH
created: 2026-03-10
---

# 技術設計：PM Workflow 選擇指引 + Visual Brainstorming

## 方案選擇

### 核心決策

**純知識注入（無程式碼）**：兩個需求的本質都是「PM/architect 缺少決策知識」，不是系統缺少新功能。解法是在 reference 檔案注入知識，不引入新的腳本或 API。

選擇理由：
- 引入新 script 或 API 需要測試、部署、維護成本，但問題可用知識解決
- Skill reference 是 Overtone 的知識注入機制，已有 10+ 個 reference 成功案例
- 完全符合「最簡單能滿足需求的方案」原則

**拒絕的替代方案**：
- 「程式化自動判斷 workflow」— 語意判斷不適合程式化（決策分配原則：語意模糊 → AI）
- 「修改 workflow 執行邏輯強制選擇」— 限制 PM 彈性，且不解決根因（缺乏判斷知識）
- 「HTML server / WebSocket」— 對 Chrome MCP 功能嚴重過度設計

### 元件閉環確認

```
workflow-selection-guide.md（knowledge）
  → pm/SKILL.md 資源索引（registration）
  → product-manager.md DO 區塊（consumption rule）

visual-brainstorming.md（knowledge）
  → thinking/SKILL.md 資源索引（registration）
  → product-manager.md skills frontmatter 加 thinking（agent consumption）
  → architect.md 已有 thinking（確認：無需修改）
```

## 介面定義

### 1. workflow-selection-guide.md 結構

```
# Workflow 選擇指引

## 快速判斷矩陣（Decision Matrix）

| 信號 | → workflow |
|------|-----------|
| ... | ... |

## 複雜度判斷準則

### Quick（輕量修改）
觸發信號：[列舉]
禁用信號（不得選 quick）：[列舉]

### Standard（標準功能）
觸發信號：[列舉]

### Full（完整功能）
觸發信號：[列舉]

### Single（單點修改）
觸發信號：[列舉]

## 邊界案例（Boundary Cases）

[每個模糊情境 → 判斷理由 + 結論]

## 具體範例

[5-8 個真實範例，含 workflow 選擇理由]

## 多次迭代佇列規則

[多個子任務時如何分別選擇 workflow]

## NEVER

- NEVER 因為「改動不多」就選 quick（判斷依據是複雜度，不是程式碼行數）
- NEVER 在有新 API/狀態管理/跨模組依賴時選 quick
```

### 2. visual-brainstorming.md 結構

```
# Visual Brainstorming 指引

## 觸發時機（何時用視覺化）

決策樹：[...條件...]

## HTML 元件模板

### Cards（方案比較）
[完整 HTML + CSS 片段]

### Mockup（UI 線框）
[完整 HTML + CSS 片段]

### Pros-Cons（優缺點對比）
[完整 HTML + CSS 片段]

### Split（並排對比）
[完整 HTML + CSS 片段]

## Chrome MCP 整合流程

[寫 HTML 到 /tmp/overtone-viz-{feature}.html → navigate → 驗證]

## Main Agent 協助展示模式

[subagent 無 Chrome MCP 時的替代流程]

## 輸出路徑慣例

/tmp/overtone-viz-{feature}.html

## NEVER

- NEVER 強制使用視覺化（保持可選）
- NEVER 為視覺化啟動 HTTP server
```

### 3. product-manager.md 修改介面

**修改位置一（DO 區塊）** — T3：
```diff
+ - 📋 規劃佇列 workflow 時 MUST 依據 workflow-selection-guide.md 的複雜度矩陣判斷（涉及新 API/狀態管理/跨模組 → standard，多子系統/UI → full，不可因「改動少」就選 quick）
```
插入位置：在 DO 區塊中「所有提問 MUST 使用 AskUserQuestion 工具」行之前。

**修改位置二（frontmatter skills）** — T6：
```diff
skills:
  - wording
+ - thinking
```

### 4. pm/SKILL.md 修改介面

**修改位置（Workflow 建議矩陣後）** — T2：
在 `### Workflow 建議矩陣` 表格後新增引用行：
```markdown
> 詳細複雜度判斷準則與邊界案例：`./references/workflow-selection-guide.md`
```

### 5. thinking/SKILL.md 修改介面

**修改位置（資源索引表格）** — T5：
在資源索引表格新增一行：
```markdown
| `./references/visual-brainstorming.md` | 視覺化伴侶：HTML 元件模板、Chrome MCP 整合、觸發時機決策樹 |
```

## 資料模型

無新資料模型。兩個 reference 檔案都是純 Markdown 知識文件，無需 schema 或持久化狀態。

## 檔案結構

### 新增檔案

| 路徑 | 類型 | 說明 |
|------|------|------|
| `~/.claude/skills/pm/references/workflow-selection-guide.md` | Markdown | PM workflow 複雜度判斷矩陣 + 範例 |
| `~/.claude/skills/thinking/references/visual-brainstorming.md` | Markdown | 視覺化伴侶：HTML 模板 + Chrome MCP 流程 |

### 修改檔案

| 路徑 | 修改類型 | 說明 |
|------|---------|------|
| `~/.claude/skills/pm/SKILL.md` | 追加引用行 | Workflow 建議矩陣下方加 reference 連結 |
| `~/.claude/agents/product-manager.md` | 兩處修改（序列） | DO 區塊加規則 + frontmatter skills 加 thinking |
| `~/.claude/skills/thinking/SKILL.md` | 追加表格行 | 資源索引加 visual-brainstorming.md |

### 確認不修改

| 路徑 | 理由 |
|------|------|
| `~/.claude/agents/architect.md` | 已有 thinking skill，T4 完成後自動消費 visual-brainstorming.md，無需額外修改 |

## 狀態同步策略

本功能為純文件修改，無需狀態同步。Skill reference 被 agent 消費的機制（skills frontmatter → Claude Code 注入 SKILL.md → agent 依需讀取 references/）是現有架構，無新增同步需求。

## Chrome MCP 可用性決策

**問題**：PM/architect 是 subagent，disallowedTools 可能排除 `mcp__claude-in-chrome__*`。

**設計決策**：`visual-brainstorming.md` 採用「雙路徑」說明：
1. **直接路徑**（agent 有 Chrome MCP 權限時）：agent 自行寫 HTML + navigate 展示
2. **Main Agent 協助展示模式**（agent 無 Chrome MCP 時）：agent 輸出 HTML 路徑，由 Main Agent 執行 navigate

這讓知識在兩種環境下都可用，不依賴 subagent 權限假設。

## Dev Phases

### Phase 1: 新增 reference 檔案 (parallel)
- [ ] 撰寫 workflow-selection-guide.md（複雜度矩陣 + 邊界案例 + 範例） | files: ~/.claude/skills/pm/references/workflow-selection-guide.md
- [ ] 撰寫 visual-brainstorming.md（HTML 模板 + Chrome MCP 流程 + 觸發決策樹） | files: ~/.claude/skills/thinking/references/visual-brainstorming.md

### Phase 2: 更新 SKILL.md 索引 (parallel)
- [ ] 更新 pm/SKILL.md — Workflow 建議矩陣下加引用行 | files: ~/.claude/skills/pm/SKILL.md
- [ ] 更新 thinking/SKILL.md — 資源索引表格加 visual-brainstorming.md 行 | files: ~/.claude/skills/thinking/SKILL.md

### Phase 3: 更新 product-manager.md (sequential)
- [ ] 更新 product-manager.md DO 區塊 — 加 workflow 複雜度選擇規則 | files: ~/.claude/agents/product-manager.md
- [ ] 更新 product-manager.md frontmatter skills — 加 thinking | files: ~/.claude/agents/product-manager.md
