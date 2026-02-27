# Overtone 現況

> 最後更新：2026-02-27 | Plugin 版本：0.15.2

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
| 測試通過 | 389 pass / 0 fail |
| 測試檔案 | 24 個 |
| Hook 數量 | 6 個 |
| Skill 數量 | 29 個 |

## 近期變更（最近 5 筆）

- **[0.15.4] 2026-02-27**：test-coverage-gap-analysis 完成 — 新增 11 個測試檔（4 unit + 6 integration + 1 e2e），覆蓋 registry/paths/adapter/dashboard/session/tool hooks/event-bus/workflow lifecycle，測試通過 389 pass
- **[0.15.3] 2026-02-27**：修正所有 hook session ID 讀取來源（優先 stdin input.session_id），修正 e2e-runner/qa agent 及 skill 文件 Playwright → agent-browser CLI，F1 History Tab + F4 CSS 動畫瀏覽器驗證通過，V1 功能通過率 11/12
- **[0.15.2] 2026-02-27**：治本修復 specs 自動歸檔機制 — Session ID 橋接（UserPromptSubmit hook 寫 ~/.overtone/.current-session-id），tasks.md checkpoint 自動同步（改用 workflow stages 生成 checkbox，SubagentStop hook 自動勾選），新增 14 個整合測試，307 pass
- **[0.15.1] 2026-02-27**：測試架構重組 — 測試遷移至根目錄 `tests/`（unit/integration/e2e），新增 Handoff `### Test Scope` 動態調度，13 個測試檔，293 pass
- **[0.15.0] 2026-02-26**：mul-dev skill 新增（DEV 階段內部並行）、並行缺陷 D1–D4 修復、registry.js 新增 parallelGroupDefs、Agent 擴充至 15 個
- **[0.10.0] 2026-02-25**：命令注入防護、SSE 連線資源洩漏修正、XSS/路徑穿越防護、統一 atomicWrite、新增 package.json

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
