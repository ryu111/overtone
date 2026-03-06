# Tasks: retro-docs-parallel

## 子任務清單

- [ ] T1: registry.js — 新增 `postdev` parallelGroupDef + 更新 6 個 workflow
- [ ] T2: agent-stop-handler.js — issues verdict 改為標記 stage completed
- [ ] T3: stop-message-builder.js — postdev 收斂後附加 RETRO issues 提示
- [ ] T4: 更新 command 文件（quick/standard/full/secure）
- [ ] T5: 更新 skill 文件（parallel-groups.md）
- [ ] T6: 新增測試（registry + agent-stop + stop-message-builder）

## Dev Phases

### Phase 1: registry 變更 (sequential)
- [ ] T1: registry.js 新增 `postdev` 到 parallelGroupDefs + 更新 quick/standard/full/secure/product/product-full 的 parallelGroups | files: plugins/overtone/scripts/lib/registry.js

### Phase 2: 核心邏輯（parallel）
- [ ] T2: agent-stop-handler.js issues verdict 改為標記 stage completed，設定 isConvergedOrFailed + finalResult | files: plugins/overtone/scripts/lib/agent-stop-handler.js
- [ ] T3: stop-message-builder.js PASS branch 新增 postdev 收斂後讀取 RETRO result 並插入 issues 提示 | files: plugins/overtone/scripts/lib/stop-message-builder.js

### Phase 3: 文件更新（parallel，depends: 1）
- [ ] T4a: quick.md 更新 RETRO+DOCS 為並行委派說明 | files: plugins/overtone/commands/quick.md
- [ ] T4b: standard.md 更新 RETRO+DOCS 為並行委派說明 | files: plugins/overtone/commands/standard.md
- [ ] T4c: full.md 更新 RETRO+DOCS 為並行委派說明 | files: plugins/overtone/commands/full.md
- [ ] T4d: secure.md 更新 RETRO+DOCS 為並行委派說明 | files: plugins/overtone/commands/secure.md
- [ ] T5: parallel-groups.md 新增 postdev 群組說明 | files: plugins/overtone/skills/workflow-core/references/parallel-groups.md

### Phase 4: 測試（parallel，depends: 2）
- [ ] T6a: registry-postdev.test.js — postdev 群組定義 + workflow parallelGroups 包含 postdev | files: tests/unit/registry-postdev.test.js
- [ ] T6b: agent-stop-postdev.test.js — issues verdict 觸發 stage completed + isConvergedOrFailed = true | files: tests/unit/agent-stop-postdev.test.js
- [ ] T6c: stop-message-postdev.test.js — postdev 收斂時插入 RETRO issues 提示 | files: tests/unit/stop-message-postdev.test.js
