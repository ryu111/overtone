# Feature: GitHub Integration — `/ot:issue` 與 `/ot:pr` Skills

本 feature 涵蓋三個子系統的行為規格：
1. `/ot:issue` Skill — 從 GitHub Issue 啟動 workflow
2. `/ot:pr` Skill — workflow 結束後建立 Pull Request
3. `gh` CLI 依賴檢查 — SessionStart banner 狀態顯示

---

## Feature 1: `/ot:issue` — 前置檢查

在執行任何步驟前，驗證 `gh` CLI 已安裝並已通過認證。

### Scenario: `gh` CLI 未安裝時終止並提示安裝指令
GIVEN 使用者執行 `/ot:issue 123`
WHEN `gh --version` 指令失敗（command not found）
THEN skill 停止執行，不繼續後續步驟
AND 輸出提示訊息，包含 `gh` CLI 安裝指令（`brew install gh` 或官方文件連結）
AND 不建立任何 branch 或 workflow state

### Scenario: `gh` 已安裝但未認證時提示登入
GIVEN 使用者執行 `/ot:issue 123`
AND `gh --version` 成功回傳版本號
WHEN `gh auth status` 回傳未認證錯誤
THEN skill 停止執行
AND 輸出提示訊息，包含 `gh auth login` 指令
AND 不繼續讀取 Issue 的步驟

### Scenario: `gh` 已安裝且已認證時正常繼續
GIVEN 使用者執行 `/ot:issue 123`
AND `gh --version` 成功
AND `gh auth status` 回傳已認證狀態
WHEN 前置檢查完成
THEN skill 繼續執行「讀取 Issue」步驟

---

## Feature 2: `/ot:issue` — Issue 讀取與不存在處理

透過 `gh issue view` 讀取 Issue 資訊，處理 Issue 不存在的錯誤情況。

### Scenario: Issue 存在時成功讀取 title、body 和 labels
GIVEN `gh` CLI 已安裝且已認證
AND GitHub repo 中存在 Issue #42，標題為 "Add user authentication"，label 為 `enhancement`
WHEN skill 執行 `gh issue view 42 --json title,body,labels,assignees,state`
THEN 成功取得 Issue 的 title、body、labels 欄位
AND skill 繼續執行 workflow 映射步驟

### Scenario: Issue number 不存在時顯示錯誤訊息
GIVEN `gh` CLI 已安裝且已認證
AND GitHub repo 中不存在 Issue #9999
WHEN skill 執行 `gh issue view 9999 --json title,body,labels,assignees,state`
THEN `gh` 指令回傳非零 exit code 或錯誤輸出
AND skill 停止執行
AND 輸出明確錯誤訊息，告知 Issue #9999 不存在
AND 不建立 branch，不初始化 workflow

### Scenario: Issue 已關閉（closed state）仍可讀取並啟動 workflow
GIVEN GitHub repo 中存在 Issue #50，state 為 `closed`
WHEN skill 讀取 Issue #50
THEN 成功讀取 Issue 內容
AND skill 繼續執行（不因 Issue 已關閉而中止）

---

## Feature 3: `/ot:issue` — Label 映射 Workflow

根據 Issue labels 決定啟動哪種 workflow 類型。

### Scenario: bug label 映射到 debug workflow
GIVEN Issue #10 有 label `bug`，title 為 "Login page crashes on mobile"
WHEN skill 讀取 label-workflow-map.md 映射表並解析 Issue labels
THEN 選定 workflow 類型為 `debug`
AND 後續以 `debug` workflow 初始化

### Scenario: enhancement label 映射到 standard workflow
GIVEN Issue #20 有 label `enhancement`，title 為 "Add dark mode support"
WHEN skill 解析 Issue labels
THEN 選定 workflow 類型為 `standard`

### Scenario: 無 label 的 Issue 使用 standard 作為預設 workflow
GIVEN Issue #30 沒有任何 label，title 為 "Improve performance of search"
WHEN skill 在 label-workflow-map.md 找不到對應映射
THEN 選定 workflow 類型為 `standard`（預設 fallback）
AND 繼續使用 `standard` workflow 初始化

### Scenario: security label 映射到 secure workflow
GIVEN Issue #40 有 label `security`，title 為 "Fix XSS vulnerability in comment field"
WHEN skill 解析 Issue labels
THEN 選定 workflow 類型為 `secure`

### Scenario: 多個 label 衝突時依優先級選擇 workflow
GIVEN Issue #55 同時有 labels `bug` 和 `security`
WHEN skill 解析 labels，偵測到多個 label 的映射結果衝突
THEN 依照優先級規則選擇 `secure`（security 優先於 debug）
AND 只啟動一個 workflow，不重複初始化

### Scenario: documentation label 映射到 single workflow
GIVEN Issue #60 有 label `documentation`，title 為 "Update README for new API"
WHEN skill 解析 Issue labels
THEN 選定 workflow 類型為 `single`

---

## Feature 4: `/ot:issue` — Feature Branch 建立

從 Issue title 生成 slug 並建立 feature branch。

### Scenario: 正常 Issue 成功建立 feature branch
GIVEN Issue #42 的 title 為 "Add user authentication"
WHEN skill 從 title 生成 slug 並執行 `git checkout -b feat/issue-42-add-user-authentication`
THEN branch 建立成功，工作目錄切換到新 branch
AND branch 名稱格式為 `feat/issue-<number>-<slug>`

### Scenario: Issue title 含特殊字元時 slug 正確生成
GIVEN Issue #77 的 title 為 "Fix: 登入頁面 crash (iOS 17.0)"
WHEN skill 從 title 生成 slug（轉小寫、非英數字元替換為 `-`、去除首尾 `-`、截斷至 50 字元）
THEN 生成的 slug 只包含英數字元和 `-`，首尾無 `-`
AND branch 名稱合法可建立

### Scenario: 同名 branch 已存在時切換到既有 branch 而非重建
GIVEN 本地已存在 branch `feat/issue-42-add-user-authentication`
WHEN skill 嘗試建立同名 branch
THEN 不執行 `git checkout -b`（避免覆蓋）
AND 執行 `git checkout feat/issue-42-add-user-authentication` 切換到既有 branch
AND 繼續後續步驟，不報錯

---

## Feature 5: `/ot:issue` — Workflow 初始化與 Issue Context 注入

初始化 workflow state 並將 Issue 內容注入 specs。

### Scenario: 從 bug issue 啟動 debug workflow 並初始化 state
GIVEN Issue #10 有 label `bug`，title 為 "Login page crashes"
AND feature branch `feat/issue-10-login-page-crashes` 已建立
WHEN skill 執行 `init-workflow.js debug '' issue-10-login-page-crashes`
THEN workflow.json 建立，workflowType 為 `debug`
AND featureName 為 `issue-10-login-page-crashes`（或由 init 自動決定）
AND skill 繼續執行後續步驟

### Scenario: standard workflow 初始化後 Issue body 注入 proposal.md
GIVEN Issue #20 有 label `enhancement`，body 為 "As a user, I want to toggle dark mode..."
AND `standard` workflow 需要 specs（specs feature 目錄已初始化）
WHEN skill 將 Issue body 寫入 `specs/features/in-progress/{featureName}/proposal.md`
THEN proposal.md 存在且包含 Issue body 的內容
AND proposal.md 格式對齊 proposal-sample.md（含必要的 frontmatter 或標題）

### Scenario: single workflow 不需要 specs，不建立 proposal.md
GIVEN Issue #60 有 label `documentation`，映射到 `single` workflow
WHEN skill 初始化 `single` workflow
THEN 不建立 specs feature 目錄
AND 不嘗試寫入 proposal.md
AND workflow 正常初始化完成

### Scenario: issueNumber 寫入 workflow.json
GIVEN Issue #42 的 workflow 已透過 init-workflow.js 初始化
WHEN skill 執行完 init-workflow.js 後，將 issueNumber=42 寫入 workflow.json 的 options 欄位
THEN `workflow.json` 中包含 `issueNumber: 42`（或 `"issueNumber": 42`）
AND 此欄位可被 `/ot:pr` 讀取

---

## Feature 6: `/ot:pr` — 前置檢查與 Git 資訊收集

驗證 PR 建立環境，並收集必要的 git 資訊。

### Scenario: `gh` CLI 未安裝時終止
GIVEN 使用者執行 `/ot:pr`
WHEN `gh --version` 指令失敗
THEN skill 停止執行，輸出安裝提示
AND 不嘗試讀取 workflow state 或執行任何 git 指令

### Scenario: 沒有新 commits 可建 PR 時警告使用者
GIVEN 目前 branch 相對於 base branch 沒有任何新 commit（`git log base..HEAD` 為空）
WHEN skill 在前置檢查時偵測到無 commits
THEN 輸出警告訊息，告知目前沒有可建 PR 的 commits
AND 停止執行（不建立空的 PR）

### Scenario: 有未推送的 commits 時自動推送
GIVEN 目前 branch 有本地 commits 但尚未推送到 remote（`git log origin/HEAD..HEAD` 非空，或 remote branch 不存在）
WHEN skill 偵測到未推送的 commits
THEN 自動執行 `git push -u origin <branch-name>`
AND push 成功後繼續 PR 建立流程
AND 輸出 push 進度訊息，讓使用者知道正在推送

### Scenario: push 失敗時終止並提示手動處理
GIVEN 自動 push 時遭遇錯誤（如 remote rejected、權限不足）
WHEN `git push` 回傳非零 exit code
THEN skill 停止執行
AND 輸出錯誤訊息，包含 push 失敗原因
AND 提示使用者手動解決後重新執行 `/ot:pr`

---

## Feature 7: `/ot:pr` — Workflow State 讀取與 PR Body 組裝

讀取 workflow 資訊並組裝 PR description。

### Scenario: workflow 完成後成功組裝含 Issue 連結的 PR body
GIVEN workflow.json 存在，workflowType 為 `standard`，issueNumber 為 42
AND `git log main..HEAD` 有 3 個 commits
WHEN skill 讀取 workflow.json 和 git history，並依照 pr-body-template.md 組裝 PR body
THEN PR body 包含 `Closes #42` 字串（連結回 Issue）
AND PR body 包含 Summary 區塊（來自 git log 摘要）
AND PR body 包含 Workflow 區塊（workflowType: standard）

### Scenario: 無 issueNumber 時 PR body 不包含 Closes 連結
GIVEN workflow.json 存在，但不含 issueNumber 欄位（或值為 null）
WHEN skill 組裝 PR body
THEN PR body 不包含 `Closes #` 字串
AND 其他區塊（Summary、Changes、Workflow）正常存在

### Scenario: 無 workflow state 時仍可建立基本 PR
GIVEN 使用者在沒有 Overtone workflow 的情況下執行 `/ot:pr`（workflow.json 不存在或已清除）
WHEN skill 無法讀取 workflow.json
THEN skill 繼續執行，以 git log 和 diff 組裝最小化的 PR body
AND PR body 包含 Summary 和 Changes 區塊（來自 git history）
AND PR body 不包含 Workflow 區塊（因無 workflow state）
AND `gh pr create` 仍正常執行

### Scenario: specs feature 存在時 PR body 包含 BDD 摘要
GIVEN workflow.json 的 featureName 指向一個已存在的 specs feature 目錄
AND 該目錄含有 `bdd.md`（完整 BDD 規格）
WHEN skill 讀取 bdd.md 並提取測試要點
THEN PR body 的 Test Plan 區塊包含從 BDD spec 提取的 scenario 列表或摘要

---

## Feature 8: `/ot:pr` — PR 建立與結果輸出

實際執行 `gh pr create` 並回傳結果。

### Scenario: PR 成功建立並輸出 URL
GIVEN PR body 已組裝完成，git push 已完成，`gh` 已認證
WHEN skill 執行 `gh pr create --base <defaultBranch> --title "..." --body "..."`
THEN PR 建立成功
AND skill 輸出 PR URL（格式：`https://github.com/<owner>/<repo>/pull/<number>`）
AND PR title 清晰描述本次變更（不硬編碼格式）

### Scenario: 同 branch 已有開啟的 PR 時提示使用者
GIVEN 目前 branch 已有一個開啟的 PR
WHEN `gh pr create` 回傳「pull request already exists」錯誤
THEN skill 停止執行，不重複建 PR
AND 輸出提示訊息，告知已有 PR 存在，並附上既有 PR 的 URL
AND 建議使用者用 `gh pr view` 查看或繼續更新該 PR

### Scenario: base branch 動態偵測（不硬編碼 main）
GIVEN repo 的預設 branch 為 `master`（而非 `main`）
WHEN skill 執行 `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` 取得預設分支
THEN PR 的 --base 參數為 `master`（動態取得的預設分支）
AND PR 建立成功，指向正確的 base branch

---

## Feature 9: SessionStart banner 顯示 `gh` CLI 狀態

on-start.js 在 session 啟動時偵測 `gh` 可用性並在 banner 中顯示狀態。

### Scenario: `gh` 已安裝且已認證時 banner 顯示可用狀態
GIVEN 使用者啟動新的 Claude Code session
AND `gh` CLI 已安裝且 `gh auth status` 回傳已認證
WHEN on-start.js 執行 banner 建立邏輯
THEN banner 中包含 `gh` 工具的狀態行，顯示為可用（例如：`gh cli: ready` 或含 check emoji）
AND banner 格式與 agent-browser 狀態行一致（相同的 prefix + emoji 模式）

### Scenario: `gh` 未安裝時 banner 顯示未安裝提示
GIVEN `which gh` 指令失敗（`gh` 未安裝）
WHEN on-start.js 執行 banner 建立邏輯
THEN banner 中包含 `gh` 工具的狀態行，顯示為未安裝（例如：`gh cli: not installed`）
AND banner 包含安裝提示（如 `brew install gh`）
AND session 正常啟動（不因 `gh` 未安裝而阻擋）

### Scenario: `gh` 已安裝但未認證時 banner 顯示未認證提示
GIVEN `which gh` 成功，但 `gh auth status` 回傳未認證錯誤
WHEN on-start.js 執行 banner 建立邏輯
THEN banner 中顯示 `gh` 已安裝但未認證（例如：`gh cli: not authenticated`）
AND banner 包含認證提示（`gh auth login`）
AND session 正常啟動（不阻擋）

### Scenario: `gh` 狀態偵測失敗時不影響 session 啟動
GIVEN `which gh` 或 `gh auth status` 執行拋出非預期錯誤（如 execSync 超時）
WHEN on-start.js 的 gh 偵測邏輯拋出例外
THEN try/catch 捕獲錯誤，靜默降級
AND banner 不顯示 `gh` 狀態行（或顯示 unknown 狀態）
AND session 正常啟動，不崩潰（exit code 0）
