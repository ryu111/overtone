# Feature: retro-docs-parallel — RETRO 與 DOCS 並行執行

## Scenario A-1: parallelGroupDefs 包含 postdev 群組
GIVEN registry.js 的 parallelGroupDefs 物件
WHEN 讀取所有已定義的群組 key
THEN 其中包含 'postdev' key

## Scenario A-2: 含 RETRO + DOCS 的 6 個 workflow 的 parallelGroups 包含 postdev
GIVEN registry.js 的 workflows 定義
WHEN 讀取 quick / standard / full / secure / product / product-full 各 workflow 的 parallelGroups
THEN 每個 workflow 的 parallelGroups 陣列都包含 'postdev'

## Scenario A-3: postdev 群組成員是 RETRO 和 DOCS
GIVEN registry.js 的 parallelGroupDefs
WHEN 讀取 parallelGroupDefs['postdev']
THEN 其值為包含 'RETRO' 和 'DOCS' 的陣列
AND 成員數量為 2

## Scenario B-1: RETRO verdict=issues 時 stage 標記為 completed + result='issues'
GIVEN agent-stop-handler 處理 RETRO stage 的 stop 事件
WHEN verdict 為 'issues'
THEN updateStateAtomic callback 將 RETRO stage 的 status 設為 'completed'
AND stage 的 result 設為 'issues'
AND completedAt 記錄當前時間戳記

## Scenario B-2: RETRO verdict=pass 時 stage 標記為 completed + result='pass'（無回歸）
GIVEN agent-stop-handler 處理 RETRO stage 的 stop 事件
WHEN verdict 為 'pass'
THEN updateStateAtomic callback 將 RETRO stage 的 status 設為 'completed'
AND stage 的 result 設為 'pass'
AND completedAt 記錄當前時間戳記

## Scenario B-3: RETRO verdict=issues 觸發 isConvergedOrFailed = true
GIVEN agent-stop-handler 處理 RETRO stage 的 stop 事件
WHEN verdict 為 'issues'
THEN isConvergedOrFailed 設為 true
AND finalResult 設為 'issues'

## Scenario C-1: RETRO pass + DOCS pass — 正常收斂，無 issues 提示
GIVEN stop-message-builder 的 buildStopMessages 接收到 postdev 群組收斂事件
AND state.stages['RETRO'].result 為 'pass'
AND state.stages['DOCS'].result 為 'pass'
WHEN checkParallelConvergence 偵測到 postdev 群組全部 completed
THEN 輸出訊息中不包含 'RETRO 回顧發現改善建議'
AND 輸出訊息中不包含 '可選：觸發'

## Scenario C-2: RETRO issues + DOCS pass — 收斂後附加 issues 提示
GIVEN stop-message-builder 的 buildStopMessages 接收到 postdev 群組收斂事件
AND state.stages['RETRO'].result 為 'issues'
AND state.stages['DOCS'].result 為 'pass'
AND state.retroCount 為 1
WHEN checkParallelConvergence 偵測到 postdev 群組全部 completed
THEN 輸出訊息中包含 'RETRO 回顧發現改善建議（retroCount: 1/3）'
AND 輸出訊息中包含 '可選：觸發 /auto 新一輪優化，或標記工作流完成'

## Scenario C-3: DOCS 先完成時無收斂提示，RETRO 後完成時觸發收斂提示
GIVEN postdev 群組（RETRO + DOCS）正在並行執行
AND DOCS 先 stop，RETRO 尚未完成
WHEN DOCS 的 stop-message-builder 執行
THEN 輸出訊息中不包含 postdev 收斂提示（群組尚未完全收斂）
WHEN RETRO 後續 stop，stop-message-builder 偵測到 postdev 群組全部 completed
AND state.stages['RETRO'].result 為 'issues'
THEN 輸出訊息中包含 'RETRO 回顧發現改善建議'

## Scenario C-4: RETRO 先完成時無收斂提示，DOCS 後完成時觸發收斂提示
GIVEN postdev 群組（RETRO + DOCS）正在並行執行
AND RETRO 先 stop（result: 'issues'），DOCS 尚未完成
WHEN RETRO 的 stop-message-builder 執行
THEN 輸出訊息中不包含 postdev 收斂提示（群組尚未完全收斂）
WHEN DOCS 後續 stop，stop-message-builder 偵測到 postdev 群組全部 completed
AND state.stages['RETRO'].result 為 'issues'
THEN 輸出訊息中包含 'RETRO 回顧發現改善建議'

## Scenario C-5: retroCount 達到上限（3）時顯示迭代上限訊息
GIVEN stop-message-builder 的 buildStopMessages 接收到 postdev 群組收斂事件
AND state.stages['RETRO'].result 為 'issues'
AND state.retroCount 為 3
WHEN checkParallelConvergence 偵測到 postdev 群組全部 completed
THEN 輸出訊息中包含 'RETRO 回顧發現改善建議（retroCount: 3/3）'
AND 輸出訊息中包含 '已達迭代上限（3 次），工作流完成'
AND 輸出訊息中不包含 '可選：觸發 /auto'
