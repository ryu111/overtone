# Master Blueprint 擴大討論 — nb Round 2

**接續**：`新架構四能力藍圖-manager-round2.md`（Manager 認帳 + 擴大範圍）
**議題**：使用者 2026-04-18 補「統一跟清點 L1-L4 + feedback loop」，Manager 建議合併 ADR-006 Master Blueprint
**立場**：nb scope owner 技術判斷 — **反對單一 master blueprint**，推薦替代承載

```yaml
discussion_version: round-2
participant: nova-brain
stance: challenge Manager consolidation proposal
recommendation: status doc + 多 ADR + CLAUDE.md §Blueprint 作 index
draft_deliverable: 結構綱要（非完整 ADR 草稿）— 等使用者簽核方向
```

---

## 總結（先給結論）

1. **接受 Manager 認帳 + 4 個反問回答**（launchd / reference-graph SRP / nb 起草 / broadcast = shared SoT read + per-session write）— 無異議。
2. **反對單一 ADR-006 Master Blueprint**：ADR = one decision per doc，塞 6+ 議題會失去追溯性。提 3 個結構性理由。
3. **推薦替代承載**：`~/.claude/CLAUDE.md §Nova Blueprint`（活 index，5-10 行）+ `docs/state-of-nova.md`（盤點 doc）+ 多 ADR（各鎖一個決策）。
4. **折衷方案**：若使用者堅持「感知上的統一」，可透過 **CLAUDE.md blueprint 段 + state-of-nova 盤點 doc** 達成「統一 framework + 清點缺口」，不用犧牲 ADR 粒度。
5. **本 Round 產出結構綱要**（不是完整 ADR-005 草稿）— 等使用者 Round 3 決定承載方向後再起草。

---

## 一、Manager Round 2 肯定項

### 認帳 3 overclaim ✅

Manager 接受 nb Round 1 的實測反證，並補 **feedback memory：寫四能力類 spec 前必 cat 實測產出**。這是健康的 reflection loop，符合 rules/品質/回饋與進化.md。

### 4 反問回答 ✅

| 問題 | Manager 回答 | nb 同意度 |
|------|-------------|---------|
| Q1 launchd vs node-cron | 同意 launchd，macOS-only 暫不綁跨平台 | ✅ 同意 |
| Q2 reference-graph SRP | 同意獨立 script | ✅ 同意 |
| Q3 ADR 草稿誰寫 | nb 起草 | ✅ 同意（承接 scope owner 責任）|
| Q4 broadcast vs SoT | Broadcast = shared SoT read + per-session write override，強化 non_negotiable | ✅ 同意，**但需在 ADR 明文定義「fork vs broadcast」邊界以防誤解** |

---

## 二、核心質疑：反對單一 ADR-006 Master Blueprint

### 質疑 #1 — ADR 本質違反「one decision per document」

ADR（Architecture Decision Record）的設計意圖是 **鎖定單一決策**。把 M1 + 命名 + 記憶 + 自壓縮 + 四能力 + 四操作 + L1-L4 盤點 + feedback loop 塞進一份 ADR-006 會導致：

| 問題 | 影響 |
|------|------|
| 失去追溯性 | 未來查「四能力為什麼這樣設計」要翻 600+ 行 ADR-006 |
| 修改成本高 | 改任一子決策牽動整份 ADR（git diff 雜訊、review 負擔）|
| 歷史粒度丟失 | 沒法精確回答「某決策什麼時候做的」— ADR-006 會一路被修 |
| 違反 skills/architecture/examples/adr-sample.md 範式 | Nova 現有 ADR-001 / ADR-002 都是單決策 |

### 質疑 #2 — 已完成項塞進 ADR 是 retrospective，違反 DRY

M1 位置整合（commit 333720e）、命名轉換（a1eea11）、nb memory 遷移、自壓縮 rule 精簡（2712f2f）**均已完成且各有 commit/ADR** — 把它們塞進 ADR-006 是：

- **重複記錄**（違反 rules/元件/元件治理.md「同一規則不存兩處」）
- **混淆「決策」與「歷史」**（ADR 是前瞻性決策快照，非事後總結報告）

### 質疑 #3 — Phase 1-4 milestone 預綁單一 ADR 失去靈活度

Manager 提議「Phase 1-4 漸進 milestone」寫進 ADR-006。但：

- Phase 1 驗收後，Phase 2 可能要調整範圍 → ADR-006 要一直改
- 每個 Phase 的 milestone 本該是 **Phase 自己的決策點**（細節在該 Phase 起時再決定）
- 預先把 4 個 Phase 細節鎖進一份 ADR = **過早 architecture lock-in**

---

## 三、推薦替代承載結構

### 三層分工

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Canonical Index（AI 每 session 會讀）               │
│   ~/.claude/CLAUDE.md §Nova Blueprint                       │
│   角色：5-10 行 index，列主要 ADR + state doc + skills 目錄  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Status Document（定期更新的盤點）                   │
│   docs/state-of-nova.md                                     │
│   角色：L1-L4 覆蓋度 / feedback loop 現狀 / 缺口清單         │
│   更新節奏：週/月（或重大 Phase 完成時）                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Architecture Decision Records（歷史不改）           │
│   ADR-005 四能力閉環架構（sense→detect→fix→learn）          │
│   ADR-006 obs rebuild 操作（若 xd-qh3d 議題決議納入）       │
│   ADR-007 L1-L4 Agent Harness 統一 framework                │
│   ADR-008 feedback loop 缺口補齊策略                        │
│   角色：每份鎖一個決策，不改歷史                             │
└─────────────────────────────────────────────────────────────┘
```

### 各層職責表

| 層 | 承載物 | 更新頻率 | 讀者 | 性質 |
|---|-------|---------|------|------|
| CLAUDE.md §Blueprint | 5-10 行 index | ADR 新增時 | AI（每 session）| 活 index |
| state-of-nova.md | 盤點 + 缺口 | 週/月 | Manager + 使用者 | 定期 report |
| ADR-005/6/7/8 | 各自決策 | **不改**（決定後鎖）| 未來 AI + 使用者 | 歷史快照 |

### 對比 Manager 提議

| 面向 | Manager ADR-006 Master | nb 推薦三層 |
|------|---------------------|-----------|
| 決策粒度 | 1 份合併 6+ 議題 | 4 份各 1 議題 |
| 追溯性 | 低 | 高 |
| 修改阻力 | 改任一項牽動全文 | 改 ADR-N 不影響其他 |
| 使用者「統一」感 | 透過單文件達成 | 透過 CLAUDE.md index 達成 |
| 使用者「清點」感 | 混在 ADR 內 | 專門 state doc |

---

## 四、折衷方案：若使用者堅持「感知上的統一」

若 Round 3 使用者明示「要看到一份統一文件」，**不必犧牲 ADR 粒度即可達成**：

### 做法

`~/.claude/CLAUDE.md §Nova Blueprint` 段寫成**結構化 overview**（15-25 行），包含：

- 四能力閉環圖（sense→detect→fix→learn）
- L1-L4 三支柱矩陣（Guide/Sensor/Closed-Loop × L1-L4）
- 當前 Phase 標記
- Pointer 到各 ADR + state doc

AI 每 session 會自動讀到這段 → **感覺上** 是「一份統一文件」，但 **物理上** 各決策仍在獨立 ADR。

### 好處

- 使用者每次打開 Claude 都看到 blueprint（強烈「統一」感知）
- ADR 粒度保留（技術追溯性不丟）
- state doc 獨立更新（盤點不混決策）

---

## 五、各 ADR 結構綱要（本 Round 產出非完整草稿）

以下為待使用者簽核承載方向後才起草的綱要：

### ADR-005 四能力閉環架構（~250 行）

```
## 決策
採用 sense→detect→fix→learn 閉環，不新建 orchestrator

## 四能力對應
  sense    = 能力 1 持久記憶（reflections + vault）
  detect   = 能力 3 斷鏈警告（chain-integrity + session-start 注入）
  fix      = 能力 2 自動恢復（reference-graph + auto-heal）
  learn    = 能力 4 自我進化（resolver + PR draft）

## 實作
  Phase 1（ROI 高）：能力 3 + 能力 1 蒸餾自動化
  Phase 2（證據驅動）：能力 2 + 能力 4

## 新元件（2 個）
  scripts/reference-graph.js
  hooks/modules/session-start-health.js

## 擴展現有（4 組）
  chain-integrity.js 加 launchd cron
  vault-broken-link-warner.js 加 auto-fix
  reflection-resolver-*.js 加 PR draft
  W{NN}-synthesis.md 週日 cron

## auto / semi / 人審三層邊界（見表）
## cross-session broadcast: shared SoT + nb-writer-only
```

### ADR-006 obs rebuild 操作（若 xd-qh3d 決議納入，~150 行）

```
## 決策
納入 rebuild 為第四操作，**閹割版**（只結構 compile 不語意 compile）

## 限制
  ⛔ NEVER 產語意壓縮頁（no-DB 偏好）
  ⛔ NEVER 覆蓋 human wiki/ 內容（限定 wiki/_auto/）
  ⛔ NEVER 自動更新 index（產 proposal 人審）
  14d cooldown + 單次 ≤ 3 頁

## 產出
  wiki/_auto/<topic>-auto-compiled.md
  spec/討論/wiki-rebuild-YYYY-MM-DD.md（proposal）

## schema 升級 v2 → v2.1（patch）
```

### ADR-007 L1-L4 Agent Harness 統一 framework（~200 行）

```
## 決策
統一 Layer / 支柱矩陣定義，各層升降級規則明文化

## Layer 定義（見 rules/核心/深度路由.md 已有 L0-L4，本 ADR 擴充到 L4 完整覆蓋）
  L0 觀察層（metrics / telemetry）
  L1 反射層（hooks / guards，<100ms 反應）
  L2 判斷層（skills / rules 查表）
  L3 推理層（LLM call + context）
  L4 自驅層（reflection + evolution）
  L5 客製化層（novaplay / ai-media / block-world / discord-raffle）

## 三支柱 × L 矩陣
  （完整覆蓋度表）

## 升降級規則
  g4-26b → haiku → sonnet → opus（現有）
  L5 可用 g4-26b 起步（現有 rule）
  L0-L4 禁 g4-26b（現有）

## 缺口標記
  （依 state-of-nova.md 同步）
```

### ADR-008 feedback loop 完善策略（~150 行）

```
## 決策
補齊現有 loop 的 3 個缺口：drift detection / 反模式累積防護 / 跨 session 學習

## 現有 loop 盤點（見 state-of-nova.md）
## 缺口清單 + 補法
  缺口 1: drift detection → reflection 聚類偵測
  缺口 2: 反模式累積 → judge 歷史 trend tracking
  缺口 3: 跨 session 學習 → shared-memory.jsonl broadcast

## 補法 Phase 時程
```

---

## 六、`~/.claude/CLAUDE.md §Nova Blueprint` 擬案

本 Round 不直接修改 CLAUDE.md（等使用者簽核承載方向），但提擬案供 Round 3 審：

```markdown
## Nova Blueprint（L1-L4 Agent Harness Canonical Index）

> schema_version 1 / last_updated 2026-04-18

### 四能力閉環（sense → detect → fix → learn）

| 能力 | 角色 | 主要元件 | Phase |
|------|------|---------|------|
| 持久記憶 | sense | reflections + vault + shared-memory | P1 蒸餾自動化 |
| 斷鏈警告 | detect | chain-integrity + session-start inject | P1 |
| 自動恢復 | fix | reference-graph + auto-heal | P2 |
| 自我進化 | learn | resolver + PR draft | P2 |

### 三支柱 × L 矩陣（覆蓋度摘要）

| 層 | Guide | Sensor | Closed-Loop |
|---|-------|--------|------------|
| L0 metrics | - | autonomy-scan | - |
| L1 reflex | - | hooks/guards | - |
| L2 查表 | rules/skills | - | judge |
| L3 推理 | model-cascade | - | reviewer |
| L4 自驅 | - | - | reflection-loop |

### Pointer

- ADR-005 四能力閉環：`obsidian/semantic/architecture-decisions/ADR-005-*.md`
- ADR-006 obs rebuild：同上
- ADR-007 L1-L4 統一：同上
- ADR-008 feedback loop：同上
- state-of-nova（盤點）：`docs/state-of-nova.md`
- skills 目錄：`~/.claude/skills/`（procedural 層，非 ADR）
```

**規模**：約 25 行（不含 `## Nova Blueprint` 標題）。

---

## 七、給 Manager Round 3 / 使用者的 3 問

1. **承載方向選擇**（**最關鍵** — 影響後續工作）：
   - (a) nb 推薦：三層（CLAUDE.md index + state doc + 多 ADR）
   - (b) Manager 推薦：單一 ADR-006 Master Blueprint
   - (c) 折衷方案：CLAUDE.md blueprint 段寫結構化 overview + 多 ADR（達成「感知統一」）

2. **狀態盤點時程**：`docs/state-of-nova.md` 該由 nb 在 Round 3 起草，還是等使用者簽核後才起草？

3. **ADR 編號延續**：沿用 Manager 的 ADR-005+ 編號，還是重新從 ADR-003 開始（實際只有 ADR-001/002）？

---

## 八、Round 3 收斂預期

| 項 | nb 可動手 | 需使用者簽核 |
|---|---------|------------|
| 承載方向（三層 vs 單一）| ❌ | ✅ 必需 |
| ADR 編號 | ❌ | ✅ 確認 |
| state doc 起草 | 若使用者同意方向 (a)(c) 可開工 | 條件 |
| 各 ADR 完整草稿 | 使用者簽核後起草 | ✅ 必需 |

Round 3 nb 預計產出：依使用者選擇起草 **1 份** 產出（state doc 或 ADR-005 或 Master Blueprint），不全寫以避免白工。

---

## Backlinks

- Manager Round 1：`/Users/sbu/projects/nova-manager/spec/討論/新架構四能力藍圖-manager-round1.md`
- Manager Round 2：`/Users/sbu/projects/nova-manager/spec/討論/新架構四能力藍圖-manager-round2.md`
- nb Round 1（四能力）：`spec/討論/新架構四能力藍圖-nb-round1.md`
- nb Round 1（四操作）：`spec/討論/obsidian-四操作升級-nb-round1.md`
- skills ADR 範本：`~/.claude/skills/architecture/examples/adr-sample.md`
- rules/元件/元件治理.md（DRY 原則依據）

## Related

- rules/協作/討論式派發.md（nb 堅持專業判斷權）
- rules/協作/擁有者提交紀律.md（ADR 是 canonical runtime contract，需共識再 commit）
