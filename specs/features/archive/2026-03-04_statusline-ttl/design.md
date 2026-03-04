# Design: statusline-ttl

> feature: statusline-ttl
> status: in-progress
> created: 2026-03-04

## 技術摘要（What & Why）

- **方案**：在 `read()` 內加入 mtime 過期檢查，`idle === true` 且超過 TTL 時回傳 `null`
- **理由**：修改範圍最小（單一函式），不改變 `write()`/`update()` 的行為，向下相容既有呼叫端
- **取捨**：只在 `read()` 時才判斷過期（惰性判斷），不主動刪除檔案；接受過期檔案繼續存在磁碟，但不影響顯示結果

## API 介面設計

### 現有函式簽名（不變）

```javascript
// read(sessionId) — 回傳 statusline 狀態，若過期或不存在回傳 null
function read(sessionId)
// => { activeAgents: string[], workflowType: string|null, idle: boolean } | null
```

### TTL 常數（模組頂層新增）

```javascript
const TTL_MS = 10 * 60 * 1000; // 10 分鐘（毫秒）
```

### 修改後的 read() 邏輯

```javascript
function read(sessionId) {
  if (!sessionId) return null;
  try {
    const path = statePath(sessionId);
    const state = JSON.parse(readFileSync(path, 'utf8'));
    // TTL 檢查：只在 idle=true 時套用（保護長時間執行的 agent）
    const { mtimeMs } = statSync(path);
    if ((Date.now() - mtimeMs) > TTL_MS && state.idle === true) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}
```

### 錯誤處理

| 錯誤情況 | 行為 |
|---------|------|
| 檔案不存在 | catch → `null`（既有行為不變） |
| JSON 解析失敗 | catch → `null`（既有行為不變） |
| `statSync` 失敗 | catch → `null`（整個 try/catch 覆蓋，靜默） |
| `idle === false` 且超過 TTL | 回傳 state（保護 active agent） |

## 資料模型

```javascript
// statusline-state.json — 無變更
{
  activeAgents: string[],   // 目前執行中的 stage key 列表
  workflowType: string|null, // workflow 類型
  idle: boolean             // true = Main 等待輸入，false = 有工作進行中
}
```

儲存位置：`~/.overtone/sessions/{sessionId}/statusline-state.json`
格式：JSON（無變更）

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/statusline-state.js  ← 修改：新增 TTL_MS 常數 + read() TTL 邏輯

新增/修改的測試：
  tests/unit/statusline-ttl.test.js  ← 新增：TTL scenarios describe 區塊（TTL-1 / TTL-2 / TTL-3）
```

## 關鍵技術決策

### 決策 1：測試策略（mtime 操控方式）

- **選項 A（選擇）：`utimesSync`** — 寫入檔案後直接修改 mtime 為過去時間
  - 優點：不改動被測模組 API，測試真實的 fs.statSync 行為，Node.js/Bun 標準支援
  - 測試範例：`utimesSync(path, oldDate, oldDate)` 將 mtime 設為 11 分鐘前
- **選項 B（未選）：`_nowFn` 注入點** — 暴露可覆寫的 now 函式
  - 原因：改動了公開 API 介面（即使是私有慣例前綴），過度設計；`utimesSync` 已足夠簡單

### 決策 2：TTL 常數位置

- **選項 A（選擇）：`statusline-state.js` 頂層** — 模組自足，不引入外部依賴
  - 優點：修改範圍最小，不污染 registry.js（registry 只放 agent/stage/workflow 映射）
- **選項 B（未選）：`registry.js`** — 集中管理
  - 原因：TTL 是 statusline-state 模組的內部實作細節，非跨模組共用常數；引入 registry 依賴反而耦合

## 實作注意事項

給 developer 的提醒：

- `statSync` 已在 `statusline.js` 中引入（用於讀取 transcript 檔案大小），但 `statusline-state.js` 的 `require('fs')` 目前只解構了 `readFileSync, writeFileSync, mkdirSync`，需補充 `statSync`
- `statSync(path)` 呼叫必須在 `readFileSync(path)` 之後，確保檔案存在（路徑相同，catch 覆蓋兩者）；或先 statSync 再 readFileSync 亦可，因同一個 catch 覆蓋
- TTL 檢查邏輯：`idle === false` 時必須**跳過** TTL（不回傳 null），保護正在執行中的 agent 不因長時間工作超過 10 分鐘而被誤判過期
- 測試中用 `utimesSync` 設定 mtime 時，atime 和 mtime 要一起設（`utimesSync(path, oldDate, oldDate)`）；`oldDate` 用 `new Date(Date.now() - 11 * 60 * 1000)` 模擬 11 分鐘前
- 現有 `statusline-state.test.js` 的 `read()` 測試（Scenario 5、6）不需修改，TTL 新情境加在 `statusline-ttl.test.js` 的新 describe 區塊
