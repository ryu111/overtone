# PreCompact Hook — 技術設計

## 技術摘要（What & Why）

- **方案**：新增第 7 個 hook `PreCompact`，在 Claude Code context window 壓縮前觸發，將工作流狀態注入 `systemMessage`，讓壓縮後的 Main Agent 能恢復工作
- **理由**：context compaction 會清除 in-memory 的工作進度資訊（workflow 狀態、當前 stage、未完成任務）。目前只有 `SessionStart` 在 session 間恢復，session 內的 compaction 沒有保護機制。這是 ECC 研究中識別的「三點記憶架構」的缺失環節
- **取捨**：只注入結構化狀態摘要到 systemMessage，不寫額外磁碟檔案（workflow.json 已是即時的）。systemMessage 長度設 2000 字元上限，避免佔太多壓縮後 context

## 5 個 Open Questions 的回答

### Q1: PreCompact stdin 格式

Claude Code 的 hook stdin 格式在各事件間保持一致的基本結構：`{ session_id, cwd, ... }`。PreCompact 事件屬於 session 類（與 SessionStart、Stop 同級），預期包含 `session_id` 和 `cwd`。

**設計決策**：Defensive 處理 — 使用 `safeReadStdin()` 統一解析，session_id 從 `input.session_id` 讀取並 fallback 到 `process.env.CLAUDE_SESSION_ID`，cwd 從 `input.cwd` 讀取並 fallback 到 `process.env.CLAUDE_PROJECT_ROOT`。如果兩者都取不到，輸出空 systemMessage 並 exit 0（不阻擋 compaction）。

### Q2: systemMessage 長度限制

**設計決策**：設定 2000 字元硬上限。理由：

1. Compaction 後的 context window 空間寶貴，不應塞入過長的恢復訊息
2. 關鍵資訊是結構化的（workflow type、stage 進度條、未完成任務清單），不會膨脹
3. 未完成任務清單截斷至最多 5 項（與 SessionStart 的 pendingTasksMsg 邏輯一致）

超過上限時截斷，並附加 `... (已截斷，完整狀態請查看 workflow.json)` 提示。

### Q3: 與 SessionStart 的 pendingTasksMsg 邏輯重複

**設計決策**：抽取共用函式 `buildRecoveryMessage` 到 `hook-utils.js`。

理由：
- SessionStart（line 99-133）和 PreCompact 都需要「讀取 specs active feature + 組裝未完成任務訊息」
- 兩者的邏輯幾乎完全相同（讀 activeFeature → 讀 checkboxes → 格式化未完成清單）
- 但注入點不同：SessionStart 注入 `systemMessage`，PreCompact 也注入 `systemMessage`
- 差異在於 PreCompact 還需要注入 workflow 進度（stages 狀態），SessionStart 不需要（因為新 session 不一定有 workflow）

具體方案：在 `hook-utils.js` 新增 `buildPendingTasksMessage(projectRoot)` 函式，兩個 hook 都調用它。PreCompact 額外加上 workflow 狀態摘要。

### Q4: Timeline 事件命名

**設計決策**：使用 `session:compact`（歸入 session 分類）。

理由：
- Compaction 是 session 生命週期事件（如 session:start、session:end），不是獨立的新分類
- 不值得為一個事件新增 `compact` 分類（registry.js 的 timelineEvents 是 10 個分類，新增分類的門檻應高）
- 命名 `session:compact` 語意清晰：「session 發生了 compaction」

### Q5: Hook 腳本放置位置

**設計決策**：`hooks/scripts/session/pre-compact.js`

理由：
- PreCompact 是 session 級事件（影響整個 session 的 context），與 `on-start.js` 和 `on-stop.js` 同層
- `hooks/scripts/session/` 目錄已存在且慣例明確

## API 介面設計

### 新增函式：buildPendingTasksMessage（hook-utils.js）

```javascript
/**
 * 建構未完成任務恢復訊息
 *
 * 從 specs/features/in-progress 讀取活躍 feature 的 tasks.md，
 * 組裝未完成任務清單。供 SessionStart 和 PreCompact hook 共用。
 *
 * @param {string} projectRoot - 專案根目錄
 * @returns {string|null} 未完成任務訊息，無活躍 feature 或全部完成時回傳 null
 */
function buildPendingTasksMessage(projectRoot) {
  // 回傳格式：
  // 📋 **未完成任務**
  // Feature：{name}（{checked}/{total} 完成）
  // - [ ] TASK_1
  // - [ ] TASK_2
  // ... 還有 N 個
  // → 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。
}
```

### pre-compact.js 輸出格式

```javascript
// 成功時輸出（含 systemMessage）
{
  "systemMessage": "[Overtone 狀態恢復（compact 後）]\n工作流：standard...\n進度：✅📋 ✅🏗️ ✅🧪 ...\n...",
  "result": ""
}

// 無 workflow 時輸出（空操作）
{
  "result": ""
}
```

### systemMessage 結構

```
[Overtone 狀態恢復（compact 後）]
工作流：{workflowType}（{label}）
進度：{progressBar} ({completed}/{total})
目前階段：{currentStage}
失敗次數：{failCount}/3（僅 failCount > 0 時顯示）
拒絕次數：{rejectCount}/3（僅 rejectCount > 0 時顯示）
活躍 Agents：{agent1}（{stage1}）, {agent2}（{stage2}）（僅有活躍 agent 時顯示）

📋 **未完成任務**（僅有活躍 feature 時顯示）
Feature：{name}（{checked}/{total} 完成）
- [ ] TASK_1
- [ ] TASK_2
... 還有 N 個
→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。

⛔ 禁止詢問使用者「我該繼續嗎？」，直接依照目前階段繼續執行。
如需查看工作流指引，請使用 /auto。
```

### 錯誤處理

| 錯誤情況 | 行為 |
|---------|------|
| stdin 為空或畸形 | safeReadStdin 回傳 `{}`，輸出 `{ result: '' }`，不阻擋 compaction |
| session_id 取不到 | 輸出 `{ result: '' }`，不阻擋 compaction |
| workflow.json 不存在 | 輸出 `{ result: '' }`（無 workflow 就無需恢復） |
| specs 讀取失敗 | 跳過 specs 部分，只注入 workflow 狀態 |
| systemMessage 超過 2000 字元 | 截斷並附加提示 |

## 資料模型

### 新增 Timeline 事件

在 `registry.js` 的 `timelineEvents` 中新增：

```javascript
// session 類新增（原有 2 個 → 3 個）
'session:compact': { label: 'Context 壓縮', category: 'session' },
```

不新增其他資料模型。workflow.json 結構不變。

## 檔案結構

```
新增的檔案：
  plugins/overtone/hooks/scripts/session/pre-compact.js  ← 新增：PreCompact hook 主腳本
  tests/integration/pre-compact.test.js                  ← 新增：整合測試

修改的檔案：
  plugins/overtone/hooks/hooks.json                       ← 修改：新增 PreCompact 事件配置
  plugins/overtone/scripts/lib/registry.js                ← 修改：新增 session:compact 事件
  plugins/overtone/scripts/lib/hook-utils.js              ← 修改：新增 buildPendingTasksMessage
  plugins/overtone/hooks/scripts/session/on-start.js      ← 修改：改用 buildPendingTasksMessage
  plugins/overtone/.claude-plugin/plugin.json             ← 修改：版本 bump 0.17.7 → 0.18.0
  docs/spec/overtone-架構.md                              ← 修改：Hook 清單新增 PreCompact
```

## 關鍵技術決策

### 決策 1：systemMessage vs 寫入磁碟檔案

- **選項 A**（選擇）：**systemMessage 注入** — 直接在 hook stdout JSON 中回傳 systemMessage
  - 優點：compaction 完成後 Main Agent 立即看到恢復資訊，無需額外讀檔步驟；與 SessionStart 的 pendingTasksMsg 模式一致
  - 限制：systemMessage 長度有限，不能塞太多資訊
- **選項 B**（未選）：寫入磁碟檔案（如 `~/.overtone/sessions/{id}/compact-recovery.md`）
  - 原因：需要額外機制讓 compaction 後的 Main Agent 知道去讀這個檔案（chicken-and-egg 問題），增加複雜度

### 決策 2：共用函式抽取 vs 各自實作

- **選項 A**（選擇）：**抽取 buildPendingTasksMessage 到 hook-utils.js**
  - 優點：DRY，SessionStart 和 PreCompact 共用同一段邏輯（讀 activeFeature + 格式化未完成任務）；未來如有其他 hook 需要也可復用
  - 改動範圍：hook-utils.js 新增函式 + on-start.js 修改調用
- **選項 B**（未選）：各自實作
  - 原因：兩段邏輯幾乎相同（40+ 行），分開維護會 drift

### 決策 3：session:compact vs compact:start

- **選項 A**（選擇）：`session:compact`
  - 優點：歸入現有 session 分類（session:start, session:end, session:compact），不新增分類
- **選項 B**（未選）：`compact:start`（新分類）
  - 原因：只有一個事件不值得新增分類；未來如有 compact:end 再考慮

### 決策 4：是否在 PreCompact 中同步 featureName

- **選項 A**（選擇）：**不同步** — featureName 的同步由 SessionStart 處理（已有邏輯）
  - 優點：PreCompact 職責單一（注入恢復訊息），不疊加副作用
  - 理由：PreCompact 發生在 session 中間，此時 featureName 早已由 SessionStart 或 /auto 設定過
- **選項 B**（未選）：在 PreCompact 中也做 featureName 同步
  - 原因：過度防禦，增加不必要的 state 寫入

## pre-compact.js 偽代碼

```javascript
#!/usr/bin/env node
'use strict';

const state = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const { stages } = require('../../../scripts/lib/registry');
const { safeReadStdin, safeRun, hookError, buildPendingTasksMessage } = require('../../../scripts/lib/hook-utils');

const MAX_MESSAGE_LENGTH = 2000;

safeRun(() => {
  const input = safeReadStdin();
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || '';
  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  // 無 session → 空操作
  if (!sessionId) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 讀取 workflow 狀態
  const currentState = state.readState(sessionId);
  if (!currentState) {
    // 無 workflow → 空操作
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // emit timeline 事件
  timeline.emit(sessionId, 'session:compact', {
    workflowType: currentState.workflowType,
    currentStage: currentState.currentStage,
  });

  // 組裝 workflow 狀態摘要
  const lines = [];
  lines.push('[Overtone 狀態恢復（compact 後）]');

  // workflow type
  lines.push(`工作流：${currentState.workflowType}`);

  // 進度條
  const stageEntries = Object.entries(currentState.stages);
  const completed = stageEntries.filter(([, s]) => s.status === 'completed').length;
  const total = stageEntries.length;
  const progressBar = stageEntries.map(([k, s]) => {
    const base = k.split(':')[0];
    const icon = s.status === 'completed' ? '✅' : s.status === 'active' ? '⏳' : '⬜';
    return `${icon}${stages[base]?.emoji || ''}`;
  }).join('');
  lines.push(`進度：${progressBar} (${completed}/${total})`);

  // 目前階段
  if (currentState.currentStage) {
    const base = currentState.currentStage.split(':')[0];
    const def = stages[base];
    lines.push(`目前階段：${def?.emoji || ''} ${def?.label || currentState.currentStage}`);
  }

  // fail/reject 計數
  if (currentState.failCount > 0) {
    lines.push(`失敗次數：${currentState.failCount}/3`);
  }
  if (currentState.rejectCount > 0) {
    lines.push(`拒絕次數：${currentState.rejectCount}/3`);
  }

  // 活躍 agents
  const activeAgents = Object.entries(currentState.activeAgents || {});
  if (activeAgents.length > 0) {
    const agentList = activeAgents.map(([name, info]) => `${name}（${info.stage}）`).join(', ');
    lines.push(`活躍 Agents：${agentList}`);
  }

  // featureName
  if (currentState.featureName) {
    lines.push(`Feature：${currentState.featureName}`);
  }

  // 未完成任務（共用函式）
  const pendingMsg = buildPendingTasksMessage(projectRoot);
  if (pendingMsg) {
    lines.push('');
    lines.push(pendingMsg);
  }

  // 行動指引
  lines.push('');
  lines.push('⛔ 禁止詢問使用者「我該繼續嗎？」，直接依照目前階段繼續執行。');
  lines.push('如需查看工作流指引，請使用 /auto。');

  // 截斷保護
  let message = lines.join('\n');
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH - 50) + '\n... (已截斷，完整狀態請查看 workflow.json)';
  }

  process.stdout.write(JSON.stringify({
    systemMessage: message,
    result: '',
  }));
  process.exit(0);
}, { result: '' });
```

## hooks.json 配置

```json
{
  "event": "PreCompact",
  "type": "command",
  "command": "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/pre-compact.js"
}
```

插入位置：在 SessionStart 之後（第 2 個位置），因為 PreCompact 是 session 級事件。

## 實作注意事項

### 給 developer 的提醒

1. **safeRun + safeReadStdin**：遵循 v0.17.7 建立的 hook 統一錯誤處理模式，所有路徑都必須通過 safeRun 保護
2. **buildPendingTasksMessage 提取**：從 on-start.js 的第 103-133 行提取，需確保 on-start.js 改用新函式後行為完全一致（回歸測試）
3. **systemMessage 欄位**：Claude Code hook 的 stdout JSON 支援 `systemMessage` 欄位（on-start.js 已使用），PreCompact 同樣可用
4. **不阻擋 compaction**：PreCompact hook 必須快速完成（同步 I/O），不做任何需要等待的操作。任何失敗都 fallback 到 `{ result: '' }` + exit 0
5. **progressBar 格式**：與 on-stop.js（Stop hook）的進度條格式保持一致（emoji icon + stage emoji）
6. **registry.js timelineEvents 註解更新**：事件計數從 21 → 22 種，session 類從 2 → 3 個
7. **spec 文件更新**：`docs/spec/overtone-架構.md` 的 Hook 清單需新增 PreCompact，行數和總計需更新
