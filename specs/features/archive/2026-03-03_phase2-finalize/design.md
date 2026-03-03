# Phase2-Finalize — 技術設計

## 技術摘要（What & Why）

- **方案**：純文件修改方案 — 直接針對 4 個目標文件進行精確內容補充，搭配新建 `docs/analysis/agent-specialization.md` 分析文件
- **理由**：本次範圍全為文件缺口補齊（P4）+ 量化分析建立（S19），無程式碼修改，選擇最小化修改面的方案。每個文件的修改範圍已在 proposal 中明確定義，不存在架構決策選擇。
- **取捨**：S19 僅分析不執行，agent model 配置不變，避免在未有完整量化基礎前貿然降級；後續實際降級需依據本分析文件的結論另行 feature

## API 介面設計

本次為純文件修改，無程式碼 API。文件的「介面」定義如下：

### agent-specialization.md 的消費者介面

```
文件位置：docs/analysis/agent-specialization.md
讀取方式：人工閱讀（非程式碼 import）
消費者：
  - product-manager（產品決策）
  - architect（技術設計參考）
  - 未來 S19 執行（降級決策依據）
```

### 文件修改介面（各文件修改點）

| 文件 | 修改位置 | 修改類型 |
|------|----------|----------|
| CLAUDE.md | `skills/` 行 + `設計原則第 5 項` | 追加一行（11 個 domain 清單） |
| docs/vision.md | Layer 1 表格「學習框架」欄位 | 修改單一 cell（補充 11 domain） |
| docs/roadmap.md | P1 說明 + P2 說明 + P4/S19 狀態 | 修改 3 行 |
| docs/status.md | 確認一致性，必要時微調 | 唯讀確認 or 微調 |

## 資料模型

### agent-specialization.md 的量化評分模型

6 維度評分表（每個 agent 一行）：

```
維度 1：職責專一度（1-5）
  定義：agent 的工作是否聚焦於單一明確的任務類型
  1 = 職責跨多個不同領域（如 PM + architect 混合）
  2 = 主要職責清晰但有次要職責跨域
  3 = 職責明確但有少量邊界模糊情況
  4 = 職責清晰，偶有合理的職責延伸
  5 = 職責單一，輸入和輸出格式固定

維度 2：推理複雜度（1-5）
  定義：完成任務所需的語意理解和多步推理深度
  1 = 純格式轉換或模板填充（無推理）
  2 = 簡單判斷（if-else 類型的決策）
  3 = 中等推理（需要理解上下文，做有限判斷）
  4 = 複雜推理（需要跨模組理解、評估多個方案）
  5 = 高度複雜推理（需要策略性思考、模糊需求澄清、長期規劃）

維度 3：Skill 依賴度（1-5）
  定義：agent 的工作有多少比例可由 Skill 提供的知識覆蓋
  1 = Skill 完全無法覆蓋（任務依賴純模型知識）
  2 = Skill 覆蓋 < 25%（提供少量參考知識）
  3 = Skill 覆蓋 ~50%（提供核心框架知識）
  4 = Skill 覆蓋 > 75%（大多數知識可查表）
  5 = Skill 覆蓋 > 90%（幾乎完全可查表執行）

維度 4：決策確定性（1-5）
  定義：給定相同輸入，輸出的可預測程度
  1 = 高度不確定（同樣輸入可能有多種合理輸出）
  2 = 較不確定（有規律但有大量例外情況）
  3 = 中等確定（有清楚規則，但需判斷情境）
  4 = 高確定性（規則明確，例外少且有定義）
  5 = 完全確定性（輸入→輸出幾乎是確定性映射）

維度 5：建議 Model
  依據：職責專一度 ≥4 AND Skill 依賴度 ≥4 AND 決策確定性 ≥4 → 可降至 haiku
       職責專一度 ≥3 AND 推理複雜度 ≤3 → 可維持 sonnet
       推理複雜度 ≥4 OR 需要跨 session 記憶 → 建議 opus

維度 6：當前 Model（現況）
```

### 降級安全條件

```
降級至 haiku 的前提條件（三個同時滿足）：
  - 職責專一度 ≥ 4
  - Skill 依賴度 ≥ 4
  - 決策確定性 ≥ 4

降級至 sonnet（從 opus）的前提條件：
  - 推理複雜度 ≤ 3
  - 不需要跨 session 記憶（或記憶需求可由 Skill 替代）

維持 opus 的條件（任一滿足）：
  - 推理複雜度 ≥ 4
  - 需要跨 session 記憶（memory: local）
  - 是主要決策節點（planner/PM 級別）
```

## 檔案結構

```
新增的檔案：
  docs/analysis/                             ← 新增目錄（需建立）
  docs/analysis/agent-specialization.md     ← 新增：17 agents × 6 維度量化分析

修改的檔案：
  CLAUDE.md                                  ← 修改：skills/ 行補充 11 個 knowledge domain 清單
  docs/vision.md                             ← 修改：Layer 1 表格「學習框架」cell 補充 domain 數量
  docs/roadmap.md                            ← 修改：P1 說明 + P2 說明 + P4 狀態 → ✅ + S19 狀態 → ✅

唯讀確認（不修改）：
  docs/status.md                             ← 確認一致性（已對齊，不需修改）
```

## agent-specialization.md 完整結構設計

```markdown
# Agent 專一化精鍊 — 量化評估（S19）

> 建立日期：YYYY-MM-DD
> 目的：量化評估 17 個 agent 的專一化程度與 model 降級空間

## 評分方法論

[6 維度定義 + 評分標準 + 降級條件]

## 評分總表

| Agent | 職責專一度 | 推理複雜度 | Skill 依賴度 | 決策確定性 | 建議 Model | 當前 Model | 結論 |
|-------|-----------|-----------|-------------|-----------|-----------|-----------|------|
（17 行）

## 深度分析 — 決策層 agents（目前 opus/opusplan）

### product-manager（opus）
[職責描述 + 各維度評分理由 + 降級分析]

### planner（opusplan）
[職責描述 + 各維度評分理由 + 降級分析]

### code-reviewer（opus）
[職責描述 + 各維度評分理由 + 降級分析]

### security-reviewer（opus）
[職責描述 + 各維度評分理由 + 降級分析]

### 已完成降級：architect（opus → sonnet，v0.28.18）
[降級理由回顧 + 降級後觀察]

### 已完成降級：retrospective（opus → sonnet，v0.28.18）
[降級理由回顧 + 降級後觀察]

## Skill 完善度 vs Model 需求映射

[Skill 覆蓋率與 model 需求的關係分析]

## 結論與建議

### 可降級項目
[有充分依據可降級的 agent 清單 + 降級路徑]

### 建議維持項目
[應維持現有 model 的 agent 清單 + 理由]

### Skill 強化優先項
[若要提高降級安全度，需先強化哪些 agent 的 Skill 覆蓋]
```

## 各文件具體修改內容

### CLAUDE.md 修改

目標行（第 57 行）：
```
├── skills/         # 19 個 Skill（WHAT — 知識域 + orchestrator + utilities-with-refs）
```

修改後：
```
├── skills/         # 19 個 Skill（WHAT — 知識域 + orchestrator + utilities-with-refs）
│                   # 11 knowledge domains: testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system
```

注意：code block 內的內容，不需要修改「設計原則第 5 項」（CLAUDE.md 中沒有此項目，vision.md 才有）。

### docs/vision.md 修改

目標 cell（第 39 行，Layer 1 表格「學習框架」欄位）：
```
| 學習框架 | 觀察 → 記憶 → 改進 | Instinct + Knowledge Engine |
```

修改後：
```
| 學習框架 | 觀察 → 記憶 → 改進 | Instinct + Knowledge Engine（11 domains） |
```

### docs/roadmap.md 修改

目標 1 — P1 說明（第 34 行）：
```
| P1 | Skill 知識充實 | 新建 3 domain（debugging、architecture、build-system）+ 強化 5 既有 domain + 17 新 reference 檔案 | ✅ |
```

修改後（反映實際完成結果：11 個 domains）：
```
| P1 | Skill 知識充實 | 新建 3 domain（debugging、architecture、build-system）+ 強化 8 既有 domain，共 11 domains + 17 新 reference 檔案 | ✅ |
```

目標 2 — P2 說明（第 35 行）：
```
| P2 | Agent 進化 | 評估 agent 拆分機會、職責邊界精鍊、model 降級空間（→ S19） | ✅ |
```

修改後（反映實際完成：architect + retrospective 已降級，S19 量化分析獨立完成）：
```
| P2 | Agent 進化 | architect + retrospective 降級 opus → sonnet（v0.28.18）；S19 量化分析完成 | ✅ |
```

目標 3 — P4 狀態（第 37 行）：
```
| P4 | 文件同步 | vision.md + roadmap.md + status.md + CLAUDE.md 全面對齊 | 🔵 進行中 |
```

修改後：
```
| P4 | 文件同步 | vision.md + roadmap.md + status.md + CLAUDE.md 全面對齊 | ✅ |
```

目標 4 — S19 狀態（第 103 行）：
```
| S19 | Agent 專一化精鍊 | 評估 agent 拆分機會 + Model 降級空間 + skill 完善度與 model 需求的關係量化 | 🔵 |
```

修改後：
```
| S19 | Agent 專一化精鍊 | 評估 agent 拆分機會 + Model 降級空間 + skill 完善度與 model 需求的關係量化 | ✅ |
```

目標 5 — roadmap.md 標頭說明（第 3 行）：
```
> 最後更新：2026-03-03 | 當前 Phase：核心穩固（Level 1 → Level 2，P4 進行中）
```

修改後：
```
> 最後更新：2026-03-03 | 當前 Phase：核心穩固（Level 1 → Level 2，P4 完成）
```

## 關鍵技術決策

### 決策 1：CLAUDE.md knowledge domain 清單的位置

- **選擇**：追加在 `skills/` 一行的下方，作為縮進的次行說明
- **理由**：不破壞現有的 code block 格式，domain 清單是補充說明而非主要目錄項目。與 status.md 的「Knowledge Domain 數」行形式一致（逗號分隔）
- **未選**：新增獨立的 `## Knowledge Domains` 章節 — 過度設計，CLAUDE.md 定位是快速參考而非完整規格

### 決策 2：S19 評分維度的量表設計

- **選擇**：6 維度中的 4 個量化維度採用 1-5 分制，每分有明確的操作型定義（見上方「資料模型」章節）
- **理由**：操作型定義確保不同 agent 的評分具有一致性（不是「感覺」而是可驗證的標準）。「建議 Model」和「當前 Model」作為派生欄位，不需另外評分
- **未選**：採用百分比制 — 1-5 分制對人工評估更直觀，精度足夠

### 決策 3：降級建議的處理方式

- **選擇**：在 agent-specialization.md 中以「結論與建議」章節呈現，附明確的降級條件判斷；roadmap 更新 S19 狀態為 ✅，不另建 TODO
- **理由**：分析文件是降級決策的唯一 source of truth，後續如有降級需求應作為新 feature 執行（不在本次範圍）。roadmap 的任務顆粒度是「分析完成」，具體降級是另一個任務。
- **未選**：在 roadmap 新增「S20 執行降級」條目 — 範圍 creep，需另行 PM Discovery 決定

### 決策 4：docs/status.md 修改方向

- **選擇**：唯讀確認，不修改
- **理由**：status.md 已包含所有 11 個 knowledge domain（第 23 行）、核心指標正確、近期變更正確。無實質缺口。
- **條件**：若 developer 在確認時發現確實有缺口，以最小修改原則補齊

## 實作注意事項

給 developer 的提醒：

1. **docs/analysis/ 目錄不存在**：需先建立目錄（`mkdir docs/analysis`）再建立文件
2. **CLAUDE.md code block 格式**：注意修改在 ``` 圍起的代碼塊內，維持一致的縮排對齊
3. **agent-specialization.md 的日期**：使用實際執行日期（2026-03-03），不是模板佔位符
4. **S19 評分需要讀取 agent frontmatter**：各 agent 的 skills 欄位是評估「Skill 依賴度」的關鍵輸入；需同時閱讀各 agent 的 prompt body 以評估「職責專一度」和「推理複雜度」
5. **roadmap.md 的 P1 說明**：確認實際 domain 數量（11 個）和強化數量（共 11 個，其中 3 個新建 + 8 個既有強化），確保修改後數字準確
6. **不 bump-version**：本次純文件變更，無程式碼修改，不需要更新 plugin.json
