# v0.30 事前準備

> 摸索階段：整理所有研究素材，標記狀態，精練後再動工。

## 狀態標記

| 標記 | 意義 |
|------|------|
| ✅ 已確認 | 研究完成，結論明確，可直接採用 |
| 🔍 待確認 | 有初步方向但需要驗證或決策 |
| ⏳ Pending | 依賴其他章節完成才能推進 |
| ❌ 排除 | 研究後決定不採用 |

---

## A. Claude Code 平台功能

每個功能獨立成章，方便查閱。

| # | 章節 | 狀態 | 說明 |
|---|------|------|------|
| A1 | [指令系統](./A1-指令系統.md) | ✅ 已確認 | CLAUDE.md 四層優先順序 + @import + 最佳寫法 |
| A2 | [設定系統](./A2-設定系統.md) | ✅ 已確認 | settings.json 五層 + 完整欄位分類 |
| A3 | [rules 條件規則](./A3-rules-條件規則.md) | 🔍 待確認 | 深度研究 + 已知 bugs + 社群範例 + 採用策略 |
| A4 | [Agent 與 Subagent](./A4-Agent-與-Subagent.md) | ✅ 已確認 | frontmatter + isolation:worktree + teams |
| A5 | [Skills 與 Commands](./A5-Skills-與-Commands.md) | ✅ 已確認 | SKILL.md 格式 + 觸發機制 + 內建 skills |
| A6 | [Hook 系統](./A6-Hook-系統.md) | ✅ 已確認 | 18 事件 + 4 handler 類型 + matcher + 新功能 |
| A7 | [Memory 系統](./A7-Memory-系統.md) | ✅ 已確認 | auto memory + agent-memory 三範圍 + projects/ |
| A8 | [MCP 整合](./A8-MCP-整合.md) | ✅ 已確認 | 傳輸類型 + 配置位置 + OAuth + tool search |

## B. 方法論與生態系

| # | 章節 | 狀態 | 說明 |
|---|------|------|------|
| B1 | [AI Workflow 方法論](./B1-AI-Workflow-方法論.md) | ✅ 已確認 | 9 大方法論 + 共通模式 + Overtone 定位 |
| B2 | [生態系工具總覽](./B2-生態系工具總覽.md) | ✅ 已確認 | 100+ 工具分類（Agent/Workflow/Rules/MCP/Claude） |

## C. Overtone 現況與設計

| # | 章節 | 狀態 | 說明 |
|---|------|------|------|
| C1 | [現有元件盤點](./C1-現有元件盤點.md) | ✅ 已確認 | 28 skills + 13 hooks + 52 scripts/lib |
| C2 | [v0.30 架構設計](./C2-v030-架構設計.md) | ✅ 已確認 | 三角色 + D0-D4 + P1-P6 + JSON 合約 + 遷移路線 |
| C3 | [claudemd-dev 設計](./C3-claudemd-dev-設計.md) | 🔍 待確認 | CLAUDE.md 生命週期管理 skill 設計草案 |
| C4 | [v0.30 決策待辦](./C4-v030-決策待辦.md) | ⏳ Pending | 6 項待決策 + 實作順序 |

---

## 工作流

```
整理素材 → 標記狀態 → 逐章確認 → 整合精練 → 動工實作
              （目前在這）
```
