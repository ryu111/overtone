# Tasks 格式樣板

> 📋 **何時讀取**：首次撰寫 tasks.md 或需要格式參考時。

---

## 完整格式範例

```markdown
---
feature: {featureName}
status: in-progress
workflow: {workflowType}
created: 2025-01-15T10:30:00.000Z
---

## Tasks

- [ ] plan
- [ ] arch
- [ ] test:spec
- [ ] dev
- [ ] review
- [ ] test:verify
- [ ] retro
- [ ] docs
```

## 各 Workflow 對應的 tasks 清單

| Workflow | tasks 清單 |
|----------|-----------|
| `standard` | plan → arch → test:spec → dev → review → test:verify → retro → docs |
| `full` | plan → arch → design → test:spec → dev → review → test:verify → qa → e2e → retro → docs |
| `secure` | plan → arch → test:spec → dev → review → test:verify → security → retro → docs |
| `tdd` | test:spec → dev → test:verify |
| `refactor` | arch → test:spec → dev → review → test:verify |
| `quick` | dev → review → test → retro |
| `debug` | debug → dev → test |
| `single` | dev |

## Frontmatter 欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| `feature` | string | feature 名稱（kebab-case） |
| `status` | `in-progress` \| `backlog` \| `archived` | 目前狀態 |
| `workflow` | string | 使用的 workflow 類型 |
| `created` | ISO 8601 | 建立時間（由 init-workflow.js 自動填入） |

## Dev Phases 格式（可選，architect 在 ARCH 階段追加）

architect 分析子任務依賴關係後，若有可並行項目，在 `tasks.md` 末尾追加 `## Dev Phases` 區塊：

```markdown
## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] 建立資料模型 | files: src/models/user.ts
- [ ] 設定路由骨架 | files: src/routes/index.ts

### Phase 2: 核心功能 (parallel)
- [ ] 實作 CRUD API | files: src/handlers/user.ts, src/services/user.ts
- [ ] 實作認證中間件 | files: src/middleware/auth.ts
- [ ] 撰寫單元測試 | files: tests/user.test.ts

### Phase 3: 整合 (sequential, depends: 2)
- [ ] 整合路由與認證 | files: src/routes/user.ts, src/app.ts
```

### Phase 標記

| 標記 | 說明 |
|------|------|
| `(sequential)` | 依序執行，委派單一 developer |
| `(parallel)` | 可並行，同一訊息委派多個 developer Task |
| `(sequential, depends: N)` | 需等 Phase N 完成後，依序執行 |
| `(parallel, depends: N)` | 需等 Phase N 完成後，可並行執行 |

`depends: N` 只需在**非前一 Phase** 依賴時標注。Phase 預設按順序執行（前一 Phase 完成即可啟動），`depends: N` 用於跨越中間 Phase 的非相鄰依賴。

### `files:` 欄位

每個子任務標注影響的檔案路徑（逗號分隔），供 Main Agent 判斷並行可行性。

### 省略條件

若所有子任務都有依賴（無法並行），architect 可省略 Dev Phases 區塊 — Main Agent 將以單一 developer 執行 DEV 階段。

## 慣例

- tasks 清單由 `init-workflow.js` 根據 workflow 類型自動生成
- checkbox 狀態由 `SubagentStop` hook 在每個 stage 完成後更新
- `status` 欄位在 Stop hook 完成時改為 `archived`
- Dev Phases 由 architect 在 ARCH 階段手動追加（非自動生成）
