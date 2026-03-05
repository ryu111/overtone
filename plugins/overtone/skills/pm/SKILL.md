---
name: pm
description: 產品探索與需求釐清。引導 Main Agent 以 PM 角色探索需求、定義範圍、比較方案。三種模式：discovery（純探索）、product（PM + standard pipeline）、product-full（PM + full pipeline）。
---

# 產品經理（PM）

## 初始化

根據需求選擇對應 workflow 初始化：

```bash
# 純探索（PM only）
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js discovery ${CLAUDE_SESSION_ID}

# 產品功能（PM → standard pipeline）
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js product ${CLAUDE_SESSION_ID}

# 產品完整（PM → full pipeline）
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js product-full ${CLAUDE_SESSION_ID}
```

## 模式判斷

Main Agent 解析 `/ot:pm` 的 ARGUMENTS：
- 包含 `plan` 關鍵字 → **規劃模式**（只寫佇列，不啟動 workflow）
- 不包含 → **立即執行模式**（現有預設：寫佇列 + 啟動 workflow）

## PM Stage — 🎯 產品分析

📋 MUST 委派 `product-manager` agent。⛔ NEVER 由 Main Agent 自己回答。

無論問題看起來多簡單，`/ot:pm` 被觸發時，所有分析工作都必須交給 product-manager agent。Main Agent 只負責委派和轉達結果。

- **輸入**：使用者需求（可能模糊）
- **產出**：Product Brief — 問題陳述 + 方案比較 + MVP 範圍 + BDD 驗收標準
- PM 是 advisory 角色，結果預設為 pass

## 四階段流程（agent 內部執行）

1. **Discovery**：五層追問法（表面需求 → 情境 → 現有方案 → 痛點 → 成功定義）
2. **Definition**：MoSCoW 分類、標記假設和風險、定義成功指標
3. **Options**：2-3 個方案 + RICE 評分 + 比較表格 + 推薦理由
4. **Decision**：確認方向 → 產出 Product Brief → 建議 workflow 類型

## 多輪訪談模式

適用情境（product-manager agent 判斷）：
- **複雜功能**：涉及多個系統或領域的新功能
- **新領域**：PM 對使用者業務知識不足，需深入挖掘
- **無人值守**：使用者預期 PM 自主完成完整需求分析，不即時互動

啟用後，product-manager 使用 `interview.js` 引擎執行結構化訪談：
- **五面向問題庫**：功能定義 / 操作流程 / UI 設計 / 邊界條件 / 驗收標準
- **中斷恢復**：訪談進度持久化，session 中斷後可從上次進度繼續
- **自動產出**：訪談完成後引擎自動彙整回答，產出完整 Project Spec

> 操作細節與 interview.js API：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/interview-guide.md`

## 反模式即時偵測

| 反模式 | 偵測信號 | 應對 |
|--------|---------|------|
| 方案先行 | 直接描述技術實作 | 退回追問「要解決什麼問題？」 |
| Scope Creep | Must 清單持續增長 | 提醒確認 MVP 核心 |
| 缺少指標 | 無法回答「怎樣算成功」 | 要求定義可衡量指標 |
| 目標偏移 | 討論方向與問題陳述脫節 | 對照原始問題，確認是否有意擴展 |

## 委派方式

使用 **Task** 工具委派 `product-manager` agent：

```
Task prompt 📋 MUST 包含：
(1) agent 名稱：product-manager
(2) 任務描述：產品分析 + 使用者需求
(3) 專案 context：相關檔案路徑、現有功能描述
```

## PM 完成後 — 後續 pipeline

PM stage 完成後，依據 workflow 類型讀取對應 skill 繼續執行：

| Workflow | 後續 pipeline | 讀取 |
|----------|-------------|------|
| `discovery` | PM 建議 workflow → 使用者確認 → 啟動對應 workflow | 按確認結果選擇：`${CLAUDE_PLUGIN_ROOT}/commands/{workflow}.md` |
| `product` | PLAN → ARCH → TEST:spec → DEV → [R+T] → RETRO → DOCS | `${CLAUDE_PLUGIN_ROOT}/commands/standard.md`（從 PLAN 開始） |
| `product-full` | PLAN → ARCH → DESIGN → TEST:spec → DEV → [R+T] → [QA+E2E] → RETRO → DOCS | `${CLAUDE_PLUGIN_ROOT}/commands/full.md`（從 PLAN 開始） |

PM 的 Product Brief 作為 planner 的輸入（取代使用者原始需求）。

## 實作導流（📋 MUST）

📋 MUST 根據模式決定後續行為：

📋 **PM 不可讓 Main Agent 直接寫碼。所有程式碼變更必須透過 workflow 執行。**

### Discovery 模式（`discovery` workflow）

Discovery 是探索性質，PM 完成分析後 📋 MUST 使用 AskUserQuestion 呈現選項，讓使用者決定下一步：

```
PM 產出分析結果 → AskUserQuestion（多選項）→ 使用者確認 → 才寫佇列/啟動 workflow
```

⛔ NEVER 在 discovery 模式下自動寫入佇列或啟動 workflow。使用者尚未確認方向前，一切都還是「討論」。

AskUserQuestion 選項應包含：
- 各建議方案（附 workflow 類型 + 簡述會做什麼）
- 「繼續討論」選項（回到 PM 深入探索）
- 「寫入佇列但不執行」選項（規劃模式）

### 立即執行模式（`product` / `product-full` workflow）

```
PM 產出分析結果 → 建議 workflow 類型 → 直接讀取對應 workflow command → 開始執行
```

PM 分析完成後，📋 MUST 直接啟動對應 workflow，不需額外確認。
使用者選擇 `product` / `product-full` 模式時，已隱含「分析完就執行」的意圖。

### 規劃模式（`plan` 關鍵字）

PM 完成後：
1. 用 `queue.js append --no-auto` 寫入佇列（累加，不覆寫）
2. 輸出「已加入佇列」訊息
3. 停止，不啟動 workflow
4. 使用者可用 `bun scripts/queue.js list` 查看
5. 使用者可用 `bun scripts/queue.js enable-auto` 啟動自動執行

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js append \\
  --no-auto \\
  --source "PM Plan $(date +%Y-%m-%d)" \\
  "<迭代1名稱>" "<workflow1>" \\
  "<迭代2名稱>" "<workflow2>" \\
  ...
```

### Workflow 建議矩陣

| 任務類型 | 建議 workflow | 範例 |
|---------|:------------:|------|
| 一行設定/文字修改 | single | 加 frontmatter、改 maxTurns |
| 小批修復（≤5 個關聯修改） | quick | audit 高優先修復 |
| 跨模組/涉及邏輯的修改 | standard | API 遷移 + race condition |
| 大型功能/需 UI | full | Dashboard 新功能 |

### 批次處理

多個修復任務可合併或拆分：
- **合併**：關聯性高的修復（同一模組的多個修正）→ 一次 quick/standard
- **拆分**：無關的修復 → 分別跑不同 workflow

### 多次迭代執行（📋 MUST）

PM 產出多次迭代計畫（如「3 次迭代分層精鍊」）且使用者批准後：

- 📋 MUST **連續執行所有迭代**，不在迭代之間使用 AskUserQuestion 詢問
- 每次迭代完成後直接 commit → init 下一個 workflow → 繼續執行
- ⛔ 只有在迭代 **失敗**（REVIEW REJECT 或 TEST FAIL 且 retry 用盡）時才暫停詢問
- 使用者已批准計畫 = 授權連續執行，無需重複確認

### 佇列整合

📋 MUST 僅在使用者已確認執行計畫後，才將迭代寫入佇列。
⛔ NEVER 在 discovery 討論階段或使用者尚未確認前寫入佇列。

使用者確認後，在開始第一次迭代前寫入：

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js add \\
  --source "PM Discovery $(date +%Y-%m-%d)" \\
  "<迭代1名稱>" "<workflow1>" \\
  "<迭代2名稱>" "<workflow2>" \\
  ...
```

這確保即使 session 中斷，heartbeat daemon 仍可從佇列接續執行。

每個迭代完成後，呼叫 `completeCurrent` 推進佇列：
```bash
node -e "require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/execution-queue').completeCurrent(process.cwd())"
```


## 參考文件

詳細框架與模板（按需讀取）：
- Discovery 框架：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/discovery-frameworks.md`
- 選項模板：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/options-template.md`
- 反模式指南：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/anti-patterns.md`
- Product Brief 範本：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/product-brief-template.md`
- Drift 偵測：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/drift-detection.md`
- 訪談引擎操作指引：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/interview-guide.md`（五面向結構化訪談 + interview.js API + 中斷恢復）
- Discovery 實戰範例：`${CLAUDE_PLUGIN_ROOT}/skills/pm/examples/discovery-session-walkthrough.md`

## 完成條件

- ✅ PM stage 完成
- ✅ Product Brief 已產出
- ✅ 已依據模式決定後續：discovery → 使用者確認後執行，product → 直接啟動，plan → 寫佇列停止