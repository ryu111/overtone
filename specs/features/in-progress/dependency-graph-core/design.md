# Design: dependency-graph-core

## 技術摘要（What & Why）

- **方案**：on-demand 掃描器 + 雙向索引（無快取）
- **理由**：plugin 元件數量固定（~50 個 agents/skills/hooks），每次掃描耗時可接受（< 100ms），快取反而引入失效問題
- **取捨**：on-demand 意味每次呼叫重新掃描；對 CLI 工具可接受，若未來整合 hook（高頻呼叫）可加快取層

## Open Questions 解答

### Q1：SKILL.md Reference 索引格式

確認後：SKILL.md 有兩種 Reference 表格欄位格式，但路徑格式一致：

- **2 欄格式**（`| 檔案 | 說明 |`）：architecture、craft、wording、autonomous-control、os-control 等
- **4 欄格式**（`| # | 檔案 | 用途 | 讀取時機 |`）：testing、workflow-core

**掃描策略**：所有格式的路徑欄都包含 `` `${CLAUDE_PLUGIN_ROOT}/skills/.../...` `` pattern。
用 regex 掃描 SKILL.md 全文即可，不依賴欄位位置：

```
/`\${CLAUDE_PLUGIN_ROOT}\/skills\/[^`]+`/g
```

此 regex 對兩種格式均有效，也能掃出「按需讀取」區塊的路徑。

### Q2：路徑參數慣例

**選擇：相對於 plugin root 的相對路徑**

理由：
- CLI 使用體驗更自然（`bun scripts/impact.js skills/testing/references/bdd-spec-guide.md`）
- 測試寫法簡潔（不依賴機器絕對路徑）
- `buildGraph(pluginRoot)` 接收 pluginRoot，內部統一用 `path.relative(pluginRoot, absPath)` 正規化

API 同時支援絕對路徑（自動轉相對路徑），CLI 輸入支援兩者。

### Q3：require() 路徑正規化策略

hook scripts 的 require() 路徑為相對路徑（如 `'../../../scripts/lib/hook-utils'`）。

**正規化策略**：
1. 用 regex 掃描 `.js` 檔案中的 `require('...')` / `require("...")`
2. 對每個相對路徑（以 `.` 開頭），用 `path.resolve(hookScriptDir, requiredPath)` 解析為絕對路徑
3. 再轉為相對於 plugin root 的路徑（`path.relative(pluginRoot, absPath)`）
4. 加上 `.js` 副檔名（若 require 未包含）
5. 只收錄解析後路徑在 plugin root 下的 require（排除 node_modules）

### Q4：Commands 依賴是否納入 v1

不納入。Command .md 是自由文字，需要語意解析，複雜度顯著高於結構化欄位掃描。列為 v2。

## API 介面設計

### 主要函式

```typescript
// 建立依賴圖（掃描整個 plugin）
// pluginRoot: plugin 根目錄絕對路徑（如 /path/to/plugins/overtone）
function buildGraph(pluginRoot: string): DependencyGraph

interface DependencyGraph {
  // 查詢「修改此路徑會影響哪些元件」（雙向查詢）
  // inputPath: 相對於 pluginRoot 的路徑，或絕對路徑（自動轉換）
  // 回傳直接和間接消費此路徑的所有元件
  getImpacted(inputPath: string): ImpactResult

  // 查詢「此路徑依賴哪些元件」（順向查詢）
  // 回傳此元件直接依賴的所有路徑
  getDependencies(inputPath: string): string[]

  // 取得原始圖資料（供 impact.js CLI 使用）
  getRawGraph(): RawGraph
}
```

### 輸入型別

```typescript
// buildGraph 的 options（可選）
interface BuildOptions {
  // 未來擴充用（如 skip 某類掃描器）
}
```

### 輸出型別

```typescript
interface ImpactResult {
  path: string          // 查詢的路徑（相對於 pluginRoot）
  impacted: ImpactedItem[]  // 所有受影響的元件
}

interface ImpactedItem {
  path: string          // 受影響元件的路徑（相對於 pluginRoot）
  type: ComponentType   // 元件類型
  reason: string        // 為何受影響（如 "agent skill dependency"）
}

type ComponentType =
  | 'agent'             // agents/*.md
  | 'skill'             // skills/*/SKILL.md
  | 'skill-reference'   // skills/*/references/*.md 或 examples/*.md
  | 'hook-script'       // hooks/scripts/**/*.js
  | 'lib-module'        // scripts/lib/*.js
  | 'registry'          // scripts/lib/registry-data.json
  | 'unknown'

// 內部圖結構（雙向索引）
interface RawGraph {
  // 正向：X 依賴 Y（X → [Y1, Y2]）
  dependencies: Record<string, string[]>
  // 反向：Y 被 X 依賴（Y → [X1, X2]）
  dependents: Record<string, string[]>
}
```

### 錯誤處理

| 錯誤情況 | 處理方式 |
|---------|---------|
| pluginRoot 不存在 | throw Error('pluginRoot 不存在') |
| 路徑不在圖中 | getImpacted 回傳空 impacted 陣列 |
| 單一檔案讀取失敗 | 靜默跳過，不中斷整體掃描 |
| require() 路徑解析失敗 | 靜默跳過該 require |

## 資料模型

```typescript
// 內部 graph 結構（建構完成後存於記憶體）
interface InternalGraph {
  // 相對路徑 → 依賴的相對路徑陣列
  dependencies: Map<string, Set<string>>
  // 相對路徑 → 被依賴的相對路徑陣列（反向索引）
  dependents: Map<string, Set<string>>
}
```

**不持久化**：每次呼叫 `buildGraph()` 重新掃描，結果只存記憶體。

## 四類掃描器設計

### 掃描器 1：Agent Skills（agent → skill）

```
掃描目標：agents/*.md
解析方式：gray-matter 解析 frontmatter，讀取 skills 陣列
依賴關係：agent 路徑 → skills/[name]/SKILL.md 路徑

範例：
  agents/developer.md 的 skills: [craft, commit-convention, ...]
  → 建立 agents/developer.md → skills/craft/SKILL.md 的依賴
```

### 掃描器 2：Skill References（skill → references）

```
掃描目標：skills/*/SKILL.md
解析方式：regex 掃描全文 `\${CLAUDE_PLUGIN_ROOT}/skills/[^`]+`
依賴關係：SKILL.md 路徑 → 所有 reference 路徑

路徑轉換：
  ${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md
  → skills/testing/references/bdd-spec-guide.md（相對 plugin root）

注意：SKILL.md 本身也是掃描對象，reference 路徑可能不存在（容忍）
```

### 掃描器 3：Registry Stages（stage → agent）

```
掃描目標：scripts/lib/registry-data.json
解析方式：JSON.parse，遍歷 stages[*].agent
依賴關係：scripts/lib/registry-data.json → agents/[name].md

建立雙向索引：
  registry-data.json 依賴 agent 路徑
  agent 路徑被 registry-data.json 依賴
```

### 掃描器 4：Hook Requires（hook script → lib modules）

```
掃描目標：hooks/scripts/**/*.js
解析方式：regex 掃描 require() 呼叫
  Pattern：/require\(['"]([^'"]+)['"]\)/g
  只處理相對路徑（以 . 開頭）

路徑正規化：
  1. path.resolve(hookScriptDir, requiredPath)
  2. path.relative(pluginRoot, resolvedPath)
  3. 加 .js 副檔名（若無）
  4. 過濾：只收錄 pluginRoot 下的路徑（排除 node_modules）

依賴關係：hook script 路徑 → scripts/lib/*.js 路徑
```

## impact.js CLI 設計

```typescript
// CLI 用法
// bun scripts/impact.js <path> [--deps] [--json]
// bun scripts/impact.js <path>          → 顯示受影響元件（預設）
// bun scripts/impact.js <path> --deps   → 顯示此元件的依賴
// bun scripts/impact.js <path> --json   → JSON 格式輸出（供程式化使用）

// CLI 輸出格式（文字）：
// 查詢：skills/testing/references/bdd-spec-guide.md
// 受影響元件（3）：
//   [skill]  skills/testing/SKILL.md
//   [agent]  agents/tester.md（透過 testing skill）
//   [agent]  agents/qa.md（透過 testing skill）

// JSON 輸出：ImpactResult 物件（JSON.stringify）
```

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/lib/dependency-graph.js   ← 核心模組：buildGraph() + 四類掃描器
  plugins/overtone/scripts/impact.js                 ← CLI 入口：解析參數 + 格式化輸出

新增的測試：
  tests/unit/dependency-graph.test.js                ← BDD 驗收測試（3 個場景）
```

**不修改任何現有檔案**（純新增）。

## 關鍵技術決策

### 決策 1：路徑參數使用相對路徑 vs 絕對路徑

- **相對路徑**（選擇）：相對於 plugin root。CLI 使用自然、測試不依賴機器路徑、API 清晰
- **絕對路徑**（未選）：CLI 需輸入完整路徑，測試需動態組合路徑

### 決策 2：同步掃描 vs 非同步掃描

- **同步掃描**（選擇）：`fs.readFileSync` + `readdirSync`。邏輯簡單、無 await 傳染、測試友好
- **非同步掃描**（未選）：plugin 檔案數量少（< 100 個），非同步帶來的效能收益微乎其微

### 決策 3：Map/Set vs 純物件

- **Map/Set**（選擇）：內部資料結構用 Map（路徑→Set），效能好、語意清晰
- **純物件 Record**（選擇，對外 API）：getRawGraph() 轉為 plain object，方便 JSON 序列化

### 決策 4：gray-matter vs 自訂 frontmatter 解析

- **gray-matter**（選擇）：已是專案依賴，agent frontmatter 已確認用此解析，支援 YAML 陣列
- **自訂解析**（未選）：需重複 specs.js 的自訂 engine，且 specs.js 的 MATTER_OPTS 不支援陣列

## 實作注意事項

給 developer 的提醒：

1. **gray-matter import**：已在 scripts/lib/specs.js 使用，參考其 import 方式（`require('gray-matter')`）
2. **路徑邊界**：所有對外 API 的路徑必須是相對於 pluginRoot 的，內部可用絕對路徑計算，回傳前用 `path.relative(pluginRoot, ...)` 轉換
3. **${CLAUDE_PLUGIN_ROOT} 變數替換**：SKILL.md reference 路徑中的 `${CLAUDE_PLUGIN_ROOT}` 需在掃描時替換為實際 pluginRoot
4. **require() 只追蹤相對路徑**：以 `.` 開頭的 require 才是 plugin 內部依賴；`require('gray-matter')` 等 npm 包跳過
5. **skills 欄位可能不存在**：部分 agent（debugger/designer/grader 等）無 skills 欄位，需 `skills || []` 防禦
6. **測試隔離**：測試不應依賴真實 plugin 結構，應用 fixture 目錄（臨時 mock 結構）或直接測試掃描器邏輯
