# Feature: S14 Strategic Compact — 階段完成時的 Compact 建議

## 背景

`shouldSuggestCompact` 函式在 SubagentStop hook（agent/on-stop.js）的 PASS 分支中執行，
判斷是否應在 `result` 訊息中附加 compact 建議。

觸發條件（四者同時成立）：
1. transcript 檔案大小 > thresholdBytes（預設 5_000_000 即 5MB）
2. 不是最後一個 stage（還有 pending stage）
3. 自上次 `session:compact` 事件後已完成 >= minStagesSinceCompact（預設 2）個 `stage:complete`
4. 若從未 compact 過，允許首次觸發

---

## Scenario: 超過閾值且非最後 stage — 建議 compact（正常觸發）

GIVEN 一個 standard workflow，stages 為 [PLAN, ARCH, TEST, DEV, REVIEW, TEST, RETRO, DOCS]
AND 目前完成了 DEV stage（verdict: pass），還有 REVIEW/TEST/RETRO/DOCS 尚未完成
AND transcript 檔案大小為 6.5MB（> 5MB 閾值）
AND timeline 中無任何 `session:compact` 事件（從未 compact 過）
WHEN `shouldSuggestCompact` 以預設選項執行
THEN 回傳 `{ suggest: true, reason: ..., transcriptSize: 6500000 }`
AND `suggest` 為 true
AND `transcriptSize` 等於 6500000

## Scenario: transcript 大小未達閾值 — 不建議

GIVEN 一個 standard workflow 的 PLAN stage 剛完成（verdict: pass）
AND transcript 檔案大小為 2MB（< 5MB 閾值）
AND 還有多個 pending stage
WHEN `shouldSuggestCompact` 以預設選項執行
THEN 回傳 `{ suggest: false }`
AND `suggest` 為 false

## Scenario: 最後一個 stage 完成 — 不建議

GIVEN 一個 standard workflow，所有 stage 僅剩 DOCS 尚未完成
AND DOCS stage 剛完成（verdict: pass），無任何 pending stage
AND transcript 檔案大小為 8MB（> 5MB 閾值）
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: false }`
AND `suggest` 為 false（最後 stage 不需要壓縮空間，workflow 即將結束）

## Scenario: 剛 compact 過（距上次 compact 僅 1 個 stage）— 跳過建議

GIVEN 一個 standard workflow 的 DEV stage 剛完成（verdict: pass）
AND transcript 檔案大小為 7MB（> 5MB 閾值）
AND timeline 中有一筆 `session:compact` 事件
AND 在該事件之後只有 1 個 `stage:complete` 事件（DEV）
AND minStagesSinceCompact 預設為 2
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: false }`
AND `suggest` 為 false（距上次 compact 不足 2 個 stage，避免重複建議）

## Scenario: 距上次 compact 已完成足夠多 stage — 再次建議

GIVEN 一個 standard workflow 的 TEST:2 stage 剛完成（verdict: pass）
AND transcript 檔案大小為 6MB（> 5MB 閾值）
AND timeline 中有一筆 `session:compact` 事件（在 DEV 之前發生）
AND 在該事件之後已有 3 個 `stage:complete` 事件（DEV、REVIEW、TEST:2）
AND minStagesSinceCompact 預設為 2（3 >= 2）
AND 還有 RETRO、DOCS 尚未完成
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: true, ... }`
AND `suggest` 為 true

## Scenario: 從未 compact 過 — 允許首次觸發

GIVEN 一個 quick workflow 的 DEV stage 剛完成（verdict: pass）
AND transcript 檔案大小為 5.5MB（> 5MB 閾值）
AND timeline 中無任何 `session:compact` 事件
AND 還有 REVIEW、TEST、RETRO、DOCS 尚未完成
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: true, ... }`
AND `suggest` 為 true（從未 compact 過，無需 cooldown 檢查）

## Scenario: 自訂閾值 — 3MB 閾值，transcript 4MB 觸發

GIVEN 一個 standard workflow 的 ARCH stage 剛完成（verdict: pass）
AND transcript 檔案大小為 4MB
AND 還有多個 pending stage
AND timeline 中無任何 `session:compact` 事件
WHEN `shouldSuggestCompact` 以 `options: { thresholdBytes: 3_000_000 }` 執行
THEN 回傳 `{ suggest: true, transcriptSize: 4000000, ... }`
AND `suggest` 為 true（4MB > 自訂閾值 3MB）

## Scenario: 自訂 minStagesSinceCompact — 降低 cooldown 門檻

GIVEN 一個 standard workflow 的 DEV stage 剛完成（verdict: pass）
AND transcript 檔案大小為 6MB（> 5MB 閾值）
AND timeline 中有一筆 `session:compact` 事件
AND 在該事件之後有 1 個 `stage:complete` 事件（DEV）
AND 還有 pending stage
WHEN `shouldSuggestCompact` 以 `options: { minStagesSinceCompact: 1 }` 執行
THEN 回傳 `{ suggest: true, ... }`
AND `suggest` 為 true（1 >= 自訂 minStagesSinceCompact 1）

## Scenario: transcript_path 不存在 — 靜默降級

GIVEN `shouldSuggestCompact` 收到一個不存在的 `transcriptPath`
WHEN 函式執行
THEN 回傳 `{ suggest: false }`
AND 不拋出任何例外（靜默降級）

## Scenario: transcriptPath 為空字串或 undefined — 靜默降級

GIVEN `shouldSuggestCompact` 收到 `transcriptPath` 為空字串 `''`
WHEN 函式執行
THEN 回傳 `{ suggest: false }`
AND 不拋出任何例外

GIVEN `shouldSuggestCompact` 收到 `transcriptPath` 為 `undefined`
WHEN 函式執行
THEN 回傳 `{ suggest: false }`
AND 不拋出任何例外

## Scenario: statSync 失敗（如無讀取權限）— 靜默降級

GIVEN `transcriptPath` 指向一個存在但 statSync 操作會拋出例外的路徑
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: false }`
AND 不拋出任何例外

## Scenario: timeline 查詢失敗 — 靜默降級

GIVEN timeline 檔案損毀或查詢拋出例外
AND transcript 檔案大小為 6MB（> 5MB 閾值）
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: false }`
AND 不拋出任何例外
AND on-stop.js 主流程不受影響

## Scenario: 觸發時 emit session:compact-suggestion 事件

GIVEN 符合觸發條件（transcript 超閾值、非最後 stage、未剛 compact）
WHEN `shouldSuggestCompact` 回傳 `suggest: true`
AND on-stop.js 的 pass 分支將 compact 建議加入 `messages`
THEN timeline 中出現一筆 `session:compact-suggestion` 事件
AND 事件的 `category` 為 `'session'`
AND 事件的 `label` 為 `'Compact 建議'`
AND 事件的 `transcriptSize` 等於實際 transcript 大小（bytes）
AND 事件的 `stage` 等於觸發時的 stage key（如 `'DEV'`）
AND 事件的 `agent` 等於觸發時的 agent 名稱（如 `'developer'`）

## Scenario: result 訊息包含建議文字和格式化大小

GIVEN 觸發 compact 建議（transcript 為 6.5MB）
WHEN on-stop.js 將建議附加到 `messages` 並輸出 `result`
THEN `result` 字串中包含 `'6.5MB'`（格式化後的大小）
AND `result` 字串中包含壓縮建議的關鍵詞（如 `'compact'` 或 `'壓縮'` 或 `'/compact'`）
AND `result` 字串中已包含原有的 pass 完成訊息（`'完成'`）
AND compact 建議出現在 pass 完成訊息之後

## Scenario: fail/reject/issues verdict — 不建議 compact

GIVEN 一個 standard workflow 的 TEST stage 剛完成（verdict: fail）
AND transcript 檔案大小為 8MB（> 5MB 閾值）
AND 還有多個 pending stage
WHEN on-stop.js 的 fail 分支執行
THEN `result` 訊息不包含 compact 建議
AND timeline 中無 `session:compact-suggestion` 事件

GIVEN 一個 standard workflow 的 REVIEW stage 剛完成（verdict: reject）
AND transcript 檔案大小為 7MB（> 5MB 閾值）
WHEN on-stop.js 的 reject 分支執行
THEN `result` 訊息不包含 compact 建議

## Scenario: single workflow — DEV 完成（唯一 stage，不建議）

GIVEN 一個 single workflow，stages 為 [DEV]
AND DEV 剛完成（verdict: pass）
AND transcript 檔案大小為 6MB（> 5MB 閾值）
AND DEV 是唯一 stage，完成後無任何 pending stage
WHEN `shouldSuggestCompact` 執行
THEN 回傳 `{ suggest: false }`
AND `suggest` 為 false（最後 stage，workflow 結束，不需要 compact）

## Scenario: formatSize — 大小格式化正確

GIVEN compact 建議觸發，transcriptSize 為 6_500_000 bytes
THEN result 訊息中顯示 `'6.5MB'`

GIVEN compact 建議觸發，transcriptSize 為 800_000 bytes（假設閾值調低至 500KB）
THEN result 訊息中顯示 `'800KB'`

GIVEN compact 建議觸發，transcriptSize 為 500 bytes（假設閾值調低至 100 bytes）
THEN result 訊息中顯示 `'500B'`

## Scenario: registry 包含 session:compact-suggestion 事件定義

GIVEN `registry.js` 的 `timelineEvents` 物件
WHEN 讀取 `timelineEvents['session:compact-suggestion']`
THEN 取得 `{ label: 'Compact 建議', category: 'session' }`
AND `emit(sessionId, 'session:compact-suggestion', ...)` 不拋出 `'未知的 timeline 事件類型'` 錯誤
