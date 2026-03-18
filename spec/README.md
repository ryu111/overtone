# Spec 目錄說明

## 三狀態任務制度

任務依狀態存放於三個資料夾：

| 資料夾 | 狀態 | 說明 |
|--------|------|------|
| `進行中/` | 執行中 | 目前正在實作的任務，每次只應有 1-3 個 |
| `待做/` | 排隊中 | 已有規格、等待執行的任務 |
| `完成/` | 已結束 | 實作完成並 commit 的任務，長期保留供參考 |

每個任務為一個子目錄，通常包含：
- `spec.md` — 產品規格（What + Why）
- `design.md` — 技術設計（How）
- `tasks.md` — 子任務清單（D4 並行管控用）
- `task.json` — 任務 metadata（name, type, priority, depth, description, result）

## 主要文件

| 文件 | 用途 |
|------|------|
| `index.md` | 專案中央索引（元件目錄 + 任務狀態，自動生成） |
| `roadmap.md` | 重建路線圖（R0-R5 里程碑） |

## 工具

```bash
# 建立新任務
bun ~/.claude/scripts/spec-tasks.js create <title>

# 查看所有任務
bun ~/.claude/scripts/spec-tasks.js list

# 更新任務狀態
bun ~/.claude/scripts/spec-tasks.js complete <name>
```

## 相關 Skill

- `~/.claude/skills/nova-spec/SKILL.md` — spec/design 文件格式規範
