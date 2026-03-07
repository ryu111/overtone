# Design: 測試路徑適配（global-migrate-test-adapt）

## 技術方案

### 核心決策：paths.js PLUGIN_ROOT 設計

選用**選項 B（環境變數 + homedir fallback）**：

```
PLUGIN_ROOT = process.env.OVERTONE_PLUGIN_ROOT || join(os.homedir(), '.claude')
```

理由：
- CI 環境可設定 `OVERTONE_PLUGIN_ROOT` 指向任意路徑，無需真實安裝到 `~/.claude/`
- 本地開發預設指向 `~/.claude/`，與全域遷移目標一致
- 不加 `existsSync` fallback — fallback 到 `plugins/overtone/` 會掩蓋路徑錯誤，違背「治本不治標」原則
- 環境變數名稱選 `OVERTONE_PLUGIN_ROOT`（與專案前綴一致，避免與 Claude CLI 自身變數衝突）

### 統一策略：全改為 paths.js 模式

所有直接硬編碼 `plugins/overtone` 的測試檔，統一改為透過 paths.js 常數引用。
不允許混用模式，理由：
- 單一 source of truth — 日後路徑再變動只改 paths.js
- 混用模式會讓 grep 掃描「還有多少 hardcode」失準

**例外**：`skill-generalizer.test.js` 中 `plugins/overtone/` 字串是**測試資料**（用於驗證 generalizer 移除路徑的行為），不是模組引用路徑，不修改。

### paths.js 需新增的常數

目前 paths.js：
- `PROJECT_ROOT`、`PLUGIN_ROOT`、`SCRIPTS_LIB`、`SCRIPTS_DIR`、`HOOKS_DIR`

確認**不需要**新增常數，現有常數已覆蓋所有引用模式：
- A 類（scripts/lib）→ `SCRIPTS_LIB`
- B 類（knowledge/ 子目錄）→ `SCRIPTS_LIB`（join 拼接子路徑）
- C 類（hooks/scripts）→ `HOOKS_DIR`

## API 介面（型別定義）

paths.js 匯出介面維持不變：

```js
// tests/helpers/paths.js exports
{
  PROJECT_ROOT: string,  // 專案根目錄，保持相對計算（__dirname 往上兩層）
  PLUGIN_ROOT: string,   // ~/.claude/（或 OVERTONE_PLUGIN_ROOT env）
  SCRIPTS_LIB: string,   // PLUGIN_ROOT/scripts/lib
  SCRIPTS_DIR: string,   // PLUGIN_ROOT/scripts
  HOOKS_DIR: string,     // PLUGIN_ROOT/hooks/scripts
}
```

匯出介面不變，消費端（147 個間接引用檔）自動生效。

## 資料模型

無新資料模型。此功能純屬路徑常數的變更。

## 檔案結構

### 修改的檔案

| 檔案 | 變更說明 |
|------|----------|
| `tests/helpers/paths.js` | PLUGIN_ROOT 改為 env var + homedir，其餘常數依賴 PLUGIN_ROOT 自動更新 |
| `tests/unit/*.test.js`（39 個） | `require('../../plugins/overtone/scripts/lib/xxx')` → `require(join(SCRIPTS_LIB, 'xxx'))` |
| `tests/unit/knowledge/auto-forge-trigger.test.js` | `../../../plugins/overtone/scripts/lib/...` → `join(SCRIPTS_LIB, 'knowledge/...')` |
| `tests/unit/knowledge/skill-evaluator.test.js` | 同上 |
| `tests/unit/knowledge/skill-generalizer.test.js` | 只改 require 引用（第 13 行），不改測試資料中的字串 |
| `tests/unit/hook-pure-fns.test.js` | `HOOKS_ROOT = path.resolve(...)` → `const { HOOKS_DIR: HOOKS_ROOT } = require('../helpers/paths')` |
| `tests/unit/extract-command-tag.test.js` | `require('../../plugins/overtone/hooks/scripts/tool/post-use')` → `require(join(HOOKS_DIR, 'tool/post-use'))` |
| `tests/unit/paths.test.js` | `require('../../plugins/overtone/scripts/lib/paths')` → `require(join(SCRIPTS_LIB, 'paths'))` |

### 不修改的檔案

- `tests/unit/hook-pure-fns.test.js` 第 494-514 行：`checkProtected` 的呼叫入參 `/path/to/plugins/overtone` 是假路徑字串（測試資料），不修改
- `tests/unit/knowledge/skill-generalizer.test.js` 所有 `plugins/overtone/` 字串：皆為測試資料

## 狀態同步策略

N/A — 純測試路徑修改，不涉及前後端狀態。

## Dev Phases

### Phase 1: 更新 paths.js (sequential)
- [ ] T1：更新 `tests/helpers/paths.js` — PLUGIN_ROOT 改為 `process.env.OVERTONE_PLUGIN_ROOT || join(homedir(), '.claude')`，引入 `const { homedir } = require('os')` | files: `tests/helpers/paths.js`

### Phase 2: 修復直接硬編碼 (parallel)
- [ ] T2：修復 unit/ 下 39 個 A 類 scripts/lib 引用 — 在頂部加 `{ SCRIPTS_LIB } = require('../helpers/paths')`，替換所有 `require('../../plugins/overtone/scripts/lib/xxx')` | files: `tests/unit/*.test.js`（排除 knowledge/、hook-pure-fns、extract-command-tag、paths.test.js）
- [ ] T3：修復 knowledge/ 子目錄 3 個 B 類引用 — `../../helpers/paths` 路徑引入 SCRIPTS_LIB，替換 `../../../plugins/overtone/scripts/lib/...` | files: `tests/unit/knowledge/auto-forge-trigger.test.js`, `skill-evaluator.test.js`, `skill-generalizer.test.js`
- [ ] T4：修復 C 類 hooks 路徑 + paths.test.js — hook-pure-fns 改用 HOOKS_DIR；extract-command-tag 改用 join(HOOKS_DIR)；paths.test.js 改用 join(SCRIPTS_LIB) | files: `tests/unit/hook-pure-fns.test.js`, `tests/unit/extract-command-tag.test.js`, `tests/unit/paths.test.js`

### Phase 3: 驗證 (sequential)
- [ ] T5：執行 `bun scripts/test-parallel.js`，確認全數通過（4670+ pass，無 Cannot find module） | files: 無

## Edge Cases to Handle

- **skill-generalizer.test.js 測試資料誤改** — 語意陷阱：第 18-31 行、73-74 行、193-194 行的 `plugins/overtone/` 是 generalizer 被測行為的輸入字串，不是 require 路徑；開發者批次替換時若用全域 sed 會誤改這些字串，破壞測試語意
- **hook-pure-fns.test.js 假路徑誤改** — 語意陷阱：checkProtected 測試的入參 `/path/to/plugins/overtone` 是假路徑（函式邏輯測試用），不是真實路徑引用；不應修改
- **OVERTONE_PLUGIN_ROOT 在 CI 未設定** — 資料邊界：CI 環境若未設定環境變數且 `~/.claude/` 不存在，require() 會 throw MODULE_NOT_FOUND；CI pipeline 需確保設定環境變數或預先安裝 plugin
- **paths.test.js 測試 scripts/lib/paths.js（生產模組）** — 語意陷阱：`tests/unit/paths.test.js` 同時引用 `helpers/paths`（測試 helper）和 `scripts/lib/paths`（生產 paths 模組）；只改 scripts/lib/paths 的 require，不改 helper 的 require
