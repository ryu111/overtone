# 專案索引
> 自動產生於 2026-03-31

## 元件目錄

### Rules（23）

| 名稱 | 簡述 |
|------|------|
| 失敗與修復 | 失敗與修復（3 次失敗 STOP 協議、完成證據（Evidence Requirements）、根因修復（第一次就做對）） |
| 本地模型委派 | 本地模型委派（三層決策分配、委派前四維評估、能力邊界） |
| 回報與反思 | 回報與反思 |
| 成功即進化 | 成功即進化 |
| 自我認知 | 自我認知（執行環境、行為影響） |
| 自壓縮 | 自壓縮（觸發條件、防迴圈、Session 替換） |
| 自驅任務迴圈 | 自驅任務迴圈 |
| 並行執行 | 並行執行（依賴偵測、前景並行 vs 背景、Agent 並行調度） |
| 事件驅動架構 | 事件驅動架構（SSE-first） |
| 命名衝突防護 | 命名衝突防護（內建指令（保留名稱）、為什麼、命名前檢查） |
| 知識管理 | 知識管理（知識持久化：自動分類、分類決策樹、單一來源原則（DRY）） |
| 迭代語意 | 迭代語意（迭代的前提條件） |
| 常駐服務 | 常駐服務管理（核心行為規則） |
| 深度路由 | 深度路由（◆ 入口閘門（HARD GATE）、Spec 任務追蹤（Step 3）、自主 vs 升級判斷） |
| 閉環規範 | 閉環規範（Skill 品質閘門、元件閉環、閉環深度（4 層）） |
| 測試規範 | 測試規範（測試位置） |
| 開發流程 | 開發流程（先搜再寫、網搜強化（L1-L4 自我進化）、依賴安全（Slopsquatting 防護）） |
| 詢問規範 | 詢問規範（核心規則、提問紀律） |
| 跨-Session-協作 | 跨 Session 協作（Scope 邊界、自動派發、接收任務） |
| 寫作規範 | 寫作規範（語言設定、強調標記、Wording Skill 觸發） |
| 模組職責分離 | 模組職責分離（單一資料方向原則、判斷方法、現有模組職責表） |
| 總結格式 | 總結格式（格式、Spec 任務追蹤、index.md 同步規則） |
| 瀏覽器工具選擇 | 瀏覽器工具選擇 |

---

### Skills（23）

| 名稱 | 簡述 |
|------|------|
| agent-browser | "瀏覽器自動化 CLI 工具 — Vercel Labs 出品，Rust 核心 + Playwright。WHEN: 需要 JS 執行、鍵盤 modifier  |
| architecture | "系統架構設計知識域。WHEN: 架構決策（ADR）、設計模式選擇、技術 tradeoff 分析、並發策略選擇時使用。NOT: 純程式碼實作、bug 修復、日常 |
| auto | 深度路由決策。WHAT: 根據設計決策密度選 D0-D4 + 委派策略。WHEN: Main 接到任何任務、或不確定自己做還是委派時。NOT: 已分類的任務執行 |
| claude-dev | Claude Code Plugin 開發知識。hooks、agents、skills、commands 的 API 格式、settings 設定系統與 Nov |
| closed-loop | 元件閉環驗證。新增/修改/刪除 Skill、Agent、Hook 時，確認跨元件依賴完整、資訊流通、spec 文件同步。WHEN: 新增 Skill 後確認 A |
| code-review | "PR Review 知識域：四維度結構化審查 + 回饋分級。WHEN: 審查 PR、code review、撰寫審查回饋時使用。NOT: 撰寫新程式碼、deb |
| commit-convention | "Conventional commit 知識域。WHEN: 撰寫 commit message、判斷 commit 拆分策略、選擇 type/scope 時使 |
| craft | "軟體工藝知識域：Nova 製作原則、設計品味、競品基準、程式碼層級設計模式。WHEN: 設計決策品質判斷、競品對標時使用。NOT: 教科書級基礎知識、一般 c |
| cross-session | "跨 Session 協作知識域。發送跨專案任務、讀取待辦、回報完成的 API 與流程。WHEN: 需要其他專案 session 配合時（改了 API 需要 i |
| dead-code | "死碼清理知識：knip/depcheck 工具、手動清理策略、安全刪除。WHEN: 清理未使用程式碼、codebase 瘦身時使用。NOT: 功能開發、重構。 |
| debugging | "除錯方法論與根因分析框架。WHEN: 遇到 bug 需要根因分析（RCA）、重現問題、診斷並發問題時使用。NOT: 功能開發、架構設計。" |
| feedback-loop | "回饋迴圈知識域：成功即進化、自驅任務迴圈、回報與反思的完整協議。WHEN: 完成任務後的反思、自驅任務的監控與排障、品質回報時使用。NOT: 初次任務規劃、架 |
| nova-pm | "產品探索與需求釐清。引導 planner agent 以 PM 角色探索需求、定義範圍、比較方案。WHEN: 需求不明確需要釐清、規格討論前的 PM 探索、D |
| nova-spec | "產品規格管理。建立、追蹤、歸檔 spec/design 文件。WHEN: 使用者說「寫規格」「提案」「歸檔」或觸發 /spec:propose、/spec:d |
| nova-test | "測試策略知識域。什麼該測、什麼不該測、怎麼測、何時跑。基於 Testing Trophy + 風險驅動。WHEN: 新增測試、審查測試設計、處理 test f |
| onboard | "專案掃描與 CLAUDE.md 骨架生成。WHEN: 初次進入新專案、需要產生或補充 CLAUDE.md 時使用。NOT: 已有完整 CLAUDE.md 的日 |
| os-control | "OS 操控知識域：桌面自動化、系統管理、螢幕截圖、音訊控制、WebSocket 即時通訊。WHEN: 需要作業系統層級操作（非瀏覽器）時使用。NOT: 純程式 |
| pinchtab | "Chrome 瀏覽器操控 — Pinchtab HTTP API。WHEN: 需要網頁自動化、表單填寫、截圖擷取且 PinchTab 常駐服務（port 98 |
| refactoring | "重構決策知識域：設計分析、拆分策略、品質指標。WHEN: 判斷何時該拆（SRP 違反）、何時不該拆（高內聚）、選擇重構手法（Extract Module/He |
| skill-judge | 對 Skill 設計品質進行多維度評分（知識密度、觸發精準度、結構完整性等）。WHEN: 量化評估 Skill 整體設計優劣、生成改善建議報告、進行 Skill |
| system-audit | "系統審查自動化。10 條交叉引用掃描 + P0/P1/P2 診斷 + 品質閘門。WHEN: /audit 觸發、Manager 說「整理」「健康檢查」「清點」 |
| thinking | "結構化思維工具：卡關脫困策略、反向驗證法、化繁為簡級聯。WHEN: 設計決策僵局、複雜問題需要拆解、方案需要反向驗證時使用。NOT: 直接可執行的簡單任務。" |
| wording | 措詞正確性知識域。涵蓋四級指令強度標記（⛔📋💡🔧）、emoji-關鍵詞搭配規則、語氣校準（技術文件/commit/agent prompt/對話）、繁體中 |

---

### Scripts（60）

| 名稱 | 簡述 |
|------|------|
| acid-test | L2 Acid Test 端到端驗收腳本（入口 + orchestrator） |
| audit-api-contract | 掃描 nova-server GET endpoints 的 JSON schema 是否與 Swift struct 對齊 |
| auto-mode | 全自動模式 CLI 工具 |
| auto-mode-state | 全自動模式 v2 狀態管理 |
| autoresearch-task | heartbeat 全自動：找最低分 eval 跑 autoresearch |
| briefing-builder | Session 摘要 + 簡報生成 |
| capability-probe | 能力邊界探測 + 模型更新 |
| component-health | 元件維護（文件搬遷、lockfile 修復、lifecycle、capability probe） |
| cross-session-probe | 跨 Session 能力校準 |
| daemon-utils | daemon 基礎設施共用函式 |
| daily-logger | 每日日誌聚合器 |
| decision | Phase 2 模型決策輔助函式 |
| enforcement-health | Feedback Enforcement Meta-enforcement（Phase 5） |
| error-analyzer | hook error 聚類 + 去重 + 本地任務建立 |
| evolution | 進化引擎統一 CLI |
| feedback-audit | Feedback Loop Phase 2：元件掃描器 + Registry |
| feedback-audit-health | 健康判定、Registry、報告、Flow Health |
| feedback-audit-suggestions | 孤立引用掃描 + 自動升降級建議 |
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
| layer-kpi-collector | 收集 Nova 各層（L1-L4）KPI 指標 |
| learner | 行為習慣偵測器 |
| learner-analysis | 行為分析純函式模組 |
| learner-suggestions | 建議生成模組 |
| lifecycle-orchestrator | Skill Lifecycle 串聯引擎 |
| local-model | AI 模型 client（單一來源） |
| maintainer | 本地模型驅動的維護 agent（v2：模型決策 + 程式碼執行） |
| manage-component | 元件管理 CLI |
| os-control-driver | OS-level 自動化操控 Claude CLI |
| ralph-stop | 關閉 ralph-loop |
| regression-watch | 監控品質回歸 |
| self-check | 自檢閉環腳本（4 Phase: scan → aggregate → act → persist） |
| self-compact | 自壓縮觸發器（含 session 替換） |
| session-ctl | Session 管理 CLI 工具 |
| session-recorder | Session 摘要與簡報記錄（Phase 4a + 4b 包裝） |
| session-rename | SessionStart 後自動命名 session |
| session-spawner | claude -p spawn 封裝 |
| skill-forge | Skill 建立引擎（forgeSkill + improveSkill + deploySkill） |
| skill-janitor | Skill 庫存管理（pruning + 健康度檢查） |
| smoke-flow | Feedback Loop 主動流程測試（Phase 7） |
| spec-tasks | 本地任務管理模組（CLI 入口 + re-export） |
| task-adapter | R4.3 新任務快速適應機制 |
| tool-matcher | 意圖→工具語意匹配：給定任務描述，從 tool-registry 推薦工具組合 |
| tool-registry | 工具索引：掃描 5 種工具來源，建立統一查詢索引 |
| trace-flow | Feedback Loop 事件鏈追蹤（Phase 7） |
| wake-sessions | 一鍵恢復 pinned session |
| wrapup | session 收尾編排器 |
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

### 進行中（3）

| 任務 | 類型 | 優先 | 深度 | 認領時間 | 狀態 |
|------|------|:----:|:----:|---------|------|
| OS-Control v2 Phase 2：guards 擴展與測試 | 功能 | P2 | D1 | 2026-03-31 | 進行中 |
| B2-Judge重設計-scoring擴展與F級actionable | 功能 | P2 | D1 | 2026-03-31 | 進行中 |
| 重構-vision-loop-機械工具化 | 功能 | P2 | D1 | 2026-03-31 | 進行中 |

---

### 待做（0）

_目前無待做任務_

---

### 最近完成（前 10 筆）

| 任務 | 類型 | 完成時間 | 結果 |
|------|------|---------|------|
| OS-Control-v2-Phase1-新建三個檔案 | 功能 | 2026-03-31 | — |
| learner 新增4個行為模式 | 功能 | 2026-03-31 | — |
| 改寫-judge-improvements-prompt與過濾 | 功能 | 2026-03-31 | — |
| test-stale-detection | 功能 | 2026-03-30 | — |
| 跨 Session 感知與協作 | 功能 | 2026-03-24 | Phase 1-5 全部完成：projects 元資料、session regi |
| [全自動] L1 behavior-threshold habitThreshold 校正 | 修復 | 2026-03-24 | habitThreshold 0.11→0.18，Macro F1 0.944→ |
| [全自動] L1 heartbeat 模組瘦身至 300 行以內 | 重構 | 2026-03-24 | Phase 3 拆分 branch-scheduler.js 已解決膨脹問題 |
| Phase4-Session復用與智慧策略 | 功能 | 2026-03-24 | os-control-driver 空閒 session 偵測復用 + deci |
| Phase3-多支線排程器 | 功能 | 2026-03-24 | branch-scheduler.js（6 支線排程）+ heartbeat 整 |
| Phase2-OODA-閉環-Snapshot-Δmetric | 功能 | 2026-03-24 | self-drive-eval.js（snapshot + Δmetric +  |
