# 專案索引
> 自動產生於 2026-03-23

## 元件目錄

### Rules（21）

| 名稱 | 簡述 |
|------|------|
| 主動關聯工具 | 主動關聯已有工具（觸發時機、做法） |
| 失敗與修復 | 失敗與修復（3 次失敗 STOP 協議、完成證據（Evidence Requirements）、根因修復） |
| 本地模型委派 | 本地模型委派（三層決策分配、委派前四維評估、能力邊界） |
| 成功即進化 | 成功即進化（觸發條件、進化流程） |
| 自驅模式規範 | 自驅模式規範（原因、方案、實作） |
| 並行執行 | 並行執行（依賴偵測、前景並行 vs 背景） |
| 事件驅動架構 | 事件驅動架構（第一性原理、統一 Stream 模型、同步例外） |
| 知識管理 | 知識管理（知識持久化：自動分類、分類決策樹、單一來源原則（DRY）） |
| 迭代語意 | 迭代語意（迭代的前提條件） |
| 常駐服務 | 常駐服務管理（命名規範、自動啟動、防重複啟動） |
| 深度路由 | 深度路由（◆ 入口閘門（HARD GATE）、Spec 任務追蹤（Step 3）、深度判斷標準） |
| 閉環規範 | 閉環規範（Skill 品質閘門、元件閉環、閉環深度（4 層）） |
| 測試規範 | 測試規範（測試位置） |
| 開發流程 | 開發流程（先搜再寫、網搜強化（L1-L4 自我進化）、依賴安全（Slopsquatting 防護）） |
| 詢問規範 | 詢問規範（核心規則、提問紀律） |
| 寫作規範 | 寫作規範（語言設定、強調標記、術語一致性） |
| 模組職責分離 | 模組職責分離（單一資料方向原則、判斷方法、現有模組職責表） |
| 總結格式 | 總結格式（格式、Spec 任務追蹤、index.md 同步規則） |
| 瀏覽器工具選擇 | 瀏覽器工具選擇（為什麼 PinchTab 優先、路由規則、PinchTab 已知限制） |
| commit-規範 | Commit 規範（Conventional Commit、Guard 觸發詞） |
| Telegram輸出 | Telegram 輸出規範（CLI 可見性） |

---

### Skills（30）

| 名稱 | 簡述 |
|------|------|
| agent-browser | "瀏覽器自動化 CLI 工具 — Vercel Labs 出品，Rust 核心 + Playwright。WHEN: 需要 JS 執行、鍵盤 modifier  |
| architecture | "系統架構設計知識域。WHEN: 架構決策（ADR）、設計模式選擇、技術 tradeoff 分析、並發策略選擇時使用。NOT: 純程式碼實作、bug 修復、日常 |
| auto | 深度路由決策。WHAT: 根據設計決策密度選 D0-D4 + 委派策略。WHEN: Main 接到任何任務、或不確定自己做還是委派時。KEYWORDS: 深度、 |
| claude-dev | Claude Code Plugin 開發知識。hooks、agents、skills、commands 的 API 格式、settings 設定系統與 Ove |
| closed-loop | 元件閉環驗證。新增/修改/刪除 Skill、Agent、Hook 時，確認跨元件依賴完整、資訊流通、spec 文件同步。只在元件之間存在依賴需要驗證時觸發（如新 |
| code-review | "PR Review 知識域：四維度結構化審查 + 回饋分級。WHEN: 審查 PR、code review、撰寫審查回饋時使用。NOT: 撰寫新程式碼、deb |
| commit-convention | "Conventional commit 知識域。WHEN: 撰寫 commit message、判斷 commit 拆分策略、選擇 type/scope 時使 |
| craft | "軟體工藝知識域：Overtone 製作原則、設計品味、競品基準、程式碼層級設計模式。WHEN: 設計決策品質判斷、競品對標時使用。NOT: 教科書級基礎知識、 |
| database | "資料庫審查知識：SQL 效能、索引策略、migration 安全。WHEN: 審查 SQL 查詢、設計索引、migration 安全性檢查時使用。NOT: 應 |
| dead-code | "死碼清理知識：knip/depcheck 工具、手動清理策略、安全刪除。WHEN: 清理未使用程式碼、codebase 瘦身時使用。NOT: 功能開發、重構。 |
| debugging | "除錯方法論與根因分析框架。WHEN: 遇到 bug 需要根因分析（RCA）、重現問題、診斷並發問題時使用。NOT: 功能開發、架構設計。" |
| evolve | "知識進化引擎（含內化知識庫）。WHEN: 分析知識積累狀態、查詢已內化的跨專案經驗、決定是否升級為 Skill/Agent 時使用。NOT: 專案特定知識、一 |
| issue-triage | GitHub Issue 自動分類知識域：gh CLI 驅動的 Issue 分析 + 類型/優先序/深度路由判定。WHEN: Issue 自動分類、批量 tri |
| jsonl-truncate-n | "JSONL 日誌截斷策略。WHEN: 處理 Nova 系統 JSONL 檔案的截斷、決定保留數量時使用。NOT: 一般檔案操作、非 JSONL 格式。" |
| mlx-finetune | "MLX LoRA 微調知識域：資料準備、訓練指令、adapter 管理、多角色部署。WHEN: 需要微調本地模型（客服、NPC、專業助手）時使用。NOT: 推 |
| mlx-rl | "MLX 強化學習知識域：環境設計、觀測/動作/獎勵設計、DQN/PPO 訓練迴圈、遊戲 AI 整合。WHEN: 需要訓練即時決策 agent（遊戲 AI、自動 |
| nova-autonomous-control.archived | "自主成長閉環控制。WHEN: 配置 heartbeat 自驅策略、設定 focus 方向、管理本地任務批次執行時使用。NOT: 一般開發工作、手動任務執行。" |
| nova-pm | 產品探索與需求釐清。引導 planner agent 以 PM 角色探索需求、定義範圍、比較方案。三種模式：discovery（D1）、product（D2）、 |
| nova-spec | 產品規格管理。建立、追蹤、歸檔 spec/design 文件。使用者說「寫規格」「提案」「歸檔」或觸發 /spec:propose、/spec:done、/sp |
| nova-test | 測試策略知識域。什麼該測、什麼不該測、怎麼測、何時跑。基於 Testing Trophy + 風險驅動。撰寫或審查測試時使用。 |
| onboard | "專案掃描與 CLAUDE.md 骨架生成。WHEN: 初次進入新專案、需要產生或補充 CLAUDE.md 時使用。NOT: 已有完整 CLAUDE.md 的日 |
| os-control | "OS 操控知識域：桌面自動化、系統管理、螢幕截圖、音訊控制、WebSocket 即時通訊。WHEN: 需要作業系統層級操作（非瀏覽器）時使用。NOT: 純程式 |
| pinchtab | "Chrome 瀏覽器操控 — Pinchtab HTTP API。WHEN: 需要網頁自動化、表單填寫、截圖擷取且 PinchTab 常駐服務（port 98 |
| pr | "GitHub PR 建立工具。WHEN: 功能完成、需要建立 Pull Request 並組裝結構化描述時使用。NOT: 程式碼開發過程、code revie |
| pr-auto-review | GitHub PR 自動審查知識域：gh CLI 驅動的 diff 分析 + 結構化 review comment 產出。WHEN: 自動化 PR 審查、批量  |
| release-notes | Release Notes 自動生成知識域：git log 分析 + Conventional Commit 分類 + 結構化 changelog 產出。WHE |
| security-kb | "安全審查知識：OWASP Top 10、JS 安全模式、STRIDE 威脅建模、供應鏈安全。WHEN: 安全審查、威脅建模、檢查注入風險時使用。NOT: 功能 |
| skill-judge | 對 Skill 設計品質進行多維度評分（知識密度、觸發精準度、結構完整性等）。在需要量化評估 Skill 整體設計優劣、生成改善建議報告、或進行 Skill 品 |
| thinking | "結構化思維工具：卡關脫困策略、反向驗證法、化繁為簡級聯。WHEN: 設計決策僵局、複雜問題需要拆解、方案需要反向驗證時使用。NOT: 直接可執行的簡單任務。" |
| wording | 措詞正確性知識域。涵蓋四級指令強度標記（⛔📋💡🔧）、emoji-關鍵詞搭配規則、語氣校準（技術文件/commit/agent prompt/對話）、繁體中 |

---

### Scripts（51）

| 名稱 | 簡述 |
|------|------|
| acid-test | L2 Acid Test 端到端驗收腳本 |
| autoresearch-task | heartbeat 自驅：找最低分 eval 跑 autoresearch |
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
| manage-component | 元件管理 CLI |
| memory-reclaim | 記憶體回收 |
| os-control-driver | OS-level 自動化操控 Claude CLI |
| prepare-lora-data | 從現有資料合成 LoRA 訓練集 |
| ralph-stop | 關閉 ralph-loop |
| session-cleanup | Session 日誌滾動清理 |
| session-recorder | Session 摘要與簡報記錄（Phase 4a + 4b 包裝） |
| session-spawner | claude -p spawn 封裝 |
| skill-forge | Skill 建立引擎（forgeSkill + improveSkill + deploySkill） |
| skill-janitor | Skill 庫存管理（pruning + 健康度檢查） |
| smoke-test | 整合驗證腳本 |
| spec-tasks | 本地任務管理模組 |
| task-adapter | R4.3 新任務快速適應機制 |
| tg-ask | Telegram inline keyboard 互動詢問 |
| tg-notify | Telegram 推送通知（純發訊息，不等回應） |
| tg-patch | 在 Telegram plugin 加入 callback_query handler |
| tool-matcher | 意圖→工具語意匹配：給定任務描述，從 tool-registry 推薦工具組合 |
| tool-registry | 工具索引：掃描 5 種工具來源，建立統一查詢索引 |
| wrapup | session 收尾編排器 |
| wrapup-benchmark | Phase B 效能 + 品質對比（本地 MLX vs Haiku API） |
| wrapup-marker | session 收尾 marker 讀寫 |

---

### docs/archive（8）

| 名稱 | 簡述 |
|------|------|
| agent-specialization | Agent 專一化量化分析（S19） |
| claude-code-platform | Claude Code 平台能力完整參考 |
| data-policy | Overtone 資料保留策略 |
| design-system | 設計系統：Overtone Dashboard — Glassmorphism 重設計 |
| flow-visualizer-ui-v3 | Flow Visualizer UI v3 — 改善規格 |
| L1-L2-守衛與閉環-實作計劃 | L1 + L2 守衛與閉環腳本 -- 實作計劃 |
| performance-baselines | 效能基線文件（Performance Baselines） |
| skill-ecosystem-crossref-report | Skill 生態交叉比較報告 |

---

### docs/reference（1）

| 名稱 | 簡述 |
|------|------|
| testing-guide | 測試架構指南（Testing Guide） |

---

## 任務狀態

### 進行中（1）

| 任務 | 類型 | 優先 | 深度 | 認領時間 |
|------|------|:----:|:----:|---------|
| D1-Interactive-Ask-API | 功能 | P2 | D1 | 2026-03-23 |

---

### 待做（1）

| 任務 | 類型 | 優先 | 深度 | 建立時間 |
|------|------|:----:|:----:|---------|
| D1-Nova-Control-App-macOS-iOS-控制中心-20260322 | — | — | — | — |

---

### 最近完成（前 10 筆）

| 任務 | 類型 | 完成時間 | 結果 |
|------|------|---------|------|
| D2-nova-server-API-重構與文件化 | 重構 | 2026-03-23 | 44 端點分類重構 + 1348 行 API 文件 + 2 個缺失端點補齊 +  |
| 未引用-skill-歸檔或加入-agent | 功能 | 2026-03-23 | 歸檔 nova-autonomous-control（與 os-control- |
| Learner-behaviors-噪音根因修復 | 功能 | 2026-03-23 | context-injector 注入閾值從 0.4/0.6 提高到 0.7/0 |
| 修復 hook error：Stop:stop-hook（5 次/小時） | 修復 | 2026-03-23 | 根因：舊版 stop hook session_id_mismatch 累計 b |
| D2-OS-Control-自驅引擎 | 功能 | 2026-03-22 | Phase 1-3 全部完成 |
| D1-server-js-行數治理 | 功能 | 2026-03-22 | — |
| D1-health-check-測試補齊 | 功能 | 2026-03-22 | — |
| D1-acid-test-瘦身 | 功能 | 2026-03-22 | — |
| D1-Judge-評分校準 | 功能 | 2026-03-22 | — |
| D1-behaviors-品質審計 | 功能 | 2026-03-22 | — |
