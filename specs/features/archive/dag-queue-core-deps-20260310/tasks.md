---
feature: dag-queue-core-deps
status: in-progress
workflow: standard
created: 2026-03-10T00:00:00.000Z
---

## Stages

- [x] plan
- [x] arch
- [ ] test:spec
- [ ] dev
- [ ] review
- [ ] test:verify
- [ ] retro
- [ ] docs

## Tasks

## Dev Phases

### Phase 1: 資料模型與基礎驗證 (sequential)
- [ ] 擴展 item 資料結構（dependsOn 欄位）+ readQueue 向後相容補丁 + _validateItems 引用存在性驗證 | files: ~/.claude/scripts/lib/execution-queue.js

### Phase 2: 環偵測與排程邏輯 (sequential, depends: 1)
- [ ] 實作 _detectCycle（DFS）並合入 _validateItems + 實作 _isReady + 改造 getNext / advanceToNext | files: ~/.claude/scripts/lib/execution-queue.js

### Phase 3: 測試更新 (sequential, depends: 2)
- [ ] 更新 execution-queue.test.js（新增 DAG 基本行為測試）+ 更新 execution-queue-enhancement.test.js（新增循環依賴、失敗傳播、_isReady 邊界測試） | files: ~/projects/overtone/tests/unit/execution-queue.test.js, ~/projects/overtone/tests/unit/execution-queue-enhancement.test.js
