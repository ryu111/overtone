# Overtone 現況

> 最後更新：2026-03-02 | Plugin 版本：0.28.4

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1826 pass，0 fail，核心功能完整 + S15b 全面驗證完成（7 次迭代 + 缺失補齊：DRY 重構 + Specs 生命週期 + Hook 慢路徑）+ 測試品質防護機制（test-index 掃描 + 反模式偵測）+ Specs 勾選同步修復 + Reference 完整性驗證 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1826 pass / 0 fail |
| 測試檔案 | 84 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 15（7 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |

## 近期變更（最近 3 筆）

- **[0.28.4] 2026-03-02**：Reference 完整性驗證 — reference-integrity.test.js 檢查所有 skills/commands 的 reference/ 路徑有效性 + skills 中文名稱正確性（+42 tests）→ 1826 pass / 84 files
- **[0.28.3] 2026-03-02**：Specs 勾選同步修復 — featureName auto-sync（SubagentStop 自動偵測 active feature）+ buildTasksMd 雙區段（## Stages auto-managed + ## Tasks 自由填寫）+ readTasksCheckboxes 優先讀 ## Stages（+30 tests）→ 1784 pass / 83 files
- **[0.28.2] 2026-03-02**：測試品質防護機制 — test-index.js 掃描工具 + test-anti-patterns.md 文件 + pre-task 注入 + tester/developer agent DON'T 規則（+37 tests）→ 1778 pass / 83 files

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
