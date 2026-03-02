---
status: archived
workflow: standard
created: 2026-03-03
archivedAt: 2026-03-02T16:50:41.401Z
---
# Knowledge Engine -- Tasks

## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] TEST
- [x] RETRO
- [x] DOCS

## 子任務

### 迭代 1：Skill Context 自動注入

- [ ] 在 hook-utils.js 新增 buildSkillContext() -- 讀取 agent frontmatter skills 欄位，載入 SKILL.md 正文摘要
- [ ] 修改 pre-task.js 注入 skillContext -- 在 workflowContext 之後、testIndex 之前注入
- [ ] 單元測試 build-skill-context.test.js -- 驗證 skills 讀取、截斷、無 skills 回傳 null、SKILL.md 不存在降級
- [ ] 整合測試 pre-task 注入行為 -- 驗證 developer 有 skills 時 prompt 含摘要

### 迭代 2：Knowledge Gap Detector

- [ ] 新增 knowledge-gap-detector.js -- DOMAIN_KEYWORDS 定義 + detectKnowledgeGaps 函式
- [ ] 整合 gap detector 到 pre-task.js -- 偵測缺口後追加 gap warnings 到 prompt
- [ ] 單元測試 knowledge-gap-detector.test.js -- domain 比對、score 計算、邊界案例

### 迭代 3：Knowledge Searcher

- [ ] 新增 knowledge-searcher.js -- searchKnowledge（三源搜尋）+ extractKnowledge（知識提取）
- [ ] 單元測試 knowledge-searcher.test.js -- 三個 source 各自邏輯、降級行為、extractKnowledge

### 迭代 4：Skill Router

- [ ] 新增 skill-router.js -- routeKnowledge（路由決策）+ writeKnowledge（寫入 auto-discovered.md）
- [ ] 單元測試 skill-router.test.js -- domain 比對、append 邏輯、gap-observation 路徑

### 迭代 5：SubagentStop 知識歸檔

- [ ] 修改 on-stop.js -- PASS 時提取知識 + skill-router 歸檔（try/catch 靜默降級）
- [ ] 整合測試 agent-on-stop 知識歸檔 -- PASS 觸發、fail 不觸發、降級行為

### 迭代 6：E2E + Guard

- [ ] E2E 測試 knowledge-engine.test.js -- 完整知識流：注入 -> 執行 -> 歸檔 -> 可讀
- [ ] dead-code-scanner 確認 -- 確保新模組不被誤判為孤立檔案

## Dev Phases

### Phase 1: 基礎模組 (parallel)
- [ ] 在 hook-utils.js 新增 buildSkillContext() | files: plugins/overtone/scripts/lib/hook-utils.js
- [ ] 新增 knowledge-gap-detector.js（DOMAIN_KEYWORDS + detectKnowledgeGaps） | files: plugins/overtone/scripts/lib/knowledge-gap-detector.js

### Phase 2: 搜尋與路由模組 (parallel)
- [ ] 新增 knowledge-searcher.js（searchKnowledge + extractKnowledge） | files: plugins/overtone/scripts/lib/knowledge-searcher.js
- [ ] 新增 skill-router.js（routeKnowledge + writeKnowledge） | files: plugins/overtone/scripts/lib/skill-router.js

### Phase 3: Hook 整合 (sequential, depends: 2)
- [ ] 修改 pre-task.js 注入 skillContext + gapWarnings | files: plugins/overtone/hooks/scripts/tool/pre-task.js
- [ ] 修改 on-stop.js 加入知識歸檔 | files: plugins/overtone/hooks/scripts/agent/on-stop.js
- [ ] dead-code-scanner 確認新模組不被誤判 | files: plugins/overtone/scripts/lib/dead-code-scanner.js
