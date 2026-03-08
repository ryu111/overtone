# Feature: overtone-repo-restructure — 刪除 plugins/overtone/ 副本，確立 ~/.claude/ 為唯一 SoT

## 背景

刪除 `plugins/overtone/` 冗餘副本，修正所有指向舊路徑的測試與文件，確保系統在 `~/.claude/` 作為唯一 SoT 後仍能正常運作。

---

## Feature 1: docs-sync.test.js 改用 PLUGIN_ROOT 統計元件數量

### Scenario 1-1: docs-sync.test.js 從 ~/.claude/ 統計 agents 數量並與 status.md 一致
GIVEN `tests/unit/docs-sync.test.js` 已將 `SOURCE_PLUGIN_ROOT` 改為使用 `PLUGIN_ROOT`（`~/.claude/`）
AND `~/.claude/agents/` 目錄含 18 個 `.md` 檔案
WHEN 執行 `docs-sync.test.js` 的 Section 1「docs/status.md 核心指標數字」
THEN `agentCount` 等於 18
AND 測試通過（無 assertion error）

### Scenario 1-2: docs-sync.test.js 從 ~/.claude/ 統計 skills 數量並與 status.md 一致
GIVEN `PLUGIN_ROOT` 指向 `~/.claude/`
AND `~/.claude/skills/` 目錄中含有 SKILL.md 的子目錄數量為 24
WHEN 執行 skill 數量驗證測試
THEN `skillCount` 等於 24
AND status.md 中 `Skill 數量` 欄位值一致

### Scenario 1-3: docs-sync.test.js 從 ~/.claude/ 統計 commands 數量並與 status.md 一致
GIVEN `~/.claude/commands/` 目錄含 28 個 `.md` 檔案
WHEN 執行 command 數量驗證測試
THEN `commandCount` 等於 28
AND status.md 中 `Command 數量` 欄位值一致

### Scenario 1-4: docs-sync.test.js 從 ~/.claude/ 讀取 hooks.json 並驗證 hook 數量
GIVEN `~/.claude/hooks/hooks.json` 存在
AND `hooks.json` 包含 11 個事件 key
WHEN 執行 hook 數量驗證測試
THEN `hookCount` 等於 11
AND status.md 中 `Hook 數量` 欄位值一致

### Scenario 1-5: 刪除 plugins/overtone/ 後 docs-sync.test.js 不因路徑缺失而 fail
GIVEN `plugins/overtone/` 目錄已刪除
AND `tests/unit/docs-sync.test.js` 已移除對 `SOURCE_PLUGIN_ROOT` 的依賴
WHEN 執行 `bun test tests/unit/docs-sync.test.js`
THEN 所有測試 pass（無 ENOENT 或路徑錯誤）

---

## Feature 2: plugin.json 版本號遷移至 ~/.claude/plugin.json

### Scenario 2-1: ~/.claude/plugin.json 存在且含有效的 version 欄位
GIVEN `~/.claude/plugin.json` 已建立
WHEN 讀取 `~/.claude/plugin.json`
THEN 檔案可被 `JSON.parse()` 成功解析
AND 包含 `version` 欄位（非空字串，符合 semver 格式）
AND 包含 `name` 欄位值為 `"ot"`

### Scenario 2-2: ~/.claude/plugin.json 版本與 docs/status.md 版本一致
GIVEN `~/.claude/plugin.json` 存在且 `version` 欄位有值
AND `docs/status.md` 中含有 `Plugin 版本：X.Y.Z` 格式的版本標記
WHEN `docs-sync.test.js` Section 5 讀取兩個版本號
THEN `pluginJson.version` 等於 status.md 中的版本字串
AND 測試通過

### Scenario 2-3: docs-sync.test.js 讀取 plugin.json 改指向 ~/.claude/plugin.json
GIVEN `tests/unit/docs-sync.test.js` 的 `PLUGIN_JSON` 常數改為 `join(PLUGIN_ROOT, 'plugin.json')`（無 `.claude-plugin` 子目錄）
AND `plugins/overtone/.claude-plugin/plugin.json` 已刪除
WHEN 執行 Section 5 版本一致性測試
THEN 測試正常讀取 `~/.claude/plugin.json`
AND 無路徑錯誤

### Scenario 2-4: ~/.claude/plugin.json 不含 agents 陣列（精簡結構）
GIVEN `~/.claude/plugin.json` 建立時採用精簡結構（只含 name + version）
WHEN 任何測試（包含 config-api.test.js）嘗試讀取 `~/.claude/plugin.json`
THEN 不因缺少 `agents` 欄位而發生 TypeError
AND `config-api.test.js` 全數通過（因其使用 temp dir，不讀取真實 plugin.json）

---

## Feature 3: 測試路徑全面改用 paths.js 常數

### Scenario 3-1: 類別一測試（直接引用模組路徑）改用 PLUGIN_ROOT/SCRIPTS_LIB 後正常載入
GIVEN 以下測試已將 `plugins/overtone/` 硬編碼路徑改為 `paths.js` 常數：
- `tests/unit/pre-compact-handler.test.js` 改用 `SCRIPTS_LIB`
- `tests/unit/impact-cli.test.js` 改用 `SCRIPTS_DIR`
- `tests/unit/websocket.test.js` 改用 `PLUGIN_ROOT`
- `tests/unit/timeline-js.test.js` 改指向 `~/.claude/web/js/`
- `tests/unit/confetti-js.test.js` 改指向 `~/.claude/web/js/`
- `tests/unit/pipeline.test.js` 改指向 `~/.claude/web/js/`
WHEN 執行上述各測試檔
THEN 各測試中的 `require()` 成功載入目標模組
AND 各測試全數 pass

### Scenario 3-2: 類別二測試（OS 模組）改用 SCRIPTS_DIR 後正常載入
GIVEN 以下 7 個 OS 模組測試已更新路徑：
- `tests/unit/clipboard.test.js`
- `tests/unit/screenshot.test.js`
- `tests/unit/fswatch.test.js`
- `tests/unit/system-info.test.js`
- `tests/unit/window.test.js`
- `tests/unit/notification.test.js`
- `tests/unit/process.test.js`
WHEN 執行各測試
THEN 模組 require 成功
AND 各測試全數 pass

### Scenario 3-3: os-scripts.test.js 改指向 ~/.claude/scripts/os
GIVEN `tests/integration/os-scripts.test.js` 的 `OS_SCRIPTS_DIR` 已改為 `join(SCRIPTS_DIR, 'os')`
AND `~/.claude/scripts/os/` 目錄存在且含對應的 OS 腳本
WHEN 執行 `os-scripts.test.js`
THEN 所有 OS script 路徑驗證通過
AND 測試 pass

### Scenario 3-4: 類別三字串測試更新後仍通過業務邏輯驗證
GIVEN 以下測試的期望值字串已更新：
- `tests/unit/session-spawner.test.js`：`toContain('plugins/overtone')` 改為 `toContain('.claude')`
- `tests/unit/session-start-handler.test.js`：gray-matter 訊息中的路徑字串更新
- `tests/unit/dead-code-guard.test.js`：掃描路徑說明更新
- `tests/unit/statusline-state.test.js`：路徑注釋更新
WHEN 執行各測試
THEN 業務邏輯行為未改變
AND 更新後的期望值正確反映新路徑（`.claude/`）
AND 各測試全數 pass

### Scenario 3-5: pre-bash-guard.test.js 的命令白名單測試仍有效
GIVEN `tests/integration/pre-bash-guard.test.js` 中使用 `bun plugins/overtone/scripts/os/screenshot.js` 作為測試命令的 case 已更新
AND 改為使用 `bun ~/.claude/scripts/os/screenshot.js` 或其他有效的非黑名單命令
WHEN 執行 pre-bash-guard.test.js
THEN guard 仍正確放行非黑名單命令
AND 測試 pass

---

## Feature 4: plugins/ 目錄刪除後 git 狀態乾淨

### Scenario 4-1: plugins/overtone/ 完整刪除後目錄不存在
GIVEN 所有測試路徑修正完成
AND 文件引用更新完成
WHEN 刪除 `plugins/overtone/` 整個目錄
THEN `plugins/overtone/` 不再存在於 filesystem
AND `plugins/` 目錄（若已空）一併刪除

### Scenario 4-2: 刪除後 grep tests/ 找不到有效的 plugins/overtone 路徑引用
GIVEN `plugins/overtone/` 已刪除
AND 所有測試路徑修正已完成
WHEN 在 `tests/` 目錄下搜尋 `plugins/overtone` 字串
THEN 0 匹配（豁免清單除外）：
  - `tests/unit/knowledge-archiver.test.js`（被測功能本身含此字串）
  - `tests/unit/knowledge/skill-generalizer.test.js`（移除路徑段落邏輯的功能測試）
  - `tests/unit/hook-pure-fns.test.js`（`checkProtected` 非真實路徑）

### Scenario 4-3: 刪除後完整測試套件無 regression
GIVEN `plugins/overtone/` 已刪除
AND 所有測試路徑修正已完成
AND `~/.claude/plugin.json` 已建立
WHEN 執行 `bun scripts/test-parallel.js`
THEN 通過數 >= 4683（基線）
AND 失敗數 = 0
AND 無任何 ENOENT 路徑錯誤

---

## Feature 5: session-spawner DEFAULT_PLUGIN_DIR 指向 ~/.claude/

### Scenario 5-1: session-spawner 的 DEFAULT_PLUGIN_DIR 值包含 .claude 路徑
GIVEN `~/.claude/scripts/lib/session-spawner.js` 的 `DEFAULT_PLUGIN_DIR` 在全域安裝後
AND `__dirname` 為 `~/.claude/scripts/lib/`
WHEN 讀取 `DEFAULT_PLUGIN_DIR` 值（透過 session-spawner.test.js 暴露的 pluginDirValue）
THEN `pluginDirValue` 包含 `.claude`（`toContain('.claude')`）
AND 不包含 `plugins/overtone`

### Scenario 5-2: session-spawner.test.js 期望值更新後業務行為不變
GIVEN `tests/unit/session-spawner.test.js` 中驗證 `pluginDirValue` 的斷言已改為 `toContain('.claude')`
WHEN 執行 `session-spawner.test.js`
THEN spawner 初始化行為正確
AND 測試 pass

---

## Feature 6: 文件路徑引用更新

### Scenario 6-1: CLAUDE.md 目錄結構說明不再含 plugins/overtone 路徑
GIVEN `CLAUDE.md` 的目錄結構說明（```... 區塊）已更新
WHEN 讀取 `CLAUDE.md`
THEN 不含 `plugins/overtone/` 路徑字串（除豁免歷史記錄段落外）
AND registry.js 關鍵文件路徑改為 `~/.claude/scripts/lib/registry.js`

### Scenario 6-2: docs/ 活躍文件不含 plugins/overtone 路徑引用
GIVEN `docs/spec/overtone-decision-points.md`、`docs/spec/overtone-evolution-engine.md`、`docs/reference/testing-guide.md`、`docs/reference/performance-baselines.md` 已更新
WHEN 掃描上述文件
THEN 不含 `plugins/overtone/` 路徑字串
AND 替換為對應的 `~/.claude/` 路徑

### Scenario 6-3: docs-sync.test.js Section 4 舊術語掃描不誤判更新後的文件
GIVEN docs/ 活躍文件已將 `plugins/overtone/` 路徑更新為 `~/.claude/`
WHEN `docs-sync.test.js` Section 4 執行舊術語掃描
THEN 不觸發任何 violation
AND 掃描結果 pass
