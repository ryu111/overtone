---
name: pr
description: 從 Overtone workflow 結果自動建立 GitHub Pull Request。收集 git 變更和 workflow 狀態，組裝結構化 PR description。
disable-model-invocation: false
---

# /ot:pr — 自動建立 GitHub Pull Request

## 說明

收集當前分支的 git 變更、workflow 執行結果和 BDD spec，組裝結構化 PR description 並透過 `gh` CLI 建立 PR。

若 workflow.json 有 `issueNumber`，PR description 自動包含 `Closes #<number>`。

## 執行步驟

### Step 1：前置檢查

確認 `gh` CLI 已安裝且已認證：

```bash
gh auth status
```

- 若指令失敗（未安裝或未認證）→ 停止執行，輸出錯誤訊息並說明如何安裝/認證
- 確認無誤後繼續

### Step 2：收集 Git 資訊

偵測 base branch：

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

收集 commits 和變更統計：

```bash
git log <baseBranch>...HEAD --oneline
git diff <baseBranch>...HEAD --stat
```

取得當前分支名稱：

```bash
git rev-parse --abbrev-ref HEAD
```

### Step 3：檢查是否有 commits

確認當前 branch 相對於 base branch 是否有新 commits：

```bash
git log <baseBranch>..HEAD --oneline
```

若輸出為空（沒有任何 commits）→ 停止執行，警告使用者目前沒有可建 PR 的 commits。

### Step 4：檢查 Push 狀態

確認是否有未推送的 commits：

```bash
git log origin/HEAD..HEAD --oneline 2>/dev/null || git log --oneline -1
```

若有未推送的 commits → 推送到遠端：

```bash
git push -u origin HEAD
```

### Step 5：讀取 Workflow State

讀取 workflow.json：

```bash
node -e "
const { readFileSync } = require('fs');
const os = require('os');
const sessionId = process.env.CLAUDE_SESSION_ID || '';
const p = \`\${os.homedir()}/.overtone/sessions/\${sessionId}/workflow.json\`;
try {
  const s = JSON.parse(readFileSync(p, 'utf8'));
  console.log(JSON.stringify({ issueNumber: s.issueNumber, workflowType: s.workflowType, stages: s.stages }));
} catch(e) {
  console.log('{}');
}
"
```

取出：
- `issueNumber`：若有，PR 描述加入 `Closes #<number>`
- `workflowType`：標示執行的 workflow 類型
- `stages`：取得各 stage 結果（PASS/FAIL）

### Step 6：讀取 Specs（若存在）

嘗試讀取 BDD spec：

```bash
ls specs/features/in-progress/*/bdd.md 2>/dev/null
```

若存在，讀取並取出 `Scenario` 標題清單（用於 PR description 的 Test Results 區塊）。

### Step 7：組裝 PR Body

讀取模板：

```
${CLAUDE_PLUGIN_ROOT}/skills/pr/references/pr-body-template.md
```

填入以下資訊：

- **Summary**：從 git log 摘要變更（每個 commit 一行）
- **Changes**：從 `git diff --stat` 列出變更檔案
- **Test Results**：
  - 從 workflow.json `stages` 取得各 stage 結果
  - 格式：`[STAGE] PASS/FAIL`
  - 若有 BDD spec，附上 scenario 清單
- **Closes**：若有 `issueNumber`，加入 `Closes #<issueNumber>`

### Step 8：建立 PR

先檢查是否已有開啟的 PR：

```bash
gh pr list --head <currentBranch> --state open --json number,url
```

- 若已有開啟的 PR → 輸出提示（PR URL）並停止，不重複建立
- 若無 → 建立 PR：

```bash
gh pr create \
  --title "<title>" \
  --body "<body>" \
  --base <baseBranch>
```

PR title 格式：
- 有 issueNumber：`fix: <issue title> (#<number>)`（bug 類）或 `feat: <issue title> (#<number>)`（其他）
- 無 issueNumber：從 git log 第一個 commit message 取得，或使用分支名稱推斷

輸出建立成功的 PR URL。

## 完成條件

- ✅ gh CLI 已確認可用
- ✅ git 資訊已收集（commits、diff stat、base branch）
- ✅ 未推送的 commits 已推送
- ✅ workflow state 已讀取
- ✅ PR body 已組裝（含 Closes # 若有 issueNumber）
- ✅ PR 已建立（或已有開啟的 PR 時輸出提示）
- ✅ PR URL 已輸出到對話
