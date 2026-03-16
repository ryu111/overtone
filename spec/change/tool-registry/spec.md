# Tool Registry + Intent-to-Tool Mapping（R4.1 + R4.2 — L4 通用代理人）

## 動機（Why）

- **問題**：Nova 的 5 種工具來源（Skills 27 個、Scripts 17+10 個、MCP Servers、CLI 工具、API 端點）各自孤立，Main Agent 只能憑記憶和 context 選擇工具。進入新領域時，Agent 不知道自己有什麼工具可用，更無法判斷缺什麼
- **目標**：建立統一的工具索引（Registry）和語意匹配引擎（Matcher），讓 Main Agent 面對任意任務時能快速找到可用工具、識別能力缺口
- **不做的代價**：L4「跨領域自主運作」無法達成——每進入一個新領域都需要人工告知可用工具，違反 vision.md「核心夠通用 → 外層自動生成」

## 範圍

### In-scope

- tool-registry.js：統一索引 5 種工具來源，提供查詢 API 和 CLI
- tool-matcher.js：給定任務描述，透過本地模型語意匹配推薦工具組合
- 動態掃描：啟動時自動掃描 skills/、scripts/、settings.json mcpServers
- 能力缺口識別：匹配後列出任務需要但系統不具備的能力
- CLI 介面：`bun tool-registry.js list [--domain=xxx] [--capability=xxx]` 和 `bun tool-matcher.js "任務描述"`

### Out-of-scope

- MCP Server 按需啟動/關閉（R4.1 後續 — 連接生命週期管理）
- 自動建立缺失工具（已有 Skill Lifecycle 處理 Skill 類型）
- 工具版本管理
- 跨機器工具同步
- 工具市集或外部工具安裝

## 使用者故事

身為 Main Agent，我想要在收到任務後查詢所有可用工具，以便選擇最適合的工具組合而非只用記憶中的工具。

身為 Main Agent，我想要知道任務需要哪些能力但系統目前缺失，以便決定是否需要建立新 Skill 或安裝新工具。

身為開發者，我想要用 CLI 查詢工具清單和能力覆蓋，以便了解系統的工具全貌。

## 行為規格

### 正常路徑（Registry）

1. `bun tool-registry.js scan` → 掃描 5 個來源，建立/更新索引檔案 `~/.claude/data/tool-registry.json`
2. 掃描來源：
   - `~/.claude/skills/*/SKILL.md` → 解析 frontmatter（name, description）+ SKILL.md 內容摘要
   - `~/.claude/scripts/*.js` → 讀取檔案頭部註解（第 2 行 `// xxx — yyy`）
   - `~/.claude/scripts/os/*.js` → 同上
   - `~/.claude/settings.json` → 解析 mcpServers 區塊
   - 預設 CLI 工具清單（硬編碼：git, gh, bun, curl, jq, sqlite3 等常用工具）
3. `bun tool-registry.js list` → 輸出全部工具（name, type, description）
4. `bun tool-registry.js list --type=skill --domain=dev` → 過濾查詢
5. `bun tool-registry.js get <name>` → 輸出單一工具的完整元資料

### 正常路徑（Matcher）

1. `bun tool-matcher.js "建立一個 LINE Bot 做客服"` → 接收任務描述
2. 讀取 `~/.claude/data/tool-registry.json` 索引
3. 將索引中所有工具的 capabilities 摘要（每個工具一行）+ 任務描述 → 送入本地模型
4. 本地模型回傳 JSON：推薦工具 + 理由 + 缺失能力
5. 輸出結果到 stdout（JSON 格式）

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 索引檔案不存在 | 自動執行 scan 後再查詢 |
| SKILL.md 缺 frontmatter | 跳過該 Skill，log 警告 |
| settings.json 無 mcpServers | 跳過 MCP 掃描，不報錯 |
| 本地模型不可用（Matcher） | 退化為關鍵詞匹配（name + description 包含任務關鍵詞） |
| 索引檔案過期（> 24 小時） | list/get 時 log 提示 `索引過期，建議執行 scan` |

### 邊界條件

- 工具數量 > 100 → Matcher 的 prompt 截斷至 4000 tokens（每個工具一行摘要，約 30-50 字）
- 任務描述為空 → 回傳錯誤 `{ error: "任務描述不可為空" }`
- 同名工具跨類型（如 skill "notification" 和 script "notification.js"）→ type 前綴區分（`skill:notification` vs `script:notification`）

## 資料模型

### 工具元資料（ToolEntry）

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| id | string | 是 | 唯一識別（`{type}:{name}`，如 `skill:debugging`） |
| name | string | 是 | 工具名稱 |
| type | enum | 是 | `skill` / `script` / `os-script` / `mcp` / `cli` |
| description | string | 是 | 一句話說明用途（< 80 字） |
| capabilities | string[] | 是 | 能力標籤（如 `["code-review", "security-audit"]`） |
| domains | string[] | 否 | 適用領域（如 `["dev", "devops", "trading"]`） |
| deps | string[] | 否 | 依賴的外部工具或服務 |
| path | string | 是 | 檔案路徑或 MCP server 名稱 |
| lastScanned | string | 是 | ISO 8601 掃描時間 |

### Matcher 輸出（MatchResult）

| 欄位 | 型別 | 說明 |
|------|------|------|
| task | string | 原始任務描述 |
| recommended | RecommendedTool[] | 推薦工具列表 |
| missing | string[] | 缺失能力描述 |
| confidence | number | 匹配信心（0-1） |

### RecommendedTool

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | string | 工具 ID |
| reason | string | 推薦理由（一句話） |
| priority | enum | `must` / `should` / `could` |

### 儲存

- 格式：JSON
- 位置：`~/.claude/data/tool-registry.json`
- 清理策略：每次 scan 全量覆寫

## 介面契約

### tool-registry.js

```javascript
// 掃描所有來源，建立索引
export async function scanTools() → { tools: ToolEntry[], scannedAt: string }

// 查詢工具（支援過濾）
export function queryTools(filters?: { type?, domain?, capability? }) → ToolEntry[]

// 取得單一工具
export function getTool(id: string) → ToolEntry | null

// 取得所有能力標籤（用於 Matcher 的 prompt 壓縮）
export function getCapabilitySummary() → string
```

CLI 子命令：

| 子命令 | 說明 | 選項 |
|--------|------|------|
| `scan` | 掃描並更新索引 | 無 |
| `list` | 列出工具 | `--type=` `--domain=` `--capability=` |
| `get <id>` | 單一工具詳細 | 無 |
| `summary` | 輸出能力摘要（Matcher 用） | 無 |

### tool-matcher.js

```javascript
// 語意匹配：任務描述 → 推薦工具組合
export async function matchTools(taskDescription: string) → MatchResult

// 關鍵詞匹配（本地模型不可用時的 fallback）
export function matchToolsByKeyword(taskDescription: string) → MatchResult
```

CLI：`bun tool-matcher.js "任務描述"` → stdout JSON

### 錯誤碼

| 碼 | 說明 |
|----|------|
| REGISTRY_NOT_FOUND | 索引不存在且 scan 失敗 |
| EMPTY_TASK | 任務描述為空 |
| MODEL_UNAVAILABLE | 本地模型不可用（已自動 fallback 到關鍵詞匹配） |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | scan 全量掃描 < 2 秒（本地檔案 I/O） |
| 效能 | matchTools 語意匹配 < 30 秒（含本地模型推理） |
| 效能 | queryTools 記憶體查詢 < 10ms |
| 可靠性 | 本地模型不可用時 Matcher 退化為關鍵詞匹配，不中斷 |
| 大小 | 索引檔案 < 100KB（預估 100 個工具 × ~500 bytes） |
| 相容性 | 不需要向後相容（新模組） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | ~/.claude/skills/*/SKILL.md | Skill 元資料來源 |
| 上游 | ~/.claude/scripts/*.js + os/*.js | Script 元資料來源 |
| 上游 | ~/.claude/settings.json | MCP Server 設定來源 |
| 上游 | local-model.js | Matcher 的語意匹配引擎 |
| 下游 | context-injector.js | SessionStart 注入可用工具摘要（未來） |
| 下游 | Main Agent | 任務規劃時查詢可用工具 |
| 關聯 | lifecycle-orchestrator.js | Forge 新 Skill 後觸發 scan 更新索引（未來整合） |

## 驗收標準

- [ ] `bun tool-registry.js scan` 正確掃描 5 種來源並寫入索引
- [ ] 索引包含所有 27 個 skills、17 個 scripts、10 個 OS scripts
- [ ] `bun tool-registry.js list --type=skill` 正確過濾
- [ ] `bun tool-registry.js get skill:debugging` 回傳完整元資料
- [ ] SKILL.md 無 frontmatter 時跳過不 crash
- [ ] `bun tool-matcher.js "寫一個 REST API"` 回傳包含相關開發工具的推薦
- [ ] 本地模型不可用時 Matcher 退化為關鍵詞匹配
- [ ] 缺失能力正確識別（如任務需要「資料庫管理」但無對應工具時列出）
- [ ] `bun test` 所有 tool-registry 和 tool-matcher 測試通過
- [ ] 索引檔案格式正確且 < 100KB

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 工具 capabilities 標籤不統一導致匹配失準 | 中 | 中 | 定義標準能力詞彙表（20-30 個標籤），scan 時本地模型協助分類 |
| 本地模型推薦不準確（false positive/negative） | 中 | 低 | 推薦結果附帶 confidence，低信心時提示人工確認；關鍵詞 fallback 保底 |
| 工具數量增長後 Matcher prompt 超過 context | 低 | 中 | 索引摘要壓縮策略：每工具一行（id + 30 字 description），100 工具 ≈ 3000 字 |
| capabilities 標籤手動維護成本高 | 中 | 低 | scan 時用本地模型從 SKILL.md / 檔案頭部註解自動提取 |
