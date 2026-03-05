---
feature: evolution-engine-gap-detect
status: in-progress
created: 2026-03-05
---

# Feature: Gap Analyzer 核心行為

## Scenario: analyzeGaps 回傳 GapReport 結構
GIVEN health-check 的四個 check 函式可正常呼叫
WHEN 呼叫 analyzeGaps() 不帶任何 options
THEN 回傳值包含 gaps 陣列
AND 回傳值包含 summary 物件
AND summary 包含 total、byType、bySeverity 三個欄位
AND byType 的 key 為 missing-skill、broken-chain、missing-consumer、no-references、sync-mismatch
AND bySeverity 的 key 為 error、warning、info

## Scenario: component-chain 缺口映射為 broken-chain 或 missing-skill
GIVEN health-check 的 checkComponentChain 回傳含 component-chain findings 的結果
WHEN 某個 finding 描述 agent 不存在（agents/*.md 路徑）
THEN 對應的 gap.type 為 broken-chain
AND gap.sourceCheck 為 component-chain
AND gap.suggestion 包含 manage-component.js create agent

WHEN 某個 finding 描述 skill 不存在
THEN 對應的 gap.type 為 missing-skill
AND gap.sourceCheck 為 component-chain
AND gap.suggestion 包含 manage-component.js create skill

## Scenario: closed-loop 缺口映射為 missing-consumer
GIVEN health-check 的 checkClosedLoop 回傳含 closed-loop findings 的結果
WHEN finding 的 file 指向 scripts/lib/registry.js
THEN 對應的 gap.type 為 missing-consumer
AND gap.sourceCheck 為 closed-loop
AND gap.suggestion 包含 fix-consistency.js

## Scenario: completion-gap 缺口映射為 no-references
GIVEN health-check 的 checkCompletionGap 回傳含 completion-gap findings 的結果
WHEN finding 的 file 指向 skills/*/ 路徑
THEN 對應的 gap.type 為 no-references
AND gap.sourceCheck 為 completion-gap
AND gap.suggestion 包含 mkdir -p plugins/overtone/skills/

## Scenario: dependency-sync 缺口映射為 sync-mismatch
GIVEN health-check 的 checkDependencySync 回傳含 dependency-sync findings 的結果
WHEN finding 的 file 指向 agents/*.md 或 skills/*/SKILL.md
THEN 對應的 gap.type 為 sync-mismatch
AND gap.sourceCheck 為 dependency-sync
AND gap.suggestion 包含 fix-consistency.js --fix

## Scenario: gap.severity 繼承自 health-check finding
GIVEN health-check 回傳的 finding 有 severity 欄位
WHEN analyzeGaps 轉換為 Gap 物件
THEN gap.severity 等於 finding.severity 原始值（不重新映射）
AND gap.message 繼承自 finding.message

## Scenario: 去重邏輯 — 同 type+file 只保留一筆
GIVEN 兩個不同的 check 函式對同一個 file 回報相同 type 的問題
WHEN analyzeGaps 組合所有 check 結果
THEN gaps 陣列中該 type+file 組合只出現一次（先到者勝）
AND summary.total 計入去重後的數量

## Scenario: 同 file 不同 type 保留兩筆（不過度去重）
GIVEN component-chain 和 dependency-sync 對同一個 agents/*.md 各回報一個問題
WHEN 兩個問題的 type 不同（broken-chain vs sync-mismatch）
THEN gaps 陣列中保留兩筆 — 一筆 broken-chain，一筆 sync-mismatch
AND summary.total 為 2

## Scenario: summary 統計正確
GIVEN analyzeGaps 回傳 3 個 error 缺口和 2 個 warning 缺口
WHEN 讀取 summary 欄位
THEN summary.total 為 5
AND summary.bySeverity.error 為 3
AND summary.bySeverity.warning 為 2
AND summary.bySeverity.info 為 0
AND summary.byType 的各型別數量加總等於 summary.total

## Scenario: checks 參數可過濾只執行特定 check
GIVEN analyzeGaps options 中指定 checks: ['dependency-sync']
WHEN 呼叫 analyzeGaps({ checks: ['dependency-sync'] })
THEN 只執行 checkDependencySync，不執行其他三個 check
AND 回傳的 gaps 陣列中 sourceCheck 全部為 dependency-sync

## Scenario: suggestion 含有完整的 manage-component.js 指令格式
GIVEN analyzeGaps 偵測到 missing-skill 類型缺口
WHEN 讀取 gap.suggestion 欄位
THEN suggestion 字串包含 bun scripts/manage-component.js
AND suggestion 包含佔位符（如 <skillName>、<description>）
AND suggestion 不為空字串

---

# Feature: Evolution CLI 行為

## Scenario: analyze 子命令輸出純文字報告
GIVEN evolution.js 可執行
AND gap-analyzer 偵測到若干缺口
WHEN 執行 bun scripts/evolution.js analyze
THEN 標準輸出包含各缺口的 type、severity、file、message
AND 標準輸出包含 suggestion 行動建議
AND exit code 為 1（有缺口）

## Scenario: analyze --json 輸出 JSON 格式
GIVEN gap-analyzer 偵測到若干缺口
WHEN 執行 bun scripts/evolution.js analyze --json
THEN 標準輸出為合法的 JSON 字串
AND JSON 解析後包含 gaps 陣列和 summary 物件
AND gaps 陣列各元素包含 type、severity、file、message、suggestion、sourceCheck 欄位
AND exit code 為 1

## Scenario: 無缺口時 exit 0
GIVEN gap-analyzer 執行後未偵測到任何缺口
WHEN 執行 bun scripts/evolution.js analyze
THEN 標準輸出包含「無缺口」或「No gaps」等正向訊息
AND exit code 為 0

## Scenario: analyze --json 無缺口時輸出空陣列
GIVEN gap-analyzer 執行後未偵測到任何缺口
WHEN 執行 bun scripts/evolution.js analyze --json
THEN JSON 輸出的 gaps 陣列為空陣列（[]）
AND JSON 輸出的 summary.total 為 0
AND exit code 為 0

## Scenario: 無效子命令顯示使用說明
GIVEN evolution.js 可執行
WHEN 執行 bun scripts/evolution.js invalid-command
THEN 標準錯誤或標準輸出包含 usage 說明
AND 輸出包含 analyze 子命令說明
AND exit code 為 1

## Scenario: 不帶子命令顯示使用說明
GIVEN evolution.js 可執行
WHEN 執行 bun scripts/evolution.js（不帶任何參數）
THEN 輸出包含 usage 說明
AND 輸出包含可用的子命令列表
AND exit code 為 1

---

# Feature: 邊界情況

## Scenario: 全部 check 通過時回傳空 gaps
GIVEN 當前 plugin 元件全部一致、無缺口
WHEN 呼叫 analyzeGaps()
THEN gaps 陣列為空陣列
AND summary.total 為 0
AND summary.byType 各型別均為 0
AND summary.bySeverity 各層級均為 0

## Scenario: pluginRoot 不存在時優雅降級
GIVEN 呼叫 analyzeGaps({ pluginRoot: '/nonexistent/path' })
WHEN 四個 check 函式因路徑不存在而無法找到元件
THEN 不拋出未捕獲例外
AND 回傳的 gaps 陣列可能為空或包含路徑相關缺口
AND summary 結構完整（不缺欄位）

## Scenario: checks 為空陣列時不執行任何 check
GIVEN analyzeGaps options 中指定 checks: []
WHEN 呼叫 analyzeGaps({ checks: [] })
THEN 不執行任何 check 函式
AND 回傳 gaps 為空陣列
AND summary.total 為 0

## Scenario: 單一 check 回傳大量 findings 時 summary 正確計算
GIVEN checkComponentChain 回傳 50 個 findings
WHEN analyzeGaps 處理後
THEN gaps 陣列長度小於等於 50（去重後）
AND summary.total 等於 gaps.length（去重後實際數量）
AND summary.byType 各型別之和等於 summary.total
