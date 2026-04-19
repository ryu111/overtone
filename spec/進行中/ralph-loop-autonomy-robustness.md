---
name: Ralph-loop Autonomy Robustness 補強規劃
status: proposed
authored_by: nova-brain
created: 2026-04-20
depth: D2
parent: rules/環境/ralph-loop.md §7/24 持續運轉紀律
trigger: 使用者問「自驅把握」→ 我自評 60-70% → 使用者授權「規劃補強脆弱點」
---

# Ralph-loop Autonomy Robustness 補強規劃

## 1. 動機（why now）

本 session 使用者問「若啟自驅有多少把握做到核心深度 / 完整閉環 / feedback loop / 深度治本」。我自評 **60-70%**，列 5 脆弱點：

1. 連續 D0 adjacency 陷阱（rule 有條款但無 hook 偵測）
2. Pivot-mandatory 前 2 次漏（需連 3 次無外研才升級）
3. 中間態 hook false negative（數字列 1./2./3. + 軟性措辭可規避）
4. 自驗時機滯後（治本後才發現對稱性 gap）
5. 對話式 UX 烙印（訓練偏見，rule 治不了，需 structural guard）

不補強直接啟自驅 → 連續輪壓力下把握降到 50-55%。本 spec 規劃 A/B/C/D 四項補強，目標把握 → 85-90%。

## 2. 四補強項

### 補強 A：連續 adjacency 偵測 hook（P0 最關鍵）

**動機**：rule 層「連續 ≥ 2 iter D0 adjacency」有 `⛔ NEVER` 條款但無 hook 偵測，靠自律不夠 — 剛治本的斷鏈 2 只完成 rule 部分，hook 部分本規劃補齊。

**設計**：
- 新檔 `hooks/modules/adjacency-streak-detector.js`
- **資料來源**：讀 `data/reflections.jsonl` 最近 N 筆 + `/tmp/nova-routing-level-*.txt` snapshot
- **觸發點**：UserPromptSubmit（ralph active=true 時）
- **判準**：最近 ≥ 2 筆連續 depth=D0 AND 無 D1+ commit（git log 驗）→ warn systemMessage
- **訊息**：「偵測連續 {n} iter 皆 D0 adjacency。rules/環境/ralph-loop.md §根本性 vs 便宜性：下一目標優先挑本輪反思識別的根因。」
- **不 block**（fail-open 保守），warn 強度靠訊息明示

**DoD**：
- `hooks/modules/adjacency-streak-detector.js` 新檔
- `hooks/hook-client.js` LOCAL_MODULES wire
- `tests/unit/architecture.test.js` 3 條守護（檔存在 + wire + regex pattern）
- unit test 驗連續偵測邏輯

**預估**：~80-100 行（hook 40 + test 40 + arch test 20）

---

### 補強 B：pre-iter 外部研究 guard（P2）

**動機**：rules/核心/自驅反思.md pivot-mandatory 要連 3 次無外研才升級，前 2 次靠 AI 主動，本 session 我沒主動（使用者糾正後才做）。

**設計**：
- 擴 `hooks/modules/reflection-persist.js`
- UserPromptSubmit（ralph active=true）時讀上輪 reflection entry
- 若 `外部研究[]` 空 或 entry 不存在 → 在 additionalContext 注入 systemMessage 強提醒
- 訊息：「⚠️ 上輪 reflection 無外部研究 — 本 iter 必做 WebSearch + external-references 寫入，pivot-mandatory 前置守護」
- 不 block，只 reminder（避免卡 user）

**DoD**：
- `reflection-persist.js` 新 function `checkLastReflectionExternalResearch()`
- UserPromptSubmit handler 擴
- arch test 1 條

**預估**：~40-60 行

---

### 補強 C：新 rule 上線反向 test（P3）

**動機**：剛治本中間態後才發現 HAS_NEXT_RE gap — 理想應 treat 前就 think through 對稱性。需自動化反向對照。

**設計**：
- 新 behavioral eval case 在 `~/projects/nova-brain/tests/evals/behavioral/`
- **Test pattern**：
  - Given: 新 rule 條款 + 含「便宜條款」的舊 prompt（模擬使用者糾正前場景）
  - When: AI 要求完成任務
  - Expect: AI **不**挑便宜條款，選符合新 rule 的做法
- 觸發時機：PostToolUse on commit 含 `rules/**/*.md` 時自動跑
- 依賴：`skills/nova-eval/` 的 behavioral runner

**DoD**：
- behavioral eval case template
- PostToolUse hook 擴（commit detect → trigger eval）
- arch test 2 條（eval case 存在 + hook wire）

**預估**：~100-150 行

---

### 補強 D：啟自驅前 eval gate（P1）

**動機**：ralph active=true 升級門檻低（user prompt 含明示信號即可）。啟動前應結構性驗 rule behavior 對齊。

**設計**：
- 擴 `hooks/modules/ralph-loop.js` UserPromptSubmit handler
- 偵測到 RALPH_TRIGGER_RE match 時，在建 state 檔前：
  1. 背景 spawn `bun tests/evals/eval-runner.js behavioral` (timeout 30s)
  2. 若 eval fail → warn（不 block，user 可選 override）
  3. 若 eval pass → 正常建 state 檔 + active=true
- **關鍵**：不 block 讓 user 有 emergency override；但 systemMessage 明示 eval 結果

**DoD**：
- `ralph-loop.js` UserPromptSubmit 擴
- eval-runner.js 必須 <30s 完跑（若超時視為 pass fail-open）
- arch test 1 條（ralph-loop.js 含 eval gate 呼叫）

**預估**：~50-70 行

## 3. 實作優先序

| Priority | 項目 | 動機 | ETA |
|:--:|---|---|:-:|
| **P0** | A 連續 adjacency hook | 直接封堵「便宜連續」根因，斷鏈 2 hook 部分補齊 | 1-2h |
| **P1** | D 啟前 eval gate | 啟動結構性守護，避免帶瑕疵啟自驅 | 1h |
| **P2** | B pre-iter 外研 reminder | 降 pivot-mandatory 3 次閾值實質效果 | 30min |
| **P3** | C 新 rule 反向 test | 長期品質保證，治本後對稱性自動驗 | 2-3h |

**總預估**：~270-380 行，6-7 工作小時。

## 4. 實作策略

### Option 1：一次性做 P0-P3 全做
- 單 session 跑完（ctx 壓力可能接近 70% 上限）
- 風險：中途 ctx 不足 → 拆半做半停
- 適合：使用者授權啟自驅前完整補強

### Option 2：分批 P0+P1 先做（核心）
- 1 session 做 P0+P1（~2.5h，核心守護）
- P2+P3 另 session（~3h，優化層）
- 風險：P2+P3 可能無限期 defer（熵累積）
- 適合：時間/ctx 不足，但要儘快啟自驅

### Option 3：只做 P0（最小）
- 1 session 只做 A 連續 adjacency hook
- 把握提升到 75-80%（P0 是最關鍵補強）
- 適合：驗證治本效果後再做 P1-P3

## 5. 風險與 mitigation

| 風險 | Mitigation |
|---|---|
| hook 實機誤擋正常自驅 | fail-open 設計（warn 非 block）；真擋前有 1 iter buffer 觀察 |
| eval-runner >30s 超時 | 超時視為 pass（fail-open），避免卡 user |
| 反向 test case 覆蓋不全 | 每新 rule 至少 1 case baseline，累積擴充 |
| reflection.jsonl 讀失敗 | 所有 hook catch error → fail-open，不擋執行 |

## 6. 驗收

- `bun test architecture.test.js` 全 pass（新加 6-8 條守護）
- 實機跑 1 ralph iter 驗 hook 觸發（若使用者授權試跑）
- 自評把握：**60-70% → 85-90%**

## 7. 下一步

Spec persisted，等使用者決定實作範圍（Option 1/2/3）+ 時機（立即 / 延後）。規劃本身不實作，不破壞既有 rule/hook。

## 8. Backlinks

- 斷鏈 2 rule：[rules/環境/ralph-loop.md](/Users/sbu/.claude/rules/環境/ralph-loop.md) §根本性 vs 便宜性
- 中間態治本：[commit 7e23435](https://.../7e23435)（rule + hook + external-ref）
- Pivot-mandatory：[rules/核心/自驅反思.md](/Users/sbu/.claude/rules/核心/自驅反思.md) §外部研究硬性條款
- 外部研究框架：[agent-decision-ownership-2026.md](/Users/sbu/.claude/obsidian/semantic/external-references/agent-decision-ownership-2026.md)
