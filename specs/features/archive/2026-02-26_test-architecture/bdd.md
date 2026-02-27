# Feature 集合：測試架構遷移（test-architecture）

---

# Feature 1: 測試目錄架構

## Scenario: 根目錄執行 bun test 找到所有測試檔
GIVEN 專案根目錄存在 `tests/unit/` 和 `tests/integration/` 兩個子目錄
AND 根目錄有 `bunfig.toml` 設定 `[test] root = "./tests"`
WHEN 在專案根目錄執行 `bun test`
THEN 所有 `.test.js` 測試檔被找到並執行
AND 所有測試通過、0 fail

## Scenario: unit 和 integration 測試分類正確
GIVEN `tests/unit/` 目錄包含 2 個純函式測試檔（無真實 I/O）
AND `tests/integration/` 目錄包含 11 個整合測試檔（含真實 I/O 或跨模組）
WHEN 開發者新增一個測試檔並放到 `tests/unit/`
THEN 該檔案只包含無副作用的純函式測試
AND 不依賴檔案系統、網路、或 hook 腳本

## Scenario: e2e 佔位目錄存在且被 git 追蹤
GIVEN `tests/e2e/.gitkeep` 檔案已建立
WHEN 執行 `git ls-files tests/e2e/`
THEN 輸出包含 `tests/e2e/.gitkeep`
AND e2e 目錄存在於版本控制中

## Scenario: plugin 目錄下不再保留測試檔
GIVEN 遷移完成後 `plugins/overtone/tests/` 目錄
WHEN 執行 `ls plugins/overtone/tests/`
THEN 目錄為空或不存在
AND 所有測試檔已移至根目錄 `tests/`

---

# Feature 2: paths.js 路徑 Helper

## Scenario: 5 個路徑常數解析到正確的絕對路徑
GIVEN `tests/helpers/paths.js` 匯出 PROJECT_ROOT、PLUGIN_ROOT、SCRIPTS_LIB、SCRIPTS_DIR、HOOKS_DIR
WHEN 測試檔 `require('../helpers/paths.js')` 並讀取各常數
THEN `PROJECT_ROOT` 解析為 `overtone/` 專案根目錄的絕對路徑
AND `PLUGIN_ROOT` 解析為 `plugins/overtone/` 的絕對路徑
AND `SCRIPTS_LIB` 解析為 `plugins/overtone/scripts/lib/` 的絕對路徑
AND `SCRIPTS_DIR` 解析為 `plugins/overtone/scripts/` 的絕對路徑
AND `HOOKS_DIR` 解析為 `plugins/overtone/hooks/scripts/` 的絕對路徑

## Scenario: 測試檔透過 paths.js 成功 require lib 模組
GIVEN `tests/helpers/paths.js` 已正確定義 `SCRIPTS_LIB`
WHEN 整合測試中執行 `require(path.join(SCRIPTS_LIB, 'registry.js'))`
THEN 模組成功載入，不拋出 MODULE_NOT_FOUND 錯誤
AND 載入的模組回傳有效的 registry 物件

## Scenario: 跨目錄路徑解析在不同工作目錄下均一致
GIVEN `paths.js` 使用 `__dirname` 或等效機制計算絕對路徑
WHEN 從 `tests/unit/`、`tests/integration/` 或根目錄分別 require paths.js
THEN 所有 5 個常數的絕對路徑值完全相同
AND 不因呼叫者的工作目錄不同而產生差異

## Scenario: paths.js 引用不存在的路徑時提供明確錯誤訊息
GIVEN `paths.js` 其中一個常數指向不存在的目錄
WHEN 測試在啟動時讀取該常數並嘗試使用
THEN 程式拋出包含完整路徑資訊的錯誤
AND 錯誤訊息明確指出哪個常數的路徑無效

---

# Feature 3: bun test 雙入口

## Scenario: 根目錄 bun test 執行所有 13 個測試檔
GIVEN `bunfig.toml` 設定 `[test] root = "./tests"`
AND `tests/` 下共有 13 個 `.test.js` 測試檔
WHEN 在 `/Users/sbu/projects/overtone/` 執行 `bun test`
THEN 找到並執行全部 13 個測試檔
AND 所有測試通過、0 fail

## Scenario: plugin 目錄 bun test 跑到相同的測試套件
GIVEN `plugins/overtone/package.json` 的 test script 設定為 `bun test ../../tests`
WHEN 在 `plugins/overtone/` 目錄執行 `bun test`
THEN 找到並執行相同的 13 個測試檔
AND 測試結果與根目錄入口完全一致（所有測試通過、0 fail）

## Scenario: 兩個入口的測試結果一致，不出現幽靈差異
GIVEN 根目錄和 plugin 目錄各有一個 bun test 入口
WHEN 同一個測試套件分別透過兩個入口執行
THEN pass 數量相同
AND fail 數量相同
AND 同一個測試案例不在一個入口 pass、在另一個入口 fail

## Scenario: server.test.js port 衝突在並行執行時被隔離
GIVEN `tests/integration/server.test.js` 使用 port 17778
WHEN 兩個 bun test 入口同時執行
THEN server.test.js 不因 port 被佔用而失敗
AND 測試框架確保 port 隔離或測試序列化

---

# Feature 4: Developer Test Scope 標記

## Scenario: developer Handoff 包含格式正確的 Test Scope 區塊
GIVEN developer 完成一個功能並撰寫 Handoff
WHEN Handoff 文件包含 `### Test Scope` 區塊
THEN 區塊格式為含有 unit、integration、e2e、qa 四列的 Markdown 表格
AND 每列的標記值為 `✅`、`⚠️`、或 `--` 其中之一

## Scenario: main agent 讀到 unit 或 integration 為 ✅ 時委派 tester
GIVEN developer Handoff 的 Test Scope 中 unit 或 integration 標記為 `✅`
WHEN main agent 解析 Handoff 文件
THEN main agent 委派 tester agent 執行 verify 模式
AND tester agent 針對標記為 ✅ 的 scope 撰寫並執行測試

## Scenario: main agent 讀到 e2e 為 ✅ 時委派 e2e-runner
GIVEN developer Handoff 的 Test Scope 中 e2e 標記為 `✅`
WHEN main agent 解析 Handoff 文件
THEN main agent 委派 e2e-runner agent 執行端對端測試
AND tester agent 不被委派 e2e 任務

## Scenario: main agent 讀到 qa 為 ✅ 時委派 qa agent
GIVEN developer Handoff 的 Test Scope 中 qa 標記為 `✅`
WHEN main agent 解析 Handoff 文件
THEN main agent 委派 qa agent 執行行為驗證
AND qa agent 獨立於 tester agent 執行

## Scenario: Test Scope 標記為 ⚠️ 時 main agent 自行判斷
GIVEN developer Handoff 的 Test Scope 中某個 scope 標記為 `⚠️`
WHEN main agent 解析 Handoff 文件
THEN main agent 評估該 scope 是否需要測試
AND main agent 根據評估結果決定是否委派對應 agent

## Scenario: Handoff 缺少 Test Scope 區塊時預設委派 tester
GIVEN developer Handoff 中完全沒有 `### Test Scope` 區塊
WHEN main agent 解析 Handoff 文件
THEN main agent 預設委派 tester agent 執行 verify 模式
AND 不因缺少標記而跳過測試階段

---

# Feature 5: 測試生命週期

## Scenario: developer 刪除功能後在 Handoff 標記待清理測試
GIVEN developer 刪除了一個功能模組及其對應實作
WHEN developer 撰寫 Handoff 文件
THEN Handoff 中包含「待清理測試」清單，列出需刪除的測試檔或測試案例名稱
AND 清單格式明確可供 tester 識別

## Scenario: tester 在 verify 模式讀到待清理標記後刪除過時測試
GIVEN developer Handoff 中列出「待清理測試」清單
WHEN tester agent 以 verify 模式執行
THEN tester 刪除清單中指定的測試檔或測試案例
AND 刪除後執行完整測試套件確認無殘留參照錯誤

## Scenario: 清理過時測試後整體測試套件仍可正常執行
GIVEN tester 已依 Handoff 刪除過時測試
WHEN 執行根目錄 `bun test`
THEN 測試套件無 MODULE_NOT_FOUND 或 undefined reference 錯誤
AND 所有剩餘測試均通過

## Scenario: tester 不刪除 Handoff 未標記的測試
GIVEN developer Handoff 中「待清理測試」清單為空或不存在
WHEN tester agent 以 verify 模式執行
THEN tester 不刪除任何現有測試檔
AND 僅執行測試、不修改測試套件結構
