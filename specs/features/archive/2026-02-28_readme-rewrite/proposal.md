# Proposal: README.md 完整重寫

`readme-rewrite`

## 需求背景（Why）

- **問題**：現有 README.md 嚴重過時 — agent 數量寫 15（實際 17）、workflow 寫 15（實際 18）、測試寫 84（實際 731+）、引用不存在的 HANDOFF.md、缺少 PM agent 和產品 workflow、安裝說明過於簡略
- **目標**：新使用者 3 分鐘內完成「安裝 → 第一次使用 → 看到結果」，讓 README 成為有效的 onboarding 入口
- **優先級**：Product Brief Phase 1 核心目標，直接影響新使用者轉化率

## 使用者故事

```
身為 Claude Code 使用者
我想要 快速了解 Overtone 是什麼、怎麼安裝、怎麼用
以便 在 3 分鐘內開始使用 Overtone 提升開發效率
```

```
身為 對 Overtone 感興趣的開發者
我想要 看到清晰的價值主張和真實數字
以便 判斷是否值得花時間安裝嘗試
```

## 範圍邊界

### 在範圍內（In Scope）

- 完全重寫 README.md，替換所有過時內容
- 結構改為「3 分鐘上手」三步驟導向
- 只展示 3 個日常 workflow（single/quick/standard）
- 更新所有數字至最新（17 agent、18 workflow、731+ tests、7 hook、30 skill）
- 移除對不存在檔案的引用（HANDOFF.md、parallel-defects.md）
- 更新文件索引連結至實際存在的文件

### 不在範圍內（Out of Scope）

- 進階使用文件（屬於 docs/ 或 wiki，不在 README 展開）
- 完整列出 18 個 workflow 和 17 個 agent
- 架構深入說明（已有 docs/spec/ 系列文件）
- 修改其他文件（此次只動 README.md）

## README 結構規劃

### 區塊 1：標題 + 一句話定位
- 核心理念：「裝上 Claude Code，就像有了一個開發團隊」
- 不使用純技術描述，改用使用者能感受到的價值
- 提及關鍵數字：17 個 AI agent、自動選擇 workflow、即時 Dashboard 監控

### 區塊 2：3 分鐘上手（三步驟）
- **步驟 1 — 安裝**：`git clone` + 重啟 Claude Code = 完成（2 行指令）
- **步驟 2 — 第一次使用**：開啟 Claude Code，輸入需求描述，系統自動選擇 workflow 並委派 agent
- **步驟 3 — 看到結果**：Dashboard 自動啟動，瀏覽器打開 `localhost:7777` 即時看到進度

### 區塊 3：日常 Workflow（只列 3 個）
- single：一行改動、改設定、改文字 → 直接 DEV
- quick：小 bug、簡單功能 → DEV + Review + Test
- standard：新功能 → 完整 PLAN/ARCH/DEV/REVIEW/TEST 流程
- 附註：共 18 個 workflow 模板可用，進階用法見 docs/

### 區塊 4：運作原理（簡要概念，不列表）
- 說明三層架構的「為什麼」而非「怎麼做」
- 提到 17 個 agent 各司其職的概念，但不列出完整清單
- 提到 BDD 驅動、自動迴圈、品質把關的概念

### 區塊 5：Dashboard 截圖 / 視覺化
- 預留截圖位置（若有可用截圖）
- 描述 Dashboard 提供的價值：即時工作流進度、agent 狀態、Timeline 歷史

### 區塊 6：技術資訊（簡潔表格）
- Runtime: Bun
- Dashboard: Bun HTTP + htmx + Alpine.js
- 零外部依賴（除 gray-matter）
- 測試：731+ pass / 0 fail / 41 files

### 區塊 7：文件索引
- 只列實際存在的文件連結
- 分類：規格文件、Roadmap、現況

### 區塊 8：環境變數（可選設定）
- OVERTONE_PORT、OVERTONE_NO_DASHBOARD
- Telegram 相關（選填）

## 子任務清單

1. **撰寫 README.md 新內容**
   - 負責 agent：developer
   - 相關檔案：`README.md`
   - 說明：依照上述結構規劃完整重寫 README.md，所有數字使用最新數據

2. **驗證所有連結有效**
   - 負責 agent：developer（與 1 同步完成）
   - 相關檔案：`README.md`
   - 說明：確認 README 中引用的每個檔案路徑都實際存在，移除失效連結

## 開放問題

- architect 決定：是否需要新增 Dashboard 截圖？目前 `tests/e2e/` 有截圖但可能不適合用在 README
- architect 決定：README 中的安裝路徑使用 `~/.claude/plugins/overtone` 還是用更通用的路徑？需確認 Claude Code plugin 的官方安裝慣例
