# skills/auto 深度路由知識重寫（D→B）

## 動機（Why）

- **問題**：auto skill 評分 C 級（約 88/120）。References 已完成重寫（delegation-quality.md、implicit-dependencies.md），但 SKILL.md 仍有 Activation 內容（校準嗅覺表可被 Claude 自行推導），Progressive Disclosure 缺乏情境路由，Practical Usability 缺乏完整判斷流程
- **目標**：提升至 B 級（96-107/120）。D1 Knowledge Delta 17+/20、D5 Progressive Disclosure 13+/15、D8 Practical Usability 13+/15
- **不做的代價**：auto skill 是 Main Agent 每次路由決策的核心知識源，C 級品質意味著路由判斷偶爾偏差 — D1 任務被升為 D2（浪費 ~4500 tokens）或 D2 任務被降為 D1（品質不足，需返工花費 ~10000 tokens）

## 範圍

### In-scope

- SKILL.md 重寫：替換 Activation 內容為 Expert 知識（認知陷阱、語言學信號），新增情境路由表和判斷流程快速路徑
- frontmatter description 精煉

### Out-of-scope

- references/ 3 個檔案不動（已在上一輪完成重寫，品質達標）
- 不修改 rules/深度路由.md 或 rules/並行執行.md（它們是 SoT）
- 不追求 A 級（108+/120）

## 使用者故事

身為 Main Agent，我想要 auto skill 在 30 秒內提供準確的深度路由判斷（包含認知陷阱防護和語言學信號解讀），以便我不需要反覆調整深度造成 context 浪費。

## 行為規格

### 正常路徑

1. Main Agent 收到任務 → 觸發 auto skill
2. 「判斷流程快速路徑」提供 25 秒結構化判斷：核心兩問 → 語言信號 → 設計決策密度 → 可逆性 → 成本
3. 「認知陷阱」段落防止 3 種常見誤判
4. 若需細節 → 情境路由表指向對應 reference

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 任務描述模糊（語言信號不明確） | 使用最低可行深度 + 升級觸發清單 |
| 邊界案例不在 boundary-cases 中 | 回歸核心兩問 |

### 邊界條件

- 多個設計決策但每個都極小 → 看設計決策「影響範圍」而非「數量」
- 跨 session 續做（spec 已有）→ D2 跳 planner 階段

## 資料模型

N/A — Skill 是純知識文件，無資料儲存

## 介面契約

N/A — Skill 透過 Claude Code 的 skill injection 機制載入，無 API

## 非功能需求

| 維度 | 要求 |
|------|------|
| 行數限制 | SKILL.md 90-110 行（Mindset+Navigation pattern 的合理範圍）|
| Knowledge Delta 比例 | Expert > 70%、Activation < 20%、Redundant < 10% |
| DRY | 與 rules/ 零重複（引用替代複製）|

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | rules/深度路由.md | SoT：深度對照表、Model 規範、接續原則 |
| 上游 | rules/並行執行.md | SoT：並行判斷標準、依賴偵測 |
| 下游 | Main Agent | 每次任務路由決策時消費此 skill |

## 驗收標準

- [ ] skill-judge 語意評分 >= 96/120（B 級）
- [ ] D1 Knowledge Delta >= 17/20（逐段標記 E/A/R，Expert > 70%）
- [ ] D5 Progressive Disclosure >= 13/15（有情境路由表連結 references）
- [ ] D8 Practical Usability >= 13/15（有完整判斷流程快速路徑）
- [ ] SKILL.md 與 rules/ 零逐字重複
- [ ] SKILL.md 90-110 行
- [ ] 5+ 條 NEVER 都有 BECAUSE 含具體失敗案例或 token 數字

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 「認知陷阱」和「語言學信號」不夠 Expert | 中 | 高 | 每段用 meta-question：「做過 50+ 次深度路由的專家會說這需要經驗才知道嗎？」|
| 精簡到 90 行後資訊密度不足 | 低 | 中 | 確保每行都是 Expert 或 Activation，零 Redundant |
| frontmatter description 改壞影響 skill 觸發 | 低 | 高 | 改完後列出應觸發/不應觸發的測試案例 |
