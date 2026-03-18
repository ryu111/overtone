# Overtone 專案索引
> 自動生成於 2026-03-19

## 元件目錄

### Rules（16）

| 名稱 | 簡述 |
|------|------|
| commit-規範 | Commit 規範（Conventional Commit 格式 + Overtone 專有規則） |
| 並行執行 | 並行執行原則（預設並行、依賴偵測、委派策略） |
| 事件驅動架構 | 事件驅動架構（統一 Stream 模型、模組介面、錯誤隔離） |
| 失敗與修復 | 失敗與修復（3 次失敗 STOP 協議、根因修復、防護建立） |
| 寫作規範 | 寫作規範（語言設定繁體中文、強調標記、術語一致性） |
| 常駐服務 | 常駐服務管理（nova-server 命名、防重複啟動、熱重載） |
| 本地模型委派 | 本地模型委派（三層決策分配、四維評估、Qwen3-8B 注意事項） |
| 模組職責分離 | 模組職責分離（寫出/讀入/判定單一方向原則） |
| 深度路由 | 深度路由（D0-D4 路由決策、planner/executor/reviewer 職責） |
| 測試規範 | 測試規範（Testing Trophy、風險驅動、層級路由） |
| 瀏覽器工具選擇 | 瀏覽器工具選擇（PinchTab 優先、路由規則、CLI 指令參考） |
| 知識管理 | 知識管理（持久化分類決策樹、DRY 原則、CLAUDE.md 治理） |
| 總結格式 | 總結格式（收尾流程、Phase A+B+C、Stop Hook 強制收尾） |
| 詢問規範 | 詢問規範（AskUserQuestion 使用時機、提問紀律） |
| 閉環規範 | 閉環規範（元件閉環 4 層 checklist、文件同步、章文件對照） |
| 開發流程 | 開發流程（先搜再寫、網搜強化、Slopsquatting 防護） |

---

### Skills（27）

| 名稱 | 簡述 |
|------|------|
| agent-browser | 瀏覽器自動化 CLI 工具（Vercel Labs / Rust + Playwright，適合無狀態操作） |
| architecture | 系統架構設計、ADR 決策記錄、設計模式選擇、技術 tradeoff 分析框架 |
| auto | 深度路由決策（D0-D4 委派策略，Main 接到任何任務時使用） |
| claude-dev | Claude Code Plugin 開發知識（hooks / agents / skills / commands API 格式） |
| closed-loop | 元件閉環檢查（新增/修改/刪除元件時確認依賴完整、資訊流通、spec 同步） |
| code-review | PR Review 知識域（四維度審查 + 回饋分級 + 審查撰寫指南） |
| commit-convention | Conventional Commit 知識域（type 分類、atomic commit、拆分標準） |
| craft | 軟體工藝知識域（Overtone 製作原則、設計品味、程式碼層級設計模式） |
| database | 資料庫審查知識（SQL 效能、索引策略、migration 安全審查清單） |
| dead-code | 死碼清理知識（knip/depcheck 工具指南、手動清理策略、安全刪除） |
| debugging | 除錯方法論（RCA 五步法、JS 錯誤模式、並發問題診斷） |
| evolve | 分析 Instinct 記錄，建議或執行知識進化（Instinct → Skill/Agent） |
| instinct | 跨專案內化知識庫（session 學習資料的通用知識條目，skill-internalization 飛輪維護） |
| issue | 從 GitHub Issue 啟動 Overtone workflow（自動選擇 workflow 類型 + 建 feature branch） |
| jsonl-truncate-n | JSONL 日誌截斷策略（Nova 各 JSONL 的安全截斷與保留策略） |
| nova-autonomous-control | 自主成長閉環（heartbeat 批次執行 + Opus 缺口分析 + 本地任務管理） |
| nova-pm | 產品探索與需求釐清（discovery / product / product-full 三種模式） |
| nova-spec | 產品規格管理（建立、追蹤、歸檔 spec/design 文件） |
| nova-test | 測試策略知識域（Testing Trophy + 風險驅動，撰寫/審查測試時使用） |
| onboard | 掃描專案結構，產生 CLAUDE.md 骨架（偵測技術棧、常用命令） |
| os-control | OS 操控知識域（桌面自動化、系統管理、音訊控制、WebSocket 即時通訊） |
| pinchtab | 透過 Pinchtab HTTP API 控制 Chrome（網頁自動化、表單填寫、截圖擷取） |
| pr | 從 Overtone workflow 結果自動建立 GitHub Pull Request |
| security-kb | 安全審查知識（OWASP Top 10、JS 安全模式、STRIDE 威脅建模、供應鏈安全） |
| skill-judge | 評估 Agent Skill 設計品質（多維度評分 + 改善建議） |
| thinking | 結構化思維工具（卡關脫困策略、反向驗證法、化繁為簡級聯） |
| wording | 措詞正確性知識域（四級標記、emoji 規則、技術寫作慣例） |

---

### Agents（3）

| 名稱 | 簡述 |
|------|------|
| executor | 程式碼執行者（依照 planner 計劃實作、執行測試、commit；model: sonnet） |
| planner | 架構規劃專家（分析複雜度、選深度路由、產出結構化計劃；model: opus） |
| reviewer | 資深程式碼審查者（架構合理性、安全基本面、DB 設計；model: opus，唯讀） |

---

### Commands（2）

| 名稱 | 簡述 |
|------|------|
| ask | 分析當前工作狀態，產出結構化建議並讓使用者選擇執行（短期/中期/長期/觀察） |
| nova-flow | 啟動 Nova 控制中心（Flow Visualizer + Dashboard） |

---

### Hook Modules（6）

| 名稱 | 簡述 |
|------|------|
| context-injector | SessionStart 上下文聚合模組（健康狀態 + hook errors + briefing 注入） |
| flow-observer | Flow 事件觀察模組（session 生命週期事件記錄與 emit） |
| guards | 統一守衛模組（Bash 黑名單 + 元件保護，PreToolUse 阻擋危險操作） |
| heartbeat | lifecycle 模組（定時自驅，heartbeat 觸發 + 任務排程） |
| metrics | Nova Server 可觀測層（請求計數、延遲、SSE 連線追蹤） |
| notification | macOS 通知模組（Claude hook Notification 事件 → 原生通知） |

---

### 核心 Scripts（43）

| 名稱 | 簡述 |
|------|------|
| acid-test | L2 Acid Test 端到端驗收腳本 |
| briefing-builder | Session 摘要 + 簡報生成 |
| capability-probe | 能力邊界探測 + 模型更新 |
| component-health | 元件維護（文件搬遷、lockfile 修復、lifecycle、capability probe） |
| daemon-utils | daemon 基礎設施共用函式 |
| daily-logger | 每日日誌聚合器 |
| decision | Phase 2 模型決策輔助函式 |
| error-analyzer | hook error 聚類 + 去重 + 本地任務建立 |
| evolution | Skill 進化流程 |
| gap-analyzer | 缺口分析引擎 |
| gap-discovery | 缺口自動發現引擎 |
| gap-fixer | 缺口修復執行器 |
| git-sync | Git 操作工具（commit + push + commit message 生成） |
| health-check | 系統健康檢查主入口 |
| health-check-checks | 健康檢查項目集 |
| health-check-scan | 健康檢查掃描器 |
| health-check-utils | 健康檢查工具函式 |
| heartbeat | heartbeat 核心邏輯（state 管理 / poll / executeTask / 改善效果驗證） |
| impact-analyzer | 規則變更影響分析 |
| judge | 通用品質評估 + 趨勢追蹤 |
| judge-improvements | F 級改善建議生成（從 judge.js 拆分） |
| judge-scores | 評分記錄的讀寫、去重、截斷（從 judge.js 拆分） |
| judge-scoring | 確定性評分 + 語意評分（從 judge.js 拆分） |
| learner | 行為習慣偵測器 |
| learner-analysis | 行為分析純函式模組 |
| learner-suggestions | 建議生成模組 |
| lifecycle-orchestrator | Skill Lifecycle 串聯引擎 |
| local-model | AI 模型 client（單一來源，haiku → 本地 MLX，sonnet/opus → Claude API） |
| maintainer | 本地模型驅動的維護 agent（模型決策 + 程式碼執行） |
| memory-reclaim | 記憶體回收 |
| prepare-lora-data | 從現有資料合成 LoRA 訓練集 |
| session-recorder | Session 摘要與簡報記錄（Phase 4a + 4b 包裝） |
| session-spawner | claude -p spawn 封裝 |
| skill-forge | Skill 建立引擎（forgeSkill + improveSkill + deploySkill） |
| skill-janitor | Skill 庫存管理（pruning + 健康度檢查） |
| smoke-test | 整合驗證腳本 |
| spec-tasks | 本地任務管理 CLI |
| task-adapter | R4.3 新任務快速適應機制 |
| tool-matcher | 意圖 → 工具語意匹配（從 tool-registry 推薦工具組合） |
| tool-registry | 工具索引（掃描 5 種工具來源，建立統一查詢索引） |
| wrapup | session 收尾編排器 |
| wrapup-benchmark | Phase B 效能 + 品質對比（本地 MLX vs Haiku API） |
| wrapup-marker | session 收尾 marker 讀寫 |

---

## 任務狀態

### 進行中（0）

_目前無進行中的任務_

---

### 待做（6）

| 任務 | 簡述 |
|------|------|
| event-bus-refactor | Event Bus Refactor — 規格 |
| github-automation | GitHub 自動化（場景三第一個跨領域任務） |
| health-check-warning-cleanup | health-check 57 Warning 分類清理 |
| heartbeat-quality | Heartbeat 品質提升 + Spawn 穩定性 |
| r4-e2e-integration | R4 自驅閉環端到端整合驗證測試 |
| self-drive-verification | Self-Drive 改善效果驗證閉環 |

---

### 最近完成（前 10 筆）

| 任務 | 簡述 |
|------|------|
| D1-capability-probe-修復-20260319 | capability-probe 修復（Phase 3c timeout 42 次降至 0 次） |
| session-wrapup-refactor | Session 收尾架構重構 |
| dashboard-ia-restructure | Dashboard 資訊架構重組（8→5 Tab，營運 Sub-Tab + 系統 4 區塊） |
| dashboard-optimization | Dashboard 後續優化（迭代 1 + 迭代 2 全部完成） |
| dashboard-g3-unify | Dashboard G3 星空風格深度整合 |
| dashboard-modularize | Dashboard 模組化重構 |
| r4-e2e-verification | R4 自驅閉環端到端真實驗證 |
| auto-skill-rewrite | skills/auto 深度路由知識重寫（D→B 優化） |
| task-adapter | task-adapter.js 新任務快速適應機制 |
| gap-discovery | gap-discovery.js 缺口自動發現引擎 |
