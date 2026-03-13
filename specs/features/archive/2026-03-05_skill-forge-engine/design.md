# Skill Forge Engine — 技術設計

## 技術摘要（What & Why）

- **方案**：`skill-forge.js` 作為獨立引擎模組，接受 `forgeSkill(domainName, context, options)` 呼叫，內部執行知識萃取 → SKILL.md 組裝 → config-api.js create skill → validate-agents 驗證的完整流程。
- **理由**：與 gap-fixer.js 的策略選擇 pattern 一致（模組封裝邏輯，CLI thin wrapper呼叫）；使用 `Bun.spawnSync` 呼叫 manage-component.js 和 validate-agents.js，避免循環依賴並保持邊界清晰。
- **取捨**：知識萃取僅掃描靜態 codebase（SKILL.md 模式 + auto-discovered.md + CLAUDE.md），不讀 observations.jsonl（原因見決策 1）。自動生成的 SKILL.md 品質有限，接受「結構合法即可用」原則，內容由人工後續補充。

## Open Questions 決策

### Q1：知識萃取是否納入 observations.jsonl？

**決定：不納入。**

理由：
- observations.jsonl 散佈於 `~/.overtone/sessions/*/observations.jsonl`，需跨 session 目錄掃描，I/O 成本高
- observations 記錄的是行為觀察，非結構化知識，萃取信噪比低
- Phase 1 目標是建立最小可行的 SKILL.md 骨架，靜態來源（SKILL.md patterns + CLAUDE.md + auto-discovered.md）已足夠

Phase 2 可擴展 WebFetch 外部研究，屆時再評估是否引入 observations。

### Q2：自動生成 SKILL.md 最低可用標準？

**決定：三個必要 section + 驗證通過。**

必要 section（按順序）：
1. `## 消費者` — 消費者表（初始可為空表格）
2. `## 資源索引` — references 佔位（初始指向待建的 README.md）
3. `## 按需讀取` — 簡短說明何時查閱

validate-agents.js 通過（0 error）是硬性門檻。SKILL.md content 的語意品質不在 forge 的驗證範圍內。

### Q3：forge dry-run 的 exit code 語義？

**決定：dry-run 成功（domain 不衝突）→ exit 0；domain 衝突 → exit 1；系統錯誤 → exit 1。**

類比：`evolution.js fix`（dry-run）exit 0 = 「預覽成功，可執行」。`forge` dry-run exit 0 = 「可以 forge，此 domain 不存在衝突」。衝突才是 exit 1，讓 CI/自動化腳本能區分「乾淨的 dry-run 預覽」和「有問題的狀況」。

### Q4：consecutiveFailures 持久化策略？

**決定：記憶體內（單次 CLI 呼叫），不持久化到磁碟。**

理由：
- Phase 1 的 forge 是人工觸發的 CLI 工具，不是自動化的 daemon 迴圈
- 每次 `evolution.js forge` 呼叫都是獨立的嘗試，記憶體計數已足夠
- 磁碟持久化（`~/.overtone/forge-state.json`）應在 L3.5 自動觸發 forge 的場景才需要

## API 介面設計

### 核心函式

```typescript
// skill-forge.js 主 API
function forgeSkill(
  domainName: string,
  context: ForgeContext,
  options?: ForgeOptions
): ForgeResult

interface ForgeContext {
  // 知識萃取輸入（由 CLI 或呼叫者提供）
  // Phase 1：從 pluginRoot 自動掃描，context 可為空物件 {}
}

interface ForgeOptions {
  dryRun?: boolean        // 預設 true — dry-run 不執行 fs 操作
  pluginRoot?: string     // 覆寫 plugin 根目錄（供測試注入）
  maxConsecutiveFailures?: number  // 預設 3
}

type ForgeStatus = 'success' | 'conflict' | 'paused' | 'error'

interface ForgeResult {
  status: ForgeStatus
  domainName: string
  // status === 'success'
  skillPath?: string          // 建立的 SKILL.md 路徑
  preview?: ForgePreview      // dry-run 時填充
  // status === 'conflict'
  conflictPath?: string       // 已存在的 SKILL.md 路徑
  // status === 'paused'
  consecutiveFailures?: number
  // status === 'error'
  error?: string
}

interface ForgePreview {
  domainName: string
  description: string           // 產出的 description
  body: string                  // 產出的 SKILL.md body（frontmatter 除外）
  sourcesScanned: string[]      // 知識萃取掃描了哪些來源
}
```

### 內部輔助函式（不對外導出）

```typescript
// 掃描現有 SKILL.md 模式，萃取結構知識
function extractKnowledgeFromCodebase(domainName: string, pluginRoot: string): KnowledgeExtracts

interface KnowledgeExtracts {
  skillPatterns: string[]     // 現有 SKILL.md 的結構模式描述
  autoDiscovered: string      // auto-discovered.md 的相關段落
  claudeMdRelevant: string    // CLAUDE.md 中與 domainName 相關的段落
  sourcesScanned: string[]    // 已掃描檔案清單
}

// 組裝 SKILL.md body（不含 frontmatter）
function assembleSkillBody(domainName: string, extracts: KnowledgeExtracts): string

// 呼叫 validate-agents.js 驗證（exit 0 = pass）
function validateStructure(projectRoot: string): { valid: boolean, errors: string[] }
```

### evolution.js forge 子命令介面

```
用法：bun scripts/evolution.js forge <domain> [--execute] [--json]

  forge <domain>              預覽 forge 結果（dry-run，不建立任何檔案）
  forge <domain> --execute    實際執行 forge，建立 skill
  forge <domain> --json       以 JSON 格式輸出結果
```

### 錯誤情況

| 情況 | status | exit code | 訊息 |
|------|--------|-----------|------|
| domain 不存在，dry-run 預覽 | success | 0 | 輸出 ForgePreview |
| domain 不存在，execute 成功 | success | 0 | 輸出建立的路徑 |
| domain 已存在（衝突） | conflict | 1 | `衝突：skill "{domain}" 已存在於 {path}` |
| 連續失敗達上限 | paused | 1 | `已暫停：連續失敗 {n} 次` |
| 缺少 domain 參數 | - | 1 | printUsage() |
| 系統錯誤（validate 失敗等） | error | 1 | error message |

## 資料模型

### ForgeResult（記憶體物件，不持久化）

```typescript
// 記憶體內的連續失敗計數器（模組層級，隨 CLI 進程生命週期）
let consecutiveFailures = 0    // 初始為 0，forge 成功後重置

// ForgeResult 是函式回傳值，不寫入任何檔案
// 成功執行後唯一的副作用是建立 skills/{domain}/SKILL.md
```

### 知識萃取來源（Phase 1）

| 來源 | 路徑 | 萃取策略 |
|------|------|---------|
| 現有 SKILL.md 結構 | `{pluginRoot}/skills/*/SKILL.md` | 讀取 frontmatter + section 標題，建立模板骨架 |
| auto-discovered | `{pluginRoot}/skills/instinct/auto-discovered.md` | 搜尋含 domainName 關鍵詞的段落 |
| CLAUDE.md | `{pluginRoot}/../../CLAUDE.md` | 搜尋含 domainName 關鍵詞的段落 |

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/knowledge/knowledge-gap-detector.js
    ← 修改：在 DOMAIN_KEYWORDS 新增 os-control、autonomous-control、craft 三個 domain
    ← 修改：更新頂部文檔注釋（12/15 → 15/15）
  plugins/overtone/scripts/evolution.js
    ← 修改：新增 forge 子命令解析、printUsage 更新、VALID_FORGE_DOMAINS 常數
    ← 修改：module.exports 加入 VALID_FORGE_DOMAINS

新增的檔案：
  plugins/overtone/scripts/lib/skill-forge.js
    ← 新增：forge 引擎核心（forgeSkill API + 知識萃取 + SKILL.md 組裝 + 驗證）
  tests/unit/skill-forge.test.js
    ← 新增：skill-forge.js 單元測試（5 個測試情境）
  tests/integration/evolution-forge.test.js
    ← 新增：evolution.js forge 子命令整合測試（4 個測試情境）
```

## 關鍵技術決策

### 決策 1：skill-forge.js 呼叫 manage-component.js 的方式

- **選項 A（選擇）：Bun.spawnSync 子進程呼叫** — 與 gap-fixer.js 呼叫 fix-consistency.js 的方式完全一致；保持邊界清晰，避免 config-api.js 循環依賴；測試時用 `_deps = { spawnSync }` 注入 mock
- **選項 B（未選）：直接 require config-api.js createSkill** — 雖然少一層子進程開銷，但 skill-forge.js 已在 scripts/lib/ 層，直接 require config-api.js 會建立相互依賴鏈，日後難以維護

### 決策 2：連續失敗計數的範圍

- **選項 A（選擇）：模組層級變數（記憶體內）** — 每次 CLI 呼叫獨立重置，實作最簡單；Phase 1 只有人工觸發場景，記憶體計數已滿足需求
- **選項 B（未選）：持久化到 `~/.overtone/forge-state.json`** — 適合 L3.5 自動化觸發場景，當前過度設計

### 決策 3：知識萃取的深度邊界

- **選項 A（選擇）：靜態 codebase 掃描（3 個來源）** — 確定性高、無副作用、適合 Phase 1；SKILL.md 是結構模板，auto-discovered 和 CLAUDE.md 提供語境
- **選項 B（未選）：加入 observations.jsonl 掃描** — observations 是行為記錄非知識，跨 session 掃描 I/O 成本高，留待 Phase 2 WebFetch 時一併評估

### 決策 4：SKILL.md body 的組裝策略

- **選項 A（選擇）：固定骨架 + 掃描補充** — 三個 section（消費者表、資源索引、按需讀取）固定結構，從 CLAUDE.md 萃取相關 context 填入描述，確保 validate-agents 通過
- **選項 B（未選）：完全由掃描結果動態生成** — 結構不穩定，可能導致 validate-agents 失敗，複雜度高

## 實作注意事項

給 developer 的提醒：

- `skill-forge.js` 的 `consecutiveFailures` 計數器是模組層級變數（`let consecutiveFailures = 0`），隨模組載入初始化；每次 `forgeSkill` 成功時重置為 0，失敗時累加；達到 `maxConsecutiveFailures`（預設 3）時回傳 `{ status: 'paused' }`
- 知識萃取掃描 `skills/*/SKILL.md` 時，用 `fs.readdirSync` 而非 glob，與現有 scripts/lib/ 模式一致（不依賴外部 glob 庫）
- `validateStructure` 呼叫 `bun scripts/validate-agents.js`，使用 projectRoot（pluginRoot 往上兩層）作為 cwd
- 整合測試的 execute 模式要使用不存在的假 domain 名稱（如 `test-forge-temp`），測試後用 `fs.rmSync` 清理 `skills/test-forge-temp/` 目錄
- knowledge-gap-detector.js 的 os-control 關鍵詞應包含：`os`, `screenshot`, `window`, `process`, `clipboard`, `keyboard`, `mouse`, `applescript`, `desktop`, `automation`, `system info`, `notification`, `fswatch`；autonomous-control 應包含：`heartbeat`, `daemon`, `queue`, `spawn`, `session`, `execution queue`, `scheduler`, `auto`, `cron`, `background`, `autonomous`；craft 應包含：`clean code`, `solid`, `refactor`, `design pattern`, `dry`, `srp`, `function composition`, `immutable`, `pure function`, `code smell`
