# Instinct References — 內化知識參考索引

> instinct skill 是跨專案學習飛輪的知識儲存庫，由 `evolution.js internalize` 自動維護。

## 系統架構

```
session 觀察資料（observations.jsonl / scores.jsonl）
        ↓
  skill-evaluator.js  — 評估門檻（usageCount / avgScore / confidence）
        ↓
  skill-generalizer.js — 通用化（移除專案路徑、版本號等特定內容）
        ↓
  auto-discovered.md  — 候選知識條目（暫存，待評估）
        ↓  evolution.js internalize --execute
  internalized.md     — 永久知識條目（通過評估後寫入）
        ↓
  experience-index.js — 更新全域經驗索引（projectHash → domains）
```

## 評估門檻（skill-evaluator.js）

三個維度，全部達標才算 qualified：

| 維度 | 說明 | 預設門檻 |
|------|------|----------|
| `usageCount` | domain 相關 agent 使用次數（來自 observations.jsonl） | ≥ 2 |
| `avgScore` | 平均評分（來自 scores.jsonl，0-5） | ≥ 3.5 |
| `confidence` | 觀察信心度（來自 global observations，0-1） | ≥ 0.6 |

## 通用化規則（skill-generalizer.js）

段落包含以下任一模式時整段移除：
- 絕對路徑（`/Users/...`、`/home/...`、`C:\...`）
- 專案特定目錄（`plugins/overtone/`、`scripts/lib/`）
- 具體 require/import 路徑
- 版本號（`v1.2.3` 或 `@^1.0.0`）

## 使用方式

```bash
# 預覽內化結果（dry-run）
bun scripts/evolution.js internalize

# 執行內化（寫入 internalized.md + 更新 experience-index）
bun scripts/evolution.js internalize --execute

# JSON 格式輸出
bun scripts/evolution.js internalize --json
```

## 相關模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| skill-evaluator | `scripts/lib/knowledge/skill-evaluator.js` | 評估門檻 |
| skill-generalizer | `scripts/lib/knowledge/skill-generalizer.js` | 通用化處理 |
| experience-index | `scripts/lib/knowledge/experience-index.js` | 全域經驗索引（projectHash → domains） |
| global-instinct | `scripts/lib/knowledge/global-instinct.js` | 跨專案 observations 查詢 |
