## 功能名稱

`status-skill`

## 需求背景（Why）

- **問題**：Overtone 目前沒有快速查看系統全貌的方式。使用者需要分別查看多個檔案（plugin.json、registry.js、workflow.json、docs/status.md）才能了解系統狀態，效率低且容易遺漏。
- **目標**：提供 `/ot:status` 指令，一次呈現系統快照 — 版本、元件數量、當前 session 進度、測試狀態 — 讓使用者 2 秒內掌握全貌。
- **優先級**：低複雜度高價值的品質改善。不涉及核心邏輯變更，純唯讀操作，風險極低。

## 使用者故事

```
身為 Overtone 使用者
我想要 輸入 /ot:status 就看到系統狀態快照
以便 快速了解版本、元件數量、當前進度、測試結果
```

## 範圍邊界

### 在範圍內（In Scope）

- 建立 `plugins/overtone/skills/status/SKILL.md` — 定義 skill metadata 和執行指引
- Skill 輸出 4 個區塊：系統資訊、元件統計、當前 Session 進度、測試狀態
- 使用既有 API 和工具取得資訊（registry.js、state.js、paths.js、bun test）
- `disable-model-invocation: true`（使用者手動觸發，不由 model 自動觸發）
- 更新 docs/status.md 中的 Skill 數量（30 → 31）

### 不在範圍內（Out of Scope）

- 不建立新的 script（Skill 直接指引 Main Agent 用 Bash 讀取資訊）
- 不修改 registry.js（status 不是 workflow stage，不需要 registry 定義）
- 不修改 hooks.json（不需要新 hook）
- 不修改 plugin.json 的 skills 設定（已用 `"./skills/"` 目錄掃描）
- 不做歷史統計分析（workflow 成功率等 — 留給未來版本）
- 不建立 status 的 CLI script（skill 本身就足夠）

## 資訊來源與取得方式

| 區塊 | 資訊 | 來源 | 取得方式 |
|------|------|------|----------|
| 版本 | Plugin 版本號 | `plugins/overtone/.claude-plugin/plugin.json` | 讀檔 → JSON parse → version 欄位 |
| 元件統計 | Agent/Stage/Workflow 數量 | `plugins/overtone/scripts/lib/registry.js` | Bash 執行 node 腳本 `Object.keys(stages).length` 等 |
| 元件統計 | Hook 數量 | `plugins/overtone/hooks/hooks.json` | 讀檔 → JSON parse → hooks.length |
| 元件統計 | Skill 數量 | `plugins/overtone/skills/*/SKILL.md` | Bash 執行 `ls -d skills/*/SKILL.md | wc -l` |
| Session 狀態 | 當前 session ID | `~/.overtone/.current-session-id` | 讀檔 |
| Session 狀態 | workflow 類型、stage 進度 | `~/.overtone/sessions/{id}/workflow.json` | 讀檔 → JSON parse |
| 測試 | pass/fail 數量、檔案數 | `bun test` 輸出 | Bash 執行 `bun test` 並解析輸出 |

## 輸出格式設計

```
Overtone v{version}

[系統]
  Agent: {n} | Stage: {n} | Workflow: {n} | Hook: {n} | Skill: {n}

[當前 Session]
  ID: {sessionId}
  Workflow: {type}（{label}）
  進度: {STAGE1} done → {STAGE2} active → {STAGE3} pending
  （若無活躍 session 則顯示「無活躍 session」）

[測試]
  bun test: {pass} pass / {fail} fail / {files} files
```

注意事項：
- 輸出不使用 emoji（遵循 CLAUDE.md「回應避免使用 emojis」規則）
- Stage 進度用文字標記：`done`（已完成）、`active`（進行中）、`pending`（待執行）、`fail`（失敗）
- 若 `~/.overtone/.current-session-id` 不存在或 workflow.json 不存在，顯示「無活躍 session」
- `bun test` 若失敗或超時，顯示錯誤訊息而非中斷

## 子任務清單

1. **建立 `plugins/overtone/skills/status/SKILL.md`**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/status/SKILL.md`（新建）
   - 說明：撰寫 skill 定義檔，包含 frontmatter（name, description, disable-model-invocation: true）和執行指引（4 個區塊的取得步驟和格式化輸出）

2. **更新 `docs/status.md` 的 Skill 數量**
   - 負責 agent：developer
   - 相關檔案：`docs/status.md`
   - 說明：Skill 數量從 30 更新為 31

3. **更新 `CLAUDE.md` 的 Skill 數量**（可與 1、2 並行）
   - 負責 agent：developer
   - 相關檔案：`CLAUDE.md`
   - 說明：Skill 數量從 30 更新為 31

## 開放問題

- `bun test` 在 Skill 執行時可能耗時較長（目前 700+ 測試）— architect 需要決定是否設定 timeout，或改為顯示上次已知結果（from docs/status.md）而非即時執行
- 是否需要建立一個輕量的 `scripts/status.js` 腳本來集中收集資訊，還是讓 Skill 引導 Main Agent 分步驟用 Bash 收集（目前方案）— architect 決定
