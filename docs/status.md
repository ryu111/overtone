# Overtone 現況

> 最後更新：2026-03-02 | Plugin 版本：0.28.2

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1778 pass，0 fail，核心功能完整 + S15b 全面驗證完成（7 次迭代 + 缺失補齊：DRY 重構 + Specs 生命週期 + Hook 慢路徑）+ 測試品質防護機制（test-index 掃描 + 反模式偵測） |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1778 pass / 0 fail |
| 測試檔案 | 83 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 15（7 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |

## 近期變更（最近 3 筆）

- **[0.28.2] 2026-03-02**：測試品質防護機制 — test-index.js 掃描工具 + test-anti-patterns.md 文件 + pre-task 注入 + tester/developer agent DON'T 規則（+37 tests）→ 1778 pass / 83 files
- **[0.28.1] 2026-03-02**：S15b 全面驗證（7 次迭代 + 缺失補齊，+413 tests）— 迭代 1-7: Hook 鏈路 + 知識域 + E2E workflow + 文件同步 + Registry/Config + Dashboard/SSE + 效能基線 + 跨 Session 狀態（+374）+ 缺失補齊: parseFrontmatter DRY + 註解修正 + Hook 慢路徑 + Specs 生命週期（+39）→ 1793 pass
- **[0.28.0] 2026-03-02**：指令鏈修復 — 16 個 workflow commands 移除 disable-model-invocation 讓 auto 能路由 + pm 可呼叫性修復 + issue/SKILL.md 斷鏈路徑 + 「workflow skill」→「workflow command」全面術語同步 + 29 個 guard tests → 1380 pass

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
