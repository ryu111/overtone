# Specs Skill 系統 — BDD 行為規格

> 版本：v1.0 | 撰寫日期：2026-02-26 | 階段：TEST:spec（DEV 前）

---

## Feature: isValidFeatureName — kebab-case 名稱驗證

功能：驗證 feature 名稱是否符合 kebab-case 格式（`/^[a-z0-9]+(-[a-z0-9]+)*$/`）。

### Scenario: 合法的單一小寫單字通過驗證

@smoke
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("auth")`
Then 回傳 `true`

### Scenario: 合法的 kebab-case 多詞名稱通過驗證

@smoke
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("add-user-auth")`
Then 回傳 `true`

### Scenario: 含數字的合法 kebab-case 名稱通過驗證

@edge-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("oauth2-integration")`
Then 回傳 `true`

### Scenario: 名稱含大寫字母被拒絕

@regression
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("AddUserAuth")`
Then 回傳 `false`

### Scenario: 名稱含底線被拒絕

@regression
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("add_user_auth")`
Then 回傳 `false`

### Scenario: 名稱以連字號開頭被拒絕

@edge-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("-auth")`
Then 回傳 `false`

### Scenario: 名稱以連字號結尾被拒絕

@edge-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("auth-")`
Then 回傳 `false`

### Scenario: 連續連字號被拒絕

@edge-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("add--auth")`
Then 回傳 `false`

### Scenario: 空字串被拒絕

@error-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("")`
Then 回傳 `false`

### Scenario: 含空白字元被拒絕

@error-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("add user auth")`
Then 回傳 `false`

### Scenario: 含特殊符號被拒絕

@error-case
Given 驗證函式已載入
When 呼叫 `isValidFeatureName("auth@v2")`
Then 回傳 `false`

---

## Feature: initFeatureDir — 建立 Feature 目錄

功能：在 `{projectRoot}/specs/features/in-progress/` 下建立 feature 目錄與 tasks.md。

### Scenario: 成功建立全新 feature 目錄

@smoke
Given `{projectRoot}/specs/features/in-progress/` 不存在 `my-feature` 目錄
When 呼叫 `initFeatureDir(projectRoot, "my-feature", "standard")`
Then 建立 `{projectRoot}/specs/features/in-progress/my-feature/` 目錄
And 建立 `tasks.md`，包含 frontmatter `feature: my-feature`、`status: in-progress`、`workflow: standard`
And frontmatter 的 `created` 欄位為當前 ISO 8601 時間戳記
And 回傳建立的目錄路徑

### Scenario: tasks.md 內容包含正確 Markdown 結構

@regression
Given `{projectRoot}/specs/features/in-progress/` 不存在 `new-feature` 目錄
When 呼叫 `initFeatureDir(projectRoot, "new-feature", "quick")`
Then 建立的 tasks.md 包含 `## Tasks` 標題區塊
And frontmatter 以 `---` 開頭並以 `---` 結尾
And `workflow` 欄位為 `quick`

### Scenario: 從 backlog 搬移到 in-progress

@edge-case
Given `{projectRoot}/specs/features/backlog/my-feature/` 已存在
And `{projectRoot}/specs/features/in-progress/` 不存在 `my-feature` 目錄
When 呼叫 `initFeatureDir(projectRoot, "my-feature", "standard")`
Then 將 backlog 下的 `my-feature/` 目錄移動至 `in-progress/my-feature/`
And 更新 tasks.md frontmatter 的 `status` 為 `in-progress`
And 回傳移動後的目錄路徑

### Scenario: 防止重複建立同名 feature

@error-case
Given `{projectRoot}/specs/features/in-progress/my-feature/` 已存在
When 呼叫 `initFeatureDir(projectRoot, "my-feature", "standard")`
Then 拋出錯誤，訊息包含「Feature 'my-feature' 已存在於 in-progress」
And 不修改現有目錄或檔案

### Scenario: featureName 不合法時拒絕建立

@error-case
Given `projectRoot` 為有效路徑
When 呼叫 `initFeatureDir(projectRoot, "Invalid_Name", "standard")`
Then 拋出錯誤，訊息包含「無效的 feature 名稱」
And 不建立任何目錄

### Scenario: 中間目錄不存在時自動建立

@edge-case
Given `{projectRoot}/specs/` 目錄不存在
When 呼叫 `initFeatureDir(projectRoot, "my-feature", "tdd")`
Then 遞迴建立所有必要的父目錄
And 成功建立 `my-feature/tasks.md`

---

## Feature: archiveFeature — 歸檔 Feature

功能：將 `in-progress` 下的 feature 移到 `archive/{YYYY-MM-DD}_{name}/`。

### Scenario: 成功歸檔 in-progress feature

@smoke
Given `{projectRoot}/specs/features/in-progress/my-feature/` 已存在
And `{projectRoot}/specs/features/archive/` 不存在同名目錄
When 呼叫 `archiveFeature(projectRoot, "my-feature")`
Then 建立 `{projectRoot}/specs/features/archive/{today}_my-feature/` 目錄
And 將 `in-progress/my-feature/` 的所有內容移入歸檔目錄
And 刪除原本的 `in-progress/my-feature/` 目錄
And 回傳歸檔目錄的路徑

### Scenario: 歸檔後更新 tasks.md 狀態

@regression
Given `{projectRoot}/specs/features/in-progress/my-feature/tasks.md` 存在且 `status: in-progress`
When 呼叫 `archiveFeature(projectRoot, "my-feature")`
Then 歸檔目錄中的 tasks.md frontmatter `status` 更新為 `archived`
And frontmatter 新增 `archivedAt` 欄位，值為當前 ISO 8601 時間戳記

### Scenario: 歸檔目錄名稱衝突時加序號後綴

@edge-case
Given `{projectRoot}/specs/features/archive/2026-02-26_my-feature/` 已存在
When 呼叫 `archiveFeature(projectRoot, "my-feature")`
Then 建立 `{projectRoot}/specs/features/archive/2026-02-26_my-feature_2/`
And 成功移動所有內容

### Scenario: 第三次歸檔同名 feature 時序號遞增

@edge-case
Given `archive/2026-02-26_my-feature/` 和 `archive/2026-02-26_my-feature_2/` 均已存在
When 呼叫 `archiveFeature(projectRoot, "my-feature")`
Then 建立 `{projectRoot}/specs/features/archive/2026-02-26_my-feature_3/`

### Scenario: feature 不在 in-progress 時拋出錯誤

@error-case
Given `{projectRoot}/specs/features/in-progress/` 不存在 `non-existent/` 目錄
When 呼叫 `archiveFeature(projectRoot, "non-existent")`
Then 拋出錯誤，訊息包含「Feature 'non-existent' 不在 in-progress 中」
And 不建立任何目錄

---

## Feature: getActiveFeature — 取得活躍 Feature

功能：取得當前 in-progress 狀態的 feature，多個時警告，無時回 null。

### Scenario: 只有一個 in-progress feature 時正確回傳

@smoke
Given `{projectRoot}/specs/features/in-progress/` 只有 `my-feature/` 一個目錄
When 呼叫 `getActiveFeature(projectRoot)`
Then 回傳物件包含 `{ name: "my-feature", path: "...in-progress/my-feature" }`
And 不輸出任何警告

### Scenario: 沒有 in-progress feature 時回傳 null

@edge-case
Given `{projectRoot}/specs/features/in-progress/` 目錄為空或不存在
When 呼叫 `getActiveFeature(projectRoot)`
Then 回傳 `null`

### Scenario: 多個 in-progress feature 時回傳第一個並輸出警告

@edge-case
Given `{projectRoot}/specs/features/in-progress/` 存在 `feature-a/` 和 `feature-b/` 兩個目錄
When 呼叫 `getActiveFeature(projectRoot)`
Then 回傳第一個 feature（依目錄名稱字母排序）
And 輸出警告訊息，包含「發現多個 in-progress feature」及所有 feature 名稱

### Scenario: in-progress 目錄中有非目錄的檔案時忽略

@edge-case
Given `{projectRoot}/specs/features/in-progress/` 存在 `my-feature/` 目錄和 `.gitkeep` 檔案
When 呼叫 `getActiveFeature(projectRoot)`
Then 只考慮目錄，回傳 `{ name: "my-feature", ... }`
And 不因 `.gitkeep` 拋出錯誤

---

## Feature: readTasksFrontmatter — 讀取 tasks.md Frontmatter

功能：純 regex 解析 tasks.md 的 YAML frontmatter，不使用外部 YAML 解析器。

### Scenario: 成功解析完整 frontmatter

@smoke
Given tasks.md 包含合法 frontmatter：
  ```
  ---
  feature: my-feature
  status: in-progress
  workflow: standard
  created: 2026-02-26T00:00:00Z
  ---
  ```
When 呼叫 `readTasksFrontmatter(tasksPath)`
Then 回傳物件 `{ feature: "my-feature", status: "in-progress", workflow: "standard", created: "2026-02-26T00:00:00Z" }`

### Scenario: 只解析 frontmatter 區塊，忽略內文

@regression
Given tasks.md frontmatter 後有 Markdown 內文（`## Tasks` 等）
When 呼叫 `readTasksFrontmatter(tasksPath)`
Then 回傳物件只包含 frontmatter 定義的欄位
And 不包含內文中的任何 Markdown 內容

### Scenario: 檔案不存在時回傳 null

@error-case
Given tasks.md 路徑不存在任何檔案
When 呼叫 `readTasksFrontmatter("/non/existent/tasks.md")`
Then 回傳 `null`
And 不拋出例外

### Scenario: frontmatter 缺失時回傳 null

@edge-case
Given tasks.md 不包含 `---` 分隔符號的 frontmatter 區塊
When 呼叫 `readTasksFrontmatter(tasksPath)`
Then 回傳 `null`

### Scenario: frontmatter 欄位值含冒號時正確解析

@edge-case
Given tasks.md frontmatter 包含 `created: 2026-02-26T10:30:00Z`（值含冒號）
When 呼叫 `readTasksFrontmatter(tasksPath)`
Then `created` 欄位值為完整字串 `"2026-02-26T10:30:00Z"`，不被截斷

---

## Feature: updateTasksFrontmatter — 原子更新 Frontmatter

功能：原子性地更新 tasks.md frontmatter 中指定欄位，不影響其他欄位和內文。

### Scenario: 成功更新單一欄位

@smoke
Given tasks.md 存在，frontmatter 包含 `status: in-progress`
When 呼叫 `updateTasksFrontmatter(tasksPath, { status: "archived" })`
Then tasks.md 的 frontmatter `status` 變更為 `archived`
And 其他 frontmatter 欄位（`feature`、`workflow`、`created`）保持不變
And `## Tasks` 以下的 Markdown 內文保持不變

### Scenario: 新增不存在的欄位

@edge-case
Given tasks.md 存在，frontmatter 不包含 `archivedAt` 欄位
When 呼叫 `updateTasksFrontmatter(tasksPath, { archivedAt: "2026-02-26T12:00:00Z" })`
Then frontmatter 新增 `archivedAt: 2026-02-26T12:00:00Z` 行
And 現有欄位和 Markdown 內文保持不變

### Scenario: 同時更新多個欄位

@regression
Given tasks.md frontmatter 包含 `status: in-progress`，不含 `archivedAt`
When 呼叫 `updateTasksFrontmatter(tasksPath, { status: "archived", archivedAt: "2026-02-26T12:00:00Z" })`
Then `status` 更新為 `archived`
And `archivedAt` 欄位被新增
And 其他欄位和內文保持不變

### Scenario: 寫入操作為原子性（完整覆寫）

@edge-case
Given tasks.md 存在
When 呼叫 `updateTasksFrontmatter(tasksPath, { status: "archived" })`
Then 使用 atomicWrite 確保寫入完整性（不留下部分寫入的損壞檔案）

### Scenario: 檔案不存在時拋出錯誤

@error-case
Given tasks.md 路徑不存在任何檔案
When 呼叫 `updateTasksFrontmatter("/non/existent/tasks.md", { status: "archived" })`
Then 拋出錯誤，訊息包含「檔案不存在」或路徑資訊
And 不建立新檔案

---

## Feature: createBacklog — 建立 Backlog Feature

功能：在 `{projectRoot}/specs/features/backlog/` 下建立待辦 feature 目錄。

### Scenario: 成功建立 backlog feature

@smoke
Given `{projectRoot}/specs/features/backlog/` 不存在 `future-feature` 目錄
When 呼叫 `createBacklog(projectRoot, "future-feature", "standard")`
Then 建立 `{projectRoot}/specs/features/backlog/future-feature/` 目錄
And 建立 tasks.md，frontmatter 包含 `status: backlog`、`feature: future-feature`、`workflow: standard`
And 回傳建立的目錄路徑

### Scenario: 同名 feature 已在 backlog 時拒絕重複建立

@error-case
Given `{projectRoot}/specs/features/backlog/future-feature/` 已存在
When 呼叫 `createBacklog(projectRoot, "future-feature", "standard")`
Then 拋出錯誤，訊息包含「Feature 'future-feature' 已存在於 backlog」
And 不修改現有目錄

### Scenario: featureName 不合法時拒絕建立

@error-case
Given `projectRoot` 為有效路徑
When 呼叫 `createBacklog(projectRoot, "Invalid_Name!", "standard")`
Then 拋出錯誤，訊息包含「無效的 feature 名稱」
And 不建立任何目錄

### Scenario: 同名 feature 已在 in-progress 時仍可建立 backlog

@edge-case
Given `{projectRoot}/specs/features/in-progress/my-feature/` 已存在
And `{projectRoot}/specs/features/backlog/my-feature/` 不存在
When 呼叫 `createBacklog(projectRoot, "my-feature", "quick")`
Then 成功建立 `backlog/my-feature/` 目錄（兩個目錄共存）
And 不影響 in-progress 下的 `my-feature/`

---

## Feature: listFeatures — 列出所有 Feature

功能：掃描 specs 目錄，回傳依狀態分類的 feature 清單。

### Scenario: 三個分類都有 feature 時完整回傳

@smoke
Given in-progress 有 `feature-a`、backlog 有 `feature-b`、archive 有 `2026-02-01_feature-c`
When 呼叫 `listFeatures(projectRoot)`
Then 回傳 `{ inProgress: ["feature-a"], backlog: ["feature-b"], archived: ["2026-02-01_feature-c"] }`

### Scenario: 某個分類為空時回傳空陣列

@edge-case
Given in-progress 有 `feature-a`、backlog 為空、archive 為空
When 呼叫 `listFeatures(projectRoot)`
Then 回傳 `{ inProgress: ["feature-a"], backlog: [], archived: [] }`
And 不拋出錯誤

### Scenario: specs 目錄完全不存在時回傳全空

@error-case
Given `{projectRoot}/specs/` 目錄不存在
When 呼叫 `listFeatures(projectRoot)`
Then 回傳 `{ inProgress: [], backlog: [], archived: [] }`
And 不拋出例外

### Scenario: 只列出目錄，忽略各分類下的非目錄檔案

@edge-case
Given in-progress 下有 `feature-a/` 目錄和 `README.md` 檔案
When 呼叫 `listFeatures(projectRoot)`
Then `inProgress` 只包含 `"feature-a"`，不包含 `"README.md"`

### Scenario: 多個 feature 時依字母排序回傳

@regression
Given in-progress 下有 `zebra-feature`、`alpha-feature`、`middle-feature` 三個目錄
When 呼叫 `listFeatures(projectRoot)`
Then `inProgress` 為 `["alpha-feature", "middle-feature", "zebra-feature"]`

---

## Feature: readTasksCheckboxes — 讀取 Checkbox 狀態

功能：解析 tasks.md 中的 Markdown checkbox，統計完成數量。

### Scenario: 成功計算 checkbox 統計

@smoke
Given tasks.md 的 `## Tasks` 區塊包含：
  ```
  - [x] 已完成任務 A
  - [x] 已完成任務 B
  - [ ] 待辦任務 C
  ```
When 呼叫 `readTasksCheckboxes(tasksPath)`
Then 回傳 `{ total: 3, checked: 2, allChecked: false }`

### Scenario: 所有 checkbox 皆已勾選時 allChecked 為 true

@edge-case
Given tasks.md 的 Tasks 區塊所有 checkbox 均為 `[x]`
When 呼叫 `readTasksCheckboxes(tasksPath)`
Then 回傳 `{ total: N, checked: N, allChecked: true }`（N 為 checkbox 總數）

### Scenario: 沒有 checkbox 時 total 為 0

@edge-case
Given tasks.md 的 Tasks 區塊沒有任何 checkbox 項目（或沒有 Tasks 區塊）
When 呼叫 `readTasksCheckboxes(tasksPath)`
Then 回傳 `{ total: 0, checked: 0, allChecked: false }`

### Scenario: 只計算 Tasks 區塊以後的 checkbox

@regression
Given tasks.md frontmatter 後有 `## Tasks` 標題，Tasks 區塊前有其他 Markdown 內容含 `- [x]` 格式文字
When 呼叫 `readTasksCheckboxes(tasksPath)`
Then 只計算 `## Tasks` 標題後的 checkbox
And 不計入標題前的 `[x]` 格式文字

### Scenario: 檔案不存在時拋出錯誤

@error-case
Given tasks.md 路徑不存在任何檔案
When 呼叫 `readTasksCheckboxes("/non/existent/tasks.md")`
Then 拋出錯誤或回傳 `null`
And 不回傳虛假的統計數字

---

## Feature: CLI — specs-pause.js（暫停 Feature）

功能：將 in-progress 的 feature 移到 backlog，對應 `specs-pause.js <featureName>`。

### Scenario: 成功將 in-progress feature 暫停到 backlog

@smoke
Given `in-progress/my-feature/` 存在
And `backlog/my-feature/` 不存在
When 執行 `node specs-pause.js my-feature`
Then `in-progress/my-feature/` 目錄被移動到 `backlog/my-feature/`
And tasks.md frontmatter `status` 更新為 `backlog`
And 標準輸出顯示成功訊息，包含 feature 名稱

### Scenario: feature 不在 in-progress 時顯示錯誤

@error-case
Given `in-progress/my-feature/` 不存在
When 執行 `node specs-pause.js my-feature`
Then 標準錯誤輸出顯示錯誤訊息，包含「Feature 不在 in-progress 中」
And 以非零退出碼結束
And 不修改任何目錄

### Scenario: 未提供 featureName 時顯示使用說明

@error-case
Given 執行指令時未提供任何引數
When 執行 `node specs-pause.js`
Then 標準錯誤輸出顯示使用說明（Usage）
And 以非零退出碼結束

---

## Feature: CLI — specs-resume.js（恢復 Feature）

功能：將 backlog 的 feature 移到 in-progress，對應 `specs-resume.js <featureName>`。

### Scenario: 成功將 backlog feature 恢復到 in-progress

@smoke
Given `backlog/my-feature/` 存在
And `in-progress/` 下無其他 feature
When 執行 `node specs-resume.js my-feature`
Then `backlog/my-feature/` 目錄被移動到 `in-progress/my-feature/`
And tasks.md frontmatter `status` 更新為 `in-progress`
And 標準輸出顯示成功訊息

### Scenario: 已有其他 in-progress feature 時顯示警告並繼續

@edge-case
Given `backlog/my-feature/` 存在
And `in-progress/` 下已有 `other-feature/`
When 執行 `node specs-resume.js my-feature`
Then 顯示警告訊息，包含「已有其他 in-progress feature」及現有 feature 名稱
And 仍然完成移動（`my-feature` 加入 in-progress）
And 以退出碼 0 結束

### Scenario: feature 不在 backlog 時顯示錯誤

@error-case
Given `backlog/my-feature/` 不存在
When 執行 `node specs-resume.js my-feature`
Then 標準錯誤輸出顯示錯誤訊息，包含「Feature 不在 backlog 中」
And 以非零退出碼結束

---

## Feature: CLI — specs-backlog.js（建立 Backlog）

功能：直接在 backlog 建立新 feature，對應 `specs-backlog.js <featureName> <workflowType>`。

### Scenario: 成功建立 backlog feature

@smoke
Given `backlog/future-feature/` 不存在
When 執行 `node specs-backlog.js future-feature standard`
Then 建立 `backlog/future-feature/tasks.md`
And frontmatter 包含 `status: backlog`、`workflow: standard`
And 標準輸出顯示成功訊息，包含 feature 名稱

### Scenario: 已存在同名 backlog feature 時顯示錯誤

@error-case
Given `backlog/future-feature/` 已存在
When 執行 `node specs-backlog.js future-feature standard`
Then 標準錯誤輸出顯示錯誤訊息，包含「已存在」
And 以非零退出碼結束
And 不修改現有目錄

### Scenario: 缺少必要引數時顯示使用說明

@error-case
Given 執行指令時只提供 featureName 而未提供 workflowType
When 執行 `node specs-backlog.js future-feature`
Then 標準錯誤輸出顯示使用說明（Usage），包含兩個必要引數
And 以非零退出碼結束

---

## Feature: CLI — specs-list.js（列出所有 Feature）

功能：列出所有 feature 及其狀態，對應 `specs-list.js`。

### Scenario: 成功列出所有分類的 feature

@smoke
Given in-progress 有 `feature-a`、backlog 有 `feature-b`、archive 有 `2026-02-01_feature-c`
When 執行 `node specs-list.js`
Then 標準輸出包含三個分類標題（In Progress、Backlog、Archived）
And 每個分類下列出對應的 feature 名稱
And 以退出碼 0 結束

### Scenario: 所有分類都為空時顯示提示

@edge-case
Given `specs/` 目錄完全不存在或所有分類目錄均為空
When 執行 `node specs-list.js`
Then 標準輸出顯示「沒有任何 feature」或類似提示訊息
And 以退出碼 0 結束（非錯誤狀態）

### Scenario: 每個 feature 顯示其 workflow 類型

@regression
Given `in-progress/feature-a/tasks.md` 的 frontmatter 包含 `workflow: standard`
When 執行 `node specs-list.js`
Then 輸出中 `feature-a` 旁邊顯示 `standard` 或類似標記

---

## Feature: init-workflow.js 整合 — featureName 參數

功能：init-workflow.js 接受可選的 featureName 參數，傳入時呼叫 specs.js 初始化 feature 目錄並發出 `specs:init` timeline 事件。

### Scenario: 傳入 featureName 時初始化 feature 目錄

@smoke
Given `init-workflow.js` 以 `workflowType` 和 `featureName` 兩個參數執行
When 執行 `bun init-workflow.js standard my-feature {sessionId}`
Then 呼叫 `initFeatureDir(projectRoot, "my-feature", "standard")`
And 在 timeline 寫入 `specs:init` 事件，payload 包含 `featureName` 和 `featurePath`
And 正常完成 workflow 初始化（寫入 workflow.json）

### Scenario: 不傳 featureName 時維持現有行為（向後相容）

@regression
Given `init-workflow.js` 只以 `workflowType` 執行（不傳 featureName）
When 執行 `bun init-workflow.js standard {sessionId}`
Then 不呼叫任何 specs.js 函式
And 不寫入 `specs:init` 事件
And workflow.json 正常初始化，行為與未整合前完全一致

### Scenario: featureName 不合法時中止 init-workflow 並顯示錯誤

@error-case
Given 執行 init-workflow.js 時傳入不合法的 featureName（含大寫或特殊字元）
When 執行 `bun init-workflow.js standard "Invalid_Name" {sessionId}`
Then 標準錯誤輸出顯示「無效的 feature 名稱」
And 以非零退出碼結束
And 不寫入 workflow.json（或不建立 session 目錄）

### Scenario: specs 目錄建立失敗時記錄警告但不中斷 workflow

@edge-case
Given 因權限問題無法在 projectRoot 建立 `specs/` 目錄
When 執行 `bun init-workflow.js standard my-feature {sessionId}`
Then 標準錯誤輸出顯示警告訊息，包含錯誤原因
And 仍然正常完成 workflow 初始化（specs 失敗不影響主流程）

---

## Feature: Stop hook 整合 — Workflow 完成自動 Archive

功能：Stop hook 在 workflow 完成時，若有對應的 in-progress feature，自動呼叫 archiveFeature 並寫入 `specs:archive` timeline 事件。

### Scenario: Workflow 完成時自動歸檔對應 feature

@smoke
Given workflow.json 的 `status` 為 `completed`
And workflow.json 包含 `featureName: "my-feature"` 欄位
And `in-progress/my-feature/` 存在
When Stop hook 觸發
Then 呼叫 `archiveFeature(projectRoot, "my-feature")`
And 在 timeline 寫入 `specs:archive` 事件，payload 包含 `featureName` 和 `archivePath`
And Stop hook 正常完成其他責任（Loop 迴圈、Dashboard 通知等）

### Scenario: Workflow 未完成時不觸發歸檔

@edge-case
Given workflow.json 的 `status` 為 `in-progress`（非 completed）
When Stop hook 觸發
Then 不呼叫 `archiveFeature`
And 不寫入 `specs:archive` 事件
And Stop hook 正常完成其他責任

### Scenario: workflow.json 不含 featureName 時跳過歸檔（向後相容）

@regression
Given workflow.json 的 `status` 為 `completed`
And workflow.json 不包含 `featureName` 欄位（舊格式）
When Stop hook 觸發
Then 不呼叫 `archiveFeature`
And 不寫入 `specs:archive` 事件
And 不輸出任何錯誤訊息
And Stop hook 行為與未整合前完全一致

### Scenario: Feature 不在 in-progress 時記錄警告但不中斷 Stop hook

@error-case
Given workflow.json 包含 `featureName: "my-feature"` 且 `status: completed`
And `in-progress/my-feature/` 不存在（可能已手動移動或刪除）
When Stop hook 觸發
Then 在標準錯誤或 timeline 寫入警告，包含「Feature 不在 in-progress 中」
And 不拋出未捕獲例外
And Stop hook 正常完成其他責任（Loop、Dashboard 等）

### Scenario: 歸檔過程發生錯誤時記錄但不中斷 Stop hook

@error-case
Given archiveFeature 因權限或 IO 錯誤而失敗
When Stop hook 觸發並嘗試呼叫 archiveFeature
Then 捕獲例外並寫入警告（timeline 或 stderr）
And 不中斷 Stop hook 的其他邏輯
And 以退出碼 0 結束（歸檔失敗不應影響正常流程結束）

---

> 撰寫者：tester agent（mode: spec）| 日期：2026-02-26
