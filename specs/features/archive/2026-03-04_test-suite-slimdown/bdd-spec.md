# Feature: test-suite-slimdown — 測試套件瘦身

## 背景

Overtone 測試套件執行時間約 55 秒，原因包含：
1. platform-alignment-agents.test.js 以「每個 agent × 每個欄位 = 1 個 test」的展開模式產生 53 個冗餘測試
2. guard-coverage.test.js 是「守衛的守衛」，驗證的是靜態存在性事實，不帶行為價值
3. 3 個測試檔中有計數硬編碼（`toBe(N)`），新增合法元件就會爆

本 Feature 透過三個子任務（A/B/C）解決以上問題。

---

## 子任務 A：platform-alignment-agents 測試合併

### Scenario A-1：純唯讀 agent disallowedTools 合併後仍完整驗證

GIVEN platform-alignment-agents.test.js 已修改
AND Scenario 1a-1 原有 20 個獨立 test（5 agents × 4 fields）
WHEN 執行 `bun test tests/unit/platform-alignment-agents.test.js`
THEN Scenario 1a-1 應有 1 個 test 包含所有 assertions
AND 5 個純唯讀 agent（code-reviewer、debugger、security-reviewer、database-reviewer、retrospective）每個都驗證 Write、Edit、Task、NotebookEdit 四個欄位
AND 測試失敗時錯誤訊息能定位到具體的 agent 名稱（使用 expect 第二參數）

### Scenario A-2：所有 Scenario 的 test 數量從 53 降至 ≤ 18

GIVEN platform-alignment-agents.test.js 已修改（展開 test → 迴圈 assertions）
WHEN 執行 `bun test tests/unit/platform-alignment-agents.test.js --reporter verbose`
THEN 此檔案的 test 數量應 ≤ 18 個
AND describe 標題（例如 "Scenario 1a-1: 純唯讀 agent 設定 disallowedTools"）仍保留
AND 全部 test 均 pass

### Scenario A-3：17 個 agent 的 disallowedTools 覆蓋不漏失

GIVEN platform-alignment-agents.test.js 已修改
WHEN 執行測試
THEN 以下分類仍各有對應的 test 驗證：
  - 純唯讀 5 個 agent（禁 Write/Edit/Task/NotebookEdit）
  - architect（允許 Write/Edit，禁 Task/NotebookEdit）
  - planner（允許 Write/Edit，禁 Task/NotebookEdit）
  - qa（允許 Write，禁 Edit/Task/NotebookEdit）
  - product-manager 和 designer（只禁 Task/NotebookEdit）
  - grader（tools 白名單，非 disallowedTools）
  - 6 個無工具限制 agent
  - 10 個已遷移 agent（無舊 tools 白名單）

### Scenario A-4：新增 agent 到無限制清單不需修改 test

GIVEN platform-alignment-agents.test.js 使用迴圈 assertions 而非展開 test
AND 有開發者新增一個無工具限制的 agent 到 unrestrictedAgents 清單
WHEN 執行 `bun test tests/unit/platform-alignment-agents.test.js`
THEN 不需修改 test 邏輯，新 agent 自動被迴圈覆蓋
AND 測試仍然 pass

---

## 子任務 B：刪除 guard-coverage.test.js

### Scenario B-1：guard-coverage.test.js 不再存在

GIVEN 執行了刪除 guard-coverage.test.js 的操作
WHEN 列出 tests/unit/ 目錄
THEN 不存在 guard-coverage.test.js 檔案

### Scenario B-2：刪除後其他測試不受影響

GIVEN guard-coverage.test.js 已刪除
WHEN 執行 `bun test`（完整測試套件）
THEN 所有其他測試仍然 pass（0 fail）
AND test-quality-guard.test.js 繼續運作正常
AND test-quality-guard 不因找不到 guard-coverage.test.js 而失敗

### Scenario B-3：被 guard-coverage 監控的守衛模組測試仍然存在

GIVEN guard-coverage.test.js 已刪除
WHEN 逐一檢查原本被監控的守衛模組對應測試
THEN 以下測試檔案仍然存在且可執行：
  - tests/unit/docs-sync-engine.test.js
  - tests/unit/session-cleanup.test.js
  - tests/unit/test-quality-scanner.test.js
  - tests/unit/dead-code-scanner.test.js
  - tests/unit/component-repair.test.js
  - tests/unit/hook-diagnostic.test.js
  - tests/unit/guard-system.test.js
AND 刪除 guard-coverage 不連帶刪除這些守衛模組的測試

---

## 子任務 C：修正計數硬編碼

### Scenario C-1：timelineEvents 計數改為 >= 比較

GIVEN platform-alignment-registry.test.js 已修改 Scenario 1h-2
WHEN 執行 `bun test tests/unit/platform-alignment-registry.test.js`
THEN 不存在 `expect(...).toBe(27)` 針對 timelineEvents 數量的斷言
AND 改為 `toBeGreaterThanOrEqual(27)`
AND 同時驗證 3 個代表性事件存在：'tool:failure'、'stage:start'、'workflow:start'
AND 測試 pass

### Scenario C-2：新增 timeline event 後 platform-alignment-registry 不爆

GIVEN timelineEvents 從 27 項增加到 28 項
WHEN 執行 `bun test tests/unit/platform-alignment-registry.test.js`
THEN 測試仍然 pass（不因 `toBe(27)` 而失敗）

### Scenario C-3：registry.test.js stages 和 hookEvents 計數改為 >= 比較

GIVEN registry.test.js 已修改
WHEN 執行 `bun test tests/unit/registry.test.js`
THEN stages 數量的斷言為 `toBeGreaterThanOrEqual(16)`（非 `toBe(16)`）
AND hookEvents 數量的斷言為 `toBeGreaterThanOrEqual(11)`（非 `toBe(11)`）
AND `quick.stages.length` 的斷言仍保留 `toBe(4)`（固定設計規格）
AND 全部測試 pass

### Scenario C-4：新增合法 stage 後 registry.test.js 不爆

GIVEN registry.js 新增了一個 stage（從 16 項增至 17 項）
WHEN 執行 `bun test tests/unit/registry.test.js`
THEN 測試仍然 pass（不因 `toBe(16)` 而失敗）

### Scenario C-5：health-check.test.js checks 計數改為 >= 比較

GIVEN health-check.test.js 已修改
WHEN 執行 `bun test tests/unit/health-check.test.js`
THEN `runAllChecks` 的 checks 長度斷言為 `toBeGreaterThanOrEqual(11)`（非 `toBe(11)`）
AND 全部測試 pass

### Scenario C-6：新增 health check 後 health-check.test.js 不爆

GIVEN health-check.js 新增了第 12 個 check
WHEN 執行 `bun test tests/unit/health-check.test.js`
THEN 測試仍然 pass（不因 `toBe(11)` 而失敗）

---

## 整合驗收條件

### Scenario D-1：全量測試 pass（0 fail）

GIVEN 三個子任務（A/B/C）均已完成
WHEN 從專案根目錄執行 `bun test`
THEN exit code 為 0（全部 pass）
AND 沒有任何 FAIL 或 Error 訊息

### Scenario D-2：測試數量從 ~3235 降至 ~3100

GIVEN 三個子任務均已完成
WHEN 執行 `bun test` 並觀察輸出摘要
THEN 總 test 數量 ≤ 3170
AND 相比改前減少 ≥ 60 個 test

### Scenario D-3：執行時間從 55 秒降至 < 40 秒

GIVEN 三個子任務均已完成
WHEN 執行 `bun test` 並計時
THEN 執行完畢耗時 < 40 秒

### Scenario D-4：不誤刪高價值測試

GIVEN 三個子任務均已完成
WHEN 審查測試覆蓋
THEN 以下測試類型均保留且可執行：
  - platform-alignment 的所有 Scenario（1a 系列 + 1b 系列 + S10 系列）
  - guard 模組的 unit test（docs-sync-engine、dead-code-scanner 等）
  - hook 整合測試（agent-on-stop、session-start、on-submit、pre-bash-guard）
  - test-quality-guard.test.js 和 dead-code-guard.test.js
AND 以上測試全部 pass
