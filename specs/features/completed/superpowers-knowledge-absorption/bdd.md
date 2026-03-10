# Feature: Superpowers 知識吸收 — verification-discipline.md 建立

## 背景

從 Superpowers（GitHub 高星 Claude Code plugin）吸收 6 項最佳實踐，分散整合到 testing、thinking、code-review 三個 skill 以及 planner、architect、code-reviewer 三個 agent 的 prompt。

---

# Feature 1: verification-discipline.md 檔案建立（testing skill）

## Scenario: verification-discipline.md 存在於 testing/references/ 目錄
GIVEN 開發者完成 verification-discipline.md 的建立
WHEN 讀取 `~/.claude/skills/testing/references/verification-discipline.md`
THEN 檔案存在
AND 檔案大小大於 0 bytes

## Scenario: verification-discipline.md 包含 5 步驗證閘門核心內容
GIVEN verification-discipline.md 已建立
WHEN 讀取其完整內容
THEN 內容包含 5 個有順序的驗證步驟（如「Step 1」「Step 2」或編號清單形式）
AND 內容涵蓋「執行測試」相關步驟
AND 內容涵蓋「驗證結果」相關步驟
AND 內容涵蓋「避免偽造」或「防偽」規則

## Scenario: verification-discipline.md 格式與其他 reference 一致
GIVEN verification-discipline.md 已建立
WHEN 讀取其結構
THEN 有 `#` 一級標題作為檔案標頭
AND 使用 markdown 表格或清單組織內容
AND 不包含 YAML frontmatter（references 目錄下的檔案無 frontmatter）

---

# Feature 2: testing/SKILL.md 索引登記 verification-discipline.md

## Scenario: SKILL.md 深度參考表中有 verification-discipline.md 條目
GIVEN 開發者完成 testing/SKILL.md 更新
WHEN 讀取 `~/.claude/skills/testing/SKILL.md` 的深度參考表
THEN 表中存在 `./references/verification-discipline.md` 路徑
AND 該條目有對應的讀取時機描述（非空白）

## Scenario: SKILL.md 中 verification-discipline.md 的讀取時機語意正確
GIVEN testing/SKILL.md 更新完成
WHEN 讀取 verification-discipline.md 條目的時機欄位
THEN 時機描述涵蓋「驗證」或「verify 模式」相關情境
AND 時機描述不超過 20 字（保持簡潔）

## Scenario: 更新 SKILL.md 不影響既有條目
GIVEN testing/SKILL.md 追加 verification-discipline.md 條目
WHEN 讀取完整深度參考表
THEN 既有條目（bdd-spec-guide.md、test-anti-patterns.md 等）仍存在
AND 表格格式保持一致（兩欄：檔案 | 讀取時機）

---

# Feature 3: questioning-discipline.md 建立（thinking skill）

## Scenario: questioning-discipline.md 存在於 thinking/references/ 目錄
GIVEN 開發者完成 questioning-discipline.md 的建立
WHEN 讀取 `~/.claude/skills/thinking/references/questioning-discipline.md`
THEN 檔案存在
AND 檔案大小大於 0 bytes

## Scenario: questioning-discipline.md 包含一次一問規範
GIVEN questioning-discipline.md 已建立
WHEN 讀取其完整內容
THEN 內容包含「一次只問一個問題」或語意相等的明確規則
AND 內容說明禁止一次拋出多個問題的原因（有 WHY 或操作說明）
AND 規則不是空洞陳述（有具體的判斷準則或範例）

## Scenario: questioning-discipline.md 包含模糊情境強制提問規範
GIVEN questioning-discipline.md 已建立
WHEN 讀取其完整內容
THEN 內容定義了何種情境屬於「模糊需求」（如需求有多種解讀方式）
AND 內容規定模糊情境下必須提問而非自行假設
AND 內容有判斷提問優先順序的準則（如最重要的問題先問）

## Scenario: thinking/SKILL.md 索引登記 questioning-discipline.md
GIVEN 開發者完成 thinking/SKILL.md 更新
WHEN 讀取 `~/.claude/skills/thinking/SKILL.md` 的資源索引表
THEN 表中存在 `./references/questioning-discipline.md` 路徑
AND 該條目說明有描述（非空白）
AND 既有三個條目（when-stuck.md、inversion.md、simplification-cascades.md）仍在

---

# Feature 4: arch-alignment-review.md 建立（code-review skill）

## Scenario: arch-alignment-review.md 存在於 code-review/references/ 目錄
GIVEN 開發者完成 arch-alignment-review.md 的建立
WHEN 讀取 `~/.claude/skills/code-review/references/arch-alignment-review.md`
THEN 檔案存在
AND 檔案大小大於 0 bytes

## Scenario: arch-alignment-review.md 包含設計對齊審查核心內容
GIVEN arch-alignment-review.md 已建立
WHEN 讀取其完整內容
THEN 內容說明如何對照設計文件（BDD spec 或 design.md）審查實作
AND 內容定義「偏離」的分類（如：行為偏離、介面偏離、範圍偏離）
AND 每種偏離類型有對應的處理建議或回饋級別

## Scenario: arch-alignment-review.md 格式與其他 code-review reference 一致
GIVEN arch-alignment-review.md 已建立
WHEN 讀取其結構
THEN 有 `#` 一級標題
AND 使用 markdown 表格或編號清單
AND 不包含 YAML frontmatter

## Scenario: code-review/SKILL.md 索引登記 arch-alignment-review.md
GIVEN 開發者完成 code-review/SKILL.md 更新
WHEN 讀取 `~/.claude/skills/code-review/SKILL.md` 的深度參考索引
THEN 表中存在 `./references/arch-alignment-review.md` 路徑
AND 該條目的讀取時機語意涵蓋「架構對齊」或「BDD spec 對照」
AND 既有條目（pr-review-checklist.md、architecture-review.md 等）仍在

---

# Feature 5: test-anti-patterns.md 追加 Mock Iron Laws 章節

## Scenario: test-anti-patterns.md 中存在 Mock Iron Laws 章節
GIVEN 開發者完成 test-anti-patterns.md 更新
WHEN 讀取 `~/.claude/skills/testing/references/test-anti-patterns.md`
THEN 檔案包含「Mock Iron Laws」標題或語意相等的 Mock 鐵律章節
AND 章節中定義了 Mock 使用的邊界條件（何時該用、何時不該用）

## Scenario: Mock Iron Laws 章節包含壞例和好例
GIVEN Mock Iron Laws 章節已追加
WHEN 讀取該章節內容
THEN 存在至少一個「壞例（DON'T）」程式碼範例
AND 存在至少一個「好例（DO）」程式碼範例
AND 兩個範例格式與既有 Anti-Pattern 1-7 章節一致（使用相同的壞例/好例標記）

## Scenario: Mock Iron Laws 包含三條具體鐵律
GIVEN Mock Iron Laws 章節已追加
WHEN 讀取該章節
THEN 章節中定義的鐵律數量至少為 3 條
AND 每條鐵律有清楚的禁止或允許措辭（如「NEVER mock」「Only mock when」）
AND 沒有與 Anti-Pattern 6（過度 Mock）完全重複的內容（應為補充而非重複）

## Scenario: 追加章節不破壞 test-anti-patterns.md 原有結構
GIVEN Mock Iron Laws 章節已追加
WHEN 讀取整個 test-anti-patterns.md
THEN Anti-Pattern 1 至 Anti-Pattern 7 章節仍完整存在
AND 判斷準則格式（### 判斷準則 + 壞例 + 好例）在原有章節中不變

---

# Feature 6: debugging-framework.md 追加三個章節

## Scenario: debugging-framework.md 包含 5 步回溯法章節
GIVEN 開發者完成 debugging-framework.md 更新
WHEN 讀取 debugging skill 下的 debugging-framework.md
THEN 檔案包含「5 步回溯法」或語意相等的標題
AND 章節內列出 5 個明確的步驟
AND 每個步驟有操作說明（非空洞標題）

## Scenario: debugging-framework.md 包含 4 層縱深防禦章節
GIVEN debugging-framework.md 更新完成
WHEN 讀取其內容
THEN 檔案包含「4 層縱深防禦」或語意相等的標題
AND 章節定義了 4 個防禦層次
AND 各層次之間有明確的優先順序或觸發條件說明

## Scenario: debugging-framework.md 包含 3 次失敗元認知章節
GIVEN debugging-framework.md 更新完成
WHEN 讀取其內容
THEN 檔案包含「3 次失敗」或「失敗元認知」相關標題
AND 章節說明連續 3 次失敗後應採取的行動（如停止、換策略、AskUserQuestion）
AND 行動建議具體可操作（非模糊的「思考更多」）

## Scenario: 追加章節格式與 debugging-framework.md 原有風格一致
GIVEN 三個章節已追加
WHEN 讀取追加內容的格式
THEN 標題層級與原有章節一致（如原用 `##` 則新章節也用 `##`）
AND 沒有引入原文件中未使用的格式元素（如 callout box、HTML 標籤等）

---

# Feature 7: planner.md prompt 更新

## Scenario: planner.md DO 章節包含 Plan 粒度規範
GIVEN 開發者完成 planner.md 更新
WHEN 讀取 `~/.claude/agents/planner.md` 的 DO 章節
THEN DO 章節中存在 Plan 粒度相關規範
AND 規範說明子任務的粒度邊界（如「一個 session 內可完成」或 INVEST 相關原則強化）
AND 規範使用 `📋` 或 `💡` 標記（與既有 DO 項目格式一致）

## Scenario: planner.md DON'T 章節包含提問紀律規範
GIVEN planner.md 更新完成
WHEN 讀取 `~/.claude/agents/planner.md` 的 DON'T 章節
THEN DON'T 章節中存在提問紀律相關規範
AND 規範明確禁止一次提出多個問題（「不可同時問」或語意相等措辭）
AND 規範使用 `⛔` 標記（與既有 DON'T 項目格式一致）

## Scenario: planner.md 更新不破壞 frontmatter
GIVEN planner.md DO/DON'T 章節已追加規範
WHEN 解析 `~/.claude/agents/planner.md` 的 frontmatter
THEN `name` 仍為 `planner`
AND `model` 仍為 `opusplan`
AND `skills` 陣列仍包含 `thinking`

---

# Feature 8: architect.md prompt 更新

## Scenario: architect.md DON'T 章節包含提問紀律規範
GIVEN 開發者完成 architect.md 更新
WHEN 讀取 `~/.claude/agents/architect.md` 的 DON'T 章節
THEN DON'T 章節中存在提問紀律相關規範
AND 規範明確禁止同時拋出多個問題
AND 規範使用 `⛔` 標記（與既有 DON'T 項目格式一致）

## Scenario: architect.md 更新不影響既有 DON'T 規範
GIVEN architect.md 追加提問紀律規範
WHEN 讀取 DON'T 章節完整內容
THEN 既有規範（不可撰寫實作程式碼、不可過度設計、不可引入新慣例等）仍完整存在
AND 新增規範是追加而非替換既有規範

## Scenario: architect.md 更新不破壞 frontmatter
GIVEN architect.md 已更新
WHEN 解析 frontmatter
THEN `name` 仍為 `architect`
AND `skills` 陣列仍包含 `thinking`
AND `model` 仍為 `sonnet`

---

# Feature 9: code-reviewer.md prompt 更新

## Scenario: code-reviewer.md DO 章節包含 arch-alignment-review 對照規則
GIVEN 開發者完成 code-reviewer.md 更新
WHEN 讀取 `~/.claude/agents/code-reviewer.md` 的 DO 章節
THEN DO 章節中存在要求對照 arch-alignment-review 的規則
AND 規則提到讀取 arch-alignment-review.md 或「對照設計文件」審查實作的操作
AND 規則使用 `📋` 或 `💡` 標記

## Scenario: code-reviewer.md 的 skills 欄位包含 code-review skill
GIVEN code-reviewer.md 更新完成
WHEN 解析 `~/.claude/agents/code-reviewer.md` 的 frontmatter
THEN `skills` 陣列包含 `code-review`
AND `name` 仍為 `code-reviewer`

## Scenario: code-reviewer.md 更新不影響既有 DO 規範
GIVEN code-reviewer.md 追加 arch-alignment-review 對照規則
WHEN 讀取 DO 章節完整內容
THEN 既有規範（先跑 git diff、對照 Handoff 逐條檢查、檢查 error handling 等）仍完整存在

---

# Feature 10: 元件閉環驗證

## Scenario: tester agent 能透過 testing skill 存取 verification-discipline.md
GIVEN tester agent 掛載 testing skill，testing/SKILL.md 已登記 verification-discipline.md
WHEN 驗證 tester agent 的 skills 欄位
THEN `~/.claude/agents/tester.md` frontmatter 的 `skills` 包含 `testing`
AND `~/.claude/skills/testing/SKILL.md` 深度參考表包含 `verification-discipline.md`
AND `~/.claude/skills/testing/references/verification-discipline.md` 檔案存在

## Scenario: planner 和 architect 能透過 thinking skill 存取 questioning-discipline.md
GIVEN planner 和 architect 都掛載 thinking skill，thinking/SKILL.md 已登記 questioning-discipline.md
WHEN 驗證 planner 和 architect agent 的 skills 欄位
THEN `~/.claude/agents/planner.md` frontmatter 的 `skills` 包含 `thinking`
AND `~/.claude/agents/architect.md` frontmatter 的 `skills` 包含 `thinking`
AND `~/.claude/skills/thinking/SKILL.md` 資源索引包含 `questioning-discipline.md`
AND `~/.claude/skills/thinking/references/questioning-discipline.md` 檔案存在

## Scenario: code-reviewer agent 能透過 code-review skill 存取 arch-alignment-review.md
GIVEN code-reviewer 掛載 code-review skill，code-review/SKILL.md 已登記 arch-alignment-review.md
WHEN 驗證 code-reviewer agent 的 skills 欄位
THEN `~/.claude/agents/code-reviewer.md` frontmatter 的 `skills` 包含 `code-review`
AND `~/.claude/skills/code-review/SKILL.md` 深度參考索引包含 `arch-alignment-review.md`
AND `~/.claude/skills/code-review/references/arch-alignment-review.md` 檔案存在

---

# Feature 11: 回歸安全 — 現有測試全部通過

## Scenario: 完整測試套件在知識吸收變更後仍全部通過
GIVEN 所有 8 項變更（3 個新 reference、2 個補強 reference、3 個 agent prompt 更新）已完成
WHEN 從專案根目錄執行 `bun scripts/test-parallel.js`
THEN 所有測試通過（0 failures）
AND 測試數量與變更前相符或增加

## Scenario: platform-alignment-skills 測試通過
GIVEN code-review/SKILL.md 新增 arch-alignment-review.md 條目
WHEN 執行 `bun test tests/unit/platform-alignment-skills.test.js`
THEN 測試通過
AND 若測試驗證 code-review skill 的 reference 清單，則 arch-alignment-review.md 已納入驗證範圍

## Scenario: agent frontmatter 測試通過
GIVEN planner.md、architect.md、code-reviewer.md 的 frontmatter 未被修改
WHEN 執行 agent frontmatter 相關測試
THEN 所有 agent name、model、skills 欄位斷言通過
AND 無新增的 agent frontmatter 測試失敗
