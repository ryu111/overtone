# Overtone 現況

> 最後更新：2026-02-27 | Plugin 版本：0.16.2

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 507 pass，0 fail，核心功能完整 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 16（含 grader） |
| Workflow 模板 | 15 |
| 測試通過 | 507 pass / 0 fail |
| 測試檔案 | 29 個 |
| Hook 數量 | 6 個 |
| Skill 數量 | 29 個 |

## 近期變更（最近 3 筆）

- **[0.16.2] 2026-02-27**：Dashboard pass@1/pass@3 統計卡片 + URL bug 修正 — pipeline stats 新增兩張 pass@k 卡片（呼叫現有 API），Dashboard URL 固定 localhost:7777/（移除 /s/:sessionId 路由），測試通過 507 pass
- **[0.16.1] 2026-02-27**：QA agent 能力補全 + Dashboard QA 完成 — 測試計劃先行/fallback/邊界條件清單/回歸測試四大補全，真實瀏覽器 26 個 BDD Scenario 全通過，測試通過 507 pass
- **[0.16.0] 2026-02-27**：Dashboard Glassmorphism 重設計 + 三項修復 — SPA 單頁 Dashboard、並行視覺化、雙 SSE、自動歸檔閉環、TaskList 治本，測試通過 507 pass

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
