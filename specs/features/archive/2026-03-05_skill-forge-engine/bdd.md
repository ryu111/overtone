# Feature: Skill Forge Engine（L3.3）

BDD 行為規格涵蓋五個子功能領域：
1. forgeSkill API 核心行為（4 種 status 路徑）
2. dry-run vs execute 模式
3. 知識萃取完整性
4. 安全邊界（不覆蓋、失敗暫停、回滾）
5. evolution.js forge CLI 子命令
6. knowledge-gap-detector 關鍵詞補齊
7. 產出 SKILL.md 結構驗證

---

## Feature 1: forgeSkill API — status 路徑

### Scenario: 成功 dry-run 預覽新 domain

@smoke
GIVEN `plugins/overtone/skills/` 目錄下不存在 `new-domain/SKILL.md`
WHEN 呼叫 `forgeSkill('new-domain', {}, { dryRun: true })`
THEN 回傳 `{ status: 'success', domainName: 'new-domain' }`
AND `result.preview` 包含 `domainName`、`description`、`body`、`sourcesScanned` 四個欄位
AND `result.skillPath` 為 undefined（dry-run 不建立檔案）
AND 磁碟上不存在 `skills/new-domain/` 目錄

### Scenario: 成功 execute 建立新 skill

@smoke
GIVEN `plugins/overtone/skills/` 目錄下不存在 `forge-test-domain/SKILL.md`
AND `dryRun` 為 false（execute 模式）
WHEN 呼叫 `forgeSkill('forge-test-domain', {}, { dryRun: false })`
THEN 回傳 `{ status: 'success', domainName: 'forge-test-domain' }`
AND `result.skillPath` 包含實際建立的 SKILL.md 路徑
AND 磁碟上存在 `skills/forge-test-domain/SKILL.md`
AND `result.preview` 為 undefined（execute 模式不回傳 preview）

### Scenario: domain 已存在時回傳衝突

@edge-case
GIVEN `plugins/overtone/skills/testing/SKILL.md` 已存在
WHEN 呼叫 `forgeSkill('testing', {}, { dryRun: true })`
THEN 回傳 `{ status: 'conflict', domainName: 'testing' }`
AND `result.conflictPath` 指向已存在的 SKILL.md 路徑
AND 磁碟上的既有 SKILL.md 內容未被修改
AND `result.preview` 為 undefined

### Scenario: 連續失敗達上限後暫停

@edge-case
GIVEN `consecutiveFailures` 計數已達 `maxConsecutiveFailures`（預設 3）
WHEN 呼叫 `forgeSkill('some-domain', {}, { dryRun: false })`
THEN 回傳 `{ status: 'paused', domainName: 'some-domain' }`
AND `result.consecutiveFailures` 等於 `maxConsecutiveFailures`
AND 不嘗試建立任何檔案

### Scenario: validate-agents 驗證失敗時回傳 error 並回滾

@error
GIVEN `validate-agents.js` 執行後 exit code 非 0
AND `dryRun` 為 false
WHEN `forgeSkill` 完成 SKILL.md 建立後呼叫 `validateStructure`
THEN 回傳 `{ status: 'error', domainName: '...', error: '...' }`
AND 已建立的 `skills/{domain}/` 目錄被刪除（回滾）
AND `consecutiveFailures` 計數遞增 1

### Scenario: validate-agents 驗證成功後重置連續失敗計數

@regression
GIVEN `consecutiveFailures` 計數為 2
AND `dryRun` 為 false
WHEN `forgeSkill` 成功呼叫並 `validateStructure` 通過（exit 0）
THEN 回傳 `{ status: 'success' }`
AND 模組層級的 `consecutiveFailures` 計數重置為 0

### Scenario: maxConsecutiveFailures 可由 options 覆寫

@edge-case
GIVEN 呼叫時傳入 `options.maxConsecutiveFailures: 1`
AND `consecutiveFailures` 計數已為 1
WHEN 呼叫 `forgeSkill('test-domain', {}, { maxConsecutiveFailures: 1 })`
THEN 回傳 `{ status: 'paused' }`
AND `result.consecutiveFailures` 等於 1

---

## Feature 2: dry-run vs execute 模式

### Scenario: 預設模式為 dry-run（不傳 options）

@smoke
GIVEN `plugins/overtone/skills/` 目錄下不存在 `alpha-domain/SKILL.md`
WHEN 呼叫 `forgeSkill('alpha-domain', {})` 不傳第三個參數
THEN 回傳 `{ status: 'success' }`
AND `result.preview` 存在（dry-run 預覽填充）
AND 磁碟上不存在 `skills/alpha-domain/` 目錄

### Scenario: 明確傳入 dryRun: true 等同預設行為

@edge-case
GIVEN `plugins/overtone/skills/` 目錄下不存在 `beta-domain/SKILL.md`
WHEN 呼叫 `forgeSkill('beta-domain', {}, { dryRun: true })`
THEN 磁碟上不存在 `skills/beta-domain/` 目錄
AND `result.preview.body` 包含三個必要 section 的骨架

### Scenario: execute 模式產出的 SKILL.md 通過 validate-agents

@smoke
GIVEN `plugins/overtone/skills/` 目錄下不存在 `verify-domain/SKILL.md`
WHEN 呼叫 `forgeSkill('verify-domain', {}, { dryRun: false })`
AND `validateStructure` 被呼叫一次
THEN `validateStructure` 回傳 `{ valid: true, errors: [] }`
AND 回傳 `{ status: 'success' }`

### Scenario: pluginRoot 可由 options 覆寫（供測試注入）

@edge-case
GIVEN 傳入 `options.pluginRoot` 指向臨時測試目錄
AND 臨時目錄下不存在 `skills/mock-domain/SKILL.md`
WHEN 呼叫 `forgeSkill('mock-domain', {}, { pluginRoot: tmpDir, dryRun: true })`
THEN 知識萃取掃描臨時目錄而非真實 plugin 目錄
AND 不影響真實的 `plugins/overtone/skills/` 目錄

---

## Feature 3: 知識萃取完整性

### Scenario: 掃描三個知識來源並回報在 sourcesScanned

@smoke
GIVEN `pluginRoot` 下存在多個 `skills/*/SKILL.md`
AND `skills/instinct/auto-discovered.md` 存在
AND 專案根目錄的 `CLAUDE.md` 存在
WHEN 呼叫 `forgeSkill('some-domain', {}, { dryRun: true })`
THEN `result.preview.sourcesScanned` 包含掃描到的 SKILL.md 路徑清單
AND `result.preview.sourcesScanned` 包含 `auto-discovered.md` 的路徑
AND `result.preview.sourcesScanned` 包含 `CLAUDE.md` 的路徑

### Scenario: auto-discovered.md 不存在時靜默跳過

@edge-case
GIVEN `skills/instinct/auto-discovered.md` 不存在
WHEN 呼叫 `forgeSkill('some-domain', {}, { dryRun: true })`
THEN 不拋出錯誤
AND `result.preview.sourcesScanned` 不包含 auto-discovered.md 路徑
AND 仍成功產出 preview

### Scenario: 萃取含 domainName 關鍵詞的 CLAUDE.md 段落

@edge-case
GIVEN `CLAUDE.md` 內容包含 `my-domain` 關鍵詞的相關段落
WHEN 呼叫 `forgeSkill('my-domain', {}, { dryRun: true })`
THEN `result.preview.body` 中的描述段落包含從 CLAUDE.md 萃取的相關 context

### Scenario: 無任何 SKILL.md 可掃描時仍產出固定骨架

@error
GIVEN `pluginRoot` 下不存在任何 `skills/*/SKILL.md`
WHEN 呼叫 `forgeSkill('isolated-domain', {}, { dryRun: true })`
THEN `result.status` 為 'success'
AND `result.preview.body` 仍包含三個必要 section（消費者、資源索引、按需讀取）

---

## Feature 4: 安全邊界

### Scenario: 衝突時不覆蓋既有 skill

@security
GIVEN `skills/workflow-core/SKILL.md` 存在且有特定內容
WHEN 呼叫 `forgeSkill('workflow-core', {}, { dryRun: false })`
THEN 回傳 `{ status: 'conflict' }`
AND `skills/workflow-core/SKILL.md` 內容與呼叫前完全一致（未被修改）

### Scenario: validate-agents 失敗後完整回滾

@error
GIVEN `dryRun` 為 false
AND `validateStructure` 設計為回傳 `{ valid: false, errors: ['...'] }`（mock）
WHEN `forgeSkill` 建立 `skills/rollback-test/SKILL.md` 後呼叫驗證
THEN 驗證失敗後 `skills/rollback-test/` 目錄被完整刪除
AND 回傳 `{ status: 'error' }`
AND 不留下部分建立的檔案殘骸

### Scenario: 連續失敗暫停後不繼續嘗試建立檔案

@security
GIVEN `consecutiveFailures` 已達 `maxConsecutiveFailures`
WHEN 呼叫 `forgeSkill('any-domain', {}, { dryRun: false })`
THEN 不呼叫 `Bun.spawnSync`（不嘗試建立任何 skill）
AND 回傳 `{ status: 'paused' }`

---

## Feature 5: evolution.js forge CLI 子命令

### Scenario: 無參數呼叫 forge 顯示用法

@error
GIVEN `evolution.js` 已正確載入 forge 子命令
WHEN 執行 `bun scripts/evolution.js forge`（不帶 domain 參數）
THEN 輸出包含 forge 子命令的用法說明
AND process exit code 為 1

### Scenario: dry-run 模式輸出人類可讀的預覽

@smoke
GIVEN `skills/` 目錄下不存在 `preview-domain/SKILL.md`
WHEN 執行 `bun scripts/evolution.js forge preview-domain`
THEN stdout 包含 domain 名稱
AND stdout 包含 preview 的描述和 body 摘要
AND process exit code 為 0
AND 磁碟上不存在 `skills/preview-domain/` 目錄

### Scenario: --json 旗標輸出 JSON 格式

@smoke
GIVEN `skills/` 目錄下不存在 `json-domain/SKILL.md`
WHEN 執行 `bun scripts/evolution.js forge json-domain --json`
THEN stdout 是合法的 JSON 字串
AND JSON 包含 `status`、`domainName` 欄位
AND process exit code 為 0

### Scenario: domain 衝突時 --json 輸出衝突資訊

@edge-case
GIVEN `skills/testing/SKILL.md` 已存在
WHEN 執行 `bun scripts/evolution.js forge testing --json`
THEN stdout 的 JSON 包含 `{ "status": "conflict", "domainName": "testing" }`
AND JSON 包含 `conflictPath` 欄位
AND process exit code 為 1

### Scenario: --execute 旗標實際建立 skill

@smoke
GIVEN `skills/` 目錄下不存在 `exec-test-domain/SKILL.md`
WHEN 執行 `bun scripts/evolution.js forge exec-test-domain --execute`
THEN stdout 包含成功訊息和建立路徑
AND `skills/exec-test-domain/SKILL.md` 在磁碟上存在
AND process exit code 為 0

### Scenario: domain 衝突時 CLI 輸出衝突警告（非 JSON）

@error
GIVEN `skills/testing/SKILL.md` 已存在
WHEN 執行 `bun scripts/evolution.js forge testing`
THEN stdout 或 stderr 包含「衝突」相關訊息及既有路徑
AND process exit code 為 1

---

## Feature 6: knowledge-gap-detector 關鍵詞補齊

### Scenario: DOMAIN_KEYWORDS 涵蓋 os-control domain

@smoke
GIVEN `knowledge-gap-detector.js` 的 `DOMAIN_KEYWORDS` 已補齊
WHEN 呼叫 `detectKnowledgeGaps('screenshot and window management', agentSkills)`
AND `agentSkills` 不包含 `os-control`
THEN 偵測結果包含 `os-control` 作為知識缺口

### Scenario: DOMAIN_KEYWORDS 涵蓋 autonomous-control domain

@smoke
GIVEN `knowledge-gap-detector.js` 的 `DOMAIN_KEYWORDS` 已補齊
WHEN 呼叫 `detectKnowledgeGaps('heartbeat daemon and execution queue management', agentSkills)`
AND `agentSkills` 不包含 `autonomous-control`
THEN 偵測結果包含 `autonomous-control` 作為知識缺口

### Scenario: DOMAIN_KEYWORDS 涵蓋 craft domain

@smoke
GIVEN `knowledge-gap-detector.js` 的 `DOMAIN_KEYWORDS` 已補齊
WHEN 呼叫 `detectKnowledgeGaps('clean code and solid principles refactoring', agentSkills)`
AND `agentSkills` 不包含 `craft`
THEN 偵測結果包含 `craft` 作為知識缺口

### Scenario: agent 已具備對應 skill 時不產生缺口警告

@edge-case
GIVEN `agentSkills` 包含 `os-control`
WHEN 呼叫 `detectKnowledgeGaps('screenshot and window management', agentSkills)`
THEN 偵測結果不包含 `os-control` 缺口（agent 已具備）

### Scenario: DOMAIN_KEYWORDS 計數從 12 升至 15

@regression
GIVEN `knowledge-gap-detector.js` 更新後
WHEN 讀取 `DOMAIN_KEYWORDS` 物件的 key 數量
THEN key 數量為 15（os-control、autonomous-control、craft 三個補齊）
AND 頂部文檔注釋顯示 `15/15`

---

## Feature 7: 產出 SKILL.md 結構驗證

### Scenario: 產出的 SKILL.md 包含三個必要 section

@smoke
GIVEN `forgeSkill` 在 dry-run 模式下執行
WHEN 取得 `result.preview.body`
THEN body 包含 `## 消費者` section
AND body 包含 `## 資源索引` section
AND body 包含 `## 按需讀取` section
AND 三個 section 按上述順序出現

### Scenario: 消費者 section 包含合法 Markdown 表格骨架

@edge-case
GIVEN `forgeSkill` 在 dry-run 模式下執行
WHEN 取得 `result.preview.body` 的 `## 消費者` 段落
THEN 段落包含 Markdown 表格（`| Agent | 用途 |` 標頭格式）

### Scenario: 資源索引 section 包含佔位 reference

@edge-case
GIVEN `forgeSkill` 在 dry-run 模式下執行
WHEN 取得 `result.preview.body` 的 `## 資源索引` 段落
THEN 段落包含至少一個 reference 佔位項目

### Scenario: execute 模式產出的 SKILL.md 通過 validate-agents 零 error

@smoke
GIVEN `forgeSkill` 在 execute 模式下成功建立 `skills/validate-test/SKILL.md`
WHEN 執行 `bun scripts/validate-agents.js`
THEN exit code 為 0（zero errors）
AND 不包含與新建 skill 相關的錯誤訊息

### Scenario: forgeSkill 產出的 SKILL.md frontmatter 包含必要欄位

@regression
GIVEN `forgeSkill` 在 execute 模式下執行
WHEN 讀取建立的 SKILL.md 檔案內容
THEN frontmatter 包含 `name` 欄位（等於 domainName）
AND frontmatter 包含 `description` 欄位（非空字串）
AND frontmatter 包含 `disable-model-invocation: true`
AND frontmatter 包含 `user-invocable: false`
