---
feature: pm-workflow-selection-and-visual-brainstorming
stage: TEST:spec
created: 2026-03-10
---

# BDD 規格：PM Workflow 選擇指引 + Visual Brainstorming

---

## Feature 1: workflow-selection-guide.md 內容完整性

### Scenario 1-1: 包含快速判斷矩陣
GIVEN `~/.claude/skills/pm/references/workflow-selection-guide.md` 已建立
WHEN 讀取檔案內容
THEN 包含「Decision Matrix」或等同的矩陣結構
AND 矩陣行數至少涵蓋 quick / standard / full / single 四種 workflow
AND 每種 workflow 列出判斷信號（觸發條件）

### Scenario 1-2: 明確禁止「改動不多就選 quick」的反模式
GIVEN `workflow-selection-guide.md` 已建立
WHEN 讀取 NEVER 區塊
THEN 包含「因為改動不多」或「程式碼行數」相關的禁止描述
AND 明確說明判斷依據是複雜度，不是行數

### Scenario 1-3: 包含邊界案例說明
GIVEN `workflow-selection-guide.md` 已建立
WHEN 讀取邊界案例（Boundary Cases）章節
THEN 至少包含 2 個模糊情境
AND 每個情境提供判斷理由與結論
AND 至少有一個「初看像 quick 實際應選 standard」的反直覺案例

### Scenario 1-4: 明確列出 quick 禁用信號
GIVEN `workflow-selection-guide.md` 已建立
WHEN 讀取 Quick 的判斷準則
THEN 包含「禁用信號」區塊或等同說明
AND 禁用信號包含「新 API」或「涉及 API 設計」
AND 禁用信號包含「狀態管理」
AND 禁用信號包含「跨模組」或「跨模組依賴」

### Scenario 1-5: 包含具體範例
GIVEN `workflow-selection-guide.md` 已建立
WHEN 讀取具體範例章節
THEN 至少包含 5 個真實範例
AND 每個範例說明選擇理由

### Scenario 1-6: 包含多次迭代佇列規則
GIVEN `workflow-selection-guide.md` 已建立
WHEN 讀取多次迭代佇列相關章節
THEN 包含多個子任務分別選擇 workflow 的說明或規則

---

## Feature 2: visual-brainstorming.md 內容完整性

### Scenario 2-1: 包含觸發時機決策樹
GIVEN `~/.claude/skills/thinking/references/visual-brainstorming.md` 已建立
WHEN 讀取觸發時機（何時用視覺化）章節
THEN 包含決策樹結構或等同的條件判斷流程
AND 包含「純文字夠用時不用視覺化」的優先規則
AND 明確描述適合視覺化的場景（如方案比較、架構呈現）

### Scenario 2-2: 包含四種 HTML 元件模板
GIVEN `visual-brainstorming.md` 已建立
WHEN 讀取 HTML 元件模板章節
THEN 包含 Cards（方案比較）模板
AND 包含 Mockup（UI 線框）模板
AND 包含 Pros-Cons（優缺點對比）模板
AND 包含 Split（並排對比）模板
AND 每個模板為可執行的完整 HTML 或 CSS 片段

### Scenario 2-3: 包含 Chrome MCP 整合流程說明
GIVEN `visual-brainstorming.md` 已建立
WHEN 讀取 Chrome MCP 整合流程章節
THEN 包含「寫 HTML 到 /tmp/overtone-viz-{feature}.html」的流程說明
AND 包含使用 `mcp__claude-in-chrome__navigate` 展示的步驟

### Scenario 2-4: 包含 Main Agent 協助展示模式
GIVEN `visual-brainstorming.md` 已建立
WHEN 讀取 Main Agent 協助展示模式章節
THEN 包含 subagent 無 Chrome MCP 時的替代流程說明
AND 說明 subagent 輸出 HTML 路徑、由 Main Agent 執行 navigate 的機制

### Scenario 2-5: 輸出路徑慣例正確
GIVEN `visual-brainstorming.md` 已建立
WHEN 讀取輸出路徑慣例說明
THEN 路徑格式為 `/tmp/overtone-viz-{feature}.html`

### Scenario 2-6: NEVER 區塊包含關鍵禁止規則
GIVEN `visual-brainstorming.md` 已建立
WHEN 讀取 NEVER 區塊
THEN 包含「不可強制使用視覺化」或「保持可選」的描述
AND 包含「不可為視覺化啟動 HTTP server」的描述

---

## Feature 3: pm/SKILL.md 索引更新

### Scenario 3-1: Workflow 建議矩陣下方加入 reference 引用行
GIVEN `~/.claude/skills/pm/SKILL.md` 已更新
WHEN 讀取 Workflow 建議矩陣章節
THEN 矩陣之後包含指向 `./references/workflow-selection-guide.md` 的引用說明
AND 引用文字說明此檔案提供詳細複雜度判斷準則與邊界案例

### Scenario 3-2: 原有 pm/SKILL.md 內容未被破壞
GIVEN `pm/SKILL.md` 已更新
WHEN 讀取完整檔案
THEN 原有的 Workflow 建議矩陣表格結構保持完整
AND 原有的其他章節內容未受異動

---

## Feature 4: thinking/SKILL.md 索引更新

### Scenario 4-1: 資源索引表格加入 visual-brainstorming.md 行
GIVEN `~/.claude/skills/thinking/SKILL.md` 已更新
WHEN 讀取資源索引表格
THEN 包含 `./references/visual-brainstorming.md` 的表格行
AND 該行說明「視覺化伴侶：HTML 元件模板、Chrome MCP 整合、觸發時機決策樹」或等同描述

### Scenario 4-2: 原有 thinking/SKILL.md 內容未被破壞
GIVEN `thinking/SKILL.md` 已更新
WHEN 讀取完整檔案
THEN 原有的資源索引表格其他行均完整保留
AND 原有的其他章節內容未受異動

---

## Feature 5: product-manager.md DO 區塊更新

### Scenario 5-1: DO 區塊包含 workflow 複雜度選擇規則
GIVEN `~/.claude/agents/product-manager.md` 已更新
WHEN 讀取 DO 區塊
THEN 包含規劃佇列時使用 `workflow-selection-guide.md` 複雜度矩陣的規則
AND 規則強度為 MUST（使用 `📋` 標記）
AND 明確說明「涉及新 API/狀態管理/跨模組 → standard」的判斷方向
AND 明確禁止「因改動少」就選 quick

### Scenario 5-2: DO 規則插入位置正確
GIVEN `product-manager.md` 已更新
WHEN 讀取 DO 區塊的行序
THEN workflow 複雜度選擇規則出現在「所有提問 MUST 使用 AskUserQuestion 工具」行之前

### Scenario 5-3: 原有 DO 區塊規則未被破壞
GIVEN `product-manager.md` 已更新
WHEN 讀取 DO 區塊
THEN 原有的所有規則項目均完整保留
AND 未刪除任何既有規則

---

## Feature 6: product-manager.md frontmatter 更新與雙重 frontmatter 修復

### Scenario 6-1: frontmatter skills 包含 thinking
GIVEN `~/.claude/agents/product-manager.md` 已更新
WHEN 讀取 frontmatter 的 skills 欄位
THEN `thinking` 出現在 skills 陣列中
AND 原有的 `wording` skill 仍保留在 skills 陣列中

### Scenario 6-2: 雙重 frontmatter 問題已修復
GIVEN `product-manager.md` 已更新
WHEN 讀取完整檔案
THEN 檔案中只有一個 `---` 開頭的 frontmatter 區塊
AND frontmatter 區塊格式符合 YAML 規範（開頭 `---` + 結尾 `---`）

### Scenario 6-3: frontmatter 其他欄位未被破壞
GIVEN `product-manager.md` 已更新
WHEN 讀取 frontmatter
THEN 原有的 `name`、`description`、`type` 等欄位值均保持不變
AND frontmatter 可被 YAML parser 正確解析

---

## Feature 7: 元件閉環驗證

### Scenario 7-1: pm skill 的 reference 目錄包含 workflow-selection-guide.md
GIVEN 所有變更完成
WHEN 列出 `~/.claude/skills/pm/references/` 目錄
THEN 包含 `workflow-selection-guide.md` 檔案

### Scenario 7-2: thinking skill 的 reference 目錄包含 visual-brainstorming.md
GIVEN 所有變更完成
WHEN 列出 `~/.claude/skills/thinking/references/` 目錄
THEN 包含 `visual-brainstorming.md` 檔案

### Scenario 7-3: product-manager.md 消費路徑完整
GIVEN 所有變更完成
WHEN 驗證 product-manager.md 的 skills 欄位
THEN `skills` 陣列包含 `pm`（原有）
AND `skills` 陣列包含 `thinking`（新增）
AND `pm/SKILL.md` 引用 `workflow-selection-guide.md`
AND `thinking/SKILL.md` 引用 `visual-brainstorming.md`

### Scenario 7-4: architect.md 無需修改（thinking skill 已存在）
GIVEN 所有變更完成
WHEN 讀取 `~/.claude/agents/architect.md` 的 skills 欄位
THEN `thinking` 已存在於 skills 陣列中（既有）
AND 檔案內容與本次 feature 變更前相同

---

## Feature 8: 回歸安全

### Scenario 8-1: 既有 pm reference 檔案未被修改
GIVEN 所有變更完成
WHEN 列出 `~/.claude/skills/pm/references/` 目錄
THEN 所有在 workflow-selection-guide.md 新增之前已存在的 reference 檔案均完整保留

### Scenario 8-2: 既有 thinking reference 檔案未被修改
GIVEN 所有變更完成
WHEN 列出 `~/.claude/skills/thinking/references/` 目錄
THEN 所有在 visual-brainstorming.md 新增之前已存在的 reference 檔案均完整保留

### Scenario 8-3: product-manager.md 主體 Markdown 內容結構完整
GIVEN `product-manager.md` 已更新
WHEN 讀取完整檔案
THEN DO 區塊標題仍存在
AND DON'T 區塊標題仍存在
AND 使用者故事或行為描述段落仍存在
AND 無意外截斷或格式破壞

### Scenario 8-4: 修改後檔案可被正常讀取
GIVEN 所有變更完成
WHEN 嘗試讀取下列四個檔案
AND 讀取 `~/.claude/skills/pm/references/workflow-selection-guide.md`
AND 讀取 `~/.claude/skills/thinking/references/visual-brainstorming.md`
AND 讀取 `~/.claude/skills/pm/SKILL.md`
AND 讀取 `~/.claude/skills/thinking/SKILL.md`
AND 讀取 `~/.claude/agents/product-manager.md`
THEN 所有檔案均可正常讀取，無空檔案
AND 所有 Markdown 檔案無明顯語法破壞（如 frontmatter 未閉合）
