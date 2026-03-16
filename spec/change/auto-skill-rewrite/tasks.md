# skills/auto 深度路由知識重寫 — 任務清單

## Phase 1（並行）：4 個檔案獨立重寫

> 4 個檔案無 import 關係、無共享狀態，完全獨立。

### T1：SKILL.md 重寫
- **執行者**：executor（sonnet）
- **修改檔案**：`~/.claude/skills/auto/SKILL.md`
- **具體動作**：
  1. 刪除深度對照表（第 36-44 行）— 加一行引用 `rules/深度路由.md`
  2. 刪除 Model 選擇（第 67-73 行）— 加一行引用 `rules/深度路由.md`
  3. 刪除 Skill 注入規則（第 75-78 行）— 加一行引用 `rules/深度路由.md`
  4. 刪除並行編排 4 項檢查（第 80-88 行）— 加一行引用 `rules/並行執行.md`
  5. 強化決策樹：加入「設計決策密度」概念、專家內心獨白註解
  6. 新增「30 秒直覺判斷」區塊：體感信號表（任務描述長度、涉及模組數、有無「重構」「新 API」關鍵詞）
  7. 新增「過度設計嗅覺」：3 個偵測信號 + 降級動作
  8. 新增「深度不足嗅覺」：3 個偵測信號 + 升級動作
  9. 新增「模糊任務降維法」：先假設 D1 + 升級觸發清單
  10. 新增「成本直覺表」：D0-D4 token 量級
  11. 強化 NEVER：每條加 because 具體失敗案例
- **驗收**：< 150 行、Expert > 70%、與 rules/ 零逐字重複

### T2：boundary-cases.md 重寫
- **執行者**：executor（sonnet）
- **修改檔案**：`~/.claude/skills/auto/references/boundary-cases.md`
- **具體動作**：
  1. 10 個案例分為 3 組：D1/D2 邊界（案例 1-5）、D2/D3 邊界（案例 6-9）、D3/D4 邊界（案例 10+）
  2. 每個案例加入「專家內心獨白」— 30 秒思考路徑（不是答案，是過程）
  3. 每個案例加入「誤判代價」— 做錯了浪費多少 token 或造成什麼品質損失
  4. 核心判斷問題保留並強化
- **驗收**：< 200 行、每個案例有獨白 + 代價

### T3：delegation-templates.md 重寫
- **執行者**：executor（sonnet）
- **修改檔案**：`~/.claude/skills/auto/references/delegation-templates.md`
- **具體動作**：
  1. 刪除 D2/D3/D4 prompt 模板骨架（rules/ 已涵蓋）
  2. 刪除 EXTRA_SKILLS 注入判斷表（rules/ 已涵蓋）
  3. 新增「好委派 vs 壞委派」對比表（context 品質、約束完整度、驗收可測性）
  4. 新增「委派後觀察信號」— executor 回報什麼 → 需要什麼反應
  5. 新增「常見委派失敗模式」— 3-5 個失敗案例 + 根因 + 預防
  6. 改名為「delegation-quality.md」更符合新內容
- **驗收**：< 200 行、零 rules/ 重複

### T4：dependency-analysis.md 重寫
- **執行者**：executor（sonnet）
- **修改檔案**：`~/.claude/skills/auto/references/dependency-analysis.md`
- **具體動作**：
  1. 刪除 4 項依賴檢查清單（rules/並行執行.md 已涵蓋）
  2. 刪除輸出格式說明（planner 職責，非 auto skill 範圍）
  3. 新增「隱式共享分類法」：5 類（registry, config, generated, test, state）+ 偵測方法
  4. 新增「看起來獨立但其實不獨立」3 個高頻陷阱（具體案例）
  5. 新增「D4 並行收益啟發法」：何時 >30% 收益、假並行偵測
  6. 改名為「implicit-dependencies.md」更符合新內容
- **驗收**：< 200 行、零 rules/ 重複

---

## Phase 2（串行，依賴 Phase 1 全部完成）：驗收

### T5：Knowledge Delta 掃描 + DRY 檢查 + 評分
- **執行者**：Main
- **具體動作**：
  1. 逐段標記 E/A/R，確認 Expert > 70%
  2. grep 比對 rules/深度路由.md 和 rules/並行執行.md，確認零逐字重複
  3. `wc -l` 確認行數限制
  4. `bun ~/.claude/scripts/skill-score.js auto` 跑分
  5. 若分數 < 96/120，識別最低分維度並修正（最多 2 輪迭代）
- **驗收**：總分 >= 96/120

---

## 依賴圖

```
T1 ─┐
T2 ─┤ Phase 1（並行，無依賴）
T3 ─┤
T4 ─┘
     │
     ▼
    T5    Phase 2（串行，依賴全部 Phase 1）
```

## 隱式共享分析

- T1-T4 修改不同檔案 → 無檔案共享
- T3 改名 delegation-templates.md → 需更新 SKILL.md 的資源索引引用（T1 負責）
- T4 改名 dependency-analysis.md → 需更新 SKILL.md 的資源索引引用（T1 負責）
- **風險**：T1 必須知道 T3/T4 的新檔名 → T1 prompt 中明確告知新檔名
