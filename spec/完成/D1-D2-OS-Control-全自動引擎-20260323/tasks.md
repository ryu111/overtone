# OS-Control 全自動引擎 — 實作任務

## Phase 依賴圖

```
Phase 1（sequential）: os-control-driver 核心
     │
Phase 2（sequential）: heartbeat 整合
     │
Phase 3（sequential）: 測試 + 驗收
```

所有 Phase 串行——每個 Phase 依賴前一個的產出。

---

## Phase 1：os-control-driver 核心（sequential）

建立獨立的 OS-control 操控模組，不修改任何現有檔案。

### T1.1：checkAvailability 實作

**執行者**：executor
**檔案**：`~/.claude/scripts/os-control-driver.js`（新增）
**說明**：
- 檢查 iTerm2 是否在執行（`pgrep -x iTerm2`）
- 檢查輔助使用權限（`osascript -e 'tell application "System Events" to keystroke ""'`）
- 回傳 `{ available: boolean, reason?: string }`
- 失敗原因明確：'iTerm2 未執行' / '輔助使用權限未授予' / 'AppleScript 執行失敗'

**驗收**：
- `bun test tests/unit/os-control-driver.test.js`（checkAvailability 測試通過）

### T1.2：findOrCreateSession 實作

**執行者**：executor
**檔案**：`~/.claude/scripts/os-control-driver.js`（繼續）
**說明**：
- 列舉 iTerm2 所有 tab，找名為 `nova-self-drive` 的 tab
- 找到 → 檢查 Claude CLI 是否在跑（text 末尾是否有 Claude prompt）→ 重用
- 找不到 → 建立新 tab → `write text "claude --name nova-self-drive [--model opus]"`
- 等待 Claude CLI 啟動完成（偵測 prompt 符號出現）
- 回傳 `{ tabIndex, isNew }`

**驗收**：
- 手動執行 `bun ~/.claude/scripts/os-control-driver.js test-session` 確認 tab 建立成功

### T1.3：writePrompt + waitForCompletion + readSessionText 實作

**執行者**：executor
**檔案**：`~/.claude/scripts/os-control-driver.js`（繼續）
**說明**：
- `writePrompt(tabIndex, prompt)`：
  - 使用 `write text` 送出 prompt（自帶 Enter）
  - 記錄送出時的 text 長度作為 baseline
- `waitForCompletion(tabIndex, opts)`：
  - 混合偵測：prompt 符號快速偵測 + 文字穩定度（3 次 x 3 秒）+ 超時
  - 回傳 `{ completed, text, timedOut }`
- `readSessionText(tabIndex, opts)`：
  - 讀取 iTerm2 session `text` 屬性
  - 只取最後 N 行（預設 200）

**驗收**：
- 完成偵測演算法的單元測試通過（mock text 變化序列）

### T1.4：healthCheck + 錯誤處理

**執行者**：executor
**檔案**：`~/.claude/scripts/os-control-driver.js`（繼續）
**說明**：
- `healthCheck(tabIndex)`：tab 是否存在、Claude CLI 是否在跑
- 所有 osascript 呼叫加 timeout（5 秒）
- 錯誤寫入 `/tmp/hook-errors.jsonl`
- 匯出 `runOsascript(script, timeout)` 共用封裝

**驗收**：
- `bun test tests/unit/os-control-driver.test.js`（全部測試通過）

---

## Phase 2：heartbeat 整合（sequential，依賴 Phase 1）

修改現有 heartbeat 模組，增加 OS-control 路徑。

### T2.1：heartbeat handler 分支邏輯

**執行者**：executor
**檔案**：`~/.claude/hooks/modules/heartbeat.js`（修改）、`~/.claude/config/heartbeat.json`（修改）
**說明**：
- handler 入口新增 OS-control 路徑選擇：
  1. `config.osControl?.enabled !== false` → 嘗試 OS-control
  2. `checkAvailability()` → 可用 → OS-control 路徑
  3. 不可用 → 降級到現有 `spawnSession()` 邏輯
- OS-control 路徑：
  1. `findOrCreateSession()` → 取得 tabIndex
  2. 組裝 prompt（現有 `buildSelfDrivePrompt()`）
  3. `writePrompt()` → `waitForCompletion()`
  4. 解析結果 → 更新 stats → emit('sd:done')
- heartbeat.json 新增 `osControl` 欄位（預設 `enabled: false`，安全上線）
- state 新增 `osControl` 欄位追蹤模式

**驗收**：
- heartbeat 整合測試通過
- `config.osControl.enabled = false` 時走現有 `claude -p` 路徑（不破壞現有行為）

### T2.2：多輪對話支援

**執行者**：executor
**檔案**：`~/.claude/hooks/modules/heartbeat.js`（修改）
**說明**：
- 支援 `config.osControl.maxRounds`（預設 1）
- 每輪完成後讀取回應，判斷是否需要下一輪：
  - 回應包含「繼續」「下一步」等信號 → 繼續
  - 回應包含「完成」「已完成」「push 完成」等信號 → 結束
  - 達到 maxRounds → 強制結束
- 每輪之間重組 prompt（如需要）

**驗收**：
- 單元測試：多輪偵測邏輯
- maxRounds = 1 時行為與 Phase 2.1 一致

---

## Phase 3：測試 + 驗收（sequential，依賴 Phase 2）

### T3.1：完整測試套件

**執行者**：executor
**檔案**：
- `~/projects/overtone/tests/unit/os-control-driver.test.js`（新增）
- `~/projects/overtone/tests/integration/heartbeat-oscontrol.test.js`（新增）
**說明**：
- 單元測試：
  - checkAvailability 各場景（iTerm2 在/不在、權限有/無）
  - 完成偵測演算法（mock text 序列：逐步增長 → 穩定 → 偵測完成）
  - 完成偵測超時
  - 多輪偵測信號解析
- 整合測試：
  - heartbeat handler OS-control 路徑選擇
  - 降級邏輯（mock checkAvailability 回傳 unavailable）
  - config 切換（enabled true/false）

**驗收**：
- `bun test` 全量通過（包含新增測試）
- 無破壞現有測試

### T3.2：端到端手動驗收

**執行者**：reviewer（Main 手動驗證）
**說明**：
1. 設定 `heartbeat.json` 的 `osControl.enabled: true`
2. 觸發 heartbeat tick（或等待自然觸發）
3. 確認全自動 tab 在 iTerm2 中建立
4. 確認 prompt 寫入並 Claude 開始回應
5. 確認完成偵測正確觸發
6. 關閉全自動 tab → 確認下次 tick 降級到 `claude -p`
7. 設定 `osControl.enabled: false` → 確認走現有路徑

**驗收**：
- 全部 7 步手動確認通過
