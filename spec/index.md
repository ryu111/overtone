# 專案索引
> 自動產生於 2026-03-19

## 元件目錄

### Rules（17）

| 名稱 | 簡述 |
|------|------|
| 失敗與修復 | 失敗與修復（3 次失敗 STOP 協議、完成證據（Evidence Requirements）、根因修復） |
| 本地模型委派 | 本地模型委派（三層決策分配、委派前四維評估、能力邊界） |
| 並行執行 | 並行執行（依賴偵測） |
| 事件驅動架構 | 事件驅動架構（第一性原理、統一 Stream 模型、同步例外） |
| 知識管理 | 知識管理（知識持久化：自動分類、分類決策樹、單一來源原則（DRY）） |
| 常駐服務 | 常駐服務管理（命名規範、自動啟動、防重複啟動） |
| 深度路由 | 深度路由（Session 內任務追蹤、Planner 職責、動態 Skill 注入） |
| 閉環規範 | 閉環規範（元件閉環、改名/合併/刪除、Spec 任務狀態同步） |
| 測試規範 | 測試規範 |
| 開發流程 | 開發流程（先搜再寫、網搜強化（L1-L4 自我進化）、依賴安全（Slopsquatting 防護）） |
| 詢問規範 | 詢問規範（核心規則、提問紀律） |
| 寫作規範 | 寫作規範（語言設定、強調標記、術語一致性） |
| 模組職責分離 | 模組職責分離（單一資料方向原則、判斷方法、現有模組職責表） |
| 總結格式 | 總結格式（格式、規則、index.md 同步規則） |
| 瀏覽器工具選擇 | 瀏覽器工具選擇（為什麼 PinchTab 優先、路由規則、PinchTab 已知限制） |
| commit-規範 | Commit 規範（Conventional Commit、Guard 觸發詞） |
| spec管理 | Spec 本地任務管理（任務生命週期、元件目錄同步、任務命名） |

---

### Skills（27）

| 名稱 | 簡述 |
|------|------|
| agent-browser | 瀏覽器自動化 CLI 工具 — Vercel Labs 出品，Rust 核心 + Playwright，適合 AI agent 的無狀態瀏覽器操作 |
| architecture | 系統架構設計、ADR 決策記錄、設計模式選擇、技術 tradeoff 分析框架、並發策略選擇。 |
| auto | 深度路由決策。WHAT: 根據設計決策密度選 D0-D4 + 委派策略。WHEN: Main 接到任何任務、或不確定自己做還是委派時。KEYWORDS: 深度、 |
| claude-dev | Claude Code Plugin 開發知識。hooks、agents、skills、commands 的 API 格式、settings 設定系統與 Ove |
| closed-loop | 元件閉環檢查。新增/修改/刪除 Skill、Agent、Hook 時確認依賴完整、資訊流通、spec 文件同步。修改元件文件時由 rules/閉環規範.md 觸 |
| code-review | PR Review 知識域：四維度結構化審查（code quality / security / performance / observability）+ 回 |
| commit-convention | Conventional commit 知識域：type 分類、atomic commit 原則、拆分標準、message 格式。 |
| craft | 軟體工藝知識域：Overtone 製作原則、設計品味、競品基準、程式碼層級設計模式。聚焦 Expert 知識（非教科書）。 |
| database | 資料庫審查知識。SQL 效能、索引策略、migration 安全審查清單。供 database-reviewer agent 消費。 |
| dead-code | 死碼清理知識。knip/depcheck 工具指南、手動清理策略、安全刪除策略。供 refactor-cleaner agent 消費。 |
| debugging | 除錯方法論與根因分析框架：RCA 五步法、JS 錯誤模式庫、Bug 重現清單、並發問題診斷指南。 |
| evolve | 分析 Instinct 觀察記錄，摘要知識積累狀態，建議或執行進化（Instinct → Skill/Agent）。 |
| instinct | 跨專案內化知識庫：從 session 學習資料評估並永久保留的通用知識條目，由 skill-internalization 飛輪自動維護。 |
| issue | 從 GitHub Issue 啟動 Overtone workflow。讀取 Issue 內容，根據 labels 自動選擇 workflow 類型，建立 fe |
| jsonl-truncate-n | JSONL 日誌截斷策略。Nova 系統中 JSONL 檔案的安全截斷、保留策略、實際用法。 |
| nova-autonomous-control | 自主成長閉環 — heartbeat 批次執行 + Opus 缺口分析 + 本地任務管理 + focus 策略方向 |
| nova-pm | 產品探索與需求釐清。引導 Main Agent 以 PM 角色探索需求、定義範圍、比較方案。三種模式：discovery（純探索）、product（PM + s |
| nova-spec | 產品規格管理。建立、追蹤、歸檔 spec/design 文件。使用者說「寫規格」「提案」「歸檔」或觸發 /spec:propose、/spec:done、/sp |
| nova-test | 測試策略知識域。什麼該測、什麼不該測、怎麼測、何時跑。基於 Testing Trophy + 風險驅動。撰寫或審查測試時使用。 |
| onboard | 掃描專案結構，產生 CLAUDE.md 骨架。偵測技術棧、常用命令、目錄結構，輸出到對話供使用者自行寫入。 |
| os-control | OS 操控知識域。桌面自動化、系統管理、螢幕截圖、音訊控制、WebSocket 即時通訊等 OS 能力的 reference 索引。供 architect、te |
| pinchtab | Control a headless or headed Chrome browser via Pinchtab's HTTP API for web auto |
| pr | 從 Overtone workflow 結果自動建立 GitHub Pull Request。收集 git 變更和 workflow 狀態，組裝結構化 PR d |
| security-kb | 安全審查知識。OWASP Top 10 檢查清單、JS 安全模式、STRIDE 威脅建模、供應鏈安全、安全報告格式。供 security-reviewer 和  |
| skill-judge | Evaluate Agent Skill design quality against official specifications and best pra |
| thinking | 結構化思維工具：卡關脫困策略、反向驗證法、化繁為簡級聯。用於設計決策僵局、複雜問題拆解、方案驗證。 |
| wording | 措詞正確性知識域。涵蓋四級指令強度標記（⛔📋💡🔧）、emoji-關鍵詞搭配規則、語氣校準（技術文件/commit/agent prompt/對話）、繁體中 |

---

### Scripts（43）

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
| evolution | 進化引擎統一 CLI |
| gap-analyzer | Finding → Gap 轉換層 |
| gap-discovery | R4.2 缺口自動發現引擎 |
| gap-fixer | Gap 修復策略引擎 |
| git-sync | Git 操作工具（commit + push + commit message 生成） |
| health-check | Nova 系統四維度確定性健康檢查 |
| health-check-checks | Check 層 |
| health-check-scan | Scan 層 |
| health-check-utils | 工具函式層 |
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
| local-model | AI 模型 client（單一來源） |
| maintainer | 本地模型驅動的維護 agent（v2：模型決策 + 程式碼執行） |
| memory-reclaim | 記憶體回收 |
| prepare-lora-data | 從現有資料合成 LoRA 訓練集 |
| session-recorder | Session 摘要與簡報記錄（Phase 4a + 4b 包裝） |
| session-spawner | claude -p spawn 封裝 |
| skill-forge | Skill 建立引擎（forgeSkill + improveSkill + deploySkill） |
| skill-janitor | Skill 庫存管理（pruning + 健康度檢查） |
| smoke-test | 整合驗證腳本 |
| spec-tasks | 本地任務管理模組 |
| task-adapter | R4.3 新任務快速適應機制 |
| tool-matcher | 意圖→工具語意匹配：給定任務描述，從 tool-registry 推薦工具組合 |
| tool-registry | 工具索引：掃描 5 種工具來源，建立統一查詢索引 |
| wrapup | session 收尾編排器 |
| wrapup-benchmark | Phase B 效能 + 品質對比（本地 MLX vs Haiku API） |
| wrapup-marker | session 收尾 marker 讀寫 |

---

## 任務狀態

### 進行中（0）

_目前無進行中的任務_

---

### 待做（1）

| 任務 | 類型 | 優先 | 深度 | 建立時間 |
|------|------|:----:|:----:|---------|
| github-automation | — | — | — | — |

---

### 最近完成（前 10 筆）

| 任務 | 類型 | 完成時間 | 結果 |
|------|------|---------|------|
| capability-probe 修復 | 修復 | 2026-03-18 | 修復完成，timeout 從 42 次降到 0 次 |
| 2026-03-15_nova-server-observability | — | — | — |
| 2026-03-16_health-check | — | — | — |
| tool-registry | — | — | — |
| gap-analyzer | — | — | — |
| r4-e2e-verification | — | — | — |
| r4-e2e-integration | — | — | — |
| session-wrapup-refactor | — | — | — |
| dashboard-g3-unify | — | — | — |
| 2026-03-16_heartbeat-engine | — | — | — |
