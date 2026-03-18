# Session 收尾架構重構 — 技術設計

## 深度路由：D4
**理由**：跨 7+ 個模組（三個 daemon 腳本、settings.json、Stop Hook、SessionEnd 安全網、marker 模組），可並行拆分為獨立 executor

---

## 技術摘要

- **方案**：三層閘門（Stop Hook 閘門 + Executor 收尾 + SessionEnd 安全網）
- **理由**：Stop Hook 防止未收尾退出；Executor 走 hook pipeline 獲得完整可觀測性；安全網處理異常路徑
- **取捨**：增加 Stop Hook 複雜度，但換取收尾保證和可觀測性

## 方案比較

| 維度 | 方案 A: 三層閘門（選擇） | 方案 B: 純 SessionEnd 重構 | 方案 C: nova-server 集中收尾 |
|------|:----------------------:|:------------------------:|:--------------------------:|
| 可觀測性 | 完整（executor 事件可見） | 部分（daemon 仍是孤兒進程） | 完整 |
| 依賴編排 | Phase 1→2 強制順序 | 無法保證（並行 daemon） | 可行 |
| 收尾保證 | Stop Hook 阻擋 + 安全網 | 無保證（session 可直接退出） | 無保證 |
| 複雜度 | 中（3 層但各層簡單） | 低 | 高（server 行數超標） |
| 資源 | 0 額外進程 | 3 bun 進程 | 0 但 server.js 膨脹 |
| **結論** | ✅ 選擇 | ❌ 未解決依賴和可觀測性 | ❌ server.js 超 350 行限制 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | wrapup-marker.js | ~/.claude/scripts/wrapup-marker.js | ~40 | marker 讀寫（writeMarker / readMarker / isComplete） |
| 2 | wrapup-stop-hook.sh | ~/.claude/hooks/wrapup-stop-hook.sh | ~50 | Stop Hook 腳本（檢查 marker，block/allow） |
| 3 | session-wrapup-safety.js | ~/.claude/hooks/session-wrapup-safety.js | ~60 | SessionEnd 安全網（marker 不存在時執行確定性收尾） |
| 4 | wrapup-marker.test.js | ~/projects/overtone/tests/unit/wrapup-marker.test.js | ~80 | marker 模組測試 |
| 5 | session-wrapup.test.js | ~/projects/overtone/tests/unit/session-wrapup.test.js | ~100 | 安全網 + 整合測試 |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | maintainer.js | export `runMaintainer()` 函式（提取 main() 核心邏輯），保留 `import.meta.main` 入口 |
| 2 | learner.js | export `runLearner()` 函式（提取 main() 核心邏輯），保留 `import.meta.main` 入口 |
| 3 | judge.js | export `runJudge()` 函式（提取 main() 核心邏輯），保留 `import.meta.main` 入口 |
| 4 | settings.json | SessionEnd hooks 移除 maintainer/learner/judge 的直接呼叫，新增安全網 hook；新增 Stop hook |
| 5 | rules/總結格式.md | 新增收尾 executor 委派指示 |
| 6 | architecture.test.js | 新增 wrapup-stop-hook.sh 存在性測試 |
| 7 | daemon-utils.js | 不修改（heartbeat 仍使用 setupSelfFork/setupLock） |

### API 設計

#### wrapup-marker.js

```javascript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MARKER_PATH = join(homedir(), '.claude/data/last-wrapup.json');

/**
 * 寫入 wrapup marker
 * @param {string} sessionId - Claude session ID
 * @param {object} phases - { learner: {status, duration_ms}, judge: {...}, maintainer: {...} }
 * @param {'complete'|'partial'|'failed'} status
 */
export function writeMarker(sessionId, phases, status = 'complete') {
  const marker = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    status,
    phases,
  };
  writeFileSync(MARKER_PATH, JSON.stringify(marker, null, 2));
}

/**
 * 讀取 marker（不存在或損壞 → null）
 */
export function readMarker() {
  try {
    if (!existsSync(MARKER_PATH)) return null;
    return JSON.parse(readFileSync(MARKER_PATH, 'utf-8'));
  } catch { return null; }
}

/**
 * 檢查指定 session 是否已完成收尾
 */
export function isComplete(sessionId) {
  const marker = readMarker();
  if (!marker) return false;
  return marker.session_id === sessionId &&
         (marker.status === 'complete' || marker.status === 'partial');
}
```

#### daemon 腳本 export 策略

**maintainer.js**：

```javascript
// 新增 export — 提取 main() 的核心邏輯
export async function runMaintainer() {
  log('=== Maintainer (executor mode) ===');
  const ctx = collect();           // Phase 1: 收集
  const actions = await decide(ctx);  // Phase 2: 模型決策
  await execute(actions, ctx);        // Phase 3: 執行
  await recordSession(ctx, { askLocalModel, git, log }); // Phase 4: 記錄
  try { buildDailyLogs(); } catch (e) { log('[maintainer] buildDailyLogs error:', e.message); }
  log('=== Maintainer (executor mode) completed ===');
  return { status: 'ok' };
}

// 保留原 main() — daemon 模式
async function main() {
  // ...（原邏輯不變）
}

if (import.meta.main) {
  setupSelfFork('MAINTAINER_BG', import.meta.path, LOG);
  setupLock(LOCK, log);
  main();
}
```

**learner.js** 和 **judge.js** 同理，各自 export `runLearner()` / `runJudge()`。

#### wrapup-stop-hook.sh

```bash
#!/bin/bash
# wrapup-stop-hook.sh — 收尾閘門
# 檢查 last-wrapup.json marker 是否存在且匹配當前 session
set -euo pipefail

HOOK_INPUT=$(cat)
MARKER_FILE="$HOME/.claude/data/last-wrapup.json"

# 防護：marker 檔案不存在 → block exit，要求收尾
if [[ ! -f "$MARKER_FILE" ]]; then
  jq -n '{
    "decision": "block",
    "reason": "Session 尚未執行收尾。請先執行收尾（總結 + commit + learner/judge/maintainer）再退出。"
  }'
  exit 0
fi

# 讀取 marker
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // ""')
MARKER_SESSION=$(jq -r '.session_id // ""' "$MARKER_FILE" 2>/dev/null || echo "")
MARKER_STATUS=$(jq -r '.status // ""' "$MARKER_FILE" 2>/dev/null || echo "")

# session_id 匹配且狀態為 complete 或 partial → 放行
if [[ -n "$SESSION_ID" ]] && [[ "$MARKER_SESSION" = "$SESSION_ID" ]]; then
  if [[ "$MARKER_STATUS" = "complete" ]] || [[ "$MARKER_STATUS" = "partial" ]]; then
    exit 0
  fi
fi

# 不匹配或狀態異常 → 檢查 marker 時間（24 小時內的其他 session marker 也放行）
MARKER_TS=$(jq -r '.timestamp // ""' "$MARKER_FILE" 2>/dev/null || echo "")
if [[ -n "$MARKER_TS" ]]; then
  # 簡單年齡檢查：如果 marker 很新（< 5 分鐘），可能是剛完成收尾的其他 session → 放行
  MARKER_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${MARKER_TS%%.*}" "+%s" 2>/dev/null || echo "0")
  NOW_EPOCH=$(date "+%s")
  AGE=$(( NOW_EPOCH - MARKER_EPOCH ))
  if [[ $AGE -lt 300 ]]; then
    exit 0
  fi
fi

# 兜底：block
jq -n '{
  "decision": "block",
  "reason": "Session 尚未執行收尾。請先執行收尾（總結 + commit + learner/judge/maintainer）再退出。"
}'
exit 0
```

#### session-wrapup-safety.js（SessionEnd 安全網）

```javascript
#!/usr/bin/env bun
// session-wrapup-safety.js — SessionEnd 安全網
// marker 存在且匹配 → skip
// marker 不存在 → 執行確定性收尾（不用本地模型）

import { readMarker } from './wrapup-marker.js';

const input = JSON.parse(await Bun.stdin.text());
const sessionId = input?.session_id;

// 檢查 marker
const marker = readMarker();
if (marker && marker.session_id === sessionId &&
    (marker.status === 'complete' || marker.status === 'partial')) {
  // 已收尾 → skip
  process.exit(0);
}

// 安全網：執行確定性部分
try {
  const { runMaintainer } = await import('./maintainer.js');
  // runMaintainer 內部已有 fallback（本地模型不可用 → 只做確定性動作）
  await runMaintainer();
} catch (e) {
  console.error('[wrapup-safety] maintainer fallback error:', e.message);
}

// learner 和 judge 在安全網中不執行（它們主要依賴本地模型，確定性部分價值低）
```

## 資料模型

- 儲存格式：JSON
- 儲存位置：`~/.claude/data/last-wrapup.json`
- 清理策略：每次收尾覆蓋；無需定期清理（單一檔案）

## Settings.json 變更

### 現有（移除）

```json
"SessionEnd": [
  { "matcher": "", "hooks": [
    { "type": "command", "command": "bun ~/.claude/hooks/hook-client.js SessionEnd" },
    { "type": "command", "command": "bun ~/.claude/scripts/maintainer.js" },
    { "type": "command", "command": "bun ~/.claude/scripts/learner.js" },
    { "type": "command", "command": "bun ~/.claude/scripts/judge.js" }
  ]}
]
```

### 新版

```json
"Stop": [
  { "matcher": "", "hooks": [
    { "type": "command", "command": "bash ~/.claude/hooks/wrapup-stop-hook.sh" }
  ]}
],
"SessionEnd": [
  { "matcher": "", "hooks": [
    { "type": "command", "command": "bun ~/.claude/hooks/hook-client.js SessionEnd" },
    { "type": "command", "command": "bun ~/.claude/hooks/session-wrapup-safety.js" }
  ]}
]
```

**Stop Hook 執行順序**：
1. Ralph Loop plugin 的 `stop-hook.sh`（plugin hooks 先執行）
2. settings.json 的 `wrapup-stop-hook.sh`

**共存邏輯**：
- Ralph Loop 啟用時 → Ralph Loop 的 stop-hook.sh 先 block → wrapup-stop-hook.sh 不會被執行（Claude Code 收到 block 就停止後續 hooks）
- Ralph Loop 未啟用時 → Ralph Loop 的 stop-hook.sh 放行（exit 0） → wrapup-stop-hook.sh 檢查 marker
- 這表示 Ralph Loop 的迭代中不會被 wrapup hook 阻擋，只在 Ralph Loop 完成後（state file 刪除）才觸發 wrapup 檢查

## 總結格式.md 變更

在現有規則後新增 executor 委派指示：

```markdown
### 收尾 Executor

📋 MUST 總結完成後，委派 3 個 executor 執行收尾：

Phase 1（並行，model=haiku）：
- **learner executor**：`import { runLearner } from '~/.claude/scripts/learner.js'; await runLearner()`
- **judge executor**：`import { runJudge } from '~/.claude/scripts/judge.js'; await runJudge()`

Phase 2（串行，依賴 Phase 1，model=haiku）：
- **maintainer executor**：`import { runMaintainer } from '~/.claude/scripts/maintainer.js'; await runMaintainer()`

完成後寫 marker：
`import { writeMarker } from '~/.claude/scripts/wrapup-marker.js'; writeMarker(sessionId, phases)`
```

## Sub-session（heartbeat）收尾

### 問題：DISABLE_HOOKS=1

heartbeat 的 `claude -p` session 目前帶 `DISABLE_HOOKS=1` 防止 SessionEnd → maintainer → `claude -p` 無限循環。

**新架構下的解決方案**：

1. heartbeat session **不帶** `DISABLE_HOOKS=1`（移除 session-spawner.js 中的此 env）
2. 無限循環的根因已消除：SessionEnd 不再 fork daemon（改用安全網），安全網只 import 函式不 spawn 進程
3. `-p` session 沒有 Stop hook（非互動式） → 直接退出
4. SessionEnd 安全網正常觸發 → 如果 executor 已收尾（marker 存在）則 skip

**但**：heartbeat session 的 executor 收尾需要 heartbeat prompt 包含收尾指示。目前 `buildPrompt()` 已包含 "3. Commit 並 push 雙 repo"，需要擴展包含完整收尾。

**實作路徑**：
- session-spawner.js 的 `buildPrompt()` 新增收尾指示
- 移除 `KEYS_TO_REMOVE` 中 `DISABLE_HOOKS` 相關項目（如果有的話）
- 注意：`DISABLE_HOOKS` 是 hook-client.js 檢查的 env，不在 `KEYS_TO_REMOVE` 中，而是 heartbeat session 的 env 帶入。需要在 session-spawner.js 確保不設定此 env

**簡化方案**（選擇此方案）：
- heartbeat `-p` session **繼續帶** `DISABLE_HOOKS=1`（保守安全）
- 收尾改由 heartbeat prompt 指示 session 在完成前呼叫 `runLearner/runJudge/runMaintainer`
- 這樣不依賴 hook pipeline，避免引入新的循環風險
- SessionEnd 安全網不觸發（DISABLE_HOOKS=1），但不需要（prompt 已指示收尾）

## 執行步驟

### Phase 1：基礎模組（parallel）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | wrapup-marker.js | 建立 marker 讀寫模組 |
| 1b | wrapup-marker.test.js | marker 模組單元測試 |

### Phase 2：Daemon 腳本重構（parallel）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | maintainer.js | export runMaintainer()，提取核心邏輯，保留 import.meta.main |
| 2b | learner.js | export runLearner()，提取核心邏輯，保留 import.meta.main |
| 2c | judge.js | export runJudge()，提取核心邏輯，保留 import.meta.main |

### Phase 3：Hook 層（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | wrapup-stop-hook.sh | Stop Hook 腳本 |
| 3b | session-wrapup-safety.js | SessionEnd 安全網 |
| 3c | settings.json | 更新 hook 設定 |

### Phase 4：規則與測試（sequential，依賴 Phase 2+3）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4a | rules/總結格式.md | 新增收尾 executor 委派指示 |
| 4b | session-wrapup.test.js | 安全網整合測試 |
| 4c | architecture.test.js | 新增 wrapup hook 存在性測試 |

### Phase 5：驗證（sequential，依賴 Phase 4）

| 步驟 | 說明 |
|------|------|
| 5a | `bun test` 全量通過 |
| 5b | 手動驗證 Stop Hook（模擬 session exit） |

## Pre-mortem

📋 MUST 在開始實作前執行 Pre-mortem 分析。

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | Stop Hook bug 導致使用者無法退出 session | 中 | 高 | marker 讀取失敗預設放行；bash 腳本嚴格 error handling；手動測試驗證 |
| 2 | runMaintainer() export 改壞了 daemon 獨立執行模式 | 中 | 中 | 保留 import.meta.main + setupSelfFork，確保 `bun maintainer.js` 仍可直接執行 |
| 3 | Ralph Loop + wrapup Stop Hook 執行順序不如預期 | 低 | 高 | 驗證 Claude Code 的 hook 執行順序（plugin hooks → settings.json hooks），文件記錄 |
| 4 | Executor 收尾耗時過長（> 2 分鐘）影響使用者體驗 | 中 | 中 | haiku executor + 本地 MLX 快速推論（< 30s 各）；Phase 1 並行 |
| 5 | SessionEnd 安全網 import maintainer.js 時載入過慢 | 低 | 低 | 安全網只 import 必要函式，不載入整個 daemon（setupSelfFork 在 import.meta.main guard 內） |
