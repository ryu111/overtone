---
name: specs
description: Specs 文件管理。管理 feature 的生命周期（建立/暫停/恢復/歸檔/列表）。使用者說「暫停」「繼續」「列出功能」時使用。
disable-model-invocation: true
---

# Specs 文件管理

## 操作腳本

### 列出所有 feature

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/specs-list.js
```

### 暫停 feature（in-progress → backlog）

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/specs-pause.js <featureName>
```

### 恢復 feature（backlog → in-progress）

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/specs-resume.js <featureName>
```

### 新增 backlog

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/specs-backlog.js <featureName> <workflowType>
```

### 初始化 feature（隨 workflow 啟動）

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js <workflowType> <sessionId> <featureName>
```

## 目錄結構

```
specs/
├── features/
│   ├── in-progress/
│   │   └── {feature}/       ← 正在進行（kebab-case）
│   │       ├── tasks.md     ← frontmatter + checkbox list
│   │       └── bdd.md       ← BDD 行為規格（有 TEST:spec 時）
│   ├── backlog/
│   │   └── {feature}/       ← 暫停或待辦
│   └── archive/
│       └── {date}_{feature}/ ← 已完成（自動歸檔）
└── README.md
```

## 慣例

- Feature 名稱：kebab-case（如 `add-user-auth`）
- 同時建議只有一個 in-progress feature
- `init-workflow.js` 啟動時傳入 featureName 可自動建立
- Session Stop hook workflow 完成時自動歸檔

## tasks.md 格式

```markdown
---
feature: {featureName}
status: in-progress
workflow: {workflowType}
created: {ISO8601}
---

## Tasks

- [ ] tasks（依 workflow 類型自動生成）
- [ ] bdd
```

## Workflow 與 Specs 的對應

| Workflow | 需要 specs | 自動建立檔案 |
|----------|------------|-------------|
| full / standard / secure / refactor / tdd | 是 | tasks.md + bdd.md |
| quick / debug | 是 | tasks.md |
| single / review-only / 其他 | 否 | （不建立） |
