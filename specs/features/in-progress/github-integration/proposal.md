# Proposal: GitHub Integration

`github-integration`

## 需求背景（Why）

- **問題**：目前 Overtone 的 workflow 啟動方式是使用者口述需求、Main Agent 判斷 workflow 類型。但團隊開發常見的流程是「從 GitHub Issue 開始，到建 PR 結束」。目前這段流程需要使用者手動描述 Issue 內容、手動建 PR，沒有自動化銜接。
- **目標**：打通 GitHub Issue → Overtone Workflow → PR 的完整閉環。使用者只需 `/ot:issue 123` 即可啟動對應 workflow；workflow 結束後 `/ot:pr` 自動建 PR 並連結回 Issue。
- **優先級**：這是 Overtone 與外部工具整合的第一步，建立 `gh` CLI 依賴的基礎設施，未來可擴展到 CI、Release 等。

## 使用者故事

```
身為開發者
我想要輸入 /ot:issue 123 就能自動讀取 Issue 內容並啟動合適的 workflow
以便不用手動複製 Issue 描述、不用思考該選哪個 workflow
```

```
身為開發者
我想要在 workflow 完成後輸入 /ot:pr 就能自動建立 PR
以便 PR description 能自動包含 workflow 產出的摘要和關聯的 Issue 連結
```

## 範圍邊界

### 在範圍內（In Scope）

- `/ot:issue <number>` skill：透過 `gh issue view` 讀取 Issue → labels 映射 workflow → 建立 feature branch → 啟動 workflow
- `/ot:pr` skill：透過 `gh pr create` 建 PR → 從 workflow 結果組裝 description → 包含 `Closes #<number>` 連結
- `gh` CLI 可用性檢查：on-start.js 新增 `which gh` 偵測（比照 agent-browser 檢查模式）
- Issue labels → workflow 映射表（作為 reference 文件放在 issue skill 內）

### 不在範圍內（Out of Scope）

- PR 審查結果回寫 GitHub comment
- GitHub Actions CI 整合
- Issue 自動 triage / 自動分配
- GitLab / Bitbucket 支援
- Issue comment 讀取（只讀 Issue body + labels）
- 多 Issue 批次處理

## 子任務清單

### 1. `gh` CLI 依賴檢查（on-start.js 擴充）
   - 負責 agent：開發者
   - 相關檔案：`plugins/overtone/hooks/scripts/session/on-start.js`
   - 說明：在 banner 區塊新增 `which gh` 偵測，比照 agent-browser 的檢查模式，顯示安裝狀態。不影響系統啟動（純提示）。

### 2. `/ot:issue` skill 建立
   - 負責 agent：開發者
   - 相關檔案：
     - `plugins/overtone/skills/issue/SKILL.md`（新建）
     - `plugins/overtone/skills/issue/references/label-workflow-map.md`（新建）
   - 說明：
     - 建立 `issue/SKILL.md`，定義執行步驟：(1) `gh issue view <number> --json` 讀取 Issue (2) 解析 labels 映射 workflow (3) 建立 feature branch `feat/issue-<number>-<slug>` (4) 啟動對應 workflow（帶 Issue context 注入）
     - 建立 `references/label-workflow-map.md`，定義 label → workflow 映射表 + fallback 邏輯

### 3. `/ot:pr` skill 建立
   - 負責 agent：開發者
   - 相關檔案：
     - `plugins/overtone/skills/pr/SKILL.md`（新建）
     - `plugins/overtone/skills/pr/references/pr-body-template.md`（新建）
   - 說明：
     - 建立 `pr/SKILL.md`，定義執行步驟：(1) 收集 workflow 結果（state + timeline） (2) 組裝 PR body (3) `gh pr create` 建 PR
     - 建立 `references/pr-body-template.md`，定義 PR body 格式模板

### 4. `/ot:auto` workflow 選擇器更新
   - 負責 agent：開發者
   - 相關檔案：`plugins/overtone/skills/auto/SKILL.md`
   - 說明：在工作流選擇指南表格中新增 `/ot:issue` 和 `/ot:pr` 的入口說明

### 5. 測試撰寫（可與 4 並行）
   - 負責 agent：測試者
   - 相關檔案：
     - `tests/unit/label-workflow-map.test.js`（新建，若映射邏輯需要 JS）
     - `tests/integration/gh-check.test.js`（新建）
   - 說明：驗證 `gh` 偵測邏輯、label → workflow 映射邏輯

### 6. 文件更新（依賴 1-4 完成）
   - 負責 agent：文件同步者
   - 相關檔案：`docs/status.md`、`docs/spec/overtone.md`（更新 skill 計數）
   - 說明：更新 skill 計數、新增 `/ot:issue` 和 `/ot:pr` 到常用指令區塊

## 開放問題

1. **label → workflow 映射放在哪裡？**
   - 選項 A：純 markdown reference 文件（`references/label-workflow-map.md`），由 Main Agent 在 skill 執行時參考 → 零依賴，skill 本身就是指引
   - 選項 B：registry.js 新增 `labelWorkflowMap` 物件 → 可程式化但 label 是外部系統概念，不應進入 SoT
   - 傾向 A，需要架構者確認

2. **feature branch 建立時機**：
   - 選項 A：`/ot:issue` skill 執行 Step 3 時建立 → Issue skill 完整控制 git 流程
   - 選項 B：workflow 初始化前由 init-workflow.js 建立 → 集中管理
   - 傾向 A，因為 branch 名稱包含 issue number 和 slug，這些資訊只有 issue skill 知道

3. **PR body 如何收集 workflow 資訊？**
   - workflow.json 有 stage 完成狀態 + featureName
   - timeline.jsonl 有完整事件流
   - Handoff 是虛擬的（只存在 context window，不寫磁碟），所以 PR skill 無法讀取 Handoff chain
   - 替代方案：PR skill 直接讀取 `git log` + `git diff` 組裝 summary？需要架構者決定資訊來源

4. **`/ot:pr` 是獨立工具還是 workflow 的一部分？**
   - 選項 A：獨立工具型 skill（像 `/ot:onboard`），使用者手動觸發
   - 選項 B：整合到 DOCS stage 之後自動觸發
   - 傾向 A，因為不是所有 workflow 都需要建 PR（如 debug、diagnose）

5. **`/ot:issue` 啟動的 workflow 是否需要注入 Issue context 到 specs？**
   - 如果是 standard/full workflow，specs feature 會初始化，Issue 的 body 可以作為 proposal.md 的基礎
   - 需要架構者決定注入方式
