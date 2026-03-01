# Overtone 現況

> 最後更新：2026-03-01 | Plugin 版本：0.26.0

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 1225 pass，0 fail，核心功能完整 + Config API 完成 + Platform Drift 偵測完成 + Effort Level 分層完成 + Skill 動態注入完成 + TaskCompleted Hook 完成 + Opusplan 混合模式完成 + Agent Memory 完成 + 文件整理自動化完成 + CLAUDE.md 精簡完成 + 音效通知完成 + Status Line 完成 + Strategic Compact 完成 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 1225 pass / 0 fail |
| 測試檔案 | 62 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 38 個 |

## 近期變更（最近 3 筆）

- **[0.26.0] 2026-03-01**：S14 Strategic Compact — SubagentStop hook 新增 formatSize + shouldSuggestCompact 函式，stage pass 時檢查 transcript 檔案大小超過閾值（預設 5MB）自動建議壓縮，emit session:compact-suggestion timeline 事件，提升 context 可用性 → 1225 pass
- **[0.25.2] 2026-03-01**：Status Line 大幅重寫 — agent-first 格式 + 中文模式標籤 + 移除 OAuth（API 不可用）+ transcript 檔案大小 + 亮色 ANSI + idle 時隱藏 Line 1 + PreCompact session_id fallback → 1205 pass
- **[0.25.1] 2026-03-01**：音效精簡 — 移除 PostToolUseFailure 音效 + error.flag 機制 + Tink 恢復音 + permission_prompt Glass。保留 AskUserQuestion Glass / workflow 完成 Hero / 異常中斷 Basso → 1197 pass

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
