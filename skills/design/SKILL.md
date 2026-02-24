---
name: design
description: UI/UX 設計。委派 designer agent 設計使用者介面流程、元件規格、互動方式。適用於含 UI 的任務。
disable-model-invocation: true
---

# UI/UX 設計（Design）

## Stage

委派 `designer` agent。

- **輸入**：architect 的 Handoff（或使用者介面需求）
- **產出**：Handoff（元件清單 + 互動流程 + 響應式規格）

## 使用場景

- 已有架構設計，只需進行 UI/UX 規格設計
- 純 UI 任務（不涉及後端）
- 需要在 DEV 前定義明確的元件規格

## 後續

UI 設計完成後：
- 繼續開發 → `/ot:dev`（帶入 designer Handoff）
- 需要 BDD spec → 委派 `tester` agent（TEST:spec 模式）
- 或啟動完整工作流 → `/ot:full`
