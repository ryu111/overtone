# A7 — Skills 與 Commands 系統

> 狀態：✅ 已確認

---

## Skills

位於 `.claude/skills/<skill-name>/SKILL.md` 或 `~/.claude/skills/<skill-name>/SKILL.md`。

### SKILL.md Frontmatter 完整欄位

| 欄位 | 說明 |
|------|------|
| `name` | 顯示名稱（預設用目錄名） |
| `description` | Claude 判斷何時使用的依據（**最重要**） |
| `argument-hint` | 自動完成提示文字 |
| `disable-model-invocation` | `true` = 僅使用者手動呼叫 |
| `user-invocable` | `false` = 從 `/` 選單隱藏 |
| `allowed-tools` | 啟用時自動允許的工具 |
| `model` | 覆蓋使用的模型 |
| `context` | `fork` = 在 subagent 中執行 |
| `agent` | `context: fork` 時用哪個 agent 類型 |
| `hooks` | 生命週期 hooks（可含 `once: true`） |

### 字串替換

| 語法 | 說明 |
|------|------|
| `$ARGUMENTS` | 完整參數字串 |
| `$ARGUMENTS[N]` / `$N` | 第 N 個參數 |
| `${CLAUDE_SESSION_ID}` | 當前 session ID |
| `${CLAUDE_SKILL_DIR}` | skill 目錄路徑 |
| `` !`command` `` | 動態注入 shell 命令輸出 |

### References

Skill 內容可引用同目錄下的檔案：
```
@references/best-practices.md
@references/checklist.md
```

References 使用漸進式揭露 — 主 SKILL.md 放核心指令，details 放在 references。

---

## Commands（舊格式）

`.claude/commands/<name>.md` 是 skills 的前身。功能已合併進 skills：

- 單檔即可（不需目錄結構）
- 同名時 skill 勝出
- 向後相容，仍可使用
- 使用相同 frontmatter 格式

---

## 內建 Skills

| Skill | 用途 |
|-------|------|
| `/simplify` | 並行 code review（reuse/quality/efficiency） |
| `/batch <instruction>` | 大規模平行修改（worktree 隔離） |
| `/debug` | 除錯 session 日誌 |
| `/loop [interval] <prompt>` | 定時重複執行 |
| `/claude-api` | API 參考文件 |

---

## Plugin 系統

### plugin.json

位於 `<plugin>/.claude-plugin/plugin.json`：

```json
{
  "name": "plugin-name",
  "description": "...",
  "version": "1.0.0",
  "author": { "name": "..." },
  "homepage": "...",
  "repository": "...",
  "license": "..."
}
```

### Plugin 元件目錄

| 目錄 | 用途 |
|------|------|
| `.claude-plugin/` | 僅含 plugin.json |
| `commands/` | 指令 |
| `skills/` | Skills |
| `agents/` | Subagent 定義 |
| `hooks/hooks.json` | Hook 配置 |
| `.mcp.json` | MCP server |
| `.lsp.json` | LSP server（code intelligence） |
| `settings.json` | 預設設定 |

### Marketplace 與安裝

- **來源**：`github`, `git`, `url`, `npm`, `file`, `directory`, `hostPattern`
- **安裝**：`/plugin install` 或 `claude plugin add`
- **命名空間**：`/plugin-name:skill-name`
- **開發測試**：`claude --plugin-dir ./my-plugin`
- **熱更新**：`/reload-plugins`

---

## 我們目前的使用

| 元件 | 數量 | 狀態 |
|------|------|------|
| Skills | 28 個 | 活躍 — 詳見 [C1-現有元件盤點](./C1-現有元件盤點.md) |
| Commands | 31 個 | 全部 .bak（v0.30 精簡） |
| Agents | 18 個 | 全部 .bak（v0.30 重設計） |
| Plugins | 8 個啟用 | 活躍 |
