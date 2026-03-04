# Standard Workflow 完整執行軌跡

> 以 `level2-integration-phase2` feature 為範例，展示 standard workflow 的完整執行過程。

## Feature 概述

- **featureName**: `level2-integration-phase2`
- **workflowType**: `standard`
- **stages**: `PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → RETRO → DOCS`
- **parallelGroups**: `['quality']`（REVIEW + TEST 並行）

---

## 階段 1：PLAN（📋 planner）

委派 planner 分析需求，分解子任務並確認優先順序。

```jsonl
{"event":"stage:start","stage":"PLAN","agent":"planner","ts":"2026-03-03T10:00:00.000Z"}
{"event":"stage:complete","stage":"PLAN","result":"pass","ts":"2026-03-03T10:03:22.000Z"}
```

**Handoff 摘要**：planner → architect
- **Findings**：需求分解為 4 個子任務，全部可並行（操作不同檔案、無邏輯依賴）
- **Open Questions**：registry-data.json 修改路徑是否有 guard 限制？

---

## 階段 2：ARCH（🏗️ architect）

委派 architect 設計技術方案，帶入 planner 的 Handoff。

```jsonl
{"event":"stage:start","stage":"ARCH","agent":"architect","ts":"2026-03-03T10:04:00.000Z"}
{"event":"stage:complete","stage":"ARCH","result":"pass","ts":"2026-03-03T10:08:15.000Z"}
```

**Handoff 摘要**：architect → tester
- **Findings**：子任務 1+2 合併（manage-component.js），score context 加入 agentName，grader 強制化清單
- **Files Modified**：（無 — 設計分析）

---

## 階段 3：TEST:spec（🧪 tester — 規格模式）

BDD 規則：standard workflow 含 PLAN/ARCH，在 DEV 前自動插入 TEST:spec。

```jsonl
{"event":"stage:start","stage":"TEST","stageKey":"TEST:spec","agent":"tester","ts":"2026-03-03T10:09:00.000Z"}
{"event":"stage:complete","stage":"TEST","stageKey":"TEST:spec","result":"pass","ts":"2026-03-03T10:12:40.000Z"}
```

> `stageKey` 帶有 `:spec` 後綴，與後續的 `TEST:verify` 區分。同一個 tester agent，spec 模式撰寫測試規格，verify 模式驗證實作。

---

## 階段 4：DEV（💻 developer）

委派 developer，帶入 architect + tester(spec) 兩份 Handoff。

```jsonl
{"event":"stage:start","stage":"DEV","agent":"developer","ts":"2026-03-03T10:13:00.000Z"}
{"event":"stage:complete","stage":"DEV","result":"pass","ts":"2026-03-03T10:25:30.000Z"}
```

**Handoff 摘要**：developer → code-reviewer / tester
- **Findings**：bun test 3047 pass / 0 fail，所有 BDD scenario 對應測試已建立
- **Files Modified**：8 個檔案（5 個 agent .md、registry-data.json、pre-task.js、stop-message-builder.js）

---

## 階段 5：[REVIEW + TEST:verify] 並行群組

### 並行觸發

`quality` 群組成員 `['REVIEW', 'TEST']` 在 DEV 完成後觸發。Main Agent 在**同一訊息**中同時委派 code-reviewer 和 tester(verify)。

### 第一輪結果：REVIEW REJECT

```jsonl
{"event":"stage:start","stage":"REVIEW","agent":"code-reviewer","ts":"2026-03-03T10:26:00.000Z"}
{"event":"stage:start","stage":"TEST","stageKey":"TEST:verify","agent":"tester","ts":"2026-03-03T10:26:00.000Z"}
{"event":"stage:complete","stage":"TEST","stageKey":"TEST:verify","result":"pass","ts":"2026-03-03T10:28:15.000Z"}
{"event":"stage:complete","stage":"REVIEW","result":"reject","ts":"2026-03-03T10:29:00.000Z"}
```

**收斂門判定**（單一失敗 — REVIEW REJECT，TEST PASS）：
- 委派 developer 修復（帶 reject 原因：5 個 agent 缺少 body 段落）
- TEST 結果保留，不重做
- developer 修復後只重跑 REVIEW

### 修復迴圈 + 第二輪收斂

```
code-reviewer REJECT → developer（帶 reject 原因）→ code-reviewer（再審 PASS）
```

```jsonl
{"event":"stage:retry","stage":"DEV","reason":"review-reject","ts":"2026-03-03T10:30:00.000Z"}
{"event":"stage:complete","stage":"DEV","result":"pass","ts":"2026-03-03T10:35:00.000Z"}
{"event":"stage:complete","stage":"REVIEW","result":"pass","ts":"2026-03-03T10:37:00.000Z"}
{"event":"parallel:converge","group":"quality","result":"pass","ts":"2026-03-03T10:37:00.000Z"}
```

---

## 階段 6：RETRO（🔁 retrospective）

委派 retrospective，帶入 code-reviewer（含 REJECT + PASS 兩輪）和 tester(verify) 的 Handoff。

```jsonl
{"event":"stage:start","stage":"RETRO","agent":"retrospective","ts":"2026-03-03T10:38:00.000Z"}
{"event":"stage:complete","stage":"RETRO","result":"pass","ts":"2026-03-03T10:40:30.000Z"}
```

結果處理：PASS 直接進入 DOCS。若為 ISSUES，觸發 `retrospective ISSUES → developer → [REVIEW + TEST] → retrospective`（上限 3 次）。

---

## 階段 7：DOCS（📝 doc-updater）

委派 doc-updater，帶入**所有前面階段**的 Handoff（planner + architect + developer + code-reviewer + retrospective）。

```jsonl
{"event":"stage:start","stage":"DOCS","agent":"doc-updater","ts":"2026-03-03T10:41:00.000Z"}
{"event":"stage:complete","stage":"DOCS","result":"pass","ts":"2026-03-03T10:45:00.000Z"}
```

---

## 完成信號驗證

Standard workflow 的三信號基準全部 PASS：

| # | 信號 | 結果 |
|:-:|------|:----:|
| 1 | lint 0 error | PASS |
| 2 | test 0 fail（3047 pass） | PASS |
| 3 | code-review PASS（第二輪） | PASS |

```jsonl
{"event":"workflow:complete","workflow":"standard","feature":"level2-integration-phase2","ts":"2026-03-03T10:45:00.000Z"}
```

---

## 完整 Timeline 摘要

| 階段 | Agent | 耗時 | 結果 |
|------|-------|------|:----:|
| PLAN | planner | 3m 22s | PASS |
| ARCH | architect | 4m 15s | PASS |
| TEST:spec | tester | 3m 40s | PASS |
| DEV | developer | 12m 30s | PASS |
| REVIEW (1st) | code-reviewer | 3m 00s | REJECT |
| TEST:verify | tester | 2m 15s | PASS |
| DEV (fix) | developer | 5m 00s | PASS |
| REVIEW (2nd) | code-reviewer | 1m 30s | PASS |
| RETRO | retrospective | 2m 30s | PASS |
| DOCS | doc-updater | 4m 00s | PASS |

**總耗時**：約 45 分鐘（含 REJECT 修復迴圈）

---

## 關鍵學習

1. **並行群組的收斂門**：REVIEW 和 TEST:verify 同時啟動，任一失敗只處理失敗方，通過方結果保留。
2. **Handoff 是累加的**：doc-updater 收到所有前面階段的 Handoff，不需要自己回溯歷史。
3. **TEST:spec vs TEST:verify**：同一個 tester agent，`stageKey` 不同。spec 在 DEV 前，verify 在 DEV 後。
4. **REJECT 修復效率**：第二輪 REVIEW 只需 1m 30s（vs 第一輪 3m），reviewer 只需驗證修復項目。
5. **State 一致性**：`enforceInvariants()` 確保不會出現孤兒 active stage 或 status 逆轉。
