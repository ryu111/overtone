# Overtone 現況

> 最後更新：2026-02-28 | Plugin 版本：0.17.3

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 599 pass，0 fail，核心功能完整 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 599 pass / 0 fail |
| 測試檔案 | 34 個 |
| Hook 數量 | 6 個 |
| Skill 數量 | 30 個 |

## 近期變更（最近 3 筆）

- **[0.17.3] 2026-02-28**：Dashboard 重複開啟修復 — 修復多 session 場景下 Dashboard 重複啟動問題。新增 `probePort()` + `isRunning()` port probe fallback；`on-start.js` 新增 `OVERTONE_NO_DASHBOARD` early return、移除自動開瀏覽器、移除 `OVERTONE_NO_BROWSER` 環境變數；`server.js` EADDRINUSE graceful exit。測試 599 pass（+11）
- **[0.17.2] 2026-02-28**：Pipeline 穩定性自動化測試 — 新增 5 個 e2e + integration test：single/quick/standard workflow + fail-retry-path + pre-task parallel。新增 2 個 lib 模組（identify-agent.js, parse-result.js）+ hook-runner helper。自動化驗證 agent 路由正確性、結果解析、並行安全性。測試 588 pass（+81）
- **[0.17.0] 2026-02-28**：Product Manager agent — 第 16 個 stage + 3 個產品 workflow。PM agent（opus, emerald）負責需求探索、方案比較、MVP 範圍定義、drift 偵測。新增 pm skill（含 5 份 references）、3 個 workflow（product, product-full, discovery）。pm/SKILL.md 為唯一入口，後續 pipeline 引用現有 standard/full skill（DRY）

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 16 個 agent |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Dev、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
| V1 Roadmap | docs/roadmap/v1.md | V1 驗證進度 |
