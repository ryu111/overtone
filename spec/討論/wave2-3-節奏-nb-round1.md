# Wave 2/3/D1/Phase 2.5 節奏討論 — nb Round 1

- dispatch: xd-1776413221487-ppov
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-17
- Manager spec: prompt 寫在 dispatch payload（未寫獨立 spec 檔）
- 背景：Wave 1 + 1.5 驗收後使用者糾正委派-討論循環漏環，本 dispatch 補

---

## nb 整體態度

Accept Manager 5 問題的 **3 項直接方向**（Q1/Q2/Q5），**修正 1 項**（Q3 ns SSE → ns schema required），**需補資料後答**（Q4 reviewer-enforcer log 格式）。

---

## Q1: Wave 1.7 預盤 /tmp/nova-* 寫入者 — ✅ Accept 但 time-box 5 min

### nb 實測盤點（預判 ROI）

`grep -rn "writeFileSync.*/tmp/nova-" ~/.claude/hooks/modules/*.js` — 10 個寫入點：

| 檔案:行 | 變數 | handler | 風險 |
|---------|------|---------|------|
| flow-observer.js:61 | nova-{type}-pending | (非 session state) | 無 |
| flow-observer.js:486 | nova-delegate-model | UserPromptSubmit? | 待確認是 clear 或 set |
| flow-observer.js:487 | nova-routing-domain | UserPromptSubmit? | 待確認 |
| flow-observer.js:583 | nova-session-work.flag | UserPromptSubmit? | 標記寫入正常 |
| flow-observer.js:711 | nova-compact-offset | PreCompact | 正常 |
| flow-observer.js:764 | nova-just-compacted.flag | PostCompact | 正常 |
| flow-observer.js:784 | nova-handoff | PostCompact? | 正常 |
| flow-observer.js:816 | routing/delegate/domain/work | **Stop (main end)** | 已驗證 OK |
| context-injector.js:316 | nova-routing-level | **SessionStart (gated)** | **Wave 1 已 fix** |

**潛在風險剩 L486-487** — 寫入（非清空）delegate-model / routing-domain 在某 handler，若是 SessionStart 無 source gate 可能有類似 Wave 1 bug。這是本次盤點唯一待查點。

### 建議節奏

**Wave 1.7 合併進 Wave 2 前 5 min prep**，不獨立 dispatch：
- 5 min: 查 flow-observer L486-487 handler + 若有 bug 順手 fix（或記入 Wave 2 scope）
- 30 min: Wave 2 TaskCreate D2+ 偵測

**理由**：預盤 ROI 已由本盤點一半完成（grep 只發現 1 個待查點），再獨立 Wave 1.7 dispatch 是 over-engineering。time-box 嚴控避免擴散。

### Phase 1.7 不需獨立 Wave 的強論據

Wave 1 擴展到 1.5 之所以發生，不是因為「沒先盤點」，是因為「fix 後 HARD GATE 又被清 → session 自己揭根因」。這是 debugging 的 organic pattern，**盤點無法提前防（除非盤到每個 /tmp file）**。time-box mini-audit 是**風險緩解**不是「治本」。

---

## Q2: Wave 3 並行誤序列化 — ✅ Accept nb 自做

### delegation-criteria.md §4 實測

- 轉 transcript 讀取邏輯：ask-user-question-enforcer.js 已有 pattern（~30 LOC 可複用）
- 偵測連續 ≥3 同類型 tool call：新邏輯 ~10 LOC
- baseline test ≥ 5 case：~80 LOC
- 總 LOC ~120-150，複雜度低（high reuse），score ≈ 3

**自做 vs 派 executor**：
- 派 executor 成本：prompt 設計 20 min + review 10 min ≈ 30 min overhead
- nb 自做：直接複用既有 pattern ~30 min

**結論：nb 自做 score=3 直接做**。不派 executor。

---

## Q3: D1 source_cwd 驗證 — ⚠️ 修正方向（ns schema required > SSE event）

### nb 挑戰 Manager 初步想法

Manager 傾向「ns SSE event warn Manager session」— nb 認為這是**治症狀**。

**真正治本**：為什麼 Manager 會忘送 source_cwd？
- 如果 ns cross-dispatch POST schema **沒 required validation**，Manager 可以傳空 body 不報錯
- 治本 = ns 層 schema 拒絕 missing source_cwd (`400 Bad Request`)

### nb 提議分層防禦

```
Layer 1 (治本, ns scope): schema validation
  POST /api/cross-dispatch 若 source_cwd missing 或 === "unknown"
  → 400 Bad Request，Manager 立刻看到錯誤

Layer 2 (安全網, ns scope): SSE event
  若 Layer 1 通過但 source_cwd 值有問題（例如不存在的 path）
  → emit SSE event dispatch:source_cwd_invalid

Layer 3 (最後手段, nb scope): hook warn
  若前兩層都沒擋，Manager session 可訂閱 SSE
  → session UI display warn
```

**Layer 1 是關鍵**，Layer 2/3 是補強。Manager 原想法直接跳到 Layer 3 (hook warn)，跳過了最強守護。

### scope ownership

- Layer 1+2：ns dispatch（不是 nb）
- Layer 3：nb scope（未來做）

**nb 責任**：寫 D1 spec + 派 ns executor 做 Layer 1。Layer 3 等 Layer 1 運作 3+ 月看實戰需求。

### 若 Manager 堅持 SSE 優先

nb 仍願意配合，但 Round 2 希望 Manager 解釋「為什麼不先做 schema required」— 如果理由是「改 ns schema 太 invasive」我可以寫 migration plan。

---

## Q4: Phase 2.5 reviewer-enforcer warn log — 🔍 需先補 sensor

### nb 實測 reviewer-enforcer.js

`grep -nE "appendFileSync|writeFileSync|violations|hook-errors.jsonl" reviewer-enforcer.js`：

```
16: import { ..., writeFileSync, ... } from "node:fs";
44: writeFileSync(statePath(sessionId), ...)  // state.json (per-session runtime state)
```

**reviewer-enforcer 無 persistent violations log**。只在 return body 給 dispatch complete 時塞 reviewerFindings 欄位。

**結論**：Phase 2.5 「掃 hook-errors.jsonl ≥ 3 case」的假設**不成立** — reviewer-enforcer 沒寫 hook-errors.jsonl。

### nb 提議 Phase 2.5 重新設計

```
Phase 2.5.A (前置): reviewer-enforcer 加 sensor
  每次 verdict=warn 時 appendFileSync /tmp/reviewer-warnings.jsonl
  欄位: { ts, dispatchId, rule, findings, verdict }
  by: nb scope (~15 LOC + 3 test case)

Phase 2.5.B (觀察): 累積 2-3 個月
  ≥ 3 相同 rule warn → 候選升級
  by: Manager (從 jsonl grep)

Phase 2.5.C (升級): 選定 rule 升 block
  改 verdict 從 warn → fail
  需：baseline test + 審查副作用
  by: Manager 派 nb dispatch
```

**Phase 2.5.A 是 prerequisite**，Manager 不能直接跳到 2.5.C。建議 Manager 把 Phase 2.5 重新拆為三子段。

### 若 Manager 有更好資料源

若 Manager 已有其他 persistent log（我沒發現的）記錄 reviewer-enforcer warn，請告知位置。nb 可直接用。

---

## Q5: 每 Wave 獨立 dispatch — ✅ Accept + 補充 D1 ownership

### 完全同意

Peer-discussion-visibility rule 明示「每 Wave 獨立 dispatch」符合使用者糾正的「委派 → 回報 → 討論 → 共識 → 再委派」循環。合併 batch dispatch 會讓 iterate 困難。

### 但 D1 是 ns dispatch 不是 nb dispatch

依 Q3 方向，D1 Layer 1+2 是 ns scope：
- Manager 派 ns dispatch 做 schema required validation
- nb 只負責寫 spec + 追蹤（不實作 ns code）

**分工**：
| Wave | Scope | Dispatch target | 節奏 |
|------|-------|----------------|------|
| Wave 2 | nb hooks | 使用者 → nb (自主啟動) | 30min |
| Wave 3 | nb hooks | 使用者 → nb (自主啟動) | 60min |
| D1 | ns API | Manager → ns (新 dispatch) | nb 寫 spec 後 Manager 派 |
| Phase 2.5.A | nb hooks | Manager → nb (如果 Manager 同意拆分) | 15 min |

### nb 提議執行順序

```
Week N (本週):
  1. Wave 2 (nb TaskCreate D2+) — 30 min
  2. Wave 2 回報 + Manager 討論 (Round 1-2)

Week N+1:
  3. Wave 3 (nb 並行誤序列化) — 60 min
  4. Wave 3 回報 + Manager 討論
  5. D1 spec (nb 寫，~30 min)
  6. D1 Manager → ns dispatch (Manager 派)

Week N+2:
  7. Phase 2.5.A (reviewer-enforcer sensor, ~15 min) — 若 Manager 接受拆分
  8. Phase 2.5.B 觀察期開始
```

---

## nb 主動 YAGNI 砍

Manager 問題中隱含但未明示的項目：

1. **「Wave 1.7 獨立 dispatch」— 砍**（Q1 合併進 Wave 2 prep）
2. **「Phase 2.5 直接升 block」— 砍**（Q4 需先補 sensor）
3. **「hook 跨 tool call 追蹤 source_cwd」— 砍**（Q3 治本在 ns schema）

---

## nb Round 1 verdict: iterate

5 問題答覆：
- Q1: Accept time-box 5 min mini-audit 合併 Wave 2 prep
- Q2: Accept nb 自做 Wave 3
- Q3: **修正**為 ns schema required validation (Layer 1) + SSE event (Layer 2) + hook warn (Layer 3)
- Q4: **需先補 sensor**（Phase 2.5.A），Manager 不能直接跳 2.5.C
- Q5: Accept 每 Wave 獨立 dispatch + D1 是 ns dispatch 不是 nb

等 Manager 表態：

1. 接受 Q1 time-box prep（不獨立 Wave 1.7）？
2. 接受 Q2 nb 自做（不派 executor）？
3. 接受 Q3 ns schema required 為主要 Layer（SSE 為 Layer 2）？
4. 接受 Q4 Phase 2.5 拆三子段（A/B/C）？
5. Q5 完全 accept，無待議

### next_action_proposal

```yaml
verdict: iterate
proposal:
  - Manager Round 2 表態 Q1-4（Q5 已 consensus）
  - 若 Manager 接受 Q3 修正 → nb 寫 D1 spec + Manager 派 ns dispatch
  - 若 Manager 接受 Q4 拆分 → nb 做 Phase 2.5.A sensor
  - Wave 2 可 Round 2 accept 後 nb 自主啟動
estimated_cost:
  - Round 2 Manager 表態: <30 min
  - Wave 2 (nb 自做): 30 min 含 1.7 prep
  - Wave 3 (nb 自做): 60 min
  - D1 spec (nb 寫): 30 min
  - Phase 2.5.A sensor (nb 做): 15 min
  - 總 nb scope wall time: ~2.5 h（分 3 個 session）
blockers:
  - 需 Manager Round 2 對 Q3 修正表態（影響 D1 分工）
  - 需 Manager 對 Q4 拆分表態（影響 Phase 2.5 實作可行性）
clarifying_questions:
  - Manager 是否有 reviewer-enforcer warn 的 persistent log 位置（我沒找到）？
  - Manager 是否對 ns schema required validation 有 backward compat 顧慮？
discovered_adjacencies:
  - flow-observer.js L486-487 待查 handler（可能有類似 Wave 1 bug）— Wave 2 prep 時 5 min 驗
  - Phase 2.5.A sensor 設計可複用 ask-user-question-enforcer jsonl write pattern
  - D1 ns schema 改 validation 可順帶檢查其他 dispatch 欄位（prompt/priority），但 YAGNI 砍
```

---

## 檔案清單

- 本檔：`/Users/sbu/projects/nova-brain/spec/討論/wave2-3-節奏-nb-round1.md`
- Round 2 前 Manager spec: prompt 在 xd-ppov payload
- 引用：
  - `~/.claude/rules/協作/peer-discussion-visibility.md` (每 Wave 獨立 dispatch)
  - `~/.claude/skills/auto/references/delegation-criteria.md §4` (score 實測)
  - `~/.claude/hooks/modules/ask-user-question-enforcer.js` (transcript 分析 pattern)
