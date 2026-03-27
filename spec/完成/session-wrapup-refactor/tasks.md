# Session 收尾架構重構 — 任務清單

## 依賴分析

```
Phase 1（並行）: T1 + T2（無依賴，獨立檔案）
Phase 2（並行）: T3a + T3b + T3c（無依賴，各自修改獨立腳本）
Phase 3（串行）: T4（依賴 Phase 1 的 marker 模組 + Phase 2 的 export 函式）
Phase 4（串行）: T5（依賴 Phase 3 的 hook 設定 + 規則更新）
Phase 5（串行）: T6（依賴 Phase 4 全部完成）
```

---

## Phase 1：基礎模組（parallel）

### T1: wrapup-marker.js — marker 讀寫模組
- **檔案**：`~/.claude/scripts/wrapup-marker.js`（新增）
- **內容**：
  - `writeMarker(sessionId, phases, status)` — 寫入 `~/.claude/data/last-wrapup.json`
  - `readMarker()` — 讀取（不存在/損壞 → null）
  - `isComplete(sessionId)` — 檢查指定 session 是否已收尾
- **驗收**：`bun test wrapup-marker.test.js` pass

### T2: wrapup-marker.test.js — 單元測試
- **檔案**：`~/projects/nova-brain/tests/unit/wrapup-marker.test.js`（新增）
- **內容**：
  - writeMarker 寫入正確格式
  - readMarker 讀取 / 不存在 / 損壞
  - isComplete 匹配 session_id / 不匹配 / marker 不存在
  - status = 'partial' 視為已完成
  - status = 'failed' 視為未完成
- **驗收**：全部 pass

---

## Phase 2：Daemon 腳本重構（parallel）

### T3a: maintainer.js — export runMaintainer()
- **檔案**：`~/.claude/scripts/maintainer.js`（修改）
- **內容**：
  - 提取 `main()` 的核心邏輯為 `export async function runMaintainer()`
  - `runMaintainer()` 包含 Phase 1-4（收集 → 決策 → 執行 → 記錄）
  - `main()` 改為呼叫 `runMaintainer()` + reportStatus
  - 保留 `if (import.meta.main)` 入口（daemon 模式不受影響）
- **驗收**：`bun test maintainer` pass + `bun ~/.claude/scripts/maintainer.js` 仍可直接執行

### T3b: learner.js — export runLearner()
- **檔案**：`~/.claude/scripts/learner.js`（修改）
- **內容**：
  - 提取 `main()` 的核心邏輯為 `export async function runLearner()`
  - `runLearner()` 包含 Step 1-5
  - `main()` 改為呼叫 `runLearner()` + reportStatus
  - 保留 `if (import.meta.main)` 入口
- **驗收**：`bun test learner` pass + `bun ~/.claude/scripts/learner.js` 仍可直接執行

### T3c: judge.js — export runJudge()
- **檔案**：`~/.claude/scripts/judge.js`（修改）
- **內容**：
  - 提取 `main()` 的核心邏輯為 `export async function runJudge()`
  - `runJudge()` 包含完整評分流程（收集 → 評分 → 改善建議 → 截斷）
  - `main()` 改為呼叫 `runJudge()` + reportStatus + globalTimer
  - 保留 `if (import.meta.main)` 入口
- **驗收**：`bun test judge` pass + `bun ~/.claude/scripts/judge.js` 仍可直接執行

---

## Phase 3：Hook 層（sequential，依賴 Phase 1 + 2）

### T4: Stop Hook + SessionEnd 安全網 + settings.json
- **檔案**：
  - `~/.claude/hooks/wrapup-stop-hook.sh`（新增）
  - `~/.claude/hooks/session-wrapup-safety.js`（新增）
  - `~/.claude/settings.json`（修改）
  - `~/.claude/rules/總結格式.md`（修改）
- **內容**：
  - **wrapup-stop-hook.sh**：讀取 stdin → 解析 session_id → 讀取 marker → 匹配/放行/block
  - **session-wrapup-safety.js**：讀取 stdin → 檢查 marker → 不存在時 import runMaintainer() 執行確定性收尾
  - **settings.json**：
    - 新增 `"Stop"` hook 項目（wrapup-stop-hook.sh）
    - SessionEnd 移除 maintainer.js/learner.js/judge.js，新增 session-wrapup-safety.js
  - **rules/總結格式.md**：新增收尾 executor 委派指示（Phase 1 並行 learner+judge → Phase 2 maintainer → 寫 marker）
- **驗收**：
  - `echo '{"session_id":"test"}' | bash ~/.claude/hooks/wrapup-stop-hook.sh` → block output
  - marker 存在時 → 放行（exit 0，無 stdout）

---

## Phase 4：測試與架構防護（sequential，依賴 Phase 3）

### T5: 整合測試 + 架構測試
- **檔案**：
  - `~/projects/nova-brain/tests/unit/session-wrapup.test.js`（新增）
  - `~/projects/nova-brain/tests/unit/architecture.test.js`（修改）
- **內容**：
  - **session-wrapup.test.js**：
    - 安全網：marker 存在 → skip
    - 安全網：marker 不存在 → 呼叫 runMaintainer
    - Stop Hook 腳本存在且可執行
  - **architecture.test.js**：
    - wrapup-stop-hook.sh 存在
    - session-wrapup-safety.js 存在
    - settings.json 包含 Stop hook
    - settings.json 的 SessionEnd 不包含 maintainer.js/learner.js/judge.js
- **驗收**：`bun test` 全量通過

---

## Phase 5：全量驗證（sequential，依賴 Phase 4）

### T6: 全量測試 + 手動驗證
- **執行**：
  1. `bun test` — 全量 unit pass
  2. `bun test:all` — unit + integration pass
  3. 驗證 daemon 獨立執行：`bun ~/.claude/scripts/maintainer.js`（仍可 fork）
  4. 驗證 Stop Hook：
     - 無 marker → `echo '{"session_id":"s1"}' | bash ~/.claude/hooks/wrapup-stop-hook.sh` → block
     - 有 marker → 先寫 marker → 再執行 → 放行
  5. 驗證 settings.json 生效：新 session 啟動後 hook 正確觸發
- **驗收**：所有步驟 pass，exit code 0 證據

---

## 不修改的檔案（明確排除）

| 檔案 | 原因 |
|------|------|
| daemon-utils.js | heartbeat 仍使用 setupSelfFork/setupLock，不動 |
| heartbeat.js | 不是收尾腳本，保持現狀 |
| session-spawner.js | heartbeat 繼續帶 DISABLE_HOOKS=1（保守安全），不動 |
| flow-observer.js | 已有 agent_dispatch/agent_complete 事件，不需修改 |
| server.js | 不新增邏輯（事件自動流過 bus） |
| Ralph Loop plugin | 第三方 plugin，不修改 |
