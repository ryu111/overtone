# Design: concurrency-guard-g2

## 技術方案概述

G2 修復分兩個正交部分：

1. **主動清理**（session-stop-handler.js）：Stop hook 每次執行時，在進入退出條件判斷前掃描 `currentState.activeAgents`，清除 `startedAt` 超過 TTL 的 orphan entry，emit `agent:orphan-cleanup` timeline 事件，確保 `getNextStageHint()` 不再卡在「等待並行 agent 完成」。

2. **健康偵測**（health-check.js）：新增第 20 項 `checkConcurrencyGuards`，靜態驗證 filesystem-concurrency.md 的 G1/G2/G3 文件齊全（作為已知風險登記），並在 runtime 掃描 active session 的 orphan（供開發者診斷）。

---

## Open Questions 決策

### Q1：TTL 常數放置位置

**決策：handler 頂部常數 + health-check 自己的對應常數**

- `session-stop-handler.js` 頂部定義 `const ORPHAN_TTL_MS = 15 * 60 * 1000;`
- `health-check.js` 的 `checkConcurrencyGuards` 函式內定義相同的 `const ORPHAN_TTL_MS = 15 * 60 * 1000;`

**理由**：
- health-check.js 是獨立腳本，不 require session-stop-handler.js（會引入不必要耦合）
- loopDefaults 目前只放「loop 執行控制」相關常數（maxIterations、maxConsecutiveErrors），TTL 屬於並發守衛域，語意不符
- 兩處共 2 行的重複，遠比跨模組耦合的維護成本低
- 未來若需要讓 TTL 可配置，只需一次 refactor 提取到 registry.js 的 `concurrencyConfig` 物件

### Q2：health-check runtime 掃描路徑

**決策：require paths.js 取 SESSIONS_DIR**

- `checkOsTools` 已有先例（L890 `require('./lib/paths')`），health-check.js require paths.js 不是新慣例
- `SESSIONS_DIR` 已是 paths.js 的 export，直接用，不重複定義魔術路徑字串

### Q3：checkConcurrencyGuards 測試策略

**決策：接受 `sessionsDirOverride` 參數**

- 與 `checkCompletionGap(skillsDirOverride)`、`checkDependencySync(pluginRootOverride)` 等 11 個既有 check 模式一致
- 測試傳入 `tmpDir`，不依賴 `~/.overtone/sessions/` 的真實狀態，測試穩定可重複

---

## API 介面設計

### detectAndCleanOrphans()

```typescript
// session-stop-handler.js 內部函式（不 export）
function detectAndCleanOrphans(
  sessionId: string,
  currentState: WorkflowState,  // 由 handleSessionStop 傳入，不重複讀取
  ttlMs: number                 // = ORPHAN_TTL_MS
): { cleaned: CleanedEntry[] }

type CleanedEntry = {
  instanceId: string;   // activeAgents 的 key
  agentName: string;    // activeAgents[key].agentName
  startedAt: string;    // activeAgents[key].startedAt（ISO 字串）
  ageMs: number;        // Date.now() - new Date(startedAt)
}
```

**實作要點**：
- 掃描 `currentState.activeAgents`，找出 `Date.now() - new Date(entry.startedAt) > ttlMs` 的 entry
- 防禦性處理：若 `entry.startedAt` 缺失或解析失敗，**跳過**（不清除，避免誤殺合法 agent）
- 清除動作用 `updateStateAtomic`（CAS）確保並發安全
- 清除後 emit `agent:orphan-cleanup` 事件（每個 orphan 一次）
- 回傳 `cleaned` 陣列，供 handleSessionStop 決定是否 emit timeline 事件

**呼叫位置**：`handleSessionStop` 中，讀完 `currentState` 後、進入退出條件判斷前（loop 繼續前）

```
handleSessionStop():
  1. readState(sessionId)  → currentState
  2. readLoop(sessionId)   → loopState
  3. detectAndCleanOrphans(sessionId, currentState, ORPHAN_TTL_MS)  ← 新增位置
  4. 計算 allStagesCompleted / allCompleted
  5. ... 退出條件判斷 ...
```

### checkConcurrencyGuards()

```typescript
// health-check.js 內部函式
function checkConcurrencyGuards(
  sessionsDirOverride?: string,  // 供測試覆蓋（預設 SESSIONS_DIR from paths.js）
  fsConMdOverride?: string        // 供測試覆蓋 filesystem-concurrency.md 路徑
): Finding[]
```

**偵測項目**：

| 項目 | 類型 | Severity | 說明 |
|------|------|----------|------|
| G1 記錄存在 | 靜態 | info | filesystem-concurrency.md 含 "G1" 或 "execution-queue" 段落 |
| G2 記錄存在 | 靜態 | info | filesystem-concurrency.md 含 "G2" 記錄 |
| G3 記錄存在 | 靜態 | info | filesystem-concurrency.md 含 "G3" 或 "JSONL trim" 段落 |
| active orphan | runtime | warning | active session 的 activeAgents 有 startedAt > 15 分鐘的 entry |

**靜態掃描策略**：
- 讀取 `filesystem-concurrency.md`（路徑從 PLUGIN_ROOT 推導）
- 僅做字串存在性檢查（`content.includes('G1')`），不做 markdown 結構解析
- G1/G2/G3 全存在 → 0 findings（健康）；缺少任一 → info finding

**runtime 掃描策略**：
- 列舉 `SESSIONS_DIR` 下的子目錄（每個子目錄為一個 session）
- 讀取 `workflow.json`，取 `activeAgents` 欄位
- 找出 `startedAt` 超過 15 分鐘的 entry → warning finding
- 若 SESSIONS_DIR 不存在（全新安裝），跳過（返回 0 findings）

---

## 資料模型

### agent:orphan-cleanup timeline event

```typescript
// registry.js 新增
'agent:orphan-cleanup': {
  label: 'Agent Orphan 清理',
  category: 'agent',
  consumeMode: 'broadcast'
}

// timeline emit 資料欄位
{
  ts: string;           // ISO 時間戳（timeline.emit 自動加）
  type: 'agent:orphan-cleanup';
  instanceId: string;   // orphan 的 instanceId（activeAgents key）
  agentName: string;    // orphan 的 agentName
  ageMs: number;        // 存活時間（ms）
  ttlMs: number;        // 使用的 TTL 設定值（for debuggability）
}
```

### activeAgents entry 格式（現有，已確認）

```typescript
// pre-task-handler.js L291-295 已有此格式
activeAgents[instanceId] = {
  agentName: string;    // 如 "developer"
  stage: string;        // 如 "DEV"
  startedAt: string;    // ISO 時間戳，detectAndCleanOrphans 依賴此欄位
}
```

---

## 檔案結構

### 修改的檔案

| 檔案 | 修改類型 | 說明 |
|------|----------|------|
| `plugins/overtone/scripts/lib/registry.js` | 新增 | timelineEvents 中加入 `agent:orphan-cleanup` |
| `plugins/overtone/scripts/lib/session-stop-handler.js` | 新增函式 + 呼叫 | 頂部加 `ORPHAN_TTL_MS` 常數；新增 `detectAndCleanOrphans()`；在 handleSessionStop 中呼叫 |
| `plugins/overtone/scripts/health-check.js` | 新增 check 函式 | 新增 `checkConcurrencyGuards()`；checkDefs 陣列新增第 20 項；更新 module.exports |
| `plugins/overtone/skills/workflow-core/references/filesystem-concurrency.md` | 更新內容 | 第 8 節更新 G2（已修復），新增 G1/G3 已知風險描述 |
| `CLAUDE.md` | 更新數字 | `health-check.js` 說明從 19 項改 20 項，加入 `checkConcurrencyGuards` |

### 新增的測試檔案

| 檔案 | 說明 |
|------|------|
| `tests/unit/session-stop-handler.test.js` | 新增（或擴充）— `detectAndCleanOrphans` 邊界測試 |
| `tests/unit/health-check-expand.test.js` | 擴充 — `checkConcurrencyGuards` 靜態 + runtime 路徑測試 |

---

## 狀態同步策略

此功能無跨頁面/跨元件狀態同步需求。唯一的狀態寫入是 `updateStateAtomic`（CAS），已是現有機制，不引入新的同步策略。

Timeline emit 是 JSONL append（fire-and-forget），與現有 pattern 完全一致。
