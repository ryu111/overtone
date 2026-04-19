# DRAFT — ADR-003 Four Capabilities Closed Loop Architecture

**狀態**：draft / 等 Manager review + 使用者簽核後才 commit 到 canonical `~/.claude/obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md`

```yaml
adr_number: 003
title: Four Capabilities Closed Loop Architecture
status: proposed
date: 2026-04-18
authors: nova-brain (scope owner)
reviewers: [nova-manager, user]
supersedes: none
superseded_by: none
related_adrs: [001, 002, 004, 005, 006]
related_discussions:
  - spec/討論/新架構四能力藍圖-manager-round1.md
  - spec/討論/新架構四能力藍圖-nb-round1.md
  - spec/討論/新架構四能力藍圖-manager-round2.md
  - spec/討論/master-blueprint-nb-round2.md
  - spec/討論/master-blueprint-nb-round3.md
```

---

## Context

使用者 2026-04-18 指示「發揮新架構優勢，持久性記憶 / 自動恢復斷鏈 / 斷鏈警告 / 自我進化」後擴大為「統一跟清點 L1-L4 + feedback loop」。

Round 1-2 討論歷程發現：

1. **四能力並非獨立** — sense→detect→fix→learn 構成一條閉環
2. **Manager 初版 overclaim 已認帳** — chain-integrity.json 是 stub / memory unified 概念混淆 / resolver 已 73.6% 運作（非新建）
3. **承載方向** — 使用者 Round 3 裁決方向 (c)：CLAUDE.md §Blueprint 結構化 overview + 多 ADR 各鎖一決策 + state-of-nova.md 盤點

本 ADR 鎖定第一個決策：**四能力閉環架構**。

---

## Decision

### 1. 核心閉環（sense → detect → fix → learn）

```
  [能力 1 持久記憶] ← 累積原料（reflections + vault + shared-memory）
         ↓
  [能力 3 斷鏈警告] ← 偵測異常（chain-integrity + session-start inject）
         ↓
  [能力 2 自動恢復] ← 修復異常（reference-graph + auto-heal）
         ↓
  [能力 4 自我進化] ← 從修復案例學習，反饋為新 rule / skill
         ↓
     （回到能力 1，新 rule 被 ingest 進 semantic memory）
```

四能力**耦合耦合實作，不平行**。

### 2. 不新建 orchestrator 元件

用 cron schedule + 既有 hooks 組合串接閉環，**不** 新建 `nova-feedback-orchestrator` 類 god class。

### 3. Phase 劃分

| Phase | 能力 | 範圍 | 啟動條件 |
|:-----:|:----:|------|---------|
| **Phase 1** | 能力 3 + 能力 1 蒸餾自動化 | Quick win：斷鏈警告 + 週蒸餾 cron | 本 ADR 簽核 |
| **Phase 2** | 能力 2 + 能力 4 | 證據驅動：自動恢復 + PR draft | Phase 1 驗收 + Phase 0 baseline（W17-W21）完成 |

### 4. Auto / Semi-auto / 人審三層邊界

依 `rules/核心/深度路由.md`「確定性 → 程式碼 | 語意模糊 → AI | AI 也不確定 → 人類」：

| 層次 | 能力 2 自動恢復 | 能力 4 自我進化 |
|------|----------------|----------------|
| **全自動**（確定性）| file rename → grep + sed 更新直接引用；stub 檔補模板；同檔 24h 內 warning 去重 | 同類 reflection 數量達閾值 → 自動產 PR draft 檔（不 push）|
| **半自動**（AI 建議 + 人審）| wiki `[[target]]` 漂移 → AI 給 3 個相似候選由 Manager 選 | rule 熱區（修改 >10 次/週）→ AI 建議拆 skill 由使用者審 |
| **全人審**（強影響 / 不可逆）| 刪除檔 / 修改 rule 條款 / 合併 skill | 升降級 component lifecycle phase / 廢止 ADR |

**原則**：凡語意推斷必走 `model-cascade` skill 三層（Router → Contract → Executor），全自動只限「文字等價替換」。

### 5. Cross-session Broadcast 設計

使用者 non-negotiable「`~/.claude/` 唯一 SoT」**不衝突** broadcast：

- **broadcast = shared SoT read + per-session write override**（非 fork）
- **共用 SoT**：`~/.claude/data/shared-memory.jsonl`（新建）
- **寫入權**：沿用「`~/.claude/` 唯一 writer = nb」原則
- **session-specific**：各 session `projects/<cwd>/memory/` 保留
- **寫入路徑**：他 session 要分享 user preference → cross-dispatch nb → nb 寫共用 SoT

這**強化**了 non-negotiable，不是放寬。

### 6. 新元件清單（最小化）

| 元件 | 類型 | Phase | 理由 |
|------|------|:----:|------|
| `scripts/reference-graph.js` | 新 script | P2 | 能力 2 auto-heal 需要「誰引用誰」index，SRP 獨立不整進 chain-integrity |
| `hooks/modules/session-start-health.js` | 新 hook | P1 | 讀 chain-integrity.json + additionalContext 注入 session |
| `~/.claude/data/shared-memory.jsonl` | 新資料檔 | P2 | cross-session broadcast SoT |

### 7. 擴展現有元件清單

| 元件 | 擴展方向 | Phase |
|------|---------|:----:|
| `scripts/chain-integrity.js` | 加 launchd cron 定期跑 | P1 |
| `raw/reflections/YYYY-WNN-synthesis.md` 範本 | launchd 週日 cron 產出（baseline 4-6 週後）| P1 後段 |
| `hooks/modules/vault-broken-link-warner.js` | 加 auto-fix 當確定性可修時 | P2 |
| `hooks/modules/reflection-resolver-*.js` | 擴展產 PR draft（新 `reflection-resolver-pr-drafter.js`，本質屬家族）| P2 |

### 8. launchd Cron 清單（Phase 1 起 3 條）

| 項 | schedule | 命令 |
|---|---------|------|
| chain-integrity 定期掃 | 每 2h | `bun ~/.claude/scripts/chain-integrity.js --write-json` |
| reflection-resolver 掃 null | 每日 00:00 | `bun ~/.claude/scripts/reflection-resolver-batch.js` |
| 週蒸餾 synthesis | 週日 00:00（W17 起）| `bun ~/.claude/scripts/weekly-synthesis.js` |

plist 檔位置：`~/Library/LaunchAgents/nova.{name}.plist`，由 `scripts/launchd-setup.js` generator 統一管理。

macOS-only 暫不綁跨平台（Linux/WSL/CI fallback 未來需要再加 `cron-setup.js` abstraction）。

### 9. 不做的事（Scope Exclusion）

- ❌ 不引入 Mem0 / vector DB（使用者 no-DB 硬偏好）
- ❌ 不做 Karpathy LLM Wiki 語意壓縮（需 embedding）
- ❌ 不新建 orchestrator god class
- ❌ 不在 Phase 1 做能力 2/4（避免 over-engineer）
- ❌ obs rebuild 實作不在本 ADR（屬 ADR-004）
- ❌ L1-L4 framework 統一不在本 ADR（屬 ADR-005）
- ❌ feedback loop 缺口 drift detection 不在本 ADR（屬 ADR-006）

---

## Consequences

### Positive

- Phase 1 ROI 高：半天工作 + 1-2 天 baseline 準備 = 實測可見改善
- 閉環形式避免四能力各自為政
- 最小化新元件數（2 新 + 1 新資料檔），符合元件治理原則
- broadcast 設計強化 non-negotiable 而非放寬

### Negative / Trade-offs

- Phase 2 啟動依賴 Phase 1 驗收 + W17-W21 baseline → 最早 2026-W22 才能動手能力 2/4
- launchd macOS-only，未來跨平台時要補 abstraction layer
- 語意 compile（Karpathy 核心）放棄，Nova 永遠不做「文字自動摘要式進化」

### Neutral / 觀察項

- cron 頻率是否合適需 Phase 1 運行 2 週後調整
- reflection resolved 率 73.6% 是否維持需持續觀察（若掉到 < 60% 代表 resolver 卡住）

---

## Validation / Acceptance

### Phase 1 驗收標準

1. `launchd list | grep nova.chain-integrity` 顯示運作中
2. `~/.claude/data/chain-integrity.json` `generated_at` 非 null 且 < 2h 前
3. Session start 時，若 chain-integrity 有 broken refs → additionalContext 含該警告
4. `raw/reflections/2026-W17-synthesis.md` 非手動產出（檢查 git log author/time）
5. `bun test` 全綠，無 regression

### Phase 2 驗收標準

1. `~/.claude/data/reference-graph.json` 存在且含 incoming edges
2. 連續 7 天內 vault-broken-link-warner 至少觸發 1 次 auto-fix
3. reflection-resolver-pr-drafter 產出至少 1 份 PR draft（位於 `spec/待做/` 或 GitHub draft PR）
4. `~/.claude/data/shared-memory.jsonl` 存在，nb 是唯一 writer

---

## Alternatives Considered

### Alt 1 — 四能力各自獨立實作（Manager 初版風格）

拒絕原因：四能力耦合深，獨立做會走冤枉路（能力 2 依賴能力 3，能力 4 依賴能力 1）。

### Alt 2 — 單一 `nova-feedback-orchestrator` 元件

拒絕原因：god class 反模式。cron + 既有 hooks 組合已足夠。

### Alt 3 — 一步到位 Phase 1 全做四能力

拒絕原因：能力 2/4 需要能力 3/1 的資料基礎，強行並行會產生不穩定元件。

### Alt 4 — 納入 Karpathy 語意壓縮（embedding）

拒絕原因：使用者 no-DB 硬偏好 + markdown-first 偏好。永久放棄。

---

## Pointers

- `~/.claude/CLAUDE.md §Nova Blueprint`（canonical index）
- `docs/state-of-nova.md`（盤點 doc）
- ADR-004 obs rebuild（rebuild 細節從本 ADR 分離）
- ADR-005 L1-L4 統一（Layer framework 細節從本 ADR 分離）
- ADR-006 feedback loop（缺口補齊細節從本 ADR 分離）
- `rules/核心/深度路由.md`（auto/semi/人審三層判準來源）
- `rules/協作/討論式派發.md`（本 ADR 由 nb 主導起草的協作基礎）

---

## Change Log

- 2026-04-18 proposed（Round 3 裁決後起草）by nb
