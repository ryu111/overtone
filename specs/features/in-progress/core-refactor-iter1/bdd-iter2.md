# Feature: 迭代 2 模組化提取 — formatSize、findActualStageKey、checkParallelConvergence、getNextStageHint

## 背景

本次迭代將 on-stop.js 的 4 個輔助函式提取到 lib 模組：
- `formatSize` → `utils.js`（合併 on-stop.js 與 statusline.js 的重複實作）
- `findActualStageKey` → `state.js`
- `checkParallelConvergence` → `state.js`（新增 `parallelGroups` 參數）
- `getNextStageHint` → `state.js`（新增 `options` 參數）

行為規則：提取後的函式輸出必須與提取前完全一致，無任何語意破壞。

---

## Feature: formatSize — 位元組格式化統一行為

### Scenario: 正常路徑 — 大於等於 1MB 時以小數點一位 MB 顯示
GIVEN 傳入 bytes 為 6_500_000
WHEN 呼叫 formatSize(6_500_000)
THEN 回傳字串為 '6.5MB'

### Scenario: 正常路徑 — 大於等於 1KB 且小於 1MB 時以四捨五入 KB 顯示
GIVEN 傳入 bytes 為 800_000
WHEN 呼叫 formatSize(800_000)
THEN 回傳字串為 '800KB'

### Scenario: 正常路徑 — 小於 1KB 時以 B 顯示
GIVEN 傳入 bytes 為 500
WHEN 呼叫 formatSize(500)
THEN 回傳字串為 '500B'

### Scenario: 邊界條件 — 恰好 1MB 時以 MB 顯示
GIVEN 傳入 bytes 為 1_000_000
WHEN 呼叫 formatSize(1_000_000)
THEN 回傳字串為 '1.0MB'

### Scenario: 邊界條件 — 恰好 1KB 時以 KB 顯示
GIVEN 傳入 bytes 為 1_000
WHEN 呼叫 formatSize(1_000)
THEN 回傳字串為 '1KB'

### Scenario: 邊界條件 — 0 bytes 時以 B 顯示
GIVEN 傳入 bytes 為 0
WHEN 呼叫 formatSize(0)
THEN 回傳字串為 '0B'

### Scenario: 統一後邊界行為 — null 輸入時回傳 '--'
GIVEN 傳入 bytes 為 null
WHEN 呼叫 utils.js 的 formatSize(null)
THEN 回傳字串為 '--'
AND 不拋出例外

### Scenario: 統一後邊界行為 — undefined 輸入時回傳 '--'
GIVEN 傳入 bytes 為 undefined
WHEN 呼叫 utils.js 的 formatSize(undefined)
THEN 回傳字串為 '--'
AND 不拋出例外

### Scenario: 錯誤處理 — on-stop.js 舊版 formatSize 不接受 null（行為對齊確認）
GIVEN on-stop.js 原始 formatSize 沒有 null guard
WHEN 提取後 utils.js 的 formatSize 成為唯一實作
THEN statusline.js 的 null/undefined 行為（回傳 '--'）必須被保留
AND on-stop.js 中原本傳入的 size 值來自 statSync().size（已確保非 null），行為不變

---

## Feature: findActualStageKey — 狀態中定位實際 stage key

### Scenario: 正常路徑 — 找到與 baseStage 完全匹配且狀態為 active 的 key
GIVEN currentState.stages 包含 { 'TEST': { status: 'active' }, 'TEST:2': { status: 'pending' } }
AND baseStage 為 'TEST'
WHEN 呼叫 findActualStageKey(currentState, 'TEST')
THEN 回傳 'TEST'

### Scenario: 正常路徑 — 帶編號且 active 的 key（第一優先失敗後的 fallback）
GIVEN currentState.stages 包含 { 'TEST': { status: 'completed' }, 'TEST:2': { status: 'active' } }
AND baseStage 為 'TEST'
WHEN 呼叫 findActualStageKey(currentState, 'TEST')
THEN 回傳 'TEST:2'

### Scenario: 正常路徑 — 無 active 時找 pending 作為最後 fallback
GIVEN currentState.stages 包含 { 'TEST': { status: 'completed' }, 'TEST:2': { status: 'pending' } }
AND baseStage 為 'TEST'
WHEN 呼叫 findActualStageKey(currentState, 'TEST')
THEN 回傳 'TEST:2'

### Scenario: 邊界條件 — baseStage 完全不存在於 stages
GIVEN currentState.stages 包含 { 'DEV': { status: 'completed' } }
AND baseStage 為 'TEST'
WHEN 呼叫 findActualStageKey(currentState, 'TEST')
THEN 回傳 null

### Scenario: 邊界條件 — 所有相關 stage 均為 completed
GIVEN currentState.stages 包含 { 'TEST': { status: 'completed' }, 'TEST:2': { status: 'completed' } }
AND baseStage 為 'TEST'
WHEN 呼叫 findActualStageKey(currentState, 'TEST')
THEN 回傳 null

### Scenario: 錯誤處理 — stages 為空物件
GIVEN currentState.stages 為 {}
AND baseStage 為 'TEST'
WHEN 呼叫 findActualStageKey(currentState, 'TEST')
THEN 回傳 null
AND 不拋出例外

---

## Feature: checkParallelConvergence — 並行群組收斂判斷

### Scenario: 正常路徑 — 群組中全部成員均已 completed 時回傳群組名
GIVEN currentState.stages 包含 { 'REVIEW': { status: 'completed' }, 'TEST': { status: 'completed' }, 'RETRO': { status: 'pending' } }
AND parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 checkParallelConvergence(currentState, parallelGroups)
THEN 回傳 { group: 'quality' }

### Scenario: 正常路徑 — 帶編號的 stage 也計入收斂判斷（如 TEST:2）
GIVEN currentState.stages 包含 { 'REVIEW': { status: 'completed' }, 'TEST:2': { status: 'completed' } }
AND parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 checkParallelConvergence(currentState, parallelGroups)
THEN 回傳 { group: 'quality' }

### Scenario: 正常路徑 — 群組有成員未完成時回傳 null
GIVEN currentState.stages 包含 { 'REVIEW': { status: 'completed' }, 'TEST': { status: 'active' } }
AND parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 checkParallelConvergence(currentState, parallelGroups)
THEN 回傳 null

### Scenario: 邊界條件 — 相關 stage 不足 2 個時跳過該群組
GIVEN currentState.stages 包含 { 'REVIEW': { status: 'completed' } }
AND parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 checkParallelConvergence(currentState, parallelGroups)
THEN 回傳 null（群組 relevantKeys.length < 2，跳過）

### Scenario: 邊界條件 — parallelGroups 為空物件時不觸發任何群組
GIVEN currentState.stages 包含 { 'REVIEW': { status: 'completed' }, 'TEST': { status: 'completed' } }
AND parallelGroups 為 {}
WHEN 呼叫 checkParallelConvergence(currentState, {})
THEN 回傳 null

### Scenario: 錯誤處理 — stages 中無任何群組成員
GIVEN currentState.stages 包含 { 'DEV': { status: 'completed' } }
AND parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 checkParallelConvergence(currentState, parallelGroups)
THEN 回傳 null
AND 不拋出例外

---

## Feature: getNextStageHint — 工作流下一步提示

### Scenario: 正常路徑 — 有下一個 pending stage 且無 active agent 時提示單步委派
GIVEN currentState.currentStage 為 'DOCS'
AND currentState.activeAgents 為 {}
AND currentState.stages 包含 { 'DEV': { status: 'completed' }, 'DOCS': { status: 'pending' } }
AND options.stages 為 registry stages 定義
AND options.parallelGroups 為 {}（DOCS 不在任何並行群組）
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳 '委派 {emoji} documenter（文件）' 格式的字串

### Scenario: 正常路徑 — currentStage 屬於並行群組且有多個連續 pending 成員時提示並行委派
GIVEN currentState.currentStage 為 'REVIEW'
AND currentState.activeAgents 為 {}
AND currentState.stages 包含 { 'DEV': { status: 'completed' }, 'REVIEW': { status: 'pending' }, 'TEST:2': { status: 'pending' }, 'RETRO': { status: 'pending' } }
AND options.parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳包含 '並行委派' 字樣的字串
AND 回傳字串包含 REVIEW 和 TEST 兩個 stage 的 emoji + label

### Scenario: 正常路徑 — 仍有 active agent 時提示等待
GIVEN currentState.currentStage 為 'TEST:2'
AND currentState.activeAgents 包含 { 'reviewer': { stage: 'REVIEW' } }
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳 '等待並行 agent 完成：reviewer' 格式的字串

### Scenario: 正常路徑 — 所有 stage 均已 completed 時回傳 null
GIVEN currentState.currentStage 為 'DOCS'
AND currentState.activeAgents 為 {}
AND currentState.stages 所有值的 status 均為 'completed'
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳 null

### Scenario: 邊界條件 — currentStage 為 null 時立即回傳 null
GIVEN currentState.currentStage 為 null
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳 null

### Scenario: 邊界條件 — currentStage 的 base 不在 registry stages 時回傳通用提示
GIVEN currentState.currentStage 為 'UNKNOWN-STAGE'
AND currentState.activeAgents 為 {}
AND currentState.stages 包含 { 'UNKNOWN-STAGE': { status: 'pending' } }
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳 '執行 UNKNOWN-STAGE' 格式的字串

### Scenario: 錯誤處理 — 並行群組只有 1 個連續 pending 成員時退化為單步委派
GIVEN currentState.currentStage 為 'REVIEW'
AND currentState.activeAgents 為 {}
AND currentState.stages 包含 { 'REVIEW': { status: 'pending' }, 'TEST:2': { status: 'completed' } }
AND options.parallelGroups 為 { 'quality': ['REVIEW', 'TEST'] }
WHEN 呼叫 getNextStageHint(currentState, { stages, parallelGroups })
THEN 回傳單步委派格式（parallelCandidates.length 為 1，不觸發並行提示）

---

## Feature: 模組提取後的介面相容性驗證

### Scenario: on-stop.js 呼叫 utils.js 的 formatSize 結果與原 on-stop.js 本地版本一致
GIVEN formatSize 已從 on-stop.js 提取到 utils.js
AND on-stop.js 的 shouldSuggestCompact 改為從 utils.js import formatSize
WHEN 傳入相同的 size 數值（如 5_200_000）
THEN utils.js 的 formatSize(5_200_000) 回傳 '5.2MB'
AND 原 on-stop.js 本地版 formatSize(5_200_000) 也回傳 '5.2MB'

### Scenario: state.js 的 findActualStageKey 簽名相容 on-stop.js 原呼叫方式
GIVEN on-stop.js 原本以 findActualStageKey(currentState, stageKey) 呼叫
WHEN state.js export findActualStageKey(currentState, baseStage)
THEN 參數位置與型別完全一致，on-stop.js 呼叫端無需修改

### Scenario: state.js 的 checkParallelConvergence 新增 parallelGroups 參數後仍向後相容
GIVEN on-stop.js 原本呼叫 checkParallelConvergence(updatedState)（不傳第二參數）
WHEN 提取後簽名為 checkParallelConvergence(currentState, parallelGroups)
THEN on-stop.js 呼叫端必須更新為 checkParallelConvergence(updatedState, parallelGroups)
AND 若測試時呼叫舊簽名（缺少 parallelGroups）parallelGroups 為 undefined，Object.entries(undefined) 會拋錯

### Scenario: state.js 的 getNextStageHint 新增 options 參數後仍向後相容
GIVEN on-stop.js 原本呼叫 getNextStageHint(currentState)（不傳第二參數）
WHEN 提取後簽名為 getNextStageHint(currentState, { stages, parallelGroups })
THEN on-stop.js 呼叫端必須更新為 getNextStageHint(updatedState, { stages, parallelGroups })
AND 若 options 未傳，函式應有 default 值或防禦性判斷，不拋出例外
