# Nova Roadmap

> 最後更新：2026-03-15 | 架構：單腦 + D0-D4 深度路由 + Worker | 當前焦點：R2 自我進化

## 架構演進

v0.21-v0.29 的 16 角色 Pipeline 架構已清除（實測 3.3x token 浪費、4.4x 錯誤放大）。
v0.30+ 採用「單腦 + 深度路由 + 輕量 Worker + 本地模型背景 agent」模式。
五層定義見 `docs/vision.md`。

**現有基礎**：
- Rules 14 個（全域行為規範）
- Skills 29 個（知識庫，含 nova-spec、closed-loop、nova-test）
- Agents 3 個（planner/executor/reviewer）
- Nova Server（hook dispatch + Flow Visualizer + SSE + metrics）
- Guards（`guards.js` 統一模組）
- 本地模型背景 agent 3 個（maintainer.js + learner.js + judge.js 待建）
- Notion 整合（Nova Roadmap database + 雙向同步）

---

## Layer 總覽

| Layer | 名稱 | 模組 | 狀態 |
|:-----:|------|:----:|:----:|
| 1 | 核心大腦 | Guards ✅ + Maintainer ✅ + Learner ✅ + Judge ✅ | ✅ 4/4 |
| 2 | 自我進化 | Skill Lifecycle ⬜ + Acid Test ⬜ | 🔴 0/2 |
| 3 | 感知操控 | 心跳 ⬜ + OS 腳本 ⬜ + 操控層 ⬜ | 🔴 0/3 |
| 4 | 通用代理人 | 動態 MCP + 跨領域自主運作 | ⬜ |
| 5 | 產品 | 開放集合 | ⬜ |

> **16 → 4 模組整合**：R1.5 收斂 / R1.6 回饋 → Learner 吸收；R2.1 Gap / R2.3 PM / R2.4 Orchestrator / R2.5 內化 → 既有機制取代；R3.2 佇列 → Notion。詳見「整合說明」。

---

## R0：架構重設計基礎設施（✅ 已完成）

| # | 任務 | 狀態 |
|---|------|:----:|
| R0.1 | 清除 Pipeline 架構（18 agents → .bak、31 commands → .bak） | ✅ |
| R0.2 | 建立 3 Worker agents（planner/executor/reviewer） | ✅ |
| R0.3 | 全域 CLAUDE.md + 專案 CLAUDE.md 重組 | ✅ |
| R0.4 | Rules 14 個全域行為規範 | ✅ |
| R0.5 | Flow Visualizer 閉環（hooks → event-writer → SSE → client） | ✅ |
| R0.6 | Hooks 5 模組（guards + flow-observer + context-injector + notification + metrics） | ✅ |

---

## R1：核心大腦（✅ 4/4 完成）

> 目標：Main Agent 的自動化核心能力。
> 模式：SessionEnd 背景 agent + 本地模型（Qwen）= 零 API token 自動維護。

### R1.1 Guards（✅ 已完成）

- `guards.js` 統一模組（Bash 黑名單 + 元件保護）
- hook-client.js 錯誤追蹤 → `/tmp/hook-errors.jsonl`（結構化記錄）
- SessionStart context 注入近期 hook errors（AI 可見）
- Maintainer Step 2e 自動修復（清 lockfile + 檢查 server + 本地模型根因分析）
- 26 個測試通過

### R1.2 Maintainer（✅ P1-P4 完成）

SessionEnd 背景 agent：數字同步 → 狀態檢查 → metrics 分析 → Hook Error 自動修復 → 文件搬遷 → Notion 雙向同步 → git commit/push。

| Phase | 內容 | 狀態 |
|:-----:|------|:----:|
| P1 | 數字同步（4 維度 regex）+ 本地模型 commit message + git push 雙 repo | ✅ |
| P2 | 本地模型 roadmap 狀態正確性 + metrics 分析 + Hook Error 自動修復 | ✅ |
| P3 | 本地模型判斷 backlog 完成度 → 搬遷 spec/docs/ + 引用更新 | ✅ |
| P4 | Notion 雙向推送/拉取 + token fallback（~/.zshrc） | ✅ |
| P5 | Notion SoT 遷移（反轉：Notion → 生成本地文件） | ⬜ |

吸收了：R2.1 Gap 偵測（元件完整性 = Maintainer Step 2d）、R3.2 佇列（→ Notion database）。

### R1.3 Learner（✅ 已完成）

SessionEnd 背景 agent：行為偵測 + 信心追蹤 + 反模式警告 + SessionStart context 注入。

**信心公式**：`confidence = frequencyScore × spanScore × recency`
- 3 天算穩定、3 天沒出現信心減半
- 習慣門檻 0.60 → 建議固化
- 反模式門檻 0.40 → P0 警告
- 遺忘門檻 0.10 → 自動刪除

吸收了：R1.5 收斂（信心→0 = 建議移除）、R1.6 回饋（SessionStart context 注入）、R2.5 經驗內化（信心達標觸發 → Skill Lifecycle 執行）。

### R1.4 Judge（✅ 已完成）

SessionEnd 背景 agent：通用品質評估（100 分制 = 確定性 50 + 語意 50）+ 趨勢追蹤。

- `judge.js`：shouldRun() 偵測元件變更 → 確定性評分 + 本地模型語意評分
- 評分目標：Skills / Rules / Agents / Hook Modules
- 趨勢追蹤：`~/.claude/data/scores.jsonl`（JSONL append + 截斷 500 條）
- SessionStart 注入：F 級元件警告 + 品質下降趨勢
- 32 個測試通過

**L1 完成 → L2 可開始**

---

## R2：自我進化（🔴 0/2）

> 目標：觀察到重複行為 → 自動建構新能力 → 品質閘門 → 部署。
> 依賴：R1 完成（Learner 提供行為觀察，Judge 提供品質閘門）。

### R2.2 Skill Lifecycle

Learner 信心達標 → 建立 Skill → Judge 評分 → 達標部署 → 持續追蹤。

| 任務 | 類型 | 說明 |
|------|------|------|
| skill-forge.js | 重建 | 從 Learner 行為觀察建立 SKILL.md + references/ |
| 品質閘門 | 新建 | Judge 評分 ≥ B（96/120）才允許部署 |
| 自動部署 | 新建 | 通過品質閘門 → 加入 agent skills[] |
| Skill Lifecycle 測試 | 新建 | 建立 + 評分 + 部署 + 回滾 |

### R2.6 Acid Test

端到端驗收：高層目標 → PM → Forge → 開發 → 完成 → 品質驗證。

| 任務 | 類型 | 說明 |
|------|------|------|
| Acid Test | 驗證 | 用新架構（D2/D3 深度路由）重跑，全程自主 |

### R2 完成標準

> 系統收到高層目標 → 自主完成全流程，全程使用深度路由 + 本地模型背景維護。

---

## R3：感知操控（🔴 0/3）

> 目標：跨 session 自主運作 + OS 操控能力。

### R3.1 心跳引擎

跨 session daemon：輪詢 Notion → 有待做任務 → spawn `claude -p` session → 自主執行。

| 任務 | 類型 | 說明 |
|------|------|------|
| heartbeat.js | 重建 | Bun daemon（start/stop/status + PID + polling loop） |
| session-spawner.js | 重建 | `claude -p` spawn（stream-json + timeout + env 過濾） |
| Notion 輪詢 | 新建 | 讀 Notion database「待做」任務 → spawn session 執行 |
| heartbeat 測試 | 重建 | daemon 生命週期 + spawn 安全邊界 |

### R3.3 OS 操控腳本

| 任務 | 類型 | 說明 |
|------|------|------|
| screenshot.js | 重建 | 全螢幕/視窗/區域截圖 |
| window.js | 重建 | 視窗列表/聚焦 |
| process.js | 重建 | 列出/啟動/終止 |
| clipboard.js | 重建 | 讀/寫剪貼簿 |
| system-info.js | 重建 | CPU/記憶體/磁碟/網路 |
| tts.js | 重建 | 文字轉語音 |

### R3.4 操控層（新建）

| 任務 | 類型 | 說明 |
|------|------|------|
| keyboard.js | 新建 | 按鍵/快捷鍵/文字輸入（osascript System Events） |
| mouse.js | 新建 | 點擊/拖曳/滾動（cliclick） |
| applescript.js | 新建 | AppleScript/JXA 執行引擎 |
| computer-use.js | 新建 | 截圖→理解→操作→驗證迴圈 |

### R3 完成標準

> 心跳 daemon 啟動 → 輪詢 Notion → 有任務 → spawn session → OS 腳本可用 → 完成 → 通知。

---

## R4：通用代理人（⬜）

> 依賴：R1-R3 完成。

| 任務 | 說明 |
|------|------|
| 動態 MCP 工具組合 | 意圖→工具映射 + 按需啟動/關閉 MCP server |
| 跨領域自主運作 | 領域隔離 + 經驗遷移 + 3 領域各穩定 30 天 |

---

## R5：產品（⬜）

| 場景 | 為什麼 |
|------|--------|
| 自動交易 | 完全客觀的回饋信號（盈虧） |
| 企業自動化 | 最接近現有能力的外推 |
| AI 間交流 | 最前沿的探索方向 |
| 自主社群經營 | 品質判斷最主觀 |

---

## 整合說明

> 原始 16 個模組整合為 9 個的完整對照。

### 被吸收的模組

| 原模組 | 去向 | 原因 |
|--------|------|------|
| R1.5 收斂框架 | → R1.3 Learner | 信心→0 = 建議移除，同一套信心公式 |
| R1.6 回饋迴路 | → R1.3 Learner | SessionStart context 注入已實作 |
| R2.1 Gap 偵測 | → R1.2 Maintainer | 元件完整性 = 確定性檢查，跟數字同步同類 |
| R2.3 PM | → /pm command | Main Agent + 深度路由自己做 PM |
| R2.4 Orchestrator | → D4 深度路由 | Main + planner + multi-executor 已能做 |
| R2.5 經驗內化 | → R1.3 + R2.2 | Learner 信心觸發 + Skill Lifecycle 執行 |
| R3.2 佇列系統 | → Notion database | R1.2 P4 已接通雙向同步 |

### 計數

| | 原始 | 整合後 | 已完成 | 待建 |
|---|:---:|:------:|:------:|:----:|
| L1 | 6 | 4 | 4 | 0 |
| L2 | 6 | 2 | 0 | 2 |
| L3 | 4 | 3 | 0 | 3 |
| **合計** | **16** | **9** | **4** | **5** |

---

## 依賴圖

```
R1.1 Guards ✅ ──────────────────────────────┐
R1.2 Maintainer ✅ ─────────────────────────┤
R1.3 Learner ✅ ────────────────────────────┤
R1.4 Judge ✅ ──────────────────────────────┤→ L2
                                              │
R2.2 Skill Lifecycle ⬜ ────────────────────┤
R2.6 Acid Test ⬜ ──────────────────────────┤→ L3
                                              │
R3.1 心跳 ⬜ → R3.3 OS 腳本 ⬜ ─────────────┤
              → R3.4 操控層 ⬜ ──────────────┤→ L4
```

## 執行計劃

| Phase | 內容 | 並行 |
|:-----:|------|:----:|
| 1 | R1.1 ✅ + R1.2 ✅ + R1.3 ✅ + R1.4 ✅ | **L1 完成** |
| 2 | R2.2 Skill Lifecycle | 序列 |
| 4 | R2.6 Acid Test | 序列（L2 驗收） |
| 5 | R3.1 心跳引擎 | 序列 |
| 6 | R3.3 OS 腳本 + R3.4 操控層 | **並行** |

---

## Skills 閉環計劃

### 有知識、無執行層

| Skill | 對應執行層 | 重建位置 |
|-------|-----------|---------|
| os-control | scripts/os/*.js | R3.3 |
| autonomous-control | heartbeat.js + session-spawner.js | R3.1 |
| instinct | learner.js | ✅ R1.3 |
| evolve | Skill Lifecycle | R2.2 |

### 需特殊處理

| Skill | 問題 | 處置 |
|-------|------|------|
| skill-judge | references 為空 | R1.4 補全 |
| workflow-core | Pipeline 知識，不再適用 | 改寫為深度路由知識 |
| auto | 需改造（workflow → 深度路由） | 改寫 SKILL.md |

---

## 失真防護

| 檢查項 | 失真信號 |
|--------|----------|
| 重建必要性 | 無法指出哪個 Skill/Agent 消費它 |
| 範圍蔓延 | 行數超過原版 150% |
| 模組膨脹 | Maintainer/Learner 職責超過 5 步 |
| 知識 vs 執行 | 腳本邏輯 = SKILL.md 的文字化 → 不需要腳本 |

| 指標 | 上限 |
|------|------|
| Agent 數量 | 3（planner/executor/reviewer） |
| 背景 agent | 3（maintainer/learner/judge） |
| Rules | 15 個 |
| 本地模型 timeout | 300 秒（5 分鐘） |

---

## 歷史記錄

<details>
<summary>v0.21-v0.29 架構（Pipeline 時期）</summary>

- 18 個 agents、18 個 workflow 模板、31 個 commands
- 實測 3.3x token 浪費（233k vs 70k）
- 執行層腳本在架構重設計時清除，知識層（Skills/Rules）完整保留

</details>

<details>
<summary>S1-S25 技術路線（已完成）</summary>

| # | 名稱 | 說明 |
|---|------|------|
| S1 | 盤點遷移 + 效率優化 | disallowedTools + skills 預載 + updatedInput |
| S2-S4 | 自動偵測 + 平台追蹤 + 能力評估 | health-check + platform.md + RICE |
| S5-S8 | 模型分層 + 混合模式 | haiku/sonnet/opus + Opusplan |
| S10-S14 | Memory + 精簡 + 音效 + Status Line + Compact | 基礎設施完善 |
| S15-S23 | 最佳實踐 + 專一化 + Hook 遷移 + 異構模型 | 品質強化 |
| S24 | 架構重設計遷移 | Pipeline → 深度路由 + Worker |
| S25 | Flow Visualizer | hooks → SSE → 即時顯示 |

</details>
