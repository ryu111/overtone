# Overtone Roadmap

> 最後更新：2026-03-08 | 當前進度：Layer 3 完成開發驗證（L3.1-L3.7 ✅，L3.6 Acid Test standard workflow 完成，Skill Forge + Internalization 驗證待執行）| Plugin v0.28.89 | 4755 pass

## Layer 總覽

> 願景和架構定義見 `docs/vision.md`

| Layer | 名稱 | 目標 | 狀態 |
|:-----:|------|------|:----:|
| 1 | 核心大腦 | 工作流引擎 + 持續學習 + 守衛系統 + 引擎強化 | ✅ 完成 |
| 2 | 感知操控 | OS 感知 + 心跳引擎 + 系統管理 + 安全守衛 | ✅ 完成 |
| 3 | 自我進化 | Gap 偵測修復 + Skill Forge + 深度 PM + Project Orchestrator + Acid Test + 飛輪內化 | 🟡 L3.6 待執行 |
| 4 | 通用代理人 | 動態 MCP 工具組合 + 跨領域自主運作 + 場景泛化 + 經驗遷移 | ⬜ 待開始 |
| 5 | 產品 | 使用者面向的最終產品（由 L1-L4 組合而成） | ⬜ 待開始 |

> **質變定義**：
> - L1 = 穩定自治（工作流 + 守衛 + 學習）
> - L2 = 感知操控（看得見、管得住、跨 session 自主控制）
> - L3 = **自我進化**（面對未知領域 → 自主研究 → 建立 skill/agent → 深度 PM → 無限迭代 → 經驗內化）
> - L4 = **通用代理人**（AI 本身 — 通用介面 + 直接操控電腦，接收需求、運用 L1-3 完成）
> - L5 = **產品/專業代理人**（L4 的產出，開放集合，可遞迴使用 L1-3 架構）
>
> **飛輪效應**：L3 自我進化 → L4 跨領域建構 → 產出專案 skill → 內化為永久能力 → 下次更快

---

## Layer 1：核心大腦（✅ 完成）

### L1.1 地基穩固

核心 pipeline 穩定運作。15 次真實任務驗證，100% 完成率，0 次人工介入。

### L1.2 首次體驗

新使用者 5 分鐘上手（README 重寫 + SessionStart banner + plugin.json）。

### L1.3 系統強化

> 基於 PM Discovery（2026-03-03）：Agent 專一化 × Skill 充實 × Hook 純化

| # | 名稱 | 說明 | 狀態 |
|---|------|------|:----:|
| L1.3.1 | Skill 知識充實 | 新建 3 domain（debugging、architecture、build-system）+ 強化 8 既有 domain，共 11 domains + 17 新 reference 檔案 | ✅ |
| L1.3.2 | Agent 進化 | architect + retrospective 降級 opus → sonnet（v0.28.18）；S19 量化分析完成 | ✅ |
| L1.3.3 | Hook 純化 | SubagentStop 核心邏輯遷移到 agent+skill、hook 簡化為守衛（→ S20） | ✅ |
| L1.3.4 | 文件同步 | vision.md + roadmap.md + status.md + CLAUDE.md 全面對齊 | ✅ |

### L1.4 持續學習

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 跨 session 長期記憶 | global-instinct.js（5 API + projectHash 隔離）| ✅ |
| 數值評分引擎 | score-engine.js + 趨勢分析 | ✅ v0.28.26 |
| 即時回饋迴路引擎 | score context 注入 pre-task + session decay | ✅ v0.28.25-26 |
| 時間序列學習 | 觀察效果追蹤 + 品質反饋 | ✅ v0.28.28 |
| 自動識別卡點 | 重複失敗模式辨識 + 改進 | ✅ v0.28.27 |
| 學習衰減 | 過時知識自動淡化（instinct decay）| ✅ v0.28.25 |
| 效能基線追蹤 | baseline-tracker.js + 趨勢分析 | ✅ v0.28.26 |

**完成標準**：系統能展示「第 10 次做同類任務比第 1 次更快更好」的量化數據。

### L1.5 引擎強化（✅ 完成）

> 基於 awesome-llm-apps 生態研究（2026-03-08）：三項核心引擎能力補強。

**L1.5.1 Handoff Persistence（斷點恢復）✅**

> Workflow 中斷後從最後完成的 stage 恢復，而非重頭開始。
> 參考：LangGraph 內建 checkpointing — crash 後從最後斷點恢復。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| Stage 完成快照 | 每個 stage 完成時持久化 handoff + state 快照 | ✅ |
| 恢復偵測 | session-start 偵測未完成 workflow → 提示從斷點繼續 | ✅ |
| Heartbeat 整合 | daemon spawn 新 session 時自動載入 checkpoint 繼續 | ✅ |

**L1.5.2 Evidence Sufficiency Loop（驗證回退迴圈）✅**

> Agent 研究結果不充分時自動回退補充，而非直接交付低品質產出。
> 參考：AG2 Adaptive Research Team — 分類→研究→驗證→(不足?)→備用查詢→合成。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 充分性檢查 | Agent 產出後評估證據充分性（confidence score） | ✅ |
| 自動補查 | confidence 低於門檻時觸發備用資料源查詢 | ✅ |
| 迴圈上限 | 最多 N 次回退（防無限迴圈），超過標記 low-confidence 交付 | ✅ |

**L1.5.3 Keyword Relevance（關鍵詞相關性檢索）✅**

> Instinct 知識條目超過 500+ 時，從文字搜尋升級為向量化語意檢索。
> 參考：awesome-llm-apps Multi-LLM Shared Memory — Mem0 + Qdrant 向量 DB，記憶與 LLM 解耦。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 關鍵詞相關性排序 | queryGlobal() 新增 `relevanceTo` 參數，依關鍵詞相關性排序 instinct 觀察 | ✅ |
| 加權評分公式 | finalScore = confidence × 0.6 + relevance × 0.4 | ✅ |
| 預填充上下文 | pre-task-handler.js 整合，傳入 `originalPrompt` 計算相關性 | ✅ |

---

## Layer 2：感知操控（✅ 完成）

> 目標：讓 agent 擁有 OS 感知操控 + 跨 session 閉環自主控制能力。
> 架構：Bun 腳本庫（`scripts/os/` + `scripts/heartbeat.js`）+ `os-control` knowledge domain skill + OS Guard
> 自主控制策略：`claude -p --plugin-dir` headless session spawn + Heartbeat Daemon 佇列驅動
>
> **閉環交付模型**：每個 L2.x 交付 = 腳本（能力）+ Reference（知識）+ SKILL.md 索引更新 + Guard 擴充 + 測試。
>
> **方向重排（2026-03-04 PM Discovery）**：閉環自主控制比 UI 操控更優先。原 L2.2（動得了）降為 L2.5。

### L2.1 閉環基礎（骨架層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| os-control SKILL.md | 建立 knowledge domain 骨架 | ✅ |
| Agent frontmatter | 5 個 agent 加入 `skills: [os-control]` | ✅ |
| pre-bash-guard.js | PreToolUse(Bash) 黑名單守衛 | ✅ |

### L2.2 看得見（感知層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| screenshot.js | 全螢幕/視窗/區域截圖 | ✅ |
| window.js | 視窗列表/聚焦 | ✅ |
| Skill: perception ref | `skills/os-control/references/perception.md` | ✅ |

### L2.3 心跳引擎（自主控制層）

> Heartbeat Daemon — Bun 常駐程序 + `claude -p --plugin-dir` spawn session。

**Core 引擎 ✅**

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| heartbeat.js | Bun 常駐 daemon（start/stop/status CLI + PID 檔 + polling loop） | ✅ |
| session-spawner.js | `claude -p` session spawn 封裝（stream-json 解析 + timeout） | ✅ |
| 佇列整合 | execution-queue.json 監聽 + 自動 spawn + 安全邊界 | ✅ |
| Telegram notify | spawn/完成/失敗/暫停事件推送 | ✅ |
| autonomous-control Skill | knowledge domain（SKILL.md + references/heartbeat.md） | ✅ |

**整合層 ✅ 並行收斂門**

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| queue CLI | `bun scripts/queue.js add/list/clear` | ✅ |
| PM 自動寫入 | PM Discovery 產出多迭代計劃時自動寫入佇列 | ✅ |
| Telegram `/run` | 遠端命令觸發 | ✅ |
| session-spawner 防禦 | 敏感 env 過濾 + 遞迴防護 | ✅ |

### L2.4 管得住（系統層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| process.js | 列出/啟動/終止 process | ✅ |
| clipboard.js | 讀/寫剪貼簿 | ✅ |
| system-info.js | CPU/記憶體/磁碟/網路狀態 | ✅ |
| notification.js | macOS 通知 | ✅ |
| fswatch.js | 檔案系統變更監控 | ✅ |

### L2.5 動得了（操控層）← 降優先

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| keyboard.js | 按鍵/快捷鍵/文字輸入 | ⬜ |
| mouse.js | 點擊/雙擊/拖曳/滾動 | ⬜ |
| applescript.js | AppleScript/JXA 執行引擎 | ⬜ |
| computer-use.js | 截圖→理解→操作→驗證 | ⬜ |

### L2.6 聽說能力（通訊層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| websocket.js | WebSocket client（Bun 原生） | ✅ |
| tts.js | 文字轉語音 | ✅ |
| stt.js | 語音轉文字 | ❌ 不需要（Claude Code `/voice` 已覆蓋） |

### L2.7 安全整合（守衛層）

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| Guard 精鍊 | pre-bash-guard.js 黑名單完善 | ✅ |
| E2E 驗證 | OS smoke test | ✅ |
| health-check 擴展 | OS tools 檢測 | ✅ |

### Layer 2 完成標準

> 給系統一個需要多種 OS 能力的複合任務，系統能自主完成全流程（HTTP 研究 → 即時通訊 → Process 管理 → 視覺驗證 → 通知 → Guard 保護）。

---

## Layer 3：自我進化（🟡 大部分完成）

> **定義**：系統面對未知領域，能自主研究 → 建立 skill/agent → 獲得新能力。
> **關鍵區分**：
> - L3.1-3.2（已完成）= 修補已知元件的結構缺口（回到設計時的完整狀態）
> - L3.3+（待做）= 從 0 建立不存在的能力（真質變 — 獲得設計時不存在的新能力）

### L3.1 Gap Detection（進化引擎偵測層）✅

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| gap-analyzer.js | 組合 health-check 四個 check 函式，轉換 findings 為標準化 Gap 物件 | ✅ |
| evolution.js CLI | `bun scripts/evolution.js analyze [--json]` 入口 | ✅ |
| Gap Detection 測試 | 52 個測試（33 unit + 19 integration） | ✅ |

### L3.2 Auto-Fix（進化引擎自動修復層）✅

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| gap-fixer.js | 根據 gap type 選擇修復策略 | ✅ |
| evolution.js fix 子命令 | `bun scripts/evolution.js fix [--execute] [--type <type>] [--json]` | ✅ |
| Auto-Fix 測試 | 修復正確性 + 邊界情況 + 50 個測試 | ✅ |

### L3.3 Skill Forge（自主建立能力）✅

> 真質變起點：系統面對未知領域，能自主研究 → 建立 skill → 驗證可用。
> 類比：免疫系統遇到新病毒，自己產生抗體。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| Phase 1：Codebase 內知識萃取 | skill-forge.js（5 API：forgeSkill / extractKnowledge / assembleSkill / validate / rollback）+ 15 domain 知識庫 + 33 unit tests | ✅ |
| Phase 2：WebFetch 領域研究 | extractWebKnowledge 升級（結構化 prompt + --allowedTools + 品質驗證 + 7 天快取） | ✅ |
| 能力缺口偵測 | knowledge-gap-detector.js shouldAutoForge() + autoForge() 自動偵測低分 gap（score < 0.3）+ evolution.js forge --auto 掃描缺 references 域自動 forge | ✅ |
| Skill CLI 整合 | evolution.js forge 子命令（`bun scripts/evolution.js forge <domain> [--execute] [--json] [--auto]`） | ✅ |
| 安全邊界 | 不覆蓋既有 skill、dry-run 預設、連續失敗暫停 | ✅ |

### L3.4 深度 PM（精準需求收集）✅ 完成

> PM 從 advisory（一次分析）升級為 multi-round interrogator（多輪深度訪談）。
> 關鍵：無人值守的長期迭代，開頭沒問清楚就做偏。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 多輪訪談能力 | PM agent 升級：五面向結構化收集（功能/操作流程/UI 設計/邊界條件/驗收標準）+ interview.js（7 API + 24 題靜態問題庫）+ session 持久化 | ✅ |
| 領域研究整合 | PM 進入新領域時先自主研究基本概念，問出有深度的問題（researchDomain + startInterview + getResearchQuestions 三個 API） | ✅ |
| Project Spec 產出 | 訪談結果 → 完整 Project Spec（含 ≥10 個 BDD 驗收場景） | ✅ |

### L3.5 Project Orchestrator（自主建構引擎）✅

> 串聯 Skill Forge + 深度 PM + 無限迭代，完成從需求到產品的完整流程。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 能力盤點 | 從 Project Spec 推導需要的 skill 清單 → 標記現有 vs 需建立 | ✅ |
| Skill 建構排程 | 批次觸發 Skill Forge 建立缺少的 skill → Agent 配置（skill 分配到 agent） | ✅ |
| 專案級迭代 | 多 feature 排程 → execution-queue → 無限迭代直到完成 | ✅ |

### L3.6 Acid Test ✅（Standard Workflow 完成，完整驗收進行中）

> 用真實場景驗證 L3 端到端：給高層目標 → 深度訪談 → 自主建 skill → 無限迭代 → 產品完成。

**場景：CLI 工具 — Markdown 部落格生成器（`md-blog`）**

高層目標：「建立一個 CLI 工具，把 Markdown 文件轉成靜態 HTML 部落格。`md-blog build ./posts` 產出 `./dist/`，每篇文章獨立 HTML，首頁有清單，文章間可互連。」

| 觸發能力 | 說明 | 進度 |
|---------|------|:----:|
| PLAN（PM + Architect）| PM 深度訪談（5 面向）+ Architect 系統設計 | ✅ |
| ARCH（Architect）| 三層分離架構 + Bun runtime + marked v9 | ✅ |
| DEV（Developer）| parser + renderer + builder + CLI 5 模組 + 22 測試 | ✅ |
| REVIEW（Code Reviewer）| 19 項檢查（命名 + 型別 + 邊界 + 架構 + 性能）| ✅ |
| RETRO（Retrospective）| 品質評分 5/5（理解力、創造力、美感、細心、完整度） | ✅ |
| Skill Forge（L3.3）| 自主建立 `static-site-generation` + `cli-tooling` 兩個新 skill（驗證待做） | 🟡 |
| Internalization（L3.7）| 完成後內化為永久能力（驗證待做） | 🟡 |

**產出**：
- CLI 工具可執行（`md-blog build ./posts -o ./dist`）
- 22 個 BDD 場景 pass（單元 + 整合 + 端到端）
- 首頁 index.html + 文章頁面 + 連結完整
- Catppuccin Mocha 配色 + 響應式 CSS
- 完整 README 和測試覆蓋

**完成標準**：Standard workflow（PLAN → ARCH → TEST:spec → DEV → REVIEW → TEST → RETRO → DOCS）全部通過，產品端到端可用。Skill Forge + Internalization 驗證為下一階段。

### L3.7 Skill Internalization（飛輪 — 專案經驗內化）✅

> 建產品過程中產出的專案 skill，內化為永久能力。
> 下次遇到類似專案，skill 已存在，直接使用。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| 專案 skill 評估 | skill-evaluator.js（資格評估）+ 品質評分 + 通過門檻判斷 | ✅ |
| 內化流程 | skill-generalizer.js（通用化移除特定內容）→ internalized.md | ✅ |
| 經驗索引 | experience-index.js（記錄專案類型與 skill 對應關係） | ✅ |
| CLI 整合 | evolution.js internalize 子命令 + 95 個測試 | ✅ |

### Layer 3 完成標準

> 系統收到高層目標 → 深度訪談需求 → 自主建構所需 skill → 無限迭代開發 → 產品完成 → 經驗內化。全程無需人工編寫 skill 或 agent。

---

## Layer 4：通用代理人（⬜ 待開始）

> **L4 就是 AI 本身** — 通用代理人介面。可以用任何形式互動（聊天、語音、會議），也能直接操控電腦（調音量、開麥克風、開應用程式）。
> 像一個超級智慧家居的終極進化版：不只控制家電，而是理解意圖、自主行動、跨領域完成任務。
> 核心職責：接收 L5 需求，運用 L1-3 能力完成。

### L4.1 動態 MCP 工具組合

> Agent 按任務需求動態選擇和組合 MCP 工具，而非固定工具集。
> 參考：awesome-llm-apps Multi-MCP Agent Router — 意圖分類→Agent 選擇→多 MCP server 組合。

| 任務 | 說明 | 狀態 |
|------|------|:----:|
| MCP 工具註冊表 | 可用 MCP server 清單 + 能力描述 + 啟動配置 | ⬜ |
| 意圖→工具映射 | 根據任務意圖自動選擇所需 MCP 工具組合 | ⬜ |
| 連接生命週期 | MCP server 按需啟動/關閉，避免資源浪費 | ⬜ |

## Layer 5：產品/專業代理人（⬜ 待開始）

> L5 是 L4 的產出，是**開放集合**——幾乎什麼都能做。
> 可以是專業領域客服、應用程式、專業代理人（PM/HR/會計/工程師）、自動化系統、社群互動。
> **遞迴架構**：每個 L5 產品可內嵌 L1-3 架構，形成獨立自治的子系統。

---

## 技術路線（S 系列）

> 與 Layer 平行推進的技術強化項目

| # | 名稱 | 說明 | 狀態 |
|---|------|------|:----:|
| S1 | 盤點遷移 + 效率優化 | disallowedTools + skills 預載 + updatedInput + SessionEnd + PostToolUseFailure（v0.20-0.21） | ✅ |
| S2 | 自動偵測機制 | health-check platform-drift 偵測 | ✅ |
| S3 | 平台差異追蹤 | platform.md adopted/evaluated/n-a 狀態 | ✅ |
| S4 | 全面能力評估 | 9 項能力 RICE 評估 | ✅ |
| S5 | Effort Level 分層 | haiku:low / sonnet:medium / opus:high | ✅ |
| S6 | Skill 動態注入 | `!command` 取代 hook 注入 | ✅ |
| S7 | TaskCompleted Hook | 品質門檻硬阻擋 | ✅ |
| S8 | Opusplan 混合模式 | Opus 規劃 + Sonnet 執行 | ✅ |
| S9a | Worktree Isolation | mul-agent 並行時獨立 worktree 避免衝突 | ⏳ 保留 |
| S9b | prompt/agent hook | hook 新增 LLM 判斷類型 | ❌ 關閉 |
| S9c | 1M Context | Sonnet 1M context window | ⏳ 保留 |
| S10 | Agent Memory | 8 個跨層級 agent 啟用 memory: local | ✅ |
| S11 | CLAUDE.md 精簡 | SoT 引用取代重複（198→121 行）+ argument-hint | ✅ |
| S12 | 音效通知 | sound.js + Notification hook（v0.24） | ✅ |
| S13 | Status Line | 雙行即時顯示 + ANSI 變色警告（v0.25） | ✅ |
| S14 | Strategic Compact | SubagentStop 自動建議壓縮（v0.26） | ✅ |
| S15 | CBP 最佳實踐對齊 | code-review skill 四維度 + commit-convention skill | ✅ 間接完成 |
| S15b | 組件正規化 | 38 skills → 16 skills + 27 commands（v0.27.3-0.27.8） | ✅ |
| S16 | Agent Prompt 強化 | description 結構化 + PreToolUse 確定性路由 | ✅ 間接完成 |
| S17 | 測試覆蓋率分析 | `bun test --coverage`（94% Funcs / 89% Lines） | ✅ |
| S18 | CI 環境感知 | 個人 dogfooding 無 PR 流程 | ❌ 不需要 |
| S19 | Agent 專一化精鍊 | agent 拆分機會 + Model 降級空間量化 | ✅ |
| S20 | Hook → Agent 遷移 | SubagentStop 核心邏輯抽出為專職 agent | ✅ v0.28.20 |
| S21 | thinking Skill | 結構化思維注入 5 個 agent + 7 reference 檔案 | ✅ v0.28.87 |
| S22 | 系統衛生強化 | PM 多專案隔離 + 靜默失敗清除 + 佇列驗證統一 + 效能優化 | ✅ v0.28.88-89 |
| S23 | 異構模型分配 | model-router.js（port 3456）路由：haiku→本地 MLX(Qwen3.5-35B-4bit)、sonnet/opus→Claude API + 離線自動 fallback + launchd 自啟動 + fast-fail 健康檢查 | ✅ |

---

## 失真防護

### 檢測清單

| 檢查項 | 問題 | 失真信號 |
|--------|------|----------|
| 動機測試 | 因為有人需要，還是因為我可以做？ | 答不出使用場景 |
| 複雜度測試 | 會讓 SKILL.md 變長嗎？ | 超過 120 行 |
| 外部驗證 | 有非我本人要求過嗎？ | 所有功能都是自己想的 |
| 10 次測試 | 連跑 10 次成功幾次？ | 低於 80% |

### 量化上限

| 指標 | 當前值 | 上限 |
|------|--------|------|
| auto/SKILL.md 行數 | 142 行 | ≤ 150 行 |
| Workflow 模板數 | 18 個 | ≤ 20 個 |
| Agent 數量 | 18 個 | 按需增減（需佐證） |

---

## 歷史記錄

<details>
<summary>Layer 1 驗證記錄（Phase 0 — 15 次真實任務）</summary>

| # | Workflow | 任務 | 結果 |
|---|----------|------|:----:|
| 1 | standard | dashboard-duplicate-spawn-fix | ✅ |
| 2 | standard | instinct-observation-quality | ✅ |
| 3 | quick | specs-auto-archive-fix | ✅ |
| 4 | single | cleanup-残留 | ✅ |
| 5 | quick | jsonl-perf-optimization | ✅ |
| 6 | standard | hook-error-handling | ✅ |
| 7 | single | skill-md-cognitive-load | ✅ |
| 8 | quick | spec-docs-sync | ✅ |
| 9 | standard | precompact-hook | ✅ |
| 10 | single | timeline-count | ✅ |
| 11 | single | wording-module-extraction | ✅ |
| 12 | quick | instinct-getbyid | ✅ |
| 13 | quick | arch-doc-line-count-fix | ✅ |
| 14 | standard | readme-rewrite | ✅ |
| 15 | standard | status-skill | ✅ |

</details>

<details>
<summary>初版 Product Brief（2026-02-28）— 已歸檔</summary>

初版 PM Discovery 產出，定位為「Claude Code 開發工具」。
2026-03-03 PM Discovery 後願景升級為「通用自主代理核心」，Brief 已歸檔至 `docs/archive/2026-02-28_product-brief.md`。

</details>
