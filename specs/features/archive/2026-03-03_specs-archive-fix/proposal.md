---
feature: specs-archive-fix
type: proposal
status: in-progress
created: 2026-03-03
---

# Specs 歸檔系統修復 — Proposal

## 背景

Specs 系統（`specs/features/in-progress/` → `archive/`）在 v0.28.20 穩定運作，
但存在 4 個結構性弱點，可能導致：
1. 無 specs 的 workflow（single/discovery）誤綁 in-progress 中的 feature
2. workflow 類型不符的 session 提前歸檔他人的 feature
3. 有 specs 的 workflow 忘記傳 featureName，歸檔無聲失敗
4. Main Agent 遺忘在 init 指令傳入 featureName 參數

## 目標

修復 4 個弱點，提升 specs 歸檔的正確性與可觀測性。

## 需求分析

### 修復 1：auto-sync 加 specsConfig 過濾

**問題**：SubagentStop 的 featureName auto-sync（agent/on-stop.js 第 77-84 行）
無論何種 workflow 都會執行，導致 single/discovery 等無 specs 的 workflow
也可能在 SubagentStop 時綁定到 in-progress 中剛好存在的 feature。

**根因**：缺少 `specsConfig[workflowType].length > 0` 的前置條件過濾。

**修復**：在 auto-sync 邏輯外層加上：
```javascript
const { specsConfig } = require('../../../scripts/lib/registry');
if (specsConfig[currentState.workflowType]?.length > 0) {
  // 執行 auto-sync
}
```

### 修復 2：歸檔前驗證 workflow 匹配

**問題**：session/on-stop.js 的歸檔邏輯（第 110-126 行）只檢查 `featureName` 是否存在，
沒有驗證 tasks.md frontmatter 的 `workflow` 欄位是否與 `currentState.workflowType` 匹配，
導致不同 workflow 的 session 可能歸檔他人的 feature。

**根因**：`archiveFeature` 被呼叫前缺少 workflow 匹配驗證。

**修復**：在呼叫 `specs.archiveFeature` 前：
```javascript
const tasksPath = paths.project.featureTasks(projectRoot, featureName);
const frontmatter = specs.readTasksFrontmatter(tasksPath);
if (frontmatter?.workflow && frontmatter.workflow !== currentState.workflowType) {
  hookError('on-stop', `警告：specs workflow 不匹配（tasks.md: ${frontmatter.workflow}，state: ${currentState.workflowType}），跳過歸檔`);
  timeline.emit(sessionId, 'specs:archive-skipped', { featureName, reason: 'workflow-mismatch' });
  // 跳過歸檔，仍正常完成
} else {
  // 執行歸檔
}
```

### 修復 3：有 specs 的 workflow 在 tasksStatus===null 時發診斷警告

**問題**：session/on-stop.js 第 89 行讀取 `tasksStatus` 後，若為 null 且
workflow 應有 specs（specsConfig 非空），這是異常狀態，但目前完全靜默。

**根因**：缺少對 `specsConfig` 與 `tasksStatus` 組合異常的偵測。

**修復**：在 `tasksStatus` 賦值後加入：
```javascript
const { specsConfig } = require('../../../scripts/lib/registry');
if (tasksStatus === null && specsConfig[currentState.workflowType]?.length > 0 && featureName) {
  hookError('on-stop', `診斷：${currentState.workflowType} workflow 應有 tasks.md 但讀取為 null（feature: ${featureName}）`);
  timeline.emit(sessionId, 'specs:tasks-missing', { workflowType: currentState.workflowType, featureName });
}
```

策略：**warn but don't block** — 不阻擋退出，僅記錄可觀測的異常。

### 修復 4：Command 模板加 featureName 提示

**問題**：6 個含 specs 的 workflow command（standard/full/secure/refactor/tdd/quick）
的初始化指令格式為：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js {type} ${CLAUDE_SESSION_ID}
```
缺少 featureName 參數，且沒有說明 featureName 的格式要求，
導致 Main Agent 常常忘記傳入，造成後續歸檔無法進行。

**根因**：Command 模板的初始化指令缺少第三個參數及說明。

**修復**：將初始化指令改為：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js {type} ${CLAUDE_SESSION_ID} {featureName}
```
並加一行說明：`{featureName}` 必須是 kebab-case（如 `my-feature-name`），
對應本次功能開發的識別名稱。

## 實作範圍

### 主要修改檔案

| 檔案 | 修改原因 |
|------|---------|
| `plugins/overtone/hooks/scripts/agent/on-stop.js` | 修復 1：auto-sync 加 specsConfig 過濾 |
| `plugins/overtone/hooks/scripts/session/on-stop.js` | 修復 2 + 修復 3：歸檔驗證 + 診斷警告 |
| `plugins/overtone/commands/standard.md` | 修復 4：加 featureName 參數提示 |
| `plugins/overtone/commands/full.md` | 修復 4 |
| `plugins/overtone/commands/secure.md` | 修復 4 |
| `plugins/overtone/commands/refactor.md` | 修復 4 |
| `plugins/overtone/commands/tdd.md` | 修復 4 |
| `plugins/overtone/commands/quick.md` | 修復 4 |

### 需新增/修改的測試

| 測試檔 | 測試類型 | 新增場景數 |
|--------|---------|----------|
| `tests/integration/agent-on-stop.test.js` | integration | +2（修復 1 驗證） |
| `tests/integration/session-stop.test.js` | integration | +3（修復 2 + 修復 3） |

## 不在此次範圍

- `init-workflow.js` 腳本本身不修改（已支援第三參數 featureName，只是 command 模板沒傳）
- Dashboard / SSE 事件顯示相關變更
- `specsConfig` 內容本身的調整（Quick 是否應有 bdd 等設計問題）
