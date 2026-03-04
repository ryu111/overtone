---
feature: test-suite-slimdown
status: in-progress
workflow: standard
created: 2026-03-04T04:58:54.653Z
---

## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [ ] REVIEW
- [x] RETRO
- [ ] DOCS

## Tasks

### Phase 1：移除/合併低價值測試（可並行）

- [ ] 1. 合併 `platform-alignment-agents.test.js` 展開的逐 agent 存在性測試
  - 目標：從 53 個 test 減至約 10 個 group test
  - 檔案：`tests/unit/platform-alignment-agents.test.js`

- [ ] 2. 刪除/降級 `guard-coverage.test.js`
  - 確認 test-quality-guard 已涵蓋後，降為 1 個 smoke test
  - 檔案：`tests/unit/guard-coverage.test.js`、`tests/unit/test-quality-guard.test.js`

- [ ] 3. 修正計數硬編碼（Anti-Pattern 5）
  - `platform-alignment-registry.test.js`：`toBe(27)` → `toBeGreaterThanOrEqual`
  - `registry.test.js`：`toBe(16)`、`toBe(4)`、`toBe(11)` → `toBeGreaterThanOrEqual`
  - `health-check.test.js`：`toBe(11)` → `toBeGreaterThanOrEqual`

### Phase 2：驗收（依賴 Phase 1 完成）

- [ ] 4. 執行 `bun test`，確認全部 pass 且執行時間 < 40 秒

## Dev Phases

### Phase 1: 低價值測試移除（parallel）
- [ ] 合併 platform-alignment-agents.test.js 展開 test 為迴圈 assertions | files: tests/unit/platform-alignment-agents.test.js
- [ ] 刪除 guard-coverage.test.js | files: tests/unit/guard-coverage.test.js
- [ ] 修正計數硬編碼（platform-alignment-registry / registry / health-check） | files: tests/unit/platform-alignment-registry.test.js, tests/unit/registry.test.js, tests/unit/health-check.test.js

### Phase 2: 驗收（sequential，依賴 Phase 1）
- [ ] 執行 bun test，確認全部 pass 且執行時間 < 40 秒 | files: （執行結果）
