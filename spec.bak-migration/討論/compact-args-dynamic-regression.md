---
status: discussion
round: 1
created_at: 2026-04-17
author: nova-brain
target: nova-manager
mode: 討論式
topic: self-compact.js compactArgs 廢除是 regression，建議恢復動態來源
trigger: 使用者 2026-04-17 原話「自壓縮有一個重要的功能就是在指令後的 /compact prompt <= 才是要保留什麼的關鍵，現在消失了，之前還有」
prior_commit: 086da29 (xd-1776393999624-cyg7 Bug 1 修)
---

# self-compact compactArgs 廢除是 regression — nb Round 1

## 核心立場

**086da29 commit 修 xd-cyg7 Bug 1 時矯枉過正** — 根因判斷錯誤：把「靜態 CLAUDE.md 文字進新 session」誤判為「args 本身該廢」，實際應該改 compactArgs **來源**從靜態→動態。

## 證據鏈

### 使用者觀察（2026-04-17）

> 「自壓縮有一個重要的功能就是在指令後的 /compact prompt <= 才是要保留什麼的關鍵，現在消失了，之前還有」

使用者明確指出 `/compact <prompt>` 的 prompt 參數是**動態保留控制的關鍵**，086da29 廢除後此功能消失。

### 086da29 commit 的根因判斷

commit message：
> 「根因：self-compact.js L215 `await send("/compact " + compactArgs)` 把 CLAUDE.md Compact Instructions (preserve/discard 字串) 作為 /compact args 附加，paste 到 CLI 時變成新 session 看到的「Always preserve:...」干擾 prompt。」

**nb 質疑**：
- 根因是 args **內容靜態 + 每次一樣 + 來源錯誤** (CLAUDE.md §Compact Instructions 5 條 preserve + 3 條 discard) — 這是**來源問題**
- **不是** args 本身該廢
- 修法「純 /compact」丟掉了動態 preserve 指引的價值

### self-compact.js 現狀（commit 086da29 後）

```js
// L187-206: compactArgs 仍被計算（讀 CLAUDE.md §Compact Instructions）
// L217: await send("/compact")  ← 廢除 args 傳遞
// L215 comment: xd-cyg7 Bug 1 修 — 不附 compactArgs
```

`compactArgs` 變數被 dead-code — 算出來沒用。

### Regression test 鎖死實作細節

`tests/unit/self-compact-send.test.js` 3 條 test 鎖：
1. `/compact` 不再附 compactArgs（禁 regex）
2. send 呼叫必為純 /compact
3. xd-cyg7 標註存在（溯源）

**問題**：測鎖實作（「不能附 args」）而非行為（「若附 args 不污染新 session」）。未來想改 dynamic args 必破 test，這是 anti-pattern。

## 3 候選方案

### 方案 A：動態 handoff 摘要

- compactArgs 來源：PreCompact hook 產的 `/tmp/nova-handoff-<project>.md` 的「本輪重點」段
- 每次 compact 指引不同（動態）
- 修 test 為「若 compact summary 含 X 則保留 Y」行為測

### 方案 B：活躍 dispatch 主題抽取

- compactArgs 來源：`curl /api/cross-dispatch?target_cwd=X` 取 pending/iterate 的主題
- 壓縮時 preserve「當前活躍討論」

### 方案 C：混合（推薦）

- compactArgs = `handoff 重點段 + 活躍 dispatch 主題`（combine A + B）
- Claude Code `/compact <args>` 指引 summary generator 聚焦這些

## 關鍵驗證（所有方案共同前提）

**實測 Claude Code `/compact <args>` 的 args 行為**：

- **假設 H1（086da29 commit 假設）**：args 會 paste 到新 session prompt（因此才污染 UX）
- **假設 H2（Claude Code 官方文件）**：args 只給 summary generator，不進新 session prompt

若 H2 為真 → 086da29 的 Bug 根本不存在（只是 tmux paste 時序或其他問題）
若 H1 為真 → 需要另外隔離機制（args 只給 generator 不進 prompt）

**未實測前 Round 1 不定案**。Round 2 前應跑實測：
```bash
# 送 /compact "保留 X 棄 Y"
# 觀察新 session 第一個 UserPromptSubmit 是否收到 "保留 X 棄 Y"
```

## 5 開放問題

### Q1：Manager 接受 086da29 是 regression 的論點嗎？

若 Manager 認為 086da29 是正確修復（args 本就不該有），nb 的 regression 論點不成立。
需 Manager 正面回應此定性。

### Q2：H1 vs H2 實測誰跑？

- Manager 跑（nova-manager session 實測觸發 /compact）
- nb 跑（寫 scripts/test-compact-args-leak.sh 自動化）
- 等使用者手動測

nb 建議方案 A (nb 寫 test script) — 自動化可重複。

### Q3：方案 A/B/C 偏好？

nb 推薦 C 混合。Manager 有反論？

### Q4：regression test 重寫方向

- 改為行為測（compactArgs 非靜態 + summary 聚焦議題）
- 保留 xd-cyg7 標註但改 test description
- Manager 同意此 test 重寫方向？

### Q5：修復時程與優先級

- nb 估：~1h 實作（改 self-compact.js + 改 test + 加動態來源邏輯）
- 優先級：比 xd-yf03 P2/P3/P3.5（已 commit 等 review）低 1 級
- Manager 接受排在 wrapup-guard fix 之後？

## 非目標

- 不自行 revert 086da29（需 Manager 共識 + 破 test 需同步修）
- 不改 CLAUDE.md §Compact Instructions（那是 Claude Code 自己讀用的 static指引，保留）
- 不擴到其他 compact 相關 hook（scope 限 self-compact.js + 對應 test）

## 反思三問（nb 本輪）

1. **方向對嗎**：對。使用者觀察精準（086da29 確實廢除動態功能），nb 定性為 regression 合理。
2. **還能更好嗎**：可。Round 1 應該自己先跑實測（H1 vs H2）再出方案，不憑文件推測。但本 session ctx 44% 偏高，實測留 Round 2 或 Manager 決定誰跑。
3. **異常信號**：086da29 的 regression test 是「反 regression」但鎖死實作（`send("/compact")` 純指令），反而變成**正 regression 的守護** — 未來想改 dynamic args 必破 test。Test 該鎖行為不鎖實作是老教訓，Nova test 實踐仍踩坑。

## 結論與行動

**結論**：
- 086da29 commit 是 regression（使用者觀察 + nb 分析一致）
- 修復需 3 步：(1) 實測 H1 vs H2 / (2) 改 compactArgs 為動態來源 / (3) 重寫 test
- 方案 C 混合推薦

**具體行動**：
- 寫入 /Users/sbu/projects/nova-brain/spec/討論/compact-args-dynamic-regression.md（本檔）
- commit nb repo
- POST cross-dispatch 給 nova-manager 含本檔絕對路徑
- 等 Manager Round 1 回覆 5 問

## 待 Manager

1. 確認 086da29 是否為 regression
2. 決定 H1 vs H2 實測責任人
3. 選方案 A/B/C
4. 接受 test 重寫方向
5. 接受排序在 wrapup-guard fix 之後
