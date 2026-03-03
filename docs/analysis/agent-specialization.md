# Agent 專一化量化分析（S19）

> 建立日期：2026-03-03
> 目的：評估 17 個 agent 的職責專一度、推理複雜度、Skill 依賴度、決策確定性，作為 model 降級決策依據
> 結果摘要：architect + retrospective 已完成降級（v0.28.18），doc-updater + grader 確認維持 haiku 合理

---

## 評分方法論

### 6 維度定義

| 維度 | 說明 | 評分標準 |
|------|------|---------|
| 職責專一度 | 職責是否單一、清晰、一句話可描述 | 1=多職責混合 / 3=2個相關職責 / 5=單一明確職責 |
| 推理複雜度 | 完成任務所需的推理深度和廣度 | 1=純文字處理 / 3=模式匹配+經驗 / 5=跨域推理長鏈邏輯 |
| Skill 依賴度 | 現有 skill 對任務需求的覆蓋程度 | 1=無對應 skill / 3=1-2 skills 部分覆蓋 / 5=3+ skills 全面覆蓋 |
| 決策確定性 | 決策是否可用規則判定（vs 語義判斷） | 1=完全模糊判斷 / 3=規則+判斷各半 / 5=完全可規則判定 |

### 降級安全條件

| 目標 Model | 條件 |
|:----------:|------|
| **haiku** | 職責專一度 ≥ 4 AND 推理複雜度 ≤ 2 AND Skill 依賴度 ≥ 4 AND 決策確定性 ≥ 4 |
| **sonnet** | 職責專一度 ≥ 3 AND（Skill 依賴度 ≥ 3 OR 決策確定性 ≥ 3）AND 不滿足 haiku 條件 AND 不觸發 opus 條件 |
| **opus** | 不滿足 sonnet 條件，或（推理複雜度 ≥ 4 AND Skill 依賴度 < 3），或（推理複雜度 ≥ 4 AND 職責專一度 < 4 AND 決策確定性 < 4） |

> **維持現況規則**：已是 haiku 的 agent（doc-updater、grader）不需重新滿足降級條件；上表適用於「從較高 model 降至目標 model」的評估場景。doc-updater（Skill 依賴度=2）和 grader（Skill 依賴度=1）的低 Skill 依賴度反映的是「任務本身不需要複雜知識支撐」，而非需要升級的訊號。
>
> **策略例外規則**：純分數推導與策略判斷可能產生差異。security-reviewer（4/4/3/3）評分與 architect/debugger 相同，但因安全漏洞的錯誤成本極高（生產漏洞 = 嚴重事故），採策略性保留在 opus，不依賴分數規則自動降級。此類例外在建議 Model 欄位以實際決策為準，並在深度分析中說明策略理由。

---

## 17 Agent 評分總表

> 欄位順序：職責專一度 / 推理複雜度 / Skill 依賴度 / 決策確定性（均 1-5 分）

| Agent | 職責專一度 | 推理複雜度 | Skill 依賴度 | 決策確定性 | 建議 Model | 當前 Model |
|-------|:--------:|:--------:|:----------:|:--------:|:--------:|:--------:|
| product-manager | 3 | 5 | 2 | 2 | opus | opus |
| planner | 4 | 5 | 2 | 3 | opus | opusplan |
| architect | 4 | 4 | 3 | 3 | sonnet | sonnet ✅ |
| developer | 4 | 3 | 3 | 3 | sonnet | sonnet |
| tester | 4 | 2 | 4 | 4 | haiku | sonnet |
| code-reviewer | 3 | 4 | 4 | 3 | opus | opus |
| security-reviewer | 4 | 4 | 3 | 3 | opus | opus |
| retrospective | 4 | 3 | 2 | 3 | sonnet | sonnet ✅ |
| doc-updater | 5 | 1 | 2 | 4 | haiku | haiku |
| qa | 4 | 3 | 3 | 3 | sonnet | sonnet |
| debugger | 4 | 4 | 3 | 3 | sonnet | sonnet |
| build-error-resolver | 5 | 2 | 3 | 4 | sonnet | sonnet |
| database-reviewer | 5 | 3 | 3 | 4 | sonnet | sonnet |
| designer | 3 | 4 | 1 | 2 | opus | sonnet |
| e2e-runner | 5 | 2 | 1 | 4 | sonnet | sonnet |
| refactor-cleaner | 5 | 2 | 3 | 5 | sonnet | sonnet |
| grader | 5 | 1 | 1 | 5 | haiku | haiku |

> ✅ = 已完成降級（v0.28.18）

---

## 深度分析：決策層 Agents

### 1. product-manager（opus）

**職責描述**：在需求模糊時追問到底，呈現取捨，偵測執行偏移。

**評分理由**：
- 職責專一度（3）：表面是「需求澄清」，但實際涵蓋需求追問、方案評估、執行監控三個面向，屬於 2 個相關職責以上
- 推理複雜度（5）：PM 工作核心是「理解人的意圖 + 預測商業影響」，需要跨域長鏈推理；沒有足夠強的推理能力會產生錯誤的需求澄清，放大後續所有階段的代價
- Skill 依賴度（2）：現有 wording skill 只覆蓋措詞面向，PM 需要的商業判斷、使用者訪談技巧、取捨分析框架均無對應 skill
- 決策確定性（2）：「這個需求是否清楚到可以執行」是語義判斷，無法規則化

**降級可行性**：不建議降級。PM 的推理複雜度是最高的（5），且決策確定性低（2）。降級會導致需求澄清品質下降，錯誤需求會放大到整個 workflow。

**強化路徑**：建立 pm-methodology skill（訪談框架、RICE 評估、需求澄清 checklist），未來若 skill 覆蓋度達到 4，可重新評估。

---

### 2. planner（opusplan）

**職責描述**：將使用者需求轉化為結構化實作計劃，分解為可執行的任務序列。

**評分理由**：
- 職責專一度（4）：核心職責清晰（需求 → 計劃），子面向包含分解、排序、風險識別
- 推理複雜度（5）：需評估多個實作方案的取捨、估算工作量、識別依賴關係；錯誤計劃的代價是整個 workflow 的返工
- Skill 依賴度（2）：wording skill 只覆蓋措詞，計劃分解的核心方法論（WBS、估算框架）無 skill 支撐
- 決策確定性（3）：部分決策可規則化（任務拆分粒度），但方案選擇仍需推理

**降級可行性**：opusplan（Opus 規劃 + Sonnet 執行）是已優化的混合模式，維持不變。若建立 planning-methodology skill 覆蓋分解框架，可考慮轉為純 sonnet，但風險較高。

---

### 3. code-reviewer（opus）

**職責描述**：以資深工程師標準審查程式碼，只在高度確信時回報問題。

**評分理由**：
- 職責專一度（3）：表面是「審查」，實際需要同時做：安全漏洞偵測、架構合理性評估、程式碼風格判斷、business logic 正確性驗證
- 推理複雜度（4）：需理解意圖，不只是 lint 規則；「這段程式碼雖然能跑但設計有問題」是高層次判斷
- Skill 依賴度（4）：code-review + wording 兩個 skill 覆蓋主要需求，提供結構化審查框架
- 決策確定性（3）：機械性問題（空指標、語法）可規則化，但架構和設計問題是語義判斷

**降級可行性**：有一定可行性，但有風險。code-reviewer 是品質門檻的最後一道守衛，降級到 sonnet 可能降低對微妙設計問題的偵測率。建議先觀察 sonnet 在 code-review skill 加強後的表現，再決定是否降級。

**強化路徑**：擴充 code-review skill references（加入 smell patterns、refactoring indicators），降低對 model 推理能力的依賴。

---

### 4. security-reviewer（opus）

**職責描述**：系統性掃描 OWASP Top 10 等安全漏洞，確保不引入安全風險。

**評分理由**：
- 職責專一度（4）：職責清晰（安全審查），雖然涵蓋多種漏洞類型，但都在同一個知識域
- 推理複雜度（4）：安全漏洞的判斷需要深度的攻擊者思維，需理解攻擊鏈而非只是表面檢查
- Skill 依賴度（3）：security-kb skill 覆蓋主要需求，但 OWASP 知識需要持續更新
- 決策確定性（3）：明顯的漏洞可規則化，但組合攻擊和業務邏輯漏洞需要推理

**降級可行性**：不建議現階段降級。安全審查的錯誤成本最高（漏洞入生產 = 嚴重事故），且推理複雜度（4）表示仍需高品質推理能力。未來若 security-kb skill 涵蓋更完整的 OWASP checklist 和 attack pattern 資料庫，可重新評估。

---

### 5. architect + retrospective（已降級，v0.28.18）

**architect 降級回顧**：
- 版本：v0.28.18（P2 Agent 進化）
- 降級前：opus → 降級後：sonnet
- 理由：architect 的核心工作是「技術方案設計」，有 wording + architecture 兩個 skill 提供知識框架，設計決策有固定的 API/資料模型範本可參考，sonnet 的推理能力足以支撐
- 觀察：降級後工作品質維持，架構文件品質不受影響（P3/P4 任務均通過 review）

**retrospective 降級回顧**：
- 版本：v0.28.18（P2 Agent 進化）
- 降級前：opus → 降級後：sonnet
- 理由：retrospective 的職責是「回顧 Handoff 記錄 + 提出優化建議」，有 wording skill 支撐，工作流已有結構化的輸入（前階段 Handoff 文件），sonnet 可按框架執行
- 觀察：降級後回顧品質維持，能識別關鍵優化點

---

## 特殊案例分析

### designer（sonnet，建議 opus）

**說明**：designer 目前無 skill 配置（Skill 依賴度 = 1），職責涵蓋 UI/UX 設計決策（職責專一度 = 3），推理複雜度高（4）。按降級邏輯，sonnet 不完全適合（Skill 依賴度 = 1 不滿足 sonnet 條件）。但由於 designer 使用頻率極低（主要在 design-system 相關任務），現階段維持 sonnet 可接受，優先事項較低。

**建議**：若 designer 使用頻率增加，應建立 design-system skill 並配置，再根據 skill 覆蓋度重新評估。

---

## 結論與建議

### 可降級項目

目前可安全降級的 agent：tester（建議 haiku，需增加 testing skill 的 BDD scenario 範本）。architect 和 retrospective 已完成降級（v0.28.18）。

未來潛在降級路徑（需先強化 skill）：

| Agent | 前提條件 | 目標 Model |
|-------|----------|:--------:|
| tester | 增加 testing skill 的 BDD scenario 範本，確認降級後任務品質維持 | haiku |
| code-reviewer | 擴充 code-review skill（smell patterns + refactoring indicators）且降級後 3 個任務 pass rate ≥ 90% | sonnet |
| security-reviewer | security-kb skill 涵蓋完整 OWASP checklist + attack patterns 資料庫 | sonnet |

### 建議維持項目

| Agent | 理由 |
|-------|------|
| product-manager (opus) | 推理複雜度 5，決策確定性 2，降級風險高 |
| planner (opusplan) | 已是混合模式（Opus 規劃）；計劃錯誤代價最高 |
| code-reviewer (opus) | 品質門檻守衛，降級需充分 skill 支撐 |
| security-reviewer (opus) | 安全漏洞代價極高，現階段不降 |
| doc-updater (haiku) | 已是最低成本，維持 |
| grader (haiku) | 已是最低成本，維持 |

### Skill 強化優先項

要提高降級安全度，以下 skill 需優先強化：

1. **pm-methodology skill（新建）**：PM 訪談框架、RICE 評估、需求澄清 checklist → 降低 product-manager 對 opus 的依賴
2. **code-review skill 擴充**：加入 smell patterns、refactoring indicators → 支援 code-reviewer 降級至 sonnet
3. **security-kb skill 擴充**：完整 OWASP checklist + 實際 attack patterns → 支援 security-reviewer 降級
4. **planning-methodology skill（新建）**：WBS 框架、估算技巧、依賴識別 → 支援 planner 轉 pure-sonnet
5. **design-system skill（新建）**：若 designer 使用頻率增加，需建立對應 skill

---

*建立日期：2026-03-03*
*基於：P2 Agent 進化（v0.28.18）+ S19 量化分析*
