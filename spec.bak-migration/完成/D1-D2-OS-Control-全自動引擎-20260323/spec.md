# OS-Control 全自動引擎

## 動機（Why）

- **問題**：現有全自動機制透過 `claude -p` spawn 獨立的非互動 session，每次冷啟動無對話上下文、只能一次性 prompt、工具權限受 `--allowedTools` 白名單限制、與手動互動 session 體驗完全不同。每個 session 消耗大量 token 重建 context（CLAUDE.md + rules + skills 重新載入），且無法多輪決策。
- **目標**：用 OS-level 自動化（iTerm2 AppleScript）在一個**活的互動 CLI session** 中自動輸入 prompt 並送出，實現等同手動操作的全自動體驗——保持對話上下文、完整 hook 體驗、多輪決策能力。
- **不做的代價**：每次全自動 session 浪費 ~5000 tokens 重建 context；無法跨任務延續上下文（分析 A 的結論無法用於 B）；工具權限受限導致部分任務無法自動完成。

## 範圍

### In-scope

- iTerm2 AppleScript 操控引擎：建立/查找全自動 session、寫入 prompt、送出
- 完成偵測機制：偵測 Claude CLI 回應完成（回到輸入等待狀態）
- 輸出讀取：透過 iTerm2 `text` 屬性讀取 session 文字內容
- 熱鍵中斷：使用者隨時關閉 OS-control 全自動的機制
- 靜默降級：OS-control 不可用時 fallback 到現有 `claude -p` 方式
- 與現有 heartbeat 模組整合：在 `hb:tick` handler 中選擇執行模式

### Out-of-scope

- 非 iTerm2 終端支援（Terminal.app、Warp、Alacritty）
- 非 macOS 平台支援
- 全自動 session 的視覺化 UI（Dashboard 整合留後續迭代）
- 多個同時進行的全自動 session
- Claude CLI 本身的 API 變更

## 使用者故事

1. 身為 **Nova 系統**，我想要在活的 CLI session 中自動輸入任務 prompt，以便保持對話上下文並減少 token 浪費。
2. 身為**使用者**，我想要用熱鍵隨時中斷全自動，以便在需要時接管 session。
3. 身為**使用者**，我想要在 iTerm2 未開啟時，系統自動降級到 `claude -p` 模式，以便全自動不因環境問題停擺。

## 行為規格

### 正常路徑

1. heartbeat `hb:tick` 觸發 → 檢查 OS-control 可用性（iTerm2 是否在執行、輔助使用權限）
2. 可用 → 查找或建立專用全自動 tab/session（名為 `nova-self-drive`）
3. 組裝 prompt → 透過 `write text` 寫入 session
4. 輪詢 session `text` 屬性，等待回應完成（偵測 prompt 符號回到末尾）
5. 讀取回應文字 → 解析結果（成功/失敗/需下一輪）
6. 如需下一輪 → 回到步驟 3（最多 N 輪）
7. 完成 → 回報結果給 heartbeat → 重新啟動計時器

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| iTerm2 未執行 | 降級到 `claude -p`，log 警告 |
| 輔助使用權限未授予 | 降級到 `claude -p`，log 錯誤 |
| AppleScript 執行失敗 | 降級到 `claude -p`，記錄錯誤到 hook-errors.jsonl |
| 完成偵測超時（10 分鐘） | 等待 Claude 自然結束或強制中斷 session |
| 全自動 session tab 被使用者關閉 | 下次 tick 重新建立 |
| Claude CLI 在全自動 session 中 crash | 偵測到 shell prompt（非 Claude prompt），重新啟動 claude |

### 邊界條件

- 空 prompt → 不送出，跳過本次 tick
- 使用者同時在另一個 tab 手動操作 Claude → OS-control 只操控自己的 tab，不干擾
- nova-server 重啟期間 → 計時器丟失，等 server 重建後恢復

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| prompt | string | 是 | 要輸入的 prompt 文字 |
| maxRounds | number | 否 | 最多多輪對話次數（預設 1） |
| timeout | number | 否 | 單輪超時 ms（預設 600000） |

### 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| mode | string | 'os-control' 或 'claude-p' |
| rounds | number | 實際執行的輪數 |
| success | boolean | 是否成功完成 |
| output | string | 最後一輪的輸出摘要 |
| error | string? | 錯誤訊息（如有） |

### 儲存

- 格式：無新增持久化儲存（使用現有 heartbeat state）
- 位置：heartbeat module state 中新增 `osControl` 欄位

## 介面契約

```javascript
// os-control-driver.js 匯出介面
export async function checkAvailability(): Promise<{ available: boolean, reason?: string }>
export async function findOrCreateSession(name: string): Promise<{ tabIndex: number, sessionId: string }>
export async function writePrompt(tabIndex: number, prompt: string): Promise<void>
export async function waitForCompletion(tabIndex: number, opts: { timeout: number, pollInterval: number }): Promise<{ completed: boolean, text: string }>
export async function readSessionText(tabIndex: number): Promise<string>
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 完成偵測輪詢間隔 2-5 秒，不造成 CPU 負擔 |
| 安全 | 全自動 session 走標準 hook 流程（guards、injector），不比現有 heartbeat 更危險 |
| 可靠性 | OS-control 失敗 100% 降級到 `claude -p`，不阻斷全自動 |
| 相容性 | iTerm2 3.5+（當前 3.6.6） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | iTerm2 AppleScript API | `write text`、`text` 屬性、tab 管理 |
| 上游 | heartbeat.js | 定時觸發機制，提供 `hb:tick` 事件 |
| 上游 | session-spawner.js | 降級 fallback 用 |
| 下游 | heartbeat.js | 消費 os-control-driver 的結果 |

## 驗收標準

- [ ] `checkAvailability()` 在 iTerm2 執行中回傳 `{ available: true }`
- [ ] `checkAvailability()` 在 iTerm2 未執行時回傳 `{ available: false, reason: '...' }`
- [ ] `findOrCreateSession()` 建立名為 `nova-self-drive` 的 tab
- [ ] `writePrompt()` 成功在全自動 tab 中輸入文字並送出
- [ ] `waitForCompletion()` 正確偵測 Claude CLI 回應完成
- [ ] heartbeat handler 在 OS-control 不可用時自動降級到 `claude -p`
- [ ] 使用者關閉全自動 tab 後，下次 tick 自動重建
- [ ] `bun test` 全量通過

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 完成偵測不穩定（Claude CLI 輸出格式變動） | 中 | 高 | 多重偵測策略：prompt 符號 + 文字長度穩定 + 超時兜底 |
| iTerm2 AppleScript API 行為在版本間不一致 | 低 | 中 | 鎖定 iTerm2 3.5+ 版本，version gate |
| 輔助使用權限靜默失敗 | 中 | 高 | 啟動時主動驗證權限，失敗直接降級不重試 |
| 多個 Nova 實例同時操控同一 tab | 低 | 高 | lockfile + tab 名稱唯一性檢查 |
| 大量文字寫入 iTerm2 buffer 造成記憶體壓力 | 低 | 中 | 定期清理 scrollback；只讀取最後 N 行 |
