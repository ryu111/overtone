# Overtone 現況

> 最後更新：2026-03-03 | Plugin 版本：0.28.19（auto-discovered dedup 修復）

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
| 測試通過 | 2381 pass / 0 fail |
| 測試檔案 | 99 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 19（11 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Knowledge Domain 數 | 11（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |

## 近期變更（最近 3 筆）

- **[0.28.19] 2026-03-03**：auto-discovered dedup 修復（knowledge-searcher 去重邏輯）（+7 tests）→ 2381 pass / 99 files
- **[0.28.18] 2026-03-03**：P2 Agent 進化（architect + retrospective Opus→Sonnet，memory:local 移除，config-api.js agentMemory 同步修復）（+76 tests）→ 2376 pass / 99 files
- **[0.28.17] 2026-03-03**：Knowledge Engine — buildSkillContext 自動注入 + detectKnowledgeGaps gap 偵測 + searchKnowledge 三源搜尋 + skill-router 知識路由歸檔 + Code Review 修復（instinct type + orphan guard）（+54 tests）→ 2300 pass / 99 files

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 願景 | docs/vision.md | 四層同心圓架構、核心信念、設計原則、成熟度模型 |
| 路線圖 | docs/roadmap.md | Phase 計劃、S 系列技術路線、失真防護、歷史 |
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 17 個 agent（含 grader） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Dev、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
