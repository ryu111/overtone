# Hook 錯誤處理統一 — 技術設計

## 技術摘要（What & Why）

- **方案**：建立 `hook-utils.js` 共用模組，提供 `safeReadStdin`、`safeRun`、`hookError` 三個函式，統一 6 個 hook scripts 的錯誤處理模式
- **理由**：目前 6 個 hook 各自實作 stdin 解析和錯誤處理，4 種方式混用（console.error / stderr.write / 靜默 / 變數），4/6 無 try/catch 保護 JSON.parse，任何 stdin 異常都會 crash
- **取捨**：只抽取「錯誤處理」共用邏輯，不觸碰各 hook 的業務邏輯；不引入新的 timeline 事件類型

## 關鍵技術決策

### 決策 1：safeRun 設計 — wrapper function vs process.on('uncaughtException')

- **選項 A**（選擇）：**wrapper function** — `safeRun(fn)` 包裹整個 hook 主邏輯
  - 優點：明確的控制流、可測試、不影響全域狀態、每個 hook 的退出行為清晰可見
  - 與現有 post-use.js 的 `main().catch()` 模式一致（已驗證可行）
- **選項 B**（未選）：`process.on('uncaughtException')` — 全域捕捉
  - 原因：全域 handler 難以決定「該輸出什麼 stdout」（不同 hook 的預設輸出格式不同）；且 Node.js 文件明確建議 uncaughtException 後應退出進程，不適合恢復執行

### 決策 2：post-use.js async 改為 sync

- **選項 A**（選擇）：**改為同步** readFileSync — 與其他 5 個 hook 保持一致
  - 優點：統一所有 hook 為同步 stdin 讀取（`safeReadStdin` 統一入口），降低複雜度
  - 風險分析：post-use.js 原本用 async stdin 是因為「管道輸入可能分多個 chunk」。但 Claude Code hook 的 stdin 是一次性 pipe（非持續 stream），readFileSync('/dev/stdin') 在所有其他 5 個 hook 中已驗證穩定。on-start.js 同樣讀 stdin 且完全同步，無問題
- **選項 B**（未選）：保持 async，safeReadStdin 提供 sync/async 雙版本
  - 原因：增加 API 複雜度，且 async 版本只有 post-use.js 一個使用者，不值得

### 決策 3：hookError 輸出目標 — stderr only

- **選項 A**（選擇）：**僅 stderr** — `process.stderr.write(msg)`
  - 優點：不干擾 stdout 的 JSON 輸出（Claude Code 只解析 stdout JSON）；stderr 會出現在 hook 日誌中供 debug；與 on-stop.js 已有的 `process.stderr.write` 模式一致
- **選項 B**（未選）：同時寫 stdout JSON + stderr
  - 原因：stdout 的 JSON 結構因 hook event 不同而異（result / additionalContext / hookSpecificOutput），錯誤訊息混入會增加複雜度

### 決策 4：safeReadStdin 的統一行為

- 所有 6 個 hook 統一使用 `safeReadStdin()`，回傳 `object`（解析成功）或 `{}`（解析失敗）
- on-start.js 的特殊性（已有 try/catch 並 fallback 到 `{}`）自然被 safeReadStdin 取代，行為完全一致
- safeReadStdin 內部呼叫 `hookError` 記錄 stderr 警告，但不 throw

### 決策 5：updateStateAtomic 失敗策略（pre-task.js）

- **方案**：在 safeRun 的頂層 catch 中處理。updateStateAtomic 本身已有 3 次重試 + fallback 強制寫入，極少失敗
- 若真的失敗（如 filesystem 權限問題），safeRun 的 catch 會 (1) hookError 記錄 stderr (2) 輸出空 result JSON (3) exit 0
- 不新增專門的 updateStateAtomic catch — 因為 state 寫入失敗不應阻擋 agent 委派（hook 的原則是「記錄失敗不影響主流程」）

## API 介面設計

### 模組位置

`plugins/overtone/scripts/lib/hook-utils.js`

### 函式簽名

```javascript
/**
 * 安全讀取 stdin JSON
 *
 * 同步讀取 /dev/stdin 並解析 JSON。
 * 失敗時記錄 stderr 警告並回傳空物件（不 throw）。
 *
 * @returns {object} 解析後的 JSON 物件，失敗時回傳 {}
 */
function safeReadStdin() {
  // 回傳型別：object
}

/**
 * 安全執行 hook 主邏輯
 *
 * 包裹 fn 執行，捕捉任何未預期的錯誤。
 * 錯誤時：(1) hookError 記錄 (2) 輸出 defaultOutput (3) exit 0
 *
 * @param {function} fn - hook 主邏輯函式（同步）
 * @param {object} defaultOutput - 錯誤時的 stdout JSON 回退值
 *   - 預設：{ result: '' }（適用大多數 hook）
 *   - on-submit.js 應傳 { additionalContext: '' }
 */
function safeRun(fn, defaultOutput = { result: '' }) {
  // 無回傳值，內部處理 exit
}

/**
 * 統一錯誤記錄（stderr）
 *
 * 格式：[overtone/{hookName}] {message}
 *
 * @param {string} hookName - hook 識別名稱（如 'on-start', 'pre-task'）
 * @param {string} message - 錯誤描述
 */
function hookError(hookName, message) {
  // 寫入 stderr
}
```

### 輸出型別

```javascript
// safeReadStdin 回傳
// 成功：stdin 的 JSON 物件（如 { session_id: "xxx", tool_input: {...} }）
// 失敗：{}

// safeRun 無回傳值
// 成功：fn() 正常執行，hook 自行決定 stdout 和 exit
// 失敗：stdout 寫入 defaultOutput JSON，exit 0

// hookError 無回傳值
// 副作用：process.stderr.write('[overtone/{hookName}] {message}\n')
```

### 錯誤處理

| 錯誤情況 | 行為 |
|---------|------|
| stdin 為空字串 | safeReadStdin 回傳 `{}`，hookError 記錄警告 |
| stdin 非 JSON | safeReadStdin 回傳 `{}`，hookError 記錄警告 |
| stdin 讀取失敗（ENOENT 等） | safeReadStdin 回傳 `{}`，hookError 記錄警告 |
| hook 主邏輯拋出例外 | safeRun catch → hookError + stdout defaultOutput + exit 0 |

## 資料模型

無新增資料模型。此變更不改變任何 state 結構。

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/lib/hook-utils.js  ← 新增：safeReadStdin + safeRun + hookError
  tests/unit/hook-utils.test.js               ← 新增：hook-utils 單元測試

修改的檔案：
  plugins/overtone/hooks/scripts/session/on-start.js   ← 修改：引入 safeReadStdin + safeRun
  plugins/overtone/hooks/scripts/prompt/on-submit.js   ← 修改：引入 safeReadStdin + safeRun
  plugins/overtone/hooks/scripts/tool/pre-task.js      ← 修改：引入 safeReadStdin + safeRun
  plugins/overtone/hooks/scripts/agent/on-stop.js      ← 修改：引入 safeReadStdin + safeRun
  plugins/overtone/hooks/scripts/tool/post-use.js      ← 修改：引入 safeReadStdin + safeRun，移除 async/readStdin
  plugins/overtone/hooks/scripts/session/on-stop.js    ← 修改：引入 safeReadStdin + safeRun
```

## 各 Hook 具體重構方案

### 1. on-start.js（SessionStart）

**現狀**：已有 stdin try/catch（第 24 行），但主邏輯無頂層保護。Dashboard spawn 有獨立 try/catch。
**改動**：
- 替換第 24 行的手動 try/catch 為 `safeReadStdin()`
- 整個主邏輯包入 `safeRun(fn)`
- 保留 Dashboard spawn 的獨立 try/catch（屬於業務邏輯層面的錯誤隔離）
- defaultOutput：`{ result: '' }`

### 2. on-submit.js（UserPromptSubmit）

**現狀**：第 18 行裸 `JSON.parse(readFileSync('/dev/stdin'))` — 無保護。
**改動**：
- 替換第 18 行為 `safeReadStdin()`
- 整個主邏輯包入 `safeRun(fn)`
- defaultOutput：`{ additionalContext: '' }`（注意：此 hook 使用 additionalContext 而非 result）

### 3. pre-task.js（PreToolUse/Task）

**現狀**：第 22 行裸 `JSON.parse` — 無保護。updateStateAtomic 無 try/catch。
**改動**：
- 替換第 22 行為 `safeReadStdin()`
- 整個主邏輯包入 `safeRun(fn)`
- defaultOutput：`{ result: '' }`（允許通過 = 不擋）

### 4. on-stop.js（SubagentStop）

**現狀**：第 24 行裸 `JSON.parse` — 無保護。有多個業務 try/catch（instinct、specs）。
**改動**：
- 替換第 24 行為 `safeReadStdin()`
- 整個主邏輯包入 `safeRun(fn)`
- 保留業務層的 try/catch（instinct emit、specs checkbox 更新）
- defaultOutput：`{ result: '' }`

### 5. post-use.js（PostToolUse）

**現狀**：唯一 async hook。已有頂層 `main().catch()`。自實作 readStdin (async)。
**改動**：
- 移除 async main、readStdin 函式
- 改為同步：`safeReadStdin()` + `safeRun(fn)`
- 移除 `if (require.main === module)` 區塊（改為直接在模組頂層 safeRun）
- 保留 module.exports 供測試使用（exportable functions 不變）
- defaultOutput：不需要（post-use.js 的 safeRun defaultOutput 為空 result，配合 exit 0）
- 移除多餘的 `process.exit(0)` 呼叫（safeRun 結尾自然 exit）

### 6. on-stop.js（Stop）

**現狀**：第 23 行裸 `JSON.parse` — 無保護。
**改動**：
- 替換第 23 行為 `safeReadStdin()`
- 整個主邏輯包入 `safeRun(fn)`
- defaultOutput：`{ result: '' }`（允許退出 = 不 block）

## 實作注意事項

### 給 developer 的提醒

1. **不改變業務邏輯**：只包裹、不重構內部流程。每個 hook 的 process.stdout.write + process.exit 模式保持不變
2. **safeRun 內的 process.exit**：hook 主邏輯中仍可自行呼叫 `process.exit(0)`。safeRun 只在「fn 拋出未預期錯誤」時才介入
3. **post-use.js 的 module.exports**：重構後仍需 export `detectWordingMismatch`、`WORDING_RULES`、`extractCommandTag`、`observeBashError`，供 wording.test.js 和 extract-command-tag.test.js 使用
4. **hookError 的 hookName**：使用固定字串（如 `'on-start'`、`'pre-task'`），不要動態推導
5. **測試方法**：hook-utils.js 的單元測試驗證 safeReadStdin（mock stdin）和 hookError（capture stderr）。各 hook 的整合測試（session-start.test.js 等）驗證「stdin 異常時 exit 0 且輸出合理 JSON」
6. **post-use.js 移除 async 後**：確認 `if (require.main === module)` 區塊的替代方案 — 改為在模組頂層直接呼叫 safeRun（與其他 5 個 hook 一致）
7. **不新增 process.on('unhandledRejection')**：所有 hook 都改為同步後，不存在 Promise rejection 的可能
