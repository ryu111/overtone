# Overtone 現況

> 最後更新：2026-02-27 | Plugin 版本：0.15.1

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 293 pass，0 fail，核心功能完整 |
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 16（含 grader） |
| Workflow 模板 | 15 |
| 測試通過 | 293 pass / 0 fail |
| 測試檔案 | 13 個 |
| Hook 數量 | 6 個 |
| Skill 數量 | 29 個 |

## 近期變更（最近 4 筆）

- **[0.15.1] 2026-02-27**：測試架構重組 — 測試遷移至根目錄 `tests/`（unit/integration/e2e），新增 Handoff `### Test Scope` 動態調度，13 個測試檔，293 pass
- **[0.15.0] 2026-02-26**：mul-dev skill 新增（DEV 階段內部並行）、並行缺陷 D1–D4 修復、registry.js 新增 parallelGroupDefs、Agent 擴充至 15 個
- **[0.11.0] 2026-02-26**：state.js CAS 原子更新、SSE CORS 動態化、Telegram chat_id 白名單、Alpine.js 本地化、新增 CHANGELOG.md
- **[0.10.0] 2026-02-25**：命令注入防護、SSE 連線資源洩漏修正、XSS/路徑穿越防護、統一 atomicWrite、新增 package.json

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）
- F4 Dashboard 動畫需瀏覽器視覺確認
- F1 History Tab 前端需瀏覽器確認

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
