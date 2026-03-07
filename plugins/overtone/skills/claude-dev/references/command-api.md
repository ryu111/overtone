# Command API 參考

> Overtone Plugin 的 Claude Code Command 開發完整指南

## 1. Command 結構概覽

Command 是 Markdown 格式的指令檔，當使用者輸入 `/ot:name` 時，檔案內容直接成為 Claude 的執行指令。

**重要原則**：Command 是寫給 Claude 執行的指示，不是寫給使用者看的說明。

```
plugins/overtone/commands/
├── standard.md      # /ot:standard — 標準工作流
├── quick.md         # /ot:quick — 快速工作流
├── dev.md           # /ot:dev — 單步開發
├── review.md        # /ot:review — 純審查
└── ...              # 其他 command
```

### 基本格式

```markdown
---
name: my-command
description: 簡短說明（60 字以內）
---

# My Command 標題

指令內文 — 告訴 Claude 該做什麼。
```

無 frontmatter 的最簡 command：

```markdown
審查這段程式碼的安全性問題，包含 SQL injection 和 XSS。
提供具體行號和嚴重程度。
```

---

## 2. Command Frontmatter 欄位

### `name`（必填）

Command 的識別名稱，對應 `/ot:name` 中的 `name` 部分。

```yaml
name: standard
```

- 使用 kebab-case（如 `build-fix`、`db-review`）
- Plugin command 會自動加上 plugin 前綴，呼叫時為 `/ot:name`

### `description`（必填）

顯示在 `/help` 列表中的簡短說明。

```yaml
description: 標準功能開發工作流。PLAN → ARCH → TEST:spec → DEV → REVIEW。
```

最佳實踐：
- 60 字以內，描述 command 做什麼
- 包含工作流順序（如果適用）
- 說明適用場景

### `allowed-tools`（可選）

限制此 command 可使用的工具，不指定則繼承對話設定。

```yaml
allowed-tools: Read, Bash(git:*)
```

常見模式：

| 模式 | 用途 |
|------|------|
| `Read, Grep` | 唯讀分析 command |
| `Bash(git:*)` | 只允許 git 操作 |
| `Bash(bun:*)` | 只允許 bun 操作 |
| `Read, Write, Edit` | 標準程式碼修改 |

### `model`（可選）

指定執行此 command 的 model，不指定則繼承對話設定。

```yaml
model: haiku
```

選擇指引：
- `haiku`：快速、簡單的查詢或格式化
- `sonnet`：標準開發工作流（多數情況）
- `opus`：複雜分析、架構決策

### `argument-hint`（可選）

參數提示文字，顯示在自動補全和 `/help` 中。

```yaml
argument-hint: [featureName] [options]
```

### `disable-model-invocation`（可選）

設為 `true` 時，防止 SlashCommand tool 程式化呼叫此 command（只能手動觸發）。

```yaml
disable-model-invocation: true
```

適用場景：危險操作、需要確認的 command。

---

## 3. 正文語法

### `$ARGUMENTS` — 完整參數字串

捕捉使用者輸入的所有參數作為單一字串。

```markdown
---
description: 修復指定的 issue
argument-hint: [issue-number]
---

修復 issue #$ARGUMENTS，遵循專案 coding 規範。
```

呼叫：`/ot:fix-issue 123` → 展開為 `修復 issue #123，遵循專案 coding 規範。`

### `$1`, `$2`, `$N` — 位置參數

按空白分割的個別參數。

```markdown
---
argument-hint: [env] [version]
---

部署 $2 版本到 $1 環境。
```

呼叫：`/deploy staging v1.2.3` → 展開為 `部署 v1.2.3 版本到 staging 環境。`

### `@file` — 引用檔案內容

在 command 執行前載入指定檔案的內容。

```markdown
# 靜態引用（已知路徑）
審查 @package.json 和 @tsconfig.json 的設定一致性。

# 動態引用（來自參數）
審查 @$1 中的安全問題。

# 引用 plugin 資源
@~/.claude/skills/testing/references/bdd-spec-guide.md
```

### `!bash` — 執行 bash 並插入結果

在反引號前加 `!` 執行 bash 命令，結果插入 prompt。

```markdown
# 插入 git diff
變更檔案：!`git diff --name-only`

# 插入 bun test 輸出
測試結果：!`bun test 2>&1 | tail -20`

# 執行 plugin 腳本
!`bun ~/.claude/scripts/init-workflow.js quick ${CLAUDE_SESSION_ID} {featureName}`
```

注意：需在 `allowed-tools` 中包含 `Bash`，bash 才能執行。

### 全域路徑 `~/.claude/` — Plugin 根目錄

Plugin 已遷移至全域位置 `~/.claude/`。路徑使用全域絕對路徑或相對路徑，不使用 `${CLAUDE_PLUGIN_ROOT}` 變數。

```markdown
# 引用 skill reference
💡 讀取 `~/.claude/skills/workflow-core/references/failure-handling.md`

# 執行 plugin 腳本
!`bun ~/.claude/scripts/health-check.js`

# 引用 plugin 範本
~/.claude/templates/handoff.md
```

> 歷史說明：舊格式使用 `${CLAUDE_PLUGIN_ROOT}` 作為路徑前綴，已全面替換為全域路徑 `~/.claude/`。

### `${CLAUDE_SESSION_ID}` — 當前 Session ID

展開為目前 Claude Code session 的唯一識別碼，用於 workflow 初始化。

```markdown
!`bun ~/.claude/scripts/init-workflow.js standard ${CLAUDE_SESSION_ID} {featureName}`
```

---

## 4. Overtone Command 分類

Overtone 有 27 個 command，分為三大類：

### Workflow Pipeline Commands（7 個）

啟動完整的多 agent 工作流，通常包含 PLAN → ... → DOCS 的完整流程。

| Command | 工作流 | 適用場景 |
|---------|--------|----------|
| `standard` | PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → RETRO → DOCS | 中型新功能 |
| `quick` | DEV → REVIEW → RETRO | 小 bug 修復、簡單功能 |
| `full` | PLAN → ARCH → DESIGN → TEST:spec → DEV → [REVIEW + TEST:verify] → [QA + E2E] → RETRO → DOCS | 大型功能 |
| `tdd` | TEST:spec → DEV → TEST:verify | 測試驅動開發 |
| `secure` | PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify + SECURITY] → RETRO → DOCS | 安全敏感功能 |
| `debug` | DEBUG → DEV → TEST | 除錯修復 |
| `refactor` | ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] | 程式碼重構 |

**命名慣例**：使用完整動詞或形容詞描述工作流性質（`standard`、`quick`、`secure`）。

### Stage Shortcut Commands（10 個）

直接委派單一 agent 執行特定 stage。

| Command | 委派 Agent | 用途 |
|---------|-----------|------|
| `dev` | developer | 單步開發 |
| `review` | code-reviewer | 純程式碼審查 |
| `test` | tester | BDD spec 撰寫或測試驗證 |
| `diagnose` | debugger | 單步除錯診斷 |
| `build-fix` | developer | CI/build 失敗快速修復 |
| `clean` | developer | 程式碼清理 |
| `security` | security-reviewer | 安全審查 |
| `db-review` | database-reviewer | 資料庫設計審查 |
| `e2e` | tester（e2e mode） | E2E 測試 |
| `qa` | qa（quality assurance） | 品質確保 |

**命名慣例**：使用動詞（`review`、`diagnose`）或名詞（`security`、`qa`）。

### Utility Commands（10 個）

工具型 command，執行特定操作或提供功能。

| Command | 用途 |
|---------|------|
| `audit` | 系統健康檢查（執行 health-check.js） |
| `doc-sync` | 文件同步（docs/status.md 數字修正） |
| `status` | 顯示目前 workflow 狀態 |
| `stop` | 停止 loop |
| `dashboard` | 啟動監控面板 |
| `remote` | 遠端控制設定 |
| `plan` | 單步規劃（planner agent） |
| `architect` | 單步架構設計 |
| `design` | UI/UX 設計 |
| `mul-agent` | 多 agent 並行委派工具 |

---

## 5. Workflow Command 結構

Workflow command 遵循固定的結構模式：

### 基本結構

```markdown
---
name: my-workflow
description: 工作流說明。STAGE1 → STAGE2 → STAGE3。適用場景。
---

# 工作流名稱

## 初始化

使用 Bash 執行：
\`\`\`bash
bun ~/.claude/scripts/init-workflow.js {workflowType} ${CLAUDE_SESSION_ID} {featureName}
\`\`\`
# {featureName} 必須是 kebab-case（如 add-user-auth）

## 進度追蹤

初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| STAGE1 | [STAGE1] 標題 | 進行中動詞 |
| STAGE2 | [STAGE2] 標題 | 進行中動詞 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

## Stages

### 1. STAGE1 — emoji 名稱

委派 `{agent-name}` agent。

- **輸入**：使用者需求
- **產出**：Handoff（...）

### 2. STAGE2 — emoji 名稱

委派 `{agent-name}` agent。

- **輸入**：前一 stage 的 Handoff
- **產出**：結果說明

## 失敗處理

💡 完整流程與 retry 邏輯：讀取 `~/.claude/skills/workflow-core/references/failure-handling.md`

## 完成條件

- ✅ 條件一
- ✅ 條件二
```

### `init-workflow.js` 初始化

每個 workflow command 都以 `init-workflow.js` 開始，初始化 `~/.overtone/sessions/{sessionId}/workflow.json`。

```bash
bun ~/.claude/scripts/init-workflow.js {workflowType} ${CLAUDE_SESSION_ID} [{featureName}]
```

支援的 workflowType：`single` / `quick` / `standard` / `full` / `tdd` / `debug` / `refactor` / `secure` / 其他自訂類型。

### 進度追蹤（TaskCreate）

```markdown
初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| DEV | [DEV] 開發 | 開發中 |
| REVIEW | [REVIEW] 審查 | 審查中 |
```

規則：
- `subject` 格式：`[STAGE] 中文標題`
- `activeForm` 格式：中文現在進行式（「開發中」、「審查中」）
- 委派前 → `TaskUpdate status: in_progress`；完成後 → `TaskUpdate status: completed`

### Stage 定義模式

```markdown
### N. STAGE — emoji 名稱

委派 `{agent-name}` agent。

- **輸入**：...
- **產出**：...
- 📋 MUST 特殊規則
- 💡 可選最佳實踐
```

### 並行委派規則

相互獨立的 stage 可以在同一訊息中並行委派（如 REVIEW + TEST:verify）：

```markdown
### 5-6. [REVIEW + TEST:verify] — 並行

📋 MUST 在同一訊息中同時委派：

- `code-reviewer` agent（REVIEW）
- `tester` agent，mode: verify（TEST:verify）
```

判斷是否可並行：
1. 操作不同檔案（無寫入衝突）
2. 無邏輯依賴（B 不需要 A 的輸出）
3. 規範明確（輸入都已確定）

若以上三條件都成立 → 同一訊息發多個 Agent tool call。

### 失敗處理模式

```markdown
## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。
REVIEW REJECT → developer 帶原因修復 → code-reviewer 再審（上限 3 次）。

💡 完整流程與 retry 邏輯：讀取 `~/.claude/skills/workflow-core/references/failure-handling.md`
```

### 完成條件

```markdown
## 完成條件

- ✅ 所有 N 個 stage 完成
- ✅ lint 0 error + test 0 fail + code-review PASS
```

---

## 6. `manage-component.js` 用法

### Command 的編輯保護

Commands（`commands/*.md`）**不受** pre-edit-guard 保護，可以直接使用 Write/Edit 工具修改。

受 pre-edit-guard 保護的檔案（必須透過 `manage-component.js`）：
- `agents/*.md`
- `hooks.json`
- `skills/*/SKILL.md`
- `registry-data.json`
- `plugin.json`

### 新增 Command

直接建立 `.md` 檔案即可（commands 不受 pre-edit-guard 保護，可直接 Write/Edit）：

```bash
# 在 plugins/overtone/commands/ 下新增 my-command.md
# 注意：manage-component.js 不支援 command 類型（僅支援 agent/hook/skill）
# 新增後記得 bump plugin 版本
bun ~/.claude/scripts/manage-component.js bump-version
```

### 更新 Command

```bash
# 直接編輯（推薦，因為 commands/*.md 無保護）
# 使用 Edit 工具修改 plugins/overtone/commands/my-command.md

# 更新 plugin 版本（修改後記得 bump）
bun ~/.claude/scripts/manage-component.js bump-version
```

### 驗證 Command 格式

```bash
bun ~/.claude/scripts/validate-agents.js
```

此腳本會驗證所有 27 個 command 的 frontmatter 格式是否正確。

---

## 7. 快速參考：Command 範本

### Workflow Pipeline 範本

```markdown
---
name: my-workflow
description: 工作流說明。STAGE1 → STAGE2。適用場景。
---

# 工作流名稱

## 初始化

使用 Bash 執行：
\`\`\`bash
bun ~/.claude/scripts/init-workflow.js my-workflow ${CLAUDE_SESSION_ID} {featureName}
\`\`\`

## 進度追蹤

| Stage | subject | activeForm |
|-------|---------|------------|
| DEV | [DEV] 開發 | 開發中 |
| REVIEW | [REVIEW] 審查 | 審查中 |

## Stages

### 1. DEV — 💻 開發

委派 `developer` agent。

### 2. REVIEW — 🔍 審查

委派 `code-reviewer` agent。

## 完成條件

- ✅ REVIEW PASS
```

### Stage Shortcut 範本

```markdown
---
name: my-stage
description: 單步 {stage} 工作流。只委派 {agent} agent 完成 {任務}。
---

# 單步 Stage 名稱

## 初始化

使用 Bash 執行：
\`\`\`bash
bun ~/.claude/scripts/init-workflow.js {type} ${CLAUDE_SESSION_ID}
\`\`\`

## Stages

### 1. STAGE — emoji 名稱

委派 `{agent-name}` agent。

- **輸入**：使用者需求
- **產出**：Handoff（...）

## 完成條件

- ✅ {agent} 完成工作
```

### Utility Command 範本（執行腳本）

```markdown
---
name: my-utility
description: 工具說明。執行 XXX 分析並回報結果。
disable-model-invocation: true
---

# /ot:my-utility — 工具標題

## 執行步驟

### Step 1：執行腳本

用 Bash 執行：

\`\`\`bash
bun ~/.claude/scripts/my-script.js
\`\`\`

收集 stdout 輸出和 exit code。

### Step 2：解析並回報結果

根據輸出內容格式化回報。
```

---

## 8. 除錯與常見問題

**Command 未出現在 `/help`**
- 確認檔案在 `commands/` 目錄下
- 確認副檔名為 `.md`
- 確認 frontmatter 有 `name` 和 `description`
- 重啟 Claude Code

**`$ARGUMENTS` 或 `$1` 未展開**
- 確認語法正確（`$1` 不是 `${1}`）
- 確認 frontmatter 的 `argument-hint` 與用法一致

**`!bash` 執行失敗**
- 確認 `allowed-tools` 包含 `Bash`
- 在 terminal 直接測試指令
- 確認 `~/.claude/` 路徑是否正確

**`@file` 引用失敗**
- 確認 `allowed-tools` 包含 `Read`
- 確認檔案路徑正確（相對路徑從專案根目錄算起）
- Plugin 檔案使用 `~/.claude/...` 全域路徑
