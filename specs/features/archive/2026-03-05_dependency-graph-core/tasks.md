# Tasks: dependency-graph-core

## Dev Phases

### Phase 1: 核心模組 + CLI (parallel)
- [x] 實作 `dependency-graph.js` 核心模組（buildGraph + 四類掃描器 + DependencyGraph 物件） | files: plugins/overtone/scripts/lib/dependency-graph.js
- [x] 實作 `impact.js` CLI 入口（CLI 參數解析 + 文字/JSON 格式化輸出） | files: plugins/overtone/scripts/impact.js

### Phase 2: 測試 (sequential)
- [x] 撰寫 BDD 驗收測試（三個場景：testing-conventions.md 影響鏈 / developer.md 依賴 / hook require 追蹤） | files: tests/unit/dependency-graph.test.js
