# Design: retro-docs-parallel

## 技術摘要（What & Why）

**方案**：在 `parallelGroupDefs` 新增 `postdev` 群組（`['RETRO', 'DOCS']`），讓 RETRO 和 DOCS 在含此群組的 workflow 中並行執行。RETRO 若回報 `issues`，在群組收斂後由 stop-message-builder 附加提示（不自動觸發修復）。

**理由**：
- RETRO（品質回顧）和 DOCS（文件更新）在邏輯上獨立——兩者都不需要對方的輸出，可以安全並行
- 現有並行機制（`quality`/`verify`/`secure-quality`）已驗證 `checkParallelConvergence` 可以處理此模式
- RETRO `issues` 結果不阻擋 DOCS 完成，收斂後再決策，保持一致的「全部完成才繼續」語意

**取捨**：
- RETRO issues 的提示在群組收斂時才出現（非即時），接受此延遲換取簡潔設計
- 不修改 `issues` verdict 語意——`issues` 依然算「已完成」，只是附加提示讓 Main Agent 決策
- `postdev` 群組只在 `quick`/`standard`/`full`/`secure`/`product`/`product-full` 中啟用（有 RETRO + DOCS 的 workflow）

## 解答 Open Questions

**Q1: RETRO issues 收斂時序**
RETRO 先完成時，`issues` verdict 寫入 stage state（status: completed, result: 'issues'）。但 issues 提示不在此時輸出，而是延遲到 `checkParallelConvergence` 偵測到 `postdev` 群組全部完成時，由後完成的 agent（無論是 RETRO 還是 DOCS）的 stop-message-builder 統一輸出。這與 `checkSameStageConvergence` 無關——postdev 是跨不同 stage 的群組（RETRO 和 DOCS 各是獨立 stage），走 `checkParallelConvergence` 路徑。

**Q2: issues verdict 的收斂語意**
`issues` 算作已完成（完成度等同 `pass`）。在 `updateStateAtomic` 的 stage 狀態更新邏輯中，`issues` 觸發與 `pass` 相同的收斂判斷（status: completed）。`checkParallelConvergence` 檢查 `status === 'completed'` 即可，不需要區分 result 值。群組收斂後的提示由 stop-message-builder 讀取 state 中已記錄的 RETRO result 得知是否為 `issues`。

**Q3: DOCS 完成後的提示格式**
RETRO issues 提示**附加在群組收斂訊息之後**。在 PASS branch 的並行群組收斂偵測後，若 `postdev` 群組收斂且 RETRO result 為 `issues`，插入：
```
🔁 RETRO 回顧發現改善建議（retroCount: N/3）
💡 可選：觸發 /auto 新一輪優化，或標記工作流完成
```
由 stop-message-builder 負責讀取 state 中的 RETRO result 並插入。

**Q4: `pendingRetroIssues` 欄位位置**
不引入新欄位。RETRO result 已作為 `state.stages['RETRO'].result = 'issues'` 持久化在 workflow.json，收斂後直接讀取即可。無需 `pendingRetroIssues` 額外欄位——保持 state 最小化原則。

## API 介面設計

### registry.js — 新增 `postdev` parallelGroupDef

```javascript
// parallelGroupDefs 新增一個 key
const parallelGroupDefs = {
  'quality':        ['REVIEW', 'TEST'],
  'verify':         ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
  'postdev':        ['RETRO', 'DOCS'],   // 新增
};

// workflows 中含 RETRO + DOCS 的 workflow 加入 'postdev'
// 受影響：quick, standard, full, secure, product, product-full
'quick':    { ..., parallelGroups: ['postdev'] },
'standard': { ..., parallelGroups: ['quality', 'postdev'] },
'full':     { ..., parallelGroups: ['quality', 'verify', 'postdev'] },
'secure':   { ..., parallelGroups: ['secure-quality', 'postdev'] },
'product':  { ..., parallelGroups: ['quality', 'postdev'] },
'product-full': { ..., parallelGroups: ['quality', 'verify', 'postdev'] },
```

### agent-stop-handler.js — issues verdict 收斂處理

```javascript
// updateStateAtomic callback 中的 verdict 判斷（修改部分）
// 現有 issues 路徑只做 retroCount++，不標記 completed。
// 修改後：issues 也標記 completed（與 pass 相同），讓 checkParallelConvergence 可以收斂。

if (result.verdict === 'issues') {
  // 與 pass 路徑合流：stage 標記 completed，parallelConvergence 可偵測到
  Object.assign(entry, {
    status: 'completed',
    result: 'issues',
    completedAt: new Date().toISOString()
  });
  const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
  if (nextPending) s.currentStage = nextPending;
  isConvergedOrFailed = true;
  finalResult = 'issues';
}
```

**注意**：現有 `issues` 路徑在 buildStopMessages 中已有 retroCount 處理，此變更只影響 stage 狀態更新邏輯（移到 updateStateAtomic 內）。retroCount 遞增改由 stateUpdates 在外部執行（維持現有 builder 模式）。

### stop-message-builder.js — 群組收斂後 RETRO issues 提示

```javascript
// buildStopMessages 的 PASS branch，收斂偵測後新增

// 現有介面新增參數：
// @param {object}      ctx.state        - 已含 stages[RETRO].result 等欄位

// 在 convergence 判斷後附加
if (convergence && convergence.group === 'postdev') {
  // 讀取 RETRO result（從 state.stages 尋找 RETRO 的已完成 stage）
  const retroStageKey = Object.keys(state.stages).find(
    (k) => k === 'RETRO' || k.startsWith('RETRO:')
  );
  const retroResult = retroStageKey ? state.stages[retroStageKey]?.result : null;

  if (retroResult === 'issues') {
    const newRetroCount = state.retroCount || 0;
    messages.push(`🔁 RETRO 回顧發現改善建議（retroCount: ${newRetroCount}/3）`);
    if (newRetroCount >= 3) {
      messages.push('⛔ 已達迭代上限（3 次），工作流完成');
    } else {
      messages.push('💡 可選：觸發 /auto 新一輪優化，或標記工作流完成');
    }
  }
}
```

**注意**：`buildStopMessages` 的參數介面 `ctx.state` 已存在（現有程式碼中為 `state`），不需要新增參數。

### 命令文件更新（無新介面，只更新描述文字）

受影響的命令 stage 說明：
- `quick.md`：RETRO 和 DOCS 改為並行描述
- `standard.md`：同上
- `full.md`：同上
- `secure.md`：同上

### parallel-groups.md skill 文件更新

```markdown
// 新增 postdev 群組說明
| `postdev` | RETRO + DOCS | quick, standard, full, secure, product, product-full |
```

## 資料模型

### workflow.json state — 無新欄位

RETRO issues 的資訊完全透過現有 `stages[RETRO].result` 欄位傳遞：

```javascript
// workflow.json（既有格式，無變更）
{
  "stages": {
    "RETRO": {
      "status": "completed",
      "result": "issues",       // 已存在，此方案直接讀取此值
      "completedAt": "..."
    },
    "DOCS": {
      "status": "completed",
      "result": "pass",
      "completedAt": "..."
    }
  },
  "retroCount": 1,              // 已存在，收斂後讀取
  "currentStage": null          // 兩者都完成後推進
}
```

**無新欄位**：不引入 `pendingRetroIssues`，保持 state 最小化。

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/registry.js
    ← 修改：parallelGroupDefs 新增 'postdev' key
    ← 修改：6 個 workflow 的 parallelGroups 陣列加入 'postdev'

  plugins/overtone/scripts/lib/agent-stop-handler.js
    ← 修改：updateStateAtomic callback 的 verdict 判斷——issues 改為標記 completed

  plugins/overtone/scripts/lib/stop-message-builder.js
    ← 修改：PASS branch 的 convergence 判斷——postdev 收斂時附加 RETRO issues 提示

  plugins/overtone/plugins/overtone/commands/quick.md
    ← 修改：RETRO 和 DOCS stages 說明改為並行委派

  plugins/overtone/plugins/overtone/commands/standard.md
    ← 修改：同上

  plugins/overtone/plugins/overtone/commands/full.md
    ← 修改：同上

  plugins/overtone/plugins/overtone/commands/secure.md
    ← 修改：同上

  plugins/overtone/skills/workflow-core/references/parallel-groups.md
    ← 修改：新增 postdev 群組說明

  plugins/overtone/skills/workflow-core/references/auto/SKILL.md（若含工作流說明）
    ← 修改：視內容決定是否更新

新增的檔案：
  tests/unit/registry-postdev.test.js
    ← 新增：postdev 群組定義單元測試

  tests/unit/agent-stop-postdev.test.js
    ← 新增：issues verdict 收斂邏輯單元測試

  tests/unit/stop-message-postdev.test.js
    ← 新增：postdev 收斂後 RETRO issues 提示單元測試
```

## 關鍵技術決策

### 決策 1：issues 是否標記 stage completed

- **選項 A（選擇）**：issues 和 pass 一樣標記 `status: completed`，讓 `checkParallelConvergence` 正常運作 — 優點：重用現有收斂機制，無需新增特殊路徑；result 欄位已足夠保存 issues 語意
- **選項 B（未選）**：issues 保持 active 或引入新 status 值 — 原因：`checkParallelConvergence` 只看 status === 'completed'，引入新值需大幅修改；且 RETRO issues 不代表失敗，應允許 workflow 繼續推進

### 決策 2：retroCount 遞增時機

- **選項 A（選擇）**：在 `buildStopMessages` 的 issues branch 保留 retroCount 遞增（stateUpdates 副作用）。issues 被 postdev 群組收斂前先個別處理（RETRO stop 時），保持現有 issues 邏輯不變 — 優點：現有測試不破壞，issues 單獨 stop 時仍能遞增 retroCount
- **選項 B（未選）**：延遲到 postdev 群組收斂後才遞增 retroCount — 原因：會使現有 issues 路徑語意改變，測試需大改；且 RETRO 結果是確定的，提前遞增無害

### 決策 3：RETRO issues 提示插入位置

- **選項 A（選擇）**：附加在 postdev 收斂訊息之後，由後完成的 agent（RETRO 或 DOCS）的 stop 事件輸出 — 優點：集中在一個時機點輸出，邏輯清晰；兩者完成後 Main Agent 才需要決策
- **選項 B（未選）**：RETRO stop 時即輸出，等 DOCS 完成後不再輸出 — 原因：RETRO 先完成時 DOCS 可能仍在跑，過早提示會干擾 Main Agent；且若 DOCS 先完成、RETRO 後完成，提示位置不一致

### 決策 4：`issues` 觸發 stage:complete timeline event 的時機

- **選項 A（選擇）**：`isConvergedOrFailed = true` 且 finalResult = 'issues' → stage:complete 在 RETRO stop 時 emit（與 pass 相同時機）— 優點：timeline 完整記錄每個 stage 完成事件
- **選項 B（未選）**：等 postdev 群組收斂後才 emit stage:complete — 原因：stage:complete 語意是「stage 本身完成」，不應等群組；parallel:converge 是群組語意

## 實作注意事項

給 developer 的提醒：

1. **issues verdict 在 updateStateAtomic 中的現有位置**：現有程式碼中，issues 沒有進入 updateStateAtomic 的 if/else 分支（只在 buildStopMessages 處理），需要在 `agent-stop-handler.js` 的 updateStateAtomic callback 中補充 issues 的 stage 完成邏輯

2. **finalResult 傳遞**：agent-stop-handler.js 的 `isConvergedOrFailed` 和 `finalResult` 變數在 updateStateAtomic callback 外部使用，issues 路徑需同樣設定這兩個變數

3. **stop-message-builder.js 的 issues branch 保留**：RETRO 單獨執行時（非 postdev 群組場景）仍需 issues 提示；修改後，issues branch 只在「非 postdev 收斂路徑」時輸出（即 RETRO 單獨在非並行 workflow 中執行）。實際上，所有含 RETRO 的 workflow 都有 postdev，因此 issues branch 在現有 workflow 中將由 postdev 路徑覆蓋，但保留 issues branch 以防未來 edge case

4. **`enforceInvariants` 規則 4**：postdev 群組中先完成的 stage（如 RETRO 先完成），`currentStage` 會推進到下一個 pending stage（DOCS），而非跳過。developer 需確認 issues 路徑的 currentStage 推進邏輯與 pass 路徑一致

5. **並行群組的 workflow 初始化**：`init-workflow.js` 使用 `parallelGroups` export（從 `parallelGroupDefs` 動態推導），新增 `postdev` 到 workflows 後，`parallelGroups` export 會自動包含 `postdev`，不需修改 init-workflow.js

6. **command 文件路徑**：commands 文件位於 `plugins/overtone/commands/`，受 pre-edit guard 保護，更新需使用 `manage-component.js update command`
