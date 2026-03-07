# Feature: paths.js PLUGIN_ROOT 支援環境變數 override

## Scenario: 設定 OVERTONE_PLUGIN_ROOT 時使用環境變數路徑
GIVEN 環境變數 `OVERTONE_PLUGIN_ROOT` 設定為 `/custom/plugin/path`
WHEN require `tests/helpers/paths.js` 並讀取 `PLUGIN_ROOT`
THEN `PLUGIN_ROOT` 等於 `/custom/plugin/path`
AND `SCRIPTS_LIB` 等於 `/custom/plugin/path/scripts/lib`
AND `SCRIPTS_DIR` 等於 `/custom/plugin/path/scripts`
AND `HOOKS_DIR` 等於 `/custom/plugin/path/hooks/scripts`

## Scenario: 未設定 OVERTONE_PLUGIN_ROOT 時 fallback 到 homedir()/.claude
GIVEN 環境變數 `OVERTONE_PLUGIN_ROOT` 未設定（undefined）
WHEN require `tests/helpers/paths.js` 並讀取 `PLUGIN_ROOT`
THEN `PLUGIN_ROOT` 等於 `os.homedir() + '/.claude'`
AND `SCRIPTS_LIB`、`SCRIPTS_DIR`、`HOOKS_DIR` 依 `PLUGIN_ROOT` 正確推導

## Scenario: paths.js 匯出介面保持不變
GIVEN paths.js 已完成 PLUGIN_ROOT 修改
WHEN 讀取 paths.js 的 module.exports
THEN 匯出物件包含 `PROJECT_ROOT`、`PLUGIN_ROOT`、`SCRIPTS_LIB`、`SCRIPTS_DIR`、`HOOKS_DIR` 五個欄位
AND 不新增其他欄位，不刪除任何既有欄位

## Scenario: OVERTONE_PLUGIN_ROOT 為空字串時不採用（falsy 值）
GIVEN 環境變數 `OVERTONE_PLUGIN_ROOT` 設定為空字串 `''`
WHEN require `tests/helpers/paths.js` 並讀取 `PLUGIN_ROOT`
THEN `PLUGIN_ROOT` fallback 到 `os.homedir() + '/.claude'`（空字串為 falsy）

---

# Feature: 測試檔 require 路徑改用 paths.js 常數（A 類 scripts/lib）

## Scenario: 單元測試透過 SCRIPTS_LIB 常數引用 scripts/lib 模組
GIVEN `OVERTONE_PLUGIN_ROOT` 設定為測試用路徑
AND 測試檔頂部 `const { SCRIPTS_LIB } = require('../helpers/paths')`
AND require 語法為 `require(join(SCRIPTS_LIB, 'module-name'))`
WHEN 執行該測試檔
THEN 模組成功載入，無 `Cannot find module` 錯誤

## Scenario: 測試環境與真實安裝路徑無關
GIVEN `OVERTONE_PLUGIN_ROOT` 指向 `plugins/overtone`（CI 本地路徑）
WHEN 執行 `bun scripts/test-parallel.js`
THEN 所有 A 類測試（39 個 unit/*.test.js）全數通過
AND 無任何 `Cannot find module '../../plugins/overtone/...'` 錯誤

## Scenario: 未替換的硬編碼路徑會在路徑異動後失敗（回歸測試）
GIVEN 某個測試檔仍使用 `require('../../plugins/overtone/scripts/lib/xxx')`
AND `OVERTONE_PLUGIN_ROOT` 設定為非 `plugins/overtone` 的路徑
WHEN 執行該測試檔
THEN 測試因 `Cannot find module` 失敗（驗證替換必要性）

---

# Feature: knowledge/ 子目錄測試改用 SCRIPTS_LIB（B 類）

## Scenario: knowledge/ 下的測試透過 SCRIPTS_LIB 引用模組
GIVEN `OVERTONE_PLUGIN_ROOT` 設定為測試用路徑
AND `tests/unit/knowledge/auto-forge-trigger.test.js` 使用 `require(join(SCRIPTS_LIB, 'knowledge/auto-forge-trigger'))`
WHEN 執行 `auto-forge-trigger.test.js`
THEN 模組載入成功，全部 scenario 通過

## Scenario: skill-evaluator 測試改用 SCRIPTS_LIB 引用
GIVEN `tests/unit/knowledge/skill-evaluator.test.js` 使用 SCRIPTS_LIB 常數引用
WHEN 執行 `skill-evaluator.test.js`
THEN 測試全數通過

## Scenario: skill-generalizer 的 require 改用 SCRIPTS_LIB，測試資料字串保留
GIVEN `tests/unit/knowledge/skill-generalizer.test.js` 第 13 行 require 已改用 SCRIPTS_LIB
AND 第 18-31 行、73-74 行、193-194 行測試資料中的 `plugins/overtone/` 字串未被修改
WHEN 執行 `skill-generalizer.test.js`
THEN 模組載入成功
AND generalizer 的「移除路徑」行為測試結果正確（測試資料語意未被破壞）

---

# Feature: hooks 路徑改用 HOOKS_DIR（C 類）

## Scenario: hook-pure-fns 測試改用 HOOKS_DIR 常數
GIVEN `tests/unit/hook-pure-fns.test.js` 使用 `const { HOOKS_DIR: HOOKS_ROOT } = require('../helpers/paths')`
AND 不再有 `path.resolve(__dirname, '../../plugins/overtone/hooks/scripts')` 的硬編碼
WHEN 執行 `hook-pure-fns.test.js`
THEN 測試全數通過

## Scenario: hook-pure-fns 的假路徑測試資料不被誤改
GIVEN `checkProtected` 測試的入參包含 `/path/to/plugins/overtone`（假路徑字串）
WHEN 執行 `hook-pure-fns.test.js` 的 checkProtected 相關 scenario
THEN 測試行為與修改前完全一致（假路徑未被替換）

## Scenario: extract-command-tag 測試改用 HOOKS_DIR 引用 post-use
GIVEN `tests/unit/extract-command-tag.test.js` 使用 `require(join(HOOKS_DIR, 'tool/post-use'))`
WHEN 執行 `extract-command-tag.test.js`
THEN 模組載入成功，全部 scenario 通過

---

# Feature: paths.test.js 路徑引用正確性

## Scenario: paths.test.js 生產模組 require 改用 SCRIPTS_LIB
GIVEN `tests/unit/paths.test.js` 使用 `require(join(SCRIPTS_LIB, 'paths'))` 引用生產 paths 模組
AND helpers/paths 的 require 路徑維持不變（`require('../helpers/paths')`）
WHEN 執行 `paths.test.js`
THEN 兩個 paths 模組均成功載入
AND 測試全數通過

## Scenario: paths.test.js 不混淆 helpers/paths 與 scripts/lib/paths
GIVEN `tests/unit/paths.test.js` 同時引用 helpers/paths 和 scripts/lib/paths
WHEN 執行測試
THEN helpers/paths（測試 helper）與 scripts/lib/paths（生產模組）各自正確引用
AND 無 MODULE_NOT_FOUND 錯誤

---

# Feature: 全量測試套件通過（整合驗證）

## Scenario: OVERTONE_PLUGIN_ROOT 設定正確時全量測試通過
GIVEN `OVERTONE_PLUGIN_ROOT` 設定為 `plugins/overtone` 的絕對路徑
WHEN 執行 `bun scripts/test-parallel.js`
THEN 測試結果 pass 數量不低於 4670
AND fail 數量為 0
AND 無任何 `Cannot find module` 相關錯誤

## Scenario: 未設定 OVERTONE_PLUGIN_ROOT 且 ~/.claude 存在時測試通過
GIVEN 環境未設定 `OVERTONE_PLUGIN_ROOT`
AND `~/.claude/` 目錄存在且包含 overtone plugin
WHEN 執行全量測試
THEN 測試通過（本地開發標準場景）

## Scenario: 未設定 OVERTONE_PLUGIN_ROOT 且 ~/.claude 不存在時部分測試失敗
GIVEN 環境未設定 `OVERTONE_PLUGIN_ROOT`
AND `~/.claude/` 目錄不存在
WHEN 執行全量測試
THEN 測試因 `Cannot find module` 失敗（預期行為，CI 必須設定環境變數）
