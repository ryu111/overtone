# health-check.js — 技術設計

## 深度路由：D2
**理由**：跨 1 個新檔案 + 1 個測試檔案 + 2 個修改檔案，邏輯為純確定性檔案系統掃描，不涉及安全敏感或架構決策。D1 不夠因為需要 planner 定義四個 check 的精確檢查項目和輸出格式。D3 不需要因為無安全敏感操作。

---

## 技術摘要

- **方案**：單一檔案四函式 + 共用 scan 層，每個 check 函式回傳 Finding[]
- **理由**：四個 check 共享檔案系統掃描邏輯（讀 skills/、agents/、settings.json），提取共用層減少重複，單一檔案便於 CLI 和 import
- **取捨**：犧牲模組拆分的粒度（不拆 4 個檔案），換取單檔可執行性和低整合成本

## 方案比較

| 維度 | A：單一檔案四函式（選擇） | B：四個獨立檔案 + orchestrator |
|------|:--------------------:|:----------------------------:|
| 複雜度 | 低（1 個檔案） | 中（5 個檔案 + import 拼裝） |
| CLI 體驗 | 好（一個入口） | 差（需 orchestrator 串接） |
| 共用邏輯 | 檔案內共享（scan 層） | 需額外 shared-utils.js |
| 可維護性 | 中（≤800 行可控） | 高（每檔案 ≤200 行） |
| 測試 | 單一測試檔案 | 5 個測試檔案 |
| **結論** | ✅ 簡單直接，行數可控 | ❌ 過度拆分，整合成本高於收益 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | health-check.js | `~/.claude/scripts/` | ~500 | 四維度健康檢查（CLI + import） |
| 2 | health-check.test.js | `~/projects/nova-brain/tests/` | ~300 | 單元測試 + 整合測試 |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | smoke-test.js | L2 新增一項：呼叫 `runQuick()` 驗證 health-check 可執行 |
| 2 | maintainer.js | 在簡報生成前可選呼叫 `runQuick()` 注入健康摘要（可延後，不在本次 scope） |

### API 設計

```javascript
// ─── 共用型別 ───

/** @typedef {'critical' | 'warning' | 'info'} Severity */

/**
 * @typedef {Object} Finding
 * @property {string} check — 來源 check 名稱
 * @property {string} type — 缺口類型（如 orphan-skill、broken-hook-command）
 * @property {Severity} severity
 * @property {string} element — 元件識別（如 skill:debugging、hook:PreToolUse:Bash）
 * @property {string} description — 人可讀描述
 */

/**
 * @typedef {Object} HealthReport
 * @property {{ status: string, total: number, critical: number, warning: number, info: number, duration: number }} summary
 * @property {Finding[]} findings
 * @property {{ timestamp: string, version: string, checksRun: string[] }} metadata
 */

// ─── 共用 scan 層（internal）───

/**
 * scanSkills() → { name, dir, hasSkillMd, frontmatter, references[], scripts[], examples[] }[]
 * scanAgents() → { name, file, frontmatter, skills[] }[]
 * scanHooks() → settings.json parsed hooks 結構
 * scanModules() → hooks/modules/ 下的 .js 檔案列表 + exports
 */

// ─── 公開 API ───

export async function checkClosedLoop(): Promise<Finding[]>
export async function checkSkillCoverage(): Promise<Finding[]>
export async function checkHookIntegrity(): Promise<Finding[]>
export async function checkAgentAlignment(): Promise<Finding[]>
export async function runAll(options?: { checks?: string[] }): Promise<HealthReport>
export async function runQuick(): Promise<HealthReport>
```

## 內部架構

```
health-check.js
├── scan 層（~120 行）
│   ├── scanSkills()     — 掃描 skills/ 目錄
│   ├── scanAgents()     — 掃描 agents/ 目錄 + 解析 frontmatter
│   ├── scanHooks()      — 讀取 settings.json
│   └── scanModules()    — 掃描 hooks/modules/
├── check 層（~280 行，每個 ~70 行）
│   ├── checkClosedLoop()      — 消費 scanSkills + scanAgents
│   ├── checkSkillCoverage()   — 消費 scanSkills + scanScripts
│   ├── checkHookIntegrity()   — 消費 scanHooks + scanModules
│   └── checkAgentAlignment()  — 消費 scanAgents + scanSkills
├── orchestrator 層（~60 行）
│   ├── runAll()         — 執行指定 checks，彙整 HealthReport
│   └── runQuick()       — runAll({ checks: ['closedLoop', 'hookIntegrity'] })
└── CLI 層（~40 行）
    └── main()           — 解析 argv，呼叫 runAll/runQuick，stdout JSON
```

## Frontmatter 解析策略

Agent 和 Skill 的 SKILL.md / agent.md 使用 YAML frontmatter。解析策略：

1. 讀取檔案前 50 行（frontmatter 不會超過 50 行）
2. 找到 `---` 起止標記
3. 簡易 YAML 解析：逐行 `key: value` 和 `- item` 列表
4. 不引入 yaml parser 依賴 — 已知 frontmatter 結構簡單（name、skills、model 等）

容錯：解析失敗時生成 warning finding `parse-error`，不 throw。

## 資料流

```
~/.claude/skills/       ─┐
~/.claude/agents/       ─┤─→ scan 層 ─→ check 層 ─→ Finding[] ─→ runAll ─→ HealthReport
~/.claude/settings.json ─┤                                                       │
~/.claude/hooks/modules ─┘                                           ┌───────────┘
                                                                     ↓
                                                              gap-analyzer.js
                                                              (R3.1 下一步)
```

## 執行步驟

### Phase 1：核心實作（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | health-check.js | scan 層 + 4 個 check 函式 + runAll + runQuick + CLI |
| 1b | health-check.test.js | 單元測試（mock fs）+ 整合測試（真實 ~/.claude/）|

### Phase 2：整合（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | smoke-test.js | L2 新增 health-check runQuick() 項目 |

## Pre-mortem

**假設 health-check.js 上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | SKILL.md frontmatter 格式變異（有些 skill 用不同格式）導致解析失敗 | 中 | 中 | 容錯解析 + 解析失敗生成 finding 而非 crash + 測試覆蓋真實 skill |
| 2 | settings.json 結構變更後 hookIntegrity 檢查失效 | 低 | 高 | 讀取時驗證基本結構，結構異常生成 critical finding |
| 3 | 行數超過 800 行限制 | 中 | 低 | scan 層抽取共用邏輯（4 個 check 共享）、每個 check ~70 行控制 |
| 4 | runQuick() 在 maintainer.js 中執行超過 500ms | 低 | 中 | 快速模式只跑 2 個 check + scan 層用 lazy 快取（同次執行只掃一次）|
| 5 | 新增 skill/agent/hook 後忘記更新 health-check 的檢查邏輯 | 中 | 低 | health-check 本身依據檔案系統動態掃描，不硬編碼元件列表 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| health-check.test.js — scan 層 | scanSkills 回傳所有 skill 目錄資訊、scanAgents 解析 frontmatter、scanHooks 解析 settings.json |
| health-check.test.js — checkClosedLoop | 偵測 orphan-skill、broken-reference、name-mismatch |
| health-check.test.js — checkSkillCoverage | 偵測 empty-references、orphan-script |
| health-check.test.js — checkHookIntegrity | 偵測 broken-hook-command、broken-fallback |
| health-check.test.js — checkAgentAlignment | 偵測 missing-skill-dir、missing-skill-definition |
| health-check.test.js — runAll/runQuick | HealthReport 格式正確、summary 計算正確、quick 只跑 2 個 check |
| health-check.test.js — CLI 模式 | `bun health-check.js` stdout 為合法 JSON |
| health-check.test.js — 整合 | 對真實 `~/.claude/` 執行，0 個 critical finding（系統當前健康）|

## 不做什麼

1. **不做自動修復**：health-check 只偵測不修復。修復是 gap-fixer.js 的職責（關注點分離）
2. **不做 AI 語意分析**：所有檢查都是確定性的檔案存在/引用比對。「skill 品質好不好」不在 scope 內
3. **不做 maintainer.js 整合**：maintainer.js 呼叫 runQuick() 可延後到 gap-analyzer.js 完成後一起整合
4. **不做跨 repo 檢查**：nova-brain 引用 nova 模組的一致性屬於 review-checklist 第 4 層人工範疇
