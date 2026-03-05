---
feature: health-check-principles
stage: TEST:spec
created: 2026-03-05
author: tester
---

# Feature: checkClosedLoop — 孤立事件流偵測

## Scenario: 所有 timeline 事件均有 consumer 時不產生 warning
GIVEN codebase 中每個 timelineEvent（registry.js）都有對應的 consumer 呼叫（timeline.query 或 timeline.latest）
WHEN 執行 checkClosedLoop()
THEN 回傳空陣列（無 findings）

## Scenario: 有 emit 但無 consumer 的事件觸發 warning
GIVEN codebase 中存在一個 timelineEvent key「agent:test-event」
AND 沒有任何程式碼以 timeline.query 或 timeline.latest 消費該事件
WHEN 執行 checkClosedLoop()
THEN 回傳至少一個 finding
AND finding.check === 'closed-loop'
AND finding.severity === 'warning'
AND finding.message 包含事件名稱

## Scenario: exempt 事件不觸發 warning（fire-and-forget 設計決策）
GIVEN timelineEvents 包含 'session:compact-suggestion'、'hook:timing'、'queue:auto-write'
AND 這些事件在 codebase 中沒有 consumer
WHEN 執行 checkClosedLoop()
THEN 不產生這三個事件的 warning finding

## Scenario: health-check.js 本身被排除在掃描範圍外
GIVEN health-check.js 內部有 event 名稱字串（用於偵測邏輯）
WHEN 執行 checkClosedLoop()
THEN health-check.js 不被當作 consumer 計入

## Scenario: 真實 codebase 中現有 12 項 check 加上 checkClosedLoop 共 15 項
GIVEN 現有 health-check.js runAllChecks 有 12 個 checkDef
WHEN 新增 3 個原則偵測 check 後執行 runAllChecks()
THEN checks.length === 15

---

# Feature: checkRecoveryStrategy — 失敗恢復策略偵測

## Scenario: handler 主入口函式有 try-catch 時不產生 warning
GIVEN 一個 handler 模組（*-handler.js）的主入口函式（handle* 或 run）包含頂層 try { ... }
WHEN 執行 checkRecoveryStrategy(pluginRootOverride)
THEN 不產生此 handler 的 finding

## Scenario: handler 主入口函式缺少 try-catch 時產生 warning
GIVEN 一個 *-handler.js 的主入口函式不包含任何 try { ... } 語法
WHEN 執行 checkRecoveryStrategy(pluginRootOverride)
THEN 回傳一個 finding
AND finding.check === 'recovery-strategy'
AND finding.severity === 'warning'
AND finding.message 包含「缺少頂層 try-catch 保護」
AND finding.file 包含該 handler 的相對路徑

## Scenario: agent .md 有停止條件描述時不產生 warning
GIVEN 一個 agent .md 的 body 包含「停止條件」或「STOP」或「誤判防護」等關鍵詞之一
WHEN 執行 checkRecoveryStrategy(pluginRootOverride)
THEN 不產生此 agent 的 finding

## Scenario: agent .md 缺少停止條件描述時產生 warning
GIVEN 一個 agent .md 的 body 完全不包含任何停止條件相關關鍵詞（停止條件、STOP、誤判防護、失敗恢復、error recovery、停止點）
WHEN 執行 checkRecoveryStrategy(pluginRootOverride)
THEN 回傳一個 finding
AND finding.check === 'recovery-strategy'
AND finding.severity === 'warning'
AND finding.message 包含該 agent 的 name 欄位
AND finding.message 包含「缺少停止條件或誤判防護描述」

## Scenario: handler 掃描範圍動態取自目錄，不硬編碼數量
GIVEN scripts/lib/ 目錄下有任意數量的 *-handler.js 檔案
WHEN 執行 checkRecoveryStrategy(pluginRootOverride)
THEN 所有符合 *-handler.js 命名的檔案都被掃描（不跳過任何一個）

---

# Feature: checkCompletionGap — 補全能力缺口偵測

## Scenario: skill 目錄有 references/ 子目錄時不產生 warning
GIVEN 一個 skill 目錄（skills/{name}/）包含 references/ 子目錄
WHEN 執行 checkCompletionGap(skillsDirOverride)
THEN 不產生此 skill 的 finding

## Scenario: skill 目錄缺少 references/ 子目錄時產生 warning
GIVEN 一個 skill 目錄（skills/{name}/）不包含 references/ 子目錄
WHEN 執行 checkCompletionGap(skillsDirOverride)
THEN 回傳一個 finding
AND finding.check === 'completion-gap'
AND finding.severity === 'warning'
AND finding.message 包含 skill 名稱
AND finding.message 包含「缺少 references/ 目錄」

## Scenario: 多個 skill 混合有無 references/ 時各自獨立判定
GIVEN skills 目錄有三個 skill：skillA（有 references/）、skillB（無 references/）、skillC（無 references/）
WHEN 執行 checkCompletionGap(skillsDirOverride)
THEN 只有 skillB 和 skillC 各自產生 warning finding
AND skillA 不產生任何 finding

## Scenario: skills 目錄為空時回傳空陣列
GIVEN skillsDirOverride 指向一個空目錄（無任何子目錄）
WHEN 執行 checkCompletionGap(skillsDirOverride)
THEN 回傳空陣列

---

# Feature: manage-component create 原則合規提示

## Scenario: create agent 成功後輸出失敗恢復策略提示
GIVEN manage-component.js 的 create agent 指令成功完成
WHEN 建立新 agent 後
THEN stderr 包含失敗恢復策略相關提示訊息
AND 提示包含「停止條件」或「失敗恢復」等引導詞

## Scenario: create skill 成功後輸出 references/ 補全能力提示
GIVEN manage-component.js 的 create skill 指令成功完成
WHEN 建立新 skill 後
THEN stderr 包含 references/ 目錄的相關提示訊息
AND 提示包含「references/」或「checkCompletionGap」等引導詞

## Scenario: create hook 成功後不輸出原則合規提示
GIVEN manage-component.js 的 create hook 指令成功完成
WHEN 建立新 hook 後
THEN stderr 不包含失敗恢復策略或 references/ 提示（原則提示不適用 hook）

---

# Feature: Finding schema 相容性

## Scenario: 三個新 check 的 Finding 不包含新必填欄位
GIVEN checkClosedLoop / checkRecoveryStrategy / checkCompletionGap 各自產生至少一個 finding
WHEN 驗證 Finding 物件結構
THEN finding 包含 check、severity、file、message 四個欄位
AND finding 不包含任何非 Finding schema 定義的必填欄位
AND severity 值為 'warning'（三個新 check 均為 warning 級）
