# health-check 57 Warning 分類清理

## 動機（Why）

- **問題**：`bun ~/.claude/scripts/health-check.js` 報告 57 個 warning（17 orphan-skill + 18 unindexed-reference + 22 orphan-script），全部是偵測邏輯不足造成的誤報，非真正的系統缺陷。
- **目標**：修正 health-check.js 的 3 個 check function 偵測範圍，使其覆蓋所有合法引用管道；同時修補 18 個 SKILL.md 的真實 reference 索引缺漏。最終 warning 數歸零。
- **不做的代價**：57 個 warning 淹沒真正問題的訊號。開發者對 health-check 失去信任，新 warning 出現時不會被注意。

## 範圍

### In-scope

1. **`checkClosedLoop` orphan-skill 偵測**：擴展引用來源，涵蓋 commands、EXTRA_SKILLS 動態注入、`disable-model-invocation: true` + `user-invocable: false`（domain knowledge skill）3 個管道
2. **`checkSkillCoverage` orphan-script 偵測**：擴展引用來源，涵蓋 settings.json hook commands、hooks/modules import、scripts 間 import、agents content、commands content、CLAUDE.md + rules 引用 6 個管道
3. **18 個 SKILL.md reference 索引缺漏修補**：在 SKILL.md 中補上 `./references/` backtick 索引
4. **測試更新**：更新 nova-brain 的 `health-check.test.js` 驗證新偵測邏輯

### Out-of-scope

- health-check.js 的 JSON 輸出格式（HealthReport schema）不變
- 不新增 check function，只修改現有 3 個
- 不建 whitelist/allowlist 繞過機制
- 不修改 SKILL.md 的實際內容，只補索引行

## 使用者故事

1. 身為開發者，我想要 `bun ~/.claude/scripts/health-check.js` 只報告真正的問題，不報誤報，以便快速定位系統健康問題。
2. 身為 maintainer 自動化流程，我想要 warning 數為 0 作為基準線，任何新 warning 都代表真正需要修復的缺口。

## 行為規格

### 正常路徑

#### orphan-skill 偵測（checkClosedLoop 第 289-296 行）

目前只掃 `agents/*.md` 的 `skills[]` frontmatter。修改後掃描 4 個管道：

| # | 引用管道 | 掃描方式 | 涵蓋的 skill |
|---|---------|---------|-------------|
| 1 | `agents/*.md` skills[] | frontmatter 解析（現有） | 已涵蓋 |
| 2 | `commands/*.md` content | 全文搜尋 skill name | skill-judge, pm, agent-browser, pinchtab, auto, nova-autonomous-control, evolve, onboard, pr, instinct, issue |
| 3 | `rules/*.md` EXTRA_SKILLS | regex 提取 `EXTRA_SKILLS:.*{name}` | nova-spec, closed-loop, security-kb, database |
| 4 | domain knowledge skill | `user-invocable: false` 的 skill 視為按需注入，不報 orphan | wording, claude-dev, debugging, os-control 等 |

判定邏輯：skill 只有同時不在 4 個管道中才是真正的 orphan。

#### orphan-script 偵測（checkSkillCoverage 第 378-393 行）

目前只掃 skill content。修改後掃描 7 個管道：

| # | 引用管道 | 掃描方式 |
|---|---------|---------|
| 1 | `skills/*/SKILL.md` content | 全文搜尋 script filename（現有） |
| 2 | `settings.json` hook commands | 已有 scanHooks，提取 script path |
| 3 | `hooks/modules/*.js` | 全文搜尋 script filename |
| 4 | `scripts/*.js` 互相 import | 全文搜尋 script filename |
| 5 | `agents/*.md` content | 全文搜尋 script filename |
| 6 | `commands/*.md` content | 全文搜尋 script filename |
| 7 | `CLAUDE.md` + `rules/*.md` | 全文搜尋 script filename |

判定邏輯：script 只有在 7 個管道中都找不到引用才是真正的 orphan。

#### unindexed-reference 修補

18 個 SKILL.md 補上 `./references/{filename}` backtick 索引。索引位置：SKILL.md 的「資源索引」表格（若不存在則新增）。

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| commands/ 目錄不存在 | 跳過管道 2，不報錯 |
| rules/ 目錄不存在 | 跳過管道 3，不報錯 |
| SKILL.md frontmatter 無 user-invocable 欄位 | 視為 `user-invocable: true`（預設可被使用者呼叫） |
| 新增 skill 未在任何管道中引用 | 依然報 orphan-skill warning（正確行為） |

### 邊界條件

- skill name 含特殊字元（如 `nova-autonomous-control`）：regex 需處理 hyphen
- script filename 在 content 中以多種格式出現（`scripts/foo.js`、`~/.claude/scripts/foo.js`、`join(CLAUDE_DIR, 'scripts/foo.js')`）：統一用 basename 匹配
- EXTRA_SKILLS 一行中列多個 skill（`[EXTRA_SKILLS: skill1, skill2]`）：逐一提取

## 資料模型

### 輸入

不變。scan 層已有 scanSkills、scanAgents、scanHooks、scanModules、scanScripts。新增：

| 函式 | 回傳 | 說明 |
|------|------|------|
| `scanCommands()` | `{ name, path, content }[]` | 掃描 `~/.claude/commands/*.md` |
| `scanRules()` | `{ name, path, content }[]` | 掃描 `~/.claude/rules/*.md` + `~/.claude/CLAUDE.md` |

### 輸出

不變。Finding 結構不變，HealthReport schema 不變。

## 介面契約

### 新增 scan 函式

```javascript
function scanCommands() → { name: string, path: string, content: string }[]
function scanRules() → { name: string, path: string, content: string }[]
```

### 修改 check 函式簽名

不變。仍是 `async function checkClosedLoop(cache)` 和 `async function checkSkillCoverage(cache)`，只是內部引用更多 scan 結果。

cache 新增 key：`commands`、`rules`、`hookCommands`（從 scanHooks 結果中提取 script 路徑）。

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | runAll 執行時間 < 2000ms（現有約束，新增 scan 不超過 50ms） |
| 相容性 | HealthReport JSON schema 不變，下游消費者（maintainer、briefing-builder）無需修改 |
| 行數 | health-check.js 修改後 <= 800 行（現有 680 行，預計增加 80-100 行） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | `~/.claude/skills/*/SKILL.md` | 讀取 frontmatter + content |
| 上游 | `~/.claude/commands/*.md` | 新增讀取 |
| 上游 | `~/.claude/rules/*.md` | 新增讀取 |
| 上游 | `~/.claude/hooks/modules/*.js` | 讀取 content |
| 上游 | `~/.claude/scripts/*.js` | 讀取 content |
| 下游 | maintainer.js | 消費 HealthReport（不受影響） |
| 下游 | briefing-builder.js | 消費 HealthReport（不受影響） |

## 驗收標準

- [ ] `bun ~/.claude/scripts/health-check.js` 輸出 0 critical + 0 warning
- [ ] 17 個 orphan-skill 全部消除（不靠 whitelist）
- [ ] 22 個 orphan-script 全部消除（不靠 whitelist）
- [ ] 18 個 unindexed-reference 全部消除（SKILL.md 已補索引）
- [ ] `bun test` 全量通過（含既有測試不迴歸）
- [ ] 新增測試覆蓋：commands 管道、EXTRA_SKILLS 管道、domain-knowledge-skill 管道、scripts 跨管道引用
- [ ] HealthReport JSON schema 不變（結構化比對）
- [ ] health-check.js 行數 <= 800 行

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 擴大偵測範圍後漏掉真正的 orphan（false negative） | 中 | 中 | 陽性測試：mock 一個真正不在任何管道中的 skill/script，驗證仍能偵測 |
| 18 個 SKILL.md 修改時意外破壞 frontmatter 格式 | 低 | 高 | 只追加索引行，不修改 frontmatter 區塊；修改後逐一驗證 parseFrontmatter 結果 |
| commands 或 rules 目錄結構變化導致 scan 失敗 | 低 | 低 | 防禦性程式：目錄不存在時回傳空陣列 |
