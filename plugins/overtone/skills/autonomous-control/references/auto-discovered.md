---
## 2026-03-05 | planner:PLAN Context
L3.5 Project Orchestrator 的目標是串聯現有三個已完成的基礎設施：L3.3 Skill Forge（`skill-forge.js`）、L3.4 深度 PM（`interview.js`）、和執行佇列（`execution-queue.js`）。

現在的斷點是：PM 訪談完成後，使用者必須手動分析 Project Spec → 推導缺少的 skill → 呼叫 forge → 排程 feature。Orchestrator 自動化這三個步驟，讓系統在收到一份 Project Spec 後，能自主完成能力盤點 + skill 批次建構 + feature 排入執行佇列。
Keywords: project, orchestrator, skill, forge, interview, execution, queue, spec, feature
---
## 2026-03-05 | architect:ARCH Context
設計 `project-orchestrator.js`——一個純協調模組，串聯三個現有子系統（knowledge-gap-detector + skill-forge + execution-queue），完成「從 Project Spec 到填充佇列」的端到端自動化。所有 4 個 Open Questions 已做出明確決策。
Keywords: project, orchestrator, knowledge, detector, skill, forge, execution, queue, spec, open
---
## 2026-03-05 | developer:DEV Context
為執行佇列實作智慧排程功能（queue-smart-schedule），新增 `dedup`（去重）和 `suggest-order`（排序建議）兩個功能，並在 `queue.js` CLI 加入對應子命令。
Keywords: queue, smart, schedule, dedup, suggest, order
---
## 2026-03-05 | architect:ARCH Findings
**技術方案**：
- 在 `execution-queue.js` 新增五個核心函式（`insertItem` / `removeItem` / `moveItem` / `getItem` / `retryItem`），統一回傳 `{ ok: boolean, error?: string }` 格式
- 在 `queue.js` 新增五個 CLI 子命令，`--before`/`--after` 互斥 flag 解析，沿用現有 `optionKeys` 過濾機制

**關鍵技術決策**：
- `remove` 只允許 `pending` / `failed`，不允許 `completed`（歷史記錄保護）
- `move` 允許 `pending` 和 `failed`（failed 需要重排），不允許 `in_progress` / `completed`
- `retry` 在有 `in_progress` 時阻擋，回傳 `IN_PROGRESS_CONFLICT` 錯誤
- anchor 不存在時明確報錯，不靜默 fallback
- `retryItem` 清除 `failedAt` / `failReason` / `startedAt` 欄位（destructuring 建立新物件，確保欄位完全移除）
- `move` 實作：先移除目標，再找 anchor 新 index，再插入（避免 index 偏移）

**API 介面**：

```javascript
// execution-queue.js 新增
insertItem(projectRoot, name, workflow, anchor, 'before'|'after')
  → { ok: true } | { ok: false, error: 'QUEUE_NOT_FOUND'|'ANCHOR_NOT_FOUND' }

removeItem(projectRoot, name)
  → { ok: true } | { ok: false, error: 'QUEUE_NOT_FOUND'|'ITEM_NOT_FOUND'|'INVALID_STATUS' }

moveItem(projectRoot, name, anchor, 'before'|'after')
  → { ok: true } | { ok: false, error: 'QUEUE_NOT_FOUND'|'ITEM_NOT_FOUND'|'ANCHOR_NOT_FOUND'|'INVALID_STATUS'|'SELF_ANCHOR' }

getItem(projectRoot, name)
  → { ok: true, item: {...}, index: number } | { ok: false, error: 'QUEUE_NOT_FOUND'|'ITEM_NOT_FOUND' }

retryItem(projectRoot, name)
  → { ok: true } | { ok: false, error: 'QUEUE_NOT_FOUND'|'ITEM_NOT_FOUND'|'INVALID_STATUS'|'IN_PROGRESS_CONFLICT', conflictName?: string }
```

**資料模型**：
- 佇列格式（execution-queue.json）不變
- `retryItem` 後項目：status 重設為 `pending`，`failedAt` / `failReason` / `startedAt` 欄位完全移除
- `insertItem` 新項目：只有 `name` / `workflow` / `status: 'pending'`

**檔案結構**：
- 修改：`plugins/overtone/scripts/lib/execution-queue.js`（新增五個函式 + exports）
- 修改：`plugins/overtone/scripts/queue.js`（新增五個 cmd 函式 + switch cases + help + exports）
- 新增：`tests/unit/execution-queue-enhancement.test.js`（單元測試）
- 新增：`tests/integration/queue-cli-enhancement.test.js`（整合測試）
- 修改：`CLAUDE.md`（queue.js 用法說明補充）

**Dev Phases**：

    ### Phase 1: 核心函式 (sequential)
    - [ ] execution-queue.js 新增五個函式 | files: plugins/overtone/scripts/lib/execution-queue.js

    ### Phase 2: CLI + 測試 (parallel)
    - [ ] queue.js 新增五個 cmd 函式 | files: plugins/overtone/scripts/queue.js
    - [ ] 單元測試 | files: tests/unit/execution-queue-enhancement.test.js

    ### Phase 3: 整合測試 + 文件 (parallel)
    - [ ] 整合測試 | files: tests/integration/queue-cli-enhancement.test.js
    - [ ] 更新 CLAUDE.md | files: CLAUDE.md
Keywords: execution, queue, insertitem, removeitem, moveitem, getitem, retryitem, boolean, error, string
---
## 2026-03-05 | architect:ARCH Context
queue-cli-enhancement 的技術設計已完成。選擇沿用現有 execution-queue.js 的 `atomicWrite` + `readQueue` pattern，直接擴充而不引入新抽象。五個 Open Questions 已全部做出明確決策。
Keywords: queue, enhancement, execution, atomicwrite, readqueue, pattern, open, questions
---
## 2026-03-05 | developer:DEV Context
實作了 `queue-cli-enhancement` feature 的全部三個 Phase：

- **Phase 1**：`execution-queue.js` 新增五個函式（`insertItem`、`removeItem`、`moveItem`、`getItem`、`retryItem`），統一回傳 `{ ok: boolean, error?, ... }` 格式
- **Phase 2**：`queue.js` 新增五個 CLI 子命令（`insert`、`remove`、`move`、`info`、`retry`），完整的 `--before`/`--after` flag 解析與錯誤碼→中文訊息轉換
- **Phase 3**：`CLAUDE.md` 更新執行佇列管理區塊，補充七個新用法說明
Keywords: queue, enhancement, feature, phase, execution, insertitem, removeitem, moveitem, getitem, retryitem
---
## 2026-03-05 | code-reviewer:REVIEW Findings
- 五個函式邏輯正確，包含 moveItem 的 index 偏移處理
- 狀態守衛完整：completed/in_progress 不可刪除/移動，retryItem 檢查 in_progress 衝突
- `_formatError` 統一錯誤訊息格式，品質良好
- 64 個測試全部通過（28 unit + 36 integration）
- 與既有 execution-queue.js 的設計模式一致（回傳格式、atomicWrite、函式簽名）
- CLAUDE.md 文件已同步更新
Keywords: moveitem, index, completed, retryitem, unit, integration, execution, queue, atomicwrite, claude
---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

- BDD spec（`specs/features/archive/2026-03-05_queue-cli-enhancement/bdd.md`）與實作完全對齊，所有 scenarios 都有對應測試
- 跨模組一致性良好：`execution-queue.js` 的錯誤碼設計（6 種錯誤碼）與 `queue.js` CLI 層的 `_formatError` 集中處理一致，無錯誤碼漂移
- CLAUDE.md 已同步更新全部 5 個新子命令（insert/remove/move/info/retry），文件對齊實作
- `dedup` 和 `suggest-order` 確認屬於前一個 feature（`queue-smart-schedule`），不在本次範圍內，無遺漏
- `moveItem` 的 anchor index 偏移問題（移除目標項目後再找 anchor）已在實作中正確處理（`/Users/sbu/projects/overtone/plugins/overtone/scripts/lib/execution-queue.js` 第 447 行）
- `retryItem` 的 `failed` 欄位清理使用 destructuring 方式完全移除（非設為 undefined），符合 BDD 規格要求
- 測試隔離良好：各測試使用時間戳記目錄，`afterAll` 清理，`beforeEach` 重設佇列
Keywords: spec, specs, features, archive, enhancement, scenarios, execution, queue, claude, insert

---
## 2026-03-05 | doc-updater:DOCS Context
queue-cli-enhancement feature 文件同步完成。開發階段已新增 execution-queue.js 的五個細粒度操作函式與對應 CLI 子命令。
Keywords: queue, enhancement, feature, execution

---
## 2026-03-06 | architect:ARCH Findings
**技術方案**：
- `scripts/os/tts.js`：macOS `say` 指令封裝，`speak()`（阻塞）+ `speakBackground()`（spawn+detach 非阻塞）+ `listVoices()`，完全對齊 notification.js 慣例
- `scripts/lib/tts-templates.js`：純資料模組，16 個事件鍵對應中文口語模板，`{key}` 插值
- `scripts/lib/tts-strategy.js`：策略引擎，TTS_LEVELS（0-3 累積式）+ shouldSpeak() + buildSpeakArgs() + readTtsConfig()，設定從 `~/.overtone/tts.json` 讀取
- Hook 整合採 fire-and-forget 模式，try/catch 包裹不阻擋主流程

**API 介面**：
- `speak(text, opts?, _deps?) → { ok, voice, text } | { ok, error, message }`
- `speakBackground(text, opts?, _deps?) → { ok } | { ok, error, message }`
- `listVoices(_deps?) → { ok, voices: [{name, lang}] } | { ok, error, message }`
- `getTemplate(eventKey, params?) → string | null`
- `shouldSpeak(eventKey, level) → boolean`
- `buildSpeakArgs(eventKey, context?, config?) → { text, opts } | null`
- `readTtsConfig(_deps?) → { enabled, level, voice, rate }`

**資料模型**：
- `~/.overtone/tts.json`：`{ enabled: false, level: 1, voice: null, rate: 200 }`
- TTS Levels：0=SILENT, 1=CRITICAL（error:fatal/workflow:complete/notification:ask）, 2=PROGRESS（+agent:complete/stage:complete），3=VERBOSE（+session:start）

**檔案結構**：
- 新增：`plugins/overtone/scripts/os/tts.js`、`plugins/overtone/scripts/lib/tts-templates.js`、`plugins/overtone/scripts/lib/tts-strategy.js`、`tests/unit/tts.test.js`、`tests/unit/tts-templates.test.js`、`tests/unit/tts-strategy.test.js`
- 修改：`plugins/overtone/scripts/lib/agent-stop-handler.js`、`plugins/overtone/scripts/lib/session-stop-handler.js`、`plugins/overtone/hooks/scripts/notification/on-notification.js`

**Dev Phases**：

    ### Phase 1: 底層模組建立 (parallel)
    - [ ] 建立 tts.js | files: plugins/overtone/scripts/os/tts.js
    - [ ] 建立 tts-templates.js | files: plugins/overtone/scripts/lib/tts-templates.js

    ### Phase 2: 策略引擎建立 (sequential)
    - [ ] 建立 tts-strategy.js | files: plugins/overtone/scripts/lib/tts-strategy.js

    ### Phase 3: Hook 整合 (parallel)
    - [ ] 整合 agent-stop-handler.js | files: plugins/overtone/scripts/lib/agent-stop-handler.js
    - [ ] 整合 session-stop-handler.js | files: plugins/overtone/scripts/lib/session-stop-handler.js
    - [ ] 整合 on-notification.js | files: plugins/overtone/hooks/scripts/notification/on-notification.js

    ### Phase 4: 單元測試 (parallel)
    - [ ] 撰寫 tts.test.js | files: tests/unit/tts.test.js
    - [ ] 撰寫 tts-templates.test.js | files: tests/unit/tts-templates.test.js
    - [ ] 撰寫 tts-strategy.test.js | files: tests/unit/tts-strategy.test.js
Keywords: scripts, macos, speak, speakbackground, spawn, detach, listvoices, notification, templates, strategy

---
## 2026-03-06 | code-reviewer:REVIEW Findings
**審查摘要**

審查了 5 個核心變更檔案（3 個實作 + 2 個測試），以及 6 個 `auto-discovered.md` 知識歸檔變更。

**逐項檢查結果：**

1. **BDD 覆蓋完整性** -- BDD spec 定義 Feature A（6 scenarios）+ Feature B（5 scenarios）+ Feature C（4 scenarios）。測試檔案覆蓋情況：
   - A-1 ~ A-6：`queue-smart-schedule.test.js` 第 271-373 行全覆蓋（含 A-2b 額外測試）
   - B-1 ~ B-5：`failure-tracker.test.js` 第 684-772 行全覆蓋（含 B-4b 1/3 精確四捨五入）
   - Feature C（CLI --smart flag）：未有獨立測試，但 `cmdSuggestOrder` 的邏輯路徑透過 A 系列測試間接覆蓋了 `suggestOrder` + `failureData` 的整合。CLI 層面的 `--smart` flag 解析在 `optionKeys` 和 `positional` 過濾中正確處理

2. **向後相容性** -- `suggestOrder(projectRoot)` 無第二參數時，`options` 為 `undefined`，`options && options.failureData` 回傳 `undefined`（falsy），`if (failureData)` 不進入二次排序分支。完全向後相容，A-1 測試驗證

3. **getWorkflowFailureRates 聚合邏輯** -- 正確使用 `_filterResolved` 過濾已解決記錄（與 `getFailurePatterns` 一致），`r.workflowType != null` 同時過濾 null 和 undefined，`Math.round(... * 10000) / 10000` 正確四捨五入至 4 位。B-4b 測試驗證 1/3 = 0.3333

4. **排序穩定性** -- `if (fa !== fb) return fa - fb` 只在失敗率不同時改變順序，相同時 fallback 到 `a.idx - b.idx`（原始索引），A-6 測試驗證

5. **--smart flag 不被誤解為 positional** -- `optionKeys` 陣列已加入 `'--smart'`，`smartFlag` 使用 `args.includes('--smart')` 正確提取。`--smart` 不在 `valueOptions` 中（它是純 flag 無值參數），正確

6. **Error handling** -- `failureData[a.item.workflow]?.rate ?? 0`：optional chaining + nullish coalescing，workflow 不在 failureData 中時安全回傳 0，A-4 測試驗證

7. **安全性** -- 無硬編碼 secrets、無 SQL injection、無 command injection 風險。`require('./lib/failure-tracker')` 懶加載僅在 `--smart` flag 啟用時觸發

8. **額外變更** -- `_guardDiscoveryMode` 新增 export 與 smart-scheduling 無關但無害（暴露既有函式供測試用）。`auto-discovered.md` 變更為知識歸檔（internalization 機制的正常操作），workflow-core 的大量刪除是舊條目清理

9. **測試結果** -- 65 pass / 0 fail / 165 expect() calls

未發現任何高信心（>80%）問題。
Keywords: auto, discovered, spec, feature, scenarios, queue, smart, schedule, test, failure

---
## 2026-03-06 | tester:TEST Findings
測試結果摘要：

| 測試檔案 | 通過 | 失敗 | 覆蓋 BDD Scenario |
|---------|------|------|-------------------|
| queue-smart-schedule.test.js | 27 | 0 | Feature A (A-1 ~ A-6) |
| failure-tracker.test.js | 38 | 0 | Feature B (B-1 ~ B-5) |
| execution-queue.test.js | 30 | 0 | 回歸（無新增） |
| queue-cli.test.js | 24 | 0 | Feature C (C-1 ~ C-4)（補充新增） |

**總計：119 pass / 0 fail**

Feature C（CLI --smart flag）原本無測試覆蓋，已補充 4 個 Scenario 測試。
Keywords: scenario, queue, smart, schedule, test, feature, failure, tracker, execution, pass

