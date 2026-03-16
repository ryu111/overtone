# 修復 hook error: PreToolUse:Bash:dispatch

## 動機（Why）

- **問題**：nova-server 週期性 crash 導致 hook dispatch 失敗，每小時約 3 次，今日累計 36 次。crash 根因是 `SELF_DRIVE_PROMPT` 使用 JS template literal，其中的 Markdown 反引號若未正確 escape 即造成語法錯誤
- **目標**：消除 template literal 脆弱性、加強 server 恢復能力、降低錯誤噪音
- **不做的代價**：error-analyzer 持續建立 P1 Notion 任務、heartbeat 不斷嘗試修復、觀測型事件（PostToolUse, SubagentStop）在 crash 期間丟失

## 範圍

### In-scope

- 將 `SELF_DRIVE_PROMPT` 從 template literal 搬至外部 Markdown 檔案
- `pollHealth` 等待時間從 1 秒增至 2-3 秒（指數退避）
- server.js 加 `uncaughtException` / `unhandledRejection` handler
- error-analyzer.js 對 `dispatch` phase 錯誤標記為自癒型

### Out-of-scope

- 重構 server.js 整體架構
- 修改 heartbeat loop 邏輯
- 修改 hook-client.js 的 fallback 機制（已正常運作）

## 使用者故事

身為 nova 系統的 Main Agent，我希望 hook dispatch 不因 server crash 而間歇性失敗，以便觀測型事件不丟失、error 噪音不觸發假 P1 任務。

## 行為規格

### 正常路徑

1. server.js 啟動時 `readFileSync('~/.claude/data/self-drive-prompt.md')` 讀取 prompt → 存入變數
2. heartbeat self-drive 使用讀取的 prompt，不再有 template literal escape 風險
3. hook-client dispatch 失敗 → autoStart → pollHealth 等待 2-3 秒 → retry 成功

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| self-drive-prompt.md 不存在 | server.js 啟動不失敗，self-drive 功能跳過（log 警告） |
| server 遇到未捕捉 exception | 記錄錯誤到 /tmp/nova-server.log，不 crash |
| server 遇到 unhandledRejection | 記錄錯誤到 /tmp/nova-server.log，不 crash |
| pollHealth 3 秒內 server 仍未就緒 | 走 fallback（現有行為不變） |

### 邊界條件

- self-drive-prompt.md 檔案為空 → self-drive session 收到空 prompt，5 分鐘 timeout 後結束
- 多個 uncaughtException 連續觸發 → 每次都記錄，不累積 crash

## 資料模型

### 新增檔案

| 欄位 | 說明 |
|------|------|
| `~/.claude/data/self-drive-prompt.md` | 純 Markdown 文字，self-drive session 的 prompt 內容 |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `~/.claude/hooks/server.js` | 刪除 `SELF_DRIVE_PROMPT` 常數，改用 `readFileSync` 讀外部檔 + 加 process error handler |
| `~/.claude/hooks/hook-client.js` | `pollHealth` 改用指數退避，總等待時間增至 ~3 秒 |
| `~/.claude/scripts/error-analyzer.js` | `isSelfHealingError` 擴大涵蓋 `dispatch` phase |

## 介面契約

無新增 API。現有 `/dispatch`、`/health` 介面不變。

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | pollHealth 總等待從 1 秒 → 3.1 秒（可接受，僅 server 重啟時觸發） |
| 安全 | process error handler 不隱藏錯誤，只防 crash |
| 相容性 | N/A（nova 不做向後相容） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | `~/.claude/data/self-drive-prompt.md` | server.js 啟動時讀取 |
| 下游 | heartbeat loop | 使用讀取的 prompt 內容 |
| 下游 | error-analyzer.js | maintainer.js Phase 3c 呼叫 |

## 驗收標準

- [ ] `SELF_DRIVE_PROMPT` template literal 從 server.js 移除，改讀外部檔案
- [ ] server.js 有 `uncaughtException` 和 `unhandledRejection` handler
- [ ] `pollHealth` 總等待時間 >= 3 秒
- [ ] `isSelfHealingError('PreToolUse:Bash:dispatch')` 回傳 `true`
- [ ] `bun test` 全部通過
- [ ] self-drive-prompt.md 不存在時 server 仍能正常啟動

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| readFileSync 路徑錯誤導致 server 啟動失敗 | 低 | 高 | try-catch 包裹，失敗時 prompt = 空字串 + log 警告 |
| process error handler 吞掉致命錯誤 | 低 | 中 | handler 只記錄不吞（console.error），真正的語法錯誤仍在啟動時 crash |
| pollHealth 等太久影響首次 hook 延遲 | 低 | 低 | 僅 server 未啟動時觸發，一般 session 已在跑 |
