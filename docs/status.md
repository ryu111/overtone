# Overtone 現況

> 最後更新：2026-03-05 | Plugin 版本：0.28.59（security-integration：Guard 精鍊 19 條 + health-check checkOsTools 擴展 + OS 腳本整合測試）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 3455 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine + 跨 Session 長期記憶 + 效能基線追蹤 + 數值評分引擎 + 趨勢分析 + 回饋閉環 + 卡點識別 + 時間序列學習（Level 2 完成）+ 核心穩固清理 + mul-agent 泛化 + P3.0 閉環基礎 + P3.1 感知層（screenshot.js + window.js + perception.md）+ P3.2 心跳引擎（heartbeat.js + session-spawner.js）+ P3.3 系統層（process.js + clipboard.js + system-info.js + notification.js + fswatch.js）+ 並行收斂門 + Status Line TTL 防護 + Specs checkbox fallback 修復 + Level 2→1 整合修復（gradedStages 擴大 + 失敗原因記錄 + 全域觀察注入）+ Agent Memory 升級（8 個跨層級 agent + Score Context 個人化 + Grader 強制化）+ 核心簡化（移除 active-agent.json + 並行提示修復 + 不變量守衛）+ Hook Contract 自我修復（state.sanitize() + 8 個 hook 合約測試）+ 主動偵測（health-check 15 項，含元件鏈 + 資料品質 + 趨勢分析 + 測試增長率 + 製作原則 3 項）+ Health-Check 精確度提升（假陽性 23→0 error + 孤兒 active stage 守衛）+ Queue CLI + PM 佇列整合 + Spawner 防禦 + Hook 薄殼化（9 handler 模組）+ Telegram /run 命令 + PM 佇列自動寫入 + CLAUDECODE env filter + Main Agent 寫碼偵測守衛 + lib/ 結構重構（config 拆分 + analyzers/ + knowledge/ 子目錄）+ SessionStart systemMessage 動態注入 plugin context + Prompt Journal（intent_journal 記錄 prompt 原文）+ 製作原則內化（agent prompt + validate 四模式品質檢查）+ PM Plan Mode（/ot:pm plan 規劃模式 + appendQueue API + enable-auto 指令）+ Agent Prompt 四模式補齊（15 個 agent 信心過濾 + 誤判防護 + 標準化章節排列）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 18（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 3580 pass / 0 fail（158 個測試檔）|
| 測試檔案 | 158 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 23（15 knowledge domain + orchestrator + pm + specs + 4 utility-with-refs） |
| Knowledge Domain 數 | 15（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control、craft、claude-dev） |
| Command 數量 | 28（14 stage shortcut + 7 workflow pipeline + 7 utility） |
| Telegram 命令 | 6（/start、/status、/stop、/run、/sessions、/help） |
| Timeline Events | 29 個 |

## 近期變更（最近 3 筆）

- **[0.28.59] 2026-03-05**：P3.6 安全整合——Guard 精鍊 + health-check 擴展 + OS 腳本整合測試——(1) pre-bash-guard.js 黑名單 14→19 條（新增 killall、killall -9 等 OS 層級危險命令防護）；(2) health-check checkOsTools 擴展（第 8 項新增 screencapture、heartbeat daemon 狀態檢測，16 項不變）；(3) os-control SKILL.md 完成度更新（索引精準化、reference 整合）；(4) 新增 OS 腳本整合 smoke test（pre-bash-guard、system-info、notification、fswatch 五項）；(5) 版本 0.28.58→0.28.59；(6) 測試 +23（3557→3580）✅
- **[0.28.58] 2026-03-05**：P3.5 WebSocket 即時通訊能力——(1) 新增 websocket.js（Bun 原生 WebSocket client，connect/send/on/close API + CLI 支援）；(2) 新增 realtime.md 知識參考（WebSocket 應用場景、協議、錯誤處理、安全考量）；(3) 新增 websocket.test.js 測試 19 個（基礎連線、訊息收發、錯誤恢復、多連接、並發）；(4) 更新 os-control SKILL.md 索引 + agent frontmatter；(5) 版本 0.28.57→0.28.58；(6) 測試 +18（3538→3556）✅
- **[0.28.57] 2026-03-05**：Failure Tracker 精確度改善——(1) 測試隔離：recordFailure/recordResolution 檢查 OVERTONE_TEST，setup.js 全域設定，避免測試污染生產資料；(2) 新增 recordResolution API：stage pass 時記錄，getFailurePatterns 自動排除已解決的失敗；(3) 智慧過濾：同 sessionId+stage 有 resolved 記錄時自動清除舊失敗，retry 成功不計失敗；(4) 時間脈絡：formatFailureSummary 加時間範圍顯示（M/DD - M/dd）；(5) agent-stop-handler 自動呼叫 recordResolution；(6) 新增 8 個測試（隔離、過濾、時間範圍）；(7) 測試 +13（3455→3468）✅

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
| P3.4 | 動得了 | keyboard.js + mouse.js + applescript.js + computer-use.js | ⬜ |
| P3.5 | 聽說能力 | WebSocket ✅ + TTS ⬜ + STT ⬜ | 🟡 部分完成 |
| P3.6 | 安全整合 | Guard 精鍊 + E2E 驗證 + health-check 擴展 | ✅ |

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
