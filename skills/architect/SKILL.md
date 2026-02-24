---
name: architect
description: 架構設計。委派 architect agent 分析現有架構並設計技術方案、API 介面、資料模型、檔案結構。
disable-model-invocation: true
---

# 架構設計（Architect）

## Stage

委派 `architect` agent。

- **輸入**：planner 的 Handoff（或使用者需求描述）
- **產出**：Handoff（技術方案 + API 介面 + 資料模型 + 檔案結構）

## 使用場景

- 已有 planner Handoff，只需進行架構設計
- 需求清晰，直接跳過規劃進入技術設計
- 重新審視或調整現有架構

## 後續

架構設計完成後：
- 含 UI → `/ot:design`（UI/UX 設計）
- 需要 BDD spec → 委派 `tester` agent（TEST:spec 模式）
- 直接開發 → `/ot:dev`
- 或啟動完整工作流 → `/ot:standard` / `/ot:full`
