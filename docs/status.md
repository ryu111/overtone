# Overtone 現況

> 最後更新：2026-03-01 | Plugin 版本：0.23.0

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1147 pass，0 fail，核心功能完整 + Config API 完成 + Platform Drift 偵測完成 + Effort Level 分層完成 + Skill 動態注入完成 + TaskCompleted Hook 完成 + Opusplan 混合模式完成 + Agent Memory 完成 + 文件整理自動化完成 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1147 pass / 0 fail |
| 測試檔案 | 57 個 |
| Hook 數量 | 10 個 |
| Skill 數量 | 38 個 |

## 近期變更（最近 3 筆）

- **[0.23.0] 2026-03-01**：docs/reference 整理 — 6 個 ECC 文件歸檔 + computer-use 刪除 + parallel-defects 內嵌 + health-check 第 7 項 doc-staleness 偵測 + 9 個新測試 → 1147 pass
- **[0.23.0] 2026-03-01**：S10 Agent Memory — 5 個 opus 判斷型 agent（code-reviewer、retrospective、architect、security-reviewer、product-manager）啟用 `memory: local` 跨 session 記憶 + 20 個新測試 → 1138 pass
- **[0.22.0] 2026-03-01**：S8 Opusplan 混合模式 — planner model 從 opus 改為 opusplan（Opus 規劃 + Sonnet 執行），降低成本 → 1118 pass
- **[0.22.0] 2026-03-01**：TaskCompleted Hook（第 10 個）— on-task-completed.js 新增 + 品質門檻硬阻擋（test pass + lint clean）+ 9 個新測試 → 1117 pass

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
