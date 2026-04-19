---
title: ADR-013 Phase 1 MVP — obi × harness 自動閉環
authored_by: nova-brain
created: 2026-04-20
type: spec
status: draft
parent_adr: ADR-013-obi-harness-integration
peer_consensus: nm 5/5 accept (xd-ix5a Round 2 + xd-7fzt Round 2 crossed-over)
depth: D2
related:
  - obsidian/semantic/architecture-decisions/ADR-013-obi-harness-integration.md
  - rules/核心/自驅反思.md
  - rules/品質/完成與閉環.md
  - rules/元件/Hook紀律.md
---

# ADR-013 Phase 1 MVP Spec

## Scope

只做 **P1 + P2 + 共用 lib**（YAGNI 砍 P3/P4/P5 到 Phase 2/3 觀察）。

### 包含
1. **P1 incident auto-draft**（Stop hook trigger → reflection 根因偵測 → DRAFT incident 檔）
2. **P2 rule-incident evidence**（arch test 3 describe 守護引用一致性）
3. **共用 infra**（只在 P1 有直接消費者時才建 — signal-counter.js + keyword-extractor.js）
4. **回退 Type 2 副產品**（incident status rollback — upgraded_to marker revert）

### 不包含（Phase 2/3）
- P3 Top Violations auto-propose（Phase 2，觀察 2 週 ROI 再決）
- P4 raw→episodic 蒸餾 cron（Phase 3a）
- P5 3+ scope embedding 偵測（Phase 3b，依賴 ADR-012 sub3）
- 回退 Type 1（rule/hook git revert helper — Phase 2）
- 回退 Type 3（harness snapshot rollback — Phase 3 bonus）

## 實作任務清單

### T1: `scripts/lib/keyword-extractor.js`
- 功能：接收 text + keyword regex list → 回傳 match 結果（keyword + matched text + position）
- 匯出：`extractKeywords(text, patterns): {keyword, match, index}[]`
- 消費者：P1 Stop hook（偵測 reflection 根因 keyword）+ 未來 dispatch-canonical-selfcheck
- **test**: unit test ≥ 2（match 成功 + empty list 邊界）

### T2: `scripts/lib/signal-counter.js`
- 功能：counter state read/write（file-based，`data/signal-counter.jsonl` append）
- 匯出：`incrementSignal(key, metadata)`, `getSignalCount(key, windowDays)`
- 消費者：P1（incident 重複 trigger 計數）+ 未來 P3（violation count）
- **只在 P1 有直接消費者時才建** — 若 P1 最終不需 counter（例如 Stop hook 直接寫 draft 不 debounce）→ 不建
- **test**: unit test ≥ 2（write/read round-trip + window filter）

### T3: `hooks/modules/incident-auto-draft.js` (P1)
- 觸發：`on: { Stop: evaluate }`
- 邏輯：
  1. 讀當輪 reflection（從 `data/reflections.jsonl` 最後一筆）
  2. extractKeywords on `結論` + `行動` 欄位
  3. match keyword 清單（可由 `config/incident-triggers.json` SoT 控）：
     - `第 \d+ 次` / `dogfood` / `drift` / `結構性` / `規避` / `繞過`
  4. match 且 24h 內無對應 topic 的 incident → 生 `obsidian/episodic/incidents/{topic}-DRAFT-YYYY-MM-DD.md`
- DRAFT 檔 frontmatter：
  ```yaml
  status: draft
  auto_generated: true
  dispatch_eligible: false  # ralph-loop 白名單豁免（Q5 共識）
  trigger_reflection_ts: ...
  ```
- **test**: unit test ≥ 3（keyword match 成功觸發 write / 24h 內已有 incident → skip / reflection 無根因 → skip）

### T4: `config/incident-triggers.json`
- keyword 清單 SoT，供 T3 讀取
- schema：`{ patterns: string[], _rationale: string }`
- **test**: architecture.test.js 加 schema 守護

### T5: `tests/unit/architecture.test.js` 加 P2 describe (3 case)
- Case 1：rule 引用 `incidents/xd-XXXX` 路徑 → 檔必存在
- Case 2：incident `upgraded_to: rules/X.md` → rule 必 grep keyword
- Case 3：rule 引用 `obsidian/semantic/...` → 檔存在
- **初期 warn，Phase 1 驗收穩定後升 block**

### T6: DRAFT 檔 7 天 stale guard
- architecture.test.js 加 case：`episodic/incidents/*-DRAFT-*.md` 超過 7 天 → fail
- 或 SessionStart hook 提醒 finalize（二選一，傾向 arch test）

### T7: 回退 Type 2 副產品（輕量）
- incident frontmatter 加 `upgraded_to: rules/X.md | null` 欄位
- 回退 = 手動改 `upgraded_to: null` → arch test case 2 重新驗證
- 無新程式碼，只加約定 + arch test coverage

## 驗收清單（test-first 硬條款）

- [ ] T1 keyword-extractor: ≥ 2 unit test pass
- [ ] T2 signal-counter: ≥ 2 unit test pass（若建）
- [ ] T3 incident-auto-draft hook: ≥ 3 unit test pass
- [ ] T4 config schema: arch test 守護 pass
- [ ] T5 P2 arch test 3 describe: 現有 rule/incident 引用全綠
- [ ] T6 DRAFT 7 天 stale guard: fixture test pass
- [ ] LOCAL_MODULES wire：hook-client.js 加 `incident-auto-draft.js`
- [ ] 實機觸發：人為 append fake reflection 到 reflections.jsonl → Stop hook → 24h 內 DRAFT 檔存在
- [ ] 不退步：nb arch test 596+N pass 0 fail / E2E 5 pass
- [ ] commit message 含 Phase 1 標籤 + 測試覆蓋表
- [ ] ⛔ NEVER 任一 T 缺 test 就 commit（xd-k6zj + xd-vy1m 2 連敗教訓）

## 風險緩解

| 風險 | 緩解 |
|---|---|
| keyword 清單 over-match 誤創 incident | `config/incident-triggers.json` SoT，人工可調；DRAFT 檔 7 天未 finalize → fail 觸發調 keyword |
| signal-counter lib 過度抽象 | 只在 T2 有 ≥ 2 直接消費者時才建；否則 T3 硬編 counter |
| DRAFT 檔累積雜訊 | T6 7 天 stale guard + T3 dispatch_eligible: false 避免誤自驅 |
| Phase 1 scope 膨脹 | 每個 T 獨立驗收 gate，T1-T6 任一 fail 不進 T7 |

## Phase 1 完成定義

- 8 個 checkbox 全綠
- ≥ 10 unit test（T1=2 + T2=2 + T3=3 + T5=3 + T6=1 at least）
- Phase 1 driver-commit 附測試覆蓋表 + commit message 明示驗收
- 使用者 approve 進 Phase 2 前 pause 觀察 2 週 P3 ROI

## 下一步動作

1. nb 此 spec draft → commit obsidian/spec/進行中/
2. nm（可選）review spec 回報 iteration
3. 使用者 gate approve 後啟動 T1-T7 實作
4. Phase 1 完成 commit → 升 ADR-013 status `proposed-draft` → `proposed`

## Backlinks

- [ADR-013](../../obsidian/semantic/architecture-decisions/ADR-013-obi-harness-integration.md)
- [nm Round 1 挑戰](~/projects/nova-manager/spec/討論/ADR-013-obi-harness-integration-nm-round1.md)
- [業界對標 external-ref](../../obsidian/semantic/external-references/agent-self-improvement-memory-integration-2026.md)
