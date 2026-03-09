# Knowledge Engine -- 技術設計

## 技術摘要（What & Why）

- **方案**：在現有 Hook 架構（PreToolUse + SubagentStop）內嵌入知識注入/歸檔管線，不引入新 Hook 或新事件
- **理由**：最小化架構變更。PreToolUse 已有 updatedInput 注入機制（workflowContext + testIndex），知識注入自然成為第三個注入源。SubagentStop 已有 instinct.emit 觀察記錄，知識歸檔是同一模式的延伸
- **取捨**：知識提取在 Hook 內用純 JS 規則（非 AI），精確度有限但延遲可控；自動建立新 Skill 風險高，改為 instinct observation 記錄缺口，由人工決定

## 數據流

```
注入方向（PreToolUse → agent prompt）：
  stdin → identifyAgent → readAgentSkills → buildSkillContext → detectKnowledgeGaps
       → [skill summaries + gap warnings] → 注入 updatedInput.prompt

歸檔方向（SubagentStop → Skill files）：
  stdin → parseResult → extractKnowledge(agentOutput)
       → skillRouter(keywords) → appendToSkill / emitGapObservation
```

## 五個 Open Questions 決策

### 決策 1：buildSkillContext 截取策略

- **選擇**：去掉 frontmatter，保留完整正文，截斷到 800 chars/skill、總上限 2400 chars
- **理由**：8 個 knowledge domain SKILL.md 正文在 280~1525 chars 之間。正文本身就是索引（消費者表 + Reference 索引 + 按需讀取提示），不需要再摘要。800 chars 能完整容納大多數 domain，只有 testing (1525) 和 code-review (640+) 會被截斷，但截斷後仍保留消費者表和 Reference 索引前幾行，已足夠讓 agent 知道可讀取哪些 reference
- **未選**：只提取消費者表和 Reference 索引表 -- 需要額外的 section parser，增加複雜度但收益有限

### 決策 2：knowledge-gap-detector domain 比對算法

- **選擇**：靜態關鍵詞表（每個 domain 定義 10~15 個關鍵詞）+ 命中計數加權
- **理由**：Hook 環境是純 JS 同步子進程，無法呼叫 AI。關鍵詞表簡單、可測試、可擴充。8 個 domain 各自維護一組關鍵詞，新增 domain 只需加一行
- **未選**：agent 角色靜態規則 -- agent 已在 frontmatter 定義 skills，靜態規則與 skills 欄位重複；純角色規則無法捕捉跨 domain 需求（如 developer 遇到 DB 問題）
- **算法**：prompt 分詞（空格 + 常見分隔符）→ 每個 domain 計算命中數 → 命中數 / 關鍵詞總數 = 匹配分數 → 分數 >= 0.2 且不在 agent 已有 skills 中的 domain = 知識缺口

### 決策 3：skill-router 新 Skill 門檻

- **選擇**：不自動建立新 Skill。無匹配時（所有 domain 分數 < 0.2）記錄 instinct observation（type: knowledge_gap），由人工或 /evolve 決定是否建立
- **理由**：(1) pre-edit-guard 保護 skills/*/SKILL.md，自動建立需要 manage-component.js (2) 自動建立的 Skill 品質無法保證（名稱、描述、結構）(3) Instinct 系統的 skillEvolutionCount 機制已有「觀察累積 -> 進化」的路徑，知識缺口累積到閾值自然會被 /evolve 發現
- **未選**：自動建立（threshold 0.3/0.5）-- 風險高且 pre-edit-guard 會擋

### 決策 4：knowledge-extractor 模組邊界

- **選擇**：extractKnowledge 作為 knowledge-searcher.js 的 export（不獨立檔案）
- **理由**：提取邏輯預估 30~40 行（從 Handoff 結構提取 Findings 區塊 + 關鍵詞萃取），但與 knowledge-searcher 共享關鍵詞比對邏輯（domainKeywords）。合併避免重複定義關鍵詞表，也減少 dead-code-scanner ENTRY_POINT_BASENAMES 管理成本
- **未選**：獨立 knowledge-extractor.js -- 邏輯量不值得獨立模組

### 決策 5：on-stop 效能保護

- **選擇**：agentOutput 截斷到 3000 chars 後再做知識提取；整個知識歸檔流程 try/catch 包裹，失敗靜默降級；只在 PASS 結果時觸發（fail/reject 不歸檔）
- **理由**：agentOutput 可能很長（10K+ chars），但有價值的知識（Findings 區塊）通常在前 2000 chars。3000 chars 保留足夠緩衝。靜默降級確保不影響主流程
- **效能預算**：PreToolUse buildSkillContext 增加延遲 < 10ms（同步讀 2~3 個小檔案）；SubagentStop 知識歸檔 < 20ms（字串處理 + 檔案 append）

## API 介面設計

### buildSkillContext（hook-utils.js 新增 export）

```typescript
/**
 * 讀取 agent frontmatter 的 skills 欄位，載入對應 SKILL.md 正文摘要
 *
 * @param agentName  - agent 名稱（如 'developer'）
 * @param pluginRoot - plugin 根目錄（如 '/path/to/plugins/overtone'）
 * @param options    - 可選設定
 * @returns string | null  - 知識摘要字串，無 skills 或全部讀取失敗時回傳 null
 */
function buildSkillContext(
  agentName: string,
  pluginRoot: string,
  options?: {
    maxCharsPerSkill?: number,  // 預設 800
    maxTotalChars?: number,     // 預設 2400
  }
): string | null
```

**輸出格式**：
```
[Skill 知識摘要]
--- commit-convention ---
# Commit Convention 知識域
（正文截斷到 maxCharsPerSkill）

--- wording ---
# Wording 知識域
（正文截斷到 maxCharsPerSkill）
```

**錯誤處理**：
| 情境 | 行為 |
|------|------|
| agent .md 不存在 | return null |
| frontmatter 無 skills 欄位 | return null |
| skills 非陣列 | return null |
| 個別 SKILL.md 不存在 | 跳過該 skill，繼續處理其餘 |
| 所有 SKILL.md 都不存在 | return null |

### detectKnowledgeGaps（knowledge-gap-detector.js）

```typescript
/**
 * 分析 prompt 內容，偵測可能缺少的 knowledge domain
 *
 * @param prompt       - agent 的任務 prompt
 * @param agentSkills  - agent 已有的 skills 陣列（如 ['commit-convention', 'wording']）
 * @param options      - 可選設定
 * @returns KnowledgeGap[] - 知識缺口清單，無缺口時回傳空陣列
 */
function detectKnowledgeGaps(
  prompt: string,
  agentSkills: string[],
  options?: {
    minScore?: number,       // 最低匹配分數，預設 0.2
    maxGaps?: number,        // 最多回傳幾個缺口，預設 2
  }
): KnowledgeGap[]

interface KnowledgeGap {
  domain: string       // knowledge domain 名稱（如 'testing'）
  score: number        // 匹配分數 0~1
  matchedKeywords: string[]  // 命中的關鍵詞
}
```

**domainKeywords 定義**（靜態常數，在模組頂層）：
```javascript
const DOMAIN_KEYWORDS = {
  testing: ['test', 'bdd', 'spec', 'assert', 'mock', 'coverage', 'jest', 'bun:test', 'describe', 'expect', 'scenario', 'given', 'when', 'then'],
  'commit-convention': ['commit', 'conventional', 'feat:', 'fix:', 'refactor:', 'chore:', 'atomic'],
  'code-review': ['review', 'code quality', 'readability', 'maintainability', 'complexity', 'naming', 'pattern'],
  'security-kb': ['security', 'vulnerability', 'owasp', 'injection', 'xss', 'auth', 'token', 'permission', 'csrf'],
  database: ['sql', 'query', 'migration', 'index', 'postgres', 'supabase', 'schema', 'join', 'transaction'],
  'dead-code': ['unused', 'dead code', 'orphan', 'export', 'import', 'knip', 'depcheck'],
  wording: ['wording', 'emoji', 'label', 'description', 'prompt', 'guide', 'tone'],
  'workflow-core': ['workflow', 'stage', 'hook', 'pipeline', 'registry', 'loop', 'handoff'],
};
```

**算法**：
1. prompt.toLowerCase() 分詞（按空格/標點/換行）
2. 對每個 domain：命中數 = prompt 詞中出現在該 domain keywords 的數量
3. score = 命中數 / keywords.length
4. 過濾：score >= minScore 且 domain 不在 agentSkills 中
5. 按 score 降序排序，取前 maxGaps 個

### searchKnowledge（knowledge-searcher.js）

```typescript
/**
 * 三源搜尋：Skill references、Instinct observations、Codebase patterns
 *
 * @param query    - 搜尋關鍵詞
 * @param options  - 搜尋設定
 * @returns KnowledgeResult[] - 搜尋結果，每個 source 獨立失敗靜默降級
 */
function searchKnowledge(
  query: string,
  options?: {
    sessionId?: string,       // Instinct 搜尋所需
    pluginRoot?: string,      // Skill references 搜尋所需
    domains?: string[],       // 限定搜尋的 domain（空 = 全部）
    maxResults?: number,      // 每個 source 最多回傳幾筆，預設 3
    maxCharsPerResult?: number, // 每筆結果最大字元數，預設 500
  }
): KnowledgeResult[]

interface KnowledgeResult {
  source: 'skill-ref' | 'instinct' | 'codebase'
  domain?: string      // 來自哪個 domain（skill-ref 時有值）
  content: string      // 知識內容（已截斷）
  relevance: number    // 相關性分數 0~1
  path?: string        // 來源檔案路徑（skill-ref / codebase 時有值）
}
```

**三個 source 實作**：

1. **Skill references**：掃描 skills/{domain}/references/*.md，根據 query 關鍵詞比對檔案名和首行，回傳匹配的 reference 路徑 + 前 500 chars
2. **Instinct observations**：呼叫 instinct.query(sessionId, { minConfidence: 0.5 })，過濾 tag 包含 query 關鍵詞的觀察
3. **Codebase patterns**：掃描 scripts/lib/*.js 檔案名和 JSDoc 註解，比對 query 關鍵詞（輕量級，不做全文搜尋）

### extractKnowledge（knowledge-searcher.js export）

```typescript
/**
 * 從 agent 輸出提取知識片段
 *
 * @param agentOutput  - agent 的 last_assistant_message（已截斷到 3000 chars）
 * @param context      - 提取上下文
 * @returns KnowledgeFragment[] - 提取的知識片段
 */
function extractKnowledge(
  agentOutput: string,
  context: {
    agentName: string,
    stage: string,
  }
): KnowledgeFragment[]

interface KnowledgeFragment {
  content: string      // 知識內容（最多 500 chars）
  keywords: string[]   // 萃取的關鍵詞
  source: string       // 來源描述（如 'developer:DEV Findings'）
}
```

**提取策略**：
1. 搜尋 Handoff 結構中的 `### Findings` 區塊 → 提取區塊內容
2. 搜尋 `### Context` 區塊 → 提取關鍵決策描述
3. 從提取的內容中萃取關鍵詞（與 DOMAIN_KEYWORDS 交集）
4. 無 Handoff 結構時回傳空陣列（不勉強提取）

### routeKnowledge（skill-router.js）

```typescript
/**
 * 將知識片段路由到正確的 Skill domain
 *
 * @param fragment  - 知識片段
 * @param options   - 路由設定
 * @returns RouteResult
 */
function routeKnowledge(
  fragment: KnowledgeFragment,
  options?: {
    pluginRoot?: string,        // plugin 根目錄
    minMatchScore?: number,     // 最低匹配分數，預設 0.2
  }
): RouteResult

interface RouteResult {
  action: 'append' | 'gap-observation'
  domain?: string          // 匹配到的 domain（append 時有值）
  targetPath?: string      // 目標檔案路徑（append 時有值）
  observation?: string     // instinct observation 內容（gap-observation 時有值）
}

/**
 * 執行知識寫入（append 到 references/auto-discovered.md）
 *
 * @param routeResult  - routeKnowledge 的結果
 * @param fragment     - 知識片段
 * @param pluginRoot   - plugin 根目錄
 */
function writeKnowledge(
  routeResult: RouteResult,
  fragment: KnowledgeFragment,
  pluginRoot: string,
): void
```

**路由算法**：
1. 使用 DOMAIN_KEYWORDS（與 gap-detector 共享）比對 fragment.keywords
2. 每個 domain 計算命中數 / keywords.length = score
3. score 最高且 >= minMatchScore → action: 'append'，domain = 最高分 domain
4. 全部 < minMatchScore → action: 'gap-observation'

**寫入格式**（references/auto-discovered.md，APPEND 模式）：
```markdown
---
## {date} | {source}

{content}

Keywords: {keywords.join(', ')}
```

## 資料模型

### domainKeywords（共享常數）

```javascript
// 放在 knowledge-gap-detector.js，skill-router.js import 使用
// 不放 registry.js（避免 registry 膨脹）
const DOMAIN_KEYWORDS = {
  testing: [...],
  'commit-convention': [...],
  'code-review': [...],
  'security-kb': [...],
  database: [...],
  'dead-code': [...],
  wording: [...],
  'workflow-core': [...],
};
```

### auto-discovered.md 格式

儲存位置：`plugins/overtone/skills/{domain}/references/auto-discovered.md`
格式：Markdown append-only（每筆知識用 `---` 分隔）
寫入方式：`atomicWrite`（讀取既有內容 + append 新內容 + 全量寫回）

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/hook-utils.js     <- 新增 buildSkillContext export
  plugins/overtone/hooks/scripts/tool/pre-task.js <- 注入 skillContext + gapWarnings
  plugins/overtone/hooks/scripts/agent/on-stop.js <- 知識提取 + skill-router 歸檔

新增的檔案：
  plugins/overtone/scripts/lib/knowledge-gap-detector.js  <- domain 比對 + DOMAIN_KEYWORDS
  plugins/overtone/scripts/lib/knowledge-searcher.js      <- 三源搜尋 + extractKnowledge
  plugins/overtone/scripts/lib/skill-router.js            <- 知識路由 + 寫入

測試檔案（新增）：
  tests/unit/build-skill-context.test.js          <- buildSkillContext 單元測試
  tests/unit/knowledge-gap-detector.test.js       <- detectKnowledgeGaps 單元測試
  tests/unit/knowledge-searcher.test.js           <- searchKnowledge + extractKnowledge 單元測試
  tests/unit/skill-router.test.js                 <- routeKnowledge + writeKnowledge 單元測試
  tests/integration/pre-task.test.js              <- 新增 skill context 注入 case（追加到現有）
  tests/integration/agent-on-stop.test.js         <- 新增知識歸檔 case（追加到現有）
  tests/e2e/knowledge-engine.test.js              <- E2E 完整知識流測試

更新的檔案：
  plugins/overtone/scripts/lib/dead-code-scanner.js  <- ENTRY_POINT_BASENAMES 更新
```

## 關鍵技術決策

### 決策 A：gray-matter 解析 agent frontmatter

- **選擇**：使用標準 gray-matter（預設 js-yaml engine），不用 specs.js 的自訂 engine
- **理由**：agent .md frontmatter 有 YAML 陣列（skills 欄位），specs.js 的自訂 engine（matchAll 逐行 key:value）不支援陣列。標準 gray-matter 正確解析 skills 為 JS array。已用 bun 驗證
- **注意**：不要用 MATTER_OPTS（specs.js 專用），直接 `matter(content)` 即可

### 決策 B：注入順序

- **選擇**：workflowContext -> skillContext -> gapWarnings -> testIndex -> originalPrompt
- **理由**：skillContext 是 agent 執行任務的背景知識，應在 testIndex（具體測試資訊）之前注入。gapWarnings 是補充資訊，放在 skillContext 之後

### 決策 C：DOMAIN_KEYWORDS 共享

- **選擇**：定義在 knowledge-gap-detector.js，skill-router.js import 使用
- **理由**：gap-detector 是 keywords 的主要消費者（比對 prompt），router 是次要消費者（比對 fragment）。放在主消費者處，避免獨立 config 檔案
- **未選**：放 registry.js -- registry 已有 200+ 行，不應再膨脹

### 決策 D：不修改 agent frontmatter

- **選擇**：不在任何迭代中自動修改 agent .md 的 skills 欄位
- **理由**：pre-edit-guard 保護 agents/*.md，修改需要 manage-component.js。自動修改 skills 欄位風險高（可能引入不相關的 domain）。知識缺口記錄在 instinct observation，由 /evolve 或人工決定是否新增 skills

## 實作注意事項

### 給 developer 的提醒

1. **updatedInput 是 REPLACE 不是 MERGE**：pre-task.js 的 `updatedInput` 完全替換原始 input，必須用 `{ ...toolInput, prompt: newPrompt }` 保留所有欄位
2. **SubagentStop 只支援 `result` 欄位**：on-stop.js 輸出 `{ result: messages.join('\n') }`，不支援 `systemMessage`
3. **on-stop.js 用 `require.main === module` 保護**：測試 import 不執行主邏輯，新增的 extractKnowledge 呼叫要在 safeRun 內
4. **atomicWrite 用於 auto-discovered.md 寫入**：APPEND 模式需先 readFileSync 既有內容再 atomicWrite 全量寫回（沒有 atomicAppend）
5. **gray-matter 在 buildSkillContext 中只用標準模式**：`const matter = require('gray-matter'); matter(content)` -- 不帶 MATTER_OPTS
6. **dead-code-scanner ENTRY_POINT_BASENAMES**：knowledge-gap-detector、knowledge-searcher、skill-router 三個模組都被 hooks require，不是 entry points，不需要加入排除名單。但它們會出現在 scanOrphanFiles 的 require 鏈中，確保 hooks scripts 在 DEFAULT_SEARCH_DIRS 內即可
