# OS-Control 全自動引擎 — 技術設計

## 深度路由：D2
**理由**：跨模組整合（heartbeat + 新 os-control-driver + session-spawner fallback），設計決策密度中等（3 個主要決策：完成偵測策略、session 管理方式、降級機制），但不涉及安全架構變更。

---

## 技術摘要

- **方案**：iTerm2 AppleScript 原生 API 操控互動 Claude CLI session
- **理由**：iTerm2 有完整 scripting dictionary（`write text`、`text` 屬性、tab 管理），不需 UI scripting；本機已驗證 AppleScript 權限可用
- **取捨**：僅支援 iTerm2 + macOS，非跨平台方案；接受此限制因為 Nova 只跑在開發者的 Mac 上

## 方案比較

### 決策 1：Session 操控方式

| 維度 | 方案 A：iTerm2 AppleScript（選擇） | 方案 B：tmux send-keys | 方案 C：expect/pty |
|------|:----------------------------------:|:---------------------:|:-----------------:|
| 複雜度 | 低（原生 API） | 中（需 tmux session 管理） | 高（pty 管理複雜） |
| 輸出讀取 | `text` 屬性直讀 | `tmux capture-pane` | pty 串流讀取 |
| 完成偵測 | 輪詢 text 穩定度 | 輪詢 pane 內容 | 即時串流比對 |
| 視覺化 | 使用者可在 iTerm2 直接看到 | 需 attach tmux 才能看 | 無 UI |
| 使用者中斷 | 切到 tab 直接打字 | 需 tmux attach | 不可能 |
| 環境依賴 | iTerm2 + 輔助使用權限 | tmux（已安裝） | 無 |
| **結論** | **選擇**：使用者體驗最佳，中斷最自然 | 備選：跨平台潛力 | 放棄：複雜度太高 |

### 決策 2：完成偵測策略

| 維度 | 方案 A：文字穩定度（選擇） | 方案 B：Prompt 符號偵測 | 方案 C：檔案 marker |
|------|:------------------------:|:---------------------:|:-----------------:|
| 原理 | 輪詢 text，連續 N 次無變化 = 完成 | 偵測末尾出現 `>` 或 `❯` prompt | Claude 完成時寫入 /tmp marker |
| 可靠度 | 高（不依賴特定輸出格式） | 中（Claude CLI 格式可能變） | 高（顯式信號） |
| 延遲 | N * pollInterval（3-10 秒） | 即時偵測 | 即時偵測 |
| 侵入性 | 無 | 無 | 需修改 Claude hook |
| **結論** | **選擇**：混合策略，text 穩定度為主 + prompt 符號為輔助快速偵測 | 輔助手段 | 不做：侵入 hook |

### 決策 3：Session 生命週期

| 維度 | 方案 A：持久 Tab（選擇） | 方案 B：每次新 Tab |
|------|:----------------------:|:----------------:|
| Context 保持 | 多輪保持完整上下文 | 每次冷啟動 |
| 資源佔用 | 1 個常駐 tab | 無常駐 |
| 管理複雜度 | 需要健康檢查 | 簡單 |
| Token 節省 | 大量（context 複用） | 無 |
| **結論** | **選擇**：核心優勢就是 context 複用 | 與 `claude -p` 無差異 |

## 架構圖

```
                     ┌──────────────────────────────────────────┐
                     │              heartbeat.js                │
                     │         subscribe: ['hb:tick']           │
                     │                                          │
                     │  handler(event, ctx)                     │
                     │    │                                     │
                     │    ├─ osDriver.checkAvailability()       │
                     │    │    ├─ available ─────────────────┐  │
                     │    │    └─ unavailable ─── fallback ──┼──┤
                     │    │                                  │  │
                     └────┼──────────────────────────────────┼──┘
                          │                                  │
              ┌───────────▼──────────────┐     ┌─────────────▼──────────┐
              │   os-control-driver.js   │     │  session-spawner.js    │
              │                          │     │  (現有 claude -p)       │
              │  checkAvailability()     │     │  spawnSession(prompt)  │
              │  findOrCreateSession()   │     └────────────────────────┘
              │  writePrompt()           │
              │  waitForCompletion()     │
              │  readSessionText()       │
              └───────────┬──────────────┘
                          │
                ┌─────────▼─────────┐
                │   iTerm2 Process   │
                │                    │
                │  Tab: nova-drive   │
                │  ┌──────────────┐  │
                │  │ Claude CLI   │  │
                │  │ (interactive)│  │
                │  └──────────────┘  │
                └────────────────────┘
```

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | os-control-driver.js | `~/.claude/scripts/` | ~180 | OS-control 操控核心：AppleScript 封裝 |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | heartbeat.js | handler 入口增加 OS-control 路徑選擇邏輯 |
| 2 | heartbeat.json | 新增 `osControl` 設定欄位（`enabled`、`maxRounds`） |

### API 設計

```javascript
// ~/.claude/scripts/os-control-driver.js

/**
 * 檢查 OS-control 是否可用
 * 驗證：iTerm2 執行中 + 輔助使用權限
 */
export async function checkAvailability() {
  // 1. pgrep iTerm2
  // 2. osascript 權限測試
  // return { available: boolean, reason?: string }
}

/**
 * 查找或建立全自動 session tab
 * 如果名為 'nova-self-drive' 的 tab 已存在且 Claude CLI 在跑 → 重用
 * 否則建立新 tab → 啟動 claude（互動模式）
 */
export async function findOrCreateSession(opts = {}) {
  // opts: { cwd, name, model }
  // return { tabIndex: number, isNew: boolean }
}

/**
 * 在指定 tab 寫入 prompt 並送出
 * 使用 iTerm2 `write text` 送出（自帶 newline = Enter）
 */
export async function writePrompt(tabIndex, prompt) {
  // 多行 prompt → 逐行 write text without newline，最後一行 write text（帶 newline）
  // 注意：Claude CLI 接受多行輸入，但 Enter 送出
}

/**
 * 等待 Claude CLI 回應完成
 * 混合策略：
 * 1. 快速偵測：末尾出現 prompt 符號（`>` 後跟空白）
 * 2. 穩定偵測：連續 3 次輪詢（每 3 秒）text 長度不變
 * 3. 超時兜底：timeout ms 後強制返回
 */
export async function waitForCompletion(tabIndex, opts = {}) {
  // opts: { timeout: 600000, pollInterval: 3000, stableCount: 3 }
  // return { completed: boolean, text: string, timedOut: boolean }
}

/**
 * 讀取指定 tab 的 session 文字（最後 N 行）
 * 使用 iTerm2 `text` 屬性
 */
export async function readSessionText(tabIndex, opts = {}) {
  // opts: { lastNLines: 200 }
  // return string
}

/**
 * 健康檢查：全自動 tab 是否仍存活、Claude CLI 是否在跑
 */
export async function healthCheck(tabIndex) {
  // return { alive: boolean, claudeRunning: boolean }
}
```

## 資料模型

- 儲存格式：heartbeat module state（記憶體內）
- 新增欄位：

```javascript
{
  osControl: {
    available: boolean,      // 上次檢查結果
    tabIndex: number | null, // 全自動 tab 索引
    rounds: number,          // 本次 tick 執行的輪數
    lastMode: 'os-control' | 'claude-p' | null,
  }
}
```

- heartbeat.json 新增欄位：

```json
{
  "osControl": {
    "enabled": true,
    "maxRounds": 3,
    "sessionName": "nova-self-drive",
    "model": "opus"
  }
}
```

## 完成偵測演算法

```
初始化：
  beforeText = readSessionText()
  stableCount = 0

輪詢迴圈（每 pollInterval ms）：
  currentText = readSessionText()

  // 快速偵測：找 Claude CLI prompt 符號
  if (currentText 末尾匹配 /\n> \s*$/ 或 /\n❯\s*$/) {
    return { completed: true, text: extractResponse(beforeText, currentText) }
  }

  // 穩定偵測：文字長度不變
  if (currentText.length === lastText.length) {
    stableCount++
    if (stableCount >= 3) {
      return { completed: true, text: extractResponse(beforeText, currentText) }
    }
  } else {
    stableCount = 0
  }

  lastText = currentText

  // 超時
  if (elapsed > timeout) {
    return { completed: false, timedOut: true, text: currentText }
  }
```

## 熱鍵中斷機制

不新增熱鍵。使用者自然中斷方式：

1. **切到全自動 tab 手動打字**：Claude CLI 收到使用者輸入，OS-control 的下次 `readSessionText()` 會偵測到非預期的文字變化，標記 `interrupted`
2. **關閉全自動 tab**：下次 `healthCheck()` 回報 `alive: false`，heartbeat 自動降級
3. **修改 heartbeat.json 設定 `osControl.enabled: false`**：下次 tick 讀取 config 時跳過 OS-control

## 降級邏輯

```
heartbeat handler 入口：
  config = loadConfig()

  if (config.osControl?.enabled !== false) {
    availability = await checkAvailability()
    if (availability.available) {
      → OS-control 路徑
      return
    }
    log('[heartbeat] OS-control 不可用:', availability.reason, '降級到 claude -p')
  }

  → 現有 claude -p 路徑（session-spawner.js）
```

## 與現有系統整合點

| 整合點 | 方式 | 說明 |
|--------|------|------|
| heartbeat.js handler | 入口分支 | 新增 OS-control 路徑，現有邏輯不動 |
| heartbeat.json | 新增欄位 | `osControl` 物件，向後相容（不存在時 = 禁用） |
| session-spawner.js | 無修改 | 作為 fallback 路徑繼續使用 |
| hook-errors.jsonl | 寫入 | OS-control 錯誤記錄 |
| flow-observer.js | 無修改 | OS-control 觸發的 Claude session 自然產生 hook 事件 |

## 資料流

```
hb:tick
  │
  ▼
heartbeat.handler()
  │
  ├─ loadConfig() → osControl.enabled?
  │    │
  │    ├─ true → checkAvailability()
  │    │           ├─ available → findOrCreateSession()
  │    │           │                 │
  │    │           │                 ▼
  │    │           │              writePrompt(prompt)
  │    │           │                 │
  │    │           │                 ▼
  │    │           │              waitForCompletion()  ◄──┐
  │    │           │                 │                    │
  │    │           │                 ├─ completed         │
  │    │           │                 │   ├─ needMore? ────┘ (maxRounds)
  │    │           │                 │   └─ done → emit('sd:done')
  │    │           │                 │
  │    │           │                 └─ timeout → emit('sd:done', {timeout: true})
  │    │           │
  │    │           └─ unavailable ──┐
  │    │                            │
  │    └─ false ────────────────────┤
  │                                 │
  │                                 ▼
  │                          spawnSession(prompt) [現有邏輯]
  │                                 │
  │                                 ▼
  │                          await outcome → emit('sd:done')
  │
  ▼
ctx.timer('hb:tick', interval)
```

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 完成偵測誤判（Claude 還在輸出就以為完成了） | 中 | 高 | stableCount 設 3（9 秒穩定期）+ prompt 符號雙重確認 |
| 2 | iTerm2 `text` 屬性回傳空或亂碼 | 低 | 高 | 加 retry + 空值檢測 + 降級 |
| 3 | 多行 prompt 輸入被 Claude CLI 提前處理 | 中 | 中 | 單行 prompt 為主；多行用 `write text without newline` 逐行送 |
| 4 | 使用者意外切到全自動 tab 打字導致上下文混亂 | 中 | 中 | `readSessionText()` 偵測非預期輸入，標記 interrupted，下次 tick 重建 session |
| 5 | Claude CLI 版本升級改變 prompt 符號格式 | 低 | 中 | 文字穩定度為主要偵測手段，不依賴特定符號 |

**Pre-mortem 結論**：無「高機率 + 高影響」的無防護情境。方案可行。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/unit/os-control-driver.test.js` | checkAvailability 邏輯（mock osascript 呼叫）、完成偵測演算法（mock text 變化序列）、降級邏輯 |
| `tests/integration/heartbeat-oscontrol.test.js` | heartbeat handler 路徑選擇（OS-control vs claude-p fallback） |

## 不做什麼

1. **不做跨終端支援**：只支援 iTerm2，不支援 Terminal.app / Warp。原因：iTerm2 有最完整的 AppleScript API，且是使用者唯一使用的終端。
2. **不做自動安裝/設定輔助使用權限**：權限需使用者手動授予，OS-control 只檢查和降級。原因：安全考量 + macOS 不允許程式自動授權。
3. **不做 session 內容持久化**：不保存全自動 session 的對話歷史到檔案。原因：Claude CLI 本身已有 session 持久化（`--resume`），不重複實作。
4. **不做 Dashboard 整合**：全自動 tab 的即時狀態不顯示在 Dashboard 上。原因：留後續迭代，先確保核心功能穩定。
