# Overtone 現況

> 最後更新：2026-03-06 | Plugin 版本：0.28.64（pm-domain-research：領域研究能力 + bugfix + 34 個測試）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 3753 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine + 跨 Session 長期記憶 + 效能基線追蹤 + 數值評分引擎 + 趨勢分析 + 回饋閉環 + 卡點識別 + 時間序列學習（Level 2 完成）+ 核心穩固清理 + mul-agent 泛化 + P3.0 閉環基礎 + P3.1 感知層（screenshot.js + window.js + perception.md）+ P3.2 心跳引擎（heartbeat.js + session-spawner.js）+ P3.3 系統層（process.js + clipboard.js + system-info.js + notification.js + fswatch.js）+ 並行收斂門 + Status Line TTL 防護 + Specs checkbox fallback 修復 + Level 2→1 整合修復（gradedStages 擴大 + 失敗原因記錄 + 全域觀察注入）+ Agent Memory 升級（8 個跨層級 agent + Score Context 個人化 + Grader 強制化）+ 核心簡化（移除 active-agent.json + 並行提示修復 + 不變量守衛）+ Hook Contract 自我修復（state.sanitize() + 8 個 hook 合約測試）+ 主動偵測（health-check 15 項，含元件鏈 + 資料品質 + 趨勢分析 + 測試增長率 + 製作原則 3 項）+ Health-Check 精確度提升（假陽性 23→0 error + 孤兒 active stage 守衛）+ Queue CLI + PM 佇列整合 + Spawner 防禦 + Hook 薄殼化（9 handler 模組）+ Telegram /run 命令 + PM 佇列自動寫入 + CLAUDECODE env filter + Main Agent 寫碼偵測守衛 + lib/ 結構重構（config 拆分 + analyzers/ + knowledge/ 子目錄）+ SessionStart systemMessage 動態注入 plugin context + Prompt Journal（intent_journal 記錄 prompt 原文）+ 製作原則內化（agent prompt + validate 四模式品質檢查）+ PM Plan Mode（/ot:pm plan 規劃模式 + appendQueue API + enable-auto 指令）+ Agent Prompt 四模式補齊（15 個 agent 信心過濾 + 誤判防護 + 標準化章節排列）+ P4.1-P4.2 進化引擎（Gap Detection + Auto-Fix）+ L3.3 Skill Forge Phase 1（skill-forge.js + 知識萃取 + evolution.js forge CLI）+ L3.4 深度 PM 多輪訪談（interview.js + 7 API + 24 題靜態問題庫 + 五面向結構化訪談 + session 持久化）|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 18（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 4088 pass / 0 fail（180+ 個測試檔）|
| 測試檔案 | 180+ 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 24（15 knowledge domain + orchestrator + pm + specs + 4 utility-with-refs + instinct） |
| scripts/lib 模組 | 64（含 analyzers/ 7 + knowledge/ 9 + remote/ 4 + dashboard/ 2 子目錄模組） |
| Knowledge Domain 數 | 15（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control、craft、claude-dev） |
| Command 數量 | 28（14 stage shortcut + 7 workflow pipeline + 7 utility） |
| Telegram 命令 | 6（/start、/status、/stop、/run、/sessions、/help） |
| Timeline Events | 29 個 |

## 近期變更（最近 3 筆）

- **[0.28.64] 2026-03-06**：pm-domain-research——PM 領域研究能力 + bugfix——(1) interview.js 新增 researchDomain/startInterview/getResearchQuestions 三個 API，支援 PM 訪談前自主研究領域；(2) saveSession/loadSession 修復 domainResearch 欄位序列化；(3) 新增 21 個單元測試 + 2 個 roundtrip 測試（共 23 個）；(4) L3.4 領域研究整合完成標記 ✅；(5) 版本維持 0.28.64；(6) 測試 +34（4054→4088）✅
- **[0.28.63+feature] 2026-03-06**：auto-forge-trigger + queue-cli-enhancement——知識缺口自動觸發 forge + 細粒度佇列操作——(1) knowledge-gap-detector.js shouldAutoForge()/autoForge() 低分 gap 自動觸發；(2) execution-queue.js insertItem/removeItem/moveItem 支援指定位置操作；(3) queue.js 新增 insert/remove/move/info/retry CLI 子命令；(4) 新增 15+64=79 個測試；(5) 版本維持 0.28.63；(6) 測試 +79（3971→4050）✅
- **[0.28.62] 2026-03-06**：L3.7 skill-internalization——經驗內化飛輪——(1) 新增 skill-evaluator.js（資格評估 4 API）+ skill-generalizer.js（通用化 2 API）+ experience-index.js（索引管理 3 API）；(2) Instinct skill 新增 auto-discovered.md 與 internalized.md 管理；(3) evolution.js internalize 子命令（`bun scripts/evolution.js internalize [--execute] [--json]`）；(4) 新增 6 個測試檔 + 95 個測試；(5) 版本維持 0.28.62；(6) scripts/lib 模組 +3（48→51）；(7) health-check +1 項（checkInternalizationIndex）；(8) 測試 +95（3781→3876）✅

## Phase 3 規劃狀態（✅ 完成）

> Phase 2 完成 → Phase 3 規劃完成（2026-03-03 PM Discovery）→ Phase 3 完成（2026-03-05）

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

## Phase 4 規劃狀態（開始中）

> Phase 3 完成 → Phase 4 開始（2026-03-05）

Phase 4 目標：Level 3 自我進化能力 + 第一個垂直切片（交易）。
架構：Evolution Engine（gap detection + auto-fix + feedback loop）+ 垂直切片示範。

| 階段 | 名稱 | 內容 | 狀態 |
|:----:|------|------|:----:|
| P4.1 | Gap Detection | gap-analyzer.js + evolution.js analyze CLI + 52 個測試 | ✅ |
| P4.2 | Auto-Fix | gap-fixer.js + evolution.js fix CLI + 修復策略 + 50 個測試 | ✅ |
| P4.3-5 | 垂直切片 + 泛化 | skill/agent 自主建構 + Acid Test + 做減法能力 | ⬜ |

> 詳細計劃見 `docs/roadmap.md` Phase 4 章節。

## 已知問題

- F2 Model Grader 需真實執行環境驗證（grader:score 事件）

## 文件索引

| 文件 | 路徑 | 說明 |
|------|------|------|
| 願景 | docs/vision.md | 五層同心圓架構、核心信念、設計原則、成熟度模型 |
| 路線圖 | docs/roadmap.md | Phase 計劃、S 系列技術路線、失真防護、歷史 |
| 主規格 | docs/spec/overtone.md | 設計索引 |
| 架構 | docs/spec/overtone-架構.md | 三層架構、Hook |
| 工作流 | docs/spec/overtone-工作流.md | 18 個 workflow 模板 |
| Agents | docs/spec/overtone-agents.md | 18 個 agent（含 grader + claude-developer） |
| 並行 | docs/spec/overtone-並行.md | Loop、Mul-Agent、D1-D4 |
| 子系統 | docs/spec/overtone-子系統.md | Specs、Dashboard |
| 驗證品質 | docs/spec/overtone-驗證品質.md | 三信號、pass@k |
| 決策點 | docs/spec/overtone-decision-points.md | 控制流決策點索引（User Gate / 自動決策 / Stage 轉場 / 狀態圖） |
