---
feature: queue-workflowid-integration
status: archived
workflow: standard
created: 2026-03-09T11:07:03.722Z
archivedAt: 2026-03-09T11:28:55.917Z
---
## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [x] DOCS

## Tasks

### Dev Phases

**Phase A（parallel）**

- [ ] A1：修復 `queue.js` guardDiscoveryMode — 讀取 activeWorkflowId 後傳入 readState，並加入 PM stage 完成後放行邏輯（修復 C1 + C2）
  - 檔案：`~/.claude/scripts/queue.js`
- [ ] A2：修復 `session-stop-handler.js` `_isRelatedQueueItem` — 改為精確匹配（normalize 後 `===`），取代過鬆的 `includes()`（修復 m1）
  - 檔案：`~/.claude/scripts/lib/session-stop-handler.js`

**Phase B（sequential，依序執行）**

- [ ] B1：修改 `execution-queue.js` — writeQueue/appendQueue 的 item map 加入 `workflowId` 欄位（M1），failCurrent 加入 `name` 精確匹配參數（m3）
  - 檔案：`~/.claude/scripts/lib/execution-queue.js`
- [ ] B2：修改 `heartbeat.js` — completeCurrent/failCurrent 呼叫時傳入 `state.activeSession.itemName` 做精確匹配（M2）（depends on B1 的 failCurrent name 參數）
  - 檔案：`~/.claude/scripts/heartbeat.js`
- [ ] B3：修改 `init-workflow.js` — 初始化完成後，讀取佇列找到對應 feature item 並回寫 workflowId（m2）（depends on B1 的 workflowId 欄位）
  - 檔案：`~/.claude/scripts/init-workflow.js`
