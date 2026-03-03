# P3 Hook 純化 — 技術設計

## 技術摘要（What & Why）

- **方案**：方案 B — 抽取 on-stop.js 的兩大邏輯群組為獨立 lib 模組，搭配 agent prompt 微更新
- **理由**：on-stop.js 441 行中，prompt 組裝（~107 行）和知識歸檔 + dead-code + docs-sync（~65 行）是可獨立測試的純邏輯，抽出後 on-stop.js 變為薄 orchestrator，每個 block 用一行函式呼叫替代
- **取捨**：新增 2 個 lib 檔案增加少量檔案數，但換來可單元測試性和職責分離；on-stop.js 從 441 行降至約 200 行

## API 介面設計

### 模組 1: `stop-message-builder.js`

```javascript
/**
 * stop-message-builder.js — SubagentStop prompt 組裝
 *
 * 純函式：接收 context，回傳 messages 陣列。
 * 不直接操作 timeline、state 等副作用 — timeline events 由呼叫者處理。
 *
 * 導出：
 *   buildStopMessages — 依據 verdict/state/convergence 組裝所有提示訊息
 */

/**
 * @param {object} ctx
 * @param {string} ctx.verdict         - 'pass' | 'fail' | 'reject' | 'issues'
 * @param {string} ctx.stageKey        - registry stage key（如 'TEST'、'REVIEW'）
 * @param {string} ctx.actualStageKey  - 可能帶編號的 key（如 'TEST:2'）
 * @param {string} ctx.agentName       - agent 名稱（如 'tester'）
 * @param {string} ctx.sessionId       - session ID
 * @param {object} ctx.state           - 更新後的 workflow state
 * @param {object} ctx.stages          - registry.stages
 * @param {object} ctx.retryDefaults   - registry.retryDefaults
 * @param {object} ctx.parallelGroups  - registry.parallelGroups
 * @param {string|null} ctx.tasksCheckboxWarning - tasks.md 勾選失敗警告
 * @param {object|null} ctx.compactSuggestion    - shouldSuggestCompact 的結果
 * @param {object|null} ctx.convergence          - checkParallelConvergence 的結果
 * @param {string|null} ctx.nextHint             - getNextStageHint 的結果
 * @param {string|null} ctx.featureName          - 活躍 feature 名稱
 * @param {string}      ctx.projectRoot          - 專案根目錄
 *
 * @returns {{ messages: string[], timelineEvents: Array<{type: string, data: object}>, stateUpdates: Array<{fn: function}> }}
 *   - messages: 提示訊息陣列（呼叫者 join('\n') 輸出）
 *   - timelineEvents: 需要 emit 的 timeline events（呼叫者迭代 emit）
 *   - stateUpdates: 需要執行的 state 更新函式（如 retroCount 遞增）
 */
function buildStopMessages(ctx) { ... }
```

**設計決策 — timeline emit 歸屬**：

`buildStopMessages` 不直接 `timeline.emit()`，而是回傳 `timelineEvents` 陣列。呼叫者（on-stop.js）負責實際的 emit。理由：
1. 保持 builder 為純函式，可單元測試（不需 mock timeline）
2. timeline emit 順序和時機由 orchestrator 統一控制
3. `stateUpdates` 同理 — RETRO 的 retroCount 遞增回傳為 update 函式

包含的 timeline events（原本散佈在 prompt 組裝邏輯中的）：
- `stage:retry`（fail 且未達上限時）
- `error:fatal`（fail/reject 達上限時）
- `parallel:converge`（pass 且並行群組收斂時）
- `session:compact-suggestion`（pass 且 compact 建議觸發時）

### 模組 2: `knowledge-archiver.js`

```javascript
/**
 * knowledge-archiver.js — SubagentStop 知識歸檔
 *
 * 合併 on-stop.js 中的三個後處理邏輯：
 *   1. 知識提取和路由歸檔（原 Block 8）
 *   2. RETRO 完成時 dead code 掃描（原 Block 4-RETRO）
 *   3. DOCS 完成時文件數字校驗（原 Block 4-DOCS）
 *
 * 導出：
 *   archiveKnowledge     — 知識提取 + 路由歸檔
 *   runPostStageActions   — stage-specific 後處理（dead code / docs sync）
 */

/**
 * 知識提取 + 路由歸檔。
 *
 * @param {string} agentOutput    - agent 輸出（建議已截斷至 3000 chars）
 * @param {object} ctx
 * @param {string} ctx.agentName
 * @param {string} ctx.actualStageKey
 * @param {string} ctx.projectRoot
 * @returns {{ archived: number, errors: number }}
 *   - archived: 成功歸檔的 fragment 數量
 *   - errors: 失敗的 fragment 數量
 */
function archiveKnowledge(agentOutput, ctx) { ... }

/**
 * Stage-specific 後處理。
 *
 * 依據 stageKey 執行對應的後處理邏輯：
 *   - RETRO: dead code 掃描 → instinct 記錄
 *   - DOCS:  docs sync 校驗 → 自動修復
 *
 * @param {string} stageKey       - base stage key（如 'RETRO'、'DOCS'）
 * @param {object} ctx
 * @param {string} ctx.sessionId
 * @returns {{ messages: string[] }}
 *   - messages: 附加的提示訊息（由呼叫者合併到最終 result）
 */
function runPostStageActions(stageKey, ctx) { ... }
```

### 模組 3: `shouldSuggestCompact` 移至 `hook-utils.js`

```javascript
// hook-utils.js 新增 export：
/**
 * 判斷是否應該建議 compact（原 on-stop.js 的同名函式，原封搬遷）
 *
 * @param {object} opts
 * @param {string|null} opts.transcriptPath
 * @param {string}      opts.sessionId
 * @param {number}      [opts.thresholdBytes]
 * @param {number}      [opts.minStagesSinceCompact]
 * @returns {{ suggest: boolean, reason?: string, transcriptSize?: string }}
 */
function shouldSuggestCompact(opts) { ... }
```

## 資料模型

無新增資料模型。所有 state/timeline/instinct 格式不變。

## 檔案結構

```
修改的檔案：
  plugins/overtone/hooks/scripts/agent/on-stop.js    -- 改寫為薄 orchestrator
  plugins/overtone/scripts/lib/hook-utils.js          -- 新增 shouldSuggestCompact export
  plugins/overtone/agents/retrospective.md            -- 新增 dead code 掃描指引
  plugins/overtone/agents/doc-updater.md              -- 新增 docs sync 校驗指引
  plugins/overtone/skills/workflow-core/references/completion-signals.md
                                                      -- 追加 grader hint 章節
  tests/integration/compact-suggestion.test.js        -- 更新 import 路徑
  tests/integration/agent-on-stop.test.js             -- 驗證重構後行為不變

新增的檔案：
  plugins/overtone/scripts/lib/stop-message-builder.js  -- prompt 組裝純函式
  plugins/overtone/scripts/lib/knowledge-archiver.js    -- 知識歸檔 + 後處理
  tests/unit/stop-message-builder.test.js               -- 新 lib 單元測試
  tests/unit/knowledge-archiver.test.js                 -- 新 lib 單元測試
```

## on-stop.js 目標結構（偽代碼）

```javascript
const { shouldSuggestCompact } = require('../../../scripts/lib/hook-utils');
const { buildStopMessages } = require('../../../scripts/lib/stop-message-builder');
const { archiveKnowledge, runPostStageActions } = require('../../../scripts/lib/knowledge-archiver');

if (require.main === module) {
  safeRun(() => {
    // ── Block 1: stdin 讀取 + agent 辨識（不變）──
    const input = safeReadStdin();
    const sessionId = getSessionId(input);
    const agentName = ...;
    // early exit: 無 session / 無 agent / 非 overtone agent / 無 state

    // ── Block 2: 清除 active agent 追蹤（不變）──
    try { unlinkSync(paths.session.activeAgent(sessionId)); } catch {}

    // ── Block 3: 辨識 stage + 讀取 state + 解析結果 + 原子更新 state（不變）──
    const result = parseResult(agentOutput, stageKey);
    const actualStageKey = findActualStageKey(currentState, stageKey);
    const updatedState = updateStateAtomic(sessionId, (s) => { ... });

    // ── Block 4: emit timeline（agent:error + agent:complete + stage:complete）──
    // 這三個基本事件仍在 hook 中直接 emit（不移入 builder）
    if (result.verdict === 'fail') { timeline.emit(sessionId, 'agent:error', ...); }
    timeline.emit(sessionId, 'agent:complete', ...);
    timeline.emit(sessionId, 'stage:complete', ...);

    // ── Block 5: agent_performance instinct 觀察（不變）──
    try { instinct.emit(sessionId, 'agent_performance', ...); } catch {}

    // ── Block 6: tasks.md checkbox 更新（不變）──
    // featureName auto-sync + checkbox 更新

    // ── Block 7: prompt 組裝（委派 stop-message-builder）──
    const convergence = checkParallelConvergence(updatedState, parallelGroups);
    const nextHint = getNextStageHint(updatedState, { stages, parallelGroups });
    const compactSuggestion = nextHint
      ? shouldSuggestCompact({ transcriptPath: input.transcript_path, sessionId })
      : { suggest: false };

    const buildResult = buildStopMessages({
      verdict: result.verdict,
      stageKey, actualStageKey, agentName, sessionId,
      state: updatedState,
      stages, retryDefaults, parallelGroups,
      tasksCheckboxWarning,
      compactSuggestion, convergence, nextHint,
      featureName: updatedState.featureName,
      projectRoot,
    });

    // emit builder 回傳的 timeline events
    for (const evt of buildResult.timelineEvents) {
      timeline.emit(sessionId, evt.type, evt.data);
    }
    // 執行 builder 回傳的 state updates
    for (const update of buildResult.stateUpdates) {
      update(sessionId);
    }

    const messages = buildResult.messages;

    // ── Block 8: 知識歸檔（委派 knowledge-archiver）──
    if (result.verdict !== 'fail' && result.verdict !== 'reject') {
      archiveKnowledge(agentOutput.slice(0, 3000), {
        agentName, actualStageKey, projectRoot,
      });
    }

    // ── Block 9: stage-specific 後處理（委派 knowledge-archiver）──
    if (result.verdict !== 'fail' && result.verdict !== 'reject') {
      const postActions = runPostStageActions(stageKey, { sessionId });
      messages.push(...postActions.messages);
    }

    // ── Block 10: 輸出 ──
    process.stdout.write(JSON.stringify({ result: messages.join('\n') }));
    process.exit(0);
  }, { result: '' });
}

// on-stop.js 不再 export 任何函式 — shouldSuggestCompact 已移至 hook-utils.js
module.exports = {};
```

## 關鍵技術決策

### 決策 1: timeline emit 歸屬（回答 Q2）

- **選擇**：基本事件（agent:error, agent:complete, stage:complete）留在 hook 直接 emit；條件性事件（stage:retry, error:fatal, parallel:converge, session:compact-suggestion）由 builder 回傳、hook 代為 emit
- **理由**：基本事件是 on-stop.js 的核心職責（每次都 emit），與 prompt 組裝無關；條件性事件與 prompt 邏輯耦合（例如 fail 時既要 emit stage:retry 又要產生重試提示），放在 builder 中才能保持 message + event 的一致性
- **未選方案**：全部 timeline emit 都由 builder 回傳 — 會讓 builder 的回傳值過於龐雜，且基本事件不需要條件判斷

### 決策 2: archiveKnowledge 合併 instinct 時序（回答 Q3）

- **選擇**：合併後呼叫時序可接受，archiveKnowledge 在 Block 4（timeline emit）後執行
- **理由**：原本 Block 4（agent_performance instinct）和 Block 8（知識歸檔）之間沒有資料依賴，只是因為原始碼的行數順序造成先後；合併為 knowledge-archiver.js 後，agent_performance 觀察仍留在 hook（Block 5），知識歸檔在 Block 8 位置，時序完全不變
- **注意**：grader hint 已從 on-stop.js 移出到 completion-signals.md（靜態知識），不涉及執行時序

### 決策 3: on-stop.js exports（回答 Q4）

- **選擇**：`module.exports = {}` — 清空 exports
- **理由**：Overtone 原則是不保留舊 API。shouldSuggestCompact 移到 hook-utils.js，formatSize 本就從 utils.js import（on-stop.js 的 re-export 是多餘的）。測試檔案更新 import 路徑即可
- **影響**：compact-suggestion.test.js 需改為從 hook-utils.js import shouldSuggestCompact，formatSize 改為從 utils.js import

### 決策 4: manage-component.js 的 agent prompt 更新模式（回答 Q1）

- **選擇**：使用 `manage-component.js update agent` 的 `body` 欄位，JSON patch 語意（只更新 body 欄位，其他 frontmatter 欄位不變）
- **理由**：config-api.js 的 updateAgent 函式已支援 `body` 欄位（line 629: `const newBody = updates.body !== undefined ? updates.body : existingContent.trimStart()`），這是完整替換 body 的語意。但 agent prompt 變更很小（只新增幾行指引），手動 Edit 工具更精準、更安全
- **實際做法**：retrospective.md 和 doc-updater.md 的 prompt 修改直接用 Edit 工具，不經 manage-component.js（因為只是在 body 中新增幾行，不涉及 frontmatter 變更，不需要經過 guard）

## Agent Prompt 修改內容

### retrospective.md — 新增 dead code 掃描指引

在 `## DO` 區塊末尾追加：

```markdown
- 💡 RETRO 完成時系統自動掃描 dead code（未使用 exports、孤立檔案），掃描結果會附加在你的 PASS Handoff 後由 Main Agent 呈現。你不需要手動執行掃描，但若在回顧過程中發現可疑的未使用程式碼，可在 Findings 中提及。
```

### doc-updater.md — 新增 docs sync 校驗指引

在 `## DO` 區塊末尾追加：

```markdown
- 💡 DOCS 完成時系統自動執行文件數字同步校驗（status.md、CLAUDE.md 的元件數量），自動修復的結果會附加在你的 PASS Handoff 後。你不需要手動校驗數字，但應確保你更新的文件內容與自動修復不衝突。
```

### completion-signals.md — 追加 grader hint 章節

在文件末尾追加：

```markdown
## Grader 評估提示

當 stage 完成且結果非 fail 時，Main Agent 可選擇委派 grader agent 評估此階段輸出品質。

**格式**：
```
委派 grader agent 評估此階段輸出品質
subagent_type: ot:grader
傳入：STAGE={actualStageKey} AGENT={agentName} SESSION_ID={sessionId}
```

此為可選操作（非必要步驟），由 Main Agent 自行判斷是否執行。
```

## 測試策略

### 新增：stop-message-builder.test.js（單元測試）

純函式測試，不需子進程、不需 session state：
1. verdict=pass + 有 nextHint → messages 含「完成」+ 「下一步」
2. verdict=pass + 無 nextHint → messages 含「所有階段已完成」
3. verdict=fail + 未達上限 → messages 含 retry 提示 + timelineEvents 含 stage:retry
4. verdict=fail + 達上限 → messages 含 fatal 提示 + timelineEvents 含 error:fatal
5. verdict=reject + 未達上限 → messages 含 reject 提示
6. verdict=reject + 達上限 → messages 含 fatal 提示
7. verdict=issues → messages 含 retroCount + stateUpdates 有 retroCount 遞增
8. fail + rejectCount > 0 → 雙重失敗協調提示
9. reject + failCount > 0 → 雙重失敗協調提示
10. parallel convergence → messages 含群組收斂 + timelineEvents 含 parallel:converge
11. compact suggestion.suggest=true → messages 含 compact 建議 + timelineEvents 含 session:compact-suggestion
12. compact suggestion.suggest=false → 無 compact 相關訊息
13. tasksCheckboxWarning 非 null → messages 含警告
14. featureName 存在 → messages 含 specs 路徑
15. grader hint 不再出現在 messages（已移至 completion-signals.md）

### 新增：knowledge-archiver.test.js（單元測試）

1. archiveKnowledge — 有 Findings 區塊 → archived > 0
2. archiveKnowledge — 空輸出 → archived = 0
3. archiveKnowledge — 單個 fragment 寫入失敗 → errors > 0 但不拋錯
4. runPostStageActions('RETRO', ...) — 有 dead code → messages 含掃描結果
5. runPostStageActions('RETRO', ...) — 無 dead code → messages 為空
6. runPostStageActions('DOCS', ...) — 有 drift → messages 含修復結果
7. runPostStageActions('DOCS', ...) — 無 drift → messages 為空
8. runPostStageActions('DEV', ...) — 非 RETRO/DOCS → messages 為空

### 更新：compact-suggestion.test.js

- import 路徑從 `require(ON_STOP_PATH)` 改為分別 import：
  - `shouldSuggestCompact` 從 `hook-utils.js`
  - `formatSize` 從 `utils.js`
- 所有測試邏輯不變（函式行為不變）

### 更新：agent-on-stop.test.js

- 整合測試行為不變（子進程模式，驗證端到端 JSON output）
- 新增驗證：grader hint 不再出現在 result 中（已移至靜態知識）
- 驗證：on-stop.js `module.exports` 為 `{}`

## 實作注意事項

1. **stop-message-builder.js 必須是純函式**：不 require timeline/state/instinct，所有副作用透過回傳值讓呼叫者執行。測試時不需 mock 任何外部模組。
2. **knowledge-archiver.js 封裝副作用**：內部 require knowledge-searcher/skill-router/dead-code-scanner/docs-sync-engine，用 try/catch 包裹每個操作。
3. **shouldSuggestCompact 搬遷需同步**：hook-utils.js 加 export + on-stop.js 改 import + test 改 import，三者必須在同一 commit。
4. **on-stop.js 的 module.exports**：改為 `module.exports = {}`。compact-suggestion.test.js 的 import 必須同步更新，否則測試會壞。
5. **Agent prompt 修改用 Edit 工具**：不經 manage-component.js，因為只改 body 中的幾行文字，不涉及 frontmatter。但注意 pre-edit guard 會阻擋直接編輯 agents/*.md，developer 需使用 manage-component.js 或確認 guard 設定允許 body 內容新增。
6. **Grader hint 移除**：on-stop.js 中 `result.verdict !== 'fail'` 時的 grader hint 訊息（約 1 行）從 buildStopMessages 中移除，改為靜態知識放在 completion-signals.md。Main Agent 透過 skill context 載入而非 hook result。
