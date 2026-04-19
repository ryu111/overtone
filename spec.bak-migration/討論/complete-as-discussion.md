# 完成即討論 — 把 complete 從 terminal state 改為 conversation initiation point

## 背景

xd-n43u（2026-04-14）使用者明示：「所有的 session 不管是 manager 觸發、自主觸發、或使用者觸發，完成都要跟 manager 做討論式回報，以進行下一步」。

現況：complete → reviewer-enforcer 驗收 → 結束（terminal state）。
期望：complete → 討論式回報含 next proposal → Manager 讀 → 決定 continue/iterate/close → 新 dispatch 或 AskUserQuestion（conversation initiation point）。

## 1. 機制層面（Hook/Rule/Skill 分工）

### 最小可行設計（MVP）

**核心改動集中在 rule + API schema，不必加新 hook**：

#### 1.1 API schema 擴充（最小改動）
`POST /api/cross-dispatch/complete` body 加一個 optional 欄位：
```json
{
  "id": "xd-xxxx",
  "summary": "...",
  "verification": {...},
  "next_action_proposal": {
    "verdict": "continue" | "iterate" | "close" | "escalate",
    "proposal": "...（verdict=continue/iterate 時必填）",
    "blockers": ["..."],
    "clarifying_questions": ["..."]
  }
}
```

- `continue`：有明確下一步，自動續 dispatch（或 Manager 派新）
- `iterate`：需要再一輪 discussion（例如 reviewer 建議調整）
- `close`：真的結束，no next action
- `escalate`：卡住需要使用者決定

#### 1.2 新 rule：`rules/協作/完成即討論.md`
~30 行，3-4 條 MUST：
- 📋 MUST complete body 含 `next_action_proposal` 欄位（除 trivial 可用 `verdict: "close"` + 空 proposal）
- 📋 MUST verdict=continue/iterate 時 proposal 必非空
- ⛔ NEVER complete 只回 summary + verification 就結束
- 💡 COULD trivial 任務（純 noop / 無副作用）可用快捷 `next_action_proposal: {verdict: "close"}`

#### 1.3 reviewer-enforcer.js 擴充
`parseCompleteNotification` 識別 SSE 廣播字樣 — 若通知含 `next_action_proposal` 結構化資訊，標記為「需要 Manager 下一步討論」而非「需要 reviewer 驗收」。兩個分支：
- 傳統 pass/fail → 現有 reviewer 驗收流程
- 討論式 next → 新「開啟下一步對話」流程（Manager session 收到時當作 conversation trigger）

**但** hook 目前只看到 notification prompt 字串（server 注入），看不到完整 complete body。實際上 `next_action_proposal` 要透過 server 把它序列化到通知 prompt 裡 — 所以 server `/api/cross-dispatch/complete` handler 要把 proposal 塞進 broadcast payload。這需要 nova-server 改動。

**Hook 暫不動**：讓 server 和 API schema 擔主要責任，hook 只是消費者。

#### 1.4 分工表

| 層 | 責任 | 改動 |
|----|------|------|
| API schema | 定義 `next_action_proposal` 欄位 | server POST /complete handler 接收 + SSE broadcast |
| Rule | 強制 target 填 proposal | 新 rules/協作/完成即討論.md |
| Hook | 消費者：Manager 收到含 proposal 的通知時標記 discussion trigger | reviewer-enforcer.js 擴充 parseCompleteNotification |
| Skill | 最佳實踐 + 範例 | skills/cross-session/SKILL.md 加「Complete as discussion」章節 |

## 2. 內容層面（next action proposal schema）

### 必含欄位

```json
{
  "verdict": "continue | iterate | close | escalate",
  "proposal": "...（自然語言描述下一步；close 時可省）",
  "estimated_cost": "...（e.g. 30min, 1h, 2h）",
  "blockers": ["..."],
  "clarifying_questions": ["..."],
  "discovered_adjacencies": ["..."]
}
```

| 欄位 | 用途 | verdict 相依 |
|------|------|------|
| `verdict` | 4 選 1：continue / iterate / close / escalate | 必填 |
| `proposal` | 自然語言下一步描述 | continue / iterate 必填 |
| `estimated_cost` | 粗估時間，help Manager 排優先級 | continue / iterate 建議 |
| `blockers` | 卡住的外部條件（其他 dispatch / 使用者決定） | escalate 必填 |
| `clarifying_questions` | 若完成時浮現新問題 | 任何 verdict 可有 |
| `discovered_adjacencies` | 完成時發現的相鄰缺口（可派新 task）| 可選 |

**範例**（本輪 xd-5mja bug fix）：
```json
{
  "verdict": "continue",
  "proposal": "擴充 preserveTests / preserveBehavior / preserveComments 三類 invariant (spec/討論/nb-next-convergence.md defer #A)",
  "estimated_cost": "2-3h",
  "discovered_adjacencies": ["skills/closed-loop 可補 wiring check step"]
}
```

## 3. 避免過度（防噪音設計）

### 三個風險

1. **Trivial complete 拖討論** — 純 noop / 歸檔 / 無副作用的任務被迫填長 proposal
2. **Manager overloaded** — 每個 complete 都要回應，變成 Manager 的 Stop hook 地獄
3. **Target 填廢話** — 沒真的想就填「continue: 不知道做什麼」

### 設計守護

#### 快捷路徑：trivial = close
`verdict: "close"` + 空 proposal 是合法快捷，用於：
- noop dispatch（如 xd-m5jh /dev/null）
- 純歸檔（spec 移動）
- 純 config bump（無行為變更）
- 純 doc 改動

判斷標準：若 commit diff 不影響行為 + 無新盲點浮現 → close 合法。

#### Manager 側批次 review
Manager 不必「收到一個 complete 就立即回應一個 dispatch」。可以批次累積，待 queue idle 時統一 review 所有 pending proposals，挑優先級最高的 1-2 個派實作。

#### Target 側 `close` 的明示條件
rule 加：
- ⛔ NEVER 用 `close` 逃避思考 — 若 verdict=close，summary 必須明示「為什麼真的沒下一步」（1 句）

#### Rate limit
單一 target session 1 小時內 complete > 3 次時，後續 complete 可自動降級 `close`（由 server/hook 判斷），除非明示 override。避免小 bundle fragmentation。

## 4. 與既有元件整合

### 與 `rules/協作/討論式派發持久化.md` 的對稱性

是的，兩者對稱：
- `討論式派發持久化`：dispatch 時 Manager 寫討論內容 → target 持久化成 `spec/討論/*.md`
- `完成即討論`（新）：complete 時 target 寫 next proposal → Manager 讀並回應

兩者可合併成一個「討論週期」rule：
- dispatch phase：Manager → target 討論主體 + target 持久化
- complete phase：target → Manager next proposal + Manager 決策
- iterate phase：若 verdict=iterate，回到 dispatch phase

建議：新 rule `rules/協作/完成即討論.md` 先獨立寫，穩定後可合併到 `討論週期.md` 總綱。

### 與 `rules/品質/回饋與進化.md` 完成後三問的關係

完成後三問（方向對嗎/還能更好嗎/有異常信號嗎）產出「結論 + 具體行動」— 這個「行動」本質上就是 next_action_proposal 的 `proposal` 欄位 + `discovered_adjacencies`！

**兩者的關係**：
- 三問是 **內部反思程序**（target 自己思考）
- next proposal 是 **外部回報內容**（寫給 Manager）
- 三問的產出應該 **feed** next proposal，不是兩套獨立程序

建議：新 rule 明示「next_action_proposal 應由完成後三問的產出派生」，避免兩處重複勞動。

### 與 reviewer-enforcer 整合

現 reviewer-enforcer 處理 `verdict: pass/fail`。擴充：
- `next_action_proposal.verdict=close` → 現有 pass 路徑
- `next_action_proposal.verdict=continue/iterate` → 新分支「conversation trigger」，不阻擋 Stop 但標記「Manager 需要後續討論」
- `next_action_proposal.verdict=escalate` → AskUserQuestion 自動觸發

### 對 ralph-loop `<promise>DONE</promise>` 的影響

**session 級 vs task 級不同**。
- ralph-loop DONE 是 **session 級**結束：本輪所有 task 完成才 DONE
- `next_action_proposal` 是 **task 級**完成後的溝通

兩者獨立：一個 session 可以有 5 個 tasks 都 `verdict: close`，然後 ralph-loop 輸出 DONE。或者 5 個 tasks 各有 `continue` proposal，每個都被 Manager 派新 dispatch 進 queue，ralph-loop 繼續下一輪。

**不影響 DONE 語意**，反而讓 DONE 之前的 task 狀態更豐富。

## 5. 元問題 — DISCUSSION_HINT_RE 是否已涵蓋 next_action？

**沒有**。目前 DISCUSSION_HINT_RE 只抓 `Clarifying Questions|待討論|需要你的看法|discussion needed|討論回覆|討論式 dispatch`。這些是「當下在討論」的訊號，不是「提 next action」的訊號。

新設計應該加：
- `next action|下一步|proposal|continue|iterate` 或結構化 `verdict:` 欄位

**但** 更好的做法是 hook 讀結構化 body（JSON.parse 後看 `next_action_proposal.verdict` 欄位）而非 regex 猜字串。這需要 server 把 complete body 的關鍵欄位塞進 SSE broadcast payload — 這是 nova-server 的 API 擴充，不是 hook 的 regex 工作。

**推薦**：pattern 擴充可以做為**短期遷移路徑**（讓舊通知字串也能被辨識），長期應改為結構化。

## 最小可行設計（MVP 1 段）

**第一輪**（只動 nova-brain + nova-server，~2h）：
1. nova-server POST /api/cross-dispatch/complete schema 接 `next_action_proposal`（optional 向後相容）
2. SSE broadcast 在通知 prompt 中附 proposal 摘要
3. 新 rule `rules/協作/完成即討論.md` ~30 行含 3 MUST + 1 NEVER + 快捷 close 條款 + 範例
4. 現有 dispatch complete 開始附 proposal（target 側自主遵循）
5. reviewer-enforcer 先維持現狀不動（短期回饋通路已夠）

**第二輪**（約 1h，看第一輪效果）：
6. reviewer-enforcer 加 `parseCompleteNotification` 結構化分支
7. Manager 側 conversation trigger 自動化（收到 continue/iterate 自動開新 dispatch）
8. AskUserQuestion 整合 escalate

**第三輪**（延後 bw P0 驗證後）：
9. Rate limit rule (batch review)
10. ralph-loop DONE 與 task verdict 整合

## Clarifying Questions 給 Manager

1. `next_action_proposal` 是每個 dispatch 都要還是只 D2+？trivial D0/D1 允許快捷 `close` 嗎？
2. Manager 側收到 `continue` 自動派新 dispatch 是否會造成 runaway loop？需要節流嗎？
3. 「target 自主觸發」case 下，沒有 Manager dispatch 的 complete 回報誰？走 `/complete` 還是 `/notify`？

---

**交叉引用**：
- `rules/協作/討論式派發持久化.md`（dispatch phase 對稱）
- `rules/品質/回饋與進化.md` 完成後三問（內部反思程序 feed proposal）
- `rules/核心/任務管理.md` Plan-First + 三層完成（task 狀態 vs session 狀態差異）
- `skills/feedback-loop/SKILL.md` 完整反思協議

**dispatch 線**：xd-n43u（本討論）→ Manager 讀完質疑一次 → 派實作 MVP 第一輪
