# Overtone 現況

> 最後更新：2026-02-28 | Plugin 版本：0.19.0

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 742 pass，0 fail，核心功能完整 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 17（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 742 pass / 0 fail |
| 測試檔案 | 42 個 |
| Hook 數量 | 7 個 |
| Skill 數量 | 34 個 |

## 近期變更（最近 3 筆）

- **[0.19.0] 2026-02-28**：系統全面清理 — 6 個幽靈事件修復 + Handoff 殘留清理 + DRY 重構（buildProgressBar/getSessionId 共用）+ Dead Code 移除
- **[0.18.4] 2026-02-28**：identify-agent 誤判修復（三層：pre-task subagent_type 映射 + describe-only 搜尋 + system:warning 衝突偵測）
- **[0.18.1] 2026-02-28**：Phase 1 onboarding 改善 — plugin.json description 改為產品定位語「裝上 Claude Code，就像有了一個開發團隊。」；SessionStart banner 新增 action hint，引導新使用者直接輸入需求。
- **[0.18.0-fix3] 2026-02-28**：on-submit hook 注入 TaskList 提醒（三層防注意力衰減）

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
