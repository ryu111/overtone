# Convergence Gate Fix — 任務清單

`convergence-gate-fix`

## 子任務

- [x] ARCH
- [ ] TEST:spec
- [x] DEV
- [x] REVIEW
- [ ] TEST:2
- [x] RETRO
- [x] DOCS

## Dev Phases

### Phase 1: 方向 B — agent-stop-handler 修復 (sequential)
- [ ] 移除 L89 的 `findActualStageKey(currentState, stageKey)` 呼叫；新增 `let resolvedActualStageKey = null` closure；在第二個 `updateStateAtomic` callback 內加入 stage key 查找（findActualStageKey + completed+pass 補位）；將 statusline 更新和 early exit 移到第二個 updateStateAtomic 之後 | files: `plugins/overtone/scripts/lib/agent-stop-handler.js`

### Phase 2: 方向 C — pre-task sanitize 插入 (sequential)
- [ ] 在 handlePreTask 通過路徑的 state.updateStateAtomic 之前插入 `try { state.sanitize(sessionId); } catch {}` | files: `plugins/overtone/scripts/lib/pre-task-handler.js`

### Phase 3: 測試覆蓋 (parallel)
- [ ] 新增並行收斂測試：兩個 agent 連續呼叫 handleAgentStop，驗證 parallelDone=2、stage=completed、無 early exit | files: `tests/unit/agent-stop-handler.test.js`
- [ ] 新增 pre-task sanitize 測試：孤兒 active stage（無 completedAt）在 handlePreTask 委派前被修復為 pending | files: `tests/unit/pre-task-handler.test.js`
