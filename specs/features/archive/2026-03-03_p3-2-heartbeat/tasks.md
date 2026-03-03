---
feature: p3-2-heartbeat
status: archived
workflow: standard
created: 2026-03-03T15:39:50.753Z
archivedAt: 2026-03-03T16:39:51.127Z
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

## Dev Phases

### Phase 1: 基礎模組（parallel）
- [ ] 建立 `scripts/heartbeat.js` daemon 骨架（start/stop/status/_daemon 子命令 + PID 檔管理 + fork-detach 模式 + polling loop 空殼 + SIGTERM 清理 + heartbeat-state.json 讀寫） | files: plugins/overtone/scripts/heartbeat.js
- [ ] 建立 `scripts/lib/session-spawner.js`（_buildArgs 參數組裝 + spawn + stream-json sessionId 解析 + exit code 監聽 + timeout 兜底 + outcome Promise） | files: plugins/overtone/scripts/lib/session-spawner.js

### Phase 2: 佇列整合與安全邊界（sequential, depends: 1）
- [ ] 實作 polling 佇列監聽（getCurrent/advanceToNext/spawnSession 整合）+ 安全邊界（activeSession 並行鎖 + consecutiveFailures 暫停）+ execution-queue.js 新增 failCurrent() + paths.js 新增 HEARTBEAT_PID_FILE/HEARTBEAT_STATE_FILE 常數 | files: plugins/overtone/scripts/heartbeat.js, plugins/overtone/scripts/lib/execution-queue.js, plugins/overtone/scripts/lib/paths.js

### Phase 3: Telegram 通知（sequential, depends: 2）
- [ ] 新增 TelegramAdapter.notify(message) 公開方法 + heartbeat Telegram 事件通知整合（spawn 開始/完成/失敗/暫停） | files: plugins/overtone/scripts/lib/remote/telegram-adapter.js, plugins/overtone/scripts/heartbeat.js

### Phase 4: 測試（parallel, depends: 3）
- [ ] 撰寫 `tests/unit/session-spawner.test.js`（mock spawn EventEmitter、stream-json 解析、timeout、_buildArgs 參數組裝、sessionId 萃取） | files: tests/unit/session-spawner.test.js
- [ ] 撰寫 `tests/unit/heartbeat.test.js`（start/stop/status、stale PID 清理、polling 邏輯、activeSession 並行鎖、paused 跳過、連續失敗暫停、成功 reset） | files: tests/unit/heartbeat.test.js

### Phase 5: Should 項目（parallel, depends: 4）
- [ ] Telegram `/run <featureName> [workflow]` 命令（telegram-adapter.js `_handleUpdate` 擴充 + `_handleHelp` 更新） | files: plugins/overtone/scripts/lib/remote/telegram-adapter.js
- [ ] health-check.js 新增 heartbeat-daemon 偵測（第 8 項：讀 PID 檔 + `process.kill(pid, 0)` 存活確認） | files: plugins/overtone/scripts/health-check.js
