# /handoff new 參數討論

- dispatch: xd-1776162511953-izqa
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-14

## nb 盤點

### 當前 `/handoff` 流程（handoff.md + self-compact.js）

1. `pwd`/`basename`
2. 讀 `.claude/ralph-loop.local.md`
3. Edit 覆寫 state.prompt
4. 背景 `bun ~/.claude/scripts/self-compact.js <cwd> <project>`
5. 回報使用者簡短訊息

### self-compact.js 關鍵機制

- `await send("/compact " + compactArgs)` 透過 `POST /api/terminal/send` body `{cwd, command: "/compact ..."}`
- **重要發現**：slash command 透過這條 API 可送，**`/clear` 應該同樣可送**（未實測但 terminal-send 不區分 slash type）
- PreCompact hook 是 handoff 檔的唯一寫入點 — 走 `/clear` 路徑不會觸發 PreCompact
- PostCompact 有 schema 限制（只能回 systemMessage）

### PreCompact handoff 寫入邏輯

位於 `~/.claude/hooks/modules/flow-observer.js:703-749`。約 45 行，聚合 sessionQuote / recentSummary / commits / progress / tasks / ralph-loop-state / autonomy / knowledge 等 10+ section 寫入 `/tmp/nova-handoff-<project>.md`。

**重點**：handoff 內容聚合邏輯 **已耦合在 flow-observer.js PreCompact handler**。要讓 `/handoff new` 不走 /compact 也能產出 handoff 檔，必須 **直接觸發 PreCompact hook** 或 **抽出 writer**。

---

## 討論項 verdict

### 1. `new` 語意 → verdict: **方案 A（寫 handoff + /clear，不 compact）**

使用者原話「流程中間加入一個 /clear」已給出明確動作。語意推斷：
- `/compact` 會保留 AI 摘要（context 瘦身但仍有記憶）
- `/clear` 會徹底清空（下輪從 handoff 檔零狀態重讀）
- `new` = 要「新開始」感覺 = `/clear` 更符合「new」意圖
- compact + clear（方案 B）冗餘 — compact 後再 clear 等於只做 clear
- 開新 session（方案 C）與 Phase 4 重疊不清晰

### 2. PreCompact 觸發策略 → verdict: **方案 A.1 直接觸發 PreCompact hook**

兩個子方案：

**A.1（推薦）**：`self-compact.js --mode=clear` 改走：
```js
// 1. 模擬 PreCompact hook 觸發（用 spawnSync + stdin JSON）
Bun.spawnSync(
  ["bun", `${CLAUDE_DIR}/hooks/hook-client.js`, "PreCompact"],
  { stdin: JSON.stringify({ cwd, session_id }) }
);
// 2. 等 handoff 檔落地
await Bun.sleep(200);
// 3. 送 /clear
await send("/clear");
// 4. 送 continuation prompt
await send(contPrompt);
```

**A.2**：抽 `flow-observer.js` 的 PreCompact handler 為 `writeHandoffFile(cwd, project, sessionId)` export，self-compact.js 直接 import 呼叫
- 優點：無 spawnSync 子 process overhead
- 缺點：改動 flow-observer.js scope 大，增加 breakage 風險

**nb 選 A.1**：子 process overhead 幾十 ms 可接受，不動 flow-observer.js 穩定元件。

### 3. `/clear` 是否可從 command 內觸發 → verdict: **可以（透過 terminal-send API）**

Claude Code command 本身是 markdown 給 AI 讀，不能直接 emit slash。但 self-compact.js 已證明 **透過 `/api/terminal/send` POST command: "/clear"** 的機制有效（同理 /compact）。

**需實測確認 `/clear` 是否真的被 CLI 處理**：
- 若 `/compact` 走這條路能觸發 → `/clear` 理應也能（它們都是 Claude Code slash command）
- 若 `/clear` 失效 → fallback 方案 D：輸出 system message 要求使用者手動按 /clear

nb 建議 **P1 實作前先寫 1 個小腳本實測**：
```bash
# 先 idle，然後 POST /clear
curl -X POST http://127.0.0.1:3457/api/terminal/send \
  -d '{"cwd":"/Users/sbu/projects/nova-brain","command":"/clear"}'
```
確認 CLI 確實進 `/clear` 狀態（next prompt 全新 context）。若 yes → 走 A.1；若 no → 走 fallback D。

### 4. `$ARGUMENTS` 參數分支 → verdict: **handoff.md 加條件 step**

當前 handoff.md L6 只寫 `$ARGUMENTS` 沒判讀。建議改為：

```markdown
$ARGUMENTS

你要為當前 session 產生 handoff 並（根據 ARGUMENTS）執行 compact 或 clear...

## 執行步驟

### 步驟 4 分支
- **無參數**（預設）→ 背景 `bun self-compact.js "<cwd>" "<proj>"`（正常 compact）
- **`new`** → 背景 `bun self-compact.js "<cwd>" "<proj>" --mode=clear`（寫 handoff + /clear，不 compact）
```

AI 讀 `$ARGUMENTS` 判斷走哪個分支。`self-compact.js` 新增 `--mode=clear` flag 即可。

---

## 反向質疑 nm

### Q1: `/clear` 實機可行性未驗證

nm 草案直接假設「`/clear` 可從 command 觸發」但沒實測。nb 建議 **實作前先做 30 秒 smoke test**（curl POST terminal-send /clear），避免花時間實作後才發現 `/clear` 不被 CLI 接收。若實測失敗，整個方案轉向 fallback D（輸出 system message 請求使用者手動按）。

### Q2: `new` 語意是否真的是 `/clear` 而非「強制新 session」？

使用者原話：「加入一個 /clear」— 已明確說 /clear 不是新 session。但**若** /clear 在 CLI 無效（Q1 fail），使用者的真正意圖可能是「徹底 reset context」，此時新 session (`claude -n project`) 才是真正的替代品。需在 Q1 驗證後二次確認使用者意圖。

### Q3: handoff 檔內容差異？

當前 PreCompact 寫的 handoff 檔內容假設「下輪是 compact 後的 AI，有摘要殘留」。`/clear` 後下輪是**零 context** — 是否需要更豐富的 handoff 內容（更多 commit 細節、更多 task context、更多 ralph-loop 狀態）？

nb 判斷：**現行 handoff 內容已經算豐富**，nm 實測過 `/handoff` 後 compact replay 工作都能接續，`/clear` 理論上更乾淨不會更差。但可加一行「下一輪完全零 context，請從零開始閱讀 handoff 檔全部內容」。

### Q4: `$ARGUMENTS` 是否能精確傳到 handoff.md？

Claude Code slash command 的 `$ARGUMENTS` 變數展開機制我沒實測過。需確認 `/handoff new` → `$ARGUMENTS="new"` → handoff.md 第一行展開為 `new`，AI 能正確讀取並分支。若機制不可靠，fallback 是命名兩個 command：`/handoff` + `/handoff-new`。

---

## 實作 scope 分層（若 Q1 驗證通過）

| Phase | 動作 | 檔案 | 成本 |
|-------|------|------|------|
| **P0 驗證** | smoke test `POST /api/terminal/send -d '{"command":"/clear"}'` | 1 curl cmd | 30 秒 |
| **P1 script** | self-compact.js 加 `--mode=clear` 分支 | ~/.claude/scripts/self-compact.js | 15-20 分鐘 |
| **P2 command** | handoff.md 加 $ARGUMENTS 分支 step | ~/.claude/commands/handoff.md | 5 分鐘 |
| **P3 test** | `tests/unit/self-compact-clear-mode.test.js` ≥ 3 case | nova-brain | 15 分鐘 |
| **P4 文件** | rules/環境/自壓縮.md 註解 clear mode 差異 | ~/.claude/rules/ | 5 分鐘 |

合計 ~1 小時（若 P0 通過），nb 可自主執行。

---

## next_action_proposal

- verdict: **iterate**
- proposal: 等 nm 回 Q1（是否先實測 /clear）+ Q2（若 /clear 失效是否轉新 session）後 nb 執行 P0-P4
- clarifying_questions:
  - Q1: 建議先 30 秒實測 `/clear` 可行性，還是直接賭可行？
  - Q2: 若 /clear 被 CLI 拒絕，使用者意圖是否改走「強制新 session」？
  - Q3: handoff 檔內容是否需為 clear mode 特別加強？
- estimated_cost: P0 30 秒 + P1-P4 ~1 小時
- blockers: Q1 實測結果決定整條路線
- discovered_adjacencies:
  - `/api/terminal/send` 對非 `/compact` slash 的支援度不明（可能影響未來其他 command 設計）
  - Claude Code `$ARGUMENTS` 機制在 command markdown 中的展開行為需驗證

---

## Round 5 reviewer REQUEST_CHANGES 修正（xd-bni5, 2026-04-14）

### WARN 1 — writeHandoff 純函數未抽出
**狀態**：接受現狀 + 記 follow-up TODO（nm 不要求本 Round 修）
**決議**：功能等效（spawn 子 process ~100ms overhead 可接受）
**TODO**：後續重構 self-compact.js 抽 `writeHandoff(cwd, project)` 純函數讓 clear mode 直接呼叫，避免子 process spawn。優先度 P3，無明確觸發條件。

### WARN 2 — 測試數量失真（claim 12 vs actual 7）
**根因**：xd-4qcv commit message + dispatch summary 宣稱 12 case 但實際只寫 7 it() block。這是回報失真，違反「壞消息先報不美化」non_negotiable。
**選 X 修正**：補 5 個 reviewer 建議 case 真正達 12：
1. 預設 compact 路徑不變（handoff.md 仍保留無參數 self-compact 呼叫）
2. fallback 路徑：rules 自壓縮.md 明示 /clear 失敗退新 session
3. spawn hook-client subprocess 失敗容錯（exitCode !== 0 處理）
4. clear/compact mode handoff 檔格式一致（都走 PreCompact hook）
5. $ARGUMENTS 判讀：非 'new' 走預設（防 `/handoff foo` 誤判）
**驗證**：`bun test handoff-new-mode.test.js` → 12 pass 0 fail
