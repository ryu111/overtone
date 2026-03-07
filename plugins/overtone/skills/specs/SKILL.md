---
name: specs
description: Specs 文件管理。管理 feature 的生命周期（建立/暫停/恢復/歸檔/列表）。使用者說「暫停」「繼續」「列出功能」時使用。
disable-model-invocation: true
---

# Specs 文件管理

## 操作腳本

### 列出所有 feature

```bash
bun ~/.claude/scripts/specs-list.js
```

### 暫停 feature（in-progress → backlog）

```bash
bun ~/.claude/scripts/specs-pause.js <featureName>
```

### 恢復 feature（backlog → in-progress）

```bash
bun ~/.claude/scripts/specs-resume.js <featureName>
```

### 新增 backlog

```bash
bun ~/.claude/scripts/specs-backlog.js <featureName> <workflowType>
```

### 初始化 feature（隨 workflow 啟動）

```bash
bun ~/.claude/scripts/init-workflow.js <workflowType> <sessionId> <featureName>
```

## 目錄結構

```
specs/
├── features/
│   ├── in-progress/
│   │   └── {feature}/       ← 正在進行（kebab-case）
│   │       ├── tasks.md     ← frontmatter + checkbox list
│   │       ├── bdd.md       ← BDD 行為規格（有 TEST:spec 時）
│   │       ├── proposal.md  ← 需求分析（有 PLAN 時，planner 撰寫）
│   │       └── design.md    ← 技術設計（有 ARCH 時，architect 撰寫）
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

💡 格式範本：讀取 `./examples/tasks-sample.md`

## 其他文件格式

- 💡 proposal.md 範本：讀取 `./examples/proposal-sample.md`
- 💡 design.md 範本：讀取 `./examples/design-sample.md`
- 💡 Feature 生命週期完整說明：讀取 `./references/feature-lifecycle.md`

## Workflow 與 Specs 的對應

| Workflow | 需要 specs | 自動建立檔案 |
|----------|------------|-------------|
| full / standard / secure / refactor / tdd | 是 | tasks.md + bdd.md |
| quick / debug | 是 | tasks.md |
| single / review-only / 其他 | 否 | （不建立） |
