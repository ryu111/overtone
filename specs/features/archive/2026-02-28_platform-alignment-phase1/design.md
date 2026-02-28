# Design: platform-alignment-phase1

## 技術摘要（What & Why）

充分利用 Claude Code 平台 5 項未用能力，以零行為變更的方式提升 agent 工具靈活度、減少 context 浪費的 turns、擴展監控覆蓋率。

- **方案**：逐項遷移平台原生能力（disallowedTools、skills 預載、updatedInput、SessionEnd、PostToolUseFailure）
- **理由**：每項都是平台已支援的 first-class 功能，比自建機制更穩定、更省 token
- **取捨**：不做向後相容（CLAUDE.md 規則），直接移除舊 `tools` 白名單改用 `disallowedTools`

---

## 1a. disallowedTools 遷移

### 決策

**architect、planner、qa 需要 Write**。理由：
- architect 寫 `design.md` + `tasks.md`（specs 系統）
- planner 寫 `proposal.md`（specs 系統）
- qa 寫 `qa-handoff.md`（specs 系統）

三者都不需要 Edit（不修改既有檔案，只新建 specs 文件）。但考慮到平台靈活性，architect 和 planner 有時也需要追加內容到 `tasks.md`（Edit），所以同時保留 Write 和 Edit。

**grader 維持 `tools` 白名單**。理由：grader 只需 `Read` + `Bash`，若用 `disallowedTools` 需要排除 7 個工具（Write, Edit, Grep, Glob, Task, NotebookEdit, AskUserQuestion），白名單更簡潔、更安全。

### Agent disallowedTools 映射表

| Agent | 現況 | 改為 | 理由 |
|-------|------|------|------|
| architect | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Task, NotebookEdit]` | 需要 Write+Edit 寫 specs |
| planner | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Task, NotebookEdit]` | 需要 Write+Edit 寫 proposal |
| code-reviewer | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Write, Edit, Task, NotebookEdit]` | 純唯讀 |
| security-reviewer | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Write, Edit, Task, NotebookEdit]` | 純唯讀 |
| debugger | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Write, Edit, Task, NotebookEdit]` | 純唯讀 |
| database-reviewer | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Write, Edit, Task, NotebookEdit]` | 純唯讀 |
| retrospective | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Write, Edit, Task, NotebookEdit]` | 純唯讀 |
| product-manager | `tools: [Read, Grep, Glob, Bash, Write, Edit]` | `disallowedTools: [Task, NotebookEdit]` | 需要 Write+Edit |
| qa | `tools: [Read, Grep, Glob, Bash]` | `disallowedTools: [Edit, Task, NotebookEdit]` | 需要 Write 寫 qa-handoff.md，不需 Edit |
| designer | `tools: [Read, Write, Grep, Glob, Bash]` | `disallowedTools: [Task, NotebookEdit]` | 需要 Write+Edit 寫設計文件 |
| grader | `tools: [Read, Bash]` | 維持 `tools: [Read, Bash]` | 白名單更簡潔 |

**不變動的 agent**（無 tools 限制，已可用全部工具）：
- developer, tester, e2e-runner, build-error-resolver, refactor-cleaner, doc-updater

### 檔案變更

修改 10 個 agent `.md` 的 frontmatter（grader 不變）。

---

## 1b. Agent skills 預載

### 決策

**ref-handoff-protocol 不預載給全部 16 個 agent**。理由：
- 每個 agent 的 `.md` prompt body 已包含完整的 Handoff 輸出格式定義
- 預載 `ref-handoff-protocol` 會重複注入約 300 token，16 個 agent = 4800 token 浪費
- 真正需要理解 **chaining 規則**的是 Main Agent（已在 auto/references/ 可讀取）
- 結論：不建立 `ref-handoff-protocol` skill，省下重複 context

**保留 3 個 reference skill**：

| Skill 名稱 | 預載 Agent | 內容來源 | 預估 token |
|------------|-----------|---------|-----------|
| `ref-bdd-guide` | tester, qa, developer | 精簡自 `skills/auto/references/bdd-spec-guide.md` | ~250 |
| `ref-failure-handling` | developer, tester, code-reviewer | 精簡自 `skills/auto/references/failure-handling.md` | ~200 |
| `ref-wording-guide` | code-reviewer, doc-updater | 精簡自 `docs/reference/wording-guide.md` | ~200 |

### Skill SKILL.md 結構

每個 reference skill 的 `SKILL.md` frontmatter：

```yaml
---
name: ref-{name}
description: {用途描述}
disable-model-invocation: true
user-invocable: false
---
```

- `disable-model-invocation: true`：Claude 不會自動觸發
- `user-invocable: false`：不出現在 `/` 選單
- 內容：從現有 reference 精簡到 200-300 token 的核心摘要

### ref-bdd-guide 內容

精簡 GIVEN/WHEN/THEN 語法 + spec/verify 雙模式 + 最少場景規則（3 scenario）。不含 Scenario Outline、Tag 分類等進階內容。

### ref-failure-handling 內容

精簡三種失敗迴圈：TEST FAIL（debugger -> developer -> tester）、REVIEW REJECT（developer -> reviewer）、RETRO ISSUES（developer -> quality gate -> retro）。含重試上限（3 次）。

### ref-wording-guide 內容

精簡四層級對照表（符號 + 關鍵字 + 場景）+ 決策樹核心路徑。不含完整反模式清單。

### Agent frontmatter 變更

在需要預載的 agent `.md` 中新增 `skills` 欄位：

```yaml
skills:
  - ref-bdd-guide
```

影響的 agent：
- tester: `skills: [ref-bdd-guide, ref-failure-handling]`
- qa: `skills: [ref-bdd-guide]`
- developer: `skills: [ref-bdd-guide, ref-failure-handling]`
- code-reviewer: `skills: [ref-failure-handling, ref-wording-guide]`
- doc-updater: `skills: [ref-wording-guide]`

### 檔案結構

```
skills/ref-bdd-guide/SKILL.md          [新增]
skills/ref-failure-handling/SKILL.md   [新增]
skills/ref-wording-guide/SKILL.md      [新增]
```

---

## 1c. PreToolUse updatedInput 注入

### 決策

**注入位置**：prepend（放在原始 prompt 前面）。理由：
- context 放前面讓 agent 先看到全局狀態再看具體任務
- 與 PreCompact 的 systemMessage 注入一致（狀態恢復放前面）

**長度上限**：1500 字元（略低於 PreCompact 的 2000 字元，因為 agent 本身的 prompt body 更長）。

**注入範圍**：所有 Overtone 管理的 agent（透過 `subagent_type: ot:*` 或 `identifyAgent` 辨識到的 agent）。非 Overtone agent 不注入。

### 注入內容結構

```
[Overtone Workflow Context]
工作流：{workflowType}
進度：{progressBar} ({completed}/{total})
目前階段：{emoji} {label}
Feature：{featureName}（若有）
Specs：specs/features/in-progress/{featureName}/（若有）

前階段摘要：
- {stage1}: {result}（{agentName}）
- {stage2}: {result}（{agentName}）
```

### API 介面

在 `hook-utils.js` 新增：

```javascript
/**
 * 建構 workflow context 字串，用於注入 agent Task prompt。
 *
 * @param {string} sessionId
 * @param {string} projectRoot
 * @param {object} [options]
 * @param {number} [options.maxLength=1500] - 最大字元數
 * @returns {string|null} context 字串，無 workflow 時回傳 null
 */
function buildWorkflowContext(sessionId, projectRoot, options = {})
```

### pre-task.js 變更

在「通過」分支（目前輸出 `{ result: '' }`），改為：

```javascript
// 組裝 updatedInput
const context = buildWorkflowContext(sessionId, projectRoot);
if (context) {
  const originalPrompt = toolInput.prompt || '';
  const updatedPrompt = context + '\n\n---\n\n' + originalPrompt;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { prompt: updatedPrompt },
    },
  }));
} else {
  process.stdout.write(JSON.stringify({ result: '' }));
}
```

### 截斷保護

與 PreCompact 相同策略：超過 `maxLength` 時截斷並附加 `... (已截斷)`。

---

## 1d. SessionEnd hook

### 決策

**ctrl+c 是否觸發**：根據平台文件，SessionEnd 在以下情況觸發：
- `clear`：使用者清除 session
- `logout`：登出
- `prompt_input_exit`：在 prompt 輸入介面退出（正常退出）
- `bypass_permissions_disabled`：權限被禁用
- `other`：其他原因

ctrl+c 發送 SIGINT，Claude Code 會嘗試觸發 SessionEnd（reason: `other`），但不保證（process 可能直接被 kill）。因此 SessionEnd hook 做的清理必須是「有做更好，沒做也不致命」的增量清理。

**workflow.json 更新**：不更新。理由：
- workflow.json 的更新由 on-stop.js（Stop hook）負責
- SessionEnd 是 session 級別的清理，不是 workflow 級別
- 兩者職責分離

### stdin 格式

```json
{ "reason": "clear|logout|prompt_input_exit|bypass_permissions_disabled|other", "session_id": "..." }
```

### 清理項目

1. emit `session:end` timeline 事件
2. 重置 loop.json（`stopped: true`）
3. 清理 `~/.overtone/.current-session-id`

### API 介面

```javascript
// hooks/scripts/session/on-session-end.js
// 輸入：stdin JSON（通用 hook 欄位 + reason）
// 輸出：{ result: '' }（SessionEnd 無決策控制，只做清理）
```

### 與 Stop hook (on-stop.js) 的分工

| 職責 | Stop hook | SessionEnd hook |
|------|-----------|-----------------|
| Loop 繼續/停止 | 決策控制 | 不涉及 |
| workflow:complete | emit | 不涉及 |
| specs 歸檔 | 自動歸檔 | 不涉及 |
| session:end | 不涉及 | emit |
| loop.json 重置 | exitLoop（含 timeline emit） | 簡單 stopped=true |
| .current-session-id | 不涉及 | 清理 |

注意：loop.js 的 `exitLoop()` 已經會 emit `session:end`，但那是在 Stop hook 的正常退出路徑中。SessionEnd hook 處理的是非正常退出（使用者直接結束 session）。為避免重複 emit，SessionEnd hook 先檢查 loop.json 的 `stopped` 狀態：如果已經是 `stopped: true`（Stop hook 已處理過），跳過 session:end emit。

### hooks.json 新增

```json
{
  "event": "SessionEnd",
  "type": "command",
  "command": "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/on-session-end.js"
}
```

---

## 1e. PostToolUseFailure hook

### 決策

**event type**：新增 `tool:failure`。理由：
- 語意精確：`system:warning` 是系統級警告（如 identify-agent-conflict），`tool:failure` 明確指向工具執行失敗
- Dashboard 可基於 category 區分顯示（`tool` vs `system`）
- registry.js 新增一行定義，改動最小

**與 PostToolUse 的 observeBashError 關係**：互斥，不會重複。PostToolUseFailure 只在 tool **平台層級**失敗時觸發（tool 無法執行），PostToolUse 在 tool 成功完成後觸發（Bash exit code 非零是應用層級失敗，tool 本身成功完成了）。

### stdin 格式

```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "..." },
  "error": "error message",
  "is_interrupt": false,
  "session_id": "..."
}
```

### 處理邏輯

1. **所有 tool 失敗**：記錄到 Instinct 觀察系統（type: `error_resolutions`）
2. **重大失敗**（Task、Write、Edit）：注入 systemMessage 提示 Main Agent
3. **emit timeline**：`tool:failure` 事件

### 重大失敗判斷

| Tool | 嚴重程度 | systemMessage |
|------|---------|--------------|
| Task | 高 | agent 委派失敗，可能需要重試或人工介入 |
| Write/Edit | 高 | 檔案寫入失敗，檢查路徑和權限 |
| Bash | 中 | 記錄但不注入 systemMessage（PostToolUse 已有 observeBashError） |
| 其他 | 低 | 只記錄 Instinct |

### registry.js 變更

```javascript
// 新增到 timelineEvents
'tool:failure': { label: '工具失敗', category: 'tool' },
```

timeline 事件總數從 22 變為 23。

### API 介面

```javascript
// hooks/scripts/tool/post-use-failure.js
// 輸入：stdin JSON（通用 hook 欄位 + tool_name, tool_input, error, is_interrupt）
// 輸出：{ result: '' } 或 { result: '{systemMessage}' }
```

### hooks.json 新增

```json
{
  "event": "PostToolUseFailure",
  "type": "command",
  "command": "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/tool/post-use-failure.js"
}
```

---

## 檔案結構總覽

### 新增檔案（5 個）

```
plugins/overtone/skills/ref-bdd-guide/SKILL.md            ← reference skill
plugins/overtone/skills/ref-failure-handling/SKILL.md      ← reference skill
plugins/overtone/skills/ref-wording-guide/SKILL.md         ← reference skill
plugins/overtone/hooks/scripts/session/on-session-end.js   ← SessionEnd hook
plugins/overtone/hooks/scripts/tool/post-use-failure.js    ← PostToolUseFailure hook
```

### 修改檔案（15 個）

```
plugins/overtone/agents/architect.md         ← disallowedTools + skills
plugins/overtone/agents/planner.md           ← disallowedTools
plugins/overtone/agents/code-reviewer.md     ← disallowedTools + skills
plugins/overtone/agents/security-reviewer.md ← disallowedTools
plugins/overtone/agents/debugger.md          ← disallowedTools
plugins/overtone/agents/database-reviewer.md ← disallowedTools
plugins/overtone/agents/retrospective.md     ← disallowedTools
plugins/overtone/agents/product-manager.md   ← disallowedTools
plugins/overtone/agents/qa.md                ← disallowedTools + skills
plugins/overtone/agents/designer.md          ← disallowedTools
plugins/overtone/agents/developer.md         ← skills
plugins/overtone/agents/tester.md            ← skills
plugins/overtone/agents/doc-updater.md       ← skills
plugins/overtone/hooks/hooks.json            ← 新增 2 個 hook 事件
plugins/overtone/scripts/lib/registry.js     ← 新增 tool:failure event
plugins/overtone/hooks/scripts/tool/pre-task.js   ← updatedInput 注入
plugins/overtone/scripts/lib/hook-utils.js        ← buildWorkflowContext 函式
```

---

## 關鍵技術決策

### 決策 1：architect/planner 給 Write+Edit vs 只給 Write

- **選項 A**（選擇）：Write+Edit — architect 需要追加 Dev Phases 到 tasks.md（Edit），planner 可能需要修改 proposal.md
- **選項 B**（未選）：只給 Write — 限制太強，architect 無法 Edit tasks.md

### 決策 2：ref-handoff-protocol 是否建立

- **選項 A**（選擇）：不建立 — agent prompt 已含 Handoff 格式，預載會重複
- **選項 B**（未選）：建立並預載給所有 agent — 4800 token 浪費，收益不明

### 決策 3：updatedInput 注入位置

- **選項 A**（選擇）：prepend（context 在前）— 與 PreCompact 一致，agent 先掌握全局
- **選項 B**（未選）：append（context 在後）— agent 先看任務再看 context，但可能被截斷

### 決策 4：tool:failure vs system:warning

- **選項 A**（選擇）：新增 `tool:failure` — 語意精確，Dashboard 可分類
- **選項 B**（未選）：複用 `system:warning` — 改動少，但語意混淆

### 決策 5：grader 是否改 disallowedTools

- **選項 A**（選擇）：維持 `tools: [Read, Bash]` 白名單 — 白名單 2 項 vs 黑名單 7+ 項，白名單更簡潔安全
- **選項 B**（未選）：改 `disallowedTools` — 清單太長，不必要的複雜度

---

## 實作注意事項

- `pre-task.js` 已有多個 `process.exit(0)` 的分支，新增 updatedInput 邏輯時注意不要影響 deny 分支
- `buildWorkflowContext` 需要延遲 require state.js 和 specs.js，避免循環依賴
- SessionEnd hook 必須檢查 loop.json 的 `stopped` 狀態避免 session:end 重複 emit
- PostToolUseFailure hook 的 `is_interrupt` 為 true 時（使用者手動中斷），不記錄 Instinct（非系統錯誤）
- 所有新 hook 都使用 `safeRun` + `safeReadStdin` 統一錯誤處理模式
