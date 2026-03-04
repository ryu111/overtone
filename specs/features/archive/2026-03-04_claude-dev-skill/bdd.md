# Feature: claude-dev Skill — Claude Code Hooks 與 Agent API 知識域

> 第 15 個 knowledge domain skill，為 developer 和 architect 提供
> Claude Code hooks API 和 Overtone agent 設定的完整參考知識。

---

## Feature 1: SKILL.md 結構正確性

### Scenario 1-1: SKILL.md 含有必要的 frontmatter 欄位
@smoke
GIVEN `plugins/overtone/skills/claude-dev/SKILL.md` 存在
WHEN buildSkillContext 讀取此檔案
THEN frontmatter 含有 `name: claude-dev`
AND frontmatter 含有 `description` 欄位（非空字串）
AND frontmatter 含有 `disable-model-invocation: true`
AND frontmatter 含有 `user-invocable: false`

### Scenario 1-2: SKILL.md 正文長度在 800 字元上限內
@smoke
GIVEN `plugins/overtone/skills/claude-dev/SKILL.md` 存在
WHEN 讀取檔案並去除 frontmatter 後計算正文字元數
THEN 正文長度 <= 800 字元（符合 buildSkillContext maxCharsPerSkill 限制）

### Scenario 1-3: SKILL.md 含有消費者表
@smoke
GIVEN `plugins/overtone/skills/claude-dev/SKILL.md` 存在
WHEN 讀取正文內容
THEN 含有以 developer 為列的 Markdown 表格
AND 含有以 architect 為列的 Markdown 表格

### Scenario 1-4: SKILL.md 含有決策樹導引何時查閱哪個 reference
@edge-case
GIVEN `plugins/overtone/skills/claude-dev/SKILL.md` 存在
WHEN 讀取正文內容
THEN 含有明確的問題分類導引（例如「hooks 問題 → hooks-api.md」）

### Scenario 1-5: SKILL.md 資源索引列出兩個 reference 檔案
@smoke
GIVEN `plugins/overtone/skills/claude-dev/SKILL.md` 存在
WHEN 讀取正文的資源索引區塊
THEN 含有指向 `references/hooks-api.md` 的條目
AND 含有指向 `references/agent-api.md` 的條目

---

## Feature 2: hooks-api.md 內容完整性

### Scenario 2-1: hooks-api.md 記載三層嵌套格式
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/hooks-api.md` 存在
WHEN 讀取檔案內容
THEN 含有 `hooks.json` 官方三層嵌套格式的說明
AND 明確標記扁平陣列格式（`hooks: [{ event, type, command }]`）為錯誤格式

### Scenario 2-2: hooks-api.md 涵蓋 11 個 Hook 事件
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/hooks-api.md` 存在
WHEN 讀取 Hook 事件清單
THEN 含有 SessionStart、SessionEnd、PreCompact、UserPromptSubmit
AND 含有 PreToolUse（含 Task、Write/Edit matcher）
AND 含有 SubagentStop、PostToolUse、PostToolUseFailure
AND 含有 TaskCompleted、Stop、Notification
（共 11 個事件）

### Scenario 2-3: hooks-api.md 說明 updatedInput REPLACE 語意
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/hooks-api.md` 存在
WHEN 讀取 PreToolUse 的 output 格式說明
THEN 含有 updatedInput 是「完全替換（REPLACE）」而非合併（MERGE）的說明
AND 含有必須保留所有欄位的範例（`{ ...toolInput, prompt: newPrompt }`）

### Scenario 2-4: hooks-api.md 涵蓋 exit code 語意
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/hooks-api.md` 存在
WHEN 讀取 output format 章節
THEN 含有 exit code 0（正常）、exit code 1+（用於阻擋操作）的說明
AND 含有 stderr 內容作為阻擋訊息的說明

### Scenario 2-5: hooks-api.md 說明 Overtone 專有限制
@edge-case
GIVEN `plugins/overtone/skills/claude-dev/references/hooks-api.md` 存在
WHEN 讀取 Overtone 限制或注意事項章節
THEN 含有元件保護（agents/*.md、hooks.json、skills/*/SKILL.md 禁止直接編輯）說明
AND 含有使用 manage-component.js 的正確修改路徑說明

### Scenario 2-6: hooks-api.md 遺漏事件時仍通過格式驗證
@error
GIVEN hooks-api.md 中某個 Hook 事件未被記載
WHEN developer 依此文件新增 Hook
THEN 因為缺少關鍵事件說明而被 build-skill-context 截斷時
AND buildSkillContext 仍可正確讀取（不崩潰）
THEN 回傳部分截斷的 skill context（不回傳 null）

---

## Feature 3: agent-api.md 內容完整性

### Scenario 3-1: agent-api.md 說明所有 Overtone frontmatter 欄位
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/agent-api.md` 存在
WHEN 讀取 frontmatter 欄位章節
THEN 含有 `name`、`model`、`skills`、`bypassPermissions` 等必要欄位
AND 含有各欄位的型別和說明

### Scenario 3-2: agent-api.md 說明 skills 機制（三階段注入流程）
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/agent-api.md` 存在
WHEN 讀取 skills 機制章節
THEN 含有 SKILL.md 被 buildSkillContext 讀取並注入 PreToolUse 的流程說明
AND 說明 maxCharsPerSkill=800 和 maxTotalChars=2400 的截斷限制

### Scenario 3-3: agent-api.md 說明 manage-component.js 路徑
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/agent-api.md` 存在
WHEN 讀取元件管理章節
THEN 含有 `bun scripts/manage-component.js create agent` 的用法
AND 含有 `bun scripts/manage-component.js update agent` 的用法
AND 含有禁止直接編輯 agents/*.md 的說明

### Scenario 3-4: agent-api.md 說明四模式 agent prompt 設計
@smoke
GIVEN `plugins/overtone/skills/claude-dev/references/agent-api.md` 存在
WHEN 讀取 agent prompt 設計章節
THEN 含有四個模式：信心過濾、邊界清單（DO/DON'T）、誤判防護、停止條件
AND 每個模式有說明（非僅列名稱）

### Scenario 3-5: agent-api.md 說明 model 選擇策略
@edge-case
GIVEN `plugins/overtone/skills/claude-dev/references/agent-api.md` 存在
WHEN 讀取 model 選擇章節
THEN 含有 opus（決策型）、sonnet（執行型）、haiku（輕量型）的分配原則

### Scenario 3-6: agent-api.md 不含過時的 API 資訊
@error
GIVEN `plugins/overtone/skills/claude-dev/references/agent-api.md` 存在
WHEN 讀取全文
THEN 不含 registry.js 以外的 agent 映射定義來源說明
AND 所有路徑引用均以 `${CLAUDE_PLUGIN_ROOT}` 為前綴（不含硬編碼絕對路徑）

---

## Feature 4: Agent frontmatter 更新

### Scenario 4-1: developer.md frontmatter 包含 claude-dev skill
@smoke
GIVEN `plugins/overtone/agents/developer.md` 存在
WHEN 解析 YAML frontmatter 的 skills 陣列
THEN skills 列表中含有 `claude-dev`

### Scenario 4-2: architect.md frontmatter 包含 claude-dev skill
@smoke
GIVEN `plugins/overtone/agents/architect.md` 存在
WHEN 解析 YAML frontmatter 的 skills 陣列
THEN skills 列表中含有 `claude-dev`

### Scenario 4-3: 原有 skills 不被覆蓋
@edge-case
GIVEN developer.md 和 architect.md 各有既有 skills 列表
WHEN 加入 claude-dev 後讀取 frontmatter
THEN 每個 agent 原有的所有 skills 仍然存在
AND 只多了 claude-dev（無重複、無遺漏）

---

## Feature 5: knowledge-gap-detector 整合

### Scenario 5-1: claude-dev domain 被加入 DOMAIN_KEYWORDS
@smoke
GIVEN `plugins/overtone/scripts/lib/knowledge-gap-detector.js` 已更新
WHEN 讀取 DOMAIN_KEYWORDS 靜態表
THEN `DOMAIN_KEYWORDS['claude-dev']` 存在且為陣列
AND 陣列長度 >= 10

### Scenario 5-2: claude-dev 關鍵詞命中 Hook 相關 prompt
@smoke
GIVEN DOMAIN_KEYWORDS['claude-dev'] 已定義
WHEN 使用含有「hooks.json」「hook event」「UserPromptSubmit」的 prompt 呼叫 detectKnowledgeGaps
AND agent 尚未具備 claude-dev skill
THEN 回傳結果包含 domain 為 'claude-dev' 的缺口
AND score >= 0.2

### Scenario 5-3: claude-dev 關鍵詞命中 Agent 設定相關 prompt
@smoke
GIVEN DOMAIN_KEYWORDS['claude-dev'] 已定義
WHEN 使用含有「agent frontmatter」「manage-component」「bypassPermissions」的 prompt 呼叫 detectKnowledgeGaps
AND agent 尚未具備 claude-dev skill
THEN 回傳結果包含 domain 為 'claude-dev' 的缺口

### Scenario 5-4: agent 已有 claude-dev skill 時不回報缺口
@edge-case
GIVEN DOMAIN_KEYWORDS['claude-dev'] 已定義
WHEN 呼叫 detectKnowledgeGaps 並傳入包含 'claude-dev' 的 agentSkills 陣列
THEN 回傳結果不包含 domain 為 'claude-dev' 的缺口

### Scenario 5-5: 新增 claude-dev domain 不影響其他既有 domain 偵測
@edge-case
GIVEN DOMAIN_KEYWORDS 已更新含 claude-dev
WHEN 使用含有 testing 相關詞彙的 prompt 呼叫 detectKnowledgeGaps
THEN 回傳的缺口中含有 'testing' domain
AND 不因 claude-dev 的加入而改變其他 domain 的 score

### Scenario 5-6: claude-dev 關鍵詞不命中無關 prompt 時不產生缺口
@error
GIVEN DOMAIN_KEYWORDS['claude-dev'] 已定義
WHEN 使用與 Claude Code API 完全無關的 prompt（如「分析資料庫效能」）呼叫 detectKnowledgeGaps
THEN 回傳結果不包含 domain 為 'claude-dev' 的缺口
（score 低於 0.2 門檻）

---

## Feature 6: buildSkillContext 相容性

### Scenario 6-1: claude-dev SKILL.md 能被正確讀取並截斷
@smoke
GIVEN `plugins/overtone/skills/claude-dev/SKILL.md` 存在
AND agent 的 skills 陣列含有 'claude-dev'
WHEN buildSkillContext 處理此 agent
THEN 回傳結果包含 claude-dev skill 的摘要（非 null）
AND 截斷後長度 <= 800 字元

### Scenario 6-2: 多 skill 總長度超過 2400 字元時 claude-dev 被納入截斷邏輯
@edge-case
GIVEN agent 同時具備 claude-dev 和其他多個 skill（總長度超過 2400 字元）
WHEN buildSkillContext 處理此 agent
THEN 回傳結果總長度 <= 2400 字元
AND 不拋出錯誤（截斷行為符合預期）

### Scenario 6-3: SKILL.md 不存在時靜默跳過
@error
GIVEN agent skills 陣列含有 'claude-dev'
AND `plugins/overtone/skills/claude-dev/SKILL.md` 不存在
WHEN buildSkillContext 處理此 agent
THEN 不拋出錯誤（靜默跳過 claude-dev）
AND 其他 skill 的摘要仍正常回傳
