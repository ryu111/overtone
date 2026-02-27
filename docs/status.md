# Overtone 現況

> 最後更新：2026-02-27 | Plugin 版本：0.16.0

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 307 pass，0 fail，核心功能完整 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 16（含 grader） |
| Workflow 模板 | 15 |
| 測試通過 | 495 pass / 0 fail |
| 測試檔案 | 27 個 |
| Hook 數量 | 6 個 |
| Skill 數量 | 29 個 |

## 近期變更（最近 3 筆）

- **[0.16.0] 2026-02-27**：Dashboard Glassmorphism 重設計完成 — 合併 index.html + session.html 為單頁 SPA (dashboard.html)，CSS 1446 行 Glassmorphism 設計系統，JS 拆分 pipeline/timeline/confetti 三模組，後端 /api/registry 擴充 parallelGroupDefs，新增 27 個測試檔，測試通過 495 pass，v0.16.0 tag
- **[0.15.4] 2026-02-27**：test-coverage-gap-analysis 完成 — 新增 11 個測試檔（4 unit + 6 integration + 1 e2e），覆蓋 registry/paths/adapter/dashboard/session/tool hooks/event-bus/workflow lifecycle，測試通過 389 pass
- **[0.15.3] 2026-02-27**：修正所有 hook session ID 讀取來源（優先 stdin input.session_id），修正 e2e-runner/qa agent 及 skill 文件 Playwright → agent-browser CLI，F1 History Tab + F4 CSS 動畫瀏覽器驗證通過，V1 功能通過率 11/12

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 15 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 15 個 agent |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Dev、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
| V1 Roadmap | docs/roadmap/v1.md | V1 驗證進度 |
