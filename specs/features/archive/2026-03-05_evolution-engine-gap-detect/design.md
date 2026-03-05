---
feature: evolution-engine-gap-detect
status: in-progress
created: 2026-03-05
---

# Design: Evolution Engine Gap Detection

## 技術摘要（What & Why）

- **方案**：建立薄殼化的 gap-analyzer.js（lib/）+ evolution.js（scripts/）。gap-analyzer 純粹組合 health-check 的四個 check 函式，不重複邏輯。
- **理由**：Overtone 架構慣例是「邏輯在 lib/，CLI 入口在 scripts/」（如 impact.js → dependency-graph.js）；直接 require health-check 的已導出函式，零重複程式碼。
- **取捨**：gap-analyzer 直接 `require('../health-check')` 而非接受 check 函式作為參數注入 — 因為 health-check 已是穩定內部模組，不需要額外抽象。_deps 只注入 I/O 層（console, process）以支援測試。

## Open Questions 回答

### 1. 缺口去重策略

去重 key 為 `${type}:${file}`（GapType + file 路徑的組合）。

理由：同一 type 對同一 file 回報才是真正重複（component-chain 和 dependency-sync 偵測不同問題，即使 file 相同也應保留兩筆）。

實作：在 analyzeGaps 內用 Map 累積，以 `${gap.type}:${gap.file}` 為 key，先到者勝。

### 2. suggestion 完整度

填入含佔位符的 skeleton，不留空。範例：
- missing-skill：`bun scripts/manage-component.js create skill '{"name":"<name>","description":"<description>","user-invocable":false,"body":"# <name>\n..."}'`
- broken-chain：`bun scripts/manage-component.js update agent <agentName> '{"skills":["<skillName>"]}'`
- missing-consumer：`bun scripts/manage-component.js update skill <skillName> '{"body":"..."}'`（搭配 fix-consistency.js）
- no-references：`mkdir -p plugins/overtone/skills/<skillName>/references && touch plugins/overtone/skills/<skillName>/references/<skillName>.md`

### 3. 缺口類型映射規則

| health-check finding.check | file pattern | Gap type |
|---------------------------|-------------|----------|
| `component-chain` | `agents/*.md`（agent 不存在） | `broken-chain` |
| `component-chain` | `agents/*.md`（skill 不存在） | `missing-skill` |
| `closed-loop` | `scripts/lib/registry.js` | `missing-consumer` |
| `completion-gap` | `skills/*/` | `no-references` |
| `dependency-sync` | `agents/*.md` | `sync-mismatch` |
| `dependency-sync` | `skills/*/SKILL.md` | `sync-mismatch` |

severity 直接繼承自 health-check finding 的 severity 欄位（不重新映射）。

## API 介面設計

### gap-analyzer.js

```typescript
// 主要 API
function analyzeGaps(options?: GapAnalyzeOptions): GapReport

interface GapAnalyzeOptions {
  pluginRoot?: string    // 覆蓋 plugin root 路徑（測試用）
  checks?: GapCheckName[] // 指定只執行哪些 check（預設全部四個）
}

type GapCheckName = 'component-chain' | 'closed-loop' | 'completion-gap' | 'dependency-sync'

interface GapReport {
  gaps: Gap[]
  summary: GapSummary
}

interface Gap {
  type: GapType           // missing-skill | broken-chain | missing-consumer | no-references | sync-mismatch
  severity: 'error' | 'warning' | 'info'
  file: string            // 相對於 plugin root 的路徑
  message: string         // 人類可讀說明
  suggestion: string      // manage-component.js 指令 skeleton（含佔位符）
  sourceCheck: string     // 原始 health-check check 名稱（用於溯源）
}

type GapType = 'missing-skill' | 'broken-chain' | 'missing-consumer' | 'no-references' | 'sync-mismatch'

interface GapSummary {
  total: number
  byType: Record<GapType, number>
  bySeverity: Record<'error' | 'warning' | 'info', number>
}
```

### evolution.js CLI

```
bun scripts/evolution.js analyze [--json]

  analyze         — 執行 gap detection，輸出人類可讀報告
  analyze --json  — 輸出 JSON（供程式消費）

Exit code：
  0 — 無 gap
  1 — 有 gap（errors 或 warnings）
```

## 資料模型

Gap 物件的完整 schema：

```typescript
interface Gap {
  type: 'missing-skill' | 'broken-chain' | 'missing-consumer' | 'no-references' | 'sync-mismatch'
  severity: 'error' | 'warning' | 'info'
  file: string         // 相對路徑（相對於 plugin root）
  message: string      // 從 health-check finding.message 繼承
  suggestion: string   // manage-component.js 指令 skeleton
  sourceCheck: string  // 原始 check 名稱（'component-chain' 等）
}
```

不儲存到磁碟 — 每次執行即時運算。

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/lib/gap-analyzer.js     <- 核心分析模組（純函式 + DI）
  plugins/overtone/scripts/evolution.js            <- CLI 入口（analyze subcommand）
  tests/unit/gap-analyzer.test.js                  <- gap-analyzer 單元測試
  tests/integration/evolution-analyze.test.js      <- evolution CLI 整合測試

不修改的檔案：
  plugins/overtone/scripts/health-check.js         <- 只 require，不修改
  plugins/overtone/scripts/fix-consistency.js      <- 不涉及
  plugins/overtone/scripts/lib/dependency-graph.js <- 不涉及
```

## 關鍵技術決策

### 決策 1：gap-analyzer 如何呼叫 health-check

- **選項 A（選擇）**：直接 `require('../health-check')`，呼叫 `checkComponentChain()`、`checkClosedLoop()`、`checkCompletionGap()`、`checkDependencySync()`。
  - 優點：零程式碼重複，health-check 已導出這四個函式
  - 確認：health-check.js 行 1785 `require.main === module` 條件確保 require 時不執行 CLI 邏輯
- **選項 B（未選）**：呼叫 health-check CLI 子進程並解析 JSON stdout。
  - 原因：過度複雜，subprocess 有 I/O overhead，且 health-check 未提供 --check 過濾

### 決策 2：DI 邊界

- **選項 A（選擇）**：只注入 `_deps = { console, process }`（I/O 層）；四個 check 函式各自接受 `pluginRootOverride` 參數（已有此設計）。
  - 優點：測試時可 mock console/process.exit；check 函式的 pluginRootOverride 由 GapAnalyzeOptions.pluginRoot 向下傳遞
- **選項 B（未選）**：把整個 health-check 作為 _deps 注入。
  - 原因：過度設計，增加測試複雜度而無實際收益

### 決策 3：去重 key 設計

- **選項 A（選擇）**：`${type}:${file}` 作為 Map key。
  - 優點：同一 type + file 組合才算真正重複；兩個不同 check 對同一 file 回報不同 type 的問題保留兩筆，資訊不遺失
- **選項 B（未選）**：`${file}` 作為 key（by file）。
  - 原因：過度去重，同一 file 可能同時有 broken-chain 和 sync-mismatch

### 決策 4：suggestion 生成方式

每個 GapType 有對應的 suggestion template 函式，根據 finding 的 message 欄位提取 agentName/skillName（正則匹配），填入 skeleton 字串。

template 函式定義在 gap-analyzer.js 頂部常數區，不依賴外部配置。

## Gap Type → Suggestion Mapping

| type | suggestion skeleton |
|------|-------------------|
| `broken-chain` | `bun scripts/manage-component.js create agent '{"name":"<agentName>","model":"sonnet","description":"<description>","stage":"<STAGE>","color":"blue","emoji":"🎯","label":"<label>","maxTurns":50,"body":"..."}'` |
| `missing-skill` | `bun scripts/manage-component.js create skill '{"name":"<skillName>","description":"<description>","user-invocable":false,"body":"# <skillName>\\n..."}'` |
| `missing-consumer` | `# 先確認事件用途，再用 fix-consistency.js 補齊消費者：\\nbun scripts/fix-consistency.js --fix` |
| `no-references` | `mkdir -p plugins/overtone/skills/<skillName>/references && echo '# <skillName> 參考文件' > plugins/overtone/skills/<skillName>/references/<skillName>.md` |
| `sync-mismatch` | `bun scripts/fix-consistency.js --fix` |

## 實作注意事項

給 developer 的提醒：

- health-check.js 導出的四個函式：`checkComponentChain(pluginRootOverride)`、`checkClosedLoop()`、`checkCompletionGap(skillsDirOverride)`、`checkDependencySync(pluginRootOverride)` — 確認 `module.exports` 有這些導出（需在 health-check.js 底部確認）
- evolution.js 入口使用 `if (require.main === module)` 判斷，與 impact.js 同一模式
- evolution.js CLI 參數解析：只需支援 `analyze` 和 `--json` flag，不需要複雜的 argument parser
- 整合測試使用 `Bun.spawnSync` 子進程模式（參考 tests/helpers/paths.js 取得路徑常數）
- 單元測試的 gap type mapping 覆蓋全部五種 type
- 四個 check 函式中 `checkClosedLoop()` 沒有 `pluginRootOverride` 參數 — 注意此邊界，integration test 時需使用真實 plugin root

## health-check.js 導出確認需求

developer 實作前需確認 health-check.js 底部是否已導出四個 check 函式（若未導出需補齊）：

```javascript
// health-check.js 底部預期導出
module.exports = {
  checkComponentChain,
  checkClosedLoop,
  checkCompletionGap,
  checkDependencySync,
  runAllChecks,
};
```

若僅有 `runAllChecks` 導出，developer 需先補齊其他四個函式的導出。
