# Overtone 現況

> 最後更新：2026-03-02 | Plugin 版本：0.28.1

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1640 pass，0 fail，核心功能完整 + S15b 驗證完成（Hook 鏈路 + 知識域鏈路 + 5 個 E2E workflow 補強 + 文件同步驗證） |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1640 pass / 0 fail |
| 測試檔案 | 76 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 15（7 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |

## 近期變更（最近 3 筆）

- **[0.28.1] 2026-03-02**：S15b 驗證 — 迭代 1: Hook 鏈路 + Auto 路由驗證（+23 tests）、迭代 2: 知識域三層鏈路 + 5 個 E2E workflow 補強（+210 tests）、迭代 3: 文件同步 + 邊界掃描（+27 tests，修復 workflow-diagram + status.md 版本 + testing-guide.md 路徑）→ 1640 pass / 76 files
- **[0.28.0] 2026-03-02**：指令鏈修復 — 16 個 workflow commands 移除 disable-model-invocation 讓 auto 能路由 + pm 可呼叫性修復 + issue/SKILL.md 斷鏈路徑 + 「workflow skill」→「workflow command」全面術語同步 + 29 個 guard tests → 1380 pass
- **[0.27.8] 2026-03-02**：S15b 迭代 7-8 — 建立 commands/ 目錄，27 個操作型 skills 移到 commands/（14 stage shortcuts + 7 workflow pipelines + 6 utilities），實現 Skill（知識）vs Command（操作）物理分離 → 1351 pass
- **[0.27.6] 2026-03-02**：S15b 迭代 4 — commit-convention + code-review knowledge domain skills，ref-* 前綴全部清零（7→0）→ 1351 pass

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
