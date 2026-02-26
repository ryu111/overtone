# 測試架構指南（Testing Guide）

> 版本：v1.0（2026-02-27）
> 參考來源：test-architecture BDD spec（specs/features/in-progress/test-architecture/bdd.md）、architect 決策

---

## 1. 三層測試架構

Overtone 測試分為三層，分別對應不同的測試範疇與執行成本：

| 層級 | 目錄 | 說明 | 執行速度 |
|------|------|------|----------|
| **unit** | `tests/unit/` | 純函式測試，無任何副作用 | 最快 |
| **integration** | `tests/integration/` | 跨模組或含真實 I/O 的測試 | 中等 |
| **e2e** | `tests/e2e/` | 端對端流程驗證（Claude Code 環境） | 最慢 |

### 目前分類

- `tests/unit/`：2 個測試檔（純函式，如 `identify-agent.test.js`、`parse-result.test.js`）
- `tests/integration/`：11 個測試檔（含真實 I/O 或跨模組，如 `session-stop.test.js`、`server.test.js`）
- `tests/e2e/`：佔位目錄（暫無測試，`.gitkeep` 保留版本控制）

---

## 2. Unit vs Integration 判斷規則

**決策依據**：有無真實副作用（I/O）

| 判斷條件 | 分類 |
|----------|------|
| 只測試函式輸入輸出，無任何 I/O | `unit` |
| 讀寫真實檔案系統（fs、tmp dir） | `integration` |
| 發出網路請求（HTTP、WebSocket） | `integration` |
| 啟動子程序（spawn、exec） | `integration` |
| 跨模組呼叫（require 多個 lib） | `integration`（視情況） |
| 使用 mock/stub 模擬 I/O | `unit`（若完全隔離） |

**原則**：「有疑問就歸 integration」。Integration 成本略高但不會誤判純粹性。

---

## 3. 測試命名規範

### 檔案命名

- 使用**英文**、kebab-case
- 格式：`{module-name}.test.js`
- 範例：`registry.test.js`、`session-stop.test.js`、`specs.test.js`

### describe / it 內文

- 可使用**繁體中文**描述行為
- 技術術語（函式名稱、參數名稱）保持英文
- 範例：

```javascript
describe('registry.js', () => {
  it('應該包含所有 15 個 agent 定義', () => { ... });
  it('getAgent("developer") 回傳正確的 model', () => { ... });
});
```

---

## 4. bun test 雙入口

### 入口一：專案根目錄（主要入口）

```bash
# 在 /Users/sbu/projects/overtone/ 執行
bun test
```

`bunfig.toml` 設定 `[test] root = "./tests"` 讓 bun 掃描 `tests/` 下所有 `.test.js`。

### 入口二：Plugin 目錄（CI 相容入口）

```bash
# 在 /Users/sbu/projects/overtone/plugins/overtone/ 執行
bun test
```

`package.json` 的 test script 應設定為 `bun test ../../tests`，確保指向同一套測試。

### 預期結果

兩個入口應產出完全一致的結果：293 pass、0 fail（遷移完成後）。

---

## 5. qa Agent 的輸出規則

**qa agent 沒有程式碼產出**。

qa 執行行為驗證（functional/regression），產出為純文字報告，不寫測試程式碼：

- 報告位置：`specs/features/in-progress/{featureName}/qa-handoff.md`
- 格式：Markdown，包含測試場景清單、通過/失敗狀態、發現的問題
- 不建立 `.test.js` 檔案
- 不修改任何現有測試

---

## 6. paths.js 路徑 Helper

所有測試檔應透過 `tests/helpers/paths.js` 取得路徑，**禁止在測試檔中寫死路徑**：

```javascript
const { SCRIPTS_LIB, HOOKS_DIR } = require('../helpers/paths.js');
const registry = require(path.join(SCRIPTS_LIB, 'registry.js'));
```

詳見 `plugins/overtone/skills/test/references/testing-conventions.md`。

---

## 7. 相關文件

| 文件 | 說明 |
|------|------|
| `specs/features/in-progress/test-architecture/bdd.md` | 行為規格（Source of Truth） |
| `tests/helpers/paths.js` | 路徑 Helper |
| `bunfig.toml` | bun test 根目錄設定 |
| `plugins/overtone/skills/test/references/testing-conventions.md` | tester agent 操作規範 |
| `plugins/overtone/skills/auto/references/test-scope-dispatch.md` | Main Agent 調度規則 |
