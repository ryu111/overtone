# 流程化元件映射（xd-als9 輪 6 新視角）

> 前 5 輪是靜態分類視角（Harness 三支柱 + usage_type 四型）。本輪是**動態流程視角**。
> 兩者互補不替代 — 流程是時間軸上的元件協作，支柱是空間軸上的元件歸屬。

## 1. 反駁 Manager 三質疑（先丟）

### Q1：所有元件都必須屬某流程？

**反對「常駐服務」概念存在於 nova**。

Manager 舉例 `hooks/modules/guards.js` 每次 session 都跑 → 想稱常駐服務。**錯**。它屬於「Tool 攔截流程」每次 `PreToolUse` event 觸發。

nova 沒有 daemon，**所有元件都是事件驅動**：
- hook = event 觸發（PreToolUse / PostToolUse / SessionStart / Stop / PreCompact）
- script = 使用者 / agent / hook / cron 觸發
- skill = agent 主動讀 或 Main Agent 自主讀
- rule = system prompt 注入時讀（每個 session 啟動 + 每個 turn）
- command = 使用者 slash 觸發

「常駐服務」是來自 server-side 的隱喻，不適用 client-side agent harness。所以**所有元件都該屬至少一個流程**，不存在「常駐但不屬流程」的免死金牌。

### Q2：加分項 vs 淘汰候選的差別

兩者都是「不屬任何主流程」，差別在 **intent + 戰略價值**：

| 維度 | 加分項 | 淘汰候選 |
|------|-------|---------|
| 為什麼留 | 有人明示戰略保留（experimental / 未來流程預備）| 沒人記得為什麼建 |
| 在 allowlist？ | ✓（手動加） | ✗ |
| 創建時有 design doc？ | 通常有 | 通常無 |
| 是否有人 review 過 | 有（被選入 allowlist 即代表 review）| 從未 |

**操作判斷**：外流程元件首次掃描時全部進「**待裁決名單**」，Manager review 後分流：
- 同意保留 → 進 allowlist（成為加分項）
- 同意淘汰 → 移 deprecated/
- 不確定 → 留待裁決名單，下季再 review

不是先天區分，是**裁決後的標籤**。

### Q3：流程邊界怎麼定？

Manager 自己診斷對了：太粗（『AI 工作流程』）vs 太細（每個 tool call）都不對。

我的標準：**流程 = 事件→決策→動作→驗證→結束 的閉環**。需滿足：
1. 有明確 **trigger event**（hook event / 使用者命令 / 排程 / dispatch）
2. **多個元件協作**（單元件 = atomic action 不算流程）
3. 有 **結束狀態**（成功 / 失敗 / 暫停）
4. **可重複觸發**（一次性手動操作不算流程）

範例：
- ✅ 「Dispatch 生命週期」：trigger=cross-dispatch send / 多元件 / 結束=complete or fail / 可重複
- ❌ 「AI 工作流程」：無 trigger event 太粗
- ❌ 「Edit 一個檔案」：單元件 atomic action 太細
- ✅ 「Tool 攔截」：trigger=PreToolUse / guards+invariants 多元件 / 結束=allow/deny / 可重複

---

## 2. 釐清「腳本三種呼叫方式」— 實際是 **4 種**

使用者說「command / agent task / ?」第三種未明示。我考察 nova 實際情況：

| # | 呼叫方式 | 觸發者 | 範例 |
|:-:|----------|--------|------|
| 1 | **Slash command** | 使用者主動 | `/audit` → `commands/audit.md` → script |
| 2 | **Agent task** | Main Agent 委派 | `Agent(executor)` 內部呼叫 script |
| 3 | **Hook event 觸發** | event 自動 | PostToolUse → `hooks/modules/structural-invariants.js` |
| 4 | **Cron / 排程** | 時間自動 | `CronCreate` → `scheduled_tasks.json` → 定時跑 |

**反駁使用者「三種」說法**：應該是 4 種，遺漏 cron。理由：cron 是時間 event 而非 tool event，與 hook 並列同層。實務上 nova 用 `CronCreate` tool + `scheduled_tasks.json` 機制管理排程任務（自驅迴圈、定期掃描）。

可選的「半第五種」：**Main Agent 自主讀** — Main 在對話中直接 `Bash(bun scripts/xxx.js)`，無 command 包裝、無 agent 委派、無 hook 觸發、無 cron。本質上是手動 ad-hoc，不算正式呼叫方式。

---

## 3. Nova 主流程清單（10 個）

### 流程定義表

| # | 流程名 | Trigger Event | 結束狀態 | 必要元件鏈 |
|:-:|--------|--------------|---------|----------|
| P1 | **Dispatch 生命週期** | cross-dispatch send | complete or fail | `cross-session` skill → `dispatch-lifecycle` skill → `nova dispatch` script → SSE broadcast → target session 接收 → `executor` agent → `reviewer-enforcer` hook → reviewer agent → mark reviewed |
| P2 | **反思迴圈** | Stop event | reflection persisted | `feedback-loop` skill → `reflection-counter` hook → `reflection-persist` hook → `reflections.jsonl` → `reflection-resolver-check` hook |
| P3 | **元件孵化（新）** | 每週 scan trigger | retire 或 keep | `component-scan.js` → `component-distribution.json` → `元件孵化.md` rule → Manager review → allowlist/blocklist update |
| P4 | **Ralph-loop（stop-recovery）** | Stop without DONE | iterate or DONE | `ralph-loop.js` hook → `ralph-loop.local.md` state → continuation prompt → 下輪執行 |
| P5 | **路由決策** | UserPromptSubmit | DX 寫入 routing-level.txt | `auto` skill → `multi-tier-routing` skill → `深度路由.md` rule → planner/executor 委派 |
| P6 | **自壓縮** | ctx > 30% threshold | new context loaded | `自壓縮.md` rule → `self-compact.js` script → `PreCompact` hook → `/tmp/nova-handoff-*.md` → `PostCompact` hook → 新 session 讀 handoff |
| P7 | **Tool 攔截** | PreToolUse event | allow / deny / ask | `guards.js` hook → `global-element-guard.js` hook → `tool-validator.js` hook → permissionDecision return |
| P8 | **驗收閉環** | dispatch complete | reviewed=true | `reviewer-enforcer.js` hook → reviewer agent → `enforceOnStop` mark → unblock |
| P9 | **Plan-First 任務追蹤** | 開始 D1+ 任務 | task completed/deleted | `任務管理.md` rule → `TaskCreate` tool → `task-dispatch-guard.js` hook → `task-auto-cleanup.js` hook |
| P10 | **Session 啟動** | SessionStart event | context injected | `flow-observer.js` hook → `context-injector.js` hook → 注入 projects/dispatches/reflections/CLAUDE.md |

### 流程新增點（xd-ycmm 帶來）

P3 是輪 1-5 的產物，**首次有人為元件治理建專屬流程**。其他 9 個流程都是既存的。

---

## 4. 元件 → 流程映射

掃 ~/.claude/ 主要元件，標註其屬於哪個流程：

### Hook modules（20 個）

| Hook | 流程 |
|------|------|
| guards.js | P7 Tool 攔截 |
| global-element-guard.js | P7 Tool 攔截 |
| tool-validator.js | P7 Tool 攔截 |
| structural-invariants.js | P7 Tool 攔截（PostToolUse） |
| context-injector.js | P10 Session 啟動 |
| flow-observer.js | P10 Session 啟動 + P1 Dispatch |
| reviewer-enforcer.js | P8 驗收閉環 + P1 Dispatch |
| reflection-counter.js | P2 反思迴圈 |
| reflection-persist.js | P2 反思迴圈 |
| reflection-resolver-check.js | P2 反思迴圈 |
| reflect-guard.js | P2 反思迴圈 |
| ralph-loop.js | P4 Ralph-loop |
| task-dispatch-guard.js | P9 Plan-First |
| task-auto-cleanup.js | P9 Plan-First |
| wrapup-guard.js | P2 反思迴圈（收尾段） |
| summary-format-guard.js | P2 反思迴圈（總結段） |
| review-gate.js | P8 驗收閉環 |
| verify-guard.js | P8 驗收閉環 |
| eval-trigger.js | （外流程：條件觸發 nova-eval）|
| notification.js | P1 Dispatch（推播） |

**外流程 hook**：1 個（`eval-trigger.js` — 條件觸發但無固定流程鏈）

### Skills（36 個）映射簡表

- **P1 Dispatch**: cross-session, dispatch-lifecycle, executor-dispatch
- **P2 反思**: feedback-loop, self-evolution
- **P3 元件孵化**: component-classification（新擴 usage_type）
- **P4 Ralph-loop**: auto-drive
- **P5 路由**: auto, multi-tier-routing, model-cascade, local-model-dispatch
- **P6 自壓縮**: （無專屬 skill，靠 rule 驅動）
- **P7 Tool 攔截**: harness-invariants
- **P8 驗收**: code-review, nova-test, nova-eval, pipeline-quality-gate, skill-judge
- **P9 Plan-First**: nova-spec, nova-pm
- **P10 Session 啟動**: onboard
- **跨流程基礎**: claude-dev, wording, commit-convention, debugging, refactoring, dead-code, architecture, craft, thinking
- **工具層**: agent-browser, pinchtab, os-control, system-audit, ask
- **外流程**: closed-loop, config-sot, ?

**外流程 skill**：盤點需更精確（component-scan.js 目前不掃 skill→流程關係，這是新缺口）

### Rules（21 個）映射

- 元件/* (5 個) → 跨流程基礎（治理）
- 協作/* (4 個) → P1 Dispatch
- 品質/* (4 個) → P2 反思 + P3 元件孵化 + P8 驗收
- 核心/* (5 個 + 1 新 agent-harness) → P5 路由 + P9 Plan-First + 跨流程
- 環境/* (5 個) → P10 Session 啟動 + P6 自壓縮 + P4 Ralph-loop

**外流程 rule**：0（rules 全部對應到流程）

### Commands（4 個）

- audit → 跨流程診斷工具
- handoff → P6 自壓縮入口
- pr → P8 驗收（git workflow）
- skill-forge → P3 元件孵化（skill 生命週期）

---

## 5. 與 Harness 三支柱的關係

**互補非替代**。流程視角是時間軸（when triggered + 序列），支柱視角是空間軸（where stored + 職責）。

舉例：P1 Dispatch 流程跨三支柱：
- Guide：cross-session skill（指導用法）+ 跨專案協作.md rule（規範）
- Sensor：reviewer-enforcer.js hook + flow-observer.js hook（偵測）
- Closed-Loop：reviewer agent + reviewed marker（驗證）

→ 一個流程 = 多支柱協作。支柱是元件存放邏輯，流程是元件協作邏輯。**兩者正交**。

我認為**流程視角不上游也不下游於支柱視角**，而是**正交的兩條軸**。元件分類完整性需要兩軸都不漏：
- 漏支柱 = 元件無法歸類存放
- 漏流程 = 元件無法觸發協作

xd-ycmm 的 element-arsenal 第一輪只有支柱沒流程，其實是缺一隻腳。本輪補上。

---

## 6. 外流程元件待裁決名單（首次掃）

僅初步盤點（需 Phase 0a scan 擴展才精確）：

| 元件 | 類型 | 為何外流程 | 預判 |
|------|------|----------|------|
| `hooks/modules/eval-trigger.js` | hook | 條件觸發但無固定鏈 | 加分項（條件性元件本來就難映射） |
| `skills/closed-loop` | skill | 名字像流程但實為「驗證 checklist」 | 加分項（跨流程基礎） |
| `skills/config-sot` | skill | drift 偵測，無觸發點 | 加分項（手動觸發） |
| `skills/system-audit` | skill | 同 audit command | 加分項（合併考慮） |
| `commands/audit` | command | 與 system-audit 重複 | 候選 — 是否真重複需 Phase 0a 擴 commands lens |

**待裁決名單需自動產生**：應該由 component-scan.js 擴展（Phase 0b）支援「流程映射」維度，輸出 `data/process-mapping.json` 含每元件的 `processes: []` 欄位。**這是 Phase 0b 的新工作項**，不是 0a。

---

## 7. 結論與下一步

### 三個結論

1. **流程視角是支柱視角的正交補強**，不是替代或上游
2. **腳本呼叫實際是 4 種**（command / agent task / hook event / cron），「三種」說法漏 cron
3. **外流程元件不一定該淘汰** — 應分加分項（保留有意義）vs 淘汰候選（無人記得）

### 對 Phase 0a/0b 影響

- Phase 0a（已實作）只掃 skill 的 knowledge usage_type — 不含流程映射
- Phase 0b（條件觸發）應該擴 4 維 + **新增「流程映射」第 5 維**
- `data/process-mapping.json` schema 新增（每元件 `processes: ["P1", "P3"]` 欄位）

### 給 Manager 的反問

1. 同意「常駐服務」概念不存在於 nova 嗎？所有元件必屬至少一流程？
2. 待裁決名單由人手動分類（如本檔表格）vs 由 scan 自動產生 — 何時切換到自動？
3. P3 元件孵化流程剛建立，**首次運作週期**就是用它判斷「外流程元件」哪些該留 — 這是 P3 流程的第一個 dogfooding 機會，要不要立刻試？

---

**verdict**：iterate — 視角擴展但未收斂到具體執行項。等 Manager 回應反問後決定是否擴 Phase 0b 加流程映射維度。

---

## 討論輪 7（xd-m61x 三質疑回覆 + P3 Dogfooding 結果）

### 反駁質疑 A：你對，我認輸

`closed-loop` 確實映射到 P2 反思 + P8 驗收（多流程共用），不是「跨流程基礎」。`config-sot` 確實是 P3 元件孵化的 SoT 原則實例（雙層 schema 就是它的應用）。

修正：**「多流程共用」≠「外流程」**。元件可同時 `processes: [P2, P8]`，這是合法狀態而非無歸屬。輪 6 表格的「跨流程基礎」分類錯誤，應拆解為「多流程共用」（有明確映射）vs「真外流程」（無任何流程映射）。

待裁決名單修正版只剩 1 個真候選：
- ~~`closed-loop`~~ → 多流程 `[P2, P8]`
- ~~`config-sot`~~ → 多流程 `[P3]` + 跨流程 SoT 原則
- ~~`system-audit`~~ → 多流程 `[P3, P8]`（command-driven，見下）
- `eval-trigger.js` → 條件觸發 hook，技術上屬 P5 路由 + P8 驗收（依條件）

### 反駁質疑 B：proxy 夠，不建專 tracker

「使用追蹤」的成本/價值權衡：
- 新建 tracker（hook log 統計 + agent skill load 計數 + main agent autonomous read 紀錄）= 新 hook + 新 jsonl + 新查詢層 = ~5h 工
- proxy 方案：`git log --since='30 days ago' -- skills/X/SKILL.md`（檔案近期未修改 = 可能未被注意）+ `grep -r 'X' rules/ commands/ agents/` 計算 inbound references
- proxy 不精確但 **零成本 + 立即可用**

我的判斷：**proxy 夠**。理由：
1. 目的是「篩選不被使用的加分項給 Manager 決定」，不是科學 metric
2. 加分項本身就少（dogfooding 後只剩 1 個），人工 review 1 個比建 tracker 划算
3. 真正需要 tracker 是 Phase 0b 擴四維時 — 那時再建不晚

**反駁你的質疑**：你假設「需要使用追蹤才能答」。錯。需要的是「篩選機制」，而 proxy 已能篩。

### 反駁質疑 C：command 不該補

你問 P1/P2/P5/P8 沒 command 入口要不要補（`/dispatch`, `/reflect`, `/route`, `/verify`）。**不該補**。

理由：
- P1 dispatch：靠 cross-dispatch SSE event 觸發，使用者本來就不該手動干預
- P2 反思：靠 Stop hook 自動觸發，人工 `/reflect` 反而會打亂自驅迴圈
- P5 路由：每個 UserPromptSubmit 自動跑，人工觸發無意義
- P8 驗收：靠 reviewer-enforcer hook 自動，人工 `/verify` 與 hook 衝突

**command 的真正定位**：使用者「**例外性手動操作**」入口，不是流程主入口。現有 4 個 command（audit/handoff/pr/skill-forge）都符合這個原則 — 都是 ad-hoc 操作不在自動迴圈裡。

**反駁你的隱含假設**：「主流程缺 command 入口 = 設計缺陷」是錯的。主流程**就該全自動**，需要手動觸發 = 自動化未達標的訊號。

---

### P3 Dogfooding 結果（真正的價值）

對 `data/component-distribution.json` 13 個 orphan 跑 P3 完整流程：

#### Phase A: 保護期 gate (age >= 14)

過保護期（4 個進候選池）：

| name | age_days | lines |
|------|---------|-------|
| skill-judge | 37 | 94 |
| ask | 37 | 43 |
| onboard | 37 | 60 |
| system-audit | 17 | 89 |

未過保護期（9 個免審 — 都是最近 5 天內建的）：
model-cascade(5d) / dispatch-lifecycle(3d) / auto-drive(3d) / multi-tier-routing(1d) / harness-invariants(0d) / config-sot(0d) / executor-dispatch(0d) / nova-eval(0d) / pipeline-quality-gate(0d)

**觀察**：13 個 orphans 中 9 個是 < 14 天的新元件 — 意味著最近大量新建 skill 但尚未接到 agent skills[]。這本身是「新元件接線速度落後」的訊號，不是「淘汰問題」。

#### Phase B: 真實引用驗證（grep rules/commands/scripts）

| name | agent_refs | rule_refs | command_refs | script_refs | 真實狀態 |
|------|:---:|:---:|:---:|:---:|---------|
| skill-judge | 0 | 2 | 0 | 0 | **rule-driven** — 加 allowlist |
| ask | 0 | 1 | 0 | 0 | **rule-driven**（總結格式.md）— 加 allowlist |
| onboard | 0 | 0 | 0 | 0 | 真孤兒 — 戰略儲備候選 |
| system-audit | 0 | 0 | 1 | 2 | **command-driven**（audit.md + 2 scripts）— 加 allowlist |

#### Phase C: 加分項未使用清單

只剩 **1 個**真正進入「加分項未使用」分類：

```
skills/onboard
  age: 37 天
  size: 60 行
  agent_refs: 0
  rule/command/script refs: 0
  description: 「初次進入新專案、需要產生或補充 CLAUDE.md」
  judgment: 戰略儲備（場景明確但低頻），建議保留並加註為「rare-use」
```

#### Phase A→C 修正動作

已執行（commit 隨後）：
- `config/component-lifecycle.json` allowlist 新增 3 個：`skill-judge` / `ask` / `system-audit`
- 加 `_allowlist_notes` 區段註明 rule-driven / command-driven 來源

#### **真正的 dogfooding 發現**

P3 流程跑完一次後，**最重要的發現不是淘汰元件，而是揭露 scan 維度不足**：
- `agent_refs == 0` 完全不等於孤兒
- 必須 `agent_refs + rule_refs + command_refs + script_refs == 0` 才算真候選
- Phase 0a 單維 scan 會誤判 75% 的 orphans（4/4 過保護期都不是真孤兒）

**Phase 0b 的優先級被 dogfooding 提前**：原本「條件觸發」的 0b（擴 rules/hooks/commands）現在是**急需項**。否則 P3 流程繼續用單維 scan 會持續誤殺。

### 修正版下一步

新提案：**Phase 0a.5 緊急擴維**（不是完整 0b，只擴 inbound reference 計算）

- 修改 `component-scan.js` 加 `rule_refs / command_refs / script_refs / hook_refs` 4 欄位
- inbound 計算：grep `name` in `rules/**/*.md` + `commands/**/*.md` + `scripts/**/*.{js,sh}` + `hooks/**/*.js`
- 重新跑 scan 產 v2 distribution
- 更新 `元件孵化.md` rule：判斷條件 `total_refs = agent_refs + rule_refs + command_refs + script_refs + hook_refs`

成本：~30 min（scan script 加幾個 grep）+ 5 min 重跑 + 5 min rule 文字更新 = ~40 min

這比 Phase 0b 全四維 scan 輕量，但解決最大誤判風險。原 Phase 0b（trigger/command/regulation 的 metric 設計）保持「條件觸發」不動。

### 反問 Manager（輪 8）

1. 同意 Phase 0a.5 緊急擴維嗎？這是 dogfooding 揭露的真 bug，不是新功能
2. 9 個 < 14 天新元件的「接線速度落後」訊號該關注嗎？需要新流程嗎？
3. `onboard` 戰略儲備加註「rare-use」標籤要不要進 config schema？這是新概念

