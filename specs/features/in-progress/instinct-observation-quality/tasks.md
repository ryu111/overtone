---
feature: instinct-observation-quality
workflow: standard
status: in-progress
created: 2026-02-28
---

# Tasks: instinct-observation-quality

## Stages

- [ ] PLAN
- [ ] ARCH
- [ ] TEST
- [ ] DEV
- [ ] REVIEW
- [ ] TEST
- [ ] RETRO
- [ ] DOCS

## Dev Phases

### Phase 1: 核心修復 (parallel)
- [ ] instinct.js emit() 飽和閾值 — confidence >= 1.0 時不再 append JSONL | files: plugins/overtone/scripts/lib/instinct.js, tests/integration/instinct.test.js
- [ ] post-use.js wording 偵測排除 code fence — ``` 區塊內不偵測 | files: plugins/overtone/hooks/scripts/tool/post-use.js, tests/integration/wording.test.js

### Phase 2: 新增觀察類型 (parallel)
- [ ] on-stop.js 新增 agent_performance 觀察 — 記錄 agent pass/fail/reject | files: plugins/overtone/hooks/scripts/agent/on-stop.js, tests/integration/agent-on-stop.test.js
- [ ] on-submit.js 新增 workflow_routing 觀察 — 記錄 workflow 選擇 | files: plugins/overtone/hooks/scripts/prompt/on-submit.js, tests/integration/on-submit-instinct.test.js

### Phase 3: 修正現有觀察 (sequential)
- [ ] search-tools 觀察改為反面糾正 — Bash grep/find 時記錄，Grep/Glob 不記錄 | files: plugins/overtone/hooks/scripts/tool/post-use.js, tests/integration/post-use-bash.test.js

### Phase 4: 文件同步 (parallel)
- [ ] evolve skill 更新 — 更新 V1 觀察類型清單 | files: plugins/overtone/skills/evolve/SKILL.md
- [ ] confidence-scoring.md 更新 — 同步觀察類型表格 | files: plugins/overtone/skills/evolve/references/confidence-scoring.md
