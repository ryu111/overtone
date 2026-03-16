# skills/auto 深度路由知識重寫 — 技術設計

## 深度路由：D2
**理由**：純知識文件重寫，4 個檔案皆獨立（同一 skill 目錄但無 import 關係），無安全風險、不可逆操作。不需 reviewer — 驗收由 skill-score 工具客觀量化。

---

## 技術摘要

- **方案**：原地重寫 4 個檔案，以「刪冗餘 → 補 knowledge delta」為核心策略
- **理由**：現有結構（1 SKILL.md + 3 references）已是合理的 Progressive Disclosure，問題在內容而非結構
- **取捨**：不新增 reference 檔案，避免過度拆分導致 skill 碎片化

## 方案比較

| 維度 | A：原地重寫（選擇） | B：砍掉重練 |
|------|:------------------:|:-----------:|
| 風險 | 低（保留已驗證的結構） | 中（可能丟失有價值的邊界案例） |
| 工作量 | 中（逐段審查 + 重寫） | 高（從零開始） |
| Knowledge Delta 保障 | 高（逐段標記 E/A/R 確保比例） | 中（容易寫成新的教學文件） |
| **結論** | 選擇 | 砍掉重練無額外收益，風險更高 |

## 內容變更設計

### SKILL.md 變更計劃

**刪除（Redundant — rules/ 已涵蓋）**：
1. 深度對照表（第 36-44 行）→ 與 rules/深度路由.md 逐字重複
2. Worker 委派協議 > Model 選擇（第 67-73 行）→ 與 rules/深度路由.md Model 升降級規範重複
3. Worker 委派協議 > Skill 注入規則（第 75-78 行）→ 與 rules/深度路由.md 動態 Skill 注入重複
4. 並行編排 > 4 項檢查（第 80-88 行）→ 與 rules/並行執行.md 依賴偵測重複

**保留並強化（Expert knowledge）**：
1. 快速決策樹 → 強化為「30 秒直覺判斷」，加入專家內心獨白
2. 邊界校準 → 強化為「校準嗅覺」，加入升降級的體感信號
3. 反模式速查 → 強化 because 根因，每條加上「怎麼發現的」偵測方法

**新增（Knowledge Delta）**：
1. **專家直覺模型**：「設計決策密度」概念 — 不是二元的「有/無設計決策」，而是密度決定深度
2. **過度設計嗅覺**：3 個具體信號（spec 比程式碼長、D2 的 planner 用了 >30 分鐘、executor 回報「比 spec 簡單」）
3. **深度不足嗅覺**：3 個具體信號（executor 回報意外複雜、修完才發現漏改模組、PR review 發現設計問題）
4. **模糊任務降維法**：任務描述不清時，先假設最低可行深度 + 列出升級觸發條件
5. **成本直覺表**：每個深度的 token 成本量級（D0:0 / D1:~500 / D2:~5K / D3:~8K / D4:~15K），讓 agent 有成本意識

### references/boundary-cases.md 變更計劃

**保留核心結構**：10 個案例 + 核心判斷問題

**強化方式**：
- 每個案例加入「專家內心獨白」— 不只是正確答案，而是專家思考的路徑
- 加入「誤判代價」— 做錯了會怎樣（量化 token 浪費或品質損失）
- 分類為 3 組：D1/D2 邊界（案例 1-5）、D2/D3 邊界（案例 6-9）、D3/D4 邊界（案例 10+）

### references/delegation-templates.md 變更計劃

**刪除**：
- D2/D3/D4 prompt 模板骨架 → rules/深度路由.md 的 planner/executor 職責 + 委派前依賴分析已涵蓋
- EXTRA_SKILLS 注入判斷表 → rules/深度路由.md 的動態 Skill 注入已涵蓋

**重寫為「委派品質信號」**：
- 好的委派 vs 壞的委派對比（context forwarding 品質、約束完整度、驗收可測性）
- 委派後觀察：executor 回報哪些信號 → 需要什麼反應（升降級、補充 context、拆分子任務）
- 常見委派失敗模式 + 根因（context 不足、約束矛盾、驗收模糊）

### references/dependency-analysis.md 變更計劃

**刪除**：
- 4 項依賴檢查清單 → rules/並行執行.md 依賴偵測已涵蓋
- 輸出格式說明 → 這是 planner 格式知識，不是 auto skill 的職責

**重寫為「隱式依賴嗅覺」**：
- 隱式共享的完整分類法（registry、config、generated、test、state）— 現有版本只列了案例，缺乏分類框架
- 「看起來獨立但其實不獨立」的 3 個高頻陷阱
- D4 並行收益計算啟發法（何時 >30% 收益、何時是假並行）

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/skills/auto/SKILL.md` | 全文重寫：刪冗餘 ~50 行、強化 ~30 行、新增 ~40 行 |
| 2 | `~/.claude/skills/auto/references/boundary-cases.md` | 加專家內心獨白 + 誤判代價 + 分組 |
| 3 | `~/.claude/skills/auto/references/delegation-templates.md` | 重寫為「委派品質信號」|
| 4 | `~/.claude/skills/auto/references/dependency-analysis.md` | 重寫為「隱式依賴嗅覺」|

## 執行步驟

### Phase 1（並行）：4 個檔案獨立重寫

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | SKILL.md | 刪冗餘 → 強化決策樹 → 新增專家知識區塊 |
| 1b | references/boundary-cases.md | 加專家獨白 + 誤判代價 + 分組 |
| 1c | references/delegation-templates.md | 重寫為委派品質信號 |
| 1d | references/dependency-analysis.md | 重寫為隱式依賴嗅覺 |

### Phase 2（串行，依賴 Phase 1）：驗收

| 步驟 | 說明 |
|------|------|
| 2a | 全文 Knowledge Delta 掃描（逐段標記 E/A/R，確認比例） |
| 2b | DRY 檢查（grep 比對 rules/ 確認零逐字重複） |
| 2c | `bun ~/.claude/scripts/skill-score.js auto` 跑分 |

## Pre-mortem

**假設重寫後 skill 評分仍是 D 級，最可能的原因：**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 新增的「專家知識」其實是 Claude 已知的泛化建議 | 中 | 高 | 每段寫完後用 meta-question 自檢 |
| 2 | 刪除過多導致 skill 資訊密度不足（太短 = 沒內容） | 低 | 中 | SKILL.md 目標 100-140 行（非越短越好） |
| 3 | NEVER 的 because 仍停留在「因為不好」的層次 | 中 | 中 | 每條 because 必須包含具體的失敗案例或 token 數字 |

## 測試策略

| 測試方式 | 驗收條件 |
|---------|---------|
| `bun ~/.claude/scripts/skill-score.js auto` | 總分 >= 96/120 |
| 手動 Knowledge Delta 掃描 | Expert > 70% |
| `grep` 比對 rules/ | 零逐字重複 |
| `wc -l` | SKILL.md < 150, 每個 reference < 200 |

## 不做什麼

1. **不改 rules/**：rules/ 是 SoT，auto skill 適應 rules/ 而非反過來
2. **不新增 reference 檔案**：3 個 reference 已是合理數量，新增會增加 Progressive Disclosure 層級但不增加價值
3. **不追求 A 級**：A 級（108+/120）需要極致優化，B 級（96+）已是實用目標，避免過度打磨
