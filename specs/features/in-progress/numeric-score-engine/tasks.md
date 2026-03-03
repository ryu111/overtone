---
feature: numeric-score-engine
workflow: quick
status: in-progress
---

## Stages

- [x] DEV
- [x] REVIEW
- [x] TEST
- [x] RETRO
- [x] DOCS

## Dev Phases

### Phase 1: 基礎設定與路徑 (parallel)
- [ ] 在 registry.js 新增 scoringConfig 和 scoringDefaults 常數並 export | files: plugins/overtone/scripts/lib/registry.js
- [ ] 在 paths.js global 物件新增 scores 路徑函式 | files: plugins/overtone/scripts/lib/paths.js

### Phase 2: score-engine.js 核心模組 (sequential, depends: 1)
- [ ] 實作 score-engine.js（saveScore / queryScores / getScoreSummary / _readAll / _trimIfNeeded） | files: plugins/overtone/scripts/lib/score-engine.js

### Phase 3: 整合層 (parallel, depends: 2)
- [ ] 更新 grader.md — 新增 Node.js 呼叫 score-engine saveScore 步驟（extend 現有 Bash 步驟） | files: plugins/overtone/agents/grader.md
- [ ] 更新 stop-message-builder.js — PASS 分支插入評分提示訊息和閾值警告邏輯 | files: plugins/overtone/scripts/lib/stop-message-builder.js
- [ ] 更新 on-stop.js — 傳遞 scoringConfig + lastScore 給 buildStopMessages，處理 emitQualitySignal stateUpdate | files: plugins/overtone/hooks/scripts/agent/on-stop.js

### Phase 4: 測試 (parallel, depends: 3)
- [ ] 撰寫 score-engine 單元測試（saveScore / queryScores / getScoreSummary / trim） | files: tests/unit/score-engine.test.js
- [ ] 撰寫 SubagentStop 整合測試（評分提示 + instinct 回饋 + 非評分 stage 不觸發） | files: tests/integration/grader-score-engine.test.js
