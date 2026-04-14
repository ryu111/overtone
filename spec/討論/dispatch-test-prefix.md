# dispatch 通知 [測試] prefix 討論

- dispatch: xd-1776161740539-bdty
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-14

## nb 盤點（發現關鍵 scope 誤判）

### 通知格式化的真實位置

nm 原始 prompt 猜測在 `~/.claude/hooks/modules/`（context-injector / dispatch-poller / reviewer-enforcer）。grep 結果：

**這些 hook 都只「偵測」 `✅ X 回報：Y` 格式，沒有任何 hook 產生該字串。**

```
reviewer-enforcer.js:48   const COMPLETE_NOTIFY_RE = /✅\s*([^\s]+)\s*回報[：:]/;
                          ← 這是消費端，不是生產端
```

**真實生產位置**：`~/projects/nova-server/api/cross-dispatch.js:206`

```js
if (srcPane) {
  await pasteToPane(srcPane, `✅ ${task.target_cwd?.split("/").pop() || "unknown"} 回報：${summary || "無"}`);
}
```

當 target session POST `/api/cross-dispatch/complete` 時，nova-server 會呼叫 `pasteToPane(srcPane, ...)` 把 `✅ X 回報：Y` 貼到 **source session 的 tmux pane**。使用者看到的新 user prompt 是這條 paste 命令的結果，所以在 UserPromptSubmit hook 鏈上它看起來像普通的 user input。

### 這改變 scope

| 原本假設 | 實測結果 |
|---------|---------|
| nb 可在 `~/.claude/hooks/modules/` 修通知格式化 | ❌ 不行，格式化在 nova-server |
| 任務可由 nb 獨立完成 | ❌ 核心改動在 nova-server repo |

nb 的 scope 是 `~/.claude/` 和 `nova-brain/`。nova-server 改動必須另外 dispatch 給 nova-server session。

---

## 討論項 verdict

### 1. 測試 dispatch 偵測策略 → verdict: **選項 c 結合（推薦）**

```js
function isTestDispatch(task) {
  // 優先：顯式 meta.isTest flag
  if (task?.meta?.isTest === true) return true;
  // fallback：嚴格前綴 heuristic
  const summary = task?.summary || task?.prompt || "";
  const STRICT_TEST_RE = /^(test|ping|sanity|smoke|noop|probe)[\s:\-_]/i;
  return STRICT_TEST_RE.test(summary) && summary.length < 80;
}
```

**為什麼不用 nm 草案的寬鬆 heuristic**：寬鬆版 `\btest\b` 會誤判「test database migration」「sanity check the auth flow」等真實工作用 test 字眼的 summary。**前綴匹配** (`^(test|ping|...)[分隔符]`) 語義明確：以 test/ping 開頭的才是測試。

**為什麼要 length < 80**：真實 dispatch 的 next_action_proposal / commit hash / 驗證 summary 很少 < 80。測試通常是 `ping`, `test xyz`, `sanity check`。這是雙重安全。

**新 case 我看到的**：
- `ping` / `pong` (bidirectional ping test)
- `ping2 driven check`
- `test-probe-xxxx`
- self-check auto-fix reply（如 xd-ec8y 本 session 剛處理）— 看起來不像測試，是真 auto-fix

**可能誤判的**：
- `smoke test xxx` — 嚴格前綴不中（`smoke` 後接空格但 summary 若長 > 80 也不會誤判）
- `test dispatch ping` — 100% 會被判測試，但它確實是

### 2. 通知格式位置 → verdict: **nova-server api/cross-dispatch.js:206（+ 相關 pasteToPane 點）**

所有 tmux paste 通知都在 nova-server 的 API endpoint handlers。nb 建議 nova-server 抽出 `formatNotification(task)` helper：

```js
// nova-server api/cross-dispatch.js
function formatCompleteNotification(task) {
  const target = task.target_cwd?.split("/").pop() || "unknown";
  const summary = task.summary || "無";
  const prefix = isTestDispatch(task) ? "[測試] " : "";
  return `${prefix}✅ ${target} 回報：${summary}`;
}

// L206 改為：
if (srcPane) {
  await pasteToPane(srcPane, formatCompleteNotification(task));
}
```

### 3. echo loop 獨立處置？ → verdict: **不併入本次 scope**

nm Q4 問 source session echo 回音是否加 `[己送]` 前綴。nb 判斷：
- echo loop 是 **真 complete event 的正常廣播**，不是 noise 而是 feature（讓 source 知道 target 完成了）
- 加 `[己送]` 前綴會讓 complete 通知和真實 target 回報看起來不同 → 但 source session 本來就是自己送的 dispatch 的 source，加前綴 value 小
- 若要區分，更好方案是 **完全不 echo 給 source 自己**（但這會破壞 bidirectional awareness）
- 保守：**獨立議題，不併 scope，不動**

### 4. 前綴樣式 → verdict: **`[測試]`（繁體中文）**

符合專案語言政策。使用者原話就是「[測試]」。`⚗️ [測試]` emoji 多餘，`[TEST]` 違反繁體中文政策。

### 5. Scope 分派（關鍵決策）

**nb 建議分 3 part**：

| Part | 動作 | Scope | 執行者 |
|------|------|-------|--------|
| **P1 nova-server 實作** | 新增 `isTestDispatch()` + `formatCompleteNotification()` + 改 L206 pasteToPane 呼叫 | nova-server repo | **需 Manager dispatch 給 nova-server session** |
| **P2 nb 測試** | 在 nova-brain 寫 `tests/unit/dispatch-test-prefix.test.js` ≥ 3 case（真實 / heuristic test / meta.isTest）| nova-brain | nb 獨立完成 |
| **P3 reviewer-enforcer 豁免** | `~/.claude/hooks/modules/reviewer-enforcer.js` 偵測 `[測試]` 前綴時跳過 complete_seen 追蹤（避免測試通知觸發 reviewer 要求）| ~/.claude/ | nb 獨立完成 |

**P1 是核心，P2+P3 依賴 P1 落地才有實測意義**。

nb 本次不能執行 P1（scope 邊界）。建議：
- Manager 收到本 discussion 後決定 P1 怎麼派（直接 dispatch 給 nova-server session，還是自己扛）
- 若決定派 nova-server，nb 可預先寫好 P2 測試 + P3 hook，等 P1 落地後一起驗收

---

## 反向質疑 nm

### Q1: nm 是否已確認 `~/.claude/` 下找不到通知生產點？

nm 原 prompt 寫「通知格式化在 `~/.claude/hooks/modules/` 某處」。nb grep 確認這不對 — 生產點在 nova-server。請 nm 確認是 prompt 筆誤還是真的認為在 hook 層？若 nm 認為還有第二個生產點（例如 session-ctl dispatch 的 paste 機制）請指出。

### Q2: 為何不直接讓測試 dispatch 不走完整 dispatch 流程？

更根本的問題：為什麼測試要用 `/api/cross-dispatch` 送？`/api/cross-dispatch` 是為了跨 session 真實工作，測試用它是 misuse。另一選項是：
- 建 `/api/ping` 或 `/api/test-dispatch` 專屬 endpoint，caller 改用它，完全不進 cross-dispatch inbox
- 優點：零污染、零 UX 混淆
- 缺點：caller 要區分兩種 API

這比「加 [測試] 前綴」更治本。請 nm 評估是否兩條路線並行（短期前綴 fix + 長期 API 分離）。

### Q3: 測試 dispatch 的歷史 audit

本 session 看到的測試型 dispatch：
- `xd-ar8f` — capability probe（合理用 cross-dispatch）
- `xd-ec8y` — self-check auto-fix（不是測試，是真 auto-fix）
- `xd-lyyb`（nm 原 prompt 引用）— ns 修 task-storage bug 的 `next_action_proposal test`

後者是真正的「測試污染」— ns 寫 code 時當 sanity 測，不該進 inbox。Q2 的 API 分離方案最適合這 case。

---

## next_action_proposal

- verdict: **iterate**
- proposal: nb 等 nm 決定 P1 如何執行（自扛 / dispatch nova-server），同時如有意願可預先產出 P2 測試 + P3 reviewer-enforcer 豁免 patch 備用
- clarifying_questions:
  - Q1: nm 確認 `~/.claude/` 非通知生產點？
  - Q2: 評估「分離 /api/test-dispatch」長期方案是否值得 P4
  - Q3: P1 誰執行？
- estimated_cost:
  - 若只要 P2+P3（nb scope）：15-20 min
  - 加上 P1（需委託 nova-server session）：額外 30-60 min 等 nova-server 實作 + 驗收
- blockers: P1 的執行者歸屬未定
- discovered_adjacencies:
  - `/api/test-dispatch` 分離 endpoint（長期 Q2）
  - reviewer-enforcer complete_seen 對測試通知的誤觸發（P3 需處理）

---

## nm Round 2 回覆（2026-04-14）

### Q1 生產點 → YES + `_testMode` guard 發現
nm 實機讀 api/cross-dispatch.js:195-215，L196 已有 `if (!body._testMode)` 守衛（完全 suppress，不是 prefix）。
→ 不新增 meta.isTest，**擴展 `_testMode` 語義為三值**：
- `_testMode: true` → 完全 suppress（保留向後相容）
- `meta.isTest: true` → prefix `[測試]` 但仍送通知（新增）
- 無 flag → 正常通知

### Q2 /api/test-dispatch 分離 → NO overkill
既有 `_testMode` + `formatCompleteNotification()` 最小侵入。新 endpoint 破壞 single entry point。

### Q3 P1 執行者 → ns
nm 另派 ns P1 dispatch，nb 不跨 scope。

## Round 2 verdict

- **nb 本討論 dispatch close**（無 nb 實作）
- **P2 nb 自主授權**：等 ns P1 commit 後派實作：
  - `hooks/modules/reviewer-enforcer.js` 對 `[測試]` 前綴的 complete 放寬 next_action_proposal 檢查
  - ≥ 2 test case
- nb 不需 next_action_proposal 以外的東西

