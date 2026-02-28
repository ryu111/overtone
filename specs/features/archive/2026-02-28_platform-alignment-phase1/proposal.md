# Proposal: platform-alignment-phase1

## 功能名稱

`platform-alignment-phase1`

## 需求背景（Why）

- **問題**：Overtone v0.19.1 的 17 個 agent 只使用基礎 frontmatter 欄位（name/description/model/tools/color/maxTurns/permissionMode），7 個 hook 全部使用 command 類型。Claude Code 平台提供 13 項高價值未用能力，其中 5 項可立即遷移、零風險、不改變現有行為。
- **目標**：充分利用平台原生能力，減少 hook 負擔、減少 agent 浪費的 turns、增加監控覆蓋率。
- **優先級**：Phase 1 專注於「安全遷移」— 每項改動都不改變既有行為，只是用更好的平台機制來達成。

## 使用者故事

```
身為 Overtone 使用者
我想要 agent 自動獲得工作所需的 context 和正確的工具權限
以便 pipeline 執行更快、更準確，且我能在 session 結束和工具失敗時得到通知
```

## 範圍邊界

### 在範圍內（In Scope）

1. **1a. disallowedTools 遷移** — 唯讀 agent 改用黑名單取代白名單
2. **1b. Agent skills 預載** — agent frontmatter 加 skills 欄位預載 reference content
3. **1c. PreToolUse updatedInput 注入** — pre-task.js 自動注入 workflow context 到 Task prompt
4. **1d. SessionEnd hook** — 新增第 8 個 hook 處理 session 結束清理
5. **1e. PostToolUseFailure hook** — 新增第 9 個 hook 收集 tool 失敗資訊

### 不在範圍內（Out of Scope）

- Agent memory（跨 session 知識累積 — 需要更多設計）
- Agent isolation: worktree（並行 dev 前提 — Phase 3）
- Skill context: fork（需評估 context 隔離效果）
- prompt/agent hook 類型（需先有品質門檻設計）
- opusplan 混合模式、EFFORT_LEVEL、sonnet[1m]（model 相關優化）
- TaskCompleted hook（需品質門檻自動化設計）

## 子任務清單

### 1a. disallowedTools 遷移

**現況盤點**：

| Agent | 目前 tools 白名單 | 建議改法 |
|-------|-------------------|----------|
| code-reviewer | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]` |
| architect | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]`（注意：architect 寫 specs，需保留 Write） |
| planner | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]`（注意：planner 寫 proposal.md，需保留 Write） |
| security-reviewer | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]` |
| debugger | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]` |
| database-reviewer | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]` |
| retrospective | `[Read, Grep, Glob, Bash]` | 改 `disallowedTools: [Write, Edit, Task, NotebookEdit]` |
| product-manager | `[Read, Grep, Glob, Bash, Write, Edit]` | 已有 Write/Edit，改 `disallowedTools: [Task, NotebookEdit]` |
| qa | `[Read, Grep, Glob, Bash]` | 需保留 Write（寫 qa-handoff.md），改 `disallowedTools: [Edit, Task, NotebookEdit]` |
| grader | `[Read, Bash]` | 改 `disallowedTools: [Write, Edit, Grep, Glob, Task, NotebookEdit]`（只需 Read + Bash） |
| designer | `[Read, Write, Grep, Glob, Bash]` | 改 `disallowedTools: [Task, NotebookEdit]`（需 Write 寫設計文件） |

**需要注意**：

- architect 在 agent prompt 中說「不可撰寫實作程式碼（只寫 interface/type 定義）」但需要寫 `design.md` 和 `tasks.md`（specs 系統），所以需要 Write
- planner 需要寫 `proposal.md`，需要 Write
- qa 需要寫 `qa-handoff.md`，需要 Write
- 無 tools 白名單的 agent（developer, tester, e2e-runner, build-error-resolver, refactor-cleaner, doc-updater）不需變動，它們本來就可用全部工具

**執行項**：
1. 修改 11 個 agent .md 的 frontmatter（移除 tools，加入 disallowedTools）
2. 更新相關文件

### 1b. Agent skills 預載

**分析**：每個 agent 在執行時常需讀取特定 reference 文件，浪費 1-2 turns。用 `skills` frontmatter 欄位，平台會自動將 skill 的 SKILL.md 內容注入 agent context。

**需要新建的 reference skill**（專為 agent 預載設計，不在 `/` 選單出現）：

| 新 Skill 名稱 | 內容來源 | 預載給哪些 agent |
|---------------|---------|-----------------|
| `ref-handoff-protocol` | Handoff 格式規範（Context/Findings/Files Modified/Open Questions） | 所有 pipeline agent（16 個，除 grader） |
| `ref-bdd-guide` | BDD spec 撰寫/對照指引 | tester, qa, developer |
| `ref-failure-handling` | FAIL/REJECT 處理流程 | developer, tester, code-reviewer |
| `ref-wording-guide` | 措詞正確性指南 | code-reviewer, doc-updater |

**注意**：
- 新 skill 用 `disable-model-invocation: true` + `user-invocable: false` 使其只做 agent 預載，不出現在 `/` 選單也不被 Claude 自動觸發
- 內容精簡（每個 skill 控制在 ~200-400 token），避免 agent context 膨脹
- 手動定義（非自動觸發），既有 agent 保持完整的 Handoff 格式定義在各自的 .md 中

**執行項**：
1. 建立 4 個 reference skill（每個一個 `skills/{name}/SKILL.md`）
2. 修改需要預載的 agent .md 加入 `skills` frontmatter 欄位

### 1c. PreToolUse updatedInput 注入

**現況**：`pre-task.js` 目前做的事：
- 識別目標 agent（subagent_type 確定性映射 + regex fallback）
- 檢查是否跳過必要前置階段（deny 攔截）
- 記錄 agent 委派（state 更新 + timeline emit）
- **不做**：不修改 Task 的 tool_input

**平台能力**：PreToolUse hook 可以輸出 `updatedInput` 修改 tool 參數。對 Task 工具，可修改 `prompt` 欄位注入額外 context。

**注入內容設計**：
- 當前 workflow 狀態摘要（workflowType、currentStage、進度條）
- featureName 和 specs 路徑（若有）
- 前面階段的 Handoff 關鍵資訊（從 workflow.json 的 stage results 讀取）

**執行項**：
1. 在 pre-task.js 的「通過」分支（目前只做 state 更新的那段），加入 updatedInput 組裝邏輯
2. 將現有的空 `{ result: '' }` 輸出改為 `{ hookSpecificOutput: { ..., updatedInput: { prompt: 原始prompt + 注入context } } }`
3. 在 hook-utils.js 新增 `buildWorkflowContext(sessionId, projectRoot)` 共用函式

### 1d. SessionEnd hook

**現況**：session 結束時無任何清理。Dashboard 不知道 session 已結束（SSE 斷開但無明確事件）。loop.json 可能殘留。

**SessionEnd stdin**：
```json
{ "reason": "clear|logout|prompt_input_exit|bypass_permissions_disabled|other" }
```
SessionEnd 是非阻擋 event（無決策控制），只能做清理和記錄。

**清理項目**：
1. emit `session:end` timeline 事件（已有 event type 定義在 registry.js）
2. 重置 loop.json（`stopped: true`，防止殘留）
3. Dashboard SSE 通知（透過 timeline emit，SSE file watcher 自動推送）
4. 清理 `.overtone/.current-session-id`（防止下次 session 讀到舊 ID）

**執行項**：
1. 建立 `hooks/scripts/session/on-session-end.js`（第 8 個 hook）
2. 在 hooks.json 新增 SessionEnd 事件綁定
3. 更新 registry.js 的 `session:end` event（已存在，確認 label/category 正確）

### 1e. PostToolUseFailure hook

**現況**：tool 失敗時無監控。PostToolUse(post-use.js) 只處理成功的 tool 結果。

**PostToolUseFailure stdin**：
```json
{ "tool_name": "Bash", "tool_input": {...}, "error": "...", "is_interrupt": false }
```
非阻擋 event，只能觀察記錄。

**值得關注的 tool 失敗**：
- `Bash`：指令失敗（已有 PostToolUse 的 observeBashError，此處記錄 platform 層級的失敗）
- `Write`/`Edit`：寫入失敗（可能是路徑或權限問題）
- `Task`：subagent 委派失敗（可能是 agent 不存在或超時）
- `Grep`/`Glob`：搜尋失敗（可能是 pattern 語法錯誤）

**設計**：
1. 收集 tool 失敗到 Instinct 觀察系統（已有 `error_resolutions` 類型）
2. 對重大失敗（Task 失敗、Write/Edit 失敗）注入 systemMessage 提示
3. emit timeline `system:warning` 事件供 Dashboard 顯示

**執行項**：
1. 建立 `hooks/scripts/tool/post-use-failure.js`（第 9 個 hook）
2. 在 hooks.json 新增 PostToolUseFailure 事件綁定
3. 可選：新增 timeline event type `tool:failure`（或複用 `system:warning`）

## 開放問題

1. **1a 細節**：architect/planner 是否真的需要 Write？需要 architect 確認 specs 寫入流程
2. **1b 粒度**：ref-handoff-protocol 是否值得預載給所有 16 個 agent？（content 大小 vs turns 節省）
3. **1c 邊界**：updatedInput 注入的 context 長度上限？是否需要截斷保護？（跟 PreCompact 一樣 2000 字）
4. **1d 時機**：SessionEnd 是否在所有情況都觸發？（ctrl+c 強制退出是否觸發？）
5. **1e 去重**：PostToolUseFailure 和 PostToolUse 的 observeBashError 是否會重複觸發？（PostToolUseFailure 只在 tool 失敗時觸發，PostToolUse 只在成功時觸發，兩者互斥）
