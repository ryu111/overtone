---
name: plan
description: 需求規劃。委派 planner agent 分析使用者需求、分解子任務、定義優先順序。不觸發完整工作流。
disable-model-invocation: true
---

# 需求規劃（Plan）

## Stages

### 1. PLAN — 📋 規劃

委派 `planner` agent。

- **輸入**：使用者需求描述
- **產出**：Handoff（需求分析 + 子任務清單 + 優先順序 + 並行標記）

## 使用場景

- 只想分析需求和拆解任務，不立即開始開發
- 需要在開始前釐清範圍和優先順序
- 生成 tasks.md 供 Loop 模式使用

## 後續

規劃完成後，可根據需要啟動對應的 workflow：
- 新功能 → `/ot:standard` 或 `/ot:full`
- 重構 → `/ot:refactor`
- 或讓 `/ot:auto` 自動選擇
