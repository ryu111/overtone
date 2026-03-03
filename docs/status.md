# Overtone 現況

> 最後更新：2026-03-03 | Plugin 版本：0.28.29（核心穩固清理 + mul-agent 泛化）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 2695 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine + 跨 Session 長期記憶 + 效能基線追蹤 + 數值評分引擎 + 趨勢分析 + 回饋閉環 + 卡點識別 + 時間序列學習（Level 2 完成）+ 核心穩固清理 + mul-agent 泛化 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 2695 pass / 0 fail（115 個測試檔） |
| 測試檔案 | 115 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 19（11 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs） |
| Knowledge Domain 數 | 11（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system） |
| Command 數量 | 27（14 stage shortcut + 7 workflow pipeline + 6 utility） |
| Timeline Events | 26 個 |

## 近期變更（最近 3 筆）

- **[0.28.29] 2026-03-03**：核心穩固清理 + mul-agent 泛化 — (1) Dead exports 清理（health-check.js 加入 tests/ 搜尋，72→0），guard-system.test.js 補測試（+35）；(2) getStageByAgent 抽取消除 on-stop/pre-task 重複邏輯；(3) 7 個 workflow command 加入並行引導；(4) mul-dev→mul-agent 泛化（支援 developer/tester/debugger/reviewer 並行）→ 2695 pass / 115 files
- **[0.28.28] 2026-03-03**：時間序列學習 — adjustConfidenceByIds API + 觀察效果反饋迴路（SessionStart 記錄注入 ID，SessionEnd 比對 baseline/score 趨勢後調整 confidence），globalInstinctDefaults 新增 feedbackBoost/feedbackPenalty（+15 tests）→ 2658 pass / 114 files
- **[0.28.27] 2026-03-03**：卡點識別 — failure-tracker.js 跨 session 失敗模式聚合（recordFailure/getFailurePatterns/formatFailureWarnings/formatFailureSummary），on-stop/on-start/pre-task 整合注入失敗警告（+48 tests）→ 2643 pass / 113 files

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
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Agent、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
