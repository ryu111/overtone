# Feature: lib/ 結構優化重構

本規格描述三個重構方案完成後的行為不變性。
所有 Scenario 均屬「重構後行為與重構前完全一致」的驗證。

---

## Phase 1: config-api.js 拆分 — config-validator.js

### Scenario: validateAgent 驗證 agent 名稱存在時回傳 valid
GIVEN config-validator.js 已從 config-api.js 提取
WHEN 呼叫 validateAgent('developer', pluginRoot) 且對應 .md 檔案存在
THEN 回傳 `{ valid: true, errors: [], warnings: [] }`

### Scenario: validateAgent 驗證 agent 名稱不存在時回傳錯誤
GIVEN config-validator.js 提供 validateAgent 函式
WHEN 呼叫 validateAgent('non-existent-agent', pluginRoot)
THEN 回傳 `{ valid: false, errors: [...], warnings: [] }`
AND errors 陣列包含「不存在」相關訊息

### Scenario: validateAgent 缺少必填欄位時回傳 invalid
GIVEN config-validator.js 提供 validateAgent 函式
WHEN agent .md 的 frontmatter 缺少 name/description/model 等必填欄位之一
THEN 回傳 `{ valid: false, errors: [...] }`
AND errors 包含對應欄位名稱的錯誤訊息

### Scenario: validateAgent 偵測到非法 model 值時回傳錯誤
GIVEN config-validator.js 提供 validateAgent 函式
WHEN agent frontmatter 的 model 欄位為不在合法清單中的值
THEN 回傳 `{ valid: false, errors: [...] }`
AND errors 包含「model 值不合法」訊息

### Scenario: validateAgent 偵測到 permissionMode 非 bypassPermissions 時回傳錯誤
GIVEN config-validator.js 提供 validateAgent 函式
WHEN agent frontmatter 的 permissionMode 非 'bypassPermissions'
THEN 回傳 `{ valid: false, errors: [...] }`

### Scenario: validateAgent 偵測到 disallowedTools 與 tools 同時設定時回傳錯誤
GIVEN config-validator.js 提供 validateAgent 函式
WHEN agent frontmatter 同時包含 disallowedTools 和 tools 欄位
THEN 回傳 `{ valid: false, errors: [...] }`
AND errors 包含「互斥」相關訊息

### Scenario: validateAgent 偵測到引用不存在 skill 時回傳錯誤
GIVEN config-validator.js 提供 validateAgent 函式
WHEN agent frontmatter 的 skills 陣列包含不存在的 skill 名稱
THEN 回傳 `{ valid: false, errors: [...] }`
AND errors 包含該 skill 名稱

### Scenario: validateSkill 驗證合法 skill 回傳 valid
GIVEN config-validator.js 提供 validateSkill 函式
WHEN 呼叫 validateSkill('testing', pluginRoot) 且對應目錄存在
THEN 回傳 `{ valid: true, errors: [], warnings: [] }`

### Scenario: validateSkill 驗證不存在 skill 回傳錯誤
GIVEN config-validator.js 提供 validateSkill 函式
WHEN 呼叫 validateSkill('non-existent', pluginRoot)
THEN 回傳 `{ valid: false, errors: [...] }`

### Scenario: validateHook 驗證合法 hook event 回傳 valid
GIVEN config-validator.js 提供 validateHook 函式
WHEN 呼叫 validateHook('UserPromptSubmit', pluginRoot) 且 hooks.json 中存在對應 event
THEN 回傳 `{ valid: true, errors: [], warnings: [] }`

### Scenario: validateHook 驗證不存在的 event 回傳錯誤
GIVEN config-validator.js 提供 validateHook 函式
WHEN 呼叫 validateHook('NonExistentEvent', pluginRoot)
THEN 回傳 `{ valid: false, errors: [...] }`

### Scenario: validateAll 聚合所有元件的驗證結果
GIVEN config-validator.js 提供 validateAll 函式
WHEN 呼叫 validateAll(pluginRoot) 且所有元件均合法
THEN 回傳包含所有 agents/skills/hooks 驗證結果的物件
AND 整體 valid 為 true

### Scenario: validateAll 發現任一錯誤時整體 valid 為 false
GIVEN config-validator.js 提供 validateAll 函式
WHEN 任何一個元件驗證回傳錯誤
THEN validateAll 的回傳結果整體 valid 為 false
AND 錯誤訊息被正確收集並回傳

---

## Phase 1: config-api.js 拆分後 — CRUD 函式行為不變

### Scenario: createAgent 成功建立新 agent 檔案
GIVEN config-api.js 拆分後保留 createAgent 函式
WHEN 呼叫 createAgent({ name: 'test-agent', model: 'sonnet', ... }, pluginRoot)
AND 對應 .md 檔案尚不存在
THEN 成功建立 agents/test-agent.md 檔案
AND 回傳包含 valid: true 的結果

### Scenario: createAgent 對已存在的 agent 回傳錯誤
GIVEN config-api.js 提供 createAgent 函式
WHEN 呼叫 createAgent 且 agents/{name}.md 已存在
THEN 回傳包含錯誤訊息的結果
AND 不覆蓋既有檔案

### Scenario: updateAgent 成功更新 agent 的 model
GIVEN config-api.js 提供 updateAgent 函式
AND agents/developer.md 已存在
WHEN 呼叫 updateAgent('developer', { model: 'opus' }, pluginRoot)
THEN agents/developer.md 的 model 欄位更新為 'opus'
AND 其他欄位保持不變

### Scenario: updateAgent 對不存在的 agent 回傳錯誤
GIVEN config-api.js 提供 updateAgent 函式
WHEN 呼叫 updateAgent('ghost-agent', { model: 'opus' }, pluginRoot)
THEN 回傳包含錯誤訊息的結果

### Scenario: bumpVersion 遞增 patch 版本號
GIVEN config-api.js 提供 bumpVersion 函式
WHEN 呼叫 bumpVersion('patch', pluginRoot)
THEN plugin.json 的 version 欄位 patch 部分 +1
AND 回傳新版本號字串

### Scenario: createSkill 成功建立新 skill 目錄和 SKILL.md
GIVEN config-api.js 提供 createSkill 函式
WHEN 呼叫 createSkill({ name: 'test-skill', ... }, pluginRoot)
THEN 成功建立 skills/test-skill/SKILL.md

### Scenario: createHook 成功建立 hook 腳本
GIVEN config-api.js 提供 createHook 函式
WHEN 呼叫 createHook({ event: 'TaskCompleted', ... }, pluginRoot)
THEN 成功在 hooks/scripts/ 下建立對應腳本

---

## Phase 1: 消費者相容性 — config-validator 整合

### Scenario: manage-component.js 呼叫 validate 函式行為不變
GIVEN config-api.js 保持向外匯出 validateAgent/validateSkill/validateHook/validateAll
WHEN manage-component.js require('./lib/config-api') 並呼叫其 validate 函式
THEN 所有驗證行為與重構前完全一致
AND 無任何路徑錯誤或 undefined 函式

### Scenario: validate-agents.js 執行完整驗證後輸出正確結果
GIVEN config-api.js 的 validateAll 仍正常可呼叫
WHEN 從命令列執行 bun scripts/validate-agents.js
THEN 輸出 agent/skill/hook 的驗證結果
AND 合法的元件不出現錯誤訊息

### Scenario: health-check.js 呼叫元件相關健檢項目正常運作
GIVEN config-api.js 或 config-validator.js 的函式可被 health-check.js 取用
WHEN 執行 bun scripts/health-check.js 的元件健檢項目
THEN 健檢結果正確（無 false negative）
AND 無 require 路徑錯誤

---

## Phase 2a: lib/analyzers/ 子目錄 — 模組功能不變

### Scenario: cross-analyzer 移動後 data.js 正常載入
GIVEN cross-analyzer.js 已移動至 lib/analyzers/cross-analyzer.js
AND data.js 的 require 路徑已更新
WHEN require('./lib/analyzers/cross-analyzer') 或透過 data.js 呼叫
THEN analyzeFailureHotspot / analyzeHookOverhead / analyzeWorkflowVelocity 均可正常呼叫

### Scenario: cross-analyzer analyzeFailureHotspot 回傳正確聚合結果
GIVEN cross-analyzer.js 移動至 analyzers/ 子目錄
WHEN 呼叫 analyzeFailureHotspot(sessions) 傳入包含失敗記錄的 sessions 陣列
THEN 回傳依 stage 聚合的失敗熱點統計
AND 結果結構與移動前完全一致

### Scenario: dead-code-scanner 移動後功能不變
GIVEN dead-code-scanner.js 已移動至 lib/analyzers/dead-code-scanner.js
AND 所有消費者的 require 路徑已更新
WHEN 呼叫 scanUnusedExports(pluginRoot)
THEN 正確掃描並回傳未使用的 export
AND 無路徑錯誤或 undefined 函式

### Scenario: docs-sync-engine 移動後 scanDrift 和 fixDrift 行為不變
GIVEN docs-sync-engine.js 已移動至 lib/analyzers/docs-sync-engine.js
WHEN 呼叫 scanDrift(pluginRoot)
THEN 正確偵測 status.md 與實際元件數量的差異
AND 回傳結構與移動前一致

### Scenario: guard-system 移動後 enforceInvariants 行為不變
GIVEN guard-system.js 已移動至 lib/analyzers/guard-system.js
WHEN 呼叫 enforceInvariants(state) 傳入違反不變量的 state
THEN 正確偵測並回傳違規訊息
AND 修正後的 state 符合所有不變量

### Scenario: component-repair 移動後 autoRepair 行為不變
GIVEN component-repair.js 已移動至 lib/analyzers/component-repair.js
WHEN 呼叫 autoRepair(pluginRoot)
THEN 正確掃描並修復元件不一致問題
AND 結果結構與移動前一致

### Scenario: hook-diagnostic 移動後行為不變
GIVEN hook-diagnostic.js 已移動至 lib/analyzers/hook-diagnostic.js
WHEN 呼叫 hook-diagnostic 的診斷函式
THEN 正確回傳 hooks.json 結構診斷結果
AND 無路徑錯誤

### Scenario: test-quality-scanner 移動後行為不變
GIVEN test-quality-scanner.js 已移動至 lib/analyzers/test-quality-scanner.js
WHEN 呼叫掃描函式
THEN 正確回傳測試品質掃描結果
AND 結果結構與移動前一致

---

## Phase 2b: lib/knowledge/ 子目錄 — 模組功能不變

### Scenario: instinct 移動後 6 個 handler 的 require 正常解析
GIVEN instinct.js 已移動至 lib/knowledge/instinct.js
AND 所有引用 instinct 的 handler 路徑已更新
WHEN 任何 handler 模組被 require 時
THEN instinct 模組正確載入，無 MODULE_NOT_FOUND 錯誤

### Scenario: knowledge-archiver 移動後 archiveKnowledge 行為不變
GIVEN knowledge-archiver.js 已移動至 lib/knowledge/knowledge-archiver.js
WHEN 呼叫 archiveKnowledge(agentName, result, sessionDir)
THEN 正確執行知識歸檔邏輯
AND 結果與移動前完全一致

### Scenario: knowledge-gap-detector 移動後 detectGaps 行為不變
GIVEN knowledge-gap-detector.js 已移動至 lib/knowledge/knowledge-gap-detector.js
WHEN 呼叫 detectGaps(agentName, handoffContent)
THEN 正確偵測知識缺口
AND 回傳結構與移動前一致

### Scenario: knowledge-searcher 移動後搜尋功能不變
GIVEN knowledge-searcher.js 已移動至 lib/knowledge/knowledge-searcher.js
WHEN 呼叫 search(query, pluginRoot)
THEN 正確搜尋知識庫並回傳結果
AND 無路徑解析錯誤

### Scenario: skill-router 移動後路由功能不變
GIVEN skill-router.js 已移動至 lib/knowledge/skill-router.js
WHEN 呼叫 routeToSkill(domain, agentName)
THEN 正確路由到對應的 skill
AND 結果與移動前完全一致

### Scenario: global-instinct 移動後 graduate 和 queryGlobal 行為不變
GIVEN global-instinct.js 已移動至 lib/knowledge/global-instinct.js
AND data.js 的 require 路徑已更新
WHEN 呼叫 graduate(instinct) 和 queryGlobal(topic)
THEN 行為與移動前一致

---

## 整合驗證：完整測試套件

### Scenario: 重構後所有單元測試通過
GIVEN 所有模組已完成移動且 require 路徑已更新
WHEN 從專案根目錄執行 bun test
THEN 所有既有測試（共 3366 個）全部 pass
AND 無任何測試因路徑錯誤或 undefined 函式而失敗

### Scenario: 重構後測試數量不減少
GIVEN 重構前測試數量為 3366
WHEN 重構完成後執行 bun test
THEN pass 數量 >= 3366
AND 無新增 skip 或 pending 測試

### Scenario: require 路徑更新後無殘留舊路徑
GIVEN 所有模組已移至新位置
WHEN 掃描 scripts/ 目錄下所有 .js 檔案中的 require 路徑
THEN 無任何檔案仍 require 舊的 lib/cross-analyzer 等路徑（移動後的舊位置）
AND 所有新路徑 require 均可成功解析

### Scenario: health-check 12 項全部通過
GIVEN 重構完成
WHEN 執行 bun scripts/health-check.js
THEN 12 項健檢均無 errors（warnings 不阻擋）
AND checkDeadExports 不回報因路徑更新造成的假陽性
