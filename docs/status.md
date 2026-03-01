# Overtone 現況

> 最後更新：2026-03-02 | Plugin 版本：0.27.3

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1336 pass，0 fail，核心功能完整 + Config API 完成 + Platform Drift 偵測完成 + Effort Level 分層完成 + Skill 動態注入完成 + TaskCompleted Hook 完成 + Opusplan 混合模式完成 + Agent Memory 完成 + 文件整理自動化完成 + CLAUDE.md 精簡完成 + 音效通知完成 + Status Line 完成 + Strategic Compact 完成 + 核心精鍊完成 + ref-* 整理完成 + testing knowledge domain 建立完成 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1336 pass / 0 fail |
| 測試檔案 | 68 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 38 個（含 2 ref-*） |

## 近期變更（最近 3 筆）

- **[0.27.3] 2026-03-02**：S15b 迭代 1 PoC — 建立 testing knowledge domain skill（合併 BDD/testing 知識），刪除 ref-test-strategy，ref-* 從 3→2，38 個 skills 重組啟動 → 1336 pass
- **[0.27.2] 2026-03-01**：ref-* skill 整理 — 刪除 4 個副本 ref-*（bdd-guide、failure-handling、wording-guide、agent-prompt-patterns），保留 3 個新 ref-* 並加消費者（test-strategy→tester、pr-review-checklist→code-reviewer、commit-convention→developer），更新 5 個 agent frontmatter → 1336 pass
- **[0.27.1] 2026-03-01**：CBP 交叉比對 — 新增 3 個 reference skill（ref-commit-convention、ref-pr-review-checklist、ref-test-strategy）+ .github/ Issue/PR 模板 + roadmap 更新（S15-S17 計畫）→ 1331 pass

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
