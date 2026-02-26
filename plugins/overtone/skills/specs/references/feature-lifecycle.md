# Feature 生命週期

## 狀態轉換規則

```
backlog ──── resume ────► in-progress ──── complete ────► archive
                               │
                               └──── pause ────► backlog
```

| 從 | 到 | 觸發方式 |
|----|-----|---------|
| `backlog` | `in-progress` | `specs-resume.js` / `init-workflow.js` 啟動 |
| `in-progress` | `backlog` | `specs-pause.js`（手動暫停） |
| `in-progress` | `archive` | Stop hook workflow 完成時自動歸檔 |

## 命名規則

### Feature 目錄名

- 格式：kebab-case
- 範例：`add-user-auth`、`refactor-state-module`、`fix-loop-bug`
- 規則：全小寫、單字用 `-` 連接、不使用底線或空格

### Archive 目錄名

- 格式：`YYYY-MM-DD_{featureName}`
- 範例：`2025-01-15_add-user-auth`
- 說明：日期為歸檔當天，featureName 保留原本的 kebab-case

## 目錄位置

```
specs/features/
├── in-progress/
│   └── {featureName}/           ← 正在進行
│       ├── tasks.md             ← 任務清單（必要）
│       ├── bdd.md               ← BDD 規格（有 TEST:spec 時）
│       ├── proposal.md          ← 需求分析（有 PLAN 時）
│       └── design.md            ← 技術設計（有 ARCH 時）
├── backlog/
│   └── {featureName}/           ← 暫停或待辦
│       └── tasks.md
└── archive/
    └── {YYYY-MM-DD}_{featureName}/  ← 已完成
        └── （保留所有文件）
```

## 自動觸發行為

### init-workflow.js 啟動時

1. 在 `specs/features/in-progress/{featureName}/` 建立目錄
2. 根據 workflow 類型生成 `tasks.md`（frontmatter + checkbox 清單）
3. 若 workflow 需要 BDD（standard/full/secure/refactor/tdd），建立空的 `bdd.md`

### Stop hook workflow 完成時

1. 確認所有 tasks checkbox 已勾選
2. 將 `in-progress/{featureName}/` 移動至 `archive/{date}_{featureName}/`
3. 更新 `tasks.md` 中的 `status` 欄位為 `archived`

## 各文件的負責 Agent

| 文件 | 負責 Agent | 時機 |
|------|-----------|------|
| `tasks.md` | 系統自動生成 | init-workflow.js 啟動時 |
| `bdd.md` | tester | TEST:spec 階段 |
| `proposal.md` | planner | PLAN 階段 |
| `design.md` | architect | ARCH 階段 |
