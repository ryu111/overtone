# 專案索引
> 自動產生於 2026-04-18

## 元件目錄

### Rules（1）

| 名稱 | 簡述 |
|------|------|
| README | 分類（5 類 × 29 條） |

---

### Skills（33）

| 名稱 | 簡述 |
|------|------|
| agent-browser | "瀏覽器自動化 CLI 工具 — Vercel Labs 出品，Rust 核心 + Playwright。WHEN: 需要 JS 執行、鍵盤 modifier  |
| architecture | "系統架構設計知識域。WHEN: 架構決策（ADR）、設計模式選擇、技術 tradeoff 分析、並發策略選擇時使用。NOT: 純程式碼實作、bug 修復、日常 |
| ask | "分析當前工作狀態，產出結構化建議並讓使用者選擇執行。WHEN: 任務段落結束、輸出「本次完成」後需要給使用者下一步建議時觸發。NOT: 日常對話回覆、使用者已 |
| auto | "深度路由決策。WHAT: 根據設計決策密度選 D0-D4 + 委派策略。WHEN: Main 接到任何任務、或不確定自己做還是委派時。NOT: 已分類的任務執 |
| auto-drive | "全自動引擎觀察知識域。觀察 nova auto-drive 迴圈健康狀態，判斷症狀根因，決定介入方式。WHEN: 自動引擎出現異常（RSS 高/loop 空轉 |
| claude-dev | "Claude Code Plugin 開發知識。hooks、agents、skills、commands 的 API 格式、settings 設定系統與 No |
| closed-loop | "元件閉環驗證。新增/修改/刪除 Skill、Agent、Hook 時，確認跨元件依賴完整、資訊流通、spec 文件同步。WHEN: 新增 Skill 後確認  |
| code-review | "PR Review 知識域：四維度結構化審查 + 回饋分級。WHEN: 審查 PR、code review、撰寫審查回饋時使用。NOT: 撰寫新程式碼、deb |
| commit-convention | "Conventional commit 知識域。WHEN: 撰寫 commit message、判斷 commit 拆分策略、選擇 type/scope 時使 |
| component-classification | "元件分類框架：Hook/Rule/Skill/CLAUDE.md 四層職責分離方法論。WHEN: 新增規範前判斷歸屬層級、Rule 膨脹需要拆分、釐清 Hoo |
| craft | "軟體工藝知識域：Nova 製作原則、設計品味、競品基準、程式碼層級設計模式。WHEN: 設計決策品質判斷、競品對標時使用。NOT: 教科書級基礎知識、一般 c |
| cross-session | "跨 Session 協作知識域。發送跨專案任務、讀取待辦、回報完成的 API 與流程。WHEN: 需要其他專案 session 配合時（改了 API 需要 i |
| dead-code | "死碼清理知識：knip/depcheck 工具、手動清理策略、安全刪除。WHEN: 清理未使用程式碼、codebase 瘦身時使用。NOT: 功能開發、重構。 |
| debugging | "除錯方法論與根因分析框架。WHEN: 遇到 bug 需要根因分析（RCA）、重現問題、診斷並發問題時使用。NOT: 功能開發、架構設計。" |
| dispatch-lifecycle | "Cross-dispatch 生命週期品質知識域。派發前品質檢查、執行中監控、完成驗收三段流程。WHEN: 派發 cross-dispatch 前、驗收完成時 |
| executor-dispatch | Executor agent dispatch prompt 標準模板。涵蓋 Scope 邊界 / Linter 自檢 / Commit 流程 / 驗收回報四段 |
| feedback-loop | "回饋迴圈知識域：成功即進化、自驅任務迴圈、回報與反思的完整協議。WHEN: 完成任務後的反思、自驅任務的監控與排障、品質回報時使用。NOT: 初次任務規劃、架 |
| harness-invariants | 結構不變式（structural invariants）知識域 — 定義 AI 執行 Edit/Write 時不可違反的隱式約束，由 hooks/modules |
| local-model-dispatch | "本地模型（g4-26b）角色派發：五種角色 system prompt、work-stealing 並行模式、安全邊界、升降級閾值。WHEN: Main 要用 |
| model-cascade | "大模型指揮小模型框架。四層架構：Router→Contract→Executor→Feedback Loop。WHEN: 需要多模型協作、任務分配、成本優化時 |
| nova-eval | Nova 認知偏離偵測五層 eval（structural/trigger/behavioral/red-team/trajectory）的選用、觸發、判讀、失 |
| nova-pm | "產品探索與需求釐清。引導 planner agent 以 PM 角色探索需求、定義範圍、比較方案。WHEN: 需求不明確需要釐清、規格討論前的 PM 探索、D |
| nova-spec | "產品規格管理。建立、追蹤、歸檔 spec/design 文件。WHEN: 使用者說「寫規格」「提案」「歸檔」或觸發 /spec:propose、/spec:d |
| nova-test | "測試策略知識域。什麼該測、什麼不該測、怎麼測、何時跑。基於 Testing Trophy + 風險驅動。WHEN: 新增測試、審查測試設計、處理 test f |
| os-control | "OS 操控知識域：桌面自動化、系統管理、螢幕截圖、音訊控制、WebSocket 即時通訊。WHEN: 需要作業系統層級操作（非瀏覽器）時使用。NOT: 純程式 |
| pinchtab | "Chrome 瀏覽器操控 — Pinchtab HTTP API。WHEN: 需要網頁自動化、表單填寫、截圖擷取且 PinchTab 常駐服務（port 98 |
| pipeline-quality-gate | "multi-tier-loop / g-executor pipeline 的 4 層品質驗證框架。WHEN: 設計或審查 executor/reviewer |
| refactoring | "重構決策知識域：設計分析、拆分策略、品質指標。WHEN: 判斷何時該拆（SRP 違反）、何時不該拆（高內聚）、選擇重構手法（Extract Module/He |
| self-evolution | "元認知自評框架：行動前客觀 checklist + 行動後 loop 模式反思。WHEN: dispatch 前、驗收前、重大決策前。NOT: 機械性操作、D |
| skill-judge | "對 Skill 設計品質進行多維度評分（知識密度、觸發精準度、結構完整性等）。WHEN: 量化評估 Skill 整體設計優劣、生成改善建議報告、進行 Skil |
| system-audit | "系統審查自動化。10 條交叉引用掃描 + P0/P1/P2 診斷 + 品質閘門。WHEN: /audit 觸發、Manager 說「整理」「健康檢查」「清點」 |
| thinking | "結構化思維工具：卡關脫困策略、反向驗證法、化繁為簡級聯、方案比較。WHEN: 設計決策僵局、複雜問題需要拆解、方案需要反向驗證、需要比較多個方案時使用。NOT |
| wording | "措詞正確性知識域。涵蓋四級指令強度標記（⛔📋💡🔧）、emoji-關鍵詞搭配規則、語氣校準（技術文件/commit/agent prompt/對話）、繁體 |

---

### Scripts（76）

| 名稱 | 簡述 |
|------|------|
| acid-test | L2 Acid Test 端到端驗收腳本（入口 + orchestrator） |
| ask-local | 本地模型 CLI 封裝 |
| audit-api-contract | 掃描 nova-server GET endpoints 的 JSON schema 是否與 Swift struct 對齊 |
| auto-mode | 全自動模式 CLI 工具 |
| auto-mode-state | 全自動模式 v2 狀態管理 |
| autonomy-self-scan | Phase 0 (xd-phhg/8nfu) |
| autoresearch-task | heartbeat 全自動：找最低分 eval 跑 autoresearch |
| briefing-builder | Session 摘要 + 簡報生成 |
| capability-probe | 能力邊界探測 + 模型更新 |
| chain-integrity | Nova 知識鏈完整性掃描器 |
| claude-md-drift-check | CLAUDE.md 進度漂移掃描 |
| collect | 收尾第一階段：確定性蒐證 |
| component-health | 元件維護（文件搬遷、lockfile 修復、lifecycle、capability probe） |
| component-scan | Phase 0a (xd-ycmm) |
| context-cost-baseline | 實測 SessionStart 注入成本 + cache economics 三方案對比 |
| cross-session-probe | 跨 Session 能力校準 |
| daemon-utils | daemon 基礎設施共用函式 |
| daily-logger | 每日日誌聚合器 |
| decision | Phase 2 模型決策輔助函式 |
| distillation-agent | Phase 4 蒸餾循環 |
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
| impact-analyzer | 規則變更影響分析 |
| judge | 通用品質評估 + 趨勢追蹤 |
| judge-improvements | F 級改善建議生成（從 judge.js 拆分） |
| judge-scores | 評分記錄的讀寫、去重、截斷（從 judge.js 拆分） |
| judge-scoring | 確定性評分 + 語意評分（從 judge.js 拆分） |
| launchd-setup | 統一 launchd plist 管理器 |
| layer-kpi-collector | 收集 Nova 各層（L1-L4）KPI 指標 |
| learner | 行為習慣偵測器 |
| learner-analysis | 行為分析純函式模組 |
| learner-suggestions | 建議生成模組 |
| lifecycle-orchestrator | Skill Lifecycle 串聯引擎 |
| llm-watchdog | vllm-mlx crash recovery |
| local-model | AI 模型 client（單一來源） |
| maintainer | 本地模型驅動的維護 agent（v2：模型決策 + 程式碼執行） |
| manage-component | 元件管理 CLI |
| nova-cli | Nova 統一 CLI 入口 |
| os-control-driver | OS-level 自動化操控 Claude CLI |
| persist | 收尾第三階段：確定性持久化 |
| reflect | 收尾第二階段：LLM 反思 |
| reflection-backfill | 一次性腳本，backfill 歷史 reflections.jsonl 的 resolved_at |
| reflection-resolver | CLI 工具：掃 reflections.jsonl 自動回填 resolved_at |
| rule-audit | 掃 ~/.claude/rules/**/*.md，抓所有 📋 MUST 條款， |
| self-check | 自檢閉環腳本（4 Phase: scan → aggregate → act → persist） |
| self-compact | 自壓縮觸發器（含 session 替換） |
| session-ctl | Session 管理 CLI 工具 |
| session-recorder | Session 摘要與簡報記錄（Phase 4a + 4b 包裝） |
| session-rename | SessionStart 後自動命名 session |
| session-spawner | claude -p spawn 封裝 |
| skill-forge | Skill 建立引擎（forgeSkill + improveSkill + deploySkill） |
| skill-janitor | Skill 庫存管理（pruning + 健康度檢查） |
| skill-wiki-integrity | Option C 獨立 script（ADR-002 Q2） |
| smoke-flow | Feedback Loop 主動流程測試（Phase 7） |
| spec-tasks | 本地任務管理模組（CLI 入口 + re-export） |
| sync-obsidian-ignore | 把 .obsidianignore (SoT) sync 到 .obsidian/app.json userIgnoreFilters |
| tool-matcher | 意圖→工具語意匹配：給定任務描述，從 tool-registry 推薦工具組合 |
| tool-registry | 工具索引：掃描 5 種工具來源，建立統一查詢索引 |
| vault-manager | Credential Vault CRUD + 敏感域紀律 |
| vault-ref-linter | linter.js v2 — 強/軟引用分層掃描（ADR-002 Phase 1.5 Setup） |
| wake-sessions | 一鍵恢復 pinned session |
| weekly-synthesis | 週蒸餾自動化（Phase 1, xd-v60w） |
| wrapup | session 收尾編排器（極簡） |
| wrapup-marker | session 收尾 marker 讀寫 |

---

### docs/adr（1）

| 名稱 | 簡述 |
|------|------|
| ADR-001-vault-upgrade | ADR-001: Vault 升級（已搬入 vault canonical） |

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

| 任務 | 類型 | 優先 | 深度 | 認領時間 | 狀態 |
|------|------|:----:|:----:|---------|------|
| agent-factory | — | — | — | — | 進行中 |

---

### 待做（3）

| 任務 | 類型 | 優先 | 深度 | 建立時間 |
|------|------|:----:|:----:|---------|
| plan-c-karpathy-wiki-roadmap | 功能 | P2 | D1 | 2026-04-17 |
| undefined | undefined | — | — | 2026-04-17 |
| undefined | undefined | — | — | 2026-04-17 |

---

### 最近完成（前 10 筆）

| 任務 | 類型 | 完成時間 | 結果 |
|------|------|---------|------|
| 新增 scanStaleDocs 掃描函式並整合到 self-check | 功能 | 2026-04-02 | — |
| 重複結案架構測試 | 功能 | 2026-04-01 | — |
| heartbeat品質修復 | 功能 | 2026-04-01 | — |
| 修復三問閉環積壓 | 功能 | 2026-04-01 | — |
| 建立卡住自動通知-Manager-機制 | 功能 | 2026-04-01 | — |
| 修復自驅引擎重複結案-bug | 功能 | 2026-04-01 | — |
| D1-AskUserQuestion-SSE-事件時機修正 | 功能 | 2026-04-01 | — |
| D2-Feedback-Loop-P0-守衛 | 功能 | 2026-04-01 | — |
| D2-CLI-標準化-Phase1 | 功能 | 2026-04-01 | — |
| 修復-heartbeat-三個問題 | 功能 | 2026-04-01 | — |
