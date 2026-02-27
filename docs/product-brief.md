# Overtone Product Brief

> 產出日期：2026-02-28 | Discovery 模式 | PM Agent 五層追問法

## 產品定位

> **Overtone — 裝上 Claude Code，就像有了一個開發團隊。**

差異化：全自動 pipeline + 品質內建（vs ECC 半手動、vs Claude Code 無結構）

## 問題陳述

Overtone 是一個 Claude Code plugin 產品，目標是讓使用者「裝上就像有了一個開發團隊」。它處於一個已被驗證有需求的市場（ECC 50K+ stars），擁有明確的差異化（全自動 pipeline vs 手動命令串接），但目前面臨兩個交織的問題：

1. **產品尚未被任何外部使用者驗證過**。GitHub repo 公開（2026-02-23 創建），0 star、0 fork、0 watcher。
2. **作者自身識別出的失真模式正在發生**：AI 能力追不上設計（18 個 workflow 但 Main Agent 路由不穩定）+ 功能膨脹（5 天建成 17 個 agent、18 個 workflow、28 個 skill）。

這不是一個「缺功能」的問題。這是一個「產品找不到第一個用戶」的問題。

## 市場定位

| | Claude Code 原生 | ECC | Overtone |
|--|--|--|--|
| 核心動詞 | 輔助（你說，它做） | 指揮（你安排，它執行） | 委託（你說要什麼，它全部搞定） |
| 使用者角色 | 程式設計師 | 技術主管 | 產品負責人 |
| 自動化程度 | 無 | 半自動 | 全自動 |
| 品質保證 | 無 | 可選 | 內建 |
| 可見性 | 無 | 無 | Dashboard |

Overtone 的護城河不是功能數量，而是「全自動 + 品質內建」的組合。

## 五層追問洞察

### 迭代歷程

claude-workflow → vibe → overtone，至少三代產品追求同一目標：「結構化的 AI 開發流程」。每一代都「失真」。

### 四個關鍵洞察

| # | 洞察 | 證據 |
|---|------|------|
| 1 | Overtone 的對手不是 ECC 或 Cursor，而是**自己的前身** | 三代產品同一目標，從未深入研究外部替代方案 |
| 2 | **AI 能力追不上設計**是最危險的失真模式 | Main Agent 需理解 101 行 auto/SKILL.md + 18 workflow + 16 agent |
| 3 | 使用者要的是**品質可信**而非**全自動化** | 成功畫面 =「專注創造，不擔心品質」，非「一鍵搞定」 |
| 4 | **單一樣本風險** — 唯一用戶是開發 Overtone 本身的人 | 0 個外部專案使用過，507 tests 測的是「能跑」不是「有用」 |

### 使用者回答摘要

| 層次 | 問題 | 回答 |
|------|------|------|
| L2-1 | 起源動機 | 全選 +「建立完美 AI 團隊，讓任何人完成理想作品」 |
| L2-2 | 使用場景 | 主要開發 Overtone 本身 |
| L2-3 | 核心價值（消失測試） | 工作流自動化 |
| L3-1 | 替代方案 | Claude Code 沒結構 + AI IDE 方向不同 + 自己做了三代 |
| L3-2 | 目標用戶 | 主要是自己，「任何人」是未來願景 |
| L4 | 最大障礙 | 功能不夠穩（核心流程偶爾出錯） |
| L5-1 | 失真定義 | AI 能力追不上設計 + 功能膨脹 |
| L5-2 | 成功畫面 | 品質保證自動化，專注創造 |
| L5-3 | 自省 | 不確定是否已失真，需要跳出來看 |
| P1 | 離可發布差什麼 | 完整度跟穩定性 |
| P2 | vs ECC 差異化 | 全自動 vs 半手動 |
| P3 | 一句話賣點 | 「裝上就像有了一個開發團隊」 |

## 目標用戶

### 主要 Persona（現階段）

| 維度 | 描述 |
|------|------|
| 身份 | 獨立開發者，用 Claude Code 作為主要開發工具 |
| 痛點 | Claude Code 產出品質不穩定，需要手動確保測試和 review |
| 期望 | 品質保證自動化，專注創造 |

### 次要 Persona（下一階段驗證）

| 維度 | 描述 |
|------|------|
| 身份 | 活躍於 AI coding 社群的開發者，已在用 Claude Code 或 ECC |
| 痛點 | ECC 太手動，Claude Code 太自由，想要更結構化的工作流 |
| 取得管道 | GitHub、Reddit r/ClaudeAI、Twitter/X |

## 成功指標

### 階段 1：自用穩定（2 週內）

| 指標 | 目標值 |
|------|--------|
| 核心 workflow 完成率（single/quick/standard 各 10 次） | > 80% |
| Main Agent 路由準確率 | > 90% |
| 外部專案驗證（非 Overtone 專案跑通 standard workflow） | >= 1 次 |

### 階段 2：首批外部用戶（2-4 週）

| 指標 | 目標值 |
|------|--------|
| 首次使用者完成率（安裝後第一次用 quick workflow 成功） | > 60% |
| GitHub stars | > 10 |
| 7 天留存率 | > 30% |

## MVP 範圍（MoSCoW）

### Must（沒有就不能發布）

- 3 個核心 workflow 穩定運作：`single`, `quick`, `standard`
- `/ot:auto` 在這 3 個 workflow 上的路由準確率 > 90%
- Loop 機制穩定（不卡住、不漏判）
- PM agent / discovery workflow — 結構化需求探索和 drift 偵測
- 安裝後第一次使用的引導體驗（SessionStart banner 清晰告知可以做什麼）
- README 重寫：聚焦「3 分鐘上手」而非列出 18 個 workflow

### Should（重要但不阻擋發布）

- Dashboard 基本監控（看到 workflow 進度和 agent 狀態）
- 失敗重試迴圈（TEST FAIL → DEBUG → DEV → TEST）
- BDD spec 前置生成
- `full` 和 `secure` workflow 穩定運作

### Could（有了加分，沒有不扣分）

- pass@k 統計和品質指標
- Specs 系統（feature 生命週期）
- 並行品質關卡（[REVIEW + TEST] 同時跑）
- Dashboard 動畫和 Glassmorphism 設計
- Instinct 學習系統

### Won't（本階段明確排除）

- V2 功能（多模型審查、Slack/Discord Adapter、自定義 Agent 擴充）
- Grader agent
- Remote 控制（Telegram Adapter）
- 特化 workflow 優化（`db-review`, `clean`, `diagnose` 等保留但不投入）

> **決策記錄**（2026-02-28）：PM agent 從 Won't 移至 Must。PM agent 是核心產品能力，提供結構化的需求探索和 drift 偵測。

## 失真模式防護

### 失真檢測清單（每次開發前自問）

| 檢查項 | 問題 | 失真信號 |
|--------|------|----------|
| 動機測試 | 這個功能是因為有人需要，還是因為我可以做？ | 答不出具體使用場景 |
| 複雜度測試 | 這會讓 Main Agent 的 SKILL.md 變長嗎？ | auto/SKILL.md 超過 120 行 |
| 外部驗證 | 有沒有任何非我本人的人要求過這個功能？ | 所有功能都是自己想的 |
| 10 次測試 | 這個 workflow 我連跑 10 次，成功幾次？ | 成功率低於 80% |

### 量化指標上限

| 指標 | 當前值 | 上限 |
|------|--------|------|
| auto/SKILL.md 行數 | 101 行 | ≤ 120 行 |
| Workflow 模板數 | 18 個 | ≤ 20 個（新增需有使用數據） |
| Agent 數量 | 17 個 | 凍結 17 個，不新增 |

## 驗收標準（BDD）

```gherkin
Scenario: 新使用者首次體驗
  Given 一個從未用過 Overtone 的開發者
  When 他按照 README 指示安裝 plugin 並啟動 Claude Code
  Then 他在 3 分鐘內理解 Overtone 能做什麼
  And 他成功用 quick workflow 完成一個小任務
  And 他不需要閱讀任何額外文件

Scenario: 核心 workflow 穩定性
  Given Overtone 安裝在任一 JavaScript 專案
  When 使用者連續 10 次使用 quick workflow 完成不同的小任務
  Then 至少 8 次成功走完所有 stage 且無人工介入
  And Main Agent 路由準確率 >= 90%

Scenario: 產品差異化體驗
  Given 使用者輸入「實作一個 /health 端點」
  When Overtone 自動完成 DEV → [REVIEW + TEST]
  Then 使用者收到可運行的程式碼 + 有實質內容的 review 報告 + 通過的測試
  And 整個過程使用者不需要手動下任何中間指令
```

## 假設 & 風險

| 假設/風險 | 影響 | 緩解方案 |
|-----------|------|----------|
| 假設：「全自動 pipeline」是使用者想要的 | 致命 | 階段 2 觀察首批使用者行為 |
| 假設：Main Agent 能穩定路由 3 個核心 workflow | 高 | 階段 1 量化：跑 30 次記錄準確率 |
| 風險：瘦身成本高 | 中 | 先做邏輯聚焦（README/SKILL.md），不做物理刪除 |
| 風險：ECC 先佔市場 | 中 | 定位在「全自動」，和 ECC「最多功能」是不同區隔 |
| 風險：第四次失真 | 高 | 嚴格執行失真檢測清單；兩週 checkpoint 回顧 |

## 下一步行動（按優先序）

### 1. 穩定核心三條路（最高優先）

single/quick/standard 各跑 10 次真實任務，記錄每次的路由準確性、完成率、人工介入次數。完成率 > 80%，低於則找根因修復。

### 2. 重寫 README 為「3 分鐘上手指南」

從「列出所有功能」改為「安裝 → 第一次使用 → 看到結果」三步驟。只展示 3 個核心 workflow，完整清單移到 docs/。

### 3. 外部專案實戰

在非 Overtone 專案上用 standard workflow 完成一個真實功能，完整記錄過程中的所有問題。

## Open Questions

1. auto/SKILL.md 的 101 行認知負荷是否需要拆分為分層載入？
2. 「功能不夠穩」的根因分類：是路由錯？agent 產出差？Loop 誤判？Hook 誤擋？
3. 發布策略：先完成行動 1-3 再推廣？還是先在 r/ClaudeAI 發文收集回饋？
4. plugin.json description 是否改為「裝上 Claude Code，就像有了一個開發團隊」？

---

> **PM 直言**：接下來的重點不是建構更多功能，而是驗證已建的功能到底好不好用。三代產品的失真循環都是「建得太快、驗證得太少」。打破循環的方法是停下來，用 30 次真實任務看清楚現況。
