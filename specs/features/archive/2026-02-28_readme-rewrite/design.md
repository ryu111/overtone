# Design: README.md 完整重寫

## 技術摘要（What & Why）

- **方案**：完全重寫 README.md，從「功能列表」模式改為「3 分鐘上手」導向
- **理由**：現有 README 是開發者自用備忘錄（精確列出技術實作），不是使用者 onboarding 文件。新使用者需要的是「這是什麼 → 怎麼裝 → 怎麼用」三步驟，而非完整架構說明
- **取捨**：犧牲技術完整性（18 個 workflow 完整列表），換取可讀性和行動導向。深入資訊指向 docs/ 系列文件

## 內容結構設計

### 區塊 1：標題 + 一句話定位

```markdown
# Overtone

> 裝上 Claude Code，就像有了一個開發團隊。

BDD 驅動的工作流自動化 Plugin — 17 個 AI Agent 自動協作，即時 Dashboard 監控。
```

**設計決策**：
- 一句話定位直接取自 Product Brief，已驗證的價值主張
- 副標題用三個關鍵詞概括核心差異：BDD 驅動、自動協作、即時監控
- 不放 badge（star count 等），目前 0 star 放了反而減分

### 區塊 2：3 分鐘上手（三步驟）

三個步驟各自有明確的「做什麼 → 看到什麼」：

**步驟 1 — 安裝**：
- `git clone` 到 `~/.claude/plugins/overtone`
- 重啟 Claude Code 完成
- 說明：Claude Code 啟動時自動載入 `~/.claude/plugins/` 下的 plugin

**步驟 2 — 第一次使用**：
- 在 Claude Code 中直接描述需求（自然語言）
- 系統自動選擇 workflow 並委派對應 agent
- 展示一個真實的 prompt 範例（如：「幫我加一個 /health endpoint」）

**步驟 3 — 看到結果**：
- Dashboard 隨 session 自動啟動，瀏覽器打開 `localhost:7777`
- 描述能看到什麼：工作流進度、agent 狀態、即時 timeline

**設計決策**：
- 安裝路徑用 `~/.claude/plugins/overtone`，這是 Claude Code plugin 的標準路徑
- 不提 `bun` 安裝（Bun 是 runtime 依賴但 Claude Code 環境已有）
- 範例用最簡單的 single workflow 場景，讓使用者最快看到效果

### 區塊 3：日常 Workflow（只列 3 個）

用表格展示三個最常用的 workflow：

| Workflow | 使用場景 | 流程 |
|----------|---------|------|
| `single` | 小改動、改設定 | DEV |
| `quick` | 小功能、bug 修復 | DEV → Review + Test → 回顧 |
| `standard` | 新功能開發 | 規劃 → 架構 → 測試規格 → 開發 → 審查 + 測試 → 回顧 → 文件 |

附註一行：「共 18 個 workflow 模板，涵蓋 TDD、安全審查、E2E 測試等場景。完整列表見 docs/spec/overtone-工作流.md」

**設計決策**：
- 只列 3 個（single/quick/standard）覆蓋 80% 日常使用
- 流程用中文描述而非 stage 代號（「規劃」而非「PLAN」），降低認知負擔
- 不展示 full/secure/product 等進階 workflow，避免選擇癱瘓

### 區塊 4：運作原理

用三段文字（非表格、非列表）簡述三層架構的「為什麼」：

1. **自動流轉**：描述 Hook 系統如何自動驅動 workflow，使用者不需手動切換階段
2. **專職 Agent**：描述 17 個 agent 各司其職的概念（6 個決策型用 Opus、9 個執行型用 Sonnet、1 個文件型用 Haiku，加上 1 個 Grader）
3. **品質內建**：描述 BDD 規格先行 + Review/Test 並行 + 自動 Loop 的概念

**設計決策**：
- 不畫 ASCII 架構圖，改用段落描述（更易讀）
- 不列 agent 完整清單，指向 docs/spec/overtone-agents.md
- 強調「自動」和「內建」兩個核心差異

### 區塊 5：Dashboard

文字描述 Dashboard 功能，不放截圖（目前沒有適合 README 的截圖）：

- 即時工作流進度（pipeline 可視化）
- Agent 狀態和 timeline 歷史
- 遠端控制（暫停/停止）
- SSE 即時推送，無需重新整理

預留一行 HTML 註解標記截圖位置：`<!-- TODO: Dashboard 截圖 -->`

**設計決策**：
- 暫不提供截圖。理由：(1) E2E 測試截圖是測試用途不適合展示 (2) 手動截圖需要維護同步問題 (3) 文字描述已足夠傳達價值
- 預留位置方便未來補充

### 區塊 6：技術資訊

簡潔表格：

| 項目 | 數值 |
|------|------|
| 版本 | 0.18.0 |
| Runtime | Bun |
| Dashboard | Bun HTTP + htmx + Alpine.js（SSE 即時推送） |
| 測試 | 700+ pass / 0 fail |
| Agent | 17 個（Opus × 6 + Sonnet × 9 + Haiku × 1 + Grader） |
| Workflow | 18 個模板 |
| Hook | 7 個（7 個事件） |
| Skill | 30 個 |
| 外部依賴 | gray-matter（僅此一個） |

**設計決策**：
- 測試數用 `700+` 而非 `731`，避免每次加測試都要更新 README
- 版本號保留精確值（0.18.0），因為 plugin.json 已有 SoT，README 同步即可
- 外部依賴明確標示只有 gray-matter，強調輕量

### 區塊 7：文件索引

只列實際存在且有明確用途的文件：

| 文件 | 說明 |
|------|------|
| `docs/status.md` | 現況快讀（版本、指標、近期變更） |
| `docs/spec/overtone.md` | 設計規格索引 |
| `docs/spec/overtone-架構.md` | 三層架構、Hook、State |
| `docs/spec/overtone-工作流.md` | 18 個 workflow 模板詳細定義 |
| `docs/spec/overtone-agents.md` | 17 個 agent 定義和分工 |
| `docs/spec/overtone-並行.md` | 並行機制、Loop、Mul-Dev |
| `docs/spec/overtone-子系統.md` | Specs 系統、Dashboard |
| `docs/spec/overtone-驗證品質.md` | 三信號、pass@k、Grader |
| `docs/product-brief.md` | 產品定位與市場分析 |
| `docs/product-roadmap.md` | 產品路線圖 |
| `CLAUDE.md` | 專案規則與開發規範 |

**設計決策**：
- 移除對 HANDOFF.md 的引用 — 該文件是早期開發交接用，對新使用者無價值
- 移除 parallel-defects.md — 這是內部修復記錄，不是使用者文件
- 新增 product-brief.md 和 product-roadmap.md — 這些是 PM agent 產出的有價值文件
- 不列 docs/reference/ 下的 ECC 分析文件 — 內部參考用

### 區塊 8：環境變數

| 環境變數 | 說明 | 預設值 |
|---------|------|--------|
| `OVERTONE_PORT` | Dashboard 埠號 | `7777` |
| `OVERTONE_NO_DASHBOARD` | 設為 `1` 停用 Dashboard 自動啟動 | 未設定（啟用） |
| `OT_CORS_ORIGIN` | CORS 允許來源 | `http://localhost:7777` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token（選填） | — |
| `TELEGRAM_CHAT_ID` | Telegram 白名單 chat ID（選填） | — |

**設計決策**：
- 新增 `OVERTONE_NO_DASHBOARD`（原 README 漏掉）
- 新增 `OT_CORS_ORIGIN`（原 README 有但保留）
- Telegram 變數標示「選填」，降低必要感

## 檔案結構

```
修改的檔案：
  README.md    ← 完全重寫（~150 行，取代現有 86 行）
```

無新增檔案、無修改其他檔案。

## 關鍵技術決策

### 決策 1：測試數字用 `700+` 而非精確值

- **選擇 `700+`**：避免每次加測試都要更新 README，測試數字變化頻繁
- **未選精確值 `731`**：維護成本高，且精確數字對使用者意義不大

### 決策 2：HANDOFF.md 和 parallel-defects.md 引用處理

- **選擇：README 不引用這兩個檔案**：它們是內部開發記錄，對新使用者無 onboarding 價值
- **未選刪除檔案**：(1) 不在此次範圍 (2) HANDOFF.md 仍有歷史參考價值

### 決策 3：不放截圖

- **選擇：文字描述 + HTML 註解預留位置**
- **理由**：(1) 目前沒有適合展示的截圖 (2) 截圖需要隨 UI 變更同步維護 (3) 文字描述已能傳達 Dashboard 價值

### 決策 4：安裝路徑使用 `~/.claude/plugins/overtone`

- **選擇此路徑**：Claude Code plugin 的標準安裝位置
- **未選其他路徑**：避免使用者自行選路徑後找不到 plugin

## 實作注意事項

- 所有文件連結需用相對路徑，確保 GitHub 上可點擊
- 版本號 0.18.0 寫入 README 後，未來版本更新時需同步（但 plugin.json 是 SoT）
- 環境變數表格需與 `.env.example` 和實際程式碼一致
- Markdown 格式遵循 GitHub Flavored Markdown（GFM），表格需正確對齊
