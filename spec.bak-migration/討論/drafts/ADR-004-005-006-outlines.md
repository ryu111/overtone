# DRAFT — ADR-004/005/006 Outlines

**狀態**：draft / 先佔位 bullet 綱要，後續 Phase 實作前各自展開完整 ADR
**目的**：使用者裁決「多 ADR 各鎖一決策」後，先把 004/005/006 標題與主決策點列清楚，避免遺忘

---

## ADR-004 Obs Rebuild Operation（rebuild 閹割版併入 obs schema）

```yaml
adr_number: 004
title: Obsidian Vault Rebuild Operation (Structural-Only)
status: proposed
date: 2026-04-18
supersedes: none
related_adrs: [001, 003]
related_discussions:
  - spec/討論/obsidian-四操作升級-manager-round1.md
  - spec/討論/obsidian-四操作升級-nb-round1.md
  - spec/討論/obsidian-四操作升級-manager-round2.md
```

### Context（1 段）

使用者明示 markdown-first + no-DB，排除 Karpathy 語意壓縮核心。rebuild 作為 obs/CLAUDE.md 第 4 操作納入但限定結構性範圍。

### 主決策點（bullet）

- 閹割版 rebuild：**只結構 compile，不語意 compile**
- 產出限定 `wiki/_auto/<topic>-auto-compiled.md`（不覆蓋 human-authored wiki/）
- 產 `spec/討論/wiki-rebuild-YYYY-MM-DD.md` proposal 人審（不自動改 MEMORY.md / Index）
- 14d cooldown + 單次 compile ≤ 3 頁（防 thrash + 品質飄移）
- schema_version v2 → v2.1（patch，非 v3）
- 觸發：週日 cron + reflections >20 條 OR 新 ADR OR 新 incident
- Phase 0 baseline（2026-W17-W21）手動週蒸餾累積
- Phase 1 半自動 rebuild（AI draft + Manager 審）
- Phase 2 視 Phase 1 通過率決定全自動範圍（< 50% 降頻升閾值）

### 不做

- ❌ 不引 embedding / vector DB
- ❌ 不覆蓋 human wiki/ 內容
- ❌ 不自動改 MEMORY.md / 索引

### Acceptance（Phase 1）

- `scripts/vault-rebuild.js` 可手動觸發產 `_auto/` + proposal 檔
- Manager 通過率 ≥ 50%（否則降頻）
- obs/CLAUDE.md schema_version 標 2.1

---

## ADR-005 L1-L4 Agent Harness Unification（Layer framework 明文化）

```yaml
adr_number: 005
title: L1-L4 Agent Harness Unification
status: proposed
date: 2026-04-18
supersedes: none
related_adrs: [003]
```

### Context（1 段）

現有 `rules/核心/深度路由.md` 已定義 L0-L5，但三支柱（Guide/Sensor/Closed-Loop）× L 矩陣無明文 canonical 文件。本 ADR 把 `docs/state-of-nova.md` 的矩陣升級為 canonical framework。

### 主決策點（bullet）

- L0 觀察 / L1 反射 / L2 查表 / L3 推理 / L4 自驅（現有）+ L5 客製化（現有，out-of-scope）
- 三支柱 × L 矩陣定義每格「該有什麼類型元件」
- 升降級規則統一：g4-26b → haiku → sonnet → opus，L0-L4 禁 g4-26b，L5 例外（現有 rule，本 ADR 鎖）
- 各層反應時間 SLO 明示：L1 <100ms / L2 <1s / L3 1-60s / L4 分鐘-小時
- 缺口標記同步 `docs/state-of-nova.md`
- skill/rule/hook 新建前必定位到某層 × 某支柱（含 frontmatter `harness_pillar`）
- harness pillar 守護：rules/核心/agent-harness.md 已有，本 ADR 升為 canonical

### 不做

- ❌ 不改 L0-L5 定義（沿用現有）
- ❌ 不動 L5 客製化層（各專案自管）

### Acceptance

- 每個新元件（rule/skill/hook）PR 必含 harness_pillar 欄位
- `bun tests/unit/architecture.test.js` 驗所有現有元件皆有 pillar 歸屬

---

## ADR-006 Feedback Loop Completeness（缺口補齊策略）

```yaml
adr_number: 006
title: Feedback Loop Completeness - 3 Gap Closure
status: proposed
date: 2026-04-18
supersedes: none
related_adrs: [003, 005]
```

### Context（1 段）

ADR-003 定義四能力閉環，但閉環能否穩定運作依賴 3 個缺口補齊：drift detection / 反模式累積防護 / 跨 session 學習。本 ADR 鎖定這 3 個 gap 的補法。

### 主決策點（bullet）

**Gap 1: Drift Detection**
- reflection 聚類偵測：連續 7 天出現同類 reflection 3+ 次 → flag drift
- 元件：新 `scripts/reflection-cluster-detector.js`
- Phase: P2

**Gap 2: 反模式累積防護**
- judge 歷史 trend tracking：元件分數連續 3 週下降 > 10 points → 自動 dispatch 改進
- 元件：擴展既有 `skill-judge` + 新 `scripts/component-trend-tracker.js`
- Phase: P2

**Gap 3: 跨 Session 學習**
- `~/.claude/data/shared-memory.jsonl` 已在 ADR-003 定義
- 本 ADR 補：讀取協議（nb 啟動時讀 + 寫入權白名單）
- 元件：擴展 hooks/modules/context-injector.js
- Phase: P2

### 不做

- ❌ 不做 GitHub PR 自動 merge（永遠人審）
- ❌ 不做 rule 自動修改（drift 只 flag 不動手）
- ❌ 不做使用者偏好自動學習（user memory 仍使用者主動說才記）

### Acceptance

- `scripts/reflection-cluster-detector.js` 每日跑，有 drift 時 emit event
- 連續 2 週 judge 追蹤報告產出（`data/judge-trend.jsonl`）
- shared-memory.jsonl 有寫入規則 guard（nb 以外 session 寫入即 block）

---

## Cross-ADR 依賴圖

```
ADR-003 (four capabilities closed loop)
   ├─ 依賴 ADR-001 (vault upgrade)
   ├─ 依賴 ADR-005 (L1-L4 pillar framework，本來就要有)
   └─ 提供 Phase 1/2 基礎給 ADR-004 / ADR-006

ADR-004 (obs rebuild)
   ├─ 依賴 ADR-001 (vault structure)
   └─ 依賴 ADR-003 (能力 4 子機制)

ADR-005 (L1-L4 harness)
   └─ 獨立（framework level）

ADR-006 (feedback loop gaps)
   ├─ 依賴 ADR-003 (閉環存在)
   └─ 依賴 ADR-005 (pillar framework 分類缺口)
```

**建議簽核順序**：ADR-003 → ADR-005 → ADR-004 → ADR-006（先框架後細節）

---

## Pointers

- ADR-003（完整 draft）：`spec/討論/drafts/ADR-003-four-capabilities-closed-loop.md`
- state-of-nova（缺口清單同步）：`spec/討論/drafts/docs-state-of-nova.md`
- CLAUDE.md §Nova Blueprint：`spec/討論/drafts/CLAUDE.md-nova-blueprint-section.md`
- Round 3 討論：`spec/討論/master-blueprint-nb-round3.md`
