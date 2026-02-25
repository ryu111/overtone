---
name: diagnose
description: 獨立診斷。委派 debugger agent 分析錯誤根因，只診斷不修碼，產出含假設驗證的 Handoff。
disable-model-invocation: true
---

# 診斷（Diagnose）

## Stage

委派 `debugger` agent。

- **輸入**：錯誤訊息、重現步驟、使用者描述的問題
- **產出**：Handoff（根因分析 + 假設驗證記錄 + 修復建議）
- ⛔ debugger 不寫碼，只做唯讀診斷

## 與 `/ot:debug` 的區別

| | `/ot:diagnose` | `/ot:debug` |
|---|----------------|-------------|
| 範圍 | 只診斷 | 診斷 + 修復 + 驗證 |
| Stages | DEBUG | DEBUG → DEV → TEST |
| 產出 | Handoff 報告 | 修復後的程式碼 |

## 使用場景

- 只想了解問題根因，不立即修復
- 需要在修復前先確認範圍和影響
- 收集診斷資訊供人工判斷

## 後續

診斷完成後，可根據 Handoff 決定：
- 簡單修復 → `/ot:dev`（帶入 debugger Handoff）
- 完整修復流程 → `/ot:debug`
- 需要重新設計 → `/ot:architect`
