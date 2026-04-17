# Silent Regression Prevention — nb Round 1 回應

- **日期**：2026-04-17
- **Manager dispatch**：xd-1776390260599-jdwg
- **使用者問題**：「像這樣的事情要怎麼避免發生？好的功能壞掉還不知道」
- **本 case 參考**：fde0add + d24c964 session-end auto-report 二階段修復

---

## 挑戰 Manager 3 層盲點

### 盲點 1「test 測行為而非結果」 — **部分同意，但根因更精細**

Manager 說「test 各自驗邏輯細節，沒測端到端」。

**挑戰**：這是 test **命名語意錯位**問題，不是 scope 不足。

證據：`tests/unit/wrapup-autocomplete.test.js:49-54` 原 test 名：
```js
test("autoComplete 過濾 session 期間建立的 dispatch", () => {
  expect(src).toContain("sessionStartAt");
  ...
});
```

這個 test 把 **bug 描述成 feature**（「過濾」= 本案真正的 bug 行為）。test 執行時 pass，但 test 本身**鎖定錯誤行為不能動**—— 下次有人想修 bug，這 test 會說「你破壞了 feature」。

**根因不是「缺端到端 test」，是「test name 不對準 feature intent」**：
- 錯誤 name「autoComplete 過濾 session 期間建立的 dispatch」= 鎖實作
- 正確 name「session 結束時應關閉所有已送達的 incoming dispatch」= 鎖意圖

**槓桿動作**：`rules/品質/測試規範.md` 已有「測試名稱描述行為而非實作」但不夠強 — 應加「**用使用者可讀語言描述功能意圖**，不是 function 呼叫路徑」。可加到 skill `nova-test` reference。

### 盲點 2「無監控指標」 — **反對 metric 為主**

Manager 想加 auto-complete 率監控 + 告警閾值。

**挑戰**：metric 有 **cold-start pathology**：當 bug 從 day 1（e6a75b5 fail-closed 重構時）就存在，metric 看到的「baseline」就是壞的狀態，告警閾值會校準到壞值 → 告警永遠不響。

證據：本 case bug 從 e6a75b5（約 2025-12 左右）引入到 2026-04-17 使用者發現 = **4 個月 metric 完全無效**。若當時有 metric，baseline 會是「auto-complete 率 0%」然後告警永遠不觸發。

**例外場景 metric 有用**：修復**後**用 metric 追蹤「修復是否維持」— 但這是 post-hoc，解不了「當下就壞」。

**建議**：不做 metric 層。改做 **proactive canary**（見 Q5）。

### 盲點 3「無 dogfooding alarm」 — **同意，但要升級**

Manager 說 Manager 自己手動 POST 掩蓋 auto-complete 失效。

**挑戰**：其實更糟 — 本 case 我觀察到 **Manager 的 peek view 和 API status 不一致**（xd-1776389431040-36al 討論中）。Manager 自己就是 stale view 受害者，他沒辦法當 alarm source。

**升級方向**：不能靠人類觀察（使用者 / Manager 都 stale），要 **自動化 canary** — 每 session SessionStart 發 self-test dispatch 給自己，Stop 時應該自動 complete。若 N session 連續失敗 → emit hook error / 系統通知。

---

## Q1-Q5 回答

### Q1：4 個 test 為什麼沒抓？

**不是 scope 不足，是 test name 語意鎖錯行為**。

- `wrapup-autocomplete.test.js` L49-54 test name「過濾 session 期間建立的 dispatch」= 測試在**祝賀 bug 存在**
- `wrapup-guard.test.js` 只測 Stop handler decision allow/block 不測「是否呼叫 autoComplete」
- `wrapup-marker.test.js` 測 marker 讀寫，和 auto-complete 正交
- `session-wrapup.test.js` 測 wrapup CLI 啟動流程，不測 hook-triggered path

所有 4 test 在自己 scope 內都正確，**組合起來缺「session 結束後 incoming dispatch 會 complete」的 intent-level test**。

### Q2：哪個 guard 最有槓桿？

**推薦優先序（已做的打 ✓）**：

| # | Guard | 成本 | 槓桿 | 推薦 |
|---|-------|------|------|------|
| ✓1 | **(c) architecture 順序守護**（autoIdx < ralphIdx / outgoingIdx） | 低（已加 2 test） | 中 — 防同類 refactor regression | 已做 |
| ✓2 | **(a) 端到端 integration test**（session-end-autoreport.test.js 10 test） | 中（已寫） | 高 — 覆蓋 settings → hook-client → wrapup-guard → API 整條 | 已做 |
| 3 | **(d) test 命名 convention upgrade**（rules/品質/測試規範.md 加「描述 intent 不是實作」） | 低 | 高 — 系統預防同類 test-locks-bug | 建議做 |
| 4 | **(e) canary dispatch** — 每 SessionStart 發 self-test，Stop 驗 auto-complete | 中（新 hook module） | 高 — proactive 不等人類觀察 | 建議做 |
| 5 | **(b) metric 監控** | 高（需 metric 表 + 告警閾值） | **低 — cold-start pathology** | 不推薦 |

### Q3：其他類似風險 audit 候選（nb scope 熟的）

1. **`fail-closed` 模式全面稽核** — 本 case 的「過度保護」pattern 可能在多處重演。grep `return null` / `return false` / `return { decision: "allow" }` / `catch { return }` 找 silently-skip，逐項問「這個 skip 是否掩蓋真實 fail？」。**推薦做**。
2. **hook-client.js LOCAL_MODULES 接線一致性** — hook module 新增後若忘加到 LOCAL_MODULES 則 hook 無 effect 但測試環境看起來正常（已有 arch test 守護，但類似 settings.json hooks[] 和 event switch 的一致性沒守護）。**推薦加 arch test**。
3. **wrapup Phase A/B/C/D 執行順序** — 順序若改 autoComplete 拿不到 reflect 產生的 git log summary（會用空 summary close）。沒 test 鎖定。**推薦加順序 regression test**。

### Q4：「修 A 引入 B」系統性防護 — rules/ 現有 + 該加？

現有相關：
- `rules/核心/失敗與修復.md`「先建防護再修症狀」+ 「每次修復回答：根因是什麼？防護是什麼？」
- `rules/核心/自驅反思.md`「完成後反思三問」

**挑戰「加新 rule」反模式**：本 case 正是「為修 fake-close 加了 rule/守護 → 過度保護壞原功能」的教訓。再加「修 A 不引入 B」rule 可能重演 —— rules 堆積會互相矛盾。

**建議不加 rule**，改：
- 在既有 `rules/核心/失敗與修復.md` 的「每次修復回答」段加第 3 問：「**原功能的 happy path 還 work 嗎？**」（1 行，不膨脹）
- 或加 skill `skills/regression-prevention/SKILL.md` 收集「修 A 引入 B」真實案例 + 防護模式（本案例首條 entry）

### Q5：使用者 canary 替代方案

**推薦 canary dispatch 機制**：

設計草圖：
- `hooks/modules/self-dispatch-canary.js` SessionStart 掛 async
- SessionStart 時發 `POST /api/cross-dispatch` 給自己（source=target=current cwd），prompt = `"[canary] self-test auto-complete"`
- dispatch 加 tag 或 prefix 標記 canary（避免混淆真任務）
- Stop 觸發時，wrapup-guard autoComplete 會把這個 canary 關掉
- 若連續 3 個 session canary 未被 auto-complete（status 仍 delivered）→ 下次 SessionStart hook 推 systemMessage「auto-complete 可能壞了，近 3 session 0 canary 關閉」

**成本**：
- 新 hook module ~50 行
- 新 Bash 檢測邏輯 ~30 行（SessionStart 檢查 canary 歷史）
- server 不需改（用既有 API）

**副作用**：每 session 多 1 個 dispatch 在 server 上（短命），微增 server 負擔

**vs metric 方案**：canary 是正向測試（dispatch 該被關 → 可觀察），metric 是負向（沒關的累積 → 可觀察），但 metric cold-start 盲，canary 每 session 從 0 開始檢測，不受歷史污染。

---

## nb 推薦行動（按槓桿排序）

已做 ✓ 不重列。**建議下 session（Wave 1 後或並行）**：

1. **Test 命名 convention upgrade** — 加 1 行到 `rules/品質/測試規範.md` 或 `skills/nova-test/references/test-naming.md`。成本 10 分鐘
2. **Canary dispatch 機制** — 新建 `hooks/modules/self-dispatch-canary.js`。成本 1 session
3. **fail-closed 稽核** — 自動化掃 `~/.claude/hooks/modules/*.js` 找 silent-skip pattern，列 audit 候選清單。成本 半 session
4. **《修 A 引入 B》skill reference** 建立 `skills/regression-prevention/SKILL.md` 收 Phase A 3 真實案例（本案 + reflection-resolver prose_action_unverifiable + test-locks-bug）。成本 半 session
5. **不做 metric** — 反推薦
6. **不加新 rule** — 反推薦（rules 膨脹是 meta-regression 溫床）

## 跨 scope 標記

- NC app 顯示「近 N session canary auto-complete 率」— **nova-control scope**，Manager 可派
- Manager daily-report 加 canary 失敗 alert — **nova-manager scope**，Manager 自改

## 下一步

Manager 審 nb 挑戰 + Q1-Q5 回答：
- 若同意推薦動作 1-4 → nb 下 session 自主啟動（本 dispatch 授權已含）
- 若有不同意見 → Round 2 討論
- 若 canary 方案有 ctx / 實作 blocker → 縮小到 audit 候選清單先做

## nb 反思三問

1. **方向對嗎？** 對 — 挑戰 metric 方向比單純接受節省未來 2-3 session rework
2. **還能更好嗎？** 本 spec 可更好：若有時間抽「fail-closed 稽核」自動化腳本原型放 spec 附錄，讓 Manager 更容易評估可行性。沒做（ctx 節制）
3. **異常信號？** Manager view stale（36al context）本身就是類似 bug — peek 畫面 counter 和 API 不一致，應列 Q3 第 4 項 audit 目標
