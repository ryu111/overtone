# Proposal: overtone-repo-restructure

## 功能名稱

`overtone-repo-restructure`

## 需求背景（Why）

- **問題**：全域遷移完成後（10 次迭代），`plugins/overtone/` 的內容已完整複製到 `~/.claude/`。目前兩邊並存，`plugins/overtone/` 成為冗餘副本，造成雙重維護的負擔：任何修改都必須同步兩邊，違反 Single Source of Truth 原則。
- **目標**：刪除 `plugins/overtone/` 副本，確立 `~/.claude/` 為唯一原始碼。同時修正所有仍指向 `plugins/overtone/` 路徑的測試和文件，確保系統正常運作。
- **優先級**：全域遷移的最終收尾步驟。不執行此步驟，雙 SoT 問題持續存在，未來每次修改 agent/skill/hook 都有遺漏同步的風險。

## 使用者故事

```
身為 Overtone 開發者
我想要刪除 plugins/overtone/ 冗餘副本
以便讓 ~/.claude/ 成為唯一 SoT，消除雙重維護負擔
```

```
身為 Overtone 開發者
我想要所有測試仍能正常通過
以便確認刪除操作沒有破壞任何功能
```

## 現況分析

### scripts/ 目錄關係

- `~/projects/overtone/scripts/`：只有 `test-parallel.js`（測試專用工具）
- `plugins/overtone/scripts/`：完整的 21 個腳本
- `~/.claude/scripts/`：幾乎相同的 21 個腳本（多 `llm-service-manager.sh`）
- **結論**：`plugins/overtone/scripts/` 和 `~/.claude/scripts/` 幾乎完全相同（diff 只差一個 `.sh` 檔）

### 測試引用 `plugins/overtone/` 的清單

#### 類別一：直接引用 plugin root 下的模組（高風險，需修正路徑）

| 測試檔 | 引用方式 | 修正策略 |
|--------|----------|----------|
| `tests/unit/docs-sync.test.js` | `SOURCE_PLUGIN_ROOT = join(PROJECT_ROOT, 'plugins', 'overtone')` — 用於統計 agents/skills/commands 數量 | 改指向 `~/.claude/` 或重新設計統計邏輯 |
| `tests/unit/docs-sync.test.js` | `PLUGIN_JSON = join(SOURCE_PLUGIN_ROOT, '.claude-plugin', 'plugin.json')` | plugin.json 刪除後需更新 |
| `tests/integration/os-scripts.test.js` | `OS_SCRIPTS_DIR = path.resolve(__dirname, '../../plugins/overtone/scripts/os')` | 改指向 `~/.claude/scripts/os` |
| `tests/unit/impact-cli.test.js` | 硬編碼 `IMPACT_CLI = '.../plugins/overtone/scripts/impact.js'` 和 `cwd` | 改指向 `~/.claude/scripts/` |
| `tests/unit/websocket.test.js` | `PLUGIN_ROOT = '.../plugins/overtone'`，`WS_SCRIPT` 路徑 | 改指向 `~/.claude/` |
| `tests/unit/pre-compact-handler.test.js` | `require.resolve('../../plugins/overtone/scripts/lib/pre-compact-handler')` | 改用 `SCRIPTS_LIB` 路徑 |
| `tests/unit/timeline-js.test.js` | `path.join(__dirname, '../../plugins/overtone/web/js/timeline.js')` | 改指向 `~/.claude/web/js/` |
| `tests/unit/confetti-js.test.js` | `path.join(__dirname, '../../plugins/overtone/web/js/confetti.js')` | 改指向 `~/.claude/web/js/` |
| `tests/unit/pipeline.test.js` | `path.join(__dirname, '../../plugins/overtone/web/js/pipeline.js')` | 改指向 `~/.claude/web/js/` |

#### 類別二：直接 require OS 模組（高風險）

| 測試檔 | 引用方式 | 修正策略 |
|--------|----------|----------|
| `tests/unit/clipboard.test.js` | `'../../plugins/overtone/scripts/os/clipboard'` | 改用 `SCRIPTS_DIR` |
| `tests/unit/screenshot.test.js` | `'../../plugins/overtone/scripts/os/screenshot'` | 改用 `SCRIPTS_DIR` |
| `tests/unit/fswatch.test.js` | `'../../plugins/overtone/scripts/os/fswatch'` | 改用 `SCRIPTS_DIR` |
| `tests/unit/system-info.test.js` | `'../../plugins/overtone/scripts/os/system-info'` | 改用 `SCRIPTS_DIR` |
| `tests/unit/window.test.js` | `'../../plugins/overtone/scripts/os/window'` | 改用 `SCRIPTS_DIR` |
| `tests/unit/notification.test.js` | `'../../plugins/overtone/scripts/os/notification'` | 改用 `SCRIPTS_DIR` |
| `tests/unit/process.test.js` | `'../../plugins/overtone/scripts/os/process'` | 改用 `SCRIPTS_DIR` |

#### 類別三：低風險（測試邏輯本身的字串，非路徑引用）

| 測試檔 | 說明 | 是否需修正 |
|--------|------|-----------|
| `tests/unit/session-spawner.test.js` | 驗證 `pluginDirValue` contains `'plugins/overtone'`（行為測試）| 需更新期望值 |
| `tests/unit/session-start-handler.test.js` | gray-matter 訊息含 `plugins/overtone`（字串 literal）| 需更新 |
| `tests/unit/skill-forge.test.js` | 測試中說明 `pluginRoot` 需為 `projectRoot/plugins/overtone`（邏輯說明）| 評估後決定 |
| `tests/unit/dead-code-guard.test.js` | 測試說明掃描 `plugins/overtone/scripts/lib/`（字串）| 需更新 |
| `tests/unit/statusline-state.test.js` | 測試說明含路徑（注釋）| 需更新 |
| `tests/unit/knowledge-archiver.test.js` | 測試 scenario 中含 `plugins/overtone` 字串（被測行為本身）| 視情況保留 |
| `tests/unit/knowledge/skill-generalizer.test.js` | 測試「移除含 plugins/overtone/ 路徑的段落」的邏輯（被測行為）| 保留，這是功能測試 |
| `tests/unit/hook-pure-fns.test.js` | `checkProtected` 測試用字串，非真實路徑 | 可保留 |
| `tests/integration/pre-bash-guard.test.js` | 測試允許執行 `bun plugins/overtone/scripts/...` 的命令（被測行為）| 需評估是否更新 guard 邏輯 |

### 主要文件引用清單

| 檔案 | 引用說明 | 修正策略 |
|------|----------|----------|
| `CLAUDE.md` | `plugins/overtone/` 目錄說明、`plugins/overtone/scripts/lib/registry.js` 關鍵文件 | 更新路徑為 `~/.claude/` |
| `docs/spec/overtone-decision-points.md` | 多處 `plugins/overtone/scripts/lib/` 來源標注 | 更新路徑 |
| `docs/spec/overtone-evolution-engine.md` | 多處模組位置標注 | 更新路徑 |
| `docs/reference/testing-guide.md` | 執行路徑、conventions 路徑 | 更新路徑 |
| `docs/reference/performance-baselines.md` | statusline.js 路徑引用 | 更新路徑 |
| `specs/README.md` | 多個 `node plugins/overtone/scripts/` 指令 | 更新為 `bun ~/.claude/scripts/` |
| `README.md` | 安裝路徑提示 | 更新說明 |
| `CHANGELOG.md` | 歷史記錄（不需更新，保留原始記錄）| 豁免 |
| `specs/features/archive/` | 歸檔文件（不需更新）| 豁免 |

### docs-sync.test.js 的特殊問題

`docs-sync.test.js` 使用 `SOURCE_PLUGIN_ROOT` 統計 agents/skills/commands 數量，與 status.md 的數字核對。刪除 `plugins/overtone/` 後，這個測試的統計來源必須切換：

**選項 A**：改為統計 `~/.claude/`（PLUGIN_ROOT），但 `~/.claude/` 可能有使用者自訂的額外 agents/commands，數字可能不等於 Overtone 官方數量。

**選項 B**：保留 `plugins/overtone/` 作為「純計數用」的薄殼目錄（只保留 agents/*.md、skills/*/SKILL.md、commands/*.md 等 .md 檔，刪除所有 scripts/ 程式碼），讓 docs-sync.test.js 繼續統計正確數字。

**選項 C**：在 `plugin.json` 或 `docs/status.md` 旁邊新增一個 `overtone-manifest.json`，記錄官方元件數量，docs-sync.test.js 改從此 manifest 讀取而非掃目錄。

### plugin.json 影響評估

刪除 `.claude-plugin/plugin.json` 後：
- Claude Code 不再自動偵測 `plugins/overtone/` 為 plugin
- 但 `~/.claude/` 的所有元件已是全域的，不依賴 plugin 載入機制
- 影響：`docs-sync.test.js` 的 `PLUGIN_JSON` 常數需要更新

## 範圍邊界

### 在範圍內（In Scope）

- 刪除 `plugins/overtone/` 目錄（含全部內容）
- 修正所有測試檔案中指向 `plugins/overtone/` 的路徑
- 更新 `CLAUDE.md` 中的路徑引用
- 更新 `docs/` 中的活躍文件路徑引用（decision-points、evolution-engine、testing-guide、performance-baselines）
- 更新 `specs/README.md` 的指令範例
- 更新 `README.md` 的安裝說明
- 確保所有測試仍然通過（4683 pass 基線）
- 處理 `docs-sync.test.js` 的 `SOURCE_PLUGIN_ROOT` 統計問題

### 不在範圍內（Out of Scope）

- 修改 `CHANGELOG.md`（歷史記錄，豁免）
- 修改 `specs/features/archive/` 的已歸檔文件（歷史記錄）
- 修改 `~/.claude/` 的任何內容（本次僅操作 overtone repo）
- 更動 `tests/helpers/paths.js`（已正確指向 `~/.claude/`）
- 新增功能或修改業務邏輯

## 子任務清單

依照執行順序（阻塞性優先）：

1. **解決 docs-sync.test.js SOURCE_PLUGIN_ROOT 問題**（架構決策，必須先定）
   - 負責 agent：architect
   - 相關檔案：`tests/unit/docs-sync.test.js`、`docs/status.md`
   - 說明：選擇 A/B/C 其中一個策略，定義元件數量統計的新 SoT

2. **修正所有測試的路徑引用**（依賴任務 1 決策）
   - 負責 agent：developer
   - 相關檔案：（類別一）`os-scripts.test.js`、`impact-cli.test.js`、`websocket.test.js`、`pre-compact-handler.test.js`、`timeline-js.test.js`、`confetti-js.test.js`、`pipeline.test.js`；（類別二）7 個 OS 模組測試；（類別三）5 個字串更新
   - 說明：將路徑改為使用 `paths.js` 的 `PLUGIN_ROOT`/`SCRIPTS_DIR`/`SCRIPTS_LIB` 常數，或直接寫 `~/.claude/` 絕對路徑

3. **更新 CLAUDE.md 路徑引用**（可與任務 2 並行）
   - 負責 agent：developer
   - 相關檔案：`CLAUDE.md`
   - 說明：更新目錄結構說明和關鍵文件表格中的 `plugins/overtone/` 路徑

4. **更新 docs/ 和 specs/ 文件路徑引用**（可與任務 2 並行）
   - 負責 agent：developer
   - 相關檔案：`docs/spec/overtone-decision-points.md`、`docs/spec/overtone-evolution-engine.md`、`docs/reference/testing-guide.md`、`docs/reference/performance-baselines.md`、`specs/README.md`、`README.md`
   - 說明：更新所有 `plugins/overtone/` 路徑為 `~/.claude/`

5. **刪除 plugins/overtone/ 目錄**（依賴任務 2、3、4 全部完成）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/`（整個目錄）、`.gitignore`
   - 說明：刪除目錄，更新 .gitignore（如有），驗證 git status 乾淨

6. **執行完整測試確認**（依賴任務 5 完成）
   - 負責 agent：tester
   - 相關檔案：`tests/`（全部）
   - 說明：執行 `bun scripts/test-parallel.js`，確認 4683 pass，0 regression

## 開放問題

1. **docs-sync.test.js SOURCE_PLUGIN_ROOT 策略**（最關鍵）：選項 A（改統計 ~/.claude/，容忍使用者個人化偏差）、選項 B（保留薄殼目錄只含 .md 檔）、選項 C（新增 overtone-manifest.json）？推薦 C，最乾淨但需要新增檔案。

2. **session-spawner.test.js 的 `plugins/overtone` 期望**：`expect(pluginDirValue).toContain('plugins/overtone')` 這個測試在刪除後應改為什麼？`pluginDir` 的值是從 `session-spawner.js` 自動偵測出來的，需確認 spawner 邏輯是否仍需更新。

3. **pre-bash-guard 的白名單**：`bun plugins/overtone/scripts/os/screenshot.js` 這個路徑在 guard 白名單中，刪除後是否需要更新 guard 規則？

4. **plugins/ 目錄結構**：刪除 `plugins/overtone/` 後，`plugins/` 目錄本身是否也刪除（目前只有這一個 plugin）？

5. **plugin.json 版本號同步測試**：`docs-sync.test.js` 有一個 plugin.json 版本號與 status.md 版本一致性測試，刪除 plugin.json 後此測試如何處理？
