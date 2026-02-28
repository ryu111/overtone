---
name: pm
description: 產品探索與需求釐清。引導 Main Agent 以 PM 角色探索需求、定義範圍、比較方案。三種模式：discovery（純探索）、product（PM + standard pipeline）、product-full（PM + full pipeline）。
disable-model-invocation: true
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

## PM Stage — 🎯 產品分析

委派 `product-manager` agent。

- **輸入**：使用者需求（可能模糊）
- **產出**：Product Brief — 問題陳述 + 方案比較 + MVP 範圍 + BDD 驗收標準
- PM 是 advisory 角色，結果預設為 pass

## 四階段流程（agent 內部執行）

1. **Discovery**：五層追問法（表面需求 → 情境 → 現有方案 → 痛點 → 成功定義）
2. **Definition**：MoSCoW 分類、標記假設和風險、定義成功指標
3. **Options**：2-3 個方案 + RICE 評分 + 比較表格 + 推薦理由
4. **Decision**：確認方向 → 產出 Product Brief → 建議 workflow 類型

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
| `discovery` | PM 建議 workflow → 直接讀取對應 workflow skill 開始執行 | 按建議選擇：`${CLAUDE_PLUGIN_ROOT}/skills/{workflow}/SKILL.md` |
| `product` | PLAN → ARCH → TEST:spec → DEV → [R+T] → RETRO → DOCS | `${CLAUDE_PLUGIN_ROOT}/skills/standard/SKILL.md`（從 PLAN 開始） |
| `product-full` | PLAN → ARCH → DESIGN → TEST:spec → DEV → [R+T] → [QA+E2E] → RETRO → DOCS | `${CLAUDE_PLUGIN_ROOT}/skills/full/SKILL.md`（從 PLAN 開始） |

PM 的 Product Brief 作為 planner 的輸入（取代使用者原始需求）。

## 實作導流（📋 MUST）

PM 分析完成後，📋 MUST 直接啟動對應 workflow，不需額外確認。

📋 **PM 不可讓 Main Agent 直接寫碼。所有程式碼變更必須透過 workflow 執行。**

### 導流流程

```
PM 產出分析結果 → 建議 workflow 類型 → 直接讀取對應 workflow skill → 開始執行
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

## 參考文件

詳細框架與模板（按需讀取）：
- Discovery 框架：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/discovery-frameworks.md`
- 選項模板：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/options-template.md`
- 反模式指南：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/anti-patterns.md`
- Product Brief 範本：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/product-brief-template.md`
- Drift 偵測：`${CLAUDE_PLUGIN_ROOT}/skills/pm/references/drift-detection.md`

## 完成條件

- ✅ PM stage 完成
- ✅ Product Brief 已產出
- ✅ 已依據 workflow 類型讀取對應 skill 繼續執行（含 discovery 導流）
