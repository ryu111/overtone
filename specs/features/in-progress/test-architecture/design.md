# Design: test-architecture

> 測試架構遷移 + Test Scope 動態調度

## 技術摘要（What & Why）

- **方案**：將 `plugins/overtone/tests/` 的 13 個測試遷移至專案根目錄 `tests/unit/` 和 `tests/integration/`，並在 developer Handoff 中引入 `### Test Scope` 標記，讓 Main Agent 據此自動調度 tester/e2e-runner/qa
- **理由**：測試放在 plugin 目錄內導致路徑耦合，且缺乏 unit/integration 分層。遷移後的三層結構讓各 agent 有明確職責邊界，未來新增 E2E 測試也有標準位置
- **取捨**：遷移過程中 `require()` 路徑都需修改，但透過 `tests/helpers/paths.js` 統一管理可一次解決

## 關鍵技術決策

### 決策 1：require 路徑策略 — 統一 helper

- **選項 A**（選擇）：建立 `tests/helpers/paths.js` 匯出所有常用路徑常數 — 優點：(1) 單一修改點，遷移後若 plugin 目錄結構變動只改一處 (2) 測試檔乾淨，不需要每個檔案都寫冗長相對路徑 (3) 語意明確（`PLUGIN_ROOT` 比 `../../plugins/overtone` 更易讀）
- **選項 B**（未選）：直接用相對路徑 `../../plugins/overtone/scripts/lib/...` — 原因：每個測試檔都重複冗長路徑，日後重構 plugin 位置時要改 13+ 個檔案

### 決策 2：bunfig.toml 與 test 指令 — 根目錄為主入口

- **選項 A**（選擇）：根目錄新增 `bunfig.toml`，`[test]` 指向 `tests/`；`plugins/overtone/package.json` 的 `test` 指令改為 `bun test ../../tests` — 優點：單一跑法 `bun test`（從根目錄），plugin 的 npm test 也能跑（向後相容）
- **選項 B**（未選）：完全移除 plugin 的 test 指令 — 原因：保留雙入口不增加維護負擔，卻增加靈活性

### 決策 3：`__dirname` 參照修正 — 透過 helper 統一

- **選項 A**（選擇）：`tests/helpers/paths.js` 匯出 `HOOKS_DIR`、`SCRIPTS_DIR` 等常數，測試檔用 `join(HOOKS_DIR, 'session/on-stop.js')` — 優點：路徑計算邏輯集中一處，與決策 1 一致
- **選項 B**（未選）：每個檔案各自用 `join(__dirname, '...')` 算路徑 — 原因：深度改變後容易算錯，且重複代碼多

### 決策 4：utils.test.js 分類 — 保持 integration

- **選項 A**（選擇）：`utils.test.js` 整檔放在 `tests/integration/` — 優點：atomicWrite 確實做了真實 I/O（mkdirSync、writeFileSync、readFileSync），即使 escapeHtml 是純函式，整檔有 I/O 操作就歸 integration，避免過度拆分
- **選項 B**（未選）：拆為 `tests/unit/escape-html.test.js` + `tests/integration/atomic-write.test.js` — 原因：增加檔案數但收益低，escapeHtml 測試只有 5 個 case，不值得獨立檔案

## 檔案結構

```
最終目錄結構：

tests/                                    ← 新增：專案根目錄測試
├── helpers/
│   └── paths.js                          ← 新增：統一路徑常數
├── unit/
│   ├── identify-agent.test.js            ← 遷移自 plugins/overtone/tests/
│   └── parse-result.test.js              ← 遷移自 plugins/overtone/tests/
├── integration/
│   ├── utils.test.js                     ← 遷移自 plugins/overtone/tests/
│   ├── state.test.js                     ← 遷移自 plugins/overtone/tests/
│   ├── loop.test.js                      ← 遷移自 plugins/overtone/tests/
│   ├── instinct.test.js                  ← 遷移自 plugins/overtone/tests/
│   ├── timeline.test.js                  ← 遷移自 plugins/overtone/tests/
│   ├── specs.test.js                     ← 遷移自 plugins/overtone/tests/
│   ├── wording.test.js                   ← 遷移自 plugins/overtone/tests/
│   ├── session-stop.test.js              ← 遷移自 plugins/overtone/tests/
│   ├── on-submit.test.js                 ← 遷移自 plugins/overtone/tests/
│   ├── agent-on-stop.test.js             ← 遷移自 plugins/overtone/tests/
│   └── server.test.js                    ← 遷移自 plugins/overtone/tests/
└── e2e/                                  ← 新增：空目錄 + .gitkeep（未來用）

修改的檔案：
  bunfig.toml                             ← 新增：Bun test 配置
  plugins/overtone/package.json           ← 修改：test 指令改指向根目錄
  plugins/overtone/agents/developer.md    ← 修改：加入 Test Scope 區塊
  plugins/overtone/agents/tester.md       ← 修改：加入測試路徑慣例
  plugins/overtone/agents/e2e-runner.md   ← 修改：加入測試路徑慣例
  plugins/overtone/agents/qa.md           ← 修改：加入測試路徑慣例
  plugins/overtone/skills/auto/SKILL.md   ← 修改：加入 Test Scope 調度說明
  plugins/overtone/skills/test/SKILL.md   ← 修改：加入測試路徑慣例
  CLAUDE.md                               ← 修改：更新目錄結構和測試指令
  docs/status.md                          ← 修改：同步版本狀態

刪除的檔案：
  plugins/overtone/tests/                 ← 刪除：整個舊測試目錄

新增的規範文件：
  docs/reference/testing-guide.md                                   ← 新增：完整測試指南
  plugins/overtone/skills/test/references/testing-conventions.md    ← 新增：測試慣例
  plugins/overtone/skills/auto/references/test-scope-dispatch.md   ← 新增：Test Scope 調度規範
```

## API 介面設計

### `tests/helpers/paths.js` — 匯出常數

```javascript
// tests/helpers/paths.js
'use strict';
const { join } = require('path');

// 專案根目錄（tests/helpers/ 上兩層）
const PROJECT_ROOT = join(__dirname, '..', '..');

// Plugin 根目錄
const PLUGIN_ROOT = join(PROJECT_ROOT, 'plugins', 'overtone');

// 常用子目錄
const SCRIPTS_LIB = join(PLUGIN_ROOT, 'scripts', 'lib');
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts');
const HOOKS_DIR = join(PLUGIN_ROOT, 'hooks', 'scripts');

module.exports = {
  PROJECT_ROOT,
  PLUGIN_ROOT,
  SCRIPTS_LIB,
  SCRIPTS_DIR,
  HOOKS_DIR,
};
```

### 使用範例 — 遷移後的 `tests/integration/state.test.js`

```javascript
// 舊：const state = require('../scripts/lib/state');
// 新：
const { SCRIPTS_LIB } = require('../helpers/paths');
const state = require(join(SCRIPTS_LIB, 'state'));
```

### 使用範例 — 遷移後的 `tests/integration/session-stop.test.js`

```javascript
// 舊：const HOOK_PATH = join(__dirname, '../hooks/scripts/session/on-stop.js');
// 新：
const { HOOKS_DIR } = require('../helpers/paths');
const HOOK_PATH = join(HOOKS_DIR, 'session', 'on-stop.js');
```

## Test Scope 格式規範

### 在 developer Handoff 中的 `### Test Scope` 區塊

```markdown
### Test Scope

| Scope | 標記 | 說明 |
|-------|------|------|
| unit | ✅ | 新增 utils 純函式測試 |
| integration | ✅ | state.test.js 需新增 2 個 case |
| e2e | -- | 無 UI 變更 |
| qa | -- | 無行為變更 |
```

### 標記定義

| 標記 | 意義 | Main Agent 動作 |
|------|------|----------------|
| ✅ | 需要測試 | 委派對應 agent |
| ⚠️ | 建議但非必要 | 由 Main Agent 判斷是否委派 |
| -- | 不需要 | 跳過 |

### 調度映射

| Scope | Agent | Stage | 測試位置 |
|-------|-------|-------|---------|
| unit | tester | TEST:verify | `tests/unit/` |
| integration | tester | TEST:verify | `tests/integration/` |
| e2e | e2e-runner | E2E | `tests/e2e/` |
| qa | qa | QA | 行為驗證（不寫測試碼） |

### 調度規則

1. developer Handoff 必須包含 `### Test Scope` 區塊（verify 模式時）
2. Main Agent 讀取 Test Scope，只委派標記為 ✅ 或 ⚠️ 的 agent
3. 同一 stage 內的多個 scope（如 unit + integration）由同一個 tester agent 一次處理
4. e2e 和 qa 在各自的 stage 獨立執行（只出現在 full/secure workflow）

## bunfig.toml 配置

```toml
[test]
root = "./tests"
```

## 資料模型

本次不涉及新的資料模型。Test Scope 是 Handoff 文件格式的擴展，不儲存到磁碟。

## 實作注意事項

給 developer 的提醒：

- Unit 測試（`identify-agent.test.js`、`parse-result.test.js`）不使用 `tests/helpers/paths.js` 的 I/O 路徑，因為它們是純函式測試。但仍需要 `require(join(SCRIPTS_LIB, 'registry'))` 等 import，所以也使用 helper
- `specs.test.js` 中的 CLI 腳本路徑 `path.join(__dirname, '../scripts')` 需改為 `SCRIPTS_DIR`
- `wording.test.js` 中的 `require('../hooks/scripts/tool/post-use')` 需改為 `require(join(HOOKS_DIR, 'tool', 'post-use'))`
- `server.test.js` 中的 `join(__dirname, '..', 'scripts', 'server.js')` 需改為 `join(SCRIPTS_DIR, 'server.js')`
- `agent-on-stop.test.js` 中有 `require('../scripts/lib/registry')` 需改用 helper
- 遷移完成後刪除 `plugins/overtone/tests/` 整個目錄
- 規範文件（Phase 1）需在測試遷移（Phase 2）之前完成，因為 Phase 2 的 developer 需要參照慣例
