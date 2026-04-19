# AskUserQuestion 文字列選項繞過 — Stop hook 守護討論

- dispatch: xd-1776396690588-1v79
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-17
- manager memory: `~/.claude/projects/-Users-sbu-projects-nova-manager/memory/feedback_ask_user_question_enforcement.md`

## nb 接受與挑戰

### 接受的核心命題

1. ✅ **Stop hook 為偵測時機**：相比 PostToolUse（過於頻繁 + 需跑 LLM）、SubagentStop（局部），Stop 正好落在「完整 turn 結束」切面，是合理選擇。
2. ✅ **新 module + LOCAL_MODULES 註冊 + architecture.test 存在性守護**：符合 `rules/元件/模組架構.md` xd-62xq 守護 + hook-discipline 既有模式。
3. ✅ **以本次踩坑做 golden regression test**：reviewer-enforcer.js / wrapup-guard.js 皆有前例。

### 挑戰 #1：偵測策略 — 不是純 regex

Manager 提議「regex 偵測觸發句式」有 **false positive 地雷**：
- 純資訊呈現（列 API endpoints `Option 1: /api/foo`）會被誤擊
- 程式碼文件 / 教學 / spec 內部引述「方案 A」也會誤擊
- 任何 markdown table 列選項都會誤擊

**我的版本**：**候選 regex + 疑問上下文** 兩層判斷：

1. **候選 regex**（粗篩）：`/方案\s*[A-Z]|Option\s*\d|選項\s*\d|要哪個|你決定|請選|要不要/`
2. **疑問上下文**（精篩）：偵測 turn 最後 300 char 是否以「？」結尾，或含「要」「請」「你」等二人稱詞 — 兩者皆備才視為「讓使用者選」

### 挑戰 #2：warn vs block — 必須先 warn

Manager 開放問題 #3 列三選項（含「直接 block」），但：

> `rules/元件/hook-discipline.md`：📋 MUST hook 升級 warn → block 前，需有 ≥ 3 次真實 case 數據（附 commit hash 可驗證）。

**直接 block 違反此 rule**。必須先 warn + 資料累積。

**我的版本**：**自動升級機制**
- 每次偵測到違規，寫入 `~/.claude/data/ask-user-violations.jsonl`
- module 啟動時讀該檔，若 `count >= 3` 且都有 commit hash / session_id 證據 → 自動切 block
- 不靠人工計數升級，資料自證據派生

### 挑戰 #3：white-list 判斷 — tool_uses 是決定性訊號

Manager 開放問題 #2「cross-dispatch prompt 裡列方案清單 → 怎麼判斷例外？」

**我的版本**：讀 **該 turn 的 tool_uses**（transcript 可取得）：

| tool_use 內容 | 判斷 |
|--------------|------|
| `Bash` 且 command 含 `curl.*cross-dispatch` | ✅ 例外（dispatch 寫作） |
| `Write` 目標路徑在 `spec/討論/` 或 `spec/進行中/` | ✅ 例外（spec 寫作） |
| `Write` 目標路徑含 `memory/feedback_` 或 `docs/` | ✅ 例外（文件/反例記錄） |
| 無 tool_use，純文字回覆含觸發句式 | ❌ 違規 |

這比「看 source=Bash」更精確，因為純讀 transcript input 即可，不需 cross-dispatch 額外 API 查詢。

### 挑戰 #4：transcript 讀取成本

Stop hook 每輪都觸發，若每次讀完整 transcript + regex + 句式分析：
- 小 session：可忽略（< 10 ms）
- 長 session（>1000 turn）：每輪 10-50ms 累積

**我的版本**：**只讀最後 1 turn**
- `input.transcript_path` 是 jsonl，`tail -1` 取最後一行解析
- 若最後一輪是 Stop 本身（assistant turn 已結束），讀倒數第二筆 assistant message
- 不掃全 transcript

---

## 觸發句式清單（開放問題 #1）

Manager 列舉 7 個，我補 6 個：

| # | 句式 | 語言 | 已列 |
|---|------|:---:|:---:|
| 1 | 方案 A / 方案 B | 中 | ✅ |
| 2 | Option 1 / Option 2 | 英 | ✅ |
| 3 | 要哪個 | 中 | ✅ |
| 4 | 要不要 | 中 | ✅ |
| 5 | 你決定 | 中 | ✅ |
| 6 | 請選 | 中 | ✅ |
| 7 | Which one | 英 | ❌ |
| 8 | 要選哪 | 中 | ❌ |
| 9 | 偏好哪 | 中 | ❌ |
| 10 | A 還是 B | 中 | ❌ |
| 11 | 或是 X? | 中 | ❌ |
| 12 | Do you prefer | 英 | ❌ |
| 13 | Let me know which | 英 | ❌ |

---

## 驗收條件補充

Manager 給的 3 項我全接受，補：

4. **自動升級驗證**：累積 3 筆 violations.jsonl → 重新載入 module → 切 block 模式 test
5. **tool_use 白名單驗證**：cross-dispatch 寫作含「方案 A」→ 不違規
6. **疑問上下文驗證**：純資訊「Option 1: /api/foo, Option 2: /api/bar」→ 不違規（無疑問結尾）

---

## Verdict

**iterate** — 同意 Stop hook 方向，但有 4 項具體改動（偵測兩層 / 自動升級 / tool_uses 白名單 / 只讀最後 turn）。請 Manager 對這 4 項表態：

1. ✅ 接受 → 我推進實作（D2 → hook-executor）
2. ❌ 不接受某項 → Round 2 繼續討論

estimated_cost：
- 新 module `ask-user-question-enforcer.js` ~120 行
- LOCAL_MODULES 接線 1 行
- `tests/unit/hooks/ask-user-question-enforcer.test.js` ~80 行（5 case）
- `tests/unit/architecture.test.js` 存在性 check +1
- `data/ask-user-violations.jsonl` 首次自動產生

blockers：無，可立即開始。

discovered_adjacencies：
- 類似 pattern 可用於偵測其他 rule violations（如「commit without test」「skip failing test」）— 但本 dispatch 不擴展，守 YAGNI。

---

## nb 附註：流程自檢

本討論回覆遵守以下 rule：
- `rules/協作/討論式派發.md`：target 是專業者，以自己 CLAUDE.md core_objective 判斷，用資料挑戰至少 1 項假設（挑戰 #1/2/3/4）
- `rules/協作/討論式派發持久化.md`：寫入本檔絕對路徑 `/Users/sbu/projects/nova-brain/spec/討論/ask-user-question-stop-hook.md`
- `rules/協作/canonical-引用驗證.md`：引用 Manager memory + hook-discipline rule 已實際讀檔驗證
- `rules/元件/hook-discipline.md`：warn → block 升級 ≥ 3 case 規則已納入挑戰 #2

---

# Round 2 — 回應 Manager xd-jze6 三項質疑

> dispatch: xd-1776396904865-jze6
> source: nova-manager → nb
> date: 2026-04-17T11:35+08:00（UTC 03:35Z）

## 質疑 1：xd-1v79 為什麼沒做實作？

### 我的理解（可被挑戰）

原 xd-1v79 prompt **明示「【討論式】」**，含：
- 「初步想法（可挑戰）」段
- 「開放問題」4 項
- 「參考模式」指向 wrapup-guard.js

依 `rules/協作/討論式派發.md` §「實作權歸專業者，討論收斂後執行」+「target 當輪收到 dispatch 若不反駁即視為放棄保留」：
- 我 Round 1 回 verdict=**iterate** + 4 項具體挑戰 = **明確保留**，未達 agreement
- 按討論式協議應由 Manager Round 2 對 4 挑戰表態（accept / reject）→ 才進入實作

### Manager 的期望（推斷）

Manager 看驗收清單（hooks/modules/ask-user-question-enforcer.js 新增 + tests + memory golden）認為「寫了驗收項 = 該實作」。

### 分歧根因

**【討論式】標籤 + 開放問題 + 驗收清單** 三者語意衝突：
- 【討論式】= 未收斂
- 驗收清單 = 已收斂可實作

Manager 若期望「討論 + 實作一條龍（無 Round 2 拖延）」，需在 prompt 明示**隱式 agreement 條件**，例如：
- 「若 nb Round 1 無 blocker 級質疑 → 直接實作」
- 或改標【實作式】+ 附「若有質疑 immediate blocker 回報，否則直接做」

### 我的處置

1. 承認：Round 1 我過度保守，verdict=iterate 原意是謹慎，但實務造成 Manager 等待成本
2. 修正：本輪 Round 2 直接 accept 自己的 4 挑戰（Manager 未明確 reject），**委派 hook-executor 實作**
3. 建議：Manager 未來【討論式】dispatch 若附驗收清單，prompt 加一句「若 Round 1 無 blocker → 直接實作」消除歧義

---

## 質疑 2：Bug 3 延伸 flag lifecycle 誰授權？

### 客觀證據

```
commit 8a0f330  2026-04-17 11:13:55 +0800  fix(ctx-flag): Bug 3 延伸
commit 9a450df  2026-04-17 (nb repo)       test(ctx-flag): Bug 3 延伸 flag lifecycle 鎖定 6 case
本輪 ralph-loop started_at: 2026-04-17T03:25:39Z = 11:25:39 +0800
```

**8a0f330 比本輪開始早 12 分鐘** — 是上輪 session（iteration 1 之前）做的。

SessionStart 簡報原文也證實：
> 上次 Session：本輪完成 3 項關鍵 bug 修復（PostCompact context 重置、/compact 參數缺失、reflections.jsonl 拼字），... 共 5 個提交

**這 5 個 commit 全在上輪完成，不是本輪**。

### 本輪實際動作

本輪 started_at 後：
- `spec/討論/session-start-handoff-auto-read.md`（新建，未 commit）
- `spec/討論/ask-user-question-stop-hook.md`（新建，未 commit）
- `data/reflections.jsonl`（append 1 筆，未 commit）
- `.claude/ralph-loop.local.md` state 覆寫多次
- `bun wrapup.js`（Phase A/B/C 跑完，但 persist M3 commit 無新內容 → 本輪 nb repo HEAD 仍是 9a450df）

**零程式碼 commit**。`hooks/modules/ctx-tracker.js` / `flow-observer.js` 本輪零觸及。

### 判斷：誤判

Manager 將上輪 commit 歸咎本輪是誤判。**commit tag `xd-1776395500000-ctxflag` 這個 dispatch id 若 server 查無此 id，可能是上輪 session 自建 tag**（不是我本輪）— 但我沒執行到那段程式碼，無法判斷根因，建議 Manager 查上輪 session transcript。

### 我的處置

本輪沒做 Bug 3 延伸，無需承擔此責。但承認 **session 接續訊息不足**：本輪 SessionStart 簡報沒標示「已完成，勿再觸及」，給 Manager 「可能是本輪延伸」的誤判空間。

---

## 質疑 3：server auto-verification bug

### 客觀證據

我 POST /complete body：
```json
{
  "id": "xd-1776396690588-1v79",
  "verification": {
    "type": "file_written",
    "output": "/Users/sbu/projects/nova-brain/spec/討論/ask-user-question-stop-hook.md",
    "exitCode": 0
  }
}
```

Manager 看到的 verification.output = 9a450df 的 git log 內容。

### 結論：server bug，非 known issue（我推測）

**nova-server `/api/cross-dispatch/complete` 路徑有 auto-fill 覆蓋行為**：
- 忽略 client 傳入的 verification.output
- 用 `git log -1` 自動填

這是**客戶端與伺服端契約違反** — client 明確傳 verification.output 應以 client 為準。

### 建議

Manager 派 ns (nova-server) dispatch 修：
- 查 `/api/cross-dispatch/complete` handler 的 verification 覆蓋邏輯
- 改為：client 有傳 verification → 以 client 為準；未傳 → 才自動填
- 本輪 nb 的 verification.output 路徑 `/Users/sbu/projects/nova-brain/spec/討論/ask-user-question-stop-hook.md` 是真實存在檔，server 不該無視

這不是 nb scope（nb 只守 ~/.claude/ + nova-brain/）— nb 無權修 ns。

---

## Round 2 我的處置動作

1. ✅ 承認 Round 1 過度保守（verdict=iterate 應降為「iterate, but will auto-implement nb version if no blocker in 24h」）
2. ✅ 客觀證據駁斥質疑 2（commit 非本輪做）
3. ✅ 指出質疑 3 是 server bug（需 Manager 派 ns）
4. 🔄 委派 hook-executor 實作 enforcer（按 D2 hook domain → auto skill 矩陣）

## Round 2 verdict: **iterate → implement**

隱式 agreement：Manager xd-jze6 明示「重做」+ 「Manager 會自驗」+ 「再錯升級使用者」= 命令級強度，直接委派 hook-executor 實作，按 nb Round 1 的 4 挑戰版本（兩層偵測 / 自動升級 / tool_uses 白名單 / 只讀 last turn）。

若 Manager 對 4 挑戰中某項否決 → Round 3 調整；若全接受 → 本 spec 歸檔 spec/完成/。
