---
name: issue
description: 從 GitHub Issue 啟動 Overtone workflow。讀取 Issue 內容，根據 labels 自動選擇 workflow 類型，建立 feature branch 並啟動執行。
disable-model-invocation: false
---

# /ot:issue — 從 GitHub Issue 啟動 Workflow

## 說明

讀取指定 GitHub Issue 的標題、描述和 labels，自動對應 Overtone workflow 類型，建立 feature branch 並初始化執行流程。

使用方式：`/ot:issue <issue-number>`

## 執行步驟

### Step 1：前置檢查

確認 `gh` CLI 已安裝且已認證：

```bash
gh auth status
```

- 若指令失敗（未安裝或未認證）→ 停止執行，輸出錯誤訊息並說明如何安裝/認證
- 確認無誤後繼續

### Step 2：讀取 Issue

```bash
gh issue view <number> --json title,body,labels,assignees,state
```

從使用者輸入取得 `<number>`（`/ot:issue <number>` 中的參數）。

### Step 3：錯誤處理

- Issue 不存在或 API 回傳錯誤 → 停止並輸出具體錯誤（Issue 編號、錯誤原因）
- Issue 狀態為 `CLOSED` → 提示使用者確認是否仍要繼續
- 確認 JSON 回傳正常後繼續

### Step 4：Labels 映射 workflow

讀取映射表：

```
${CLAUDE_PLUGIN_ROOT}/skills/issue/references/label-workflow-map.md
```

根據 Issue 的 `labels` 陣列，按映射表選擇 workflow 類型：

- 優先級（多 label 衝突時）：`security` > `full` > `standard` > `debug` > `single`
- 無 label → 使用預設 workflow（`standard`）
- 將選定的 workflowType 記錄供後續步驟使用

### Step 5：建立 feature branch

從 Issue title 產生 slug：
1. 轉小寫
2. 移除非字母數字字元（保留空格和連字符）
3. 空格替換為連字符
4. 截斷至 50 字元
5. 移除結尾連字符

先檢查 branch 是否已存在：

```bash
git branch --list feat/issue-<number>-<slug>
```

- 已存在 → `git checkout feat/issue-<number>-<slug>`（切換到既有 branch）
- 不存在 → `git checkout -b feat/issue-<number>-<slug>`（建立新 branch）

例如：Issue #42 "Add user authentication flow" → `feat/issue-42-add-user-authentication-flow`

### Step 6：初始化 workflow

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js <workflowType> ${CLAUDE_SESSION_ID}
```

### Step 7：注入 Issue context

若 workflow 不是 `single`：

1. 讀取 `specs/features/in-progress/` 下最新建立的 feature 目錄（由 Step 6 建立）
2. 將 Issue 的 title 和 body 寫入 `specs/features/in-progress/<featureName>/proposal.md`：

```markdown
# <Issue Title>

> 來源：GitHub Issue #<number>

## 問題描述

<Issue body>

## 相關資訊

- Issue URL：https://github.com/{owner}/{repo}/issues/<number>
- Labels：<labels list>
- Assignees：<assignees list>
```

### Step 8：記錄 Issue Number 並啟動 workflow

用 `node -e` 將 issueNumber 寫入 workflow.json：

```bash
node -e "
const { readFileSync, writeFileSync } = require('fs');
const os = require('os');
const p = \`\${os.homedir()}/.overtone/sessions/\${process.env.CLAUDE_SESSION_ID || ''}/workflow.json\`;
try {
  const s = JSON.parse(readFileSync(p, 'utf8'));
  s.issueNumber = <number>;
  writeFileSync(p, JSON.stringify(s, null, 2));
  console.log('issueNumber 已記錄：' + s.issueNumber);
} catch(e) {
  process.stderr.write('寫入 issueNumber 失敗：' + e.message + '\n');
}
"
```

然後讀取對應 workflow skill 開始執行：

```
${CLAUDE_PLUGIN_ROOT}/skills/<workflowType>/SKILL.md
```

將 Issue title 和 body 作為使用者需求輸入，傳遞給第一個 stage agent。

## 完成條件

- ✅ gh CLI 已確認可用
- ✅ Issue 已成功讀取
- ✅ workflow 類型已依 labels 自動選擇
- ✅ feature branch 已建立
- ✅ workflow 已初始化
- ✅ Issue context 已注入 proposal.md（非 single workflow）
- ✅ issueNumber 已記錄到 workflow.json
- ✅ 對應 workflow skill 已讀取並開始執行
