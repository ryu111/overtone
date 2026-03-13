# A3 — rules/ 條件規則

## 執行策略

| 文件 | 執行策略 |
|------|---------|
| `~/.claude/CLAUDE.md` | 永遠載入 → 全域強制規則 → 精簡、只放每次都需要的 |
| `overtone/CLAUDE.md` | 專案開啟時載入 → 專案特定規則 → 指向全域，不重複 |
| `MEMORY.md` | 永遠載入 → 跨 session 記憶 → 只記狀態，不記知識 |
| `rules/*.md`（無 paths） | session 啟動載入 → 全域補充規則 → CLAUDE.md 溢出時拆分 |
| `rules/*.md`（有 paths） | 讀到匹配檔案才載入 → 條件知識 → subagent 看不到 |
| `SKILL.md` | agent 注入時載入 → 領域知識 → NEVER 是 knowledge delta |

## 執行步驟

**Step 1：先整理（不用 rules/）** ✅ 已完成
- [x] 消除 5 條重複規則 — 每條只保留在一個位置
- [x] MEMORY.md 瘦身（140 行 → 55 行）— 架構知識搬到 skill references 或 docs/
- [x] 確認 CLAUDE.md 行數仍在安全區間（全域 76 行 / 專案 57 行）

**Step 2：試用 InstructionsLoaded hook** ✅ 已完成
- [x] 加偵錯 hook 記錄載入行為
- [x] 建一個無 paths 的 rule 測試基本功能 → ✅ 全域 rules 可用
- [x] 確認 subagent 能否看到全域 rules → ✅ 全域可見、paths 不可見
- [x] 驗證後清理測試檔案

**Step 3：逐步拆分（等 CLAUDE.md 超過 120 行）** ⬜ 待觸發
- [ ] 從 CLAUDE.md 拆出 Hook 開發規則（只在改 hook 時需要）
- [ ] 從 CLAUDE.md 拆出元件閉環（只在新增元件時需要）
- [ ] 保持 paths 條件載入在專案級（避開 #21858）

**不動的**
- SKILL.md 的 NEVER 區塊 — 正確的 knowledge delta，只在 skill 注入時載入
- Skill references 的 checklist — 正確位置，按需載入

> 狀態：✅ 已驗證（v2.1.74, 2026-03-13）

---

## 基本機制

`.claude/rules/` 下的 `.md` 檔案自動載入為指令。每檔一個主題，用描述性檔名。

### 存放位置

| 層級 | 路徑 | 優先順序 |
|------|------|---------|
| 使用者級 | `~/.claude/rules/*.md` | 先載入 |
| 專案級 | `.claude/rules/*.md` | 後載入，優先級較高 |

- 遞迴發現子目錄（`rules/frontend/react.md` 可用）
- 支援 symlink 跨專案共享
- ⚠️ `README.md` 也會被當成 rule 載入（[#26478](https://github.com/anthropics/claude-code/issues/26478)）

### 與 CLAUDE.md 的關係

- 無 `paths` frontmatter → 啟動時載入，效果等同寫在 CLAUDE.md
- 有 `paths` frontmatter → **僅在 Claude 讀取匹配檔案時載入**
- CLAUDE.md > 200 行時建議拆分到 rules/

---

## Frontmatter 格式

**目前只有一個官方欄位：`paths`**

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "hooks/**/*.js"
  - "scripts/lib/*-handler.js"
  - "src/**/*.{ts,tsx}"      # brace expansion
---

## 這裡寫規則內容
```

| 特性 | 說明 |
|------|------|
| 沒有 `paths` | 啟動時全域載入 |
| 有 `paths` | 僅在 Read 工具讀取匹配檔案時載入 |
| Glob 語法 | `**/*.ts`, `*.md`, `src/**/*`, `{ts,tsx}` |
| 載入後 | **不會卸載** — 載入後整個 session 持續有效 |
| Compaction 後 | 從磁碟重讀，完整存活 |

**沒有的欄位**：`description`、`alwaysApply`、`overrides`、`disables`、`remote`、`agents`（全部是 feature request，尚未實作）

---

## 載入行為詳細

| 觸發條件 | 行為 |
|---------|------|
| Session 啟動 | 載入所有**無 paths** 的 rules |
| Claude 使用 Read 工具 | 檢查 paths 匹配，載入匹配的 rules |
| Claude 使用 Write/Edit | ❌ **不觸發載入**（[#23478](https://github.com/anthropics/claude-code/issues/23478)） |
| `--add-dir` 額外目錄 | 預設不載入其 rules，需設定 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` |
| Subagent/Worker | ❌ **看不到 path-specific rules**（[#32906](https://github.com/anthropics/claude-code/issues/32906)） |

**`InstructionsLoaded` Hook**（v2.1.69 新增）：rules 載入時觸發，提供 `file_path`、`memory_type`、`load_reason`。純觀察，無法阻擋。

---

## ⚠️ 已知 Bug（重要）

| Issue | 嚴重度 | 說明 |
|-------|--------|------|
| **[#21858](https://github.com/anthropics/claude-code/issues/21858)** | 🟢 已修復 | ~~使用者級 paths 完全不生效~~ — v2.1.74 實測：✅ 使用者級 paths 條件載入正常運作 |
| **[#32906](https://github.com/anthropics/claude-code/issues/32906)** | 🟡 中 | **Subagent 看不到 path-specific rules** — 實測確認：全域 rules ✅ 可見、paths 條件 rules ❌ 不可見 |
| **[#23478](https://github.com/anthropics/claude-code/issues/23478)** | 🟡 中 | **Write/Edit 不觸發載入** — 建立新檔案時 rule 不會載入 |
| [#26868](https://github.com/anthropics/claude-code/issues/26868) | 🟡 中 | 多個 paths 項目時只有一個生效 |
| [#16299](https://github.com/anthropics/claude-code/issues/16299) | 🟡 中 | paths rules 有時在啟動時全部載入（不該載入的也載入了） |
| [#16853](https://github.com/anthropics/claude-code/issues/16853) | 🟡 中 | 部分使用者報告 paths 載入行為不一致 |
| [#25562](https://github.com/anthropics/claude-code/issues/25562) | 🟢 低 | 使用者級 rules 的 paths 不匹配 `--add-dir` 的檔案 |
| [#26478](https://github.com/anthropics/claude-code/issues/26478) | 🟢 低 | README.md 被當成 rule 載入 |
| [#27993](https://github.com/anthropics/claude-code/issues/27993) | 🟢 低 | Compaction 摘要可能覆蓋 rules 指令 |
| [#13914](https://github.com/anthropics/claude-code/issues/13914) | 🟢 低 | VS Code 擴充中使用者級 rules 不載入 |

### 對 Overtone 的影響

1. **#21858 ✅ 已修復**：使用者級 paths 在 v2.1.74 正常運作，可以在 `~/.claude/rules/` 放 paths 條件規則。
2. **#32906 仍有限制**：v0.30 的 Worker（subagent）看不到 paths 條件 rules，但**全域 rules 可見**。設計策略：全域強制規則用無 paths rules，Worker 專屬知識用 skill 注入。
3. **Write/Edit 不觸發**：建立新檔案時 rule 不載入，實用性打折。

---

## 開發工具

### 現狀：幾乎沒有官方工具

| 需求 | 現狀 |
|------|------|
| 列出已載入 rules | ❌ 無命令。需自建 InstructionsLoaded hook |
| 驗證 frontmatter | ❌ 無工具（glob 語法錯誤不會報錯） |
| 測試 glob 匹配 | ❌ 無法預覽「這個 glob 會 match 哪些檔案」 |
| 偵測 rules 衝突 | ❌ 無工具 |
| 跨工具同步 | `rulesync`（社群） |
| 偵錯載入 | `--debug` + InstructionsLoaded hook |

### InstructionsLoaded Hook — 唯一的偵錯機制

可在 settings.json 加一個 hook 記錄所有 rules 載入事件：

```json
{
  "hooks": {
    "InstructionsLoaded": [{
      "hooks": [{
        "type": "command",
        "command": "jq -r '[.file_path, .memory_type, .load_reason] | @tsv' >> /tmp/claude-rules-loaded.log"
      }]
    }]
  }
}
```

**輸入欄位**：

| 欄位 | 說明 |
|------|------|
| `file_path` | 被載入的檔案絕對路徑 |
| `memory_type` | `User` / `Project` / `Local` / `Managed` |
| `load_reason` | `session_start` / `nested_traversal` / `path_glob_match` / `include` |
| `globs` | paths frontmatter 的 glob patterns（僅 `path_glob_match` 時） |
| `trigger_file_path` | 觸發 lazy load 的檔案路徑 |

### rulesync — 跨工具管理（社群，最成熟）

**[dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync)**：886 ⭐ / 80 forks / v7.18.1（2026-03-10）/ 活躍維護

```bash
npx rulesync init                    # 產生範本
npx rulesync generate                # 從 .rulesync/*.md 產生各工具格式
npx rulesync import --cursor         # 從 Cursor rules 匯入
npx rulesync fetch <github-repo>     # 安裝社群 skills
```

- **22 個工具**：Claude Code / Cursor / Copilot / Gemini CLI / Codex CLI / Cline / Roo Code / Windsurf / Kiro / JetBrains Junie / OpenCode / Warp / Zed 等
- **7 種 feature**：rules / ignore / mcp / commands / subagents / skills / hooks
- **雙向操作**：import（匯入現有設定）+ generate（產出到各工具）
- **評價**：production-usable，解決「同一套規則 → N 個工具格式」的痛點。與 Overtone 不重疊——我們只用 Claude Code，不需跨工具同步。

### ai-rules-sync — Symlink 方案（社群，新興）

**[lbb00/ai-rules-sync](https://github.com/lbb00/ai-rules-sync)**：17 ⭐ / v0.8.1

用 symlink 實現即時同步（編輯一次、所有工具同步更新），支援 10 個工具。比 rulesync 新、社群小，但 symlink 方案在「單一來源」方面有理論優勢。

### `--debug` 旗標

```bash
CLAUDE_DEBUG=1 claude --debug --verbose "query" 2>&1 | tee debug.log
```

不會明確列出 rules，但能看到 hook 觸發和 context 建構過程。

---

## 漸進式採用（L0-L6 成熟度模型）

社群提出的成熟度等級，**不需要一次到位，不同區塊可以同時處於不同等級**：

| 等級 | 名稱 | 特徵 | 我們目前 |
|------|------|------|---------|
| L0 | 缺席 | 沒有指令檔案 | — |
| L1 | 基礎 | CLAUDE.md 存在且版控 | ✅ 已達成 |
| L2 | 有範圍 | 使用 MUST/NEVER 語言 | ✅ 已達成 |
| L3 | 結構化 | 多個模組化檔案 + @import | 🟡 有 skills 但沒用 rules/ |
| L4 | 抽象化 | paths 條件載入 | ❌ 未開始 |
| L5 | 維護 | L4 + 主動治理（審計/清理） | ❌ 未開始 |
| L6 | 自適應 | 動態 skill + MCP 整合 | 🟡 有 skills 但未用 rules/ |

**官方核心建議**：
> "The single most powerful CLAUDE.md technique is progressive disclosure — keeping task-specific knowledge out of CLAUDE.md and loading it only when needed."
>
> CLAUDE.md 最強大的技巧是**漸進式揭露** — 把任務專屬知識從 CLAUDE.md 移出，只在需要時才載入。

### 遷移步驟

1. **審計** — 盤點所有散落的規則（CLAUDE.md / MEMORY.md / SKILL.md）
2. **分類** — 全域必要 / 路徑相關 / 純知識
3. **試建** — 從一個無 paths 的 rule 開始，用 InstructionsLoaded hook 確認載入
4. **逐步拆分** — 每次提取一個主題到獨立 rule 檔案
5. **觀察** — 注意行為是否改善，不相關 context 是否減少

---

## 社群使用模式

### 模式 1：按主題分檔（最常見）

```
.claude/rules/
├── code-style.md
├── testing.md
├── security.md
└── documentation.md
```

### 模式 2：子目錄分類

```
.claude/rules/
├── api/
│   └── api-rules.md
├── frontend/
│   └── component-rules.md
└── general/
    └── architecture.md
```

### 模式 3：Symlink 共享

```bash
ln -sfn ~/dotfiles/claude/rules ~/.claude/rules
```

### 檔名慣例

- 副檔名必須 `.md`、kebab-case、檔名即主題
- **避免** `README.md`（會被當 rule 載入）

---

## rules/ vs CLAUDE.md vs Skills 選擇指南

| 場景 | 建議工具 | 原因 |
|------|---------|------|
| 全域指令（<200 行） | CLAUDE.md | 每次都要、集中管理 |
| 指令超過 200 行 | `rules/`（無 paths） | 拆分減少膨脹 |
| 特定檔案類型的規則 | `rules/` + `paths:` | 條件載入省 context |
| 引用外部文件 | `@import` | 按需深入 |
| 領域知識 + checklist | `skills/` | 按需載入、可帶 references |
| 個人偏好 | `~/.claude/CLAUDE.md` 或 `~/.claude/rules/` | 不入版控 |

---

## 我們的規則散佈現況 🔍 關鍵發現

### 盤點：~218 條規則散佈在 30+ 個檔案

| 位置 | 規則數（估計） | 性質 |
|------|:---:|------|
| `~/.claude/CLAUDE.md` | ~25 條 | 全域強制 |
| `~/projects/overtone/CLAUDE.md` | ~8 條 | 專案特定 |
| 26 個 SKILL.md 的 NEVER 區塊 | ~130 條 | 領域反模式 |
| SKILL.md body 的 MUST 規則 | ~40 條 | 流程性 |
| 多個 MEMORY.md | ~15 條 | 規則偽裝成記憶 |

### 問題 1：規則重複（同一條在 2-3 個位置）

| 規則 | 出現位置 |
|------|---------|
| `updatedInput 是 REPLACE` | CLAUDE.md + MEMORY.md + claude-dev SKILL.md |
| `禁止靜默失敗 / catch 不可空` | CLAUDE.md + craft SKILL.md |
| `元件閉環` | CLAUDE.md + overtone CLAUDE.md + claude-dev SKILL.md |
| `Hook output 雙通道` | MEMORY.md + claude-dev references |
| `BDD 驅動` | CLAUDE.md + testing SKILL.md + auto SKILL.md |

### 問題 2：MEMORY.md 承載非記憶內容

MEMORY.md (~140 行) 中 ~60% 是架構知識和設計決策，不是記憶：
- 「關鍵設計決策」8 條 → 應在 spec 或 skill reference
- 「Workflow 多實例隔離」→ 應在 workflow-core reference
- 「防禦四層架構」→ 應在 claude-dev reference
- 「Bug Patterns」→ 大部分已修復，可刪除

### 問題 3：跨專案 MEMORY.md 也藏規則

- Vibe Engine MEMORY.md：版號對齊 + 快取清除（硬規則寫在記憶裡）
- NovaPlay MEMORY.md：「禁止修改 `~/.claude/`」（規則寫在記憶裡）

---

## Overtone 採用策略 🔍 待確認

### 結論：分三步走

**Step 1：先整理（不用 rules/）**
- 消除 5 條重複規則 — 每條只保留在一個位置
- MEMORY.md 瘦身 — 架構知識搬到 skill references 或 docs/
- 確認 CLAUDE.md 行數仍在安全區間

**Step 2：試用 InstructionsLoaded hook**
- 加偵錯 hook 記錄載入行為
- 建一個無 paths 的 rule 測試基本功能
- 確認 subagent 能否看到全域 rules

**Step 3：逐步拆分（等 CLAUDE.md 超過 120 行）**
- 從 CLAUDE.md 拆出 Hook 開發規則（只在改 hook 時需要）
- 從 CLAUDE.md 拆出元件閉環（只在新增元件時需要）
- 保持 paths 條件載入在專案級（避開 #21858）

### 不動的

- SKILL.md 的 NEVER 區塊 — 正確的 knowledge delta，只在 skill 注入時載入
- Skill references 的 checklist — 正確位置，按需載入

---

## 驗證結果（v2.1.74, 2026-03-13）✅ 全部完成

### 實測環境

```
~/.claude/rules/
├── test-global.md           # 無 paths 全域規則
├── test-conditional.md      # paths: tests/**/*.test.js, docs/**/*.md
└── test-instructions-loaded-hook.sh  # InstructionsLoaded hook → /tmp/claude-rules-loaded.log
```

### 完整結果

| 項目 | Main Agent | Subagent | Hook 觸發 | 說明 |
|------|:---------:|:--------:|:---------:|------|
| `~/.claude/CLAUDE.md` | ✅ | ✅ | ✅ `User/session_start` | 全域 CLAUDE.md 正常 |
| `overtone/CLAUDE.md` | ✅ | ✅ | ✅ `Project/session_start` | 專案 CLAUDE.md 正常 |
| `test-global.md`（無 paths） | ✅ | ✅ | ✅ `User/session_start` | **全域 rules 完全可用** |
| `test-conditional.md`（有 paths） | ✅ | ❌ | ❌ 未觸發 | **載入但走不同管道** |
| Mid-session 新增 rules | ❌ | — | — | 設計行為，非 bug |

### 關鍵發現

1. **#21858 ✅ 已修復**：使用者級 paths 條件規則在 v2.1.74 正常載入到主 agent context
2. **#32906 部分確認**：subagent 看得到**全域 rules**（無 paths），看不到**條件 rules**（有 paths）
3. **Hook 雙管道**：InstructionsLoaded hook 只在 session_start 觸發全域載入，paths 條件載入走另一條路徑（不觸發 hook、不傳遞給 subagent）
4. **Mid-session 不生效**：rules 只在 session 啟動時載入（設計行為）

### 結論與策略

- **全域 rules 完全可用**：無 paths 的 `~/.claude/rules/*.md` 可放心使用，subagent 也看得到
- **paths 條件 rules 有限可用**：主 agent 可用但 subagent 看不到，適合「只有主 agent 需要」的規則
- **InstructionsLoaded hook 有盲點**：只記錄全域載入，無法偵測 paths 條件載入
- **建議**：強制性規則用全域 rules，知識性內容用 skills（subagent 友善）

### 社群工具評估

| 工具 | 成熟度 | 我們需要嗎 |
|------|:------:|:--------:|
| rulesync (886⭐) | 🟢 production | ❌ 只用 Claude Code，不需跨工具同步 |
| ai-rules-sync (17⭐) | 🟡 新興 | ❌ 同上 |
| InstructionsLoaded hook | 🟢 可用 | ✅ 唯一偵錯管道（但有盲點） |

> ⚠️ 測試檔案（test-global.md / test-conditional.md / test-instructions-loaded-hook.sh）驗證完成後應清理
