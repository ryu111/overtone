# Overtone Roadmap

> 最後更新：2026-03-15 | 架構：單腦 + D0-D4 深度路由 + Worker | 當前焦點：R1 核心重建

## 架構演進脈絡

v0.21-v0.29 的 16 角色 Pipeline 架構已清除（實測 3.3x token 浪費、4.4x 錯誤放大）。
v0.30+ 採用「單腦 + 深度路由 + 輕量 Worker」模式（見 `docs/spec/架構重設計.md`）。
五層定義見 `docs/vision.md`，R1 詳細設計見 `docs/spec/L1-L2-守衛與閉環-實作計劃.md`。

**現有基礎**（不動的部分）：
- Rules 14 個（全域行為規範，完整）
- Skills 29 個（知識庫，含 nova-spec、closed-loop、nova-test）
- Agents 3 個（planner/executor/reviewer，已適配新架構）
- Nova Server（hook dispatch + Flow Visualizer + SSE + metrics 可觀測層）
- Guards — guards.js 統一模組（Bash 黑名單 + 元件保護）

**需重建的部分**（v0.29 scripts/lib 已清除）：
所有 L1-L3 的執行層腳本（engine/framework 類 .js 檔案）已被清除，
但 Skills 的知識文件（SKILL.md + references）和 Rules 行為定義仍完整保留。
即：**系統知道「該怎麼做」（knowledge）但失去了「自動做」（automation）的能力**。

---

## Layer 總覽

| Layer | 名稱 | 新架構下的目標 | 狀態 |
|:-----:|------|--------------|:----:|
| 1 | 核心大腦 | 守衛框架 + 任務引擎（深度路由）+ 學習/評分/收斂/回饋框架 | 🔴 重建中 |
| 2 | 自我進化 | Gap 偵測修復 + Skill Forge + PM + Orchestrator + 經驗內化 | 🔴 重建中 |
| 3 | 感知操控 | OS 腳本庫 + 心跳引擎 + 佇列系統 | 🔴 重建中 |
| 4 | 通用代理人 | 動態 MCP 工具組合 + 跨領域自主運作 | ⬜ 待開始 |
| 5 | 產品 | 使用者面向產品（開放集合） | ⬜ 待開始 |

> **重建 vs 新建**：L1-L3 的知識層（Skills/Rules）完整保留，需重建的是執行層（scripts）。
> L4-L5 從未實現，為全新建設。

---

## R0：架構重設計基礎設施（✅ 已完成）

> 清除舊架構、建立新架構基礎。

| # | 任務 | 類型 | 狀態 |
|---|------|------|:----:|
| R0.1 | 清除 v0.21-v0.29 Pipeline 架構（18 agents → .bak、31 commands → .bak） | 清理 | ✅ |
| R0.2 | 建立 3 Worker agents（planner/executor/reviewer） | 新建 | ✅ |
| R0.3 | 全域 CLAUDE.md + 專案 CLAUDE.md 重組 | 重建 | ✅ |
| R0.4 | Rules 14 個全域行為規範 | 新建 | ✅ |
| R0.5 | Flow Visualizer 閉環（hooks → event-writer → SSE → client） | 新建 | ✅ |
| R0.6 | Hooks 4 模組（guards + flow-observer + notification + metrics） | 重建 | ✅ |

---

## R1：核心重建（Layer 1 — 🟡 進行中 1/6）

> 目標：恢復 Main Agent 的自動化框架能力。
> 原則：不再重建 Pipeline，而是為「單腦 + 深度路由」模式建立配套。

### R1.1 守衛框架強化（✅ 已完成）

**完成內容**：
- bash-guard.js + edit-guard.js 合併為 `guards.js` 統一模組（單一 SoT）
- 移除對已刪除 manage-component.js 的依賴
- Guard 測試套件 26 個測試案例通過
- hook-client.js fallback 直接引用 guards.js（不再依賴舊 scripts/）

### R1.2 Maintainer — 本地模型驅動的觀測與維護 agent

**現狀**：metrics.js 記錄 dispatch/error/block 數值。maintainer.js Phase 1 已完成（數字同步 + commit + push）。文件搬遷、內容檢查、Notion 整合尚未啟用。
**目標**：SessionEnd 背景 agent，漸進式擴展，最終將文件與專案管理完全遷移至 Notion。全程本地模型，零 API token。

**執行機制**：`maintainer.js` — SessionEnd hook 觸發，自我分離背景執行，做完退出。

#### Phase 1：數字同步 + git（✅ 已完成）

| 任務 | 類型 | 狀態 | 說明 |
|------|------|:----:|------|
| maintainer.js 框架 | 新建 | ✅ | 自我分離 + lockfile 防重複 + fallback |
| 數字同步 | 新建 | ✅ | roadmap Rules/Skills 計數自動校驗修正（確定性 regex） |
| git 自動提交 | 新建 | ✅ | 本地模型生成 commit message → commit + push 雙 repo |

#### Phase 2：內容正確性 + 任務觀測

| 任務 | 類型 | 說明 |
|------|------|------|
| 內容檢查 | 新建 | 本地模型讀文件，比對實際程式碼狀態（如 R1.1 已完成但 roadmap 標待做） |
| metrics.js 擴充 | 修改 | 新增任務維度：depth、worker 數量、duration、成功/失敗 |
| 任務策略分析 | 新建 | 本地模型分析 metrics 快照 → 深度路由策略建議 → 寫入 instinct |

#### Phase 3：文件搬遷自動化

| 任務 | 類型 | 說明 |
|------|------|------|
| backlog 完成偵測 | 新建 | 本地模型判斷 docs/spec/ 的 spec 是否已實作完成 |
| 章文件產出 | 新建 | 完成的 spec → 自動搬遷至 spec/docs/ 章文件 + 刪除原檔 |
| 引用更新 | 新建 | 搬遷後 grep 所有引用並自動修正 |

#### Phase 4：Notion 雙向同步

| 任務 | 類型 | 說明 |
|------|------|------|
| Notion 推送 | 新建 | 本地 roadmap 進度 + Layer 狀態 → Notion database |
| Notion 拉取 | 新建 | Notion 新任務/筆記 → spec/change/ 本地目錄 |
| 狀態雙向同步 | 新建 | 任務完成狀態兩邊同步，衝突時 Notion 優先 |

#### Phase 5：Notion SoT 遷移

| 任務 | 類型 | 說明 |
|------|------|------|
| SoT 反轉 | 新建 | Notion 成為唯一來源，本地 roadmap.md / index.md 由 Notion 自動生成 |
| 本地文件降級 | 新建 | 本地文件標記為「generated — do not edit directly」 |

> **設計決策**：
> - 本地模型 agent — 由 hook 觸發而非 Main Agent 委派，零 API token
> - 一次性背景執行 — 非常駐服務，做完退出，不佔 server 資源
> - 確定性操作（數字同步/git/Notion API）→ 程式碼
> - 語意判斷（內容檢查/搬遷判斷/策略分析/commit message）→ 本地 Qwen
> - 漸進式擴展 — Phase 1-5 逐步增加能力，每階段獨立可驗證
> - 本地模型不可用時 → 只做確定性部分，跳過語意判斷

### R1.3 Learner — 行為習慣偵測器

**現狀**：instinct skill 知識層完整（信心分數演算法、進化決策樹已定義），執行層已刪。
**目標**：SessionEnd 背景 agent，偵測重複行為（習慣 + 反模式），追蹤概念成熟度，在對的時機建議固化或修正。

**執行機制**：`learner.js` — 跟 maintainer.js 同模式，SessionEnd hook 觸發，自我分離背景執行，本地模型。

| 任務 | 類型 | 說明 |
|------|------|------|
| learner.js | 新建 | SessionEnd → 提取行為序列 → 比對歷史 → 信心更新 → 建議輸出 |
| flow-observer 擴充 | 修改 | tool_use 事件加入 file_path，提供更精確的行為指紋 |
| SessionStart 注入 | 修改 | 高信心條目注入 additionalContext |
| learner 測試 | 新建 | 信心公式 + 極性分類 + 行為比對 |

**行為分類**：

| 極性 | 信號 | 門檻 | 動作 |
|:----:|------|:----:|------|
| +1 正向（習慣） | 正常工具序列重複出現 | 0.60 | 建議固化為 Rule/Skill/自動化 |
| -1 負向（反模式） | block/error/修正關鍵詞重複 | 0.40 | ⚠️ P0 警告 + 建議根因修復 |

**信心公式**（無加減分，基於出現率 × 跨度 × 最近性）：

```javascript
frequencyScore = log2(occurrences + 1) / log2(totalSessions + 1)
spanScore = min(spanDays / 3, 1)           // 3 天算穩定
recency = 1 / (1 + daysSinceLastSeen / 3)  // 3 天沒出現信心減半
confidence = frequencyScore * spanScore * recency
// forgetThreshold: 0.10 → 自動刪除
```

**資料格式**（`~/.claude/data/behaviors.jsonl`）：

```jsonl
{"id":"rename-grep-update","polarity":1,"pattern":["Edit","Grep","Edit"],
 "description":"改名後搜尋引用並更新","firstSeen":"2026-03-10",
 "lastSeen":"2026-03-15","occurrences":[5,7,8,9,10,11],"confidence":0.72,
 "suggestion":{"type":"rule","content":"...","priority":"P2"}}
```

**執行流程**：

```
SessionEnd → spawn learner.js（背景）
  1. 提取行為序列（確定性）— flow events → toolSequence + toolCounts + promptKeywords
  2. 分類極性（確定性）— block/error/修正關鍵詞 → 反模式，否則 → 習慣
  3. 比對歷史（確定性 + 本地模型）— 工具子序列比對 + 語意相似度
  4. 更新信心（確定性）— 出現率 × 跨度 × 最近性
  5. 建議輸出（本地模型）— 信心達門檻時：「應該成為 Rule/Skill？」或「根因是什麼？」
  → process 退出
```

> **設計決策**：
> - 不用加減分 — 改用出現率 × 跨度 × 最近性，避免低頻場景信心漲不上去
> - 時間尺度校正 — 3 天穩定（非 14 天），符合高頻開發節奏
> - 反模式更急 — 門檻 0.40（vs 習慣 0.60），優先序 P0
> - 與 R1.2 互補 — maintainer 管文件/git/Notion，learner 管行為偵測/信心追蹤

### R1.4 評分框架

**現狀**：skill-judge skill 知識文件存在但 references 為空。score-engine.js 已刪。
**目標**：恢復多維度品質評估。

| 任務 | 類型 | 說明 |
|------|------|------|
| score-engine.js | 重建 | 多維度評分 + 趨勢分析 |
| skill-judge references | 補全 | 填充 skill-judge skill 的 references 目錄 |
| 評分框架測試 | 重建 | 評分計算 + 趨勢正確性 |

### R1.5 收斂框架

**現狀**：從未完整實現。vision.md 定義為「識別冗餘、做減法」。
**目標**：自動識別未使用的 skills/rules 並建議移除。

| 任務 | 類型 | 說明 |
|------|------|------|
| convergence.js | 新建 | 使用率追蹤 + 冗餘識別 + 移除建議產出 |
| 收斂框架測試 | 新建 | 冗餘偵測邏輯 + 建議格式 |

### R1.6 回饋迴路

**現狀**：hooks 記錄 flow 事件但沒有任何消費者讀取這些事件做學習/評分。
**目標**：flow 事件 → 學習框架 → 評分框架 → 注入下次 session context。

| 任務 | 類型 | 說明 |
|------|------|------|
| feedback-loop.js | 重建 | 讀取 flow events → 提取觀察 → 寫入 instinct |
| Hook 消費者整合 | 新建 | on-end-flow 觸發回饋迴路（session 結束時分析本次表現） |
| 回饋迴路測試 | 新建 | event 消費 + instinct 寫入正確性 |

### R1 完成標準

> Main Agent 完成一次 D2 任務後：
> 1. Maintainer 自動校正文件數字 + commit/push（R1.2 P1）
> 2. Maintainer 檢查內容正確性 + 分析任務表現（R1.2 P2）
> 3. instinct 記錄了本次觀察（R1.3）
> 4. flow events 被回饋迴路消費，下次 session context 包含學習結果（R1.6）
> 5. Notion 雙向同步（R1.2 P4）

---

## R2：自我進化重建（Layer 2 — 🔴 待做）

> 目標：恢復自我改造能力。
> 依賴：R1（學習/評分框架）必須先完成。

### R2.1 Gap 偵測與修復

**現狀**：evolve skill 有 2 個 references，但 evolution.js / gap-analyzer.js / gap-fixer.js 已刪。
**目標**：恢復元件缺口自動偵測和修復。

| 任務 | 類型 | 說明 |
|------|------|------|
| gap-analyzer.js | 重建 | 組合 health-check，產出標準化 Gap 物件 |
| gap-fixer.js | 重建 | 根據 gap type 選擇修復策略 |
| evolution.js CLI | 重建 | `analyze` / `fix` / `forge` / `internalize` 子命令 |
| health-check.js | 重建 | 四個 check 函式（closedLoop / skillCoverage / hookIntegrity / agentAlignment） |
| 進化引擎測試 | 重建 | gap 偵測 + 修復正確性 |

### R2.2 Skill Forge

**現狀**：skill-forge.js / knowledge-gap-detector.js 已刪，但 Skills 知識文件完整。
**目標**：恢復自主建立新 skill 的能力。

| 任務 | 類型 | 說明 |
|------|------|------|
| skill-forge.js | 重建 | 5 API（forgeSkill / extractKnowledge / assembleSkill / validate / rollback） |
| knowledge-gap-detector.js | 重建 | shouldAutoForge() + autoForge() |
| Skill Forge 測試 | 重建 | 建立/驗證/回滾 |

### R2.3 深度 PM

**現狀**：pm skill 有 3 個 references，但 interview.js 已刪。
**目標**：恢復多輪深度訪談能力。

| 任務 | 類型 | 說明 |
|------|------|------|
| interview.js | 重建 | 7 API + 24 題問題庫 + session 持久化 |
| PM 測試 | 重建 | 訪談流程 + 領域研究整合 |

### R2.4 Project Orchestrator

**現狀**：specs skill 有 references，但 orchestrator 腳本已刪。
**目標**：恢復 Skill Forge + PM + 無限迭代的串聯。

| 任務 | 類型 | 說明 |
|------|------|------|
| project-orchestrator.js | 重建 | 能力盤點 → Skill 建構排程 → 專案級迭代 |
| Orchestrator 測試 | 重建 | 端到端流程 |

### R2.5 經驗內化

**現狀**：skill-evaluator.js / skill-generalizer.js / experience-index.js 已刪。
**目標**：恢復專案經驗轉化為永久能力的飛輪。

| 任務 | 類型 | 說明 |
|------|------|------|
| skill-evaluator.js | 重建 | 資格評估 + 品質評分 |
| skill-generalizer.js | 重建 | 通用化（移除專案特定內容） |
| experience-index.js | 重建 | 專案類型與 skill 對應記錄 |
| 內化測試 | 重建 | 評估 + 通用化 + 索引 |

### R2.6 Acid Test 重跑

**現狀**：v0.29 時 md-blog Acid Test 的 standard workflow 已完成。
**目標**：用新架構（D2/D3 深度路由）重跑 Acid Test 驗證端到端。

| 任務 | 類型 | 說明 |
|------|------|------|
| Acid Test | 驗證 | 高層目標 → PM 訪談 → Skill Forge → 迭代開發 → 產品完成 → 經驗內化 |

### R2 完成標準

> 系統收到高層目標 → 自主完成全流程，全程使用深度路由（非 Pipeline）。

---

## R3：感知操控重建（Layer 3 — 🔴 待做）

> 目標：恢復 OS 操控腳本和自主控制能力。
> 優先序：心跳引擎 > 佇列系統 > OS 腳本（因為心跳是自主運作的前提）。

### R3.1 心跳引擎

**現狀**：autonomous-control skill 有 4 個 references，但 heartbeat.js / session-spawner.js 已刪。
**目標**：恢復跨 session 自主控制。

| 任務 | 類型 | 說明 |
|------|------|------|
| heartbeat.js | 重建 | Bun daemon（start/stop/status + PID + polling loop） |
| session-spawner.js | 重建 | `claude -p` session spawn（stream-json + timeout + env 過濾） |
| heartbeat 測試 | 重建 | daemon 生命週期 + spawn 安全邊界 |

### R3.2 佇列系統

**現狀**：workflow-core skill 有佇列知識，但 queue.js / execution-queue.js 已刪。
**目標**：恢復任務佇列管理。

| 任務 | 類型 | 說明 |
|------|------|------|
| queue.js | 重建 | add/list/clear/advance CLI + execution-queue.json |
| 佇列測試 | 重建 | CRUD + 並行安全 + 佇列推進邏輯 |

### R3.3 OS 操控腳本

**現狀**：os-control skill 有 5 個 references，但 scripts/os/ 目錄已刪。
**目標**：恢復 OS 能力腳本庫。

| 任務 | 類型 | 說明 |
|------|------|------|
| screenshot.js | 重建 | 全螢幕/視窗/區域截圖 |
| window.js | 重建 | 視窗列表/聚焦 |
| process.js | 重建 | 列出/啟動/終止 |
| clipboard.js | 重建 | 讀/寫剪貼簿 |
| system-info.js | 重建 | CPU/記憶體/磁碟/網路 |
| notification.js | 重建 | macOS 通知 |
| fswatch.js | 重建 | 檔案系統變更監控 |
| websocket.js | 重建 | WebSocket client |
| tts.js | 重建 | 文字轉語音 |
| OS 腳本測試 | 重建 | 各腳本的基本功能驗證 |

### R3.4 動得了（操控層）— 新建

**現狀**：v0.29 時就標記為 ⬜，從未實現。
**目標**：鍵盤/滑鼠/AppleScript 操控。

| 任務 | 類型 | 說明 |
|------|------|------|
| keyboard.js | 新建 | 按鍵/快捷鍵/文字輸入（osascript System Events） |
| mouse.js | 新建 | 點擊/拖曳/滾動（cliclick） |
| applescript.js | 新建 | AppleScript/JXA 執行引擎 |
| computer-use.js | 新建 | 截圖→理解→操作→驗證迴圈 |

### R3 完成標準

> 心跳 daemon 啟動 → 自動從佇列取任務 → spawn session 執行 → OS 腳本可用 → 完成通知。

---

## R4：通用代理人（Layer 4 — ⬜ 待開始）

> 目標：AI 成為通用代理人介面。
> 依賴：R1-R3 重建完成。

### R4.1 動態 MCP 工具組合

| 任務 | 類型 | 說明 |
|------|------|------|
| MCP 工具註冊表 | 新建 | 可用 MCP server 清單 + 能力描述 + 啟動配置 |
| 意圖→工具映射 | 新建 | 根據任務意圖自動選擇所需 MCP 工具組合 |
| 連接生命週期 | 新建 | MCP server 按需啟動/關閉 |

### R4.2 跨領域自主運作

| 任務 | 類型 | 說明 |
|------|------|------|
| 領域隔離 | 新建 | 多領域知識不互相干擾 |
| 經驗遷移 | 新建 | A 領域學到的模式加速 B 領域建構 |
| 場景泛化驗證 | 驗證 | 3 個非開發領域（交易/企業/通訊）各穩定運作 |

### R4 完成標準

> 至少 3 個不相關領域同時穩定運作 30 天。新領域從零到穩定 < 7 天。

---

## R5：產品（Layer 5 — ⬜ 待開始）

> L5 是 L4 的產出，開放集合。
> 初期驗證場景（壓力測試核心能力）：

| 優先序 | 場景 | 為什麼 |
|:------:|------|--------|
| 1 | 自動交易（多市場） | 完全客觀的回饋信號（盈虧） |
| 2 | 企業自動化員工 | 最接近現有能力的外推 |
| 3 | AI 間交流 | 最前沿的探索方向 |
| 4 | 自主社群經營 | 品質判斷最主觀 |

---

## 事前準備整合

> 原 A/B/C 系列事前準備的處置。

| 項目 | 來源 | 處置 |
|------|------|------|
| A3 rules/ 條件規則 | ✅ 已完成 | Step 1-2 完成。Step 3 待 CLAUDE.md 超 120 行時觸發 |
| A5 Skills 評估 | C4-D3 | 29 個 skills 全部保留（知識文件完整，是重建的基礎） |
| A6 Hook 評估 | C4-D4 | 4 模組保留（guards + flow-observer + notification + metrics） |
| A7 Memory 策略 | — | 維持現狀（MEMORY.md + agent memory: local） |
| A8 MCP 整合 | R4.1 | 納入 Layer 4 |
| B1 方法論借鑑 | C4-D6 | 延後。目前 BDD + rules 已足夠 |
| C2 Pipeline 遷移 | ❌ 不適用 | Pipeline 已清除，改為深度路由 |
| C3 claudemd-dev | C4-D2 | 延後。CLAUDE.md 目前行數安全 |
| C4 決策待辦 | — | D1 ✅ / D2-D6 延後或不適用 |

---

## Skills 閉環計劃

> 29 個 skills 中，有知識文件但無對應執行層的 skills。

### 有知識、無執行層（需在 R1-R3 重建）

| Skill | References | 對應執行層 | 重建位置 |
|-------|:---------:|-----------|---------|
| os-control | 5 個 | scripts/os/*.js | R3.3 |
| autonomous-control | 4 個 | heartbeat.js + session-spawner.js | R3.1 |
| evolve | 2 個 | evolution.js + gap-*.js | R2.1 |
| instinct | 2 個 | global-instinct.js | R1.3 |
| pm | 3 個 | interview.js | R2.3 |
| specs | 3 個 | project-orchestrator.js | R2.4 |
| workflow-core | 4 個 | 不重建（Pipeline 知識，改適配深度路由） |

### 有知識、有執行層（完整閉環）

| Skill | 說明 |
|-------|------|
| architecture, nova-test, thinking, security-kb, code-review, craft, commit-convention, debugging, build-system, database, dead-code, wording | 純知識 skill，透過 agent skills 注入消費，不需要執行層 |

### 需特殊處理

| Skill | References | 問題 | 處置 |
|-------|:---------:|------|------|
| agent-browser | 0 | references 為空 | 補全 references 或標記為 Main 原生能力 |
| auto | 0 | references 為空 + 需改造（workflow → 深度路由） | 改寫 SKILL.md 適配深度路由 |
| skill-judge | 0 | references 為空 | R1.4 補全 |
| workflow-core | 4 | Pipeline 知識，部分不再適用 | 改寫為深度路由知識 |
| onboard | — | 可能整合進 claudemd-dev | 延後 |

---

## Commands 計劃

> 現有 command。需恢復或新建的 commands。

### 保留

| Command | 說明 | 狀態 |
|---------|------|:----:|
| /nova-flow | Nova 控制中心（Flow Visualizer + 服務管理） | ✅ 存在 |
| /auto | 深度路由入口（分析需求 → 建議深度 → 執行） | ✅ 存在 |
| /pm | 需求探索（Main 自己做 PM） | ✅ 存在 |

### 新建（配合深度路由）

| Command | 說明 | 優先序 | 對應 Roadmap |
|---------|------|:------:|-------------|
| /secure | 安全敏感（強制 D3 + security worker） | 🟡 | R1.1 |
| /tdd | 測試先行（先寫測試 → 實作 → 驗證） | 🟢 | R1.2 |
| /review | 要求審查（委派 reviewer worker） | 🟢 | R1.2 |
| /evolve | 進化引擎入口（analyze / fix / forge） | 🟡 | R2.1 |
| /queue | 佇列管理（add / list / clear） | 🟡 | R3.2 |
| /heartbeat | 心跳引擎控制（start / stop / status） | 🟡 | R3.1 |

### 不恢復（被深度路由取代）

| 舊 Command | 原因 |
|------------|------|
| /dev, /quick, /standard, /full | 被 D0-D4 深度路由取代 |
| /debug, /refactor, /build-fix | Main 自己做（D1） |
| /e2e, /test, /diagnose | Main 自己做（D1） |
| /db-review, /clean | Main 自己做（D1） |

---

## 技術路線（S 系列 — 歷史完成 + 新增）

### 已完成（S1-S23）

<details>
<summary>展開 S1-S23 歷史記錄</summary>

| # | 名稱 | 說明 | 狀態 |
|---|------|------|:----:|
| S1 | 盤點遷移 + 效率優化 | disallowedTools + skills 預載 + updatedInput | ✅ |
| S2 | 自動偵測機制 | health-check platform-drift 偵測 | ✅ |
| S3 | 平台差異追蹤 | platform.md adopted/evaluated/n-a | ✅ |
| S4 | 全面能力評估 | 9 項能力 RICE 評估 | ✅ |
| S5 | Effort Level 分層 | haiku:low / sonnet:medium / opus:high | ✅ |
| S6 | Skill 動態注入 | `!command` 取代 hook 注入 | ✅ |
| S7 | TaskCompleted Hook | 品質門檻硬阻擋 | ✅ |
| S8 | Opusplan 混合模式 | Opus 規劃 + Sonnet 執行 | ✅ |
| S9a | Worktree Isolation | mul-agent 並行時獨立 worktree | ⏳ 保留 |
| S10 | Agent Memory | 8 個 agent 啟用 memory: local | ✅ |
| S11 | CLAUDE.md 精簡 | SoT 引用取代重複（198→121 行） | ✅ |
| S12 | 音效通知 | sound.js + Notification hook | ✅ |
| S13 | Status Line | 雙行即時顯示 + ANSI 變色警告 | ✅ |
| S14 | Strategic Compact | SubagentStop 自動建議壓縮 | ✅ |
| S15 | CBP 最佳實踐對齊 | code-review skill 四維度 | ✅ |
| S15b | 組件正規化 | 38 skills → 16 skills + 27 commands | ✅ |
| S16 | Agent Prompt 強化 | description 結構化 | ✅ |
| S17 | 測試覆蓋率分析 | 94% Funcs / 89% Lines | ✅ |
| S19 | Agent 專一化精鍊 | agent 拆分 + Model 降級量化 | ✅ |
| S20 | Hook → Agent 遷移 | SubagentStop 核心邏輯遷出 | ✅ |
| S21 | thinking Skill | 結構化思維注入 5 agent | ✅ |
| S22 | 系統衛生強化 | PM 隔離 + 靜默失敗清除 | ✅ |
| S23 | 異構模型分配 | model-router.js haiku→MLX / sonnet,opus→API | ✅ |

</details>

### 新增技術路線

| # | 名稱 | 說明 | 狀態 | 關聯 |
|---|------|------|:----:|------|
| S24 | 架構重設計遷移 | Pipeline → 深度路由 + Worker 模式 | ✅ | R0 |
| S25 | Flow Visualizer | hooks 事件記錄 + SSE 即時顯示 + graph 靜態圖 | ✅ | R0.5 |
| S26 | Skill 知識適配 | workflow-core / auto SKILL.md 改寫適配深度路由 | ⬜ | R1 |
| S27 | 測試套件重建 | 適配新架構的測試（移除 Pipeline 測試，新增深度路由測試） | ⬜ | R1 |
| S9a | Worktree Isolation | D4 並行 Worker 的 worktree 隔離 | ⏳ | R4 |

---

## 實作優先序

> R1-R3 依賴關係圖：

```
R1.1 守衛框架 ✅ ───────────────────────────────────┐
R1.2 Maintainer P1 ✅ → P2 → P3 → P4 → P5 ────────┤
R1.3 Learner（行為偵測）→ R1.4 評分框架 → R1.6 回饋迴路 ────┤→ R2 可開始
R1.5 收斂框架 ──────────────────────────────────────┤
                                                     │
R2.1 Gap 偵測 → R2.2 Skill Forge ─────────────────┐│
R2.3 深度 PM ──────────────────────────────────────┤│
R2.4 Orchestrator（依賴 R2.1-R2.3）───────────────┤│
R2.5 經驗內化 ─────────────────────────────────────┤│
R2.6 Acid Test（依賴 R2.1-R2.5 全部完成）──────────┘│
                                                     │
R3.1 心跳引擎 → R3.2 佇列系統 → R3.3 OS 腳本 ─────┤
                                                     │
R4（依賴 R1-R3 重建完成）────────────────────────────┘
```

**建議執行順序**：

| 階段 | 內容 | 可並行 |
|------|------|:------:|
| Phase 1 | R1.1 ✅ + R1.2(P1 ✅) + R1.3 | R1.2(P2+) + R1.3 並行 |
| Phase 2 | R1.4 + R1.5 + R1.6 | 全部並行 |
| Phase 3 | R2.1 + R2.2 + R2.3 | 全部並行 |
| Phase 4 | R2.4 + R2.5 | R2.4→R2.5 序列 |
| Phase 5 | R2.6 Acid Test | 序列（驗收） |
| Phase 6 | R3.1 → R3.2 → R3.3 + R3.4 | R3.1→R3.2 序列 / R3.3+R3.4 並行 |
| Phase 7 | R4 | 新章節 |

---

## 失真防護

### 重建 vs 鍍金 檢測

| 檢查項 | 問題 | 失真信號 |
|--------|------|----------|
| 重建必要性 | 這個腳本在新架構下仍需要嗎？ | 無法指出哪個 Skill 消費它 |
| 範圍蔓延 | 重建時有沒有偷加新功能？ | 行數超過原版 150% |
| Pipeline 殘留 | 有沒有不自覺重建 Pipeline 模式？ | 出現 stage/workflow/handoff 概念 |
| 知識vs執行 | Main Agent 看 Skill 就能做的事，需要腳本嗎？ | 腳本邏輯 = SKILL.md 的文字化 |

### 量化上限

| 指標 | 上限 |
|------|------|
| Agent 數量 | 3（planner/executor/reviewer） |
| Workflow 模板 | 0（深度路由取代） |
| Rules | 15 個（避免膨脹） |
| scripts/lib 模組 | 按需重建（每個須指出消費者） |

---

## 歷史記錄

<details>
<summary>v0.21-v0.29 架構（Pipeline 時期 — 已歸檔）</summary>

- 18 個 agents、18 個 workflow 模板、31 個 commands
- 實測 3.3x token 浪費（233k vs 70k）
- Pipeline 架構文件見 `docs/spec/overtone-*.md`（歷史參考）
- 架構重設計分析見 `docs/spec/架構重設計.md`

</details>

<details>
<summary>Layer 1-3 原版完成記錄</summary>

- L1 核心大腦：15 次真實任務驗證 100% 完成率
- L1.4 持續學習：7 項能力全部完成（v0.28.25-28）
- L1.5 引擎強化：3 項全部完成（Handoff Persistence + Evidence Loop + Keyword Relevance）
- L2 感知操控：L2.1-L2.4 + L2.6-L2.7 完成，L2.5 延後
- L3 自我進化：L3.1-L3.7 完成，Acid Test standard workflow 通過
- S1-S23 技術路線全部完成

執行層腳本在架構重設計時清除，知識層（Skills/Rules）完整保留。

</details>
