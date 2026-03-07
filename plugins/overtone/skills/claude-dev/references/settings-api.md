# Settings API 完整參考

> Claude Code 設定系統 + Overtone 專有配置

---

## 1. 設定檔案層級

Claude Code 採用多層設定，**優先順序由高到低**：

```
.claude/settings.local.json   ← 個人設定（不進 git，最高優先）
.claude/settings.json         ← 專案設定（進 git，次高優先）
~/.claude/settings.json       ← 全域設定（所有專案共用，最低優先）
```

| 檔案 | 範圍 | Git | 用途 |
|------|------|-----|------|
| `~/.claude/settings.json` | 全域 | 無 | 跨專案預設值（defaultMode、語言、statusLine） |
| `.claude/settings.json` | 專案 | 是 | 專案專屬設定（permissions、env、hooks） |
| `.claude/settings.local.json` | 個人 | 否 | 個人覆寫（本機 API keys、個人偏好） |

**衝突解決**：相同欄位以 `settings.local.json` > `settings.json` > `~/.claude/settings.json` 為準。
`permissions.allow` 陣列為**合併**（所有層級的 allow 都生效），`permissions.deny` 同理。

---

## 2. settings.json 主要欄位

### 完整結構範例

```json
{
  "permissions": {
    "allow": ["Bash(git commit:*)", "Bash(git push:*)"],
    "deny": [],
    "defaultMode": "bypassPermissions"
  },
  "env": {
    "NODE_ENV": "development",
    "MY_API_KEY": "${MY_API_KEY}"
  },
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  },
  "hooks": {},
  "mcpServers": {},
  "enabledPlugins": {
    "my-plugin@source": true
  },
  "language": "繁體中文",
  "skipDangerousModePermissionPrompt": true
}
```

### 2.1 permissions

控制工具執行的自動允許 / 拒絕規則。

```json
{
  "permissions": {
    "allow": [
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(npm test:*)",
      "Read",
      "Write"
    ],
    "deny": [
      "Bash(rm -rf:*)"
    ],
    "defaultMode": "bypassPermissions"
  }
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| `allow` | `string[]` | 自動允許的工具模式（支援 glob） |
| `deny` | `string[]` | 自動拒絕的工具模式（優先於 allow） |
| `defaultMode` | `"default" \| "bypassPermissions"` | `bypassPermissions` 跳過大部分確認提示 |

**Bash 模式語法**：`Bash(command-prefix:*)` — 前綴匹配
**Overtone 設定**：`defaultMode: "bypassPermissions"` + 17 個 agent 全部使用 bypassPermissions

### 2.2 env

注入環境變數到 Claude Code session 和 hook 腳本中。

```json
{
  "env": {
    "NODE_ENV": "test",
    "PROJECT_ROOT": "/Users/name/myproject",
    "ENABLE_TOOL_SEARCH": "true"
  }
}
```

- 變數在 hook 腳本（process.env）和 Bash 工具中可用
- 支援 `${VAR_NAME}` 語法參考系統環境變數
- **禁止**在 settings.json 中硬編碼 secrets — 改用 `$CLAUDE_ENV_FILE` 機制

**Overtone 範例**（`~/.claude/settings.json`）：
```json
{
  "env": {
    "ENABLE_TOOL_SEARCH": "true"
  }
}
```

### 2.3 statusLine

控制 Claude Code 底部狀態列。

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  }
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| `type` | `"command"` | 固定值，執行外部指令 |
| `command` | `string` | 回傳狀態列文字的 shell 指令 |
| `padding` | `number` | 底部 padding 行數 |

**Overtone 整合**：SessionStart hook 自動寫入 `~/.claude/statusline.sh` wrapper，雙行顯示（active subagent 時：agent + 模式/ctx%；idle 時：ctx% + 檔案大小）。

### 2.4 hooks（settings.json 中的 hooks 欄位）

settings.json 支援直接嵌入 hooks 設定，但 **Overtone 使用獨立的 `hooks/hooks.json`**。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'session started'"
          }
        ]
      }
    ]
  }
}
```

**三層嵌套格式**（必要）：
```
hooks → EventName → [ { matcher?, hooks: [ { type, command } ] } ]
```

詳見 `hooks-api.md` 第 2 節。

### 2.5 mcpServers

配置 MCP server。

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

### 2.6 enabledPlugins

控制哪些 plugin 啟用。

```json
{
  "enabledPlugins": {
    "plugin-name@source": true,
    "another-plugin@claude-code-plugins": false
  }
}
```

格式：`plugin-name@registry-source`。

---

## 3. plugin.json 結構

Plugin manifest 位於 `.claude-plugin/plugin.json`（相對 plugin 根目錄）。

### 最小必要欄位

```json
{
  "name": "plugin-name"
}
```

### Overtone 完整範例

```json
{
  "name": "ot",
  "version": "0.28.44",
  "description": "Overtone — 裝上 Claude Code，就像有了一個開發團隊。",
  "agents": [
    "./agents/developer.md",
    "./agents/tester.md"
  ]
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| `name` | `string` | Plugin 識別名稱（kebab-case，唯一） |
| `version` | `string` | Semver 格式（`MAJOR.MINOR.PATCH`） |
| `description` | `string` | 簡短描述 |
| `agents` | `string[]` | 顯式指定 agent 路徑（相對 plugin 根目錄） |
| `commands` | `string \| string[]` | 自訂 command 目錄路徑 |
| `hooks` | `string` | hooks.json 路徑（預設 `./hooks/hooks.json`） |
| `mcpServers` | `string` | .mcp.json 路徑 |

**Overtone 慣例**：`agents` 欄位顯式列舉（不依賴自動探索），確保載入順序可控。版本號透過 `bun scripts/manage-component.js bump-version` 管理。

---

## 4. 全域路徑 `~/.claude/`

Plugin 遷移至全域位置 `~/.claude/`，路徑參考方式：

- hook 腳本：使用 `process.env.CLAUDE_PLUGIN_ROOT` 環境變數（fallback 為 `os.homedir() + '/.claude'`）
- hooks.json 的 command 欄位：使用 `~/.claude/` 全域路徑
- 元件 .md 文件：使用全域路徑或相對路徑

```json
{
  "command": "node ~/.claude/hooks/scripts/my-hook.js"
}
```

```javascript
// hook 腳本中
const os = require('os');
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? (os.homedir() + '/.claude');
const stateLib = require(`${pluginRoot}/scripts/lib/state.js`);
```

> 歷史說明：舊格式使用 `${CLAUDE_PLUGIN_ROOT}` 環境變數作為路徑前綴，現已統一使用全域路徑 `~/.claude/`，本地開發時 `process.env.CLAUDE_PLUGIN_ROOT` 仍可覆寫。

**Overtone 實際路徑**（本機）：`/Users/sbu/projects/overtone/plugins/overtone`

---

## 5. $CLAUDE_ENV_FILE 環境變數注入

Claude Code 讀取 `$CLAUDE_ENV_FILE` 指定的 `.env` 格式檔案，安全注入 secrets。

```bash
# ~/.claude/.env（不進 git）
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
```

```bash
# 設定環境變數（shell profile）
export CLAUDE_ENV_FILE=~/.claude/.env
```

**用途**：避免 secrets 出現在 settings.json（可能進 git）。
**優先順序**：`$CLAUDE_ENV_FILE` 變數 > settings.json `env` 欄位。

---

## 6. CLAUDE.md 層級

CLAUDE.md 提供 context 和指令給 Claude，多層按範圍疊加：

| 檔案 | 範圍 | 說明 |
|------|------|------|
| `~/.claude/CLAUDE.md` | 全域 | 跨所有專案的全域規則（語言設定、核心原則） |
| `{project-root}/CLAUDE.md` | 專案 | 專案架構、開發規範（進 git） |
| `{subdir}/CLAUDE.md` | 子目錄 | 子模組專屬規則（進入該目錄時生效） |
| `~/.claude/projects/{path}/memory/MEMORY.md` | 自動記憶 | AI 自動更新的跨 session 記憶（不進 git） |

**載入順序**：全域 → 專案根 → 子目錄（由外到內，越近越具體）。
**優先順序**：Plugin 規則 > 專案 CLAUDE.md > 全域 CLAUDE.md。

**MEMORY.md 機制**：
- 路徑：`~/.claude/projects/{url-encoded-project-path}/memory/MEMORY.md`
- 由 PostToolUse hook 或 Agent 自動更新
- 前 200 行自動載入到 system prompt
- 用途：記錄當前進度、架構決策、Bug patterns

---

## 7. .claude/plugin-name.local.md 模式

Plugin 專屬的每專案設定檔，**用 YAML frontmatter + markdown 本體**。

```
project-root/
└── .claude/
    └── ot.local.md    ← Overtone 專屬設定（不進 git）
```

```markdown
---
enabled: true
mode: standard
max_retries: 3
coordinator_session: team-leader
---

# 附加指示

此 markdown 本體會注入到 hook 的 systemMessage 中。
```

| 特性 | 說明 |
|------|------|
| 格式 | YAML frontmatter + markdown 本體 |
| 位置 | `.claude/{plugin-name}.local.md` |
| Git | 不進 git（加入 `.gitignore`） |
| 生效 | 重啟 Claude Code 後生效 |

**Hook 讀取範例**：
```javascript
const fs = require('fs');
const path = require('path');

function readPluginSettings(projectRoot, pluginName) {
  const settingsPath = path.join(projectRoot, '.claude', `${pluginName}.local.md`);
  if (!fs.existsSync(settingsPath)) return null;

  const content = fs.readFileSync(settingsPath, 'utf8');
  // 提取 YAML frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  match[1].split('\n').forEach(line => {
    const [key, ...vals] = line.split(': ');
    if (key) frontmatter[key.trim()] = vals.join(': ').trim();
  });
  return frontmatter;
}
```

**Overtone 慣例**：`ot.local.md` 儲存 session 覆寫設定（如自訂 workflow、停用特定 agent）。

---

## 8. Overtone 專有設定整合

### 初始化流程

SessionStart hook 自動完成以下設定寫入：

```
SessionStart
├── 寫入 ~/.claude/statusline.sh（statusLine wrapper）
├── 寫入 ~/.claude/settings.json statusLine 欄位
└── spawn Dashboard（port 7777）
```

### 設定分工

| 設定來源 | 管理方式 | 用途 |
|----------|----------|------|
| `~/.claude/settings.json` | 手動 / SessionStart hook 自動更新 | statusLine、全域 permissions、language |
| `.claude/settings.json` | 手動 | 專案 Bash 允許規則 |
| `plugins/overtone/.claude-plugin/plugin.json` | `manage-component.js bump-version` | Plugin 版本號 |
| `plugins/overtone/hooks/hooks.json` | `manage-component.js update hook` | Hook 設定（禁止直接編輯） |

### 快速查詢

```bash
# 查看當前 Plugin 版本
cat plugins/overtone/.claude-plugin/plugin.json | grep version

# 更新 Plugin 版本
bun scripts/manage-component.js bump-version

# 驗證所有元件設定
bun scripts/validate-agents.js
```
