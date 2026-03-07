# Design: fs-scanner — 共用 FS 掃描工具模組

## 背景

health-check.js 與 dead-code-scanner.js 都有獨立實作的 `collectJsFiles`、`collectMdFiles`、`safeRead`，
邏輯相同但有細微差異（node_modules 過濾位置）。本次將這三個工具函式抽取至
`scripts/lib/fs-scanner.js`，加入 module 層級 lazy cache，統一行為。

## 技術方案

### 選擇方案：新增獨立模組（非 utils.js 擴充）

理由：
- `utils.js` 已有其職責（`formatSize` 等通用工具），FS 掃描邏輯是另一個關注點
- `analyzers/` 目錄下有 `dead-code-scanner.js`，其工具函式應提升至 `lib/` 層，不是 `analyzers/` 自身
- 獨立模組讓 `clearCache()` 的作用域明確，不污染 utils

### Cache 策略：Module 層級 Map + `clearCache()` API

```
// 選擇理由：
// - health-check.js 是 CLI 工具（每次執行獨立進程），module 層級 Map 天然有效
// - 但測試中會多次呼叫 runAllChecks()，需要 clearCache() 重置
// - 比 LRU / TTL 實作更簡單，滿足當前需求
```

### node_modules 過濾：統一為遞迴層過濾

理由：
- dead-code-scanner 版本在遞迴層跳過整個 `node_modules/` 目錄（效能佳，不進入子目錄）
- health-check 版本在呼叫端 `.filter(f => !f.includes('/node_modules/'))`（進入後再過濾）
- 遞迴層過濾不僅效能較好，語意更清楚（「不掃描 node_modules」vs「掃描後再丟棄」）

---

## API 介面

### `scripts/lib/fs-scanner.js`

```javascript
// ── 類型定義 ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FsScannerOptions
 * @property {boolean} [useCache=true]  - 是否使用 module 層級 cache（預設 true）
 */

// ── 公開 API ──────────────────────────────────────────────────────────────

/**
 * 遞迴收集目錄下所有 .js 檔案（排除 node_modules）
 * 結果依 dir 參數 cache 於 module 層級 Map
 *
 * @param {string} dir
 * @param {FsScannerOptions} [opts]
 * @returns {string[]}  - 絕對路徑清單
 */
function collectJsFiles(dir, opts = {}) { ... }

/**
 * 遞迴收集目錄下所有 .md 檔案（排除 node_modules）
 * 結果依 dir 參數 cache 於 module 層級 Map
 *
 * @param {string} dir
 * @param {FsScannerOptions} [opts]
 * @returns {string[]}  - 絕對路徑清單
 */
function collectMdFiles(dir, opts = {}) { ... }

/**
 * 讀取檔案內容，失敗回傳空字串
 *
 * @param {string} filePath
 * @returns {string}
 */
function safeRead(filePath) { ... }

/**
 * 清除所有 cache（測試用 / 強制重新掃描用）
 * @returns {void}
 */
function clearCache() { ... }

// module.exports = { collectJsFiles, collectMdFiles, safeRead, clearCache }
```

### Cache 內部結構

```javascript
// module 層級（不 export）
const _jsCache = new Map();  // dir -> string[]
const _mdCache = new Map();  // dir -> string[]
```

`useCache: false` 時繞過讀取與寫入，直接遞迴（用於需要即時結果的場景）。

---

## 資料模型 / Schema

此模組無持久化資料，輸入輸出均為記憶體中的字串陣列。

---

## 改造方案

### health-check.js 改造（最小侵入）

**目標**：移除自有的 `collectJsFiles`、`collectMdFiles`、`safeRead` 定義，改 require fs-scanner。

改動點：
1. 頂部新增：`const { collectJsFiles, collectMdFiles, safeRead } = require('./lib/fs-scanner');`
2. 刪除 L79-95（`collectJsFiles` 定義）
3. 刪除 L102-108（`safeRead` 定義）
4. 刪除 L365-381（`collectMdFiles` 定義）
5. `module.exports` 的 `collectJsFiles`、`collectMdFiles` 改為 re-export from fs-scanner（現有測試依賴這兩個 export）

**呼叫端 node_modules filter 處理**：
- 目前 health-check.js 在呼叫端 `.filter(f => !f.includes('/node_modules/'))` 的位置，
  改用 fs-scanner 後遞迴層已自動排除，呼叫端的 filter 可直接移除。
- 例外：部分呼叫端還有額外 filter（如排除 health-check.js 自身、排除 `'health-check.js'`），
  這些業務邏輯 filter 保留，只移除 node_modules 部分。

### dead-code-scanner.js 改造（re-export + 刪除自有實作）

**目標**：用一行 re-export 取代自有的 `safeRead` 和 `collectJsFiles`，向後相容現有測試。

```javascript
// 改造後
const { safeRead, collectJsFiles } = require('../fs-scanner');

// module.exports 保持現有 shape（collectJsFiles 仍然 export，測試可繼續使用）
module.exports = {
  scanUnusedExports,
  scanOrphanFiles,
  runDeadCodeScan,
  parseExportKeys,
  isExportUsed,
  isModuleRequired,
  collectJsFiles,  // re-export from fs-scanner
};
```

---

## 檔案結構

| 操作 | 路徑 | 說明 |
|------|------|------|
| 新增 | `plugins/overtone/scripts/lib/fs-scanner.js` | 共用 FS 掃描模組（主要產出） |
| 修改 | `plugins/overtone/scripts/health-check.js` | 移除重複實作，改 require fs-scanner |
| 修改 | `plugins/overtone/scripts/lib/analyzers/dead-code-scanner.js` | 移除重複實作，re-export from fs-scanner |
| 新增 | `tests/unit/fs-scanner.test.js` | fs-scanner 單元測試 |

---

## 狀態同步策略

本功能為純後端工具模組，無前端或跨元件狀態同步需求。
fs-scanner 的 module 層級 cache 僅存活於單一進程內，不涉及跨進程狀態。

---

## Edge Cases

1. **cache 污染（測試隔離）** — 狀態組合風險
   - 場景：health-check.test.js 多次呼叫 `runAllChecks()`，第一次掃描到的假檔案被 cache，
     第二次（不同沙盒目錄）拿到舊結果
   - 對策：測試的 `beforeEach` 呼叫 `clearCache()`；或傳入 `useCache: false`

2. **dead-code-scanner re-export 與 health-check dead export 偵測衝突** — 語意陷阱
   - 場景：health-check.js 的 `checkDeadExports` 偵測 lib 模組的 unused exports；
     dead-code-scanner 現在 re-export `collectJsFiles` from fs-scanner，
     health-check 必須能偵測到 fs-scanner 的 `collectJsFiles` 被使用
   - 對策：dead-code-scanner 的 module.exports 保留 `collectJsFiles`（re-export），
     health-check 的 checkDeadExports 掃描 `scripts/lib/` 下所有 .js，
     fs-scanner.js 的 exports 會被 health-check.js 的 require 覆蓋為「有引用」

3. **呼叫端 node_modules filter 殘留** — 資料邊界風險
   - 場景：移除 health-check.js 呼叫端的 node_modules filter 後，
     若 fs-scanner 遞迴層過濾有 bug，node_modules 內的大量檔案會進入掃描
   - 對策：fs-scanner 測試需明確驗證 node_modules 目錄被跳過（不進入遞迴）

4. **`collectMdFiles` cache key 衝突（同 dir 不同時機）** — 並行競爭
   - 場景：health-check 同次執行中多個 check 函式都呼叫 `collectMdFiles(DOCS_DIR)`，
     第一次結果被 cache，後續直接返回 — 這是預期行為，但若第一次呼叫在檔案系統
     初始化前（如測試 setup 未完成），cache 會存入空陣列
   - 對策：測試確保 `clearCache()` 在 sandbox 建立後、第一次呼叫前執行
