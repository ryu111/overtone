---
name: ref-commit-convention
description: Conventional commit 快速參考：type 分類、atomic commit 原則、拆分標準、message 格式（源自 Anthropic 官方 claude-code-best-practices）。
disable-model-invocation: true
user-invocable: false
---

# Conventional Commit 快速參考

> 來源：Anthropic 官方 `awattar/claude-code-best-practices`

## Commit Type 分類

| Type | 場景 | 範例 |
|------|------|------|
| `feat` | 新功能 | `feat: add user authentication` |
| `fix` | Bug 修復 | `fix: resolve race condition in pipeline` |
| `refactor` | 重構（不改行為） | `refactor: extract helper functions from on-stop` |
| `docs` | 文件修改 | `docs: update API reference` |
| `test` | 測試新增/修改 | `test: add JSONL resilience tests` |
| `chore` | 維護性工作 | `chore: bump plugin version to 0.28.0` |
| `style` | 格式調整（不改邏輯） | `style: fix indentation in config-api` |
| `perf` | 效能改善 | `perf: optimize timeline query with limit` |

## Message 格式

```
# 單行（簡單變更）
<type>: <description>.

# 多行（複雜變更）
<type>: <summary>:

- <change 1>
- <change 2>
- <change 3>

# 關聯 Issue
<type>(#<issue>): <description>

# Post-review 修復
fix: apply post-review fixes to `<summary>`
```

## Atomic Commit 原則

📋 每個 commit 應該是**一個邏輯單元**：

- 可獨立 revert 而不破壞其他功能
- 只包含一個 concern（功能/修復/重構）
- 不混合不相關的變更

## 拆分標準（5 項檢查）

需要拆分為多個 commit 的情況：

| 標準 | 信號 |
|------|------|
| **不相關 concern** | 修 bug + 加新功能混在一起 |
| **不同 type** | feat 和 refactor 混合 |
| **不同檔案群組** | 前端 + 後端 + 測試各自獨立 |
| **獨立邏輯群組** | 可以按功能分組的變更 |
| **過大體積** | diff 超過 ~200 行建議考慮拆分 |

## Diff 分析流程

```
1. git diff --staged（已 stage）
2. git diff（未 stage）
3. 分析邏輯分組 → 判斷是否需拆分
4. 按分組依序 commit
```
