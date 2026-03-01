# Overtone 規格文件

> Overtone 是 Claude Code plugin，提供 BDD 驅動的工作流自動化 + 即時監控 + 遠端控制。
> 版本：v0.26.0 | 最後更新：2026-03-01

---

## 設計哲學

**一句話**：Hook 做記錄和守衛，Skill 做指引，Main Agent 做決策。

| 原則 | 說明 | 來源 |
|------|------|------|
| **平台優先** | 並行、同步、錯誤隔離交給 ECC 原生能力 | Vibe 教訓：自建 barrier/FIFO/slot = 500 行做 ECC 本來就會做的事 |
| **狀態最小化** | 只記必要的：誰做了什麼、結果是什麼 | Vibe 教訓：pipeline.json 過度追蹤 |
| **Hook 做守衛** | Hook 負責「擋」和「記錄」，不負責「協調」 | ECC + wk 驗證的模式 |
| **Skill 做指引** | 告訴 Main Agent 下一步做什麼，讓它自己決定怎麼做 | wk 的成功模式 |
| **Loop 預設** | 預設 loop 模式，任務完成自動繼續下一個 | wk ralph-loop |
| **BDD 驅動** | 先定義行為（BDD spec）再寫碼 | 面向 9 決策 |
| **Agent 專職** | 17 個專職 agent，各司其職 | ECC + Vibe 混合 |

---

## 文件目錄

| 文件 | 主題 | 說明 |
|------|------|------|
| [overtone-架構.md](overtone-架構.md) | 架構 | 三層模型（Loop/Skill/Hook）、Hook 系統、State 設計、Context 管理 |
| [overtone-工作流.md](overtone-工作流.md) | 工作流 | 18 個 workflow 模板（含 3 個產品模板）、/ot:auto 選擇邏輯、命令清單、錯誤處理 |
| [overtone-agents.md](overtone-agents.md) | Agent 系統 | 17 個 agent 職責與 Model 分配、Handoff 協定、BDD 整合 |
| [overtone-並行.md](overtone-並行.md) | 並行執行 | Loop 模式、靜態/動態並行、Mul-Dev 機制、D1-D4 缺陷修復 |
| [overtone-子系統.md](overtone-子系統.md) | 子系統 | Specs 生命週期、Dashboard 監控、Remote 控制、Timeline 22 種事件 |
| [overtone-驗證品質.md](overtone-驗證品質.md) | 驗證品質 | 三信號驗證、pass@k 指標、Model Grader、Instinct 系統 |
| [workflow-diagram.md](workflow-diagram.md) | 架構圖 | Mermaid 視覺化：三層全覽、執行流程、失敗處理迴圈 |

---

## 決策記錄

> 詳細決策記錄見 git history 與 `docs/reference/` 目錄。

V0.21.0 版本共確認 55+ 個設計決策，重大決策包含：
- Hook 做記錄和守衛，Skill 做指引，Main Agent 做決策
- 並行群組靜態定義（registry.js），動態推導由 Main Agent 處理
- Handoff 為虛擬交接，僅存在於 Main Agent context
- Specs 系統（v0.13.0）取代 openspec，提供 disk-based Feature Record
- PM Agent（v0.17.0）：product-manager agent + 3 個產品 workflow（product/product-full/discovery）
- Hook 統一錯誤處理（v0.17.7）：hook-utils.js safeReadStdin/safeRun/hookError，crash 不影響工具執行
- Context 壓縮前狀態恢復（v0.18.0）：PreCompact hook + buildPendingTasksMessage()，提升 compact 後連貫性
- JSONL 效能優化（v0.17.6）：instinct auto-compact + timeline 反向掃描 + limit 快速路徑
- 平台對齁優化（v0.20.0）：disallowedTools 遷移、Reference Skills 注入、Workflow Context 注入、SessionEnd 和 PostToolUseFailure hook
- Config API（v0.21.0）：統一 agent/hook/skill 設定管理，L1 驗證層 + L2 CRUD API + registry-data.json JSON 化 + knownTools/hookEvents 常數

---

## Roadmap

| 版本 | 狀態 | 詳情 |
|------|------|------|
| V1 | 完成 | [roadmap/v1.md](../roadmap/v1.md) |
| V2 | 規劃中（延後） | 多模型審查（/ot:multi-review）、Slack Adapter、Discord Adapter、使用者自定義 Agent 擴充 |
