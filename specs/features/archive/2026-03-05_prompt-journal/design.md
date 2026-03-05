# Design：prompt-journal

## 技術方案摘要

擴展 Instinct 系統，新增 `intent_journal` 觀察類型，記錄每次 prompt 原文並在 session 結束時配對結果。核心設計：`skipDedup` options object 讓每次 emit 產生獨立記錄，全域畢業策略採 `excludeTypes` 過濾（方案 C），sessionResult 從 `workflow.json` 的 `completedStages` 陣列判定。

## Open Questions 架構決策

### Q1：全域畢業策略 → 方案 C（excludeTypes 過濾）

**決定**：全域 store 儲存 intent_journal 記錄（不過濾），但 `queryGlobal()` 新增 `excludeTypes` 參數。SessionStart 全域觀察載入時傳入 `excludeTypes: ['intent_journal']`，避免把每筆 prompt 原文塞入 systemMessage。intent_journal 的全域注入走獨立的「最近常做的事」摘要段落（T6）。

**理由**：
- 方案 A（只存聚合）需要新增聚合邏輯，over-engineering
- 方案 B（TTL prune）與現有 decayGlobal 語意不清（intent_journal 沒有「信心衰減」的概念）
- 方案 C 最小改動，`queryGlobal` 的 `excludeTypes` 也是通用能力，未來可複用

### Q2：skipDedup API 設計 → options object 第 6 參數

**決定**：`emit(sessionId, type, trigger, action, tag, options)` 其中 `options = { skipDedup?: boolean }`。

**理由**：
- options object 比 boolean 第 6 參數更具擴展性（未來可加 `ttl`、`priority` 等）
- 與 JS 慣例一致，呼叫端語意清晰：`emit(..., { skipDedup: true })`
- 不破壞現有呼叫（options 預設 undefined，行為不變）

### Q3：sessionResult pass 判定 → workflow.json 的 completedStages

**決定**：讀取 `state.readState(sessionId)` 的 `completedStages` 陣列：
- `completedStages` 存在且長度 > 0 → `pass`
- workflow 已啟動（`workflowType` 存在）但 `completedStages` 為空 → `fail`
- workflow 未啟動（`workflowType` 為 null）→ `abort`

**理由**：`state.readState()` 已在 session-end-handler.js 中被讀取（用於 `appliedObservationIds`），不需新增讀取邏輯。`completedStages` 是 workflow 狀態的真實反映，比讀取 timeline 最後事件更直接。

### Q4：intent_journal 的 decay/prune 行為 → 參與衰減，但不影響全域畢業

**決定**：intent_journal 記錄**參與**現有週衰減（不排除）。Session 層：`sessionResult=fail` 記錄自然因 confidence 衰減低於 `autoDeleteThreshold` 而被刪除，是合理行為。全域層：`decayGlobal()` 同樣對 intent_journal 施加衰減，舊 journal 記錄自動清理。

**理由**：
- 排除 intent_journal 需要修改 `decay()` 的 filter 邏輯，增加複雜度
- 現有衰減機制（-0.02/週）對短期 session 記錄（7 天 → 信心跌破 0.2）自然清理
- `sessionResult=pass` 的記錄因被 confirm（信心提升）而存活更久，符合直覺

### Q5：prompt 截斷長度 → maxPromptLength: 500

**決定**：`maxPromptLength: 500`（而非 2000）。

**理由**：
- intent_journal 的目的是識別「意圖模式」，前 500 字已足夠捕捉意圖
- SessionStart 注入時每筆 journal 只顯示前 60 字，過長的 trigger 浪費空間
- 500 字截斷平衡語意完整性與儲存效率
- `journalDefaults` 可讓 developer 在未來調整

## API 介面設計

### instinct.js 修改

```javascript
/**
 * 建立或更新觀察
 * @param {string} sessionId
 * @param {string} type
 * @param {string} trigger
 * @param {string} action
 * @param {string} tag
 * @param {object} [options={}]
 * @param {boolean} [options.skipDedup=false] - 跳過 tag+type 去重，直接建立新記錄
 * @returns {object} instinct 記錄
 */
emit(sessionId, type, trigger, action, tag, options = {})
```

**行為變更**：
- `options.skipDedup === true` 時，跳過 `list.find(i => i.tag === tag && i.type === type)` 查找，直接建立新記錄
- 現有呼叫（不傳 options）行為完全不變

### global-instinct.js 修改

```javascript
/**
 * 查詢全域觀察
 * @param {string} projectRoot
 * @param {object} [filter={}]
 * @param {string} [filter.type]
 * @param {string} [filter.tag]
 * @param {number} [filter.minConfidence]
 * @param {number} [filter.limit]
 * @param {string[]} [filter.excludeTypes] - 排除的 type 清單（新增）
 * @returns {object[]}
 */
function queryGlobal(projectRoot, filter = {})
```

**行為變更**：
- 新增 `filter.excludeTypes` 支援，在 type/tag/minConfidence 過濾後，排除指定 type

### registry.js 新增

```javascript
const journalDefaults = {
  maxPromptLength: 500,   // prompt trigger 截斷長度
  loadTopN: 10,           // SessionStart 載入最近 N 筆 intent_journal
  minResultForGlobal: 'pass',  // 只有 sessionResult=pass 的記錄才提取到摘要
};
```

### on-submit-handler.js 新增記錄邏輯

在現有 `workflow_routing` 記錄後新增：

```javascript
// ── intent_journal 記錄 ──
if (sessionId) {
  try {
    const { journalDefaults } = require('./registry');
    const fullPrompt = userPrompt.slice(0, journalDefaults.maxPromptLength);
    const workflowCtx = currentState?.workflowType
      ? `工作流：${currentState.workflowType}`
      : '無進行中工作流';
    const journalTag = `journal-${Date.now().toString(36)}`;
    const journalRecord = instinct.emit(
      sessionId,
      'intent_journal',
      fullPrompt || '(empty prompt)',
      workflowCtx,
      journalTag,
      { skipDedup: true }
    );
    // 追加 sessionResult 欄位（emit 後更新）
    if (journalRecord) {
      journalRecord.sessionResult = 'pending';
      // _append 更新記錄
      instinct._append(sessionId, journalRecord);
    }
  } catch {
    // 觀察失敗不影響主流程
  }
}
```

**注意**：`_append` 是 private 方法，需要在 `instinct.js` 新增 `emitJournal()` 公開方法或讓 `emit()` 支援 `extraFields` 選項來附加 `sessionResult`。

**決定**：讓 `emit()` 的 options 支援 `extraFields` 物件，附加到新建記錄中：

```javascript
// options = { skipDedup?: boolean, extraFields?: object }
// emit() 新建記錄時：
const instinct = { ...baseFields, ...(options.extraFields || {}) };
```

### session-end-handler.js 新增配對邏輯

```javascript
// ── intent_journal sessionResult 配對 ──
try {
  const instinct = require('./knowledge/instinct');
  const currentState = state.readState(sessionId);
  const sessionResult = resolveSessionResult(currentState);

  const allObs = instinct._readAll(sessionId);
  const journals = allObs.filter(o => o.type === 'intent_journal' && o.sessionResult === 'pending');

  if (journals.length > 0) {
    for (const j of journals) {
      j.sessionResult = sessionResult;
      j.workflowType = currentState?.workflowType || null;
    }
    instinct._writeAll(sessionId, allObs);
  }
} catch (err) {
  hookError('on-session-end', `intent_journal 配對失敗：${err.message}`);
}
```

**resolveSessionResult 邏輯**：

```javascript
function resolveSessionResult(currentState) {
  if (!currentState?.workflowType) return 'abort';
  const completed = currentState.completedStages;
  if (completed && completed.length > 0) return 'pass';
  return 'fail';
}
```

`resolveSessionResult` 為 session-end-handler.js 的模組內私有函式。

**重要**：`_readAll` 和 `_writeAll` 是 `Instinct` class 的 instance methods（非靜態），而 `module.exports = instinct`（class 實例）。因此可直接 `instinct._readAll(sessionId)` 和 `instinct._writeAll(sessionId, list)` 呼叫。

### session-start-handler.js 新增摘要注入

```javascript
// ── 最近常做的事（intent_journal 摘要）──
let recentIntentsMsg = null;
try {
  const globalInstinct = require('./knowledge/global-instinct');
  const { journalDefaults } = require('./registry');
  const journals = globalInstinct.queryGlobal(projectRoot, {
    type: 'intent_journal',
    limit: journalDefaults.loadTopN,
  });
  // 按 lastSeen 降序，取 sessionResult=pass 的記錄
  const passJournals = journals
    .filter(j => j.sessionResult === 'pass')
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, journalDefaults.loadTopN);

  if (passJournals.length > 0) {
    const lines = passJournals.map(j =>
      `- [${j.workflowType || 'unknown'}] ${j.trigger.slice(0, 60)}${j.trigger.length > 60 ? '...' : ''}`
    );
    recentIntentsMsg = ['## 最近常做的事', '', ...lines].join('\n');
  }
} catch {
  // 靜默失敗
}
```

並將 `recentIntentsMsg` 加入 `buildStartOutput` 的 `msgs` 陣列。

**注意**：全域觀察載入段落的 `queryGlobal` 呼叫需加入 `excludeTypes: ['intent_journal']`：

```javascript
const topObs = globalInstinct.queryGlobal(projectRoot, {
  limit: globalInstinctDefaults.loadTopN,
  excludeTypes: ['intent_journal'],  // 新增：排除 journal 記錄
});
```

## 資料模型

### intent_journal 記錄格式

儲存位置：`~/.overtone/sessions/{sessionId}/observations.jsonl`（同現有 instinct）

```json
{
  "id": "inst_lx4abc_def1",
  "ts": "2026-03-05T10:00:00.000Z",
  "lastSeen": "2026-03-05T10:00:00.000Z",
  "type": "intent_journal",
  "trigger": "<完整 prompt 原文，最多 500 字>",
  "action": "工作流：standard",
  "tag": "journal-lx4abc",
  "confidence": 0.3,
  "count": 1,
  "sessionResult": "pending | pass | fail | abort",
  "workflowType": "standard | quick | null"
}
```

**欄位說明**：
- `tag`：`journal-${Date.now().toString(36)}`，每次 prompt 唯一，確保 skipDedup 後不被自動壓縮誤合併
- `sessionResult`：初始 `pending`，session 結束時更新
- `workflowType`：session 結束時從 `currentState` 填入（null 表示無工作流）

### 畢業後全域格式

同現有 global observations 格式，額外有 `globalTs` 欄位：

```json
{
  "id": "inst_lx4abc_def1",
  "type": "intent_journal",
  "trigger": "...",
  "action": "工作流：standard",
  "tag": "journal-lx4abc",
  "confidence": 0.3,
  "sessionResult": "pass",
  "workflowType": "standard",
  "globalTs": "2026-03-05T10:30:00.000Z"
}
```

**畢業邏輯**：`global-instinct.graduate()` 現有邏輯以 `tag+type` 為去重鍵，intent_journal 每筆 tag 唯一，因此每筆 journal 都以全新記錄畢業（`graduated++`，非 `merged++`）。這是預期行為。

## 檔案結構

### 修改的檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `plugins/overtone/scripts/lib/knowledge/instinct.js` | 修改 | `emit()` 新增 `options` 第 6 參數，支援 `skipDedup` 和 `extraFields` |
| `plugins/overtone/scripts/lib/knowledge/global-instinct.js` | 修改 | `queryGlobal()` 新增 `filter.excludeTypes` 支援 |
| `plugins/overtone/scripts/lib/registry.js` | 修改 | 新增 `journalDefaults` 常數，並在 `module.exports` 中匯出 |
| `plugins/overtone/scripts/lib/on-submit-handler.js` | 修改 | 新增 intent_journal 記錄邏輯 |
| `plugins/overtone/scripts/lib/session-end-handler.js` | 修改 | 新增 `resolveSessionResult` + intent_journal 配對邏輯 |
| `plugins/overtone/scripts/lib/session-start-handler.js` | 修改 | 全域觀察載入加 `excludeTypes`，新增「最近常做的事」摘要注入 |
| `plugins/overtone/scripts/data.js` | 修改 | 新增 `query journal` 子命令（Could） |

### 新增的測試檔案

| 檔案 | 說明 |
|------|------|
| `tests/unit/instinct-skip-dedup.test.js` | skipDedup 行為測試 |
| `tests/unit/on-submit-handler.test.js` | 擴展：intent_journal 記錄 |
| `tests/unit/session-end-handler.test.js` | 新建：sessionResult 配對 |

## Dev Phases

### Phase 1：基礎能力（parallel）

- [ ] T1：`instinct.js` emit() 新增 options 第 6 參數（skipDedup + extraFields）| files: `plugins/overtone/scripts/lib/knowledge/instinct.js`
- [ ] T2：`registry.js` 新增 journalDefaults | files: `plugins/overtone/scripts/lib/registry.js`

### Phase 2：記錄與配對（parallel，依賴 Phase 1）

- [ ] T3：`on-submit-handler.js` 新增 intent_journal 記錄邏輯 | files: `plugins/overtone/scripts/lib/on-submit-handler.js`
- [ ] T4：`session-end-handler.js` 新增 resolveSessionResult + 配對邏輯 | files: `plugins/overtone/scripts/lib/session-end-handler.js`

### Phase 3：全域整合（sequential，依賴 Phase 2）

- [ ] T5：`global-instinct.js` queryGlobal 新增 excludeTypes 過濾 | files: `plugins/overtone/scripts/lib/knowledge/global-instinct.js`
- [ ] T6：`session-start-handler.js` 全域觀察加 excludeTypes + 最近常做的事摘要 | files: `plugins/overtone/scripts/lib/session-start-handler.js`

### Phase 4：可選工具（獨立，任何時間點均可）

- [ ] T7：`data.js` 新增 query journal 子命令 | files: `plugins/overtone/scripts/data.js`

### Phase 5：測試覆蓋（parallel，建議 Phase 2 完成後）

- [ ] T8a：新建 `instinct-skip-dedup.test.js` | files: `tests/unit/instinct-skip-dedup.test.js`
- [ ] T8b：擴展 `on-submit-handler.test.js` 加 intent_journal 測試 | files: `tests/unit/on-submit-handler.test.js`
- [ ] T8c：新建 `session-end-handler.test.js` 加 sessionResult 配對測試 | files: `tests/unit/session-end-handler.test.js`
