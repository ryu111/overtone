---
feature: instinct-pollution-fix
phase: TEST:spec
created: 2026-03-06
---

# Feature: Instinct 知識歸檔來源過濾

## Scenario: 外部專案路徑 — 判定為外部 fragment
GIVEN 一個 fragment，其 content 含有 `projects/md-blog/src/parser.js` 路徑
WHEN 呼叫 `_isExternalFragment(fragment)`
THEN 回傳 `true`（判定為外部知識，應略過歸檔）

## Scenario: Overtone 自身路徑 — 判定為非外部 fragment
GIVEN 一個 fragment，其 content 含有 `plugins/overtone/scripts/lib/knowledge-archiver.js` 路徑
WHEN 呼叫 `_isExternalFragment(fragment)`
THEN 回傳 `false`（判定為 Overtone 知識，應正常歸檔）

## Scenario: 無路徑特徵 — 保守歸檔
GIVEN 一個 fragment，其 content 為純文字知識說明，不含任何路徑特徵
WHEN 呼叫 `_isExternalFragment(fragment)`
THEN 回傳 `false`（保守判定為 Overtone 知識，不誤傷）

## Scenario: 多種外部專案路徑格式 — 均判定為外部
GIVEN 一個 fragment，其 content 分別含有以下格式之一：
  - `projects/kuji/app/routes.ts`
  - `projects/my-app/`（斜線結尾）
  - `Projects/AnotherProject/` （大小寫混用）
WHEN 呼叫 `_isExternalFragment(fragment)`
THEN 回傳 `true`（regex 不分大小寫，均視為外部路徑）

## Scenario: `projects/overtone/` 路徑 — 不被誤判為外部
GIVEN 一個 fragment，其 content 含有 `projects/overtone/plugins/` 路徑（overtone 本身位於 projects 下的情況）
WHEN 呼叫 `_isExternalFragment(fragment)`
THEN 回傳 `false`（negative lookahead 保護，overtone 路徑不誤判）

---

# Feature: archiveKnowledge 外部 fragment 降級處理

## Scenario: 外部路徑 fragment — archived=0, skipped=1
GIVEN agentOutput 含有 `### Findings` 區塊
AND 該區塊 content 含有 `projects/md-blog/src/parser.js` 路徑
WHEN 呼叫 `archiveKnowledge(agentOutput, ctx)`
THEN 回傳 `{ archived: 0, errors: 0, skipped: 1 }`
AND 外部 fragment 不寫入任何 auto-discovered.md

## Scenario: Overtone 路徑 fragment — 正常歸檔（回歸）
GIVEN agentOutput 含有 `### Findings` 區塊
AND 該區塊 content 含有 `plugins/overtone/scripts/lib/` 路徑
WHEN 呼叫 `archiveKnowledge(agentOutput, ctx)`
THEN 回傳 `archived > 0`，`skipped = 0`，`errors = 0`
AND fragment 成功寫入對應 domain 的 auto-discovered.md

## Scenario: 外部 fragment + sessionId — 降級為 instinct gap-observation
GIVEN agentOutput 含有外部路徑知識片段（content 含 `projects/md-blog/`）
AND ctx.sessionId 存在
AND 透過 `_deps.instinct` 注入 mock instinct 模組
WHEN 呼叫 `archiveKnowledge(agentOutput, ctx, { instinct: mockInstinct })`
THEN `mockInstinct.emit` 被呼叫一次
AND 呼叫時第二個參數（event type）為 `'knowledge_gap'`
AND 回傳 `archived = 0`

## Scenario: 外部 fragment + 無 sessionId — 靜默略過（不 emit）
GIVEN agentOutput 含有外部路徑知識片段
AND ctx.sessionId 為 undefined 或未提供
AND 透過 `_deps.instinct` 注入 mock instinct 模組
WHEN 呼叫 `archiveKnowledge(agentOutput, ctx, { instinct: mockInstinct })`
THEN `mockInstinct.emit` 不被呼叫
AND 回傳 `skipped = 1`，`archived = 0`

## Scenario: 混合 fragment（外部 + Overtone）— 分開處理
GIVEN agentOutput 含有兩個 `### Findings` 區塊
AND 第一個 content 含外部路徑，第二個 content 含 `plugins/overtone/` 路徑
WHEN 呼叫 `archiveKnowledge(agentOutput, ctx)`
THEN 回傳 `archived = 1`，`skipped = 1`，`errors = 0`
AND 只有 Overtone fragment 寫入 auto-discovered.md

---

# Feature: auto-discovered.md 污染條目清理

## Scenario: 清理後外部知識不存在於 auto-discovered.md
GIVEN `plugins/overtone/skills/claude-dev/references/auto-discovered.md` 原含有外部污染條目
AND 污染條目 source 為 `product-manager:PM Findings`，content 含 `projects/md-blog/`
AND 污染條目 source 為 `planner:PLAN Findings`，content 含 `projects/md-blog/`
WHEN developer 執行清理（刪除兩個完整 `---...---` 區塊）
THEN auto-discovered.md 中不再有任何含 `projects/md-blog/` 路徑的條目
AND 其他 Overtone 自身知識條目完整保留
