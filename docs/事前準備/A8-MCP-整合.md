# A8 — MCP 整合

> 狀態：✅ 已確認

---

## 傳輸類型

| 類型 | 說明 | 適用場景 |
|------|------|---------|
| **HTTP** | POST 請求（推薦） | 雲端/遠端服務 |
| **stdio** | 本地進程 stdin/stdout | 本地工具 |
| **WebSocket** | 持久連線 | 即時服務 |
| SSE | ~~Server-Sent Events~~ | 已棄用，改用 HTTP |

---

## 配置位置

| 範圍 | 位置 | 共用 |
|------|------|------|
| Project | `.mcp.json`（專案根目錄） | ✅ git |
| User | `~/.claude.json` 的 `mcpServers` | ❌ 個人 |
| Local | `~/.claude.json`（project path 下） | ❌ 個人 |
| Managed | 系統目錄 `managed-mcp.json` | IT |
| Plugin | Plugin 根目錄 `.mcp.json` 或 `plugin.json` 的 `mcpServers` | Plugin |
| Subagent inline | Agent frontmatter `mcpServers` | Agent |

### .mcp.json 格式

```json
{
  "mcpServers": {
    "my-server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    },
    "local-tool": {
      "type": "stdio",
      "command": "bun",
      "args": ["path/to/server.js"],
      "env": { "DB_URL": "${DB_URL:-sqlite://local.db}" }
    }
  }
}
```

支援 `${VAR}` 和 `${VAR:-default}` 環境變數展開。

---

## 新功能

| 功能 | 說明 |
|------|------|
| **OAuth 2.0** | `/mcp` 指令進行瀏覽器認證 |
| **Tool Search** | 工具數量多時自動啟用按需載入（`ENABLE_TOOL_SEARCH`） |
| **Resources** | `@server:protocol://resource` 引用 |
| **Prompts** | `/mcp__server__prompt` 作為指令 |
| **`list_changed`** | 動態更新工具清單 |
| **Claude as MCP** | `claude mcp serve` 讓 Claude Code 成為 MCP server |

---

## 相關設定

| 設定 | 說明 |
|------|------|
| `enableAllProjectMcpServers` | 自動啟用專案 MCP |
| `enabledMcpjsonServers` | 白名單 |
| `disabledMcpjsonServers` | 黑名單 |
| `allowedMcpServers` / `deniedMcpServers` | 管理層級控制 |
| `MAX_MCP_OUTPUT_TOKENS` | 輸出 token 上限 |

---

## 我們目前的使用

8 個 Plugin 啟用（各自帶 MCP），未使用專案級 `.mcp.json`。

詳見 [B2-生態系工具總覽](./B2-生態系工具總覽.md) 的 MCP 生態系部分。
