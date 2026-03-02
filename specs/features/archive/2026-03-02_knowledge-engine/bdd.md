# Feature: 自主知識引擎（Knowledge Engine）

BDD 規格版本：1.0
對應設計文件：`specs/features/in-progress/knowledge-engine/design.md`

---

## Feature 1: buildSkillContext — Skill 知識摘要建構

### Scenario 1-1: Agent 有 skills 欄位時載入對應 SKILL.md 摘要
GIVEN agent .md frontmatter 含有 `skills: ['commit-convention', 'wording']`
WHEN 呼叫 `buildSkillContext('developer', pluginRoot)`
THEN 回傳字串包含 `--- commit-convention ---` 區塊標頭
AND 回傳字串包含 `--- wording ---` 區塊標頭
AND 每個 skill 的正文內容（去掉 frontmatter 後）被截斷至 800 chars 以內
AND 回傳格式以 `[Skill 知識摘要]` 開頭

### Scenario 1-2: Agent 無 skills 欄位時回傳 null
GIVEN agent .md frontmatter 不含 `skills` 欄位
WHEN 呼叫 `buildSkillContext('architect', pluginRoot)`
THEN 回傳 null

### Scenario 1-3: Agent skills 為空陣列時回傳 null
GIVEN agent .md frontmatter 含有 `skills: []`
WHEN 呼叫 `buildSkillContext('reviewer', pluginRoot)`
THEN 回傳 null

### Scenario 1-4: 部分 SKILL.md 不存在時靜默跳過該 skill
GIVEN agent .md frontmatter 含有 `skills: ['commit-convention', 'nonexistent-skill']`
AND `skills/nonexistent-skill/SKILL.md` 不存在
WHEN 呼叫 `buildSkillContext('developer', pluginRoot)`
THEN 回傳字串包含 `--- commit-convention ---` 內容
AND 回傳字串不包含 `nonexistent-skill` 區塊
AND 不拋出例外

### Scenario 1-5: 所有 SKILL.md 都不存在時回傳 null
GIVEN agent .md frontmatter 含有 `skills: ['nonexistent-a', 'nonexistent-b']`
AND 兩個對應的 SKILL.md 皆不存在
WHEN 呼叫 `buildSkillContext('developer', pluginRoot)`
THEN 回傳 null

### Scenario 1-6: 多 skill 總長度超過 2400 chars 時截斷到總上限
GIVEN agent .md frontmatter 含有 4 個 skills，每個 SKILL.md 正文超過 800 chars
WHEN 呼叫 `buildSkillContext('developer', pluginRoot)` 使用預設 options
THEN 回傳字串總長度不超過 2400 chars 加上固定標頭長度
AND 長度超過 800 chars 的 skill 正文被截斷

### Scenario 1-7: Agent .md 檔案不存在時回傳 null
GIVEN `agentName` 對應的 agent .md 不存在於 `agents/` 目錄
WHEN 呼叫 `buildSkillContext('nonexistent-agent', pluginRoot)`
THEN 回傳 null
AND 不拋出例外

### Scenario 1-8: skills 欄位非陣列時回傳 null
GIVEN agent .md frontmatter 含有 `skills: 'commit-convention'`（字串而非陣列）
WHEN 呼叫 `buildSkillContext('developer', pluginRoot)`
THEN 回傳 null

---

## Feature 2: detectKnowledgeGaps — 知識缺口偵測

### Scenario 2-1: Prompt 含 security 關鍵詞且 agent 無對應 skill 時偵測到缺口
GIVEN prompt 包含 `"check for security vulnerabilities, xss injection"`
AND agentSkills 為 `['commit-convention']`（不含 security-kb）
WHEN 呼叫 `detectKnowledgeGaps(prompt, agentSkills)`
THEN 回傳陣列含 `{ domain: 'security-kb', score: number, matchedKeywords: [...] }`
AND `score` >= 0.2
AND `matchedKeywords` 包含 `security`、`xss`、`injection` 等命中詞

### Scenario 2-2: Agent 已有對應 skill 時不報告缺口
GIVEN prompt 包含 `"write tests, check coverage, use bun:test"`
AND agentSkills 為 `['testing']`
WHEN 呼叫 `detectKnowledgeGaps(prompt, agentSkills)`
THEN 回傳陣列不包含 `domain: 'testing'` 的缺口

### Scenario 2-3: 空 prompt 回傳空陣列
GIVEN prompt 為空字串 `""`
AND agentSkills 為 `[]`
WHEN 呼叫 `detectKnowledgeGaps(prompt, agentSkills)`
THEN 回傳空陣列 `[]`

### Scenario 2-4: Prompt 關鍵詞命中率低於門檻時不回報缺口
GIVEN prompt 只包含 `"review"`（testing domain 命中 1 個關鍵詞，score < 0.2）
AND agentSkills 為 `[]`
WHEN 呼叫 `detectKnowledgeGaps(prompt, agentSkills, { minScore: 0.2 })`
THEN 回傳陣列不包含 `domain: 'testing'`

### Scenario 2-5: 多個 domain 命中時按 score 降序排序並取前 maxGaps 個
GIVEN prompt 包含 testing 和 security-kb 兩個 domain 的多個關鍵詞
AND agentSkills 為 `[]`
AND maxGaps 設為 1
WHEN 呼叫 `detectKnowledgeGaps(prompt, agentSkills, { maxGaps: 1 })`
THEN 回傳陣列長度為 1
AND 回傳的缺口為分數最高的 domain

### Scenario 2-6: Prompt 大小寫不影響比對結果
GIVEN prompt 包含 `"SECURITY VULNERABILITY XSS"`（大寫）
AND agentSkills 為 `[]`
WHEN 呼叫 `detectKnowledgeGaps(prompt, agentSkills)`
THEN 仍能偵測到 security-kb 缺口（不因大寫而漏失）

### Scenario 2-7: agentSkills 為 undefined 時不拋出例外
GIVEN prompt 為非空字串
AND agentSkills 為 undefined
WHEN 呼叫 `detectKnowledgeGaps(prompt, undefined)`
THEN 不拋出例外
AND 回傳有效的陣列（可能含缺口）

---

## Feature 3: Knowledge Searcher — 三源知識搜尋與提取

### Scenario 3-1: 搜尋 Skill references 時回傳匹配的 reference 路徑和內容
GIVEN `skills/testing/references/` 目錄下存在 `test-anti-patterns.md`
AND 其首行包含 `testing` 相關詞
WHEN 呼叫 `searchKnowledge('test anti-patterns', { pluginRoot })`
THEN 回傳陣列含 `{ source: 'skill-ref', domain: 'testing', content: string, path: string }`
AND `content` 長度不超過 500 chars（maxCharsPerResult 預設）
AND `relevance` 為 0~1 之間的數值

### Scenario 3-2: 搜尋 instinct observations 時回傳高信心的歷史知識
GIVEN session 中有 instinct observation tag 含 `security`，confidence >= 0.5
AND query 包含 `security`
WHEN 呼叫 `searchKnowledge('security auth token', { sessionId })`
THEN 回傳陣列含 `{ source: 'instinct', content: string, relevance: number }`
AND 只回傳 confidence >= 0.5 的觀察

### Scenario 3-3: 搜尋 codebase patterns 時回傳相關模組資訊
GIVEN `scripts/lib/` 下存在多個 .js 模組
AND query 關鍵詞與某些模組檔名或 JSDoc 相符
WHEN 呼叫 `searchKnowledge('instinct observation', { pluginRoot })`
THEN 回傳陣列含 `{ source: 'codebase', content: string, path: string }`
AND 結果指向 `instinct.js` 相關模組

### Scenario 3-4: 某個 source 失敗時靜默降級，其他 source 仍回傳結果
GIVEN sessionId 為無效值導致 instinct 搜尋失敗
AND Skill references 搜尋正常
WHEN 呼叫 `searchKnowledge('test', { sessionId: 'invalid', pluginRoot })`
THEN 不拋出例外
AND 回傳陣列仍包含 skill-ref source 的結果

### Scenario 3-5: extractKnowledge 從含 Handoff 結構的 agent 輸出提取 Findings 區塊
GIVEN agentOutput 包含 `### Findings\n- 發現 A\n- 發現 B` 區塊
AND context 為 `{ agentName: 'developer', stage: 'DEV' }`
WHEN 呼叫 `extractKnowledge(agentOutput, context)`
THEN 回傳陣列含 `{ content: string, keywords: string[], source: 'developer:DEV Findings' }`
AND `content` 包含 Findings 區塊的內容

### Scenario 3-6: extractKnowledge 從不含 Handoff 結構的輸出回傳空陣列
GIVEN agentOutput 為普通散文，無 `### Findings` 或 `### Context` 區塊
WHEN 呼叫 `extractKnowledge(agentOutput, context)`
THEN 回傳空陣列 `[]`

### Scenario 3-7: extractKnowledge 正確從 Context 區塊提取關鍵決策
GIVEN agentOutput 含 `### Context\n使用 atomicWrite 防止檔案損毀` 區塊
WHEN 呼叫 `extractKnowledge(agentOutput, context)`
THEN 回傳陣列含 source 包含 `Context` 的片段

---

## Feature 4: Skill Router + Writer — 知識路由與寫入

### Scenario 4-1: 知識片段關鍵詞匹配已有 domain 時 action 為 append
GIVEN fragment 為 `{ content: '...', keywords: ['test', 'mock', 'coverage'], source: 'developer:DEV' }`
AND testing domain 關鍵詞命中率 >= 0.2
WHEN 呼叫 `routeKnowledge(fragment, { pluginRoot })`
THEN 回傳 `{ action: 'append', domain: 'testing', targetPath: string }`
AND `targetPath` 指向 `skills/testing/references/auto-discovered.md`

### Scenario 4-2: 知識片段無匹配 domain 時 action 為 gap-observation
GIVEN fragment 為 `{ content: '關於量子計算的知識', keywords: ['quantum', 'qubit'], source: 'developer:DEV' }`
AND 所有 domain 命中分數 < 0.2
WHEN 呼叫 `routeKnowledge(fragment, { pluginRoot })`
THEN 回傳 `{ action: 'gap-observation', observation: string }`
AND `observation` 包含片段的 source 和 keywords 資訊

### Scenario 4-3: writeKnowledge 在 append 模式下將內容追加到 auto-discovered.md
GIVEN routeResult 為 `{ action: 'append', domain: 'testing', targetPath: '/path/to/auto-discovered.md' }`
AND auto-discovered.md 已存在含部分內容
WHEN 呼叫 `writeKnowledge(routeResult, fragment, pluginRoot)`
THEN auto-discovered.md 新增一個用 `---` 分隔的區塊
AND 新區塊包含 `## {date} | {source}` 標頭
AND 新區塊包含 fragment.content 和 `Keywords:` 行
AND 原有內容不被覆蓋

### Scenario 4-4: writeKnowledge 在 auto-discovered.md 不存在時自動建立檔案
GIVEN routeResult 為 append 模式
AND `skills/testing/references/auto-discovered.md` 不存在
WHEN 呼叫 `writeKnowledge(routeResult, fragment, pluginRoot)`
THEN 建立新的 auto-discovered.md 檔案
AND 檔案包含正確格式的知識條目

### Scenario 4-5: writeKnowledge 在 gap-observation 模式下不寫入檔案
GIVEN routeResult 為 `{ action: 'gap-observation', observation: '...' }`
WHEN 呼叫 `writeKnowledge(routeResult, fragment, pluginRoot)`
THEN 不修改任何 skills/ 目錄下的檔案

### Scenario 4-6: auto-discovered.md 超過 5KB 時只保留最新 N 筆
GIVEN auto-discovered.md 已存在，大小超過 5KB
AND 新知識片段路由到 testing domain
WHEN 呼叫 `writeKnowledge(routeResult, fragment, pluginRoot)`
THEN 檔案大小被控制在合理範圍內（舊條目被移除）
AND 最新的知識條目被保留

---

## Feature 5: PreToolUse 整合 — 知識注入

### Scenario 5-1: Agent 有 skills 欄位時 updatedInput.prompt 包含 skill context
GIVEN pre-task.js 接收 Task tool 輸入
AND target agent 為 `developer`，其 frontmatter 含有 skills 欄位
WHEN hook 處理 tool 輸入並輸出 updatedInput
THEN `updatedInput.prompt` 包含 `[Skill 知識摘要]` 區塊
AND skill context 注入在 workflowContext 之後、testIndex 之前
AND `updatedInput` 保留原始 prompt 的所有其他欄位（不丟失 subagent_type 等）

### Scenario 5-2: 偵測到知識缺口時 prompt 包含 gap warning
GIVEN target agent 為 `developer`
AND agent prompt 包含 security 相關關鍵詞
AND developer frontmatter 不含 `security-kb` skill
WHEN hook 處理 tool 輸入
THEN `updatedInput.prompt` 包含知識缺口提示，指出 security-kb 可能有用

### Scenario 5-3: Agent 無 skills 欄位時不注入額外 skill context
GIVEN target agent 為 `architect`
AND architect frontmatter 不含 skills 欄位
WHEN hook 處理 tool 輸入
THEN `updatedInput.prompt` 不包含 `[Skill 知識摘要]` 區塊
AND prompt 仍包含 workflowContext 和 testIndex（原有注入不受影響）

### Scenario 5-4: gap 偵測無缺口時不注入 gap warning
GIVEN target agent 為 `developer`
AND agent prompt 與所有 domain 關鍵詞命中率均低於門檻
WHEN hook 處理 tool 輸入
THEN `updatedInput.prompt` 不包含 gap warning 相關文字

### Scenario 5-5: buildSkillContext 失敗時 hook 仍正常輸出不崩潰
GIVEN agent .md frontmatter 存在但 skills 目錄損毀或不可讀
WHEN hook 處理 tool 輸入
THEN hook 輸出有效的 `updatedInput`（不含 skill context 但流程不中斷）
AND 不拋出未處理例外導致 exit code != 0

---

## Feature 6: SubagentStop 知識歸檔

### Scenario 6-1: Stage PASS 且有 Findings 區塊時提取並歸檔知識
GIVEN SubagentStop hook 接收 PASS 結果
AND agentOutput 包含 `### Findings` 區塊含有實質知識內容
AND 關鍵詞命中 testing domain
WHEN hook 執行知識歸檔流程
THEN `skills/testing/references/auto-discovered.md` 被更新（新增條目）
AND 新條目包含從 Findings 提取的內容

### Scenario 6-2: Stage FAIL 時不觸發知識歸檔
GIVEN SubagentStop hook 接收 FAIL 結果
AND agentOutput 含 Findings 區塊
WHEN hook 執行
THEN 不修改任何 `skills/*/references/auto-discovered.md`
AND hook 主流程（記錄結果、提示下一步）正常完成

### Scenario 6-3: 知識歸檔失敗時靜默降級不影響主流程
GIVEN SubagentStop hook 接收 PASS 結果
AND skills/ 目錄的寫入權限被拒絕（模擬 IO 錯誤）
WHEN hook 執行知識歸檔
THEN hook 主流程正常完成（結果記錄、timeline emit 等不中斷）
AND 不拋出未處理例外
AND 不向 stdout 輸出錯誤 JSON（避免干擾 SubagentStop 的正常輸出）

### Scenario 6-4: agentOutput 超過 3000 chars 時只取前 3000 chars 做提取
GIVEN agentOutput 長度超過 3000 chars
AND 前 3000 chars 包含 Findings 區塊
WHEN 呼叫 `extractKnowledge(agentOutput.slice(0, 3000), context)`
THEN 正常提取 Findings 內容
AND 不因輸入過長而出現效能問題（處理時間 < 20ms）

### Scenario 6-5: extractKnowledge 回傳空陣列時跳過路由和寫入步驟
GIVEN agentOutput 無 Handoff 結構（無 Findings 區塊）
WHEN SubagentStop hook 執行知識歸檔
THEN 不呼叫 routeKnowledge 或 writeKnowledge
AND 不修改任何 skills/ 目錄下的檔案
