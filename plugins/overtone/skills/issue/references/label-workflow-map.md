# GitHub Label → Overtone Workflow 映射表

## 映射規則

| GitHub Label | Overtone Workflow | 說明 |
|:------------:|:-----------------:|------|
| `bug` | debug | Bug 修復流程（DEBUG → DEV → TEST） |
| `enhancement` | standard | 功能增強（完整開發流程） |
| `feature` | standard | 新功能（完整開發流程） |
| `ui` | full | 含 UI 的完整流程（含 DESIGN stage） |
| `design` | full | 含 UI 的完整流程（含 DESIGN stage） |
| `frontend` | full | 含 UI 的完整流程（含 DESIGN stage） |
| `security` | secure | 安全相關（含 SECURITY 審查） |
| `documentation` | single | 純文件修改（只有 DEV stage） |
| `docs` | single | 純文件修改（只有 DEV stage） |
| `refactor` | refactor | 重構（ARCH → T:spec → DEV → REVIEW → T:verify） |

## 優先級（多 label 衝突時）

當 Issue 有多個 label 對應不同 workflow 時，按以下優先級選擇（高優先級優先）：

```
security > full > standard > debug > refactor > single
```

**範例**：
- `bug` + `security` → 選 `secure`（security 優先級更高）
- `ui` + `feature` → 選 `full`（full 優先級更高）
- `enhancement` + `refactor` → 選 `standard`（standard 優先級更高）
- `docs` + `bug` → 選 `debug`（debug 優先級更高）

## 預設行為

- **無 label**：使用 `standard` workflow
- **未知 label**（不在映射表中）：忽略，繼續評估其他 labels
- **所有 labels 均未知**：使用 `standard` workflow（預設）
