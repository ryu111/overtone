# 心跳引擎 — 技術設計

## 深度路由：D3
**理由**：跨 3 個檔案（heartbeat + spawner + Notion 整合），涉及 daemon 生命週期 + 子進程管理 + 外部 API 整合，安全敏感（遞迴防護），需規劃-執行-審查。

---

## 技術摘要

- **方案**：Bun daemon + binary copy + notion-tasks.js 整合 + `claude -p` spawn
- **理由**：複用現有 notion-tasks.js（已測試），binary copy 命名符合常駐服務規範
- **取捨**：v1 單任務串行（一次一個 session），犧牲吞吐量換取簡單性和安全性

## 方案比較

| 維度 | A：Bun daemon（選擇） | B：launchd plist | C：cron + script |
|------|:-------------------:|:---------------:|:---------------:|
| 控制精度 | 高（start/stop/status） | 中（launchctl） | 低（無 stop） |
| 狀態管理 | JSON state file | plist 內建 | 無 |
| 子進程管理 | Bun.spawn | 需額外封裝 | 需額外封裝 |
| 可測試性 | 高（export 函式 + DI） | 低 | 低 |
| 跨平台 | 中（Bun） | 低（macOS only） | 高 |
| **結論** | 選擇：可控可測，符合既有 pattern | 過度綁定 macOS | 粒度不足 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | heartbeat.js | `~/.claude/scripts/` | ~280 | daemon 主程式（CLI + polling loop + state 管理） |
| 2 | session-spawner.js | `~/.claude/scripts/` | ~120 | `claude -p` spawn 封裝（stream-json + timeout + 安全防護） |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 無 | — | 心跳引擎是獨立模組，不修改現有檔案 |

### API 設計

```javascript
// heartbeat.js — daemon 主程式
// CLI: bun heartbeat.js start|stop|status

// 內部 API（export 供測試）
export function readState(fileOverride) {
  // 讀取 heartbeat-state.json
  // 回傳 HeartbeatState 或 null
}

export function writeState(state, fileOverride) {
  // 寫入 heartbeat-state.json
}

export async function poll(config, _deps) {
  // 1. 呼叫 notion-tasks list 待做
  // 2. 無任務 → { action: 'idle' }
  // 3. 有任務 → claim → { action: 'execute', task }
  // 4. consecutiveFailures >= 3 → { action: 'paused' }
}

export async function executeTask(task, config, _deps) {
  // 1. buildPrompt(task)
  // 2. spawnSession(prompt, { timeout })
  // 3. await outcome
  // 4. success → complete(task) → { status: 'success' }
  // 5. fail → { status: 'failed' }
}

// session-spawner.js
export function spawnSession(prompt, opts, _deps) {
  // 1. 組裝 env（OVERTONE_SPAWNED=1 + 過濾敏感 key）
  // 2. Bun.spawn(['claude', '-p', '--output-format', 'stream-json'], { stdin: prompt })
  // 3. 設定 timeout timer
  // 4. 解析 stdout stream-json
  // 5. 回傳 { child, outcome: Promise<SessionOutcome> }
}

export function buildPrompt(task) {
  // 從 Notion 任務物件組裝 prompt
  // 格式：`開始執行 {name}，深度路由：D2\n任務描述：{description}`
}
```

## 資料模型

- 儲存格式：JSON（heartbeat-state.json）
- 儲存位置：`~/.claude/data/heartbeat-state.json`
- 清理策略：stop 時重設 state

## 執行步驟

### Phase 1：Session Spawner（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | session-spawner.js | spawn 封裝 + stream-json 解析 + timeout + 安全防護 |

### Phase 2：Heartbeat Daemon（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2 | heartbeat.js | CLI + daemon lifecycle + polling loop + Notion 整合 |

### Phase 3：測試（sequential，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3 | heartbeat.test.js + session-spawner.test.js | daemon 生命週期 + spawn 安全邊界 + poll 邏輯 |

## Pre-mortem

**假設心跳引擎上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | `claude -p` 輸出格式變更導致 stream-json 解析失敗 | 中 | 高 | outcome fallback：stdout close 視為 crash，不卡住 |
| 2 | daemon 長時間 idle 後記憶體洩漏 | 低 | 中 | state 追蹤 startedAt，超過 24 小時自動重啟 |
| 3 | Notion claim 成功但 spawn 前 daemon crash → 任務卡住 | 中 | 中 | status 指令顯示 activeTask，手動 fail |
| 4 | binary copy 路徑不存在（~/.claude/bin/ 未建立） | 低 | 低 | start 時 mkdirSync |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| session-spawner.test.js | spawn 成功 + timeout + crash + 安全防護 |
| heartbeat.test.js | start/stop/status CLI |
| heartbeat.test.js | poll 邏輯（idle/execute/paused） |
| heartbeat.test.js | executeTask 成功/失敗路徑 |
| heartbeat.test.js | 連續失敗暫停機制 |
| heartbeat.test.js | stale lockfile 清理 |
| heartbeat.test.js | OVERTONE_SPAWNED 遞迴防護 |

## 不做什麼

1. **不做多任務並行**：v1 一次一個 session，避免資源競爭
2. **不做自動恢復**：暫停後需人工 restart，避免無限重試
3. **不做 Telegram 通知**：用 macOS 原生通知 + log
