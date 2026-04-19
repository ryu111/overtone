---
name: self-compact 事件驅動重設計
depth: D2
domain: hooks / self-drive infrastructure
status: 討論中
created: 2026-04-19
author: nova-brain
related:
  - rules/環境/自壓縮.md
  - scripts/self-compact.js
  - hooks/modules/flow-observer.js
  - hooks/modules/ctx-tracker.js
  - obsidian/wiki/feedback-loop/self-compact-detail.md
---

# self-compact 事件驅動重設計

## 動機

`scripts/self-compact.js` 現行實作大量使用 **time-based 判定**（sleep / timeout / idle heuristic / polling loop），連續多次踩雷：

| 日期 | 根因 | 修復 | commit |
|---|---|---|---|
| 2026-04-19 | `isSessionIdle` 3s 閾值誤判 AI tool call 間隔為 idle → 觸發 /clear 打斷執行中任務 | 升 10s | cd7fd15 |
| 2026-04-19 | spawnSync 失敗仍送 /clear → 新 session 讀舊 handoff | mtime ≥ scriptStartMs 輪詢 gate（仍 time-based）| iter |
| 2026-04-19 | ctxBefore=0 時 `waitForCtxUpdate` 永遠等 ctx<0 | 加 ctxBefore=0 旁路 | iter |

使用者 feedback（2026-04-19）：「不要用 time 不然一定會錯」。

**核心原則**：每個「等」都要問權威信號源，不問時鐘。

## 現狀（time-based）

```
S1. waitForIdle(30s)                 — lastActive > 10s heuristic
S2. spawnSync PreCompact + 輪詢 mtime 5s
S3. send /compact or /clear
S4. sleep 5s + waitForIdle 15s       — compact mode
    sleep 3s + waitForIdle 15s       — clear mode
S5. waitForCtxUpdate 30s polling    — compact mode only
S6. cooldown 10 min time window
S7. session replace: sleep 2s/3s + 多段 polling 15s/30s
```

## 新設計（event-based）

### 權威信號源映射

| 舊（time-based） | 新（event-based） | 權威來源 |
|---|---|---|
| `IDLE_THRESHOLD_MS = 10s` | **Stop hook flag** | Claude Code harness Stop event |
| `waitForIdle` polling | fs.watch on stopped flag | kernel inotify |
| `handoff mtime polling 5s` | `spawnSync.exitCode` + 單次 statSync | Bun sync IO 語意保證 |
| `sleep 5s + waitForIdle`（/compact 後）| **PostCompact hook flag** | Claude Code harness |
| `sleep 3s + waitForIdle`（/clear 後）| **？？？**（開放問題 Q1）| 需實測 |
| `waitForCtxUpdate 30s polling` | PostCompact 已同步寫 usage.ctx=0 | flow-observer PostCompact |
| `COOLDOWN_MS 10 min` | **lock flag state machine** | fs state（arm/disarm） |
| session replace sleep/polling | SSE `session_close` event + SessionStart hook | nova-server SSE + harness |

### 新狀態機

```
S0. [armed]
    檢查 /tmp/nova-compact-lock-<project>.flag
    存在 → 退出（另一個 in-flight）
    不存在 → 寫 lock flag（含 pid）

S1. [wait_ai_done]
    fs.watch /tmp/nova-session-stopped-<project>.flag
    來源：Stop hook
    fail-safe: 60s timeout → abort

S2. [write_handoff]
    Bun.spawnSync hook-client.js PreCompact
    檢查 exitCode === 0
    單次 statSync 驗 mtime ≥ scriptStartMs
    fail → abort + 通知使用者

S3. [send_slash]
    POST /api/terminal/send /compact 或 /clear

S4a. [wait_post_compact]（compact mode）
    fs.watch /tmp/nova-compact-done-<project>.flag
    來源：PostCompact hook
    fail-safe: 120s timeout → abort

S4b. [wait_clear_done]（clear mode）— Q1 已解
    fs.watch /tmp/nova-session-started-<project>.flag
    來源：SessionStart hook，只接受 payload.source === "clear"
    fail-safe: 120s timeout → abort

S5. [send_continuation]
    POST /api/terminal/send continuation prompt

S6. [disarm]
    刪 lock flag
    compactCount++（檔案 state，非時間）
    count >= 20 → S7

S7. [session_replace]
    先查 /api/sessions/active 記錄當前 session_id 為 pre_exit_sid
    send /exit
    wait: fs.watch /tmp/nova-session-ended-<project>.flag
        payload 必含 session_id === pre_exit_sid 才通過（因 SessionEnd 對所有 session 結束都 fire
        包含 /clear / /compact / /exit，需 session_id 配對辨別是自己觸發的 /exit）
    send claude -n <project>
    wait: fs.watch /tmp/nova-session-started-<project>.flag（source 任意，session_id 為新值）
    send 替換訊息
```

### Fail-safe timeout 的角色

保留但**不依賴**：每個 `waitForFlag` 有 60-120s safety timeout：
- ✅ 防 deadlock（hook 沒觸發不死等）
- ❌ **不是**「等這麼久就假設完成」
- 超時 = 明確 throw → abort 路徑，不 fallthrough

## 實測結果（2026-04-19，從 `/tmp/nova-flow-events.jsonl` 24 筆 source=clear + 2 筆 source=compact 歷史資料）

### Q1 ✅ /clear 觸發 3 個 hook

真實序列（取兩筆範例，時間軸對齊 SessionStart source=clear at t=0）：

```
cwd=/Users/sbu/.claude
-710ms  session_stop              ← Stop hook（前 AI turn 結束）
-259ms  session_end               ← SessionEnd hook（/clear 觸發）
  +0ms  session_start source=clear← SessionStart hook，payload 帶 source="clear"

cwd=/Users/sbu/projects/nova-control
-6840ms session_stop
-6794ms pre_compact               ← 前序 /compact 殘留
-6792ms session_stop
 -327ms session_end               ← /clear 的 SessionEnd
    +0ms session_start source=clear
```

**結論**：
- /clear 不觸發 PreCompact / PostCompact
- SessionEnd + SessionStart(source=clear) 都可當 S4b 權威信號
- **首選 SessionStart source=clear**（payload 帶 source 可精確區分 vs 正常開 session vs resume vs compact）

### Q2 ✅ Stop hook 在 /compact or /clear 處理中不重複觸發

`session_stop` 只在 AI turn 自然結束 fire，不在 compact/clear 處理中間 fire。S1 設計可靠。

但仍需防 **stale flag**：UserPromptSubmit hook 必須 one-shot 清除 flag，否則 self-compact.js 下次呼叫會瞬間通過 S1（讀到舊 flag）。

**Spec 實作條款**：
- flag payload 寫 `{ts, session_id}`
- S1 檢查 `flag.ts > scriptStartMs`（時間戳過濾 stale，而非時間判定完成）

### Q3 ⚠️ nova-server 無獨立 SSE session_close，改用 SessionEnd hook event

實查 `nova-server/core/*.js`：
- `bus.emit` 只在 `dispatch.js:177` 轉發 hook event，**nova-server 自己不 emit session lifecycle event**
- `session_end` 存在但來源是 hook-side 寫入 flow-events.jsonl

**S7 session replace 改用**：
- send "/exit" → fs.watch `/tmp/nova-session-ended-<project>.flag`（SessionEnd hook 寫）
- send "claude -n <project>" → fs.watch `/tmp/nova-session-started-<project>.flag`（SessionStart hook 寫）

### /compact 觸發序列（比對用）

```
???     pre_compact
  +0ms  session_start source=compact  ← Claude Code 把 /compact 當作新 session 開始
+126ms  post_compact
```

Claude Code 設計上 /compact = 「舊 session 結束 + 新 session 帶壓縮 summary 開始」，所以中途 fire session_start(source=compact)。S4a 應等 `post_compact`（PostCompact 在 source=compact 的 session_start 之**後**）。

## 實作 scope（Q1-Q3 驗證後才開工）

### 需改的 hook（`hooks/modules/flow-observer.js`）

| Hook | 現狀 | 新增行為 |
|---|---|---|
| Stop | 清 routing level / 寫 session-work flag | **新增**：寫 `/tmp/nova-session-stopped-<project>.flag`（含 ts + session_id）|
| PostCompact | 注入 systemMessage + reset usage.ctx | **新增**：寫 `/tmp/nova-compact-done-<project>.flag`（含 ts）|
| SessionStart | handoff recovery prompt | **新增**：寫 `/tmp/nova-session-started-<project>.flag`（含 ts + source 欄位：`clear` / `compact` / `startup` / `resume`）|
| SessionEnd | （未知，需查）| **新增**：寫 `/tmp/nova-session-ended-<project>.flag`（含 ts + reason）|
| UserPromptSubmit | 各種 ctx/route 注入 | **新增**：清除上述 4 個 flag（one-shot） |

### 需重寫的 script（`scripts/self-compact.js`）

取消所有 time-based 邏輯：
- 刪 `IDLE_THRESHOLD_MS` / `waitForIdle` / `waitForCtxUpdate`
- 刪 `COOLDOWN_MS` 時間窗 → 改 lock flag
- 刪 mtime 輪詢 5s → 改單次 statSync
- 刪所有 `Bun.sleep`
- 新增 `waitForFlag(path, failSafeMs)` 用 fs.watch

### 測試（`tests/unit/self-compact.test.js`）

- Stop hook flag 寫入驗證
- PostCompact flag 寫入驗證
- UserPromptSubmit 清 flag 驗證
- self-compact.js lock flag 防重入
- fs.watch 超時 fail-safe 路徑

## 效益

| 面向 | 現行 | 新設計 |
|---|---|---|
| **正確性** | idle heuristic 會誤判 | 事件驅動，權威信號 |
| **Latency** | sleep 累積 8-15s | 事件到即執行，通常 < 1s |
| **Fail-safe** | 超時後 fallthrough 假設完成 | 超時明確 abort |
| **cooldown 重複觸發** | time window 可能鎖死或被繞 | state flag 語意清晰 |
| **可測試性** | 需 mock setTimeout / Date | flag 檔可直接驗 |

## Risks（Q1-Q3 實測後更新）

1. ~~**Q1 落 (b)**~~ — 已證偽，/clear 觸發 Stop → SessionEnd → SessionStart(source=clear)
2. **stale flag race**：Stop flag 若未及時清除，下次 self-compact.js 呼叫瞬間通過 S1 → mitigation：flag 含 ts + `ts > scriptStartMs` 過濾 + UserPromptSubmit one-shot 刪
3. **lock flag 孤兒**：self-compact.js crash 留下 lock → mitigation：pid 驗活 + ts sanity（ts > 1h 前視為孤兒）
4. ~~**SSE dependency**~~ — 改用 SessionEnd hook event，移除 SSE 依賴

## 下一步

1. ✅ Q1-Q3 已用歷史 log 分析解答（無需開測試 session）
2. 本 spec 已據實測結果更新設計
3. **待使用者確認**後開工：
   - 改 `flow-observer.js` 的 Stop / PostCompact / SessionStart / SessionEnd / UserPromptSubmit 5 個 handler
   - 重寫 `scripts/self-compact.js`（刪所有 time-based 邏輯）
   - 補 `tests/unit/self-compact-event-flow.test.js`

## See also

- [rules/環境/自壓縮.md](../../rules/環境/自壓縮.md) — SoT 3 條紀律
- [obsidian/wiki/feedback-loop/self-compact-detail.md](../../obsidian/wiki/feedback-loop/self-compact-detail.md) — /handoff vs /handoff new + Q2 fallback
- [scripts/self-compact.js](../../scripts/self-compact.js) — 現行實作
- [hooks/modules/flow-observer.js](../../hooks/modules/flow-observer.js) — PreCompact/PostCompact/Stop/SessionStart 集中地
