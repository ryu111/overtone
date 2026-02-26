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

## 慣例

- tasks 清單由 `init-workflow.js` 根據 workflow 類型自動生成
- checkbox 狀態由 `SubagentStop` hook 在每個 stage 完成後更新
- `status` 欄位在 Stop hook 完成時改為 `archived`
