# Overtone 現況

> 最後更新：2026-03-03 | Plugin 版本：0.28.17

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 2286 pass，0 fail，核心功能完整 + 守衛強化 10/10 + Knowledge Engine（skill context 自動注入 + gap detection + 知識歸檔）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 2298 pass / 0 fail |
| 測試檔案 | 99 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 16（8 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Knowledge Domain 數 | 8（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |

## 近期變更（最近 3 筆）

- **[0.28.17] 2026-03-03**：Knowledge Engine — buildSkillContext 自動注入 + detectKnowledgeGaps gap 偵測 + searchKnowledge 三源搜尋 + skill-router 知識路由歸檔 + Code Review 修復（instinct type + orphan guard）（+54 tests）→ 2286 pass / 99 files
- **[0.28.16] 2026-03-03**：三層觸發整合 + E2E — guard-system.js 統一入口（5 子系統 orchestrator）+ guard-system-e2e.test.js（三層完整性 + 真實 codebase 健康驗證）（+39 tests）→ 2232 pass / 95 files
- **[0.28.15] 2026-03-03**：Guard Test 覆蓋率守衛 — guard-coverage.test.js meta-guard（6 scanner + 4 guard + 3 hook 覆蓋 + 最低測試閘門）（+26 tests）→ 2193 pass / 94 files

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 17 個 agent（含 grader） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Dev、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
| 產品 Roadmap | docs/product-roadmap.md | Phase 計劃與進度追蹤 |
