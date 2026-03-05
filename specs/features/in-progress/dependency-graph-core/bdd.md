# Feature: dependency-graph-core

## 概述

Overtone plugin 依賴圖基礎設施。提供 on-demand 掃描 + 雙向索引，讓開發者能查詢「修改某個檔案會影響哪些元件」以及「某個元件依賴哪些路徑」。

---

## Feature 1：buildGraph — 建立依賴圖

### Scenario 1-1: 正常 plugin 目錄建立圖成功
GIVEN 一個有效的 pluginRoot 目錄（含 agents/、skills/、hooks/、scripts/lib/ 子目錄）
WHEN 呼叫 `buildGraph(pluginRoot)`
THEN 回傳 DependencyGraph 物件
AND 物件具有 `getImpacted`、`getDependencies`、`getRawGraph` 三個方法

### Scenario 1-2: pluginRoot 不存在時拋出錯誤
GIVEN 一個不存在的目錄路徑（如 `/tmp/nonexistent-plugin-abc`）
WHEN 呼叫 `buildGraph('/tmp/nonexistent-plugin-abc')`
THEN 拋出 Error
AND 錯誤訊息包含 "pluginRoot 不存在" 或類似提示

### Scenario 1-3: 空 plugin 目錄（無任何元件）
GIVEN 一個存在但不含任何 agents/skills/hooks 子目錄的空目錄
WHEN 呼叫 `buildGraph(emptyDir)`
THEN 回傳 DependencyGraph 物件（不拋出錯誤）
AND `getRawGraph()` 回傳 `{ dependencies: {}, dependents: {} }`

### Scenario 1-4: 單一檔案讀取失敗不中斷整體掃描
GIVEN 一個 plugin 目錄，其中有一個 agent.md 檔案內容損壞（非法 frontmatter）
WHEN 呼叫 `buildGraph(pluginRoot)`
THEN 靜默跳過該損壞檔案
AND 其餘元件的依賴關係正常建立
AND 不拋出任何錯誤

---

## Feature 2：掃描器 1 — Agent Skills（agent → skill）

### Scenario 2-1: Agent frontmatter skills 欄位正確建立依賴
GIVEN agents/developer.md 的 frontmatter 包含 `skills: [craft, commit-convention]`
WHEN `buildGraph()` 掃描 agents/ 目錄
THEN 建立以下依賴關係：
AND `agents/developer.md` → `skills/craft/SKILL.md`
AND `agents/developer.md` → `skills/commit-convention/SKILL.md`

### Scenario 2-2: Agent 無 skills 欄位時靜默跳過
GIVEN agents/grader.md 的 frontmatter 不含 `skills` 欄位
WHEN `buildGraph()` 掃描 agents/ 目錄
THEN 該 agent 不建立任何 skill 依賴關係
AND 不拋出任何錯誤

### Scenario 2-3: Agent skills 欄位為空陣列時跳過
GIVEN agents/designer.md 的 frontmatter 包含 `skills: []`
WHEN `buildGraph()` 掃描 agents/ 目錄
THEN 該 agent 不建立任何 skill 依賴關係

### Scenario 2-4: 多個 Agent 共用同一個 Skill
GIVEN agents/tester.md 的 frontmatter 包含 `skills: [testing]`
AND agents/qa.md 的 frontmatter 包含 `skills: [testing]`
WHEN `buildGraph()` 掃描 agents/ 目錄
THEN `skills/testing/SKILL.md` 的 dependents 包含 `agents/tester.md`
AND `skills/testing/SKILL.md` 的 dependents 包含 `agents/qa.md`

---

## Feature 3：掃描器 2 — Skill References（skill → references）

### Scenario 3-1: SKILL.md 中的 references 路徑正確建立依賴
GIVEN skills/testing/SKILL.md 內文包含 `` `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md` ``
WHEN `buildGraph()` 掃描 skills/ 目錄
THEN 建立依賴：`skills/testing/SKILL.md` → `skills/testing/references/bdd-spec-guide.md`

### Scenario 3-2: ${CLAUDE_PLUGIN_ROOT} 變數替換為實際 pluginRoot
GIVEN SKILL.md 中包含 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/foo.md`
AND pluginRoot 為 `/path/to/plugins/overtone`
WHEN `buildGraph()` 掃描該 SKILL.md
THEN 依賴路徑解析為相對路徑 `skills/testing/references/foo.md`
AND 不包含字面量 `${CLAUDE_PLUGIN_ROOT}`

### Scenario 3-3: 2 欄格式和 4 欄格式的 Reference 表格均能掃描
GIVEN skills/wording/SKILL.md 使用 2 欄格式（`| 檔案 | 說明 |`）
AND skills/testing/SKILL.md 使用 4 欄格式（`| # | 檔案 | 用途 | 讀取時機 |`）
WHEN `buildGraph()` 掃描 skills/ 目錄
THEN 兩種格式的路徑均被正確解析為依賴關係

### Scenario 3-4: Reference 路徑指向不存在的檔案時靜默容忍
GIVEN SKILL.md 中包含 `` `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/nonexistent.md` ``
WHEN `buildGraph()` 掃描該 SKILL.md
THEN 仍建立該路徑的依賴記錄（路徑不存在不影響圖的建立）
AND 不拋出任何錯誤

### Scenario 3-5: 多個 reference 路徑從一個 SKILL.md 建立多條依賴
GIVEN skills/testing/SKILL.md 內文包含 7 個不同的 `${CLAUDE_PLUGIN_ROOT}/...` 路徑
WHEN `buildGraph()` 掃描該 SKILL.md
THEN `skills/testing/SKILL.md` 的 dependencies 包含 7 條路徑

---

## Feature 4：掃描器 3 — Registry Stages（registry-data.json → agent）

### Scenario 4-1: registry-data.json 的 stage-agent 映射建立依賴
GIVEN scripts/lib/registry-data.json 中 stages 陣列包含 `{ "name": "DEV", "agent": "developer" }`
WHEN `buildGraph()` 掃描 registry-data.json
THEN 建立依賴：`scripts/lib/registry-data.json` → `agents/developer.md`

### Scenario 4-2: 多個 stage 映射到同一個 agent
GIVEN registry-data.json 中有多個 stage 使用 `"agent": "developer"`
WHEN `buildGraph()` 掃描 registry-data.json
THEN `scripts/lib/registry-data.json` → `agents/developer.md` 只建立一條依賴（Set 去重）

### Scenario 4-3: registry-data.json 不存在時靜默跳過
GIVEN pluginRoot 下不存在 `scripts/lib/registry-data.json`
WHEN `buildGraph()` 執行
THEN 不建立任何 registry 相關依賴
AND 不拋出任何錯誤

### Scenario 4-4: registry-data.json 格式損壞時靜默跳過
GIVEN `scripts/lib/registry-data.json` 內容不是合法 JSON
WHEN `buildGraph()` 執行
THEN 靜默跳過 registry 掃描
AND 其他掃描器的結果不受影響

---

## Feature 5：掃描器 4 — Hook Requires（hook script → lib modules）

### Scenario 5-1: Hook script 的相對路徑 require 建立依賴
GIVEN hooks/scripts/on-stop.js 內包含 `require('../../../scripts/lib/state')`
AND pluginRoot 為 `/path/to/plugins/overtone`
WHEN `buildGraph()` 掃描 hooks/scripts/ 目錄
THEN 建立依賴：`hooks/scripts/on-stop.js` → `scripts/lib/state.js`
AND 目標路徑為相對於 pluginRoot 的格式

### Scenario 5-2: require .js 副檔名自動補全
GIVEN hook script 包含 `require('../lib/utils')` （無 .js 副檔名）
WHEN `buildGraph()` 掃描該 hook script
THEN 建立的依賴路徑包含 `.js` 副檔名（即 `scripts/lib/utils.js`）

### Scenario 5-3: npm 套件 require 不建立依賴
GIVEN hook script 包含 `require('gray-matter')` 和 `require('path')`
WHEN `buildGraph()` 掃描該 hook script
THEN 這些 require 不建立任何圖中的依賴關係
AND 只有以 `.` 開頭的相對路徑才被追蹤

### Scenario 5-4: require 路徑解析後在 pluginRoot 外時排除
GIVEN hook script 的 require 路徑解析後落在 pluginRoot 之外
WHEN `buildGraph()` 掃描該 hook script
THEN 該 require 被靜默排除，不建立依賴關係

### Scenario 5-5: 巢狀 hook scripts 子目錄均被掃描
GIVEN hooks/scripts/ 目錄下有 hooks/scripts/handlers/session-start-handler.js
WHEN `buildGraph()` 掃描 hooks/scripts/ 目錄
THEN 子目錄中的 .js 檔案也被掃描（遞迴 glob）

---

## Feature 6：getImpacted — 雙向影響查詢

### Scenario 6-1: PM 驗收場景 — 修改 testing-conventions.md 查詢影響鏈
GIVEN 一個 fixture plugin 結構：
  - skills/testing/SKILL.md 引用 `skills/testing/references/testing-conventions.md`
  - agents/tester.md frontmatter 包含 `skills: [testing]`
  - agents/qa.md frontmatter 包含 `skills: [testing]`
WHEN 呼叫 `graph.getImpacted('skills/testing/references/testing-conventions.md')`
THEN `result.path` 為 `'skills/testing/references/testing-conventions.md'`
AND `result.impacted` 包含 `{ path: 'skills/testing/SKILL.md', type: 'skill', reason: ... }`
AND `result.impacted` 包含 `{ path: 'agents/tester.md', type: 'agent', reason: ... }`
AND `result.impacted` 包含 `{ path: 'agents/qa.md', type: 'agent', reason: ... }`

### Scenario 6-2: 查詢不存在於圖中的路徑回傳空陣列
GIVEN `buildGraph()` 已建立完成
WHEN 呼叫 `graph.getImpacted('skills/nonexistent/SKILL.md')`
THEN 回傳 `{ path: 'skills/nonexistent/SKILL.md', impacted: [] }`
AND 不拋出任何錯誤

### Scenario 6-3: 輸入絕對路徑時自動轉換為相對路徑
GIVEN pluginRoot 為 `/path/to/plugins/overtone`
AND `buildGraph()` 已建立完成
WHEN 呼叫 `graph.getImpacted('/path/to/plugins/overtone/skills/testing/SKILL.md')`
THEN 結果與 `graph.getImpacted('skills/testing/SKILL.md')` 相同

### Scenario 6-4: ImpactedItem 包含正確的 type 欄位
GIVEN fixture 中有 agent 依賴 skill、skill 依賴 reference
WHEN 呼叫 `graph.getImpacted('skills/testing/references/bdd-spec-guide.md')`
THEN 回傳的 skill 項目的 `type` 為 `'skill'`
AND 回傳的 agent 項目的 `type` 為 `'agent'`

### Scenario 6-5: ImpactedItem 包含非空的 reason 欄位
GIVEN fixture 中有元件依賴關係
WHEN 呼叫 `graph.getImpacted(path)`
THEN 每個 ImpactedItem 的 `reason` 欄位為非空字串

---

## Feature 7：getDependencies — 正向依賴查詢

### Scenario 7-1: PM 驗收場景 — 查詢 developer.md 的依賴
GIVEN agents/developer.md frontmatter 包含 `skills: [craft, commit-convention, code-review]`
WHEN 呼叫 `graph.getDependencies('agents/developer.md')`
THEN 回傳陣列包含 `'skills/craft/SKILL.md'`
AND 包含 `'skills/commit-convention/SKILL.md'`
AND 包含 `'skills/code-review/SKILL.md'`

### Scenario 7-2: 查詢不存在於圖中的路徑回傳空陣列
GIVEN `buildGraph()` 已建立完成
WHEN 呼叫 `graph.getDependencies('agents/nonexistent.md')`
THEN 回傳空陣列 `[]`
AND 不拋出任何錯誤

### Scenario 7-3: 輸入絕對路徑時自動轉換為相對路徑
GIVEN pluginRoot 為 `/path/to/plugins/overtone`
WHEN 呼叫 `graph.getDependencies('/path/to/plugins/overtone/agents/developer.md')`
THEN 結果與 `graph.getDependencies('agents/developer.md')` 相同

### Scenario 7-4: hook script 依賴查詢回傳 lib modules
GIVEN hooks/scripts/on-stop.js 包含 `require('../../../scripts/lib/state')` 和 `require('../../../scripts/lib/registry')`
WHEN 呼叫 `graph.getDependencies('hooks/scripts/on-stop.js')`
THEN 回傳陣列包含 `'scripts/lib/state.js'`
AND 包含 `'scripts/lib/registry.js'`

---

## Feature 8：getRawGraph — 原始圖資料

### Scenario 8-1: getRawGraph 回傳可序列化的 plain object
GIVEN `buildGraph()` 已建立完成，圖中有若干依賴關係
WHEN 呼叫 `graph.getRawGraph()`
THEN 回傳 `{ dependencies: {...}, dependents: {...} }` 格式
AND 可以正常執行 `JSON.stringify(rawGraph)` 不拋出錯誤

### Scenario 8-2: getRawGraph 正向與反向索引一致
GIVEN fixture 中有 `A → B` 的依賴關係
WHEN 呼叫 `graph.getRawGraph()`
THEN `rawGraph.dependencies['A']` 包含 `'B'`
AND `rawGraph.dependents['B']` 包含 `'A'`

---

## Feature 9：impact.js CLI

### Scenario 9-1: PM 驗收場景 — hook script 影響查詢輸出格式
GIVEN hooks/scripts/on-stop.js 引用 scripts/lib/registry.js
AND scripts/lib/registry.js 被多個 hook scripts 使用
WHEN 執行 `bun scripts/impact.js hooks/scripts/on-stop.js`
THEN stdout 包含「查詢：hooks/scripts/on-stop.js」或等效的標頭
AND stdout 列出受影響元件，每行格式為 `[type]  path`

### Scenario 9-2: --deps flag 輸出正向依賴
GIVEN agents/developer.md 有若干 skill 依賴
WHEN 執行 `bun scripts/impact.js agents/developer.md --deps`
THEN stdout 列出 developer.md 的依賴路徑
AND 不顯示「受影響元件」

### Scenario 9-3: --json flag 輸出 JSON 格式
GIVEN `buildGraph()` 已建立完成
WHEN 執行 `bun scripts/impact.js skills/testing/SKILL.md --json`
THEN stdout 為合法 JSON
AND JSON 包含 `path` 和 `impacted` 欄位（對應 ImpactResult 型別）

### Scenario 9-4: --json + --deps flag 輸出 JSON 格式的依賴
GIVEN `buildGraph()` 已建立完成
WHEN 執行 `bun scripts/impact.js agents/developer.md --deps --json`
THEN stdout 為合法 JSON 陣列
AND 陣列元素為相對路徑字串

### Scenario 9-5: 路徑不在圖中時顯示空結果（非錯誤）
GIVEN pluginRoot 下有 impact.js
WHEN 執行 `bun scripts/impact.js nonexistent/path.md`
THEN 退出碼為 0（正常退出）
AND stdout 指示無受影響元件（如「受影響元件（0）」或空列表）

### Scenario 9-6: pluginRoot 自動偵測（從 scripts/ 反推）
GIVEN impact.js 位於 plugins/overtone/scripts/ 下
WHEN 執行 `bun scripts/impact.js <path>`（無需指定 pluginRoot）
THEN 自動以 `scripts/` 的上層目錄作為 pluginRoot

---

## Feature 10：邊界條件與錯誤處理

### Scenario 10-1: require() 路徑包含雙引號和單引號均能掃描
GIVEN hook script 包含 `require("../../../scripts/lib/state")` （雙引號）
WHEN `buildGraph()` 掃描該 hook script
THEN 依賴關係正常建立（等同單引號情況）

### Scenario 10-2: SKILL.md 中多個 reference 路徑在同一行
GIVEN SKILL.md 某行包含多個 `` `${CLAUDE_PLUGIN_ROOT}/...` `` 路徑
WHEN `buildGraph()` 掃描該 SKILL.md
THEN 所有路徑均被掃描並建立依賴（regex global flag 處理）

### Scenario 10-3: Agent skills 欄位包含不存在的 skill 名稱
GIVEN agents/foo.md frontmatter 包含 `skills: [nonexistent-skill]`
WHEN `buildGraph()` 掃描
THEN 仍建立依賴記錄 `agents/foo.md → skills/nonexistent-skill/SKILL.md`
AND 不拋出錯誤（skill 不存在不影響圖的建立）

### Scenario 10-4: 圖中無任何 impacted 元件時 impacted 為空陣列而非 null
GIVEN 路徑存在於圖中但無任何元件依賴它
WHEN 呼叫 `graph.getImpacted(path)`
THEN `result.impacted` 為空陣列 `[]`
AND `result.impacted` 不為 `null` 或 `undefined`

### Scenario 10-5: getDependencies 回傳值不含重複路徑
GIVEN hook script 的程式碼 require 同一個 lib module 兩次
WHEN 呼叫 `graph.getDependencies(hookScriptPath)`
THEN 回傳陣列中不包含重複項目
