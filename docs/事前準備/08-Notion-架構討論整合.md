# 08 — Notion 架構討論整合

> 狀態：✅ 已確認（Notion 原始內容）
> 來源：[Notion 頁面](https://www.notion.so/32153308300d8198b274e96ce7d62c93)
> 標記：🟡 討論中（未定案）

---

## 背景 ✅ 已確認

現行架構是「角色驅動 pipeline」— 16 個 specialized agent，每個 stage 委派一個 subagent。

**效率問題**：一個「加 flag 檔案」的小功能走 quick workflow 花了 **233k tokens**，合理成本約 70k。

**業界研究結論**：
- 多 agent 有 **3.6x token 懲罰**、錯誤放大 4.4-17.2x
- 獨立 code review agent 有真實價值（HubSpot Judge Agent）
- Haiku 4.5 達 Sonnet 90% agentic coding 性能，成本 1/3
- Anthropic 官方：「只有簡單方案不足時才加多步驟」

---

## 三角色定義 ✅ 已確認

### 1. 規劃者（Planner）

| 項目 | 說明 |
|------|------|
| 認知模式 | 分析、分解、設計（不寫碼） |
| 何時叫 | 跨模組、架構決策、需求模糊 |
| 不叫 | 改設定、一行修改、明確 bug fix |
| Model | sonnet（大多數）/ opus（複雜架構） |
| 動態 Skills | architecture, testing-strategy, security-kb, database |
| 產出 | 任務分解 + 技術方案 |

### 2. 執行者（Executor）

| 項目 | 說明 |
|------|------|
| 認知模式 | 實作、寫碼、跑測試 |
| 何時叫 | 需要 worktree 並行、或 Main 想保持 context 乾淨 |
| 不叫 | Main 自己能快速完成的改動 |
| Model | haiku（簡單）/ sonnet（複雜） |
| 動態 Skills | testing, security-kb, dead-code, commit-convention |
| 產出 | 程式碼變更 + 測試結果 |

### 3. 審查者（Reviewer）

| 項目 | 說明 |
|------|------|
| 認知模式 | 批判性思考、找問題（不修碼） |
| 何時叫 | >5 檔案、安全敏感、使用者要求 |
| 不叫 | ≤3 檔案 + 測試通過 |
| Model | opus（深度 review）/ sonnet（快速掃描） |
| 動態 Skills | code-review, security-kb, database, architecture |
| 產出 | 問題清單 + 嚴重度判斷 |

---

## 深度路由 D0-D4 ✅ 已確認

```
改設定檔 → Main 自己做（D0，不叫任何角色）
小 bug fix → Main 自己做 + 跑測試（D1）
中型功能 → 規劃者(sonnet) → Main 自己做 + 測試（D2）
大型功能 → 規劃者(opus) → 執行者(sonnet) → 審查者(opus)（D3）
並行開發 → 規劃者 → 多個執行者(worktree) → 審查者（D4）
```

### 深度 × Effort Level

| 深度 | Effort Level | 判斷信號 |
|------|-------------|---------|
| D0 | low | 改設定、一行修改 |
| D1 | medium | 小功能、bug fix、≤3 檔案 |
| D2 | high | 中型功能、跨模組、「重構」 |
| D3 | high | >5 檔案、安全敏感 |
| D4 | high + ultrathink | 多人天工作量、可分解 |

**原則**：寧可低估（D1 做完再升 D2）不要高估（浪費 token）

---

## 設計原則 P1-P6 ✅ 已確認

| 代號 | 原則 |
|------|------|
| P1 | 預設單腦 — Main 自己完成，只在有明確收益時才分裂 |
| P2 | 驗證靠執行 — 跑測試 > LLM review |
| P3 | 知識與角色分離 — 最佳實踐 → Skill，角色人設 → 刪除 |
| P4 | 並行靠工具 — 多 tool call > pipeline stage |
| P5 | 成本意識 — 每個 agent 呼叫必須論證 ROI |
| P6 | 合約驅動 — 跨邊界溝通固定 JSON schema，Hook 做確定性驗證 |

---

## 統一 JSON 合約 ✅ 已確認

### 格式分層

| 溝通層 | 格式 | 原因 |
|--------|------|------|
| Agent ↔ Hook | JSON（固定 schema） | 程式碼消費，需確定性驗證 |
| Agent ↔ Agent | JSON（固定 schema） | 下游需可靠解析 |
| Agent 內部思考 | 自由格式 | LLM 思考不該被格式限制 |
| Agent ↔ 人類 | Markdown | 人類閱讀需要可讀性 |

### Schema 範例

**Planner → Main**
```json
{
  "role": "planner",
  "tasks": [{ "id": "t1", "description": "...", "files": ["a.js"], "complexity": "low" }],
  "architecture_decisions": [],
  "suggested_depth": "D2",
  "suggested_model": "sonnet"
}
```

**Main → Executor**
```json
{
  "role": "executor",
  "task": { "id": "t1", "description": "..." },
  "context": { "plan_summary": "...", "files_to_modify": [] },
  "skills": ["testing", "security-kb"],
  "constraints": { "max_files": 5, "must_test": true }
}
```

**Executor → Main**
```json
{
  "role": "executor",
  "verdict": "pass",
  "files_modified": ["a.js", "a.test.js"],
  "tests": { "passed": 12, "failed": 0 },
  "summary": "..."
}
```

**Reviewer → Main**
```json
{
  "role": "reviewer",
  "verdict": "pass | reject | request_changes",
  "issues": [{ "severity": "warning", "file": "a.js", "line": 42, "message": "..." }],
  "summary": "..."
}
```

### v0.29 → v0.30 對比

| v0.29 | v0.30（JSON 合約） |
|-------|-------------------|
| verdict 用 regex + 關鍵詞猜 | 直接讀 output.verdict |
| 下游 agent 靠 LLM 理解 Markdown | 直接取 JSON 欄位 |
| Handoff 格式靠 prompt 約束 | JSON Schema 程式化驗證 |
| 閉環模糊（verdict 可能漏判） | 確定性（缺欄位 → 自動攔截） |

---

## 元件職責定義 ✅ 已確認

| 元件 | 職責 | 禁止 | 對應業界 |
|------|------|------|---------|
| **Command** | 使用者意圖入口。接收 → 解析 → 委派。純路由 | ❌ 業務邏輯 ❌ 讀寫狀態 ❌ 驗證 | VS Code Command |
| **Skill** | 純知識注入。domain 最佳實踐、checklist、參考 | ❌ 執行動作 ❌ 讀寫檔案 ❌ 決策 | CrewAI Knowledge |
| **Hook** | 事件攔截 + 守衛。確定性驗證、注入 context、記錄 | ❌ 模糊判斷 ❌ 修改程式碼 ❌ 觸發新流程 | OpenAI Guardrails |
| **CLI Script** | 系統管理。狀態查詢、健康檢查、佇列操作 | ❌ AI 推理 ❌ 注入 context ❌ 替代 Command | npm scripts |

### 決策分配原則

| 決策類型 | 負責者 | 範例 |
|---------|--------|------|
| 確定性驗證 | Hook（程式碼） | 路徑合法性、危險指令黑名單 |
| 語意判斷 | Main Agent（AI） | 深度選擇、角色分配、skill 選擇 |
| 領域知識 | Skill（靜態注入） | OWASP checklist、BDD 格式 |
| 使用者偏好 | 人類決定 | 要不要 review、deadline |

---

## 閉環與守衛分配 ✅ 已確認

### 三層防禦（v0.30）

| 層次 | v0.29 | v0.30 |
|------|-------|-------|
| **L1: 寫入守衛** | enforceInvariants(4) + pre-edit + pre-bash | 保留 pre-edit（路徑）+ pre-bash（黑名單），移除 workflow invariant |
| **L2: 啟動自癒** | sanitize(3) + health-check 25 項 | 簡化 sanitize，health-check 改為元件完整性 |
| **L3: 主動偵測** | health-check + validate-agents + skill-score | 合併為統一 `audit` CLI |

### 閉環檢查清單

| 檢查項 | 驗證方式 | 負責者 |
|--------|---------|--------|
| 新增 Skill → Agent 有消費？ | validate-agents 交叉檢查 | CLI（自動） |
| 新增 Agent → Command 有路由？ | health-check 偵測孤兒 | CLI（自動） |
| 修改 Hook → 測試覆蓋更新？ | test-parallel.js | 開發者（手動） |
| 刪除元件 → 引用清除？ | grep + health-check | CLI（自動） |

---

## Hook 系統展開（13 節點）✅ 已確認

### 生命週期流程圖

```
┌─ SESSION ─────────────────────────────────────────────────┐
│                                                           │
│  ① SessionStart → banner + init + queue + quality         │
│  ② UserPromptSubmit → compact recovery + 深度建議        │
│                                                           │
│  ┌─ TOOL USE CYCLE ────────────────────────────────┐     │
│  │  ③ PreToolUse:Task → worker 辨識 + context 注入 │     │
│  │  ④ PreToolUse:Bash → 19 條危險命令黑名單        │     │
│  │  ⑤ PreToolUse:Write/Edit → 元件保護 + MEMORY    │     │
│  │  ⑥ PostToolUse → 錯誤觀察 + 工具偏好            │     │
│  │  ⑦ PostToolUseFailure → failure + instinct       │     │
│  └──────────────────────── ↻ 重複 ──────────────────┘     │
│                                                           │
│  ⑧ SubagentStop → worker 結果記錄 + 收斂                 │
│  ⑨ PreCompact → compact-recovery.md 寫入                 │
│  ⑩ Stop → 完成檢查 + Loop 決策                           │
│  ⑪ Notification → Glass 音效 + TTS                       │
│  ⑫ TaskCompleted → hook:timing emit                      │
│  ⑬ SessionEnd → session 清理 + 知識畢業                  │
└───────────────────────────────────────────────────────────┘
```

### 13 Hook v0.30 變更彙總

| 分類 | 數量 | Hook |
|------|------|------|
| **Phase 1 已完成** | 2 | ② on-submit、⑤ pre-edit-guard |
| **Phase 2 需改（⚠️ 高風險）** | 3 | ③ pre-task、⑧ SubagentStop、⑩ Stop |
| **Phase 4 需改（低風險）** | 3 | ① SessionStart、④ pre-bash-guard、⑨ PreCompact |
| **不需改動** | 5 | ⑥ PostToolUse、⑦ PostToolUseFailure、⑪ Notification、⑫ TaskCompleted、⑬ SessionEnd |

### 每個 Hook 詳細變更

| # | Hook | 行數 | 現行職責 | v0.30 變更 | Phase | 風險 |
|---|------|------|---------|-----------|-------|------|
| ① | SessionStart | — | banner + init + 自癒 + queue + 品質 | 移除 workflow banner，新增 depth 顯示 | 4 | 低 |
| ② | UserPromptSubmit | — | /auto 注入 + compact recovery | ✅ Phase 1 完成。Phase 4 精細化深度建議 | 1✅+4 | 低 |
| ③ | PreToolUse:Task | 23K | agent 辨識 + stage 檢查 + activeAgents + updatedInput | **大幅簡化**：移除 stage/activeAgents/Handoff 鏈。保留 skill 注入 + worker 辨識 | 2+4 | ⚠️ 高 |
| ④ | PreToolUse:Bash | — | 19 條黑名單 | 保留。可選更新 approve→allow | 4(小) | 低 |
| ⑤ | PreToolUse:Write/Edit | — | 元件保護 + MEMORY + 閉環 + workflow | ✅ Phase 1 完成移除 workflow 限制 | 1✅ | 低 |
| ⑥ | PostToolUse | — | Bash 錯誤觀察 + 工具偏好 + 措詞 | **完全保留** | — | — |
| ⑦ | PostToolUseFailure | — | failure emit + instinct | **完全保留** | — | — |
| ⑧ | SubagentStop | 22K | 結果解析 + 並行收斂 + stage 推進 | **大幅簡化**：移除 parseResult/並行/stage。保留記錄 + timeline。用 last_assistant_message | 2 | ⚠️ 高 |
| ⑨ | PreCompact | — | workflow 狀態 → recovery.md | 簡化狀態保存 + 調整格式 | 4 | 低 |
| ⑩ | Stop | — | workflow 完成度 + Loop + 進度條 + Dashboard | 移除 workflow/Dashboard/進度條。保留 Loop + 佇列 + 音效 | 2+4 | 中 |
| ⑪ | Notification | — | Glass 音效 + TTS | **完全保留** | — | — |
| ⑫ | TaskCompleted | — | hook:timing emit | **完全保留** | — | — |
| ⑬ | SessionEnd | — | session:end + loop 重置 + 知識畢業 | **完全保留** | — | — |

**關鍵**：③ pre-task（23K 行）和 ⑧ SubagentStop（22K 行）透過 activeAgents 共享狀態緊密耦合，**必須同 Phase 同步重寫**。

---

## 模組化方向 ✅ 已確認

### 要模組化的

| 現況 | 問題 | v0.30 方向 |
|------|------|-----------|
| specs-list/pause/resume/backlog 4 個腳本 | 同 domain 拆太碎 | 合併為 `specs.js` CLI + 子指令 |
| health-check + validate-agents + skill-score | 重疊 | 合併為 `audit.js` CLI |
| 32 個 Command 扁平結構 | 認知負擔 | 精簡為 ~12 個 |
| agent-stop-handler (700+ 行) | 耦合 registry | 拆 retry-manager + verdict-parser |
| 18 個 Agent 各自硬編碼 skills[] | 改 skill 要改多檔 | 3 角色 + Main 動態選擇 |

### 不模組化的

| 元件 | 原因 |
|------|------|
| Hook 薄殼（~29 行） | 已夠薄 |
| paths.js 路徑常數 | 介面已簡單 |
| hook-utils.js hookError/safeRun | 2-3 小函式 |

### Command 精簡（32 → ~12）

**保留**：/auto, /review, /security, /tdd, /pm, /wf, /status, /ask

**移除/合併**：
- /dev, /quick, /standard, /full, /secure → 被 /auto D0-D4 取代
- /plan, /architect, /design → Main 或 Planner 處理
- /debug, /diagnose, /build-fix → /auto debug 模式
- /test, /e2e, /db-review, /clean → /auto 按需觸發

---

## 耦合問題與解法 ✅ 已確認

| 現有耦合 | 問題 | v0.30 解法 |
|---------|------|-----------|
| Handler ↔ Registry | agent-stop 直接讀 registry，改了靜默壞 | 透過 query API（`getRetryConfig(stage)`） |
| Agent YAML ↔ Skill 清單 | 改 skill 要改多檔 | Main 動態注入，不硬編碼 |
| Command ↔ Workflow | 32 cmd + 18 workflow 一對一 | /auto 取代大部分 |
| State ↔ 多個 Script | 各自讀寫 state | 統一 state API |

---

## 測試策略 ✅ 已確認

### 遷移計劃

| 階段 | 動作 | 測試變化 |
|------|------|---------|
| Phase 2: 精簡 Command | 刪 20 workflow cmd | 刪 workflow 測試 → 寫 depth 判斷測試 |
| Phase 3: Agent 合併 | 16 → 3 角色 | 刪 16 agent 測試 → 寫 3 角色行為測試 |
| Phase 4: Hook 簡化 | 簡化 agent-stop/pre-task | 刪 pipeline 測試 → 寫守衛測試 |
| Phase 5: Registry 瘦身 | 移除 workflows/stages | 刪映射測試 → 寫角色/skill 測試 |

### 測試原則

1. 每個 Phase 獨立可測
2. 替換不累積（數量穩定或下降）
3. 回歸門檻：每 Phase 完成 `bun test` 0 fail
4. 測試跟著元件走

---

## 線上研究整合 ✅ 已確認

### 研究 1: Hook API 更新（16 事件）

新增事件：TeammateIdle, InstructionsLoaded, ConfigChange, WorktreeCreate/Remove

重要變更：
- `permissionDecision`: approve/block → **allow/deny**（舊名 deprecated）
- SubagentStop 新增 **`last_assistant_message`**（直接讀 subagent 最後回應）
- Hook 類型新增 **http**（POST 到 URL）
- Agent frontmatter 支援 **`isolation: worktree`**（官方 worktree 支援）

### 研究 2: 業界驗證

| 來源 | 結論 | 對 v0.30 |
|------|------|---------|
| Anthropic 官方 | 先用簡單方案 | P1 預設單腦符合 |
| SWE-bench 前 3 | read→write→test→iterate 單循環 | D1 是最佳模式 |
| OpenHands | 多 agent 3.6x token 懲罰 | 確認問題 |
| Anthropic Orchestrator-Worker | Central LLM 動態分解 | D3-D4 正是此模式 |

### 研究 3: Worktree 並行（官方支援）

```yaml
# Executor worker frontmatter
---
name: executor
isolation: worktree
model: sonnet
skills: [testing, security-kb]
---
```

不需自訂 WorktreeCreate hook，官方預設行為已足夠。

### 研究 4: 知識提取模式

```
Agent prompt 分析：
├── 人設/角色描述 → 刪除
├── 具體檢查清單 → 提取到 Skill reference
├── 最佳實踐規則 → 提取到 Skill
├── 輸出格式要求 → 刪除（v0.30 用 JSON 合約）
└── 工具使用指令 → 刪除（worker 不需要）
```

---

## 開放問題 🔍 待確認

### Q1: 規劃者的邊界

- [ ] 規劃者包含 PM（合併）
- [ ] PM 獨立為第四角色
- [ ] PM 由 Main 自己做

### Q2: 執行者 vs Main 的分界線

- [ ] 需要 worktree 並行時才叫
- [ ] Main 想保持 context 乾淨時也叫
- [ ] 超過 N 個檔案就叫

### Q3: 審查者的觸發條件

- [ ] Main 自動判斷（>5 檔案 or 安全敏感 → 自動叫）
- [ ] 只在使用者明確要求時
- [ ] 混合：特定條件自動 + 其他使用者決定

### Q4: Skill 動態注入的實作方式

- [ ] Main 在 agent prompt 中直接列出 skill reference 內容
- [ ] Agent 定義保留 skills[] 但改為「可選清單」
- [ ] 新機制：Main 傳 skill names，agent 啟動時自動載入

### Q5: Model 路由的決策依據

- [ ] 純 Main 判斷
- [ ] Hook 建議 + Main 決定
- [ ] 規則化（安全→opus，格式→haiku）

### Q6: 現有 Pipeline 基礎設施

- [ ] 全部砍掉重寫
- [ ] 保留 registry 作映射，砍 pipeline
- [ ] 漸進式：停用 → 確認穩定 → 刪

### Q7: Queue + Heartbeat 適配

依賴 workflow state。簡化 state 後怎麼適配？

### Q8: Instinct 系統

沒有 workflow 後觀察怎麼調整？

---

## 遷移路線圖 ✅ 已確認

```
Phase 1 ✅ → Phase 2 → Phase 3 → Phase 4 → Phase 5
解除枷鎖    Worker化   知識提取   系統清理   測試遷移
(已完成)   (1-2 sess) (1-2 sess) (1 sess) (1-2 sess)
  │            │           │          │          │
  ├─edit-guard ├─③pre-task ├─13 agent ├─registry ├─刪 pipeline
  ├─on-submit  ├─⑧SubStop  │ →skill   ├─state.js │ 測試
  ├─/auto 重寫 ├─⑩Stop     ├─新 skill ├─①Start   ├─新 depth
  └─dashboard  ├─3 角色    ├─補充 4   ├─⑨Compact │ 測試
    刪除        │ agent.md  │ skill    ├─④bash    ├─新 worker
               └─state.js  └─刪 agent ├─刪 20cmd │ 測試
                 workers     .md 檔案  └─version  └─全套通過
                 追蹤                    0.30.0
```

---

## 已完成 ✅

- [x] Phase 1: 解除枷鎖 — 移除 workflow 強制
- [x] 刪除 Dashboard（server.js, web/, dashboard command）
- [x] 刪除 Remote（adapter, event-bus, telegram, dashboard-adapter）
- [x] 測試適配（刪除 12 孤兒測試，修復 8 個失敗）

---

## 討論紀錄

### 2026-03-12: 初始討論
- 確認三角色方向
- 確認動態 skill 注入 + model 路由
- Phase 1 已落地

### 2026-03-12: 統一 JSON 合約
- 新增 P6 設計原則
- 定義格式分層
- Schema 範例

### 2026-03-12: 元件職責定義 + 架構原則
- 業界研究：VS Code / Terraform / OpenAI SDK / CrewAI / Obsidian / Neovim
- 四元件職責表 + 決策分配 + 閉環守衛

### 2026-03-12: Hook 系統展開 + 線上研究
- 13 Hook 完整展開（7 需改，高風險集中 ③+⑧）
- 5 項線上研究整合
