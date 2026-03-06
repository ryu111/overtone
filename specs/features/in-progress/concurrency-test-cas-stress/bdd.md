# Feature: S1 — CAS Retry 直接測試（單元測試）

## Scenario S1-1: mtime 衝突觸發 retry
GIVEN workflow.json 已存在於臨時目錄
AND updateStateAtomic 讀取狀態後、寫入前 mtime 被外部修改
WHEN updateStateAtomic 嘗試 CAS 寫入
THEN 應偵測到 mtime 變化（currentMtime !== mtime）
AND 應觸發 retry（重新讀取 state 並重新執行 modifier）
AND 第一次衝突後 retry 計數 > 0

## Scenario S1-2: retry 之間存在 jitter delay
GIVEN workflow.json 已存在且 mtime 每次被呼叫後立即更新（持續衝突）
WHEN updateStateAtomic 執行 3 次 retry
THEN 每次 retry 前應有 1–5ms 的 jitter delay
AND 總耗時應 >= (MAX_RETRIES - 1) * 1ms（至少有 jitter 延遲）

## Scenario S1-3: MAX_RETRIES(3) 耗盡後執行 fallback 強制寫入
GIVEN workflow.json 存在
AND mtime 在每次 CAS 檢查時都被修改（持續衝突無法解決）
WHEN updateStateAtomic 執行，3 次 retry 全部失敗
THEN fallback 路徑被觸發（第 4 次不再比對 mtime，直接寫入）
AND 函式最終應回傳更新後的 state（不拋出例外）
AND workflow.json 應含有 modifier 執行後的結果

## Scenario S1-4: fallback 路徑同樣執行 enforceInvariants
GIVEN workflow.json 存在，state 含有孤兒 activeAgent（stage key 不存在於 stages）
AND mtime 持續衝突導致 3 次 retry 全部失敗
WHEN updateStateAtomic fallback 強制寫入
THEN enforceInvariants 應在 fallback 路徑中執行
AND 孤兒 activeAgent 應從最終寫入的 state 中被清除

## Scenario S1-5: retry 成功路徑（第 2 次 retry 成功）
GIVEN workflow.json 已存在
AND 第 1 次 CAS 檢查衝突，第 2 次成功（mtime 不再改變）
WHEN updateStateAtomic 執行
THEN 第 2 次 retry 的寫入應成功
AND 函式應回傳正確的 state（含 modifier 結果）
AND workflow.json 內容應與回傳 state 一致

## Scenario S1-6: enforceInvariants 在正常 CAS 成功路徑中執行
GIVEN workflow.json 存在，state 含有 status 不一致（有 completedAt 但 status 非 completed）
AND 無 mtime 衝突（CAS 第一次即成功）
WHEN updateStateAtomic 執行 modifier
THEN enforceInvariants 應修正 status 不一致
AND 最終寫入的 state 中對應 stage 的 status 應為 'completed'

## Scenario S1-7: modifier 回傳 undefined 時使用原始 state
GIVEN workflow.json 已存在，state 含有既有 stage 資料
WHEN updateStateAtomic 的 modifier 回傳 undefined（`return undefined`）
THEN fallback 應使用 `modifier(current) ?? current`（即原始 current）
AND 最終寫入的 state 應與讀取時的 current 一致

---

# Feature: S2 — 多進程並發壓力測試（整合測試）

## Scenario S2-1: N 個子進程同時 atomicWrite 同一檔案 — 無 .tmp 殘留
GIVEN 一個共享 workflow.json 目標路徑（位於臨時目錄）
AND 10 個 Bun.spawn 子進程各自呼叫 atomicWrite 寫入不同內容
WHEN 所有子進程並行執行並等待完成
THEN 目標目錄中不應有任何 .tmp 殘留檔案（`*.tmp`）
AND 最終 workflow.json 應存在且內容可被 JSON.parse

## Scenario S2-2: N 個子進程同時 atomicWrite — 最終內容來自某個子進程
GIVEN 10 個子進程各自 atomicWrite 一個包含唯一 `writerId` 欄位的 JSON 物件
WHEN 所有子進程完成
THEN workflow.json 的內容應完整且可 JSON.parse
AND `writerId` 欄位應存在（來自某個子進程的完整寫入）
AND 不應出現 JSON 損壞（部分寫入合併）

## Scenario S2-3: N 個子進程同時 appendFileSync 同一 JSONL — 行數正確
GIVEN 一個共享 timeline.jsonl 路徑（位於臨時目錄）
AND 10 個 Bun.spawn 子進程各自 appendFileSync 寫入 5 行（每行為合法 JSON）
WHEN 所有子進程並行執行並等待完成
THEN 最終 timeline.jsonl 的行數應 >= 50（允許部分進程合併，但不得少）
AND 非空白行數應恰好等於 50（10 * 5）
AND 每一行應可被 JSON.parse（無損壞行）

## Scenario S2-4: N 個子進程同時 appendFileSync — 無行資料丟失
GIVEN 10 個子進程各自寫入帶有唯一 `processId` 和 `lineIndex` 的 JSON 行
WHEN 所有子進程完成
THEN 解析後每個 `processId` 應恰好出現 5 次（無重複、無丟失）
AND 每個 `(processId, lineIndex)` 組合應唯一

## Scenario S2-5: atomicWrite 在 tmp 路徑命名衝突時仍保持唯一性
GIVEN 同一個進程呼叫 atomicWrite 多次（`_atomicCounter` 遞增）
WHEN 多次連續呼叫使用相同 `Date.now()`（毫秒精度相同）
THEN 每次產生的 tmp 路徑應不同（counter 確保唯一）
AND 不應有 EEXIST 錯誤

## Scenario S2-6: 高並發下 CAS 最終一致性（子進程各自呼叫 updateStateAtomic）
GIVEN 10 個 Bun.spawn 子進程各自呼叫 updateStateAtomic 更新同一 session 的 workflow.json
AND 每個子進程的 modifier 在 state 上遞增一個計數器欄位（`counter`）
WHEN 所有子進程完成
THEN 最終 workflow.json 可被 JSON.parse
AND 最終 `counter` 值 >= 1（至少有一次寫入成功）
AND 不應出現 JSON 損壞（每次 atomicWrite 的原子性保證）
