# Overtone 現況

> 最後更新：2026-03-05 | Plugin 版本：0.28.54（PM Plan Mode — /ot:pm plan 規劃模式）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 3455 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine + 跨 Session 長期記憶 + 效能基線追蹤 + 數值評分引擎 + 趨勢分析 + 回饋閉環 + 卡點識別 + 時間序列學習（Level 2 完成）+ 核心穩固清理 + mul-agent 泛化 + P3.0 閉環基礎 + P3.1 感知層（screenshot.js + window.js + perception.md）+ P3.2 心跳引擎（heartbeat.js + session-spawner.js）+ P3.3 系統層（process.js + clipboard.js + system-info.js + notification.js + fswatch.js）+ 並行收斂門 + Status Line TTL 防護 + Specs checkbox fallback 修復 + Level 2→1 整合修復（gradedStages 擴大 + 失敗原因記錄 + 全域觀察注入）+ Agent Memory 升級（8 個跨層級 agent + Score Context 個人化 + Grader 強制化）+ 核心簡化（移除 active-agent.json + 並行提示修復 + 不變量守衛）+ Hook Contract 自我修復（state.sanitize() + 8 個 hook 合約測試）+ 主動偵測（health-check 15 項，含元件鏈 + 資料品質 + 趨勢分析 + 測試增長率 + 製作原則 3 項）+ Health-Check 精確度提升（假陽性 23→0 error + 孤兒 active stage 守衛）+ Queue CLI + PM 佇列整合 + Spawner 防禦 + Hook 薄殼化（9 handler 模組）+ Telegram /run 命令 + PM 佇列自動寫入 + CLAUDECODE env filter + Main Agent 寫碼偵測守衛 + lib/ 結構重構（config 拆分 + analyzers/ + knowledge/ 子目錄）+ SessionStart systemMessage 動態注入 plugin context + Prompt Journal（intent_journal 記錄 prompt 原文）+ 製作原則內化（agent prompt + validate 四模式品質檢查）+ PM Plan Mode（/ot:pm plan 規劃模式 + appendQueue API + enable-auto 指令）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 18（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 3455 pass / 0 fail（153 個測試檔）|
| 測試檔案 | 153 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 23（15 knowledge domain + orchestrator + pm + specs + 4 utility-with-refs） |
| Knowledge Domain 數 | 15（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control、craft、claude-dev） |
| Command 數量 | 28（14 stage shortcut + 7 workflow pipeline + 7 utility） |
| Telegram 命令 | 6（/start、/status、/stop、/run、/sessions、/help） |
| Timeline Events | 29 個 |

## 近期變更（最近 3 筆）

- **[0.28.54] 2026-03-05**：PM Plan Mode 完成 — /ot:pm plan 規劃模式——(1) execution-queue.js 新增 appendQueue() 累加佇列、setAutoExecute() 切換模式 API；(2) formatQueueSummary 顯示「📋 規劃模式（手動啟動）」標籤；(3) queue.js 新增 append/enable-auto 子命令、--no-auto flag；(4) pm/SKILL.md 新增 plan 模式條件分支（execute vs plan）、佇列整合說明；(5) queue-management.md 文件補充 append/enable-auto 用法和 API；(6) CLAUDE.md 常用指令更新；(7) 新增 12 個單元測試（appendQueue、setAutoExecute、formatQueueSummary）；(8) 測試 +9（3446→3455）
- **[0.28.53] 2026-03-05**：製作原則內化完成 — Agent Prompt + Validate 四模式品質檢查——(1) craft skill 新增 overtone-principles.md checklist（三條原則 + 驗證品質信號）；(2) 5 個 agent prompt 加原則指引（developer L1 + code-reviewer L2 + retrospective L3 + planner L4 + claude-developer utility）；(3) validate-agents.js 新增四模式檢查（MUST/MUST NOT 強度 + 字元長度 + 停止條件 + 信心過濾）；(4) config-api.js hex color YAML 引號修正；(5) 新增 3 個 Feature、30+ Scenario BDD 測試；(6) 測試 +30（3416→3446，152 files）
- **[0.28.52] 2026-03-05**：Prompt Journal 完成 — intent_journal 觀察類型記錄 prompt 原文——(1) instinct.js emit() 新增 options（skipDedup + extraFields）；(2) registry.js 新增 journalDefaults；(3) on-submit-handler.js 每次用戶 prompt 提交記錄 intent_journal；(4) session-end-handler.js 新增 resolveSessionResult 配對邏輯（用戶 prompt + session 結果）；(5) global-instinct.js queryGlobal 新增 excludeTypes 過濾；(6) session-start-handler.js 注入「最近常做的事」摘要；(7) 新增 7 個 Feature、40+ Scenario BDD 測試；(8) 測試 +38（3378→3416，151→152 files）

## Phase 3 規劃狀態

> Phase 2 完成 → Phase 3 規劃完成（2026-03-03 PM Discovery）

Phase 3 目標：Layer 2 完整 OS 能力，達到 Phase 4 Ready。
架構：Bun 腳本庫（`scripts/os/`）+ `os-control` knowledge domain（第 12 個）+ OS Guard。
桌面操控：AppleScript/JXA 優先 + Computer Use 兜底。

| 階段 | 名稱 | 內容 | 狀態 |
|:----:|------|------|:----:|
| P3.0 | 閉環基礎 | os-control Skill 骨架 + Agent frontmatter + pre-bash-guard + hooks.json | ✅ |
| P3.1 | 看得見 | 截圖（screenshot.js + 4 API）+ 視窗管理（window.js + 5 API）+ 視覺分析模板 | ✅ |
| P3.2 | 心跳引擎 | Heartbeat daemon（start/stop/status）+ session-spawner.js + autonomous-control Skill | ✅ |
| P3.3 | 管得住 | Process + 剪貼簿 + 系統資訊 + 通知 + 檔案監控 | ✅ |
| P3.4 | 聽說能力 | WebSocket + TTS + STT | ⬜ |
| P3.5 | 安全整合 | Guard 精鍊 + E2E 驗證 + health-check 擴展 | ⬜ |

> 詳細計劃見 `docs/roadmap.md` Phase 3 章節。

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
| Agents | docs/spec/overtone-agents.md | 18 個 agent（含 grader + claude-developer） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Agent、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
