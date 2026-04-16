# Nova Context 量體優化 — nb Round 2 回應

**日期**：2026-04-16  
**類型**：討論式（nb → Manager）  
**來源 dispatch**：xd-1776338610132-8gzf  
**問題核心**：「如果整理進 skill，會不會導致執行力下降？我要整體治本。」  
**Round 1 基礎**：nova-brain/spec/討論/ctx-optimization.md

---

## 前置：機制釐清（必讀）

在回答三問之前，先釐清一個經常混淆的機制：

| 元件 | 載入時機 | 控制者 |
|------|---------|-------|
| `rules/*.md` | **CLI 自動全量載入**，每次 session start | Claude Code CLI |
| `skills/*.md` | **AI 主動 trigger 才讀**，取決於 AI 是否決定讀 | AI 行為 |

關鍵推論：「rules 移到 skills」= 「從自動載入變成 AI 主動觸發」。  
AI 的 skill trigger 可靠度：**60-70%**（`rules/元件/元件治理.md` 明訂，Hook 才是 100%）。

這是風險的根本來源。

---

## 問題一：29 個 rules 分類

**量化基準**：29 個 rules 合計 1154 行，平均 39.8 行/檔。

### 分類依據（2 個維度）

1. **觸發頻率**：每次 session 都可能需要 vs 僅特定場景才需要
2. **缺失代價**：缺失時 AI 會做錯事 vs 只是做得比較慢/品質略低

### 分類結果

**A 類：核心行為規則 — 必須 always-in-context（20 個，815 行）**

| 目錄 | 檔案 | 理由 |
|------|------|------|
| 協作 | canonical-引用驗證.md | 每個 dispatch 都可能有 canonical list，不能預知 |
| 協作 | owner-commit-discipline.md | nb 作為 spec owner，每次 commit 前需要 |
| 協作 | 完成即討論.md | 每次 dispatch complete 都需要 next_action_proposal |
| 協作 | 跨專案協作.md | 接收/發送 dispatch 的基本規則 |
| 協作 | 討論式派發.md | 討論式 dispatch 的角色定位 |
| 協作 | 討論式派發持久化.md | 討論完成必寫 spec 檔 |
| 品質 | 回饋與進化.md | 每次任務完成後反思，不可延遲 |
| 品質 | 完成與閉環.md | 驗收品質標準，每次完成都需要 |
| 核心 | 並行執行.md | 每次規劃任務步驟時需要 |
| 核心 | 任務管理.md | TaskCreate 是 D1+ 硬性要求 |
| 核心 | 失敗與修復.md | 3 次失敗 STOP 規則，必須隨時知道 |
| 核心 | 深度路由.md | HARD GATE，每次任務都是第一步 |
| 核心 | 自驅反思.md | 每次迴圈結束需要反思四步 |
| 環境 | ralph-loop.md | Ralph session 中每輪都依賴 |
| 環境 | 寫作規範.md | 所有輸出都需要（繁體中文 + 強調標記）|
| 環境 | 總結格式.md | 每次任務結束的格式規範 |
| 環境 | 自壓縮.md | ctx > 30% 時需要知道觸發條件 |
| 元件 | 元件治理.md | 新元件分類 + memory 歸屬，頻繁需要 |
| 元件 | 模組架構.md | SSE-first 原則，每次加功能都需要 |
| 核心 | agent-harness.md | 三支柱分類，每次新元件都需要 |

**B 類：知識參考 — 可薄化或移 skill（9 個，339 行）**

| 檔案 | 可移理由 | 觸發點 |
|------|---------|-------|
| 元件/AskUserQuestion全鏈路.md | 只在修改 hook-client.js 時才需要 | 修改 hook-client.js |
| 元件/hook-discipline.md | 只在新建/修改 hooks/ 時才需要 | 寫 hook 程式碼 |
| 元件/library-caller-boundary.md | 只在寫 library 函式時才需要 | 寫帶 emit/audit 的 library |
| 協作/peer-discussion-visibility.md | 只在 Manager 派 ≥3 方討論時才需要 | 多方 dispatch |
| 品質/benchmark-winner-selection.md | 只在分析 benchmark 結果時才需要 | benchmark 分析 |
| 品質/元件孵化.md | 只在 component review 時才需要 | component-scan 週期 |
| 品質/測試規範.md | 核心觸發在 CLAUDE.md 已有，細節可移 | 寫測試時 |
| 環境/工具選擇.md | 決策規則（PinchTab 優先）已是直覺，比較表是知識 | 選瀏覽器/模型時 |
| 環境/本地模型管理.md | 只在下載模型時才需要 | 下載 HuggingFace 模型 |

**可安全移出：339 行（29% of 1154）**

---

## 問題二：不降低執行力的根治方案

「rules→skills 整體移轉」是錯誤的框架。正確問題是：

> **如何讓 1154 行的 rules/ 在 context 中佔更少空間，同時不失去行為約束力？**

### 方案比較

**方案 X：rules 索引化（最高 ROI，建議執行）**

原理：每個 rule 檔案的「動機/背景/範例/踩坑記錄」段落移至 SKILL，rule 只保留：
- 標題
- MUST/NEVER/SHOULD 條款清單（3-8 行）
- `詳見 skills/X/SKILL.md` 指向

效果試算：
```
目前：1154 行（平均 40 行/檔）
索引化後：~290 行（平均 10 行/檔）
節省：~864 行（75%）
```

執行力代價：**接近零**。MUST/NEVER 條款仍在 always-in-context。  
只有「為什麼這樣做」的背景知識移出，不影響「做什麼」。

**⚠️ 注意**：這不是「rules→skills」，是「rules 瘦身 + skills 吸收知識段落」。  
rules 目錄不縮減，files 數量不變，只是每個檔案從 40 行→10 行。

---

**方案 Y：B 類 rules 整體移 skill，留 1-2 行 stub（次高 ROI）**

原理：9 個 B 類 rules 完全搬到 SKILL，rules/ 只留：
```markdown
## hook-discipline（stub）
⚠️ SHOULD 修改 hooks/ 時先讀 `skills/hook-dev/SKILL.md`。
```

效果試算：
```
9 個 B 類 rules：339 行 → 18 行 stub
節省：321 行（28%）
```

執行力代價：**中等風險**。  
AI 觸發 skill 的可靠度 60-70%，若未觸發則邊緣情境無指引。  
緩解：stub 在 rules/ 中保留，AI 每次都看到「要去讀 skill」提示。

---

**方案 Z：CLAUDE.md 統一 MUST/NEVER list（長期理想）**

原理：把所有 MUST/NEVER 提取到 CLAUDE.md 一個「行為守則索引」段落，rules/ 全部變成知識背景。

優點：CLAUDE.md 是最高優先級，AI 最先看到。  
缺點：CLAUDE.md 會膨脹到 600+ 行；修改需要同步兩處；失去 rules/ 分類結構。

**nb 不推薦**：代價高於效益。

---

**Claude Code CLI 有沒有 lazy-load rules 機制？**

短答：**沒有**。  
`rules/` 下的所有 `.md` 無差別全量載入。沒有 tiered loading、沒有 trigger-based loading、沒有子目錄過濾。這是 CLI 的設計，nb 無法改變。

真正能控制的只有**每個 rule 檔案的行數**。

---

## 問題三：nb 立場

**結論先行：rules→skills 的正確姿勢是「方案 X 索引化」，不是整體移轉。整體移轉會降低執行力。**

### 詳細立場

**「執行力下降」的真實機制**：

```
scenario A（安全）：
  rules/ 中留 3-line stub → AI 看到「讀 skills/hook-discipline」
  → AI 決定「我要寫 hook，去讀 skill」
  → 執行力維持（但靠 AI 判斷，60-70% 可靠）

scenario B（有風險）：
  rules/ 中刪除 rule（無 stub）→ AI 不知道有這個知識
  → 邊緣情境（寫罕見的 hook pattern）AI 沒有指引
  → 執行力真正下降

scenario C（最安全）：
  rules/ 中保留完整 10-line 薄化版（只有 MUST/NEVER）
  → AI 每次都看到行為約束
  → 執行力完全維持，context 節省 75%
```

**nb 的工程建議**：

1. **優先做方案 X（索引化）**，對全部 29 個 rules 執行：
   - 把「動機 / 派生來源 / 範例 / 踩坑記錄」段落移入對應 SKILL（通常已存在，只是還沒放）
   - rules/ 每個檔案瘦到 8-15 行（標題 + MUST/NEVER + 指向）
   - 預估工作量：29 個 rules × 15 分鐘/rule = ~7 小時（可批次做）
   - **不降低執行力，節省 ~75% rules context，這是整體治本**

2. **方案 X 完成後**，對 9 個 B 類 rules 做方案 Y：
   - 整體搬移至 SKILL，rules/ 只留 2-line stub
   - 此時 stub 已是充分觸發（AI 在 rules/ 看到指向就知道去讀）
   - 額外節省：9 個 rules 從 ~10 行（方案 X 後）→ 2 行 = 72 行再節省

3. **方案 B（context-injector 延遲化）暫緩**：
   - Round 1 確認 18 個函數大多已有 null guard，真實注入量小
   - P3 的 `[ctx-measure]` log 已加入，請 Manager 觀察幾個 session 看真實數字後再決定

### 回答使用者的核心問題

> 「如果整理進 skill，會不會導致執行力下降？」

**取決於做法**：

| 做法 | 執行力 | context 節省 |
|------|--------|------------|
| 整體移到 skill（無 stub） | ⬇️ 下降，邊緣情境無指引 | 29% |
| rules 索引化（方案 X） | ✅ 維持，MUST/NEVER 仍在 | 75% |
| 索引化 + B 類 stub（方案 X+Y） | ✅ 維持（stub 確保觸發） | 78% |

> 「我要整體治本」

**治本 = 方案 X：rules 索引化**。  

根因是每個 rule 檔案混入了「動機 / 範例 / 背景」這些知識段落，這些是 Skill 的職責。`rules/元件/元件治理.md` 早已明訂：`⛔ NEVER 300 行知識塞進 Rule — Rule 是條款，Skill 是知識`。現在只是補做應該早做的事。

---

## 具體執行建議

### 第一步（優先）：量化驗證

請先觀察 `[ctx-measure]` log 幾個 session，確認：
1. SessionStart 真正注入多少 KB？
2. rules/ 在整體 context 中佔比如何？

（已在 context-injector.js SessionStart 加入此 log，xd-h09s P3 已完成）

### 第二步：方案 X 執行規劃

如果 Manager 授權，nb 可以批次執行「rules 索引化」：

| 階段 | 工作 | 結果 |
|------|------|------|
| Phase 1 | 掃描 29 個 rules，標記每個可移出的「知識段落」 | 移轉清單 |
| Phase 2 | 對應 SKILL 若存在 → append；若不存在 → 建新 SKILL | SKILL 更新 |
| Phase 3 | rules 瘦身到 8-15 行（保留 MUST/NEVER + 指向） | rules 縮小 75% |
| Phase 4 | 跑 architecture.test.js 確認所有 rule 存在性測試通過 | 驗收 |

預計工作量：D2，需要 Manager 明示 dispatch。

---

## 摘要

| 問題 | nb 結論 |
|------|--------|
| Q1：分類 | A 類 20 個（815 行，必須 always-in-context）/ B 類 9 個（339 行，可薄化移 skill） |
| Q2：替代方案 | **方案 X 索引化**（rules 薄到 MUST/NEVER + 指向）是最高 ROI 且零執行力代價的整體治本 |
| Q3：立場 | 整體移轉 = 執行力下降。正確做法是「薄化（索引化）」不是「移除」。方案 X 是 nb 推薦的整體治本路徑。 |

---

*nb 撰寫於 2026-04-16，作為 xd-8gzf Round 2 回應*
