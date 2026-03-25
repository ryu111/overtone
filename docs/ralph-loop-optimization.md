# Ralph Loop 機制優化分析

日期：2026-03-25
狀態：方案提出，等 Manager 審視

## 現有機制

### 三個元件

1. **auto-ralph.sh**（SessionStart hook）
   - 每個新 session 啟動時自動建立 `.claude/ralph-loop.local.md`
   - 排除背景 session（DISABLE_HOOKS / OVERTONE_SPAWNED）
   - resume session 不重建（已存在則跳過）
   - completion_promise: "DONE"，max_iterations: 50

2. **stop-hook.sh**（ralph-loop plugin Stop hook）
   - session 結束時檢查 ralph-loop.local.md 是否存在
   - 存在 → 讀 transcript 最後一條 assistant 訊息
   - 找到 `<promise>DONE</promise>` → 刪除 state file，放行退出
   - 未找到 → `decision: block`，回傳原始 prompt 讓 session 繼續
   - session_id 隔離：只有建立 loop 的 session 會被阻擋

3. **wrapup-stop-hook.sh**（Nova Stop hook）
   - ralph-loop 活躍時：背景執行 wrapup Phase A+B+C，不阻擋退出
   - ralph-loop 不活躍時：前景執行收尾流程

### 流程

```
SessionStart → auto-ralph.sh 建立 state file
  → session 工作
  → session 結束（自然停止）
  → Stop hook 觸發
    ├─ ralph stop-hook.sh：檢查 <promise>DONE</promise>
    │   ├─ 有 → 刪除 state，放行
    │   └─ 無 → block，回傳 prompt 繼續
    └─ wrapup-stop-hook.sh：ralph 活躍 → 背景收尾
```

## 已知問題

### P1：等待外部輸入時浪費 turns

**症狀**：session 發出 cross-dispatch 後等待回報，但沒有待完成工作。session 自然停止 → stop hook 觸發 → block → session 被迫繼續 → 只能回「等待中」→ 再停止 → 再 block → 循環 10+ 次。

**根因**：stop-hook 無法區分「有工作未完成」和「等待外部輸入」。它只檢查 `<promise>DONE</promise>` 是否出現，不管 session 是否真的有事可做。

### P2：自驅 session 不需要 ralph-loop

**症狀**：heartbeat spawn 的自驅 session 也會被 auto-ralph 建立 state file。但自驅 session 有自己的完成邏輯（task 完成後自然退出），ralph-loop 的「繼續工作」prompt 干擾自驅流程。

**現況**：auto-ralph 排除了 DISABLE_HOOKS 和 OVERTONE_SPAWNED，但 heartbeat spawn 的 session 可能不帶這些 env。

### P3：max_iterations 50 太高

50 次迭代 × 每次可能消耗 1-2 分鐘 = 最多 100 分鐘的無效循環。對於等待外部輸入的場景，浪費嚴重。

## 優化方案

### 方案 A：智能暫停（推薦）

在 stop-hook.sh 中加入「等待偵測」邏輯：

```bash
# 讀取最後一條 assistant 訊息
# 如果包含等待關鍵詞 → 暫停 ralph-loop（不 block，放行退出）
WAIT_PATTERNS="等待.*回報|等待.*完成|waiting for|cross-dispatch.*complete|排隊|queued"
if echo "$LAST_OUTPUT" | grep -qiE "$WAIT_PATTERNS"; then
  echo "⏸️ Ralph loop: 偵測到等待外部輸入，暫停。下次 SessionStart 會自動恢復。"
  # 不刪除 state file（保留 iteration 計數），但放行退出
  exit 0
fi
```

優點：不需要改 auto-ralph，只改 stop-hook
缺點：regex 匹配可能有假陽性

### 方案 B：cross-dispatch 感知

在 stop-hook.sh 中檢查是否有 pending cross-dispatch：

```bash
# 查詢是否有發出但未完成的 cross-dispatch
PENDING=$(curl -s http://127.0.0.1:3457/api/cross-dispatch?source_cwd=$CWD 2>/dev/null | jq '[.[] | select(.status == "delivered")] | length' 2>/dev/null || echo "0")
if [[ "$PENDING" -gt 0 ]]; then
  echo "⏸️ Ralph loop: 有 $PENDING 個 cross-dispatch 等待回報，暫停。"
  exit 0
fi
```

優點：精確偵測等待狀態
缺點：依賴 server 可用、需要 source_cwd 查詢支援（目前 API 只支援 target_cwd）

### 方案 C：顯式暫停 API

讓 session 主動暫停 ralph-loop：

```bash
# session 在發出 cross-dispatch 後執行
echo "paused" > .claude/ralph-loop.local.md.paused
```

stop-hook 檢查 .paused 檔案存在 → 放行。cross-dispatch 回來後 context-injector 刪除 .paused。

優點：session 完全控制暫停/恢復
缺點：需要 session AI 知道要暫停（新規則）

### 方案 D：降低 max_iterations + 加 cooldown

```
max_iterations: 50 → 10
+ 加入 cooldown：連續 3 次 iteration 沒有 git diff 變化 → 自動停止
```

優點：最簡單，低風險
缺點：不解決等待問題，只減少浪費量

## 建議

**短期（立即）**：方案 D — 降低 max_iterations 到 10，加 no-progress 偵測
**中期（1 週內）**：方案 A + B 結合 — 智能暫停 + cross-dispatch 感知
**長期**：方案 C — 顯式暫停 API，讓整個系統的等待/恢復機制統一

## 邊界案例

| 場景 | 現有行為 | 優化後 |
|------|---------|--------|
| resume session | auto-ralph 跳過（state 已存在） | 不變 |
| 背景 session | auto-ralph 跳過（env 排除） | 不變 |
| 自驅 session | 可能被 ralph-loop 干擾 | 方案 D 的 no-progress 偵測會自動停止 |
| 等待 cross-dispatch | 循環 50 次 | 方案 A/B 偵測後暫停 |
| 使用者手動 /exit | ralph block → 繼續 | 不變（使用者需輸出 DONE） |
