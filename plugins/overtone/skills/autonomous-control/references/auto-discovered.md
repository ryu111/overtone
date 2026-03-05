---
## 2026-03-05 | planner:PLAN Context
L3.5 Project Orchestrator 的目標是串聯現有三個已完成的基礎設施：L3.3 Skill Forge（`skill-forge.js`）、L3.4 深度 PM（`interview.js`）、和執行佇列（`execution-queue.js`）。

現在的斷點是：PM 訪談完成後，使用者必須手動分析 Project Spec → 推導缺少的 skill → 呼叫 forge → 排程 feature。Orchestrator 自動化這三個步驟，讓系統在收到一份 Project Spec 後，能自主完成能力盤點 + skill 批次建構 + feature 排入執行佇列。
Keywords: project, orchestrator, skill, forge, interview, execution, queue, spec, feature
---
## 2026-03-05 | architect:ARCH Context
設計 `project-orchestrator.js`——一個純協調模組，串聯三個現有子系統（knowledge-gap-detector + skill-forge + execution-queue），完成「從 Project Spec 到填充佇列」的端到端自動化。所有 4 個 Open Questions 已做出明確決策。
Keywords: project, orchestrator, knowledge, detector, skill, forge, execution, queue, spec, open
