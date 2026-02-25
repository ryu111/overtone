# Feature: passAtK(sessionId) — per-session pass@k 統計

## 背景

`passAtK(sessionId)` 從指定 session 的 `timeline.jsonl` 讀取所有
`stage:complete` 事件，依 stage key 分組後計算三種通過率指標：

- **pass@1**：第一次嘗試即通過（result = "pass"）
- **pass@3**：前三次嘗試中至少一次通過
- **pass^3**（passConsecutive3）：最近三次嘗試全部通過；嘗試次數 < 3 時回傳 null

stage key 完整比對（`TEST` 與 `TEST:2` 為不同 stage）。

---

## Scenario: 空 timeline — 無任何 stage:complete 事件

GIVEN 指定 session 的 timeline.jsonl 不存在，或存在但不含任何 `stage:complete` 事件
WHEN 呼叫 `passAtK(sessionId)`
THEN 回傳物件中 `stages` 為空物件 `{}`
AND `overall.stageCount` 為 `0`
AND `overall.pass1Rate` 為 `null`
AND `overall.pass3Rate` 為 `null`

---

## Scenario: 單一 stage，首次嘗試即 pass

GIVEN timeline 中有一筆 `stage:complete` 事件，stage 為 `"DEV"`，result 為 `"pass"`
WHEN 呼叫 `passAtK(sessionId)`
THEN `stages.DEV.attempts` 長度為 `1`
AND `stages.DEV.attempts[0].result` 為 `"pass"`
AND `stages.DEV.pass1` 為 `true`
AND `stages.DEV.pass3` 為 `true`
AND `stages.DEV.passConsecutive3` 為 `null`（嘗試次數 < 3）
AND `overall.stageCount` 為 `1`
AND `overall.pass1Rate` 為 `1.0`
AND `overall.pass3Rate` 為 `1.0`

---

## Scenario: 單一 stage，第一次 fail 後第二次 pass

GIVEN timeline 中有兩筆 `stage:complete` 事件，stage 均為 `"DEV"`
AND 第一筆 result 為 `"fail"`，第二筆 result 為 `"pass"`（按時間先後順序）
WHEN 呼叫 `passAtK(sessionId)`
THEN `stages.DEV.attempts` 長度為 `2`
AND `stages.DEV.pass1` 為 `false`（第一次嘗試結果為 fail）
AND `stages.DEV.pass3` 為 `true`（前三次中有至少一次 pass）
AND `stages.DEV.passConsecutive3` 為 `null`（嘗試次數 < 3）
AND `overall.pass1Rate` 為 `0`
AND `overall.pass3Rate` 為 `1.0`

---

## Scenario: 單一 stage，連續 fail 超過三次仍未 pass

GIVEN timeline 中有四筆 `stage:complete` 事件，stage 均為 `"TEST"`
AND 四筆 result 依序均為 `"fail"`
WHEN 呼叫 `passAtK(sessionId)`
THEN `stages.TEST.attempts` 長度為 `4`
AND `stages.TEST.pass1` 為 `false`
AND `stages.TEST.pass3` 為 `false`（前三次均 fail）
AND `stages.TEST.passConsecutive3` 為 `false`（最近三次均 fail，且嘗試次數 >= 3）
AND `overall.pass1Rate` 為 `0`
AND `overall.pass3Rate` 為 `0`

---

## Scenario: 多個 stage，混合結果

GIVEN timeline 中包含以下 `stage:complete` 事件（時間順序）：
  - `stage: "DEV"`, result: `"pass"`（第 1 次）
  - `stage: "TEST"`, result: `"fail"`（第 1 次）
  - `stage: "TEST"`, result: `"pass"`（第 2 次）
  - `stage: "TEST:2"`, result: `"fail"`（第 1 次）
WHEN 呼叫 `passAtK(sessionId)`
THEN `stages` 包含三個 key：`"DEV"`、`"TEST"`、`"TEST:2"`（各自獨立計算）
AND `stages.DEV.pass1` 為 `true`
AND `stages.TEST.pass1` 為 `false`
AND `stages.TEST.pass3` 為 `true`
AND `stages["TEST:2"].pass1` 為 `false`
AND `stages["TEST:2"].pass3` 為 `false`
AND `overall.stageCount` 為 `3`
AND `overall.pass1Rate` 為 `0.333...`（1/3，僅 DEV 首次即 pass）
AND `overall.pass3Rate` 為 `0.666...`（2/3，DEV 和 TEST 的 pass3 均為 true）

---

## Scenario: passConsecutive3 — 嘗試次數 >= 3 且最近三次全 pass（pass^3 = true）

GIVEN timeline 中有三筆 `stage:complete` 事件，stage 均為 `"REVIEW"`
AND 三筆 result 依序均為 `"pass"`
WHEN 呼叫 `passAtK(sessionId)`
THEN `stages.REVIEW.attempts` 長度為 `3`
AND `stages.REVIEW.pass1` 為 `true`
AND `stages.REVIEW.pass3` 為 `true`
AND `stages.REVIEW.passConsecutive3` 為 `true`（最近三次全 pass）

---

## Scenario: passConsecutive3 — 嘗試次數 >= 3 但最後一次 fail（pass^3 = false）

GIVEN timeline 中有四筆 `stage:complete` 事件，stage 均為 `"REVIEW"`
AND 四筆 result 依序為 `"pass"`、`"pass"`、`"pass"`、`"fail"`
WHEN 呼叫 `passAtK(sessionId)`
THEN `stages.REVIEW.passConsecutive3` 為 `false`（最近三次為 pass, pass, fail，並非全 pass）
AND `stages.REVIEW.pass1` 為 `true`（第一次結果為 pass）
AND `stages.REVIEW.pass3` 為 `true`（前三次全 pass）

---

## Scenario: 非 stage:complete 事件應被忽略

GIVEN timeline 中包含以下事件（混合各種類型）：
  - `type: "workflow:start"`
  - `type: "heartbeat"`
  - `type: "stage:retry"`, stage: `"DEV"`, failCount: 1
  - `type: "stage:complete"`, stage: `"DEV"`, result: `"pass"`
  - `type: "agent:handoff"`
WHEN 呼叫 `passAtK(sessionId)`
THEN 只有 `type === "stage:complete"` 的事件被納入計算
AND `stages.DEV.attempts` 長度為 `1`（`stage:retry` 不算嘗試次數）
AND `stages.DEV.pass1` 為 `true`
AND `overall.stageCount` 為 `1`
