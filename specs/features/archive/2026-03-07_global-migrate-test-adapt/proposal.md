# Proposal: 測試路徑適配（global-migrate-test-adapt）

## 需求背景

Overtone 全域遷移第 5 步。元件已從 `plugins/overtone/` 搬到 `~/.claude/`，路徑替換已完成。
現在需要更新測試檔案的路徑引用，讓它們指向 `~/.claude/` 下的模組，確保測試套件在新路徑架構下正常執行。

## 使用者故事

**作為** Overtone 開發者，
**我希望** 執行 `bun scripts/test-parallel.js` 時測試全數通過，
**以便** 確認全域遷移後系統功能完整無損。

### BDD 場景

GIVEN 測試套件執行 `bun test` 或 `bun scripts/test-parallel.js`
WHEN 系統從 `~/.claude/` 載入 plugin 模組
THEN 所有測試通過，無 `Cannot find module` 錯誤

GIVEN `tests/helpers/paths.js` 的 `PLUGIN_ROOT` 指向 `~/.claude/`
WHEN 148 個透過 paths.js 間接引用的測試執行
THEN 模組解析正確，測試行為不變

GIVEN 直接硬編碼 `plugins/overtone/` 路徑的 64 個測試檔被修復
WHEN 測試執行
THEN 模組解析指向 `~/.claude/`，測試行為不變

## 分析結果

### 引用模式分類

執行 Grep 分析後，確認測試中存在兩種引用模式：

**模式 1：透過 helpers/paths.js 間接引用**
- 檔案數：148 個測試檔（使用 `PLUGIN_ROOT`、`SCRIPTS_LIB`、`SCRIPTS_DIR`、`HOOKS_DIR`）
- 修改量：只改 `tests/helpers/paths.js` 一個檔案，其他 147 個自動生效
- 策略：將 `PLUGIN_ROOT` 從 `join(PROJECT_ROOT, 'plugins', 'overtone')` 改為 `~/.claude/`（使用 `homedir()` + `.claude`）

**模式 2：直接硬編碼路徑（64 個檔案，134 處）**

| 子類 | 描述 | 數量 |
|------|------|------|
| A 類 | `require('../../plugins/overtone/scripts/lib/xxx')` — unit/ 下引用 scripts/lib | 39 個檔案，83 處 |
| B 類 | `require('../../../plugins/overtone/scripts/lib/xxx')` — unit/knowledge/ 下引用 | 3 個檔案 |
| C 類 | `require('../../plugins/overtone/hooks/scripts/xxx')` 或 hooks 路徑硬編碼 | 2 個檔案 |

**注意**：64 個直接硬編碼的檔案中，部分已同時使用 paths.js（混合模式），修復時兩種引用都需要統一。

### 關鍵技術發現

1. **hook-pure-fns.test.js** 用 `path.resolve(__dirname, '../../plugins/overtone/hooks/scripts')` 定義 `HOOKS_ROOT`，需改為 `join(homedir(), '.claude', 'hooks', 'scripts')`（或改用 paths.js 的 `HOOKS_DIR`）
2. **extract-command-tag.test.js** 直接 require `../../plugins/overtone/hooks/scripts/tool/post-use`
3. **tests/unit/knowledge/ 子目錄**：相對路徑多一層（`../../../plugins/overtone/`），需獨立處理

### CI 相容性

測試必須同時在本地開發環境和 CI 中執行。`~/.claude/` 在 CI 上需確認路徑存在，或使用環境變數 `CLAUDE_PLUGIN_ROOT` 允許 override。

## 範圍邊界

### In Scope
- `tests/helpers/paths.js`：更新所有常數指向 `~/.claude/`
- 64 個直接硬編碼的測試檔：替換 `plugins/overtone/` 路徑
- CI 相容性設計（環境變數 override 方案）

### Out of Scope
- 修改被測試的生產程式碼（只改測試路徑）
- 更新 `plugins/overtone/scripts/lib/paths.js`（那是生產模組，非測試 helper）
- 測試邏輯本身的修改（只改路徑引用）

## 子任務清單

### Phase 1：更新 paths.js（阻塞所有後續任務）

**T1** — 更新 `tests/helpers/paths.js`
- agent: developer
- files: `tests/helpers/paths.js`
- 說明：將 `PLUGIN_ROOT` 改為 `join(homedir(), '.claude')`（使用 `os.homedir()`），同步更新 `SCRIPTS_LIB`、`SCRIPTS_DIR`、`HOOKS_DIR` 的計算。考慮 `OVERTONE_PLUGIN_ROOT` 環境變數 override 以支援 CI。
- 驗收：`require('./helpers/paths').PLUGIN_ROOT` 指向 `~/.claude/`

### Phase 2：修復直接硬編碼（T1 完成後，可並行）

**T2** — 修復 A 類：unit/ 下 scripts/lib 引用（39 個檔案）
- agent: developer
- files: `tests/unit/*.test.js`（39 個，排除 knowledge/ 子目錄）
- 說明：將 `require('../../plugins/overtone/scripts/lib/xxx')` 替換為 `require(join(SCRIPTS_LIB, 'xxx'))` 模式，需在檔案頂部引入 `{ SCRIPTS_LIB } = require('../helpers/paths')`
- 驗收：所有 A 類檔案無直接 `plugins/overtone` 路徑

**T3 (parallel)** — 修復 B 類：knowledge/ 子目錄（3 個檔案）
- agent: developer
- files: `tests/unit/knowledge/auto-forge-trigger.test.js`, `tests/unit/knowledge/skill-evaluator.test.js`, `tests/unit/knowledge/skill-generalizer.test.js`
- 說明：相對路徑為 `../../../plugins/overtone/scripts/lib/xxx`，替換為 `join(SCRIPTS_LIB, 'xxx')`，paths.js 的引用路徑為 `../../helpers/paths`
- 驗收：3 個檔案無直接 `plugins/overtone` 路徑

**T4 (parallel)** — 修復 C 類：hooks 路徑硬編碼（2 個檔案）+ integration 檔案
- agent: developer
- files: `tests/unit/hook-pure-fns.test.js`, `tests/unit/extract-command-tag.test.js`, 剩餘 integration 直接引用檔案
- 說明：`HOOKS_ROOT` 改用 paths.js 的 `HOOKS_DIR`；`extract-command-tag.test.js` 的 require 改為 `join(HOOKS_DIR, 'tool/post-use')`
- 驗收：2 個檔案無直接 `plugins/overtone` 路徑

### Phase 3：驗證

**T5** — 執行完整測試套件驗證
- agent: developer
- files: 無（執行 `bun scripts/test-parallel.js`）
- 說明：T2/T3/T4 完成後執行，確認無 `Cannot find module` 錯誤，pass 數量維持原有基線（4670+）
- 驗收：`bun scripts/test-parallel.js` 全數通過

## 優先順序

1. **T1 先做**（阻塞性）：改 paths.js 後 148 個間接引用自動修復
2. **T2/T3/T4 並行**（T1 完成後）：互相獨立，操作不同檔案
3. **T5 最後**：整合驗收

## 開放問題（需 architect 決定）

1. **CI 環境變數策略**：用 `OVERTONE_PLUGIN_ROOT` 還是 `CLAUDE_PLUGIN_ROOT`？是否需要在 CI 上實際安裝 plugin 到 `~/.claude/`？
2. **paths.js fallback 機制**：CI 上 `~/.claude/` 可能不存在 — 是否加 `existsSync` 檢查，fallback 到 `plugins/overtone/`？還是 CI 統一安裝到 `~/.claude/`？
3. **混合模式檔案**：64 個直接硬編碼檔案中有些同時使用 paths.js（如 `session-end-handler.test.js`）— 是否統一全改為 paths.js 模式，或允許混合？
