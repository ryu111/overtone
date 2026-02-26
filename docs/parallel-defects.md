# 並行機制缺陷分析
> 分析日期：2026-02-26 | 分析者：Main Agent + 用戶討論

---

## 背景

Overtone 的 Hook 架構中，並行群組（quality / verify / secure-quality）由 ECC 原生並行觸發：Main Agent 在同一訊息中發出多個 Task，各 Task 完成後各自觸發 `SubagentStop` hook。由於多個 hook 進程同時運行，存在以下四個設計缺陷。

---

## 缺陷清單

| # | 缺陷 | 嚴重度 | 觸發條件 |
|---|------|:------:|----------|
| D1 | updateStateAtomic TOCTOU 競爭條件 | 🔴 中高 | 並行群組兩個 hook 幾乎同時完成 |
| D2 | 第一完成者 hint 過時 | 🟡 低 | 並行群組中較早完成的 agent |
| D3 | 雙重失敗協調語義不清 | 🟡 中 | REVIEW REJECT + TEST FAIL 同時發生 |
| D4 | 並行群組硬編碼 | 🔵 架構限制 | 需要自訂並行組合時 |

---

## D1 — updateStateAtomic TOCTOU 競爭條件

### 根因

`state.js` 的 `updateStateAtomic`（第 151–180 行）用 mtime 做 Compare-and-Swap：

```javascript
const mtime = statSync(filePath).mtimeMs;   // ① 讀取 mtime
const newState = modifier(current);          // ② 計算新狀態
const currentMtime = statSync(filePath).mtimeMs;  // ③ 再次讀取
if (currentMtime !== mtime) continue;        // ④ CAS 檢查
writeState(sessionId, newState);             // ⑤ 寫入
```

**TOCTOU 空窗**：步驟 ④ 和 ⑤ 之間，另一個 hook 進程可能在同一毫秒內完成寫入。若文件系統的 mtime 精度為 1 秒（HFS+ / FAT），④ 可能誤判「無衝突」並覆蓋掉對方的寫入。

### 實際影響

- `writeState` 用 `atomicWrite`（tmp → rename），rename 本身是 POSIX 原子操作
- 真正的丟失場景：進程 A 在 ④ 通過後、⑤ 執行前，進程 B 完成 rename → A 的 rename 覆蓋 B 的結果
- **現有緩解**：3 次 retry + fallback 強制寫入，覆蓋 mtime 精度 1 秒內的大部分情況
- **殘餘風險**：在 retry 耗盡後 fallback 強制寫入，可能丟失前一個 hook 的部分狀態更新（如 activeAgents 未正確清除）

### 修復方向

選項 A（文件鎖）：使用 `lockfile` 或 `proper-lockfile` 套件，在讀寫全程持有鎖。
選項 B（事件序列化）：在 `on-stop.js` 加入 exponential backoff retry，把 TOCTOU 窗口縮小到可忽略。
選項 C（接受現狀）：現有 retry 機制在正常使用場景（非極端高頻）已足夠，風險可接受。

---

## D2 — 第一完成者 hint 過時

### 根因

並行群組（例如 REVIEW + TEST）中，第一個完成的 agent 觸發 hook 時，`currentState.currentStage` 已是更新後的狀態。此時 `getNextStageHint()` 可能會輸出「下一步：委派 RETRO」，但 TEST 尚未完成——Main Agent 若照著 hint 行動會跳過等待。

```javascript
// on-stop.js 第 181 行
const nextHint = getNextStageHint(updatedState);
// updatedState 是剛完成的單一 agent 更新後的結果
// 若此時 TEST 仍 active，currentStage 可能已推進到 RETRO
```

### 實際影響

- **輕微**：Main Agent 一般會等全部 SubagentStop hook 完成後才讀取提示
- **理論風險**：在超長 agent 執行場景中，Main Agent 可能提前行動

### 修復方向

在 `getNextStageHint()` 輸出前檢查 `activeAgents` 是否為空：

```javascript
if (Object.keys(currentState.activeAgents).length > 0) {
  return `等待並行 agent 完成：${Object.keys(currentState.activeAgents).join(', ')}`;
}
```

---

## D3 — 雙重失敗協調語義不清

### 根因

REVIEW REJECT + TEST FAIL 同時發生時，兩個 SubagentStop hook 各自輸出失敗訊息：

```
[REVIEW hook]  🔙 審查拒絕（1/3）
               ⏭️ 下一步：委派 DEVELOPER 修復 → REVIEWER 再審

[TEST hook]    ❌ 測試失敗（1/3）
               ⏭️ 下一步：委派 DEBUGGER → DEVELOPER → TESTER
```

Main Agent 同時收到兩個衝突的「下一步」指示，需要自行判斷如何整合。目前沒有明確的優先規則，行為依賴 Main Agent 的推理能力。

### 實際影響

- **中等**：可能導致 Main Agent 只處理其中一個失敗（如只修 REVIEW reject，忽略 TEST fail）
- **理論最差情況**：進入無限 debug 迴圈（REVIEW 修了但 TEST 沒修，反覆 REJECT）

### 修復方向

在 registry 中定義失敗優先順序規則，hook 收斂後輸出統一的協調提示：

```
優先順序：TEST FAIL > REVIEW REJECT
（測試失敗表示代碼根本有問題，審查拒絕只是品質問題）

協調提示：同時發生時，先修 TEST FAIL，REVIEW 一起帶上重做
```

---

## D4 — 並行群組硬編碼

### 根因

`registry.js` 的 `parallelGroups` 為靜態定義，所有 workflow 共用同一套群組規則：

```javascript
const parallelGroups = {
  'quality':        ['REVIEW', 'TEST'],
  'verify':         ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
};
```

無法在 workflow 層面自訂並行群組，例如新增一個「只做 REVIEW + SECURITY 的群組」，或讓特定 workflow 完全序列執行。

### 實際影響

- **低**：現有三個群組覆蓋了所有已定義 workflow 的需求
- **限制**：未來新增 workflow 時若需要不同並行組合，需修改 registry

### 修復方向

將 `parallelGroups` 移到 workflow 定義中，讓每個 workflow 自行聲明並行群組：

```javascript
const workflows = {
  'standard': {
    stages: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'],
    parallelGroups: [['REVIEW', 'TEST']],  // workflow 自己定義
  },
  ...
};
```

---

## 修復優先順序建議

| 優先 | 缺陷 | 理由 |
|:----:|------|------|
| 1 | D3（雙重失敗協調） | 直接影響正確性，且修復成本低（加規則文件 + prompt） |
| 2 | D2（hint 過時） | 加一行 activeAgents 檢查即可修復 |
| 3 | D1（TOCTOU） | 現有 retry 機制已緩解，完整修復需引入外部依賴 |
| 4 | D4（硬編碼群組） | 架構改進，不影響當前功能 |

---

## 關聯文件

- `scripts/lib/state.js` — updateStateAtomic 實作（第 151–180 行）
- `hooks/scripts/agent/on-stop.js` — SubagentStop hook，getNextStageHint、checkParallelConvergence
- `scripts/lib/registry.js` — parallelGroups 定義
- `skills/auto/references/parallel-groups.md` — Main Agent 並行規則
