# Overtone 現況

> 最後更新：2026-03-02 | Plugin 版本：0.28.11

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 2063 pass，0 fail，核心功能完整 + 守衛強化迭代 5/10 完成（Docs 同步 + Session 清理 + Test 品質掃描 + Dead Code 偵測 + Guard Test 閘門）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 2063 pass / 0 fail |
| 測試檔案 | 91 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 16（8 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Knowledge Domain 數 | 8（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |

## 近期變更（最近 3 筆）

- **[0.28.11] 2026-03-02**：Test 品質 Guard Test — test-quality-guard + dead-code-guard 閘門整合（error 硬阻擋 + warning 軟報告）+ 4 個現有空測試修復 + detectEmptyTests throw/assert 識別（+6 tests）→ 2063 pass / 91 files
- **[0.28.10] 2026-03-02**：Dead Code 偵測器 — dead-code-scanner.js（未使用 exports + 孤立 lib 模組偵測 + class instance 跳過 + 真實 codebase 合理性驗證）（+40 tests）→ 2057 pass / 89 files
- **[0.28.9] 2026-03-02**：Test 品質掃描器 — test-quality-scanner.js（5 規則偵測：空測試/過大檔案/缺 describe/hardcoded 路徑/skip-only 殘留 + severity 三級分類）（+52 tests）→ 2017 pass / 88 files

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
