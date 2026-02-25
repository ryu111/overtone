# Overtone 優化方案

> 基於 [audit-report.md](./audit-report.md) 的 32 個問題，規劃 5 個階段的優化路徑。
> 日期：2026-02-25 | 基於版號 0.10.0

## 優化原則

- **治本不治標**：找根因，不用 workaround 繞過
- **最小變動**：每個修復只改需要改的，不順便重構
- **先安全後品質**：CRITICAL/HIGH 必修，MEDIUM 建議修，LOW 可延後

---

## Phase 0：文檔同步（立即）

**目標**：消除文檔與實際狀態的偏差，避免誤導

| 任務 | 對應問題 | 預估工作量 |
|------|:--------:|:----------:|
| 更新 CLAUDE.md 目錄結構，反映 `plugins/overtone/` 架構 | D-H1 | 小 |
| 更新 CLAUDE.md：補充 27 個 skill、版號 0.10.0、6 個測試 | D-L3 | 小 |
| 修正 Hook 行數：~570 → ~930（CLAUDE.md + HANDOFF.md） | D-M1 | 小 |
| 重構 HANDOFF.md：將「待實作」區塊標記為「設計規格記錄」 | D-H2 | 小 |
| 更新 HANDOFF.md skill 數量 18 → 27、程式碼量預估 | D-M2, D-M3 | 小 |
| 移除 `templates/` 引用、修正 `openspec/` 位置描述 | D-H1 | 小 |
| 清理 8 個空目錄 | D-M4 | 小 |
| 清理 `.claude/agent-memory/vibe-developer/` | D-L4 | 小 |

**驗收標準**：CLAUDE.md 所有數字/路徑與 `find` 結果一致

---

## Phase 1：安全紅線修復（HIGH）

**目標**：消除 4 個 HIGH 級程式碼問題

### 1.1 State 讀寫 Race Condition（H-1 + H-2）

**根因**：`readState → modify → writeState` 無鎖，並行 hook 可能互相覆蓋。

**方案 A — Compare-and-Swap（推薦）**：
```javascript
// state.js
function updateStateAtomic(modifier) {
  const MAX_RETRIES = 3;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const state = readState(sessionId);
    const mtime = fs.statSync(statePath).mtimeMs;
    const newState = modifier(state);
    // 寫入前再檢查 mtime
    if (fs.statSync(statePath).mtimeMs !== mtime) continue; // retry
    writeState(sessionId, newState);
    return newState;
  }
  // fallback: 最後一次強制寫入
  const state = readState(sessionId);
  const newState = modifier(state);
  writeState(sessionId, newState);
  return newState;
}
```

**方案 B — File Lock**：
引入 `proper-lockfile`（破壞零依賴原則），用 lock 包裹所有 state 操作。

**建議**：方案 A（CAS），維持零依賴。

**影響範圍**：
- `scripts/lib/state.js`：新增 `updateStateAtomic()`
- `hooks/scripts/agent/on-stop.js`：將三次讀寫合併為一次 `updateStateAtomic()`

### 1.2 SSE CORS 動態化（H-3）

```javascript
// server.js
function getCorsOrigin(req) {
  const origin = req.headers.get?.('origin') || req.headers?.origin;
  const allowed = process.env.OT_CORS_ORIGIN || `http://localhost:${PORT}`;
  // 同源或允許的 origin
  if (!origin || origin === allowed) return allowed;
  // 允許 192.168.x.x 區網
  if (/^https?:\/\/(localhost|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return allowed;
}
```

### 1.3 db-review Workflow 修復（H-4 + M-6）

```javascript
// registry.js — workflows 新增
'diagnose': { label: '診斷', stages: ['DEBUG'] },
'clean': { label: '重構清理', stages: ['REFACTOR'] },
'db-review': { label: 'DB審查', stages: ['DB-REVIEW'] },
```

`skills/db-review/SKILL.md` 中改為 `node init-workflow.js db-review ${CLAUDE_SESSION_ID}`。

**驗收標準**：
- 並行 SubagentStop 不丟失 state 修改（壓力測試）
- 區網 IP 存取 Dashboard SSE 正常
- `/ot:db-review` 正確啟動 database-reviewer agent

---

## Phase 2：正確性修復（MEDIUM）

**目標**：消除 10 個 MEDIUM 級程式碼問題

### 2.1 atomicWrite 三因子（M-2）

```javascript
// utils.js
let _atomicCounter = 0;
function atomicWrite(filePath, data) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${_atomicCounter++}.tmp`;
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}
```

### 2.2 timeline.js query 副作用分離（M-1）

- 提取 `trimIfNeeded()` 為獨立函式
- `emit()` 中每 100 次寫入檢查一次
- `query()` 保持純讀取

### 2.3 createAllSSEStream cancel 修復（M-5）

```javascript
// dashboard-adapter.js
start(controller) {
  const wrapper = new SSEWrapper(controller);
  controller._sseWrapper = wrapper;  // 存到 controller 上
  self.allConnections.add(wrapper);
},
cancel(controller) {
  if (controller._sseWrapper) {
    self.allConnections.delete(controller._sseWrapper);
  }
}
```

### 2.4 event-bus.js 防抖（M-4）

```javascript
// event-bus.js — watcher 加防抖
let debounceTimer = null;
watcher = fs.watch(filePath, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { /* process */ }, 50);
});
```

### 2.5 其他 MEDIUM 修復

| 問題 | 修復方式 |
|------|---------|
| M-3 parseResult false positive | 擴充排除清單：`error-free`、`failure mode`、`test.*fail` |
| M-7 on-submit.js 欄位名 | 驗證 ECC 文檔後確認或修正 |
| M-8 post-use.js sessionId | 統一為 `process.env.CLAUDE_SESSION_ID \|\| input.session_id` |
| M-9 instinct.js race | 改為 append-only update 紀錄 |
| M-10 Telegram chat_id 白名單 | 有 `TELEGRAM_CHAT_ID` 時拒絕其他 chat 的控制命令 |

**驗收標準**：6 個既有測試全部通過 + 新增測試覆蓋修復點

---

## Phase 3：品質提升（LOW）

**目標**：逐步處理 8 個 LOW 級問題

| 問題 | 修復方式 | 優先序 |
|------|---------|:------:|
| L-1 pid.js atomicWrite | 替換 `writeFileSync` | 1 |
| L-2 setTimeout 瀏覽器開啟 | spawn + detached + unref | 2 |
| L-3 Dashboard spawn catch | 加 console.error 記錄 | 3 |
| L-4 空 catch 塊 | 開發模式 debug flag | 4 |
| L-5 test 別名誤匹配 | 已知取捨，暫不處理 | — |
| L-6 permissions 空陣列 | 待 ECC 規範明確後處理 | — |
| L-7 Alpine.js 離線 | bundle 到 web/ 目錄 | 5 |
| L-8 lock file | 當前零依賴，無需處理 | — |

---

## Phase 4：文檔補齊

| 任務 | 優先序 |
|------|:------:|
| 建立 README.md（快速入門 + 開發指南） | 1 |
| 建立 CHANGELOG.md（從 git log 回溯版本歷史） | 2 |
| Dashboard 使用說明 | 3 |
| Remote/Telegram 設定指南 | 4 |

---

## 執行順序與依賴

```
Phase 0（文檔同步）──→ Phase 1（安全紅線）──→ Phase 2（正確性）
                                                    │
                                                    ├──→ Phase 3（品質）
                                                    │
                                                    └──→ Phase 4（文檔補齊）
```

- Phase 0 可獨立執行，不涉及程式碼
- Phase 1 是 Phase 2 的前置（state 鎖機制是基礎）
- Phase 3 和 Phase 4 可並行，與 Phase 2 完成後獨立

---

## 風險評估

| 風險 | 影響 | 緩解策略 |
|------|------|---------|
| CAS 模式在高並行下仍可能衝突 | state 修改丟失 | MAX_RETRIES=3 + 最終 fallback 強制寫入 |
| CORS 動態化可能引入新安全問題 | 跨域攻擊 | 只允許 localhost 和 192.168.x.x |
| query() 副作用分離可能影響既有行為 | timeline 檔案不斷增長 | emit() 中定期觸發 trim |
| 零依賴原則限制方案選擇 | 可能需要自行實作 lock | CAS 方案避開此限制 |
