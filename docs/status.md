# Overtone 現況

> 最後更新：2026-03-05 | Plugin 版本：0.28.49（Hook 薄殼化 + 9 個 Handler 模組 + 3 個共用工廠）

## 版本狀態

| 版本 | 狀態 | 說明 |
|------|------|------|
| V1 | 進行中 | 3360 pass，0 fail，核心功能完整 + 守衛強化 11/11 + Knowledge Engine + 跨 Session 長期記憶 + 效能基線追蹤 + 數值評分引擎 + 趨勢分析 + 回饋閉環 + 卡點識別 + 時間序列學習（Level 2 完成）+ 核心穩固清理 + mul-agent 泛化 + P3.0 閉環基礎 + P3.1 感知層（screenshot.js + window.js + perception.md）+ P3.2 心跳引擎（heartbeat.js + session-spawner.js）+ P3.3 系統層（process.js + clipboard.js + system-info.js + notification.js + fswatch.js）+ 並行收斂門 + Status Line TTL 防護 + Specs checkbox fallback 修復 + Level 2→1 整合修復（gradedStages 擴大 + 失敗原因記錄 + 全域觀察注入）+ Agent Memory 升級（8 個跨層級 agent + Score Context 個人化 + Grader 強制化）+ 核心簡化（移除 active-agent.json + 並行提示修復 + 不變量守衛）+ Hook Contract 自我修復（state.sanitize() + 8 個 hook 合約測試）+ 主動偵測（health-check 12 項，含元件鏈 + 資料品質 + 趨勢分析 + 測試增長率）+ Health-Check 精確度提升（假陽性 23→0 error + 孤兒 active stage 守衛）+ Queue CLI + PM 佇列整合 + Spawner 防禦 + Hook 薄殼化（9 handler 模組）+ Telegram /run 命令 + PM 佇列自動寫入 + CLAUDECODE env filter|
| V2 | 規劃中 | 延後 |

## 核心指標

| 指標 | 數值 |
|------|------|
| Agent 數量 | 18（含 grader） |
| Stage 數量 | 16 |
| Workflow 模板 | 18 |
| 測試通過 | 3360 pass / 0 fail（151 個測試檔） |
| 測試檔案 | 151 個 |
| Hook 數量 | 11 個 |
| Skill 數量 | 23（15 knowledge domain + orchestrator + pm + specs + 4 utility-with-refs） |
| Knowledge Domain 數 | 15（testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system、os-control、autonomous-control、craft、claude-dev） |
| Command 數量 | 28（14 stage shortcut + 7 workflow pipeline + 7 utility） |
| Telegram 命令 | 6（/start、/status、/stop、/run、/sessions、/help） |
| Timeline Events | 27 個 |

## 近期變更（最近 3 筆）

- **[0.28.49] 2026-03-05**：Hook 薄殼化重構完成 + 9 個 Handler 模組 + 遠端控制增強——(1) 9 個 hook 薄殼化（平均 ~250 行 → ~29 行）；(2) 新增 9 個 handler 模組（scripts/lib/）：session-start/stop/end-handler、agent-stop-handler、pre-task-handler、on-submit-handler、post-use/failure-handler、pre-compact-handler；(3) 共用工廠統一使用（specs-archive-scanner + hook-timing + feature-sync）；(4) Telegram /run 命令新增；(5) PM 完成時自動解析佇列表格寫入 execution-queue；(6) CLAUDECODE env 過濾防止嵌套偵測誤觸；(7) 測試 +16（3344→3360，150→151 files）
- **[0.28.48] 2026-03-05**：Hook 共享模組抽取 + 並行門收斂——(1) 新增 3 個跨 hook 共享模組：specs-archive-scanner.js（掃描式歸檔）、hook-timing.js（hook:timing emit 工廠）、feature-sync.js（featureName 自動同步）；(2) 新增 feature-sync.test.js（7 個測試）；(3) 8 個 hook 改用新工廠函式，確保一致性；(4) 並行收斂門完整測試；(5) 測試 +7（3231→3238，139→140 files）
- **[0.28.47] 2026-03-04**：statusline 集中式狀態管理 + TTL 機制 + 並行 agent 修復——(1) 新增 statusline-state.js 模組（activeAgents/workflowType/idle 狀態管理）；(2) statusline.js 三態邏輯優化（active agent / Main 控制 / idle 收回）；(3) TTL 機制（idle 10min 自動過期）；(4) 並行 agent statusline 殘留修復；(5) initState 防撞守衛；(6) session ID 隔離強化
- **[0.28.42] 2026-03-04**：測試套件瘦身 + Hook 優化 — (16) data-auto-digest SessionEnd 自動摘要；(17) quick workflow 移除 TEST stage；(18) TaskCompleted hook 移除 bun test（消除 45s 假等待）；(19) test-suite-slimdown 刪除低價值測試（3235→3114，-121 tests）；(20) test-growth-monitor health-check 第 12 項偵測（20% 增長率閾值）→ 3127 pass / 137 files
- **[0.28.41] 2026-03-04**：資料管理框架 — (1-10) 穩定化迭代；(11) data-hygiene 清理機制；(12) data-cli 統一查詢 CLI；(13) data-policy 資料保留策略；(14) hook-observability hook:timing 計時事件；(15) data-cross-analysis 跨資料源交叉分析（failure-hotspot + hook-overhead + workflow-velocity）→ 3213 pass / 137 files
- **[0.28.38] 2026-03-04**：主動偵測 — health-check 新增 3 項偵測：(1) component-chain 元件依賴鏈驗證；(2) data-quality JSONL 格式審計；(3) quality-trends 失敗模式/分數趨勢/低分警告 → 3104 pass / 133 files（+21 tests）
- **[0.28.37] 2026-03-04**：Hook Contract 自我修復 — (1) state.sanitize() 在 SessionStart 清理孤兒 activeAgent + status 不一致；(2) 8 個 hook 合約整合測試 + 11 個 sanitize 單元測試 → 3083 pass / 132 files

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
