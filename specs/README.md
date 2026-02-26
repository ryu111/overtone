# Specs

Overtone BDD 行為規格和 Feature 工作清單。

## 目錄結構

```
specs/
├── features/
│   ├── in-progress/     ← 正在進行的 feature
│   │   └── {featureName}/
│   │       ├── tasks.md   ← 工作清單（frontmatter + checkbox）
│   │       └── bdd.md     ← BDD 行為規格（GIVEN/WHEN/THEN）
│   ├── backlog/         ← 待辦 feature
│   │   └── {featureName}/
│   └── archive/         ← 已完成 feature（自動歸檔）
│       └── {YYYY-MM-DD}_{featureName}/
└── README.md
```

## Feature 命名慣例

Feature 名稱使用 **kebab-case**（全小寫 + 連字號），例如：

- `add-user-auth`
- `specs-skill-system`
- `oauth2-integration`

## 常用指令

```bash
# 列出所有 feature
node plugins/overtone/scripts/specs-list.js

# 暫停正在進行的 feature（移至 backlog）
node plugins/overtone/scripts/specs-pause.js <featureName>

# 恢復 backlog feature（移至 in-progress）
node plugins/overtone/scripts/specs-resume.js <featureName>

# 新增 backlog feature
node plugins/overtone/scripts/specs-backlog.js <featureName> <workflowType>

# 啟動 workflow 並建立 feature
node plugins/overtone/scripts/init-workflow.js <workflowType> <sessionId> <featureName>
```

## tasks.md 格式

每個 feature 都有一個 `tasks.md`，包含 YAML frontmatter 和 checkbox 清單：

```markdown
---
feature: my-feature
status: in-progress
workflow: standard
created: 2026-02-26T10:00:00Z
---

## Tasks

- [ ] tasks
- [ ] bdd
```

### Status 值

| 狀態 | 位置 | 說明 |
|------|------|------|
| `in-progress` | `features/in-progress/` | 正在進行 |
| `backlog` | `features/backlog/` | 待辦 |
| `archived` | `features/archive/` | 已完成 |

## 與 Overtone Workflow 的整合

- `init-workflow.js` 啟動時傳入 featureName → 自動建立 feature 目錄
- Workflow 完成（Stop hook）→ 自動歸檔 feature 到 `archive/`
- on-stop agent hook → PASS 時顯示 specs 路徑和進度
- on-submit hook → 注入活躍 feature context 到 system message

## Workflow 對應的 Specs

| Workflow | 建立的文件 |
|----------|-----------|
| full / standard / secure / refactor / tdd | tasks.md + bdd.md |
| quick / debug | tasks.md |
| single / review-only / 其他 | （不建立） |
