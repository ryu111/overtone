# Design: GitHub Integration

## 技術摘要（What & Why）

- **方案**：新增兩個工具型 Skill（`/ot:issue`、`/ot:pr`），純 Markdown 指引，不新增 JS 模組。依賴 `gh` CLI 做所有 GitHub API 互動，on-start.js 新增 `gh` 可用性檢查。
- **理由**：
  1. Skill 是 Main Agent 的指引文件，Issue 解析和 PR 建立這類操作由 Main Agent 執行 shell 命令完成，不需要 Hook 或 lib 層面的程式碼。
  2. `gh` CLI 已處理認證、API rate limit、repo context 偵測等所有底層邏輯，不需要自建 HTTP client。
  3. Label 映射放在 reference 文件而非 registry.js — label 是外部系統（GitHub）的概念，不應進入 Overtone 的 SoT。
- **取捨**：映射表是靜態的 Markdown（無法程式化驗證），但保持了 Skill 的零依賴特性，且 Main Agent 對自然語言映射表的解讀能力足夠。

## API 介面設計

此功能不新增任何 JavaScript 函式或 HTTP endpoint。兩個 Skill 都是純 Markdown 指引，Main Agent 按步驟執行 shell 命令。

### `/ot:issue <number>` — 執行流程

```
輸入：Issue number（必要）
輸出：啟動對應 workflow 並帶入 Issue context

Step 1: gh issue view <number> --json title,body,labels,assignees,milestone,state
Step 2: 解析 labels → 映射 workflow 類型（讀取 reference）
Step 3: 從 title 生成 slug → git checkout -b feat/issue-<number>-<slug>
Step 4: 初始化 workflow → init-workflow.js <workflowType> '' <featureName>
Step 5: 將 Issue body 注入 specs proposal.md（若 workflow 需要 specs）
Step 6: 啟動 workflow（讀取對應 workflow skill）
```

### `/ot:pr` — 執行流程

```
輸入：無（自動從 context 收集）
輸出：建立 GitHub PR 並回傳 URL

Step 1: 收集 git 資訊（git log、git diff --stat、branch name）
Step 2: 讀取 workflow state（workflow.json）和 specs（若有）
Step 3: 解析 branch name 取得 issue number（若有）
Step 4: 組裝 PR body（讀取 reference template）
Step 5: gh pr create --base main --title "..." --body "..."
Step 6: 輸出 PR URL
```

### 錯誤處理

| 錯誤情況 | 處理方式 |
|---------|---------|
| `gh` 未安裝 | Skill 步驟中檢查，提示安裝指令 |
| `gh auth status` 未認證 | Skill 步驟中檢查，提示 `gh auth login` |
| Issue number 不存在 | `gh issue view` 會報錯，Skill 指引 Main Agent 告知使用者 |
| 不在 git repo 中 | `/ot:pr` 步驟中檢查，終止並提示 |
| 已有同名 branch | `/ot:issue` 切換到既有 branch 而非新建 |
| 已有相同 PR | `gh pr create` 會報錯，Skill 指引 Main Agent 告知使用者 |

## 資料模型

此功能不新增資料模型。使用現有的：
- `workflow.json`：讀取 `workflowType`、`stages`、`featureName` 用於 PR body
- `timeline.jsonl`：讀取 `workflow:start`、`stage:complete` 事件用於 PR body
- `specs/features/in-progress/{feature}/proposal.md`：Issue body 注入目標

### workflow.json 欄位擴充

在 `initState` 的 options 中新增可選欄位 `issueNumber`，記錄關聯的 GitHub Issue：

```typescript
interface WorkflowState {
  // ...現有欄位
  issueNumber?: number    // 關聯的 GitHub Issue number（由 /ot:issue 設定）
}
```

此欄位由 `/ot:issue` skill 在初始化 workflow 時，指引 Main Agent 透過 state.js 的 `updateStateAtomic` 寫入。`/ot:pr` skill 讀取此欄位來決定是否加入 `Closes #<number>`。

## 檔案結構

```
新增的檔案：
  plugins/overtone/skills/issue/SKILL.md                      ← 新增：/ot:issue skill 定義
  plugins/overtone/skills/issue/references/label-workflow-map.md  ← 新增：label → workflow 映射表
  plugins/overtone/skills/pr/SKILL.md                         ← 新增：/ot:pr skill 定義
  plugins/overtone/skills/pr/references/pr-body-template.md   ← 新增：PR body 格式模板

修改的檔案：
  plugins/overtone/hooks/scripts/session/on-start.js          ← 修改：新增 gh CLI 可用性檢查
  plugins/overtone/skills/auto/SKILL.md                       ← 修改：工作流選擇表新增 /ot:issue 和 /ot:pr 入口
```

## 關鍵技術決策

### 決策 1：Label 映射位置 — reference Markdown

- **選項 A**（選擇）：`skills/issue/references/label-workflow-map.md` — 純 Markdown 映射表，Main Agent 閱讀後自行判斷
  - 優點：零依賴、Skill 自包含、易於使用者客製（直接編輯 Markdown）
  - 優點：Label 是外部系統概念，不汙染 registry.js 的 SoT 定位
- **選項 B**（未選）：`registry.js` 新增 `labelWorkflowMap` 物件
  - 原因：registry.js 是 Overtone 內部映射的 SoT，GitHub label 是外部概念，語意不匹配

### 決策 2：Feature branch 建立時機 — Issue Skill 內

- **選項 A**（選擇）：`/ot:issue` skill 的 Step 3 建立 branch
  - 優點：branch 名稱需要 issue number 和 title slug，這些資訊只有 issue skill 解析後才有
  - 優點：完整控制 git 流程（檢查是否已存在、命名規則）
- **選項 B**（未選）：`init-workflow.js` 負責建立 branch
  - 原因：init-workflow.js 不知道 issue number 和 slug，要額外傳參數進去，增加複雜度；且 branch 建立不是所有 workflow 都需要的通用邏輯

### 決策 3：PR body 資訊來源 — git log + diff 為主，state 為輔

- **選項 A**（選擇）：`git log`（commit history）+ `git diff --stat`（變更統計）+ `workflow.json`（workflow 類型和 issue number）+ `specs/`（BDD spec，若有）
  - 優點：git log 和 diff 是程式碼變更的直接紀錄，最準確
  - 優點：不依賴虛擬的 Handoff（不寫磁碟），不依賴 timeline 的詳細事件
  - 做法：PR summary 由 Main Agent 根據 git log 和 diff 自行組裝（Main Agent 有 context window 中的完整 workflow 記憶）
- **選項 B**（未選）：從 timeline.jsonl 重建完整 workflow 歷程
  - 原因：timeline 事件粒度太粗（只有 stage start/complete），不足以寫出有意義的 PR description；且 Main Agent 在 workflow 結束時 context window 中已有完整記憶

### 決策 4：`/ot:pr` 定位 — 獨立工具型 Skill

- **選項 A**（選擇）：獨立工具型 skill，使用者手動觸發
  - 優點：不是所有 workflow 都需要建 PR（debug、diagnose、review-only 等）
  - 優點：使用者可在任何時機觸發（workflow 結束後、或手動修改完成後）
  - 優點：與 `/ot:onboard`、`/ot:status` 同類，保持一致的工具型 skill 慣例
- **選項 B**（未選）：整合到 DOCS stage 之後自動觸發
  - 原因：破壞 workflow 的通用性，且會汙染 workflow 模板定義

### 決策 5：Issue context 注入 specs — 自動寫入 proposal.md

- **選項 A**（選擇）：`/ot:issue` skill 在初始化 specs 後，指引 Main Agent 將 Issue body 寫入 `proposal.md` 作為初始內容
  - 優點：planner 可以直接基於 Issue body 開始規劃，不需要重新描述需求
  - 優點：proposal.md 是 planner 的輸入，Issue body 正好是需求的自然來源
  - 做法：Main Agent 讀取 `gh issue view` 的 body，用 Write 工具寫入 `specs/features/in-progress/{featureName}/proposal.md`，格式對齊 proposal-sample.md
- **選項 B**（未選）：不注入，planner 從 Handoff 中的 Issue 摘要自行撰寫
  - 原因：多一層轉換（Handoff → planner 重寫），浪費且可能丟失 Issue 細節

## SKILL.md 結構設計

### `/ot:issue` SKILL.md

```yaml
---
name: issue
description: 從 GitHub Issue 啟動工作流。讀取 Issue 內容和 labels，映射 workflow 類型，建立 feature branch，啟動對應 workflow。
disable-model-invocation: false
---
```

**步驟結構**：
1. **前置檢查**：`gh --version` 和 `gh auth status` 驗證
2. **讀取 Issue**：`gh issue view <number> --json title,body,labels,assignees,state`
3. **映射 Workflow**：讀取 `references/label-workflow-map.md`，根據 labels 判斷 workflow 類型
4. **建立 Feature Branch**：從 title 生成 kebab-case slug，`git checkout -b feat/issue-<number>-<slug>`
5. **初始化 Workflow**：執行 `init-workflow.js <workflowType> '' <featureName>`
6. **注入 Issue Context**：若 workflow 需要 specs，將 Issue body 寫入 `proposal.md`
7. **記錄 Issue Number**：透過 state API 將 issueNumber 寫入 workflow.json
8. **啟動 Workflow**：讀取對應 workflow skill 開始執行

### `/ot:pr` SKILL.md

```yaml
---
name: pr
description: 建立 GitHub Pull Request。從 git history 和 workflow 結果組裝 PR description，自動連結 Issue。
disable-model-invocation: false
---
```

**步驟結構**：
1. **前置檢查**：`gh --version` 和 `gh auth status` 驗證；確認有 commits 可建 PR
2. **收集 Git 資訊**：`git log`（base..HEAD）、`git diff --stat`（base...HEAD）、branch name
3. **讀取 Workflow State**：從 workflow.json 取得 workflowType、issueNumber、featureName
4. **讀取 Specs**（若有）：從 specs feature 目錄讀取 proposal.md 和 bdd.md 摘要
5. **組裝 PR Body**：讀取 `references/pr-body-template.md`，填充模板
6. **建立 PR**：`gh pr create --base main --title "..." --body "..."`
7. **輸出結果**：顯示 PR URL

### Reference 檔案設計

#### `label-workflow-map.md`

定義三層映射邏輯：
1. **精確匹配**：特定 label → 特定 workflow
2. **類別匹配**：label 前綴/分類 → workflow 類別
3. **Fallback**：無匹配 label 時的預設邏輯

映射表內容：

| Label | Workflow | 理由 |
|-------|----------|------|
| `bug` | `debug` | Bug 修復需要先診斷 |
| `enhancement` | `standard` | 功能增強是中型任務 |
| `feature` | `standard` | 新功能開發 |
| `documentation` | `single` | 純文件修改 |
| `security` | `secure` | 安全相關變更 |
| `refactor` | `refactor` | 重構 |
| `performance` | `refactor` | 效能優化通常是重構 |
| `breaking-change` | `full` | 破壞性變更需完整驗證 |
| `design` | `full` | 涉及 UI 設計 |

多 label 衝突解決：優先級 security > full > standard > debug > refactor > single。
無 label 時：Main Agent 根據 Issue title 和 body 自行判斷（參考 `/ot:auto` 的選擇指南）。

#### `pr-body-template.md`

PR body 模板格式：

```markdown
## Summary

{根據 git log 和 diff 組裝的變更摘要，2-5 句話}

## Changes

{git diff --stat 的格式化輸出，或按模組分類的變更清單}

## Workflow

- Type: {workflowType}
- Stages: {completed stages 清單}

## Test Plan

{從 BDD spec 或 commit history 提取的測試要點}

## Related

{Closes #<number>（若有 issueNumber）}

---
Generated by [Overtone](https://github.com/nicholasgriffintn/overtone) v{version}
```

## 實作注意事項

給 developer 的提醒：

1. **on-start.js 修改格式**：完全比照 `agentBrowserStatus` 的 pattern — `try { execSync('which gh') } catch { ... }`，狀態行前綴用 emoji + 工具名稱，未安裝提示包含安裝指令。

2. **Skill frontmatter 的 `disable-model-invocation`**：兩個新 Skill 都設為 `false`，因為它們需要 Main Agent 主動執行步驟（與 `onboard` 一致）。

3. **Branch 命名規則**：`feat/issue-<number>-<slug>`，其中 slug 從 Issue title 生成：
   - 轉小寫
   - 非英數字元替換為 `-`
   - 去除首尾 `-`
   - 截斷至 50 字元
   - 範例：`feat/issue-123-add-user-auth`

4. **`/ot:auto` SKILL.md 更新**：在工作流選擇指南表格末尾新增兩行：
   - `/ot:issue <number>`：從 GitHub Issue 啟動 workflow
   - `/ot:pr`：建立 GitHub PR

5. **issueNumber 寫入方式**：Main Agent 使用 Bash 工具呼叫一段簡短的 Node.js script inline，或者直接用 `jq` 修改 workflow.json。建議用後者以避免引入新 script。實際上，更簡單的方式是讓 `/ot:issue` skill 指引 Main Agent 在 init-workflow.js 呼叫後，用 `node -e` inline script 呼叫 `state.updateStateAtomic` 寫入 issueNumber。

6. **PR base branch 偵測**：`/ot:pr` 不硬編碼 `main`，而是用 `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` 動態取得預設分支。

7. **Specs 目錄重用**：若使用者先手動建了 specs feature（如此次的 `github-integration`），`/ot:issue` 的 `init-workflow.js` 呼叫應傳入相同的 featureName，specs.initFeatureDir 會偵測到已存在而跳過建立。

8. **plugin.json 不需修改**：skills 欄位使用 `"./skills/"` 目錄掃描，新增 skill 目錄自動被發現。
