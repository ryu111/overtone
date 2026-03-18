# Session 收尾架構重構

## 動機（Why）

- **問題**：SessionEnd 後 fork 3 個背景 daemon（maintainer.js, learner.js, judge.js），造成三個問題：
  1. **可觀測性差**：孤兒進程只有 log 檔，Dashboard 無法追蹤完整生命週期
  2. **無依賴編排**：maintainer 可能讀到上一次的 scores/behaviors（learner/judge 尚未完成寫入）
  3. **資源浪費**：3 個獨立 bun 進程各自載入 runtime
- **目標**：收尾邏輯走 hook pipeline（agent_dispatch、tool calls、SubagentStop 全部可見），依賴有序，減少進程數
- **不做的代價**：maintainer 持續基於過時資料做決策；收尾失敗無法被偵測

## 範圍

### In-scope

- L1: Stop Hook 收尾閘門（block exit 直到收尾完成）
- L2: Executor 收尾（Main Agent 委派 3 個 haiku executor 取代 daemon fork）
- L3: SessionEnd 安全網（輕量 fallback）
- 三個 daemon 腳本的核心邏輯 export 為可呼叫函式
- settings.json SessionEnd hooks 調整
- 與 Ralph Loop plugin 的 Stop hook 共存
- Sub-session（heartbeat `claude -p`）收尾一致性

### Out-of-scope

- Ralph Loop plugin 本身的修改（第三方 plugin）
- heartbeat.js 的 daemon 機制（heartbeat 不是收尾腳本，保持現狀）
- Dashboard UI 變更（已有 agent_status 事件，自動可見）
- 本地模型（vllm-mlx）的修改

## 使用者故事

1. 身為 **開發者**，我想要 session 結束前確保收尾已完成，以便不會漏掉 git commit、行為記錄、品質評分
2. 身為 **Dashboard 使用者**，我想在 Flow Visualizer 看到收尾的 agent 委派事件，以便知道收尾進度
3. 身為 **heartbeat 自駕 session**，我想要和人類 session 相同的收尾流程，以便行為分析和品質評分一致

## 行為規格

### 正常路徑（人類 session）

1. 使用者完成任務 → Main Agent 決定結束
2. Main Agent 委派收尾 executor（依 `rules/總結格式.md` 觸發）：
   - Phase 1（並行）：learner executor + judge executor（model=haiku → 本地 MLX）
   - Phase 2（串行）：maintainer executor（讀最新 scores + behaviors）
3. 所有 executor 完成 → 寫 wrapup marker（`~/.claude/data/last-wrapup.json`）
4. Session 嘗試退出 → Stop Hook 檢查 marker → 匹配當前 session → 放行
5. SessionEnd hook 觸發 → 檢查 marker 存在 → skip 重複執行

### 正常路徑（heartbeat sub-session）

1. heartbeat spawn `claude -p` session
2. 任務完成 → session 自動收尾（同上 Phase 1 + Phase 2）
3. `-p` session 無 Stop hook → 直接退出
4. SessionEnd hook 觸發 → marker 存在 → skip

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| Executor 失敗（本地模型不可用） | 寫 marker（status: partial），Stop Hook 放行，SessionEnd 安全網補執行確定性部分 |
| Stop Hook 無法讀取 marker | 放行退出（不阻擋使用者），記錄 hook-errors.jsonl |
| 使用者手動 Ctrl+C | Stop Hook 不觸發（Claude Code 行為），SessionEnd 觸發安全網 |
| Ralph Loop 啟用中 | Ralph Loop Stop Hook 先執行（block），wrapup Stop Hook 後執行（檢查 marker） |
| Marker 檔案損壞 | 視為無 marker → SessionEnd 安全網執行 |

### 邊界條件

- 空 session（無任何工具呼叫）→ learner 和 judge 快速完成（無資料可分析），maintainer 只做 git 同步
- 收尾中 session 被強制終止 → 下次 session 的 maintainer 清理殘留 marker
- 多個 session 並行退出 → marker 以 session_id 區分，互不干擾

## 資料模型

### Wrapup Marker

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| session_id | string | 是 | Claude session ID |
| timestamp | string | 是 | ISO 8601 時間戳 |
| status | string | 是 | `complete` / `partial` / `failed` |
| phases | object | 是 | 各 phase 結果 |
| phases.learner | object | 否 | `{ status, duration_ms }` |
| phases.judge | object | 否 | `{ status, duration_ms }` |
| phases.maintainer | object | 否 | `{ status, duration_ms }` |

### 儲存

- 格式：JSON
- 位置：`~/.claude/data/last-wrapup.json`
- 清理策略：每次寫入覆蓋前一次；SessionEnd 安全網清理超過 24 小時的 marker

## 介面契約

### 收尾核心函式（從 daemon 腳本 export）

```javascript
// maintainer.js — 新增 export
export async function runMaintainer(ctx) → { status: 'ok'|'error', message? }

// learner.js — 新增 export
export async function runLearner() → { status: 'ok'|'error', behaviorsCount? }

// judge.js — 新增 export
export async function runJudge() → { status: 'ok'|'error', elementsScored? }
```

### Stop Hook

- 輸入：stdin JSON（Claude Code Stop hook 格式，含 `session_id`、`transcript_path`）
- 輸出：
  - 已收尾 → `exit 0`（無 stdout，放行）
  - 未收尾 → `{ "decision": "block", "reason": "請先執行收尾..." }`

### Wrapup Marker 讀寫

```javascript
export function writeWrapupMarker(sessionId, phases) → void
export function readWrapupMarker() → marker | null
export function isWrapupComplete(sessionId) → boolean
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | Phase 1 並行 ≤ 60 秒（本地模型推論）；Phase 2 ≤ 30 秒 |
| 可觀測性 | 所有 executor 產生 agent_dispatch + agent_complete 事件（Dashboard 可見） |
| 資源 | 從 3 個獨立 bun 進程 → 0 個額外進程（executor 在 Main session 內） |
| 向後相容 | 無（舊 daemon fork 方式直接移除） |
| 可靠性 | 安全網確保即使 executor 全失敗，確定性收尾仍執行 |

## 依賴

### 上游

| 模組 | 關係 |
|------|------|
| rules/總結格式.md | 收尾觸發點（Main Agent 在總結時委派 executor） |
| Stop hook 機制 | Claude Code 內建，用於 block session exit |
| Ralph Loop plugin | 共存於 Stop hook，先執行（plugin hooks 先於 settings.json hooks） |

### 下游

| 模組 | 關係 |
|------|------|
| maintainer.js | 核心邏輯被 export 並由 executor 呼叫 |
| learner.js | 同上 |
| judge.js | 同上 |
| flow-observer.js | 已有 agent_dispatch/agent_complete 事件（無需修改） |
| daemon-utils.js | `setupSelfFork`/`setupLock` 在三個腳本中不再需要（heartbeat 仍用） |

### 外部服務

| 服務 | 用途 |
|------|------|
| 本地模型（port 8000/3456） | learner 和 judge 的語意分析（model=haiku → MLX） |
| nova-server（port 3457） | agent_status 回報、hook dispatch |

## 驗收標準

1. `bun test` 全量通過（現有 1256+ tests + 新增測試）
2. Session 結束前，Dashboard 可見 3 個 executor 的 agent_dispatch + agent_complete 事件
3. maintainer 讀到的 scores/behaviors 是本次 session 最新的（Phase 2 依賴 Phase 1）
4. Stop Hook 在 marker 不存在時 block exit 並提示收尾
5. Stop Hook 在 marker 存在且匹配 session_id 時放行
6. Stop Hook 與 Ralph Loop plugin 共存（Ralph Loop 啟用時兩者都正常運作）
7. SessionEnd 安全網在 marker 不存在時執行確定性部分
8. heartbeat sub-session 產出正確的 wrapup marker
9. `server.js` 行數 ≤ 350
10. 三個 daemon 腳本保留 `import.meta.main` 的直接執行能力（向後相容 CLI 呼叫）

## 風險

| # | 風險 | 機率 | 影響 | 緩解策略 |
|---|------|:----:|:----:|---------|
| 1 | Stop Hook 阻擋使用者退出（marker 檢查有 bug） | 中 | 高 | marker 讀取失敗 → 預設放行；加 timeout |
| 2 | Executor 在 `-p` session 中無法正常執行 | 低 | 中 | heartbeat session 已有 `--allowedTools Agent`，executor 正常運作 |
| 3 | 本地模型不可用導致 Phase 1 超時 | 中 | 低 | executor prompt 包含 fallback 指示（本地模型不可用時只做確定性部分） |
| 4 | Ralph Loop 和 wrapup Stop Hook 衝突 | 低 | 高 | 釐清執行順序（plugin hooks 先執行），wrapup hook 只在非 Ralph Loop 時 block |
| 5 | 收尾時間過長影響使用者體驗 | 中 | 中 | haiku executor 快速（< 30s 各），marker 寫入後 Stop Hook 立即放行 |
