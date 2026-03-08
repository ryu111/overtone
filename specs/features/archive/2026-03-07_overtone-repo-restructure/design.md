# Design: overtone-repo-restructure

## 技術摘要

刪除 `plugins/overtone/` 冗餘副本，讓 `~/.claude/` 成為唯一 SoT。核心挑戰在於：
1. `docs-sync.test.js` 用目錄掃描計數，需切換為從 `~/.claude/` 統計（含容忍差異設計）
2. `plugin.json` 版本號需要遷移到 `~/.claude/plugin.json`，供 `session-start-handler.js` 讀取
3. `session-spawner.js` 的 `DEFAULT_PLUGIN_DIR` 需改指向 `~/.claude/`
4. 所有測試的硬編碼路徑需改用 `paths.js` 的 `PLUGIN_ROOT`/`SCRIPTS_DIR` 常數

---

## 架構決策

### 決策 1：docs-sync.test.js SOURCE_PLUGIN_ROOT 策略 → 選項 E（改用 PLUGIN_ROOT + 白名單容忍）

**選擇**：改統計 `~/.claude/`（`PLUGIN_ROOT`），不引入新的 manifest 檔案，但同時在測試邏輯中標注「允許 PLUGIN_ROOT 包含使用者個人化元件」的設計意圖。

**理由**：
- 選項 C（新增 `overtone-manifest.json`）引入新的第三個 SoT，與「registry.js 是 SoT」原則矛盾，且需要額外的維護機制保持 manifest 與實際元件同步。
- 選項 D/E（從 registry.js 讀）：`stages`/`workflows` 已在 registry.js，但 `agents`/`skills`/`commands`/`hooks` 的數量目前 registry.js 並沒有定義這些數字，需要額外改造 registry.js（超出本次範圍）。
- 選項 A（改統計 `~/.claude/`）是最直接的方案：`~/.claude/` 就是實際運作的安裝位置，測試驗證的是「已安裝的元件數量是否與文件一致」，這才是真正有意義的驗證。使用者個人化新增的元件極少（且此 repo 的 `~/.claude/` 等同 source），差異可接受。

**實作影響**：
- `docs-sync.test.js`：`SOURCE_PLUGIN_ROOT` 改為 `PLUGIN_ROOT`（`~/.claude/`），同時更新注釋說明
- `docs-sync-engine.js`（位於 `~/.claude/scripts/lib/analyzers/`）：`PLUGIN_ROOT` 路徑計算邏輯需從 `join(__dirname, '..', '..', '..')` 改為直接使用 `join(homedir(), '.claude')`（因為全域安裝後 `__dirname` 是 `~/.claude/scripts/lib/analyzers/`，向上三層是 `~/.claude/`，路徑仍正確，不需更動）

### 決策 2：plugin.json 版本號 → 移入 `~/.claude/plugin.json`

**選擇**：在 `~/.claude/` 根目錄建立 `plugin.json`（只含 `version` 和 `name`，不含 `agents` 陣列），同時刪除 `plugins/overtone/.claude-plugin/plugin.json`。

**理由**：
- `session-start-handler.js` 的 `_pluginJsonPaths` 邏輯已支援：`path.resolve(__dirname, '../../plugin.json')` — 當 `__dirname` 是 `~/.claude/scripts/lib/` 時，這解析為 `~/.claude/plugin.json`，完全符合。
- `docs-sync.test.js` 第 5 節的版本一致性測試改讀 `~/.claude/plugin.json`。
- `config-io.js`、`config-api.js`、`component-repair.js` 等模組都是以 `pluginRoot` 為參數計算 `.claude-plugin/plugin.json` 路徑，測試中使用 temp dir，不依賴真實 repo 路徑，不受影響。

**新的 `~/.claude/plugin.json` 結構**：
```json
{
  "name": "ot",
  "version": "0.28.83"
}
```

注意：`agents` 陣列（原 `.claude-plugin/plugin.json` 中的）不需要保留，因為全域安裝後 Claude Code 是從 `~/.claude/agents/` 目錄直接讀取，不依賴 `plugin.json` 的 `agents` 欄位。

### 決策 3：session-spawner.js DEFAULT_PLUGIN_DIR → 改指向 `~/.claude/`

**選擇**：`DEFAULT_PLUGIN_DIR` 從 `path.resolve(__dirname, '..', '..')` 改為 `path.join(require('os').homedir(), '.claude')`。

**理由**：
- 原本 `DEFAULT_PLUGIN_DIR = path.resolve(__dirname, '..', '..')` 在 `plugins/overtone/scripts/lib/session-spawner.js` 中解析為 `plugins/overtone/`，刪除後失效。
- 全域安裝後 `~/.claude/` 就是正確的 plugin dir，hardcode 為 `homedir() + '/.claude'` 比繼續用相對路徑更明確。
- `session-spawner.test.js` 第 78-79 行 `expect(pluginDirValue).toContain('plugins/overtone')` 需改為 `toContain('.claude')`。

**對 `~/.claude/scripts/lib/session-spawner.js` 的影響**：
- 因為全域安裝版本的 `__dirname` 就是 `~/.claude/scripts/lib/`，向上兩層是 `~/.claude/`，路徑已正確 — 全域版本不需修改。
- 只需修改 `plugins/overtone/scripts/lib/session-spawner.js`，但刪除 `plugins/overtone/` 後此檔案就不存在了，所以核心是修改 `~/.claude/scripts/lib/session-spawner.js` 使其在 overtone repo 的測試環境下也能正確找到 plugin dir。

等等，這裡有個微妙點：`plugins/overtone/scripts/lib/session-spawner.js` 是 source，`~/.claude/scripts/lib/session-spawner.js` 是 copy。刪除 source 後，`~/.claude/` copy 的 `__dirname` 就是 `~/.claude/scripts/lib/`，向上兩層確實是 `~/.claude/`，路徑正確。測試直接 require `~/.claude/scripts/lib/session-spawner.js`（透過 `SCRIPTS_LIB`），測試的期望值需從 `'plugins/overtone'` 改為 `'.claude'`。

### 決策 4：pre-bash-guard 白名單路徑 `bun plugins/overtone/scripts/os/screenshot.js`

**選擇**：此路徑在 `BLACKLIST` 中並不存在，guard 是「黑名單阻擋」架構（不在黑名單的全部放行）。`bun plugins/overtone/scripts/...` 不符合任何黑名單 pattern，所以 guard 本身不需修改。

**需修改的是測試**：`tests/integration/pre-bash-guard.test.js` 第 228-232 行的測試用的是 `bun plugins/overtone/scripts/os/screenshot.js`，這只是驗證「任意 bun 命令不被攔截」，可以改為 `bun ~/.claude/scripts/os/screenshot.js` 或任何一般指令。

### 決策 5：overtone repo 的 `scripts/` 目錄

**選擇**：保留 `overtone/scripts/test-parallel.js`，不刪除。

**理由**：
- `test-parallel.js` 是開發工具，專門用於 overtone repo 的測試執行，與 `~/.claude/scripts/` 的 `test-parallel.js` 是同一個工具但位置不同（overtone repo 版需能被 `bun scripts/test-parallel.js` 呼叫）。
- 其他的 `health-check.js`、`validate-agents.js` 等在 `~/.claude/scripts/` 存在，測試環境中透過 `SCRIPTS_DIR` 常數（`~/.claude/scripts/`）引用，不需要在 overtone repo 存在副本。
- `plugins/overtone/scripts/` 是副本問題的根源，但 `overtone/scripts/`（只有 `test-parallel.js`）是開發工具，不是副本。

### 決策 6：plugins/ 目錄本身

**選擇**：刪除 `plugins/overtone/` 後，如果 `plugins/` 目錄變空，一併刪除 `plugins/` 目錄。

**理由**：空目錄對 git 沒有意義，保留只增加混淆。

---

## 資料模型

### 新增：`~/.claude/plugin.json`

```typescript
interface PluginJson {
  name: string;    // "ot"
  version: string; // "0.28.83"
}
```

---

## 介面定義

### `session-start-handler.js` — 版本讀取路徑（全域版）

全域安裝後 `__dirname = ~/.claude/scripts/lib/`：

```
path.resolve(__dirname, '../../.claude-plugin/plugin.json')
  → ~/.claude/.claude-plugin/plugin.json  (不存在)
path.resolve(__dirname, '../../plugin.json')
  → ~/.claude/plugin.json  (新建立，成功載入)
```

現有的 `_pluginJsonPaths.find(_existsSync)` fallback 邏輯無需修改，只需確保 `~/.claude/plugin.json` 存在即可。

### `docs-sync.test.js` — 路徑常數修改後的結構

```javascript
// 舊
const SOURCE_PLUGIN_ROOT = join(PROJECT_ROOT, 'plugins', 'overtone');

// 新：SOURCE_PLUGIN_ROOT 改名為 PLUGIN_ROOT，直接使用 paths.js 匯出的值
const { PLUGIN_ROOT } = require('../helpers/paths');

// 所有衍生路徑維持不變，改用 PLUGIN_ROOT 基底
const AGENTS_DIR   = join(PLUGIN_ROOT, 'agents');
const SKILLS_DIR   = join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
const HOOKS_JSON   = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const PLUGIN_JSON  = join(PLUGIN_ROOT, 'plugin.json');  // 改為 ~/.claude/plugin.json（無 .claude-plugin 子目錄）
```

---

## 檔案結構

### 新增

| 路徑 | 用途 |
|------|------|
| `~/.claude/plugin.json` | 版本號 SoT，供 session-start-handler.js 讀取 |

### 修改

| 路徑 | 修改內容 |
|------|----------|
| `tests/unit/docs-sync.test.js` | `SOURCE_PLUGIN_ROOT` 改為 `PLUGIN_ROOT`；`PLUGIN_JSON` 路徑改為 `join(PLUGIN_ROOT, 'plugin.json')` |
| `tests/unit/session-spawner.test.js` | `expect(pluginDirValue).toContain('plugins/overtone')` 改為 `.toContain('.claude')` |
| `tests/unit/session-start-handler.test.js` | 更新 gray-matter 訊息中的路徑字串 |
| `tests/unit/dead-code-guard.test.js` | 更新路徑字串說明 |
| `tests/unit/statusline-state.test.js` | 更新路徑字串說明 |
| `tests/unit/pre-compact-handler.test.js` | `require.resolve('../../plugins/overtone/...')` 改用 `SCRIPTS_LIB` |
| `tests/unit/impact-cli.test.js` | `IMPACT_CLI` 和 `cwd` 改指向 `~/.claude/scripts/` |
| `tests/unit/websocket.test.js` | `PLUGIN_ROOT` 和 `WS_SCRIPT` 改指向 `~/.claude/` |
| `tests/unit/timeline-js.test.js` | 路徑改指向 `~/.claude/web/js/` |
| `tests/unit/confetti-js.test.js` | 路徑改指向 `~/.claude/web/js/` |
| `tests/unit/pipeline.test.js` | 路徑改指向 `~/.claude/web/js/` |
| `tests/unit/clipboard.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/unit/screenshot.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/unit/fswatch.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/unit/system-info.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/unit/window.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/unit/notification.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/unit/process.test.js` | 路徑改用 `SCRIPTS_DIR` |
| `tests/integration/os-scripts.test.js` | `OS_SCRIPTS_DIR` 改指向 `~/.claude/scripts/os` |
| `tests/integration/pre-bash-guard.test.js` | 更新路徑字串的測試案例（黑名單測試邏輯不變） |
| `CLAUDE.md` | 更新目錄結構說明和關鍵文件路徑 |
| `docs/spec/overtone-decision-points.md` | 更新模組路徑標注 |
| `docs/spec/overtone-evolution-engine.md` | 更新模組路徑標注 |
| `docs/reference/testing-guide.md` | 更新路徑說明 |
| `docs/reference/performance-baselines.md` | 更新 statusline.js 路徑 |
| `specs/README.md` | 更新指令範例 |
| `README.md` | 更新安裝說明 |

### 刪除

| 路徑 | 說明 |
|------|------|
| `plugins/overtone/` | 整個目錄（含 agents/, skills/, commands/, hooks/, scripts/, web/, .claude-plugin/） |
| `plugins/` | plugins/overtone/ 刪除後目錄變空，一併刪除 |

### 不修改（明確豁免）

| 路徑 | 理由 |
|------|------|
| `tests/helpers/paths.js` | 已正確指向 `~/.claude/`，不需修改 |
| `tests/unit/knowledge-archiver.test.js` | 測試行為本身包含 `plugins/overtone` 字串（被測功能），保留 |
| `tests/unit/knowledge/skill-generalizer.test.js` | 測試「移除含 plugins/overtone/ 路徑的段落」邏輯，是功能測試，保留 |
| `tests/unit/hook-pure-fns.test.js` | `checkProtected` 測試用字串非真實路徑 |
| `CHANGELOG.md` | 歷史記錄，豁免 |
| `specs/features/archive/` | 歷史記錄，豁免 |
| `~/.claude/scripts/lib/session-start-handler.js` | `__dirname` 全域路徑計算正確，無需修改 |
| `~/.claude/scripts/lib/docs-sync-engine.js` | `__dirname` 全域路徑計算正確，無需修改 |
| `overtone/scripts/test-parallel.js` | 開發工具，非副本，保留 |

---

## 狀態同步策略

本次為純刪除 + 路徑修正，無跨頁面/跨元件的資料變動，不涉及狀態同步設計。

---

## Edge Cases

- **plugin.json `agents` 陣列缺失** — 資料邊界：`~/.claude/plugin.json` 不含 `agents` 陣列，`config-io.js`/`component-repair.js` 的相關測試全部使用 temp dir，不會讀取 `~/.claude/plugin.json`，無衝突。但若有測試假設 `~/.claude/plugin.json` 有 `agents` 欄位，需確認。
- **`docs-sync-engine.js` 的 PROJECT_ROOT 計算** — 語意陷阱：全域安裝後 `__dirname = ~/.claude/scripts/lib/analyzers/`，向上五層是 `~/`（home dir），而不是 overtone repo。`PROJECT_ROOT = join(PLUGIN_ROOT, '..', '..')` 實際上解析為 `~/projects/overtone/`（因為 PLUGIN_ROOT = `~/.claude/`，再向上兩層是 `~/`，不是 `~/projects/overtone/`）。這是現有 bug，本次範圍外，但 developer 需注意此路徑在全域安裝下的行為。
- **`session-start-handler.js` 版本讀取失敗** — 並行競爭：若 `~/.claude/plugin.json` 建立時 session 同時啟動，`require()` 的 module cache 會緩存失敗的 require，需確認 `try/catch` 包覆正確（現有程式碼用 fallback，若 path[0] 找不到會 throw，需確認全域版本的 `_pluginJsonPath = _pluginJsonPaths[0]` fallback 行為）。
- **並行測試讀取 `~/.claude/agents/`** — 並行競爭：`docs-sync.test.js` 改為掃描 `~/.claude/agents/`，如果其他測試同時在 `~/.claude/agents/` 寫入（如 `config-api.test.js` 建立 temp dir），需確認兩者互不干擾（config-api.test.js 使用 `tmp.dir()` 不在 `~/.claude/`，安全）。
