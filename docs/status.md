# Overtone 現況

> 最後更新：2026-02-28 | Plugin 版本：0.18.0

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 731 pass，0 fail，核心功能完整 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 731 pass / 0 fail |
| 測試檔案 | 41 個 |
| Hook 數量 | 7 個 |
| Skill 數量 | 31 個 |

## 近期變更（最近 3 筆）

- **[0.18.0] 2026-02-28**：PreCompact hook 新增 — 在 context 壓縮前注入工作流狀態恢復訊息，支援 SessionStart + PreCompact 雙端共用 `buildPendingTasksMessage()`。hook-utils.js 擴充至 4 個函式。提升 compact 後恢復的連貫性。測試 704 pass（+37）
- **[0.17.7] 2026-02-28**：Hook 錯誤處理統一 — 新建 `hook-utils.js`（safeReadStdin + safeRun + hookError），重構 6 個 hook scripts 統一錯誤處理模式。post-use.js async→sync。測試 667 pass（+12）
- **[0.17.6] 2026-02-28**：JSONL 效能優化 — instinct.js auto-compact（膨脹 >2x 自動壓縮）、timeline.js latest() 反向掃描、query() limit 快速路徑。pm/SKILL.md 精簡（125→112 行）。測試 655 pass（+26）

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
| V1 Roadmap | docs/roadmap/v1.md | V1 驗證進度 |
