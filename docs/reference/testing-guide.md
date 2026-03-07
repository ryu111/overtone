# 測試架構指南（Testing Guide）

> 版本：v1.1（2026-03-03）
> 參考來源：測試架構決策、MEMORY.md 測試檔清單

---

## 1. 三層測試架構

Overtone 測試分為三層，分別對應不同的測試範疇與執行成本：

| 層級 | 目錄 | 說明 | 執行速度 |
|------|------|------|----------|
| **unit** | `tests/unit/` | 純函式測試，無任何副作用 | 最快 |
| **integration** | `tests/integration/` | 跨模組或含真實 I/O 的測試 | 中等 |
| **e2e** | `tests/e2e/` | 端對端流程驗證（Claude Code 環境） | 最慢 |

### 目前分類

- `tests/unit/`：51 個測試檔（純函式、guard 驗證、platform alignment）
- `tests/integration/`：38 個測試檔（含真實 I/O、hook subprocess、跨模組）
- `tests/e2e/`：10 個測試檔（端對端 workflow 流程驗證）

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

### 預期結果

4683 pass、0 fail（v0.28.83，196 個測試檔）。

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

詳見 `~/.claude/skills/testing/references/testing-conventions.md`。

---

## 7. 測試隔離（並行安全）

本專案使用 `bun scripts/test-parallel.js` 以 10 workers 並行執行所有測試。每個測試檔必須**完全隔離**：

| 資源 | 隔離方式 |
|------|---------|
| 檔案系統 | `mkdtempSync` 建立獨立 tmp 目錄，`afterEach` 清理 |
| 環境變數 | `beforeEach` 存 / `afterEach` 還原 `process.env` |
| 全域 store | `OVERTONE_TEST=1`（setup.js 已設定）阻止寫入 `~/.overtone/` |
| 模組快取 | 有狀態的 singleton 需在測試間重置 |

⛔ 不可寫入共享路徑（`~/.overtone/`、專案目錄內的非 tmp 路徑）。

詳細規範與程式碼範例見 `~/.claude/skills/testing/references/testing-conventions.md` §7。

---

## 8. 相關文件

| 文件 | 說明 |
|------|------|
| `tests/helpers/paths.js` | 路徑 Helper（SCRIPTS_LIB、HOOKS_DIR 等） |
| `tests/helpers/hook-runner.js` | Hook 執行 helper（runPreTask、runSubagentStop 等） |
| `tests/helpers/frontmatter.js` | Frontmatter 解析 helper |
| `bunfig.toml` | bun test 根目錄設定 |
| `~/.claude/skills/testing/references/testing-conventions.md` | tester agent 操作規範 |
| `~/.claude/skills/auto/references/test-scope-dispatch.md` | Main Agent 調度規則 |
