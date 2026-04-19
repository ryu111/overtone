---
title: ADR-013 Phase 1 MVP — obi × harness 自動閉環（v2 iterate）
authored_by: nova-brain
created: 2026-04-20
updated: 2026-04-20 (v2 after nm Round 3 review)
type: spec
status: draft-v2
parent_adr: ADR-013-obi-harness-integration
peer_consensus:
  round_2: nm 5/5 accept (xd-ix5a + xd-7fzt crossed-over)
  round_3_review: nm iterate verdict (xd-30ia, spec/討論/ADR-013-phase-1-mvp-nm-round3-review.md)
  round_4_iterate: v2 接受 Issue 1/2/3/5 + 附帶 T10/T7 migration；Issue 4 部分（方案調 A+C 混合 + 獨立 mini spec）
depth: D2
related:
  - obsidian/semantic/architecture-decisions/ADR-013-obi-harness-integration.md
  - rules/核心/自驅反思.md
  - rules/品質/完成與閉環.md
  - rules/元件/Hook紀律.md
  - obsidian/episodic/incidents/stop-hook-verification-detection-too-narrow.md
---

# ADR-013 Phase 1 MVP Spec（v2）

## Scope（v2 修訂）

只做 **P1 + P2 + T1 lib + sensor baseline**（YAGNI 砍 T2 + P3/P4/P5）。

### 包含
1. **P1 incident auto-draft**（Stop hook trigger → **從 hook input 直接讀當輪 reflection segment**，不依賴 jsonl race）
2. **P2 rule-incident evidence**（arch test 4 describe 含 rename drift）
3. **T1 keyword-extractor lib**（只此一個 lib，T2 signal-counter 砍）
4. **回退 Type 2 副產品 + migration check**
5. **T8/T9 Top Violations sensor baseline**（Phase 2 P3 ROI 量化前提）
6. **T10 LOCAL_MODULES wire**（明示任務）

### 不包含（獨立 mini spec）
- Stop hook 驗收偵測過窄 fix — 見 `obsidian/episodic/incidents/stop-hook-verification-detection-too-narrow.md` 推方案 A+C 混合。Round 3 Issue 4 accept：非 Phase 1 scope。

### 不包含（Phase 2/3）
- P3 Top Violations auto-propose（Phase 2，等 T8/T9 snapshot 對比後決）
- P4 raw→episodic 蒸餾 cron（Phase 3a）
- P5 3+ scope embedding 偵測（Phase 3b，依賴 ADR-012 sub3）
- 回退 Type 1 / Type 3（Phase 2/3）

### 砍除（v2）
- ~~T2 signal-counter lib~~ — Round 3 Issue 2 accept：T3 只用 time-based dedup（24h 內有無同 topic incident），不需 counter。P3 需要時 Phase 2 再建。

## 實作任務清單（v2 — 10 T）

### T1: `scripts/lib/keyword-extractor.js`
- 功能：接收 text + keyword regex list → 回傳 match 結果
- 匯出：`extractKeywords(text, patterns): {keyword, match, index}[]`
- 消費者：T3 Stop hook（只此一個，YAGNI）
- **test** (3)：normal match + **quoted-keyword 反向**（keyword 在 string literal 內非根因，不 match）+ empty patterns 邊界

### T2: ~~signal-counter lib~~ — 砍（Round 3 Issue 2）

### T3: `hooks/modules/incident-auto-draft.js` (P1)
- 觸發：`on: { Stop: evaluate }`
- **時序保證**（Round 3 Issue 1）：
  - **不讀** `data/reflections.jsonl`（reflection-persist.js 同樣 Stop handler，order 未定）
  - **直接從 hook input 讀** `transcript` 或 `last_response` 段
  - 從 input 抽取 `## Insight` 章節（summary 格式 SoT）→ 文字 → extractKeywords
- 邏輯：
  1. 從 hook input 抽 last response insight text
  2. extractKeywords with config/incident-triggers.json patterns
  3. 24h time-based dedup：`glob obsidian/episodic/incidents/{topic}-*.md` + 檢 mtime
  4. match + 24h 無現有 → 生 `{topic}-DRAFT-YYYY-MM-DD.md`
- DRAFT 檔 frontmatter：
  ```yaml
  status: draft
  auto_generated: true
  dispatch_eligible: false  # ralph-loop 白名單豁免
  trigger_transcript_hash: ...  # 對應 hook input 的 hash（非 jsonl ts）
  ```
- **test** (4)：normal trigger + 24h dedup skip + no root cause skip + **input 讀取順序獨立於 reflection-persist handler order**（mock 兩 handler order 不影響結果）

### T4: `config/incident-triggers.json`
- keyword 清單 SoT（`第 \d+ 次` / `dogfood` / `drift` / `結構性` / `規避` / `繞過`）
- schema：`{ patterns: string[], _rationale: string }`
- **test**: architecture.test.js schema 守護（T5 Case 4 一部分）

### T5: `tests/unit/architecture.test.js` 加 P2 describe（4 case v2 擴）
- Case 1：rule 引用 `incidents/xd-XXXX` 或 `incidents/YYYY.md` → 檔必存在
- Case 2：incident `upgraded_to: rules/X.md` → rule 必 grep keyword
- Case 3：rule 引用 `obsidian/semantic/...` → 檔存在
- Case 4（**v2 新，Round 3 Issue 3**）：**rename drift** — 掃近 30 天 git log `--name-status R*` 重命名，若 rule/incident 引用舊名 → fail
- 初期全 warn，Phase 1 驗收後升 block

### T6: DRAFT 檔 7 天 stale guard（+ 邊界 test）
- architecture.test.js case：`episodic/incidents/*-DRAFT-*.md` mtime > 7d → fail
- **test** (3)：7d+1s fail + 6d+23h 邊界綠 + fresh（<1h）綠

### T7: 回退 Type 2 + migration check（Round 3 附帶）
- incident frontmatter `upgraded_to: rules/X.md | null`
- 回退 = 手動改 `null` → T5 Case 2 重新驗證
- **migration** (Round 3 附帶)：掃現有 `episodic/incidents/*.md` → 若缺 `upgraded_to` key → 補 `upgraded_to: null`
- **test** (2)：migration idempotent + rollback revert check

### T8: Top Violations baseline snapshot（Round 3 Issue 5 — before Phase 1）
- 一次性 snapshot 寫 `data/phase-1-baseline/top-violations-YYYY-MM-DD.json`
- schema：`{ snapshot_ts, violations: {id, count, last_seen}[] }`
- 執行時機：Phase 1 實作**啟動前第一動作**（T1 實作前）

### T9: T8 snapshot arch test 守護（Round 3 Issue 5 — after Phase 1）
- architecture.test.js case：`data/phase-1-baseline/` 目錄存在 + 至少 1 snapshot 檔
- Phase 1 完成後 2 週重取 second snapshot → 跟 baseline diff 決定 P3 進退
- **test**: 無新 unit test，靠 arch test 守護存在性

### T10: LOCAL_MODULES wire（Round 3 附帶）
- `hooks/hook-client.js` 加 `"Stop": "incident-auto-draft"` 進 LOCAL_MODULES
- **test**: 無新 unit test（架構已有 `hooks/modules/ 接線完整性` arch test 自動守護）

## 驗收清單（v2 test-first 硬條款 — 17 test）

- [ ] T1 keyword-extractor: 3 unit test pass（+quoted-keyword 反向）
- [x] ~~T2 signal-counter~~: 砍
- [ ] T3 incident-auto-draft hook: 4 unit test pass（+input read order 獨立）
- [ ] T4 config schema: arch test 守護 pass
- [ ] T5 P2 arch test 4 case: 全綠（含 rename drift）
- [ ] T6 DRAFT 7 天 stale: 3 unit test pass（邊界 + 邊界綠 + fresh）
- [ ] T7 回退 + migration: 2 unit test pass
- [ ] T8 baseline snapshot: 啟動前第一動作 commit
- [ ] T9 arch test 守護: 存在性 pass
- [ ] T10 LOCAL_MODULES wire + architecture test「接線完整性」pass
- [ ] 實機觸發：Stop hook 收到 fake insight text → 24h 內 DRAFT 檔存在
- [ ] 不退步：nb arch test（596+N）pass 0 fail / E2E 5 pass
- [ ] commit message 含 Phase 1 標籤 + 17 test 覆蓋表
- [ ] ⛔ NEVER 任一 T 缺 test 就 commit

**Test 總計**：3 + 4 + 3 + 2 = 12 unit test + 5 arch test case = **17 test**（符合 Round 3 Issue 3 要求）

## 風險緩解（v2）

| 風險 | 緩解 |
|---|---|
| keyword over-match | T4 config SoT 可調 + T6 7d stale fail triggers 調整 |
| T3 handler order race | 從 hook input 直接讀（不依賴 jsonl），T3 test 4 明示驗證 |
| DRAFT 雜訊 | T6 7d stale + `dispatch_eligible: false` |
| Phase 1 scope 膨脹 | 10 T 獨立 gate，T8 必為第一動作 |
| rename drift 回歸 | T5 Case 4 每次 arch test 跑 git log |
| T1 lib over-abstraction | 只此一個消費者 T3，Phase 2 P3 擴消費才固化 |

## Phase 1 完成定義（v2）

- 10 T checkbox 全綠（T2 已砍）
- ≥ 17 test（12 unit + 5 arch case）
- T8 snapshot 作為 Phase 2 P3 ROI 量化基準
- 使用者 gate approve 進 Phase 2 前：
  - Phase 1 已上線 ≥ 2 週
  - 讀取 T9 arch test case 產 `data/phase-1-after/` second snapshot
  - diff baseline：`new_incident_count`, `violation_trend`, `rule_rename_caught` 三指標判決

## 下一步動作

1. nb 本 v2 spec commit
2. Round 4 peer dispatch 給 nm → approve 後啟 T8（baseline snapshot 第一動作）
3. T8 完成 commit → 依序 T1/T3/T4/T5/T6/T7/T9/T10
4. 17 test + 實機觸發驗收 → 升 ADR-013 status `proposed-draft` → `proposed`
5. Phase 2 gate：2 週後 snapshot diff 決 P3 進退

## Round 3 Issue → v2 對照

| Issue | v2 action | 位置 |
|---|---|---|
| #1 BLOCK handler order | T3 改從 hook input 直接讀，加 test 4 | T3 + 風險緩解 |
| #2 BLOCK 砍 T2 | T2 刪除，T3 time-based dedup | T2 ~~砍~~ + T3 |
| #3 WARN test 10→17 | 擴 T1/T3/T6/T7 case + T5 case 4 | 驗收清單 |
| #4 WARN 方案 B 推 A+C 混合 | 獨立 mini spec，非 Phase 1 scope | Scope §不包含 |
| #5 SUGGEST sensor metric | 新 T8（baseline）+ T9（arch 守護）| T8/T9 |
| 附帶 LOCAL_MODULES | 新 T10 | T10 |
| 附帶 migration check | T7 擴 migration case | T7 |

## Backlinks

- [ADR-013](../../obsidian/semantic/architecture-decisions/ADR-013-obi-harness-integration.md)
- [nm Round 1](~/projects/nova-manager/spec/討論/ADR-013-obi-harness-integration-nm-round1.md)
- [nm Round 3 review](~/projects/nova-manager/spec/討論/ADR-013-phase-1-mvp-nm-round3-review.md)
- [業界對標](../../obsidian/semantic/external-references/agent-self-improvement-memory-integration-2026.md)
- [Stop hook 驗收偵測 incident（Issue 4 獨立 scope）](../../obsidian/episodic/incidents/stop-hook-verification-detection-too-narrow.md)
