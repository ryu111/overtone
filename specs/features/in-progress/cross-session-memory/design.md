# Design：cross-session-memory

## 技術摘要（What & Why）

- **方案**：新建 `global-instinct.js` 模組，提供全域層獨立 API，透過 JSONL append-only 儲存（沿用與 `instinct.js` 相同機制）。
- **理由**：全域層的去重合併邏輯（同 tag+type 取 max confidence）與 session 層的 append-only 更新語意不同；分離保持單一職責，`instinct.js` 完全不受影響。
- **取捨**：兩個模組有部分相似的 `_readAll` / `_writeAll` / `_append` 模式，接受小幅重複以換取關注點分離；如未來 session 和全域的行為分歧加大，分離架構更易維護。

### Open Questions 決策

**Q1：graduate() 是否順帶執行 decayGlobal()**
選擇：**graduate() 執行時一併執行 decayGlobal()**。理由：畢業時清理舊觀察是一個自然的時機點（SessionEnd 本來就是維護性操作），比在 SessionStart 執行更合適——SessionStart 應盡快完成以減少延遲，而 SessionEnd 是做清理的好時機。decayGlobal() 對所有超過 7 天未更新的全域觀察施加 -0.02（無信心門檻條件），不影響畢業邏輯的正確性。

**Q2：SessionStart 注入 systemMessage 格式**
選擇：**純文字條列**。理由：Main Agent 直接閱讀純文字更自然，不需要額外解析步驟。參考 `buildPendingTasksMessage` 的現有格式（純文字 Markdown 條列），保持一致性。

**Q3：全域 store 不存在時**
選擇：**靜默跳過**，不建立空檔。理由：符合 YAGNI 原則，空檔沒有實際用途。`_readAll()` 已有 `existsSync` 檢查，讀取不存在的檔案回傳空陣列。`_append()` 會自動 `mkdirSync` 建立目錄，首次寫入時自動建立。

---

## API 介面設計

### global-instinct.js — 函式

```javascript
// 畢業：將 sessionId 中 confidence >= graduationThreshold 的觀察升至該專案的全域 store
// 同 tag+type 已存在則取 max(confidence) merge；執行後自動觸發 decayGlobal()
// @param {string} sessionId
// @param {string} projectRoot - 專案根目錄，用於計算 projectHash 隔離
// @returns {{ graduated: number, merged: number, decayed: number, pruned: number }}
graduate(sessionId, projectRoot)

// 查詢指定專案的全域觀察
// @param {string} projectRoot - 專案根目錄
// @param {object} filter
// @param {string} [filter.type]
// @param {string} [filter.tag]
// @param {number} [filter.minConfidence]
// @param {number} [filter.limit]          - 若指定 limit，先按 confidence 降序排列再截取
// @returns {object[]}
queryGlobal(projectRoot, filter = {})

// 取得指定專案的全域觀察統計摘要
// @param {string} projectRoot - 專案根目錄
// @returns {{ total: number, applicable: number, byType: object, byTag: object }}
summarizeGlobal(projectRoot)

// 週衰減：對指定專案的全域觀察中超過 7 天未更新的施加 -0.02，並自動 prune
// @param {string} projectRoot - 專案根目錄
// @returns {{ decayed: number, pruned: number }}
decayGlobal(projectRoot)

// 刪除指定專案全域觀察中信心低於 autoDeleteThreshold 的觀察
// @param {string} projectRoot - 專案根目錄
// @returns {number} 刪除數量
pruneGlobal(projectRoot)
```

### paths.js — 新增路徑

```javascript
// 全域目錄
const GLOBAL_DIR = join(OVERTONE_HOME, 'global');

// projectHash：從 projectRoot 算出穩定 hash（8 字元 hex）
// 用途：不同專案的全域 store 隔離
function projectHash(projectRoot) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
}

// 全域路徑物件（所有函式都需要 projectRoot 參數）
const global = {
  dir:          (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot)),
  observations: (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'observations.jsonl'),
};
```

### registry.js — 新增設定

```javascript
// 全域 Instinct 設定（globalInstinctDefaults）
const globalInstinctDefaults = {
  graduationThreshold: 0.7,   // 畢業門檻（沿用 autoApplyThreshold 語意）
  loadTopN: 50,               // SessionStart 載入筆數上限
};
```

### SessionEnd hook 變更

```
// 在 runCleanup 之前新增步驟
// 3b. 全域畢業（graduate）
try {
  const globalInstinct = require('../../../scripts/lib/global-instinct');
  const result = globalInstinct.graduate(sessionId);
  if (result.graduated > 0 || result.merged > 0) {
    process.stderr.write(
      `[overtone/on-session-end] 知識畢業：${result.graduated} 新增，${result.merged} 合併\n`
    );
  }
} catch (err) {
  hookError('on-session-end', `global-instinct.graduate 失敗：${err.message || String(err)}`);
}
```

### SessionStart hook 變更

```
// 在 buildPendingTasksMessage 之後，output 組裝之前新增
// 全域觀察載入（appended to systemMessage）
const globalObservationsMsg = buildGlobalObservationsMessage();
...
if (globalObservationsMsg && output.systemMessage) {
  output.systemMessage += '\n\n' + globalObservationsMsg;
} else if (globalObservationsMsg) {
  output.systemMessage = globalObservationsMsg;
}
```

---

## 資料模型

### 全域觀察記錄（與 session 層格式完全相同）

```javascript
// ~/.overtone/global/observations.jsonl 每行：
{
  id: string,          // 'inst_{base36ts}_{rand4}' — 保留 session 層的 id，畢業時不重新生成
  ts: string,          // ISO 8601，初始建立時間（保留 session 層原值）
  lastSeen: string,    // ISO 8601，最後更新時間
  type: string,        // user_corrections | error_resolutions | repeated_workflows | tool_preferences
  trigger: string,     // 觸發條件描述
  action: string,      // 建議行動描述
  tag: string,         // 分類標籤（kebab-case）
  confidence: number,  // [0, 1]，小數後 4 位
  count: number,       // 觀察到的次數
  // 畢業時新增欄位：
  globalTs: string,    // ISO 8601，首次畢業進入全域的時間
}
```

儲存位置：`~/.overtone/global/observations.jsonl`
格式：JSONL append-only（同 session 層）
去重鍵：`tag + type`（同 tag+type 視為同一條知識）

### merge 語意（graduate 去重）

```
同 tag+type 已存在於全域：
  - confidence = max(global.confidence, session.confidence)
  - count = global.count + session.count
  - lastSeen = newer of (global.lastSeen, session.lastSeen)
  - trigger / action = 取 confidence 較高方的值（若相等取 session 方，代表最新版本）
  - globalTs = 保留原有值（不更新）
  - 以 append-only 更新（_readAll 自動合併）

同 tag+type 不存在於全域（新畢業）：
  - 完整複製 session 觀察
  - 新增 globalTs = now.toISOString()
```

---

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/lib/global-instinct.js    ← 新增：全域 Instinct 模組
  tests/unit/global-instinct.test.js                 ← 新增：global-instinct.js 單元測試
  tests/integration/cross-session-memory.test.js     ← 新增：畢業 + 載入端對端整合測試

修改的檔案：
  plugins/overtone/scripts/lib/paths.js              ← 修改：新增 GLOBAL_DIR + global 路徑物件
  plugins/overtone/scripts/lib/registry.js           ← 修改：新增 globalInstinctDefaults + module.exports
  plugins/overtone/hooks/scripts/session/on-session-end.js  ← 修改：步驟 3b 畢業機制
  plugins/overtone/hooks/scripts/session/on-start.js        ← 修改：載入全域觀察注入 systemMessage
```

---

## 關鍵技術決策

### 決策 1：graduate 時是否執行 decayGlobal

- **選項 A（選擇）**：graduate() 執行時一併執行 decayGlobal() — 優點：清理和新增在同一個 SessionEnd 時機完成，SessionStart 無額外開銷
- **選項 B（未選）**：decay 在 SessionStart 執行 — 原因：SessionStart 應盡量快速，避免增加啟動延遲；且 SessionEnd 做清理更符合生命週期語意

### 決策 2：systemMessage 格式

- **選項 A（選擇）**：純文字 Markdown 條列 — 優點：與 `buildPendingTasksMessage` 一致，Main Agent 直接閱讀，無需解析
- **選項 B（未選）**：結構化 JSON — 原因：Main Agent 是語言模型，純文字是天然格式；JSON 增加不必要的解析步驟

### 決策 3：全域 store 不存在時

- **選項 A（選擇）**：靜默跳過，首次 _append 時自動建立 — 優點：YAGNI，零副作用，與 session 層完全一致
- **選項 B（未選）**：主動初始化空檔 — 原因：空檔無實際用途，浪費 I/O

### 決策 4：全域觀察的 id 策略

- **選項 A（選擇）**：保留 session 層原有 id — 優點：可追溯到原始 session 觀察，merge 時以 tag+type 為去重鍵（不以 id），避免不同 session 的同知識產生不同 id
- **選項 B（未選）**：重新生成 global id — 原因：增加複雜度，且 id 追溯性降低

---

## 實作注意事項

給 developer 的提醒：

1. **global-instinct.js 不引用 instinct.js**：兩個模組各自獨立，重複的低層工具（_readAll / _writeAll / _append / _clamp）直接在 global-instinct.js 內部實作。
2. **_readAll 的路徑差異**：session 層用 `paths.session.observations(sessionId)`，全域層用 `paths.global.observations()`（無參數）。
3. **graduate() 的 try/catch 隔離**：畢業失敗不能阻擋 SessionEnd 的其他清理步驟，必須在 try/catch 包裹中執行。
4. **queryGlobal 的排序**：當 filter.limit 存在時，必須先按 confidence 降序排列再截取，確保 top-N 是最高信心的觀察。
5. **systemMessage 組合**：SessionStart 的 `systemMessage` 可能已由 `buildPendingTasksMessage` 填入，新增全域觀察時需 append 而非覆蓋。
6. **JSONL auto-compaction**：全域層的 _readAll 沿用相同邏輯（行數 > 唯一數 * 2 時重寫），保持與 session 層行為一致。
7. **atomicWrite 用於 _writeAll**：與 instinct.js 一致，使用 `atomicWrite` 避免 race condition。
8. **globalInstinctDefaults 匯出**：需更新 `registry.js` 的 `module.exports` 加入 `globalInstinctDefaults`。
