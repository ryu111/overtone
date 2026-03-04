# StatusLine API 參考

> Claude Code CLI 底部即時狀態列的完整設定與實作指引

## 1. StatusLine 概覽

StatusLine 是 Claude Code CLI 底部的即時顯示區域，每次工具呼叫完成後自動更新。
透過 `settings.json` 的 `statusLine` 欄位設定一個外部腳本，Claude Code 將 stdin JSON 傳給該腳本，並將 stdout 顯示在 CLI 底部。

**Overtone 使用場景**：顯示目前 active agent 名稱、workflow 模式、context 使用率、transcript 檔案大小、compact 計數。

---

## 2. settings.json 設定格式

`~/.claude/settings.json` 中加入 `statusLine` 欄位：

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/statusline.sh",
    "padding": 0
  }
}
```

| 欄位 | 型態 | 說明 |
|------|------|------|
| `type` | `"command"` | 固定值，目前只支援外部指令模式 |
| `command` | `string` | 腳本絕對路徑或 `~` 路徑（支援 tilde 展開） |
| `padding` | `number` | 底部額外空行數（`0` = 緊貼底部，預設 `0`） |

> **注意**：`command` 路徑支援 `~/` tilde 展開，例如 `~/.claude/statusline.sh`。

---

## 3. StatusLine 腳本格式

### 3.1 輸入（stdin）

腳本啟動時，Claude Code 以 JSON 格式寫入 stdin。腳本必須讀取 `/dev/stdin` 並解析 JSON。

```bash
#!/bin/bash
# 最簡示範：直接讀 stdin 並輸出
input=$(cat)
echo "StatusLine: $input"
```

### 3.2 輸出（stdout）

腳本的 stdout 完整顯示在 CLI 底部。

- 支援 **ANSI 色碼**（終端顏色控制）
- 支援**多行輸出**：第一行為主行，第二行為次行（有 active agent 時顯示雙行）
- 每行結尾必須有換行符 `\n`
- 若輸出空字串，底部顯示區收回

### 3.3 雙行 vs 單行邏輯

| 條件 | 行數 | 說明 |
|------|------|------|
| 有 active agent 或 Main 控制中 | 雙行 | Line 1：agent 名稱 + workflow 模式；Line 2：metrics |
| workflow 全部完成或無 workflow | 單行 | 僅顯示 metrics（ctx + 檔案大小） |

---

## 4. stdin JSON 欄位

Claude Code 傳入的 JSON 欄位：

| 欄位 | 型態 | 說明 | 範例 |
|------|------|------|------|
| `session_id` | `string` | 目前 session 的唯一識別碼 | `"abc123"` |
| `transcript_path` | `string` | Transcript 檔案的絕對路徑 | `"/path/to/transcript.jsonl"` |
| `context_window` | `object` | Context window 使用資訊 | 見下方 |
| `context_window.used_percentage` | `number` | Context 使用百分比（0–100） | `45.2` |

**完整 stdin 範例：**

```json
{
  "session_id": "abc123def456",
  "transcript_path": "/Users/user/.claude/projects/my-project/transcript.jsonl",
  "context_window": {
    "used_percentage": 45.2
  }
}
```

> **注意**：實際欄位可能因 Claude Code 版本而有所增減，腳本應對缺失欄位做防禦處理（`|| null` / try-catch）。

---

## 5. ANSI 色碼常用值

| 名稱 | 代碼 | 用途 |
|------|------|------|
| reset | `\x1b[0m` | 重置所有樣式 |
| dim | `\x1b[2m` | 暗色（分隔符用） |
| bold | `\x1b[1m` | 粗體 |
| cyan | `\x1b[36m` | 青色（標籤 `ctx`、`♻️`） |
| yellow | `\x1b[33m` | 黃色（警告，65%+） |
| red | `\x1b[91m` | 亮紅色（危險，80%+） |
| green | `\x1b[32m` | 綠色 |
| blue | `\x1b[34m` | 藍色 |

**使用範例：**

```javascript
const ANSI = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[91m',
};

// 青色標籤
const ctxLabel = `${ANSI.cyan}ctx${ANSI.reset}`;

// 百分比超過 80% 顯示紅色
function colorPct(pct) {
  if (pct >= 80) return `${ANSI.red}${pct}%${ANSI.reset}`;
  if (pct >= 65) return `${ANSI.yellow}${pct}%${ANSI.reset}`;
  return `${pct}%`;
}
```

---

## 6. Overtone StatusLine 實作

### 6.1 四態顯示邏輯

`plugins/overtone/scripts/statusline.js` 實作四態邏輯，決定顯示雙行或單行：

| 態 | 條件 | Line 1 | Line 2 |
|----|------|--------|--------|
| **Active Agent** | `workflow.stages` 中有 `status: "active"` | `💻 developer` 或 `💻 developer × 3`（並行）| `ctx% │ 大小 │ ♻️ Na Nm` |
| **Main 控制中** | 無 active agent 但 workflow 未完成 | `🧠 Main` | `ctx% │ 大小 │ ♻️ Na Nm` |
| **Workflow 完成** | 所有 stage `completed` 且無 fail/reject | 無（收回） | `ctx% │ 大小`（單行） |
| **無 Workflow** | `workflow.json` 不存在或無 stages | 無（收回） | `ctx% │ 大小`（單行） |

**並行顯示規則**：多個相同 stage type 的 active agent 顯示 `× N`，不同 type 以 ` + ` 連接。

### 6.2 額外讀取的本地檔案

除 stdin JSON 外，`statusline.js` 還讀取兩個本地檔案：

| 檔案 | 路徑 | 用途 |
|------|------|------|
| `workflow.json` | `~/.overtone/sessions/{session_id}/workflow.json` | 判斷四態邏輯 |
| `compact-count.json` | `~/.overtone/sessions/{session_id}/compact-count.json` | 顯示 compact 計數（`♻️ 2a 1m`） |
| `registry-data.json` | plugin scripts 目錄下的 `lib/registry-data.json` | 取得 stage emoji 和 agent 名稱 |

### 6.3 輸出格式範例

**雙行（有 active agent）：**
```
  💻 developer  │  快速
  ctx 45%  │  12.3MB  │  ♻️ 2a 1m
```

**雙行（Main 控制中）：**
```
  🧠 Main  │  標準
  ctx 45%  │  12.3MB  │  ♻️ 0a 1m
```

**單行（workflow 完成）：**
```
  ctx 45%  │  12.3MB
```

**context 顏色規則：**
- < 65%：預設顏色
- 65%–79%：黃色警告
- ≥ 80%：亮紅危險

### 6.4 SessionStart 自動設定

`on-start.js` hook 在每次 session 啟動時自動寫入 wrapper 和 settings：

```javascript
// 1. 寫入 ~/.claude/statusline.sh
writeFileSync(wrapperPath, `#!/bin/bash\nexec node "${statuslineScript}"\n`);
chmodSync(wrapperPath, 0o755);

// 2. 只在 settings.json 沒有 statusLine 時才新增（不覆蓋既有設定）
if (!settings.statusLine) {
  settings.statusLine = {
    type: 'command',
    command: '~/.claude/statusline.sh',
    padding: 0,
  };
}
```

**設計原則**：
- Wrapper script 每次 session 都重新寫入（確保路徑正確）
- `settings.json` 採保守策略：若已有 `statusLine` 設定則保留，不覆蓋用戶自訂設定

---

## 7. 自訂 StatusLine 腳本範例

最簡化的自訂腳本（Node.js）：

```javascript
#!/usr/bin/env node
'use strict';

const { readFileSync } = require('fs');

let input = {};
try {
  const raw = readFileSync('/dev/stdin', 'utf8');
  if (raw.trim()) input = JSON.parse(raw);
} catch {}

const sessionId = input.session_id || 'unknown';
const ctxPct = input?.context_window?.used_percentage;
const ctxStr = ctxPct != null ? `${Math.round(ctxPct)}%` : '--';

process.stdout.write(`  session: ${sessionId}  │  ctx: ${ctxStr}\n`);
```

**效能要求**：StatusLine 腳本應在 < 100ms 內完成，避免 I/O 阻塞或網路呼叫。
