# Tool Registry + Intent-to-Tool Mapping — 技術設計

## 深度路由：D2
**理由**：跨 2 個新檔案 + 1 個修改檔案，無安全敏感操作（只讀既有檔案 + 寫索引），不需 reviewer。選 D2 而非 D1 是因為涉及本地模型整合和 5 種異質來源的統一抽象。

---

## 技術摘要

- **方案**：獨立 CLI 腳本 + 本地 JSON 索引，Main Agent 按需呼叫
- **理由**：工具選擇由 Main Agent 做（深度路由原則），Registry 和 Matcher 是輔助查詢工具而非控制流管線
- **取捨**：索引是靜態快照（scan 時更新），不是即時反映——簡化實作，接受最多 24 小時延遲

## 方案比較

| 維度 | A：獨立 CLI + JSON 索引（選擇） | B：nova-server 新 API 端點 | C：settings.json 擴展 |
|------|:-----------------------------:|:-------------------------:|:--------------------:|
| 複雜度 | 低（2 個獨立腳本） | 高（修改 server.js + 新 route） | 低 |
| 即時性 | scan 時更新（可接受的延遲） | 即時（每次請求掃描） | 手動維護 |
| 可測試性 | 高（純函式 export + DI） | 中（需 server context） | 低（靜態設定） |
| 效能 | 查詢 < 10ms（記憶體 JSON） | 每次請求掃描（慢） | N/A |
| Main Agent 消費方式 | `bun tool-registry.js list` | `fetch /tools` | 讀 settings.json |
| **結論** | 選擇：最簡單、可測試、不動現有 server | 過度工程、掃描開銷大 | 不自動、不可擴展 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 | 消費者 |
|---|------|------|------|------|--------|
| 1 | tool-registry.js | `~/.claude/scripts/` | ~250 | 工具掃描 + 索引 + 查詢 CLI | Main Agent、tool-matcher.js |
| 2 | tool-matcher.js | `~/.claude/scripts/` | ~180 | 語意匹配 + 關鍵詞 fallback CLI | Main Agent |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | maintainer.js | （未來）Phase 新增 scan 觸發（本次不做，手動 scan 足夠） |

### API 設計

```javascript
// ===== tool-registry.js =====

/**
 * 掃描所有工具來源，建立索引
 * 來源：skills/ → scripts/ → scripts/os/ → settings.json mcpServers → 硬編碼 CLI
 */
export async function scanTools(deps?) {
  // deps 支援 DI：{ claudeDir, askLocalModel, readFileSync, existsSync }
  // 1. 掃描 5 個來源
  // 2. 對每個工具提取 name, description, type, path
  // 3. 用本地模型批次生成 capabilities 標籤（10 個工具一批）
  //    fallback：從 description 提取名詞作為 capabilities
  // 4. 寫入 ~/.claude/data/tool-registry.json
  // return { tools: ToolEntry[], scannedAt: string }
}

/**
 * 查詢工具（記憶體過濾）
 * @param filters - { type?, domain?, capability? }
 */
export function queryTools(filters?, deps?) {
  // 讀取索引 → 按條件過濾 → 回傳
}

/**
 * 取得能力摘要（Matcher 用的壓縮版）
 * 格式：每工具一行 "id | description | capabilities"
 */
export function getCapabilitySummary(deps?) {
  // 讀取索引 → 每工具壓縮為一行 → join("\n")
}

// CLI 入口
// argv[2] = 子命令：scan | list | get | summary
// list 支援 --type= --domain= --capability= 過濾
```

```javascript
// ===== tool-matcher.js =====

/**
 * 語意匹配：任務描述 → 推薦工具組合
 * 1. 讀取 getCapabilitySummary()
 * 2. 組合 prompt：任務描述 + 工具摘要 → 本地模型
 * 3. 解析 JSON 回應
 */
export async function matchTools(taskDescription, deps?) {
  // deps 支援 DI：{ askLocalModelJSON, getCapabilitySummary }
  // prompt 模板見下方
  // return { task, recommended, missing, confidence }
}

/**
 * 關鍵詞匹配（fallback）
 * 從任務描述提取關鍵詞 → 比對每個工具的 name + description + capabilities
 */
export function matchToolsByKeyword(taskDescription, deps?) {
  // 分詞 → 計算每個工具的匹配分數 → 排序取 top 10
  // 無法識別缺失能力（關鍵詞匹配的局限）
}

// CLI 入口
// argv[2] = 任務描述字串
```

### 本地模型 Prompt 設計

Matcher 的語意匹配 prompt（需控制在 4000 tokens 以內）：

```
你是工具推薦引擎。根據任務描述，從可用工具清單中選擇需要的工具。

## 任務
{taskDescription}

## 可用工具（每行格式：id | 描述 | 能力標籤）
{capabilitySummary}

## 回覆格式（純 JSON，不要思考過程）
{
  "recommended": [
    { "id": "tool-id", "reason": "一句話理由", "priority": "must|should|could" }
  ],
  "missing": ["缺失能力描述1", "缺失能力描述2"],
  "confidence": 0.8
}

規則：
- recommended 最多 10 個工具
- priority=must 表示沒有這個工具就無法完成任務
- missing 列出任務需要但工具清單中沒有的能力
- confidence 0-1 表示匹配的信心程度
```

### 掃描器設計（5 個來源）

| # | 來源 | 掃描方法 | description 提取 | capabilities 提取 |
|---|------|---------|-----------------|-------------------|
| 1 | skills/ | `readdirSync` → 讀 SKILL.md frontmatter | frontmatter.description | 本地模型從 SKILL.md 摘要提取；fallback 用 description 分詞 |
| 2 | scripts/ | `readdirSync` → 讀第 2 行註解 | `// name — description` 格式解析 | 同上 |
| 3 | scripts/os/ | 同 scripts/ | 同上 | 同上 |
| 4 | mcpServers | 讀 settings.json → 解析 mcpServers keys | 從 key name + command 推斷 | 硬編碼已知 MCP 能力（Notion、PinchTab） |
| 5 | CLI | 硬編碼清單 | 預定義 | 預定義 |

**capabilities 批次提取的 prompt**（10 個工具一批）：

```
為以下工具列表各提取 2-5 個能力標籤。

工具：
1. debugging — debugging 知識域，提供 RCA 五步法...
2. security-kb — 安全知識庫...
...

回覆格式（純 JSON）：
{ "1": ["debug", "root-cause-analysis"], "2": ["security", "audit"] }
```

### 硬編碼 CLI 工具清單

```javascript
const CLI_TOOLS = [
  { name: "git", description: "版本控制", capabilities: ["vcs", "branch", "merge"], domains: ["dev"] },
  { name: "gh", description: "GitHub CLI", capabilities: ["github", "pr", "issue"], domains: ["dev"] },
  { name: "bun", description: "JavaScript runtime + 套件管理", capabilities: ["js-runtime", "test", "package"], domains: ["dev"] },
  { name: "curl", description: "HTTP 請求", capabilities: ["http", "api-call"], domains: ["dev", "devops"] },
  { name: "jq", description: "JSON 處理", capabilities: ["json", "data-transform"], domains: ["dev", "data"] },
  { name: "sqlite3", description: "SQLite 資料庫", capabilities: ["database", "sql", "query"], domains: ["dev", "data"] },
  { name: "screencapture", description: "macOS 截圖", capabilities: ["screenshot", "visual"], domains: ["os"] },
  { name: "osascript", description: "AppleScript/JXA 執行", capabilities: ["automation", "macos", "gui"], domains: ["os"] },
];
```

## 資料模型

- 儲存格式：JSON
- 儲存位置：`~/.claude/data/tool-registry.json`
- 清理策略：每次 scan 全量覆寫（不累積）

索引檔案結構：

```json
{
  "version": 1,
  "scannedAt": "2026-03-16T12:00:00.000Z",
  "tools": [
    {
      "id": "skill:debugging",
      "name": "debugging",
      "type": "skill",
      "description": "debugging 知識域，提供 RCA 五步法、症狀→根因映射",
      "capabilities": ["debug", "root-cause-analysis", "error-diagnosis"],
      "domains": ["dev"],
      "deps": [],
      "path": "~/.claude/skills/debugging/SKILL.md",
      "lastScanned": "2026-03-16T12:00:00.000Z"
    }
  ]
}
```

## 與現有模組的整合點

| 整合 | 時機 | 方式 | 優先序 |
|------|------|------|:------:|
| lifecycle-orchestrator.js | Forge 新 Skill 後 | 呼叫 `scanTools()` 更新索引 | 未來（本次不做） |
| context-injector.js | SessionStart | 注入工具能力摘要到 additionalContext | 未來（本次不做） |
| session-spawner.js | spawn 前 | 用 Matcher 預選工具注入 session context | 未來（本次不做） |
| Main Agent 深度路由 | D2+ 規劃時 | Main 呼叫 `bun tool-matcher.js "任務"` 輔助選擇 | 本次核心 |

## 執行步驟

### Phase 1：Tool Registry（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | tool-registry.js | 實作 5 個掃描器（skills、scripts、os-scripts、mcp、cli） |
| 1b | tool-registry.js | 實作 scanTools + queryTools + getTool + getCapabilitySummary |
| 1c | tool-registry.js | 實作 CLI 入口（scan / list / get / summary） |

### Phase 2：Tool Matcher（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | tool-matcher.js | 實作 matchTools（本地模型語意匹配） |
| 2b | tool-matcher.js | 實作 matchToolsByKeyword（關鍵詞 fallback） |
| 2c | tool-matcher.js | 實作 CLI 入口 |

### Phase 3：測試（parallel，依賴 Phase 1+2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | tool-registry.test.js | scan 各來源 + query 過濾 + CLI 輸出格式 |
| 3b | tool-matcher.test.js | 語意匹配 + 關鍵詞 fallback + 缺失能力識別 |

## Pre-mortem

**假設 Tool Registry + Matcher 上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | capabilities 標籤不一致（同一能力不同寫法：「debug」vs「debugging」vs「除錯」） | 高 | 中 | 定義標準詞彙表（20-30 個），scan 時強制映射到標準詞彙 |
| 2 | 本地模型推薦結果不實用（推薦了不相關的工具或遺漏關鍵工具） | 中 | 中 | confidence 門檻 + 人工確認提示 + 持續收集回饋改進 prompt |
| 3 | SKILL.md 格式不統一導致 description 解析失敗 | 中 | 低 | 對 27 個 skills 做一次格式驗證，缺 frontmatter 的給 fallback（用目錄名） |
| 4 | 索引過期但無人執行 scan（工具清單與實際不符） | 中 | 低 | list/get 時檢查 lastScanned，超過 24 小時 log 提示 |
| 5 | Matcher prompt 超過本地模型 context 長度 | 低 | 高 | 摘要壓縮策略 + 分批匹配（先粗篩 type/domain 再細篩） |

**Pre-mortem 觸發重新設計的條件**：風險 #1（高機率 + 中影響）需要標準詞彙表作為預防——已納入設計（scan 時映射）。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| tool-registry.test.js | scanSkills 正確解析 SKILL.md frontmatter |
| tool-registry.test.js | scanScripts 正確解析檔案頭部註解 |
| tool-registry.test.js | scanMcpServers 正確解析 settings.json |
| tool-registry.test.js | queryTools 按 type/domain/capability 過濾 |
| tool-registry.test.js | getCapabilitySummary 輸出格式正確且每工具一行 |
| tool-matcher.test.js | matchTools 回傳正確的 JSON 結構 |
| tool-matcher.test.js | matchToolsByKeyword 在無模型時正確運作 |
| tool-matcher.test.js | 缺失能力識別（任務需要但索引中沒有的能力） |
| tool-matcher.test.js | 空任務描述回傳錯誤 |

## 不做什麼

1. **不做自動 scan 觸發**：不整合進 SessionStart 或 Maintainer 自動掃描——手動 `bun tool-registry.js scan` 足夠，避免每次 session 多 2 秒掃描開銷
2. **不做工具排名/學習**：不追蹤工具使用頻率來優化推薦——Learner 已有行為追蹤，未來可整合但本次不做
3. **不做 MCP Server 生命週期管理**：不自動啟動/關閉 MCP Server——那是 R4.1 後續任務「連接生命週期」
4. **不做 Pipeline**：工具選擇由 Main Agent 人工決策，Matcher 只是推薦參考——不建任何自動化工具組合管線
