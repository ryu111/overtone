# Tasks：SessionContext 架構收斂重構

## 任務清單

- [ ] Phase 1：遷移 6 個未遷移 handler
- [ ] Phase 2：遷移非 handler 消費者（7 個模組）
- [x] Phase 3：刪除 overload 函式 + 加 alias
- [ ] Phase 4：測試遷移 + session-factory 推廣
- [ ] Phase 5（可選）：移除 alias + 重命名 Ctx 後綴

## Dev Phases

### Phase 1: 遷移 6 個未遷移 handler (partial parallel)

以下 5 個 handler 互相不依賴，可並行：

- [ ] 遷移 pre-compact-handler.js — 補 ctx + 改 readStateCtx / updateStateAtomicCtx / emitCtx | files: ~/.claude/scripts/lib/pre-compact-handler.js, tests/unit/pre-compact-handler.test.js, tests/integration/pre-compact.test.js
- [ ] 遷移 on-submit-handler.js — 補 ctx + 改 readStateCtx | files: ~/.claude/scripts/lib/on-submit-handler.js, tests/unit/on-submit-handler.test.js, tests/integration/on-submit.test.js
- [ ] 遷移 session-start-handler.js — 補 ctx + 改 sanitizeCtx / emitCtx | files: ~/.claude/scripts/lib/session-start-handler.js, tests/unit/session-start-handler.test.js, tests/integration/session-start.test.js
- [ ] 遷移 session-end-handler.js — 補 ctx + 修復兩處舊 API | files: ~/.claude/scripts/lib/session-end-handler.js, tests/unit/session-end-handler.test.js
- [ ] 遷移 post-use-failure-handler.js — timeline.emit → emitCtx | files: ~/.claude/scripts/lib/post-use-failure-handler.js, tests/unit/post-use-failure-handler.test.js

post-use-handler.js 不呼叫 state/timeline，不列入（確認無需改動即可）

每步完成後執行 `bun scripts/test-parallel.js` 確認 0 fail。

### Phase 2: 遷移非 handler 消費者 (parallel)

以下模組互相不依賴，可並行：

- [ ] 遷移 feature-sync.js | files: ~/.claude/scripts/lib/feature-sync.js, tests/unit/feature-sync.test.js
- [ ] 遷移 hook-utils.js | files: ~/.claude/scripts/lib/hook-utils.js
- [ ] 遷移 session-digest.js | files: ~/.claude/scripts/lib/session-digest.js
- [ ] 遷移 baseline-tracker.js | files: ~/.claude/scripts/lib/baseline-tracker.js, tests/integration/performance-baseline.test.js
- [ ] 遷移 dashboard/sessions.js | files: ~/.claude/scripts/lib/dashboard/sessions.js, tests/integration/dashboard-sessions.test.js
- [ ] 遷移 remote/event-bus.js | files: ~/.claude/scripts/lib/remote/event-bus.js
- [ ] 遷移 remote/dashboard-adapter.js | files: ~/.claude/scripts/lib/remote/dashboard-adapter.js

### Phase 3: 刪除 overload 函式 (sequential)

- [x] state.js 加 instanceof SessionContext alias 分支，舊 API 分支委託 Ctx | files: ~/.claude/scripts/lib/state.js
- [x] timeline.js 加 instanceof SessionContext alias 分支 | files: ~/.claude/scripts/lib/timeline.js
- [x] 執行全量測試確認 0 fail（4999 pass） | files: —

### Phase 4: 測試遷移 + session-factory 推廣 (parallel batches)

- [ ] unit 測試批次 A — state 相關 unit tests（state-multi-instance / state-sanitize / state-invariants / cas-retry）| files: tests/unit/state-*.test.js, tests/unit/cas-retry.test.js
- [ ] unit 測試批次 B — handler unit tests（agent-stop / session-stop / pre-task / convergence-gate）| files: tests/unit/agent-stop-handler.test.js, tests/unit/session-stop-handler.test.js, tests/unit/pre-task-handler.test.js, tests/unit/convergence-gate-fix.test.js
- [ ] unit 測試批次 C — 其他 unit tests 含 initState | files: 其餘 tests/unit/*.test.js
- [ ] integration 測試批次 — 所有 integration tests 含 initState | files: tests/integration/*.test.js

### Phase 5: 清理（可選，sequential）

- [ ] 移除 alias（readState = readStateCtx 等），統一 rename Ctx 後綴 | files: ~/.claude/scripts/lib/state.js, ~/.claude/scripts/lib/timeline.js, 所有呼叫端
- [ ] 刪除 paths.js 的 _isProjectRoot | files: ~/.claude/scripts/lib/paths.js
