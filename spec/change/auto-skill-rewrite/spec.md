# skills/auto 深度路由知識重寫（D→B）

## 動機（Why）

- **問題**：auto skill 評分 D 級（60-69%），主因是 SKILL.md 內容與 `rules/深度路由.md` + `rules/並行執行.md` 大量重複（深度對照表、Model 選擇、Skill 注入、並行 4 項檢查），Knowledge Delta 低。同時專家思維模式（Mindset）不足 — 只有決策樹骨架，缺乏「專家 30 秒直覺判斷」的隱性知識。
- **目標**：提升至 B 級（96-107/120），Knowledge Delta 16+/20，Mindset 12+/15
- **不做的代價**：auto skill 作為 Main Agent 每次路由決策的核心知識源，D 級品質意味著路由判斷經常偏差，導致 D1 任務被升為 D2（浪費 token）或 D2 任務被降為 D1（品質不足）

## 範圍

### In-scope

- SKILL.md 全文重寫：刪除與 rules/ 重複內容，新增專家 knowledge delta
- references/boundary-cases.md 重寫：從「10 個案例」升級為「判斷校準庫」，加入專家內心獨白
- references/delegation-templates.md 重寫：去除 rules/ 已有的模板結構，聚焦「委派品質信號」
- references/dependency-analysis.md 重寫：去除 rules/ 已有的 4 項檢查，聚焦「隱式依賴嗅覺」

### Out-of-scope

- 不新增 reference 檔案（現有 3 個已是合理結構）
- 不修改 rules/深度路由.md 或 rules/並行執行.md（它們是 SoT）
- 不修改評分工具 skill-score.js

## 使用者故事

身為 Main Agent，我想要 auto skill 在 2 秒內提供準確的深度路由判斷（包含升降級嗅覺），以便我不需要反覆調整深度造成 context 浪費。

## 行為規格

### 正常路徑

1. Main Agent 收到任務 → 觸發 auto skill
2. SKILL.md 的「30 秒直覺判斷」提供初始深度估計
3. 「校準檢查」捕捉常見誤判信號
4. 若需細節 → 載入對應 reference（boundary-cases / delegation / dependency）

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 任務描述模糊，無法判斷深度 | 使用「模糊任務降維法」：先假設 D1，列出升級信號 |
| 邊界案例不在 boundary-cases 中 | 回歸核心兩問：有設計決策嗎？失敗可逆嗎？ |

### 邊界條件

- 多個設計決策但每個都極小 → 回歸「設計決策數量不是深度，設計決策影響範圍才是」
- 跨 session 續做（上次 planner 已完成 spec）→ D2 跳過 planner 階段

## 資料模型

N/A — Skill 是純知識文件，無資料儲存

## 介面契約

N/A — Skill 透過 Claude Code 的 skill injection 機制載入，無 API

## 非功能需求

| 維度 | 要求 |
|------|------|
| 行數限制 | SKILL.md < 150 行，每個 reference < 200 行 |
| Knowledge Delta 比例 | Expert > 70%，Activation < 20%，Redundant < 10% |
| DRY | 與 rules/ 零重複（引用替代複製）|

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | rules/深度路由.md | SoT：深度對照表、Model 規範、接續原則 |
| 上游 | rules/並行執行.md | SoT：並行判斷標準、依賴偵測 |
| 下游 | Main Agent | 每次任務路由決策時消費此 skill |

## 驗收標準

- [ ] `bun ~/.claude/scripts/skill-score.js auto` 總分 >= 96/120（B 級）
- [ ] Knowledge Delta 掃描：Expert > 70%（每段標記 [E]/[A]/[R]）
- [ ] SKILL.md 與 rules/深度路由.md 零逐字重複（允許用自己語言重述 knowledge delta）
- [ ] SKILL.md < 150 行
- [ ] 每個 reference < 200 行
- [ ] 5 條 NEVER 都有 because 根因

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 刪太多導致 skill 資訊不足 | 中 | 中 | 每刪一段前確認 rules/ 已涵蓋，且加上引用指向 |
| 新增的專家知識不夠「expert」 | 中 | 高 | 用 meta-question 檢驗：「資深 AI agent 工程師看到這段會說『這需要經驗才知道』嗎？」 |
| 評分工具（programmatic）與語意評分不一致 | 低 | 中 | 以 skill-judge 語意評分為主要驗收，programmatic score 為參考 |
