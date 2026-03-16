# R4 E2E 驗證 — 任務清單

## Phase 1：整合測試撰寫（sequential）

### T1: 建立 r4-self-drive-loop.test.js
- **執行者**：executor
- **檔案**：`~/projects/overtone/tests/unit/r4-self-drive-loop.test.js`
- **內容**：
  1. 共用 mock 資料定義（MOCK_GAPS、MOCK_WEAK_CAPS、MOCK_SCORES、MOCK_ROADMAP、MOCK_NOTION_TASKS）
  2. 能力 1：gap-analyzer → gap-discovery 4 源聚合（2 tests）
  3. 能力 2：discoverGaps → syncToNotion 完整鏈路（2 tests）
  4. 能力 3：heartbeat poll → executeTask 完整生命週期（2 tests）
  5. 能力 4：capability-probe 多 session 累積 → 門檻觸發（2 tests）
  6. 能力 5：task-adapter 探索 → 學習 → 複用循環（2 tests）
- **驗收**：10 個測試案例完成、語法正確
- **關鍵 import 路徑**：
  - `import { discoverGaps, syncToNotion } from '/Users/sbu/.claude/scripts/gap-discovery.js'`
  - `import { probeSession, getBoundary, saveBoundary, getWeakCapabilities } from '/Users/sbu/.claude/scripts/capability-probe.js'`
  - `import { planForTask, recordOutcome, lookupPattern, classifyTask } from '/Users/sbu/.claude/scripts/task-adapter.js'`
  - `import { poll, executeTask, readState, writeState } from '/Users/sbu/.claude/scripts/heartbeat.js'`
  - `import { matchToolsByKeyword } from '/Users/sbu/.claude/scripts/tool-matcher.js'`
- **DI 模式參考**：
  - gap-discovery: `discoverGaps({ _mock: {...}, skipNotion: true, _deps: {...} })`
  - capability-probe: `probeSession(eventsFile, { boundaryFile, dataDir, improvementsFile, matchTools, existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync })`
  - task-adapter: `planForTask(desc, {}, { patternsFile, existsSync, readFileSync, writeFileSync, mkdirSync, matchTools, suggestDepth })`
  - heartbeat: `poll({_stateFile}, { listTasks, claimTask })` / `executeTask(task, {_stateFile}, { spawnSession, completeTask, resetTask, summaryFile })`

## Phase 2：驗證（sequential，依賴 Phase 1）

### T2: 執行全量測試
- **執行者**：executor
- **命令**：`cd ~/projects/overtone && bun test`
- **驗收**：
  - 新增測試全部 pass
  - 既有測試不受影響（0 regression）
  - 總執行時間 < 5 秒
