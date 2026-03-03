---
feature: specs-archive-fix
type: design
status: in-progress
created: 2026-03-03
---

# Specs 歸檔系統修復 — Technical Design

## 技術摘要（What & Why）

修復 4 個結構性弱點，全部屬於**條件防護補強**性質，無需引入新模組或新抽象層。

- **方案**：最小侵入式修復 — 在現有 hook 函式中加入前置條件判斷和診斷輸出
- **理由**：4 個修復都是在正確位置缺少正確的 guard，不是設計錯誤，不需要重構
- **取捨**：新增 2 個 timeline 事件類型（`specs:archive-skipped`、`specs:tasks-missing`）加入 registry.js 的 `timelineEvents`，保持所有事件都有 SoT 定義；Dashboard 不需為此修改（timeline viewer 顯示所有 event type）

## Planner Open Questions 解答

### Q1：新 timeline 事件是否需要加入 registry.js `timelineEvents`？

**答：是。** `timelineEvents` 是 SoT，所有 emit 的事件必須在此登記。dashboard、platform-alignment 測試、reference-integrity 測試都會驗證事件 type 的合法性。

新增兩個事件到 `specs` 類別：
- `specs:archive-skipped`：workflow 不匹配時跳過歸檔
- `specs:tasks-missing`：有 specs 的 workflow 讀到 null tasksStatus

### Q2：修復 2 的 tasksPath — 引入 paths 模組還是直接 join？

**答：使用 paths 模組。** session/on-stop.js 已 import `paths`（不存在，需確認）...

實際確認：session/on-stop.js 目前**未 import paths**。但 specs.js 的 `featurePath()` 和 `paths.project.featureTasks()` 都能得到相同路徑。

最佳做法：直接用 `specs.featurePath(projectRoot, featureName)` 拼出 tasksPath，再讀 frontmatter，避免多引入模組。

具體實作：
```javascript
const { join } = require('path');
const tasksPath = join(specs.featurePath(projectRoot, featureName), 'tasks.md');
```

這樣不需要 import paths，保持 session/on-stop.js 的 import 最小化。

### Q3：修復 3 是否需加 `projectRoot` 非空判斷？

**答：不需要額外加。** 修復 3 的觸發點在 `tasksStatus === null && specsConfig[wf]?.length > 0 && featureName` 這個條件下，而 `tasksStatus` 由 `projectRoot ? loop.readTasksStatus(...) : null` 計算（第 89 行），若 `projectRoot` 為空則 `tasksStatus` 已為 null，但此時 `featureName` 通常也會是 null，因此條件自然不成立。明確的判斷是 `featureName` 非空，已足夠。

## API 介面設計

### 修復 1：agent/on-stop.js — featureName auto-sync 加 specsConfig 過濾

修改位置：第 77-84 行的 featureName auto-sync 區塊。

**Before（現有邏輯）**：
```javascript
// featureName auto-sync（第 77-84 行）
if (!updatedState.featureName && projectRoot) {
  try {
    const specs = require('../../../scripts/lib/specs');
    const af = specs.getActiveFeature(projectRoot);
    if (af) { setFeatureName(sessionId, af.name); updatedState.featureName = af.name; }
  } catch { /* 靜默 */ }
}
```

**After（加入 specsConfig 過濾）**：
```javascript
// featureName auto-sync（只對有 specs 的 workflow 執行）
const { specsConfig } = require('../../../scripts/lib/registry');
if (!updatedState.featureName && projectRoot && specsConfig[currentState.workflowType]?.length > 0) {
  try {
    const specs = require('../../../scripts/lib/specs');
    const af = specs.getActiveFeature(projectRoot);
    if (af) { setFeatureName(sessionId, af.name); updatedState.featureName = af.name; }
  } catch { /* 靜默 */ }
}
```

注意：`specsConfig` 已從 registry 匯入（第 14 行已有 `{ stages, parallelGroups, retryDefaults }`），需擴充 destructure 加入 `specsConfig`。同時 `currentState` 已在第 43 行讀取，可直接使用 `currentState.workflowType`。

**Import 修改**：
```javascript
// 現有（第 14 行）
const { stages, parallelGroups, retryDefaults } = require('../../../scripts/lib/registry');

// 修改後
const { stages, parallelGroups, retryDefaults, specsConfig } = require('../../../scripts/lib/registry');
```

### 修復 2：session/on-stop.js — 歸檔前驗證 workflow 匹配

修改位置：第 110-126 行的「Specs 自動歸檔」區塊。

**Before（現有邏輯）**：
```javascript
if (featureName) {
  try {
    const specs = require('../../../scripts/lib/specs');
    const archivePath = specs.archiveFeature(projectRoot, featureName);
    timeline.emit(sessionId, 'specs:archive', { featureName, archivePath });
  } catch (archErr) {
    hookError('on-stop', `警告：歸檔失敗 — ${archErr.message}`);
  }
}
```

**After（加入 workflow 匹配驗證）**：
```javascript
if (featureName) {
  try {
    const specs = require('../../../scripts/lib/specs');
    const { join } = require('path');
    const tasksPath = join(specs.featurePath(projectRoot, featureName), 'tasks.md');
    const frontmatter = specs.readTasksFrontmatter(tasksPath);

    if (frontmatter?.workflow && frontmatter.workflow !== currentState.workflowType) {
      // workflow 不匹配 → 跳過歸檔，記錄可觀測事件
      hookError('on-stop', `警告：specs workflow 不匹配（tasks.md: ${frontmatter.workflow}，state: ${currentState.workflowType}），跳過歸檔`);
      timeline.emit(sessionId, 'specs:archive-skipped', {
        featureName,
        reason: 'workflow-mismatch',
        tasksWorkflow: frontmatter.workflow,
        stateWorkflow: currentState.workflowType,
      });
    } else {
      const archivePath = specs.archiveFeature(projectRoot, featureName);
      timeline.emit(sessionId, 'specs:archive', { featureName, archivePath });
    }
  } catch (archErr) {
    hookError('on-stop', `警告：歸檔失敗 — ${archErr.message}`);
  }
}
```

注意：`currentState` 在 session/on-stop.js 第 37 行已讀取，可直接使用。

### 修復 3：session/on-stop.js — tasksStatus===null 診斷警告

修改位置：第 89-90 行（`tasksStatus` 賦值後）。

**After（加入診斷）**：
```javascript
const { specsConfig } = require('../../../scripts/lib/registry');
const tasksStatus = projectRoot ? loop.readTasksStatus(projectRoot, featureName) : null;

// 診斷：有 specs 的 workflow 但 tasks.md 無效 → warn but don't block
if (tasksStatus === null && specsConfig[currentState.workflowType]?.length > 0 && featureName) {
  hookError('on-stop', `診斷：${currentState.workflowType} workflow 應有 tasks.md 但讀取為 null（feature: ${featureName}）`);
  timeline.emit(sessionId, 'specs:tasks-missing', {
    workflowType: currentState.workflowType,
    featureName,
  });
}
```

注意：session/on-stop.js 目前 import `{ stages, loopDefaults }` from registry（第 18 行），需擴充加入 `specsConfig`。

**Import 修改**（session/on-stop.js 第 18 行）：
```javascript
// 現有
const { stages, loopDefaults } = require('../../../scripts/lib/registry');

// 修改後
const { stages, loopDefaults, specsConfig } = require('../../../scripts/lib/registry');
```

### 修復 4：6 個 Command 模板加 featureName 參數提示

修改 6 個 command 的「初始化」區段，統一格式：

**Before**：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js {type} ${CLAUDE_SESSION_ID}
```

**After**（以 standard 為例）：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js standard ${CLAUDE_SESSION_ID} {featureName}
```

在指令下方加一行說明：
```
> `{featureName}` 必須是 kebab-case（如 `my-feature-name`），對應本次功能的識別名稱。
```

## 資料模型

### 新增 Timeline 事件（registry.js `timelineEvents`）

```javascript
// 新增到 specs 類別（現有 2 個 → 共 4 個）
'specs:archive-skipped': { label: 'Specs 歸檔略過', category: 'specs' },
'specs:tasks-missing':   { label: 'Specs Tasks 遺失', category: 'specs' },
```

### specs:archive-skipped 事件資料結構

```javascript
{
  featureName: string,      // feature 名稱（kebab-case）
  reason: 'workflow-mismatch',  // 略過原因
  tasksWorkflow: string,    // tasks.md frontmatter 中的 workflow
  stateWorkflow: string,    // workflow state 中的 workflowType
}
```

### specs:tasks-missing 事件資料結構

```javascript
{
  workflowType: string,     // workflow 類型（如 'standard'）
  featureName: string,      // 當下 session 的 featureName
}
```

## 檔案結構

```
修改的檔案：
  plugins/overtone/hooks/scripts/agent/on-stop.js
    ← 修復 1：registry import 加 specsConfig；auto-sync 外層加 specsConfig 過濾

  plugins/overtone/hooks/scripts/session/on-stop.js
    ← 修復 2：歸檔前讀 frontmatter 驗證 workflow 匹配
    ← 修復 3：registry import 加 specsConfig；tasksStatus 後加診斷 warn

  plugins/overtone/scripts/lib/registry.js
    ← 新增 specs:archive-skipped 和 specs:tasks-missing 到 timelineEvents

  plugins/overtone/commands/standard.md
    ← 修復 4：init 指令加 {featureName} 參數 + 說明

  plugins/overtone/commands/full.md
    ← 修復 4

  plugins/overtone/commands/secure.md
    ← 修復 4

  plugins/overtone/commands/refactor.md
    ← 修復 4

  plugins/overtone/commands/tdd.md
    ← 修復 4

  plugins/overtone/commands/quick.md
    ← 修復 4

修改的測試：
  tests/integration/agent-on-stop.test.js
    ← 新增 2 個場景（修復 1）

  tests/integration/session-stop.test.js
    ← 新增 3 個場景（修復 2 + 修復 3）
```

## 關鍵技術決策

### 決策 1：新 timeline 事件是否加入 registry.js

- **選項 A（選擇）**：加入 `timelineEvents` SoT — platform-alignment 和 reference-integrity 測試驗證事件類型，未登記的 event 會導致測試失敗
- **選項 B（未選）**：不加入，直接 emit 字串 — 打破 SoT 原則，會導致現有 guard tests 失敗

### 決策 2：session/on-stop.js 讀 tasksPath 的方式

- **選項 A（選擇）**：`join(specs.featurePath(projectRoot, featureName), 'tasks.md')` — 不需要新 import，`specs` 已在 try 區塊內 require，`join` 從 path 模組
- **選項 B（未選）**：import paths 模組，使用 `paths.project.featureTasks()` — 功能相同但多一個 import，paths 模組在 session/on-stop.js 目前未使用

### 決策 3：修復 3 的 specsConfig import 位置

- **選項 A（選擇）**：在第 18 行 registry import 中直接擴充 destructure（頂層 import）— 符合現有 pattern，清晰易維護
- **選項 B（未選）**：在觸發條件的 if 判斷前臨時 require — 不一致，且 registry 已是頂層 import

### 決策 4：修復 2 的 `join` 取得方式

- **選項 A（選擇）**：在 try 區塊內 `const { join } = require('path')` — session/on-stop.js 目前沒有頂層 path import，局部 require 最小侵入
- **選項 B（未選）**：在頂層加 `const { join } = require('path')` — 更整潔，但目前該模組不需要 path，增加不必要依賴

實際上，評估後選**選項 B（頂層 import）** 更佳，因為若未來 session/on-stop.js 有其他 path 操作也能複用，且與 agent/on-stop.js 的 pattern 一致。

## 實作注意事項

給 developer 的提醒：

1. **agent/on-stop.js 的 currentState**：`currentState` 在第 43 行 `readState(sessionId)` 取得，在 auto-sync 區塊（第 77 行）時仍可使用，不需再讀一次。

2. **session/on-stop.js 的 currentState**：第 37 行 `state.readState(sessionId)` 取得，在第 92 行 `allCompleted` 判斷後的歸檔區塊（第 111 行）仍可使用。

3. **修復 2 的 try 結構**：`specs` 在 try 內 require，`join` 需要在 require 前或同時取得。修改後 try 區塊會同時 require path 和 specs，確保 path 的 join 在 try 保護內。

4. **修復 3 的觸發位置**：在第 89 行 `tasksStatus` 賦值後、第 90 行 `allCompleted` 賦值前插入，確保診斷在 allCompleted 判斷之前發出。

5. **6 個 command 格式統一**：quick.md 的 workflow 階段描述不提 featureName（因 quick 的 specsConfig 只有 `['tasks']`，沒有 bdd，架構相對簡單），但 quick 的 tasks.md 仍需 featureName 才能歸檔，所以**也要加**參數提示。

6. **init-workflow.js 第三參數**：確認現有 init-workflow.js 已支援第三參數 featureName（proposal 確認不需修改腳本本身）。

7. **platform-alignment 測試**：`timelineEvents` 新增後需確認 `tests/unit/platform-alignment-registry.test.js` 或相關測試不會因此 break（應是加條目不會 break，僅供確認）。
