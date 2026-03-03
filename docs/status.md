# Overtone 現況

> 最後更新：2026-03-03 | Plugin 版本：0.28.26（趨勢分析）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 2595 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine（skill context 自動注入 + gap detection + 知識歸檔）+ Specs 歸檔驗證 + P4 文件對齊 + S19 Agent 專一化分析 + 跨 Session 長期記憶 + 全域觀察畢業 + 效能基線追蹤 + 執行佇列 + 數值評分引擎 + 趨勢分析 + 回饋閉環（Level 2 進階）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 2595 pass / 0 fail（111 個測試檔） |
| 測試檔案 | 111 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 19（11 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Knowledge Domain 數 | 11（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |
| Timeline Events | 26 個 |

## 近期變更（最近 3 筆）

- **[0.28.26] 2026-03-03**：趨勢分析引擎 — score-engine.js 新增 computeScoreTrend + formatScoreSummary，baseline-tracker.js 新增 computeBaselineTrend，on-start.js 注入品質評分摘要（+33 tests）→ 2595 pass / 111 files
- **[0.28.25] 2026-03-03**：回饋閉環 — pre-task.js 注入歷史評分 context（gradedStages 過濾 + lowest 維度提示）+ on-session-end.js session 層 instinct decay（+21 tests）→ 2571 pass / 110 files
- **[0.28.24] 2026-03-03**：數值評分引擎 — score-engine.js（saveScore/queryScores/getScoreSummary 3 個 API）+ paths.global.scores + registry.scoringConfig/scoringDefaults + grader 步驟 5 寫入 scores store + stop-message-builder 評分提示 + on-stop 低分 quality_signal（+44 tests）→ 2550 pass / 108 files

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 願景 | docs/vision.md | 四層同心圓架構、核心信念、設計原則、成熟度模型 |
| 路線圖 | docs/roadmap.md | Phase 計劃、S 系列技術路線、失真防護、歷史 |
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 17 個 agent（含 grader） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Dev、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
