# Tasks: smart-scheduling

## 子任務清單

- [ ] 子任務 1：修改 `suggestOrder` 加入失敗率二次排序 | agent: developer
- [ ] 子任務 2：新增 `getWorkflowFailureRates` 函式 | agent: developer
- [ ] 子任務 3：修改 `queue.js` CLI 支援 `--smart` flag | agent: developer
- [ ] 子任務 4：新增單元測試（suggestOrder with failureData） | agent: developer

## Dev Phases

### Phase 1: 核心邏輯（sequential）

- [ ] 新增 `getWorkflowFailureRates(projectRoot, window?)` 至 `failure-tracker.js`，module.exports 匯出 | files: `plugins/overtone/scripts/lib/failure-tracker.js`
- [ ] 修改 `suggestOrder(projectRoot, options?)` 加入 failureRate 二次排序鍵 | files: `plugins/overtone/scripts/lib/execution-queue.js`

### Phase 2: CLI + 測試（parallel）

- [ ] 修改 `cmdSuggestOrder` 支援 `--smart` flag，解析 flag 並傳入 failureData | files: `plugins/overtone/scripts/queue.js`
- [ ] 追加 `suggestOrder with failureData` describe 區塊至測試檔 | files: `tests/unit/queue-smart-schedule.test.js`
