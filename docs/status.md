# Overtone 現況

> 最後更新：2026-03-01 | Plugin 版本：0.21.0

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1082 pass，0 fail，核心功能完整 + Config API 完成 + Platform Drift 偵測完成 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1082 pass / 0 fail |
| 測試檔案 | 55 個 |
| Hook 數量 | 9 個 |
| Skill 數量 | 38 個 |

## 近期變更（最近 3 筆）

- **[0.21.1] 2026-03-01**：Platform-Drift 偵測完成 — health-check.js 新增第 6 項 platform-drift 檢測 + 12 個新測試 → 1082 pass
- **[0.21.0] 2026-03-01**：Config API 統一設定管理 — config-api.js L1 驗證層 + L2 CRUD API + registry-data.json JSON 化 stages/agentModels + 新增 knownTools/hookEvents 常數（82 個新測試）
- **[0.20.0] 2026-03-01**：平台對齊優化 Phase 1 — disallowedTools 遷移（10 個 agent）+ Reference Skills 注入（3 個新 skill）+ Workflow Context 注入（updatedInput）+ SessionEnd 和 PostToolUseFailure hook（+2 個 hook）

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
