---
feature: auto-skill-rewrite
depth: D2
status: done
created: 2026-03-17
---

## Tasks

### Phase 1：SKILL.md 重寫

#### T1：SKILL.md 內容替換與新增
- **執行者**：executor（sonnet）
- **修改檔案**：`~/.claude/skills/auto/SKILL.md`
- **具體動作**：
  1. 替換「校準嗅覺 > 過度設計偵測」表格（4 行）→「認知陷阱」段落（3 個陷阱 + 解藥）
  2. 替換「校準嗅覺 > 深度不足偵測」表格（3 行）→ 合併進認知陷阱段落
  3. 強化「模糊任務降維法」→ 加入「語言學信號」表（4 行任務描述動詞→深度對照）
  4. 新增「情境路由」表（3 行，連結 boundary-cases / delegation-quality / implicit-dependencies）
  5. 新增「判斷流程快速路徑」（核心兩問→語言信號→決策密度→可逆性→成本→最終深度）
  6. 微調 frontmatter description：縮短，強化 WHEN 條件
  7. 精簡整體行數至 90-110 行（砍 Activation，保留 Expert）
- **context forwarding**：
  - 現有 SKILL.md 全文（已在 prompt 提供）
  - design.md 的「SKILL.md 具體變更」段落
  - references/ 3 個檔案名（boundary-cases.md、delegation-quality.md、implicit-dependencies.md）
  - rules/深度路由.md 和 rules/並行執行.md 的引用路徑（讓 executor 加正確的引用）
- **驗收**：
  - SKILL.md 90-110 行
  - 「認知陷阱」段落存在且含 3 個具體場景
  - 「語言學信號」表存在
  - 「情境路由」表存在且連結 3 個 references
  - 「判斷流程快速路徑」存在
  - NEVER 段落所有條目有 BECAUSE
  - 與 rules/ 零逐字重複

---

### Phase 2：驗收（依賴 Phase 1）

#### T2：Knowledge Delta 掃描 + 評分
- **執行者**：Main
- **具體動作**：
  1. 逐段標記 E/A/R，確認 Expert > 70%
  2. grep 比對 rules/深度路由.md 和 rules/並行執行.md，確認零逐字重複
  3. wc -l 確認 90-110 行
  4. skill-judge 語意評分
  5. 若分數 < 96/120，識別最低分維度修正（最多 2 輪迭代）
- **驗收**：skill-judge 總分 >= 96/120（B 級）

---

## 依賴圖

```
T1 (executor)
  │
  ▼
T2 (Main 驗收)
```

## 隱式共享分析

- T1 只改 SKILL.md，不動 references/ → 無檔案共享風險
- T1 需要知道 references/ 的檔名 → 在 T1 prompt 中明確列出
- references/ 不動 → 無需擔心 SKILL.md 的引用路徑過時
