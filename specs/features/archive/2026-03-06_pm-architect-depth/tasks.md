# PM-Architect 深度改進 — Tasks

## Dev Phases

### Phase 1: 核心改動 (parallel)

- [ ] O2：interview.js flow 面向新增入口點/post-action/狀態傳播必問題（flow-6/7/8） | files: plugins/overtone/scripts/lib/interview.js
- [ ] O3a：architect.md DO 清單新增跨元件狀態同步考量 | files: plugins/overtone/agents/architect.md（manage-component.js update）
- [ ] O4：product-manager.md 研究先行強化 UX flow 研究指引 | files: plugins/overtone/agents/product-manager.md（manage-component.js update）
- [ ] O3b：architecture skill 新增 state-sync-patterns.md reference | files: plugins/overtone/skills/architecture/references/state-sync-patterns.md（新建）、plugins/overtone/skills/architecture/SKILL.md

### Phase 2: 文件同步 (sequential，依賴 Phase 1 O2)

- [ ] O2-doc：interview-guide.md 同步更新 flow 面向必問題表格（flow-6/7/8） | files: plugins/overtone/skills/pm/references/interview-guide.md

### Phase 3: 守衛注入 (sequential，依賴 Phase 1 完成)

- [ ] O1：pre-task-handler.js 新增 MoSCoW 警告注入（讀取 Product Brief Should/Could，warn not block） | files: plugins/overtone/scripts/lib/pre-task-handler.js

### Phase 4: 測試補充 (sequential，依賴 Phase 1-3 完成)

- [ ] 測試：為 interview.js 新問題 + pre-task-handler.js MoSCoW 警告新增單元測試 | files: tests/unit/interview.test.js、tests/unit/pre-task-handler.test.js
