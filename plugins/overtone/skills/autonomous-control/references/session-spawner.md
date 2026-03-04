# Session Spawner 使用指引

> 來源：session-spawner.js 實作

## 一、概述

`session-spawner.js` 封裝了 `claude -p` headless session 的啟動邏輯，提供 timeout 兜底、stream-json stdout 解析、安全環境變數過濾。Heartbeat Engine 透過此模組 spawn 子 session 執行佇列任務。

---

## 二、基本使用

```javascript
const { spawnSession } = require('./lib/session-spawner');

// 最簡用法：傳入 prompt，取得 child process 和 outcome Promise
const { child, outcome } = spawnSession('開始執行 my-feature，workflow: standard');

// 等待 session 完成
const result = await outcome;
// result: { status, sessionId, errorCode }

switch (result.status) {
  case 'success':
    console.log(`Session ${result.sessionId} 完成`);
    break;
  case 'error':
    console.log(`錯誤：${result.errorCode}`);
    break;
  case 'timeout':
    console.log('Session 超時（60 分鐘）');
    break;
  case 'crash':
    console.log('Session 異常終止');
    break;
}
```

---

## 三、API 參考

### spawnSession(prompt, opts?, _deps?)

| 參數 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `prompt` | string | （必填） | 傳給 `claude -p` 的完整 prompt |
| `opts.pluginDir` | string | 自動偵測 `plugins/overtone` | plugin 目錄路徑 |
| `opts.cwd` | string | 無（使用父程序 cwd） | 子程序工作目錄 |
| `opts.timeout` | number | `3600000`（60 分鐘） | 超時毫秒數，0 表示不設限 |
| `opts.outputFormat` | string | `'stream-json'` | claude CLI 輸出格式 |
| `_deps.spawn` | Function | `child_process.spawn` | 依賴注入（測試替換用） |

### 回傳值

```javascript
{
  child: ChildProcess,  // Node.js child process 實例
  outcome: Promise<{
    status: 'success' | 'error' | 'timeout' | 'crash',
    sessionId: string | null,
    errorCode: string | null
  }>
}
```

### _buildArgs(opts?)

組裝 claude CLI 參數陣列（不含 prompt）。

```javascript
const { _buildArgs } = require('./lib/session-spawner');

_buildArgs({ pluginDir: '/path/to/plugin' });
// → ['-p', '--plugin-dir', '/path/to/plugin', '--output-format', 'stream-json']
```

---

## 四、安全防護機制

### 1. 遞迴防護（OVERTONE_SPAWNED）

```javascript
// session-spawner.js 自動設定
childEnv.OVERTONE_SPAWNED = '1';

// 在子 session 中檢查（由 hooks 或 heartbeat 判斷）
if (process.env.OVERTONE_SPAWNED === '1') {
  // 這是被 spawn 的 session，限制某些操作
}
```

**目的**：防止子 session 再次 spawn 子 session，造成無限遞迴。Heartbeat 在啟動時檢查此環境變數，若已被設定則拒絕啟動。

### 2. 敏感 env 過濾

```javascript
// 自動從子 session 環境中移除的 key
const SENSITIVE_KEYS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

// 過濾邏輯
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !SENSITIVE_KEYS.includes(k))
);
```

**目的**：子 session 不需要也不應該有 Telegram 通知權限。敏感 token 僅由 Heartbeat daemon 持有。

### 3. stdio 隔離

```javascript
// stdin 完全忽略（headless，無使用者輸入）
// stdout 由 spawner 解析 stream-json
// stderr 連接到 pipe（可選讀取 debug 資訊）
const spawnOpts = {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: childEnv,
};
```

---

## 五、Outcome 狀態判斷

### 狀態決策樹

```
spawn 子程序後，以下事件決定 outcome：

❓ 收到 stdout 的 result 事件？
   │
   ├─ 是，subtype === 'success'
   │  → { status: 'success', sessionId, errorCode: null }
   │
   ├─ 是，subtype !== 'success'
   │  → { status: 'error', sessionId, errorCode: subtype }
   │
   └─ 否 ↓

❓ 超過 timeout 時間？
   → 是 → SIGTERM 殺死子程序
         → { status: 'timeout', sessionId: null, errorCode: null }
   → 否 ↓

❓ stdout close 或 child error 事件？
   → { status: 'crash', sessionId: null, errorCode: null }
```

### stream-json 解析

```javascript
// session-spawner 逐行解析 stdout 的 JSON
// 每行格式範例：
// {"type":"assistant","session_id":"abc123","content":"..."}
// {"type":"result","subtype":"success","session_id":"abc123"}

// 解析邏輯：
// 1. buffer 累積 stdout data
// 2. 換行分割，逐行 JSON.parse
// 3. 記錄第一個出現的 session_id
// 4. 遇到 type === 'result' 時 settle outcome
```

---

## 六、Timeout 機制

```javascript
// 預設 60 分鐘
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

// 自訂 timeout
const { outcome } = spawnSession(prompt, { timeout: 30 * 60 * 1000 }); // 30 分鐘

// 關閉 timeout（不建議，除非有外部監控）
const { outcome } = spawnSession(prompt, { timeout: 0 });
```

timeout 觸發時：
1. 發送 `SIGTERM` 給子程序
2. 立即 resolve outcome 為 `{ status: 'timeout' }`
3. 清除 timeout 計時器

---

## 七、測試替換（依賴注入）

```javascript
// 測試中替換 spawn，避免真正啟動 claude CLI
const mockSpawn = (cmd, args, opts) => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};

  // 模擬成功完成
  setTimeout(() => {
    child.stdout.write(JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: 'test-session-001'
    }) + '\n');
    child.stdout.emit('close');
  }, 100);

  return child;
};

const { outcome } = spawnSession('test prompt', {}, { spawn: mockSpawn });
const result = await outcome;
// result.status === 'success'
// result.sessionId === 'test-session-001'
```

---

## 八、Prompt 格式

Heartbeat 傳入的 prompt 格式：

```
開始執行 {featureName}，workflow: {workflow}
```

此 prompt 由 `UserPromptSubmit` hook 的 `/ot:auto` 自動接管，偵測 featureName 和 workflow 並啟動對應工作流。

---

## 九、安全邊界摘要

| 邊界 | 規則 | 實作位置 |
|------|------|----------|
| 遞迴防護 | `OVERTONE_SPAWNED=1` 阻止巢狀 spawn | session-spawner.js |
| 敏感 env | 過濾 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID` | session-spawner.js |
| 最大並行 | 1（Heartbeat 保證） | heartbeat.js |
| Timeout | 60 分鐘（可自訂） | session-spawner.js |
| stdio 隔離 | stdin ignore、stdout/stderr pipe | session-spawner.js |
