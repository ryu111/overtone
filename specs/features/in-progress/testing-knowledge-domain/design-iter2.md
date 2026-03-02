# Design: 迭代 2 — Knowledge Domain Chain Test + E2E Workflow 補強

## 技術摘要（What & Why）

- **方案**：建立 6 個測試檔案 — 1 個 unit test 驗證 7 個 knowledge domain 的 agent-skill-reference 三層鏈路完整性，5 個 E2E test 驗證 tdd/debug/refactor/full/secure workflow 的完整狀態機
- **理由**：迭代 1 建立了 testing knowledge domain 和更新了 platform-alignment 測試，但缺少 (1) 跨所有 domain 的結構性驗證、(2) 5 種 workflow 的 E2E 狀態機測試
- **取捨**：E2E 測試重複模式多，透過共用 helper 函式降低維護成本；unit test 用動態解析而非 hardcode 確保擴展性

## 架構決策

### Q1: Knowledge Domain Chain — 動態解析 vs. Hardcode

**決策**：動態解析 agent frontmatter + skill 目錄結構。

**理由**：
- 既有 `platform-alignment-agents.test.js` 已有 `parseFrontmatter()` 輔助函式（手寫 YAML parser），可直接複用
- 7 個 knowledge domain 的消費者映射（哪個 agent 載入哪個 skill）可從 agent .md 的 `skills` frontmatter 動態推導
- 若 hardcode，每次新增 domain 都要更新映射表，不符合 DRY
- 動態解析的驗證邏輯：agent skills -> skill SKILL.md 存在 -> skill references/ 下的檔案都被 SKILL.md 引用

**測試 parseFrontmatter 複用策略**：直接在測試檔案內定義（與 platform-alignment-agents.test.js 相同 pattern），不抽為共用模組。理由：parseFrontmatter 是 40 行的簡易 YAML parser，各測試檔的需求略有不同（有些只需 key-value，有些需要 list），且既有 3 個測試檔都各自內嵌，不破壞既有慣例。

### Q2: E2E 共用輔助函式

**決策**：不新增 helper，沿用既有 `tests/helpers/hook-runner.js`。

**理由**：
- hook-runner.js 已提供所有需要的函式：`runOnStart`, `runInitWorkflow`, `runPreTask`, `runSubagentStop`, `isAllowed`
- 5 個新 E2E 測試的模式與 standard-workflow.test.js / quick-workflow.test.js 完全一致
- `completeStage` 這類快捷函式（runPreTask + runSubagentStop 的組合）只有 2 行，內嵌即可，不值得抽為共用函式（30 行以下不獨立模組原則）
- `readState` 直接從 `scripts/lib/state.js` import，已是最簡形式

### Q3: Full Workflow 兩層並行組策略

**決策**：逐層測試，先完成 quality 組再測試 verify 組。

**分析**：
- `full` workflow stages: `['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS']`
- init 後 stageKeys: `PLAN, ARCH, DESIGN, TEST, DEV, REVIEW, TEST:2, QA, E2E, RETRO, DOCS`（共 11 個）
- TEST.mode = 'spec'（DEV 前），TEST:2.mode = 'verify'（DEV 後）
- parallelGroups: `['quality', 'verify']`
  - quality = `['REVIEW', 'TEST']` -> 對應 REVIEW + TEST:2
  - verify = `['QA', 'E2E']` -> 對應 QA + E2E
- DEV 完成 -> REVIEW + TEST:2 同時 active（quality 組）
- quality 收斂 -> QA + E2E 同時 active（verify 組）
- verify 收斂 -> RETRO

**state.js 的 `findActualStageKey` 邏輯**：
- 先找完全匹配且 active 的
- 再找帶編號且 active 的（如 TEST:2）
- 最後找 pending 的

**state.js 的 `checkParallelConvergence` 邏輯**：
- 遍歷所有 parallelGroup，取 stageKeys 中 base 屬於 group members 的 keys
- 若 relevantKeys 全部 completed，回傳 convergence

### Q4: Secure Workflow 三成員並行組

**決策**：與 quality 組類似的測試策略，但成員為 3 個。

**分析**：
- `secure` workflow stages: `['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'SECURITY', 'RETRO', 'DOCS']`
- init 後 stageKeys: `PLAN, ARCH, TEST, DEV, REVIEW, TEST:2, SECURITY, RETRO, DOCS`（共 9 個）
- parallelGroups: `['secure-quality']`
  - secure-quality = `['REVIEW', 'TEST', 'SECURITY']` -> 對應 REVIEW + TEST:2 + SECURITY
- DEV 完成 -> REVIEW + TEST:2 + SECURITY 同時 active（3 成員並行）
- 測試重點：第 1、2 個完成時不觸發收斂，第 3 個完成時收斂

### Q5: TDD / Debug workflow（無並行組）

**決策**：純 sequential 路徑，模式最簡單。

**分析**：
- `tdd` stages: `['TEST', 'DEV', 'TEST']` -> stageKeys: `TEST, DEV, TEST:2`
  - TEST.mode = 'spec'，TEST:2.mode = 'verify'
- `debug` stages: `['DEBUG', 'DEV', 'TEST']` -> stageKeys: `DEBUG, DEV, TEST`
  - TEST 只有一個，mode 取決於 DEV 前/後位置 -> DEV 前無 TEST，TEST 在 DEV 後 -> mode = 'verify'
- 兩者都無 parallelGroups

### Q6: Refactor workflow 的 quality 並行組

**決策**：與 standard workflow 幾乎相同的並行組模式。

**分析**：
- `refactor` stages: `['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST']` -> stageKeys: `ARCH, TEST, DEV, REVIEW, TEST:2`
  - TEST.mode = 'spec'（DEV 前），TEST:2.mode = 'verify'（DEV 後）
  - parallelGroups: `['quality']` -> REVIEW + TEST:2

## 檔案結構

### 新增檔案

```
tests/unit/knowledge-domain-chain.test.js    # 7 個 knowledge domain 的三層鏈路驗證
tests/e2e/tdd-workflow.test.js               # TDD workflow 狀態機（3 stage, sequential）
tests/e2e/debug-workflow.test.js             # Debug workflow 狀態機（3 stage, sequential）
tests/e2e/refactor-workflow.test.js          # Refactor workflow 狀態機（5 stage, quality 並行組）
tests/e2e/full-workflow.test.js              # Full workflow 狀態機（11 stage, 兩層並行組）
tests/e2e/secure-workflow.test.js            # Secure workflow 狀態機（9 stage, 三成員並行組）
```

### 修改檔案

無。

## 測試設計

### 1. `tests/unit/knowledge-domain-chain.test.js`

驗證 7 個 knowledge domain skill 的 agent -> skill -> reference 三層鏈路。

**7 個 Knowledge Domain**：

| Domain | 消費者 Agent(s) | References 數量 | Examples 數量 |
|--------|-----------------|----------------|--------------|
| testing | tester, qa | 5 | 1 |
| code-review | code-reviewer | 1 | 0 |
| commit-convention | developer | 1 | 0 |
| security-kb | security-reviewer | 1 | 1 |
| database | database-reviewer | 1 | 1 |
| dead-code | refactor-cleaner | 1 | 0 |
| workflow-core | (auto skill 引用，無直接 agent consumer) | 4 | 0 |

**describe/test 結構**：

```
describe('Knowledge Domain Chain: 三層鏈路完整性')
  describe('Layer 1: Agent -> Skill 連結')
    // 動態遍歷已知 agent-domain 映射
    test('tester agent skills 包含 testing')
    test('qa agent skills 包含 testing')
    test('code-reviewer agent skills 包含 code-review')
    test('developer agent skills 包含 commit-convention')
    test('security-reviewer agent skills 包含 security-kb')
    test('database-reviewer agent skills 包含 database')
    test('refactor-cleaner agent skills 包含 dead-code')

  describe('Layer 2: Skill SKILL.md 存在且 frontmatter 正確')
    // 動態遍歷 7 個 domain
    for each domain:
      test('{domain} SKILL.md 存在')
      test('{domain} frontmatter name 正確')
      test('{domain} disable-model-invocation 為 true')
      test('{domain} user-invocable 為 false')

  describe('Layer 3: Skill 引用的 reference/example 檔案存在')
    // 從 SKILL.md 內容解析 💡 引用路徑，驗證每個目標檔案存在
    for each domain:
      test('{domain} 所有 references/ 檔案存在')
      test('{domain} 所有 examples/ 檔案存在')（若有）

  describe('Chain 完整性: 引用路徑閉環')
    test('所有 reference/example 檔案至少被一個 knowledge domain SKILL.md 引用')
    test('所有 knowledge domain SKILL.md 至少被一個 agent 的 skills 欄位引用')
```

**實作要點**：
- `parseFrontmatter()` 內嵌定義（複用 platform-alignment-agents.test.js 的實作）
- agent-domain 映射用常數定義（7 對映射，這是**已知的設計規格**，不應從檔案推導）
- reference/example 檔案存在性用 `fs.existsSync` 驗證
- 引用路徑解析用 `${CLAUDE_PLUGIN_ROOT}/skills/{domain}/references/{file}` 正則匹配

### 2. `tests/e2e/tdd-workflow.test.js`

TDD workflow: TEST(spec) -> DEV -> TEST:2(verify)，3 stage sequential。

```
describe('初始化 tdd workflow 建立 3 個 stage')
  test('init exit code 為 0')
  test('stages 包含 TEST, DEV, TEST:2（共 3 個）')
  test('TEST.mode 為 spec')
  test('TEST:2.mode 為 verify')
  test('所有 stage 初始為 pending')

describe('sequential path: TEST(spec) -> DEV -> TEST:2(verify)')
  beforeAll: completeStage(tester, spec) -> completeStage(developer) -> completeStage(tester, verify)
  test('TEST.status 為 completed')
  test('DEV.status 為 completed')
  test('TEST:2.status 為 completed')
  test('所有 3 個 stage 均為 completed')
```

### 3. `tests/e2e/debug-workflow.test.js`

Debug workflow: DEBUG -> DEV -> TEST(verify)，3 stage sequential。

```
describe('初始化 debug workflow 建立 3 個 stage')
  test('init exit code 為 0')
  test('stages 包含 DEBUG, DEV, TEST（共 3 個）')
  test('TEST.mode 為 verify')
  test('所有 stage 初始為 pending')

describe('sequential path: DEBUG -> DEV -> TEST')
  beforeAll: completeStage(debugger) -> completeStage(developer) -> completeStage(tester)
  test('DEBUG.status 為 completed')
  test('DEV.status 為 completed')
  test('TEST.status 為 completed')
  test('所有 3 個 stage 均為 completed')
```

### 4. `tests/e2e/refactor-workflow.test.js`

Refactor workflow: ARCH -> TEST(spec) -> DEV -> [REVIEW + TEST:2(verify)]，5 stage + quality 並行組。

```
describe('初始化 refactor workflow 建立 5 個 stage')
  test('init exit code 為 0')
  test('stages 包含 ARCH, TEST, DEV, REVIEW, TEST:2（共 5 個）')
  test('TEST.mode 為 spec')
  test('TEST:2.mode 為 verify')
  test('所有 stage 初始為 pending')

describe('前半 sequential: ARCH -> TEST(spec) -> DEV')
  beforeAll: completeStage(architect) -> completeStage(tester, spec) -> completeStage(developer)
  test('ARCH 為 completed')
  test('TEST 為 completed')
  test('DEV 為 completed')
  test('currentStage 推進至 REVIEW')

describe('DEV 完成後 REVIEW 和 TEST:2 同時 active（quality 並行組）')
  beforeAll: runPreTask(reviewer) + runPreTask(tester)
  test('REVIEW.status 為 active')
  test('TEST:2.status 為 active')

describe('quality 並行組收斂後所有 stage 完成')
  beforeAll: 先完成 REVIEW，再完成 TEST:2
  test('第一個完成時不觸發全部完成')
  test('第二個完成後所有 5 個 stage 均為 completed')
```

### 5. `tests/e2e/full-workflow.test.js`

Full workflow: PLAN -> ARCH -> DESIGN -> TEST(spec) -> DEV -> [REVIEW + TEST:2] -> [QA + E2E] -> RETRO -> DOCS，11 stage + 兩層並行組。

```
describe('初始化 full workflow 建立 11 個 stage')
  test('init exit code 為 0')
  test('stages 包含所有 11 個 stageKey')
  test('TEST.mode 為 spec，TEST:2.mode 為 verify')
  test('所有 stage 初始為 pending')

describe('前半 sequential: PLAN -> ARCH -> DESIGN -> TEST(spec) -> DEV')
  beforeAll: 依序完成 5 個 stage
  test('5 個 stage 均為 completed')
  test('currentStage 推進至 REVIEW')

describe('quality 並行組: REVIEW + TEST:2')
  beforeAll: 委派兩者 + 完成兩者
  test('兩者同時 active')
  test('第一個完成不觸發收斂')
  test('第二個完成後收斂，currentStage 推進至 QA')

describe('verify 並行組: QA + E2E')
  beforeAll: 委派兩者 + 完成兩者
  test('兩者同時 active')
  test('第一個完成不觸發收斂')
  test('第二個完成後收斂，currentStage 推進至 RETRO')

describe('後半 sequential: RETRO -> DOCS 完成')
  beforeAll: 完成 RETRO + DOCS
  test('所有 11 個 stage 均為 completed')
```

### 6. `tests/e2e/secure-workflow.test.js`

Secure workflow: PLAN -> ARCH -> TEST(spec) -> DEV -> [REVIEW + TEST:2 + SECURITY] -> RETRO -> DOCS，9 stage + 三成員並行組。

```
describe('初始化 secure workflow 建立 9 個 stage')
  test('init exit code 為 0')
  test('stages 包含所有 9 個 stageKey')
  test('TEST.mode 為 spec，TEST:2.mode 為 verify')
  test('所有 stage 初始為 pending')

describe('前半 sequential: PLAN -> ARCH -> TEST(spec) -> DEV')
  beforeAll: 依序完成 4 個 stage
  test('4 個 stage 均為 completed')
  test('currentStage 推進至 REVIEW')

describe('secure-quality 並行組: REVIEW + TEST:2 + SECURITY（3 成員）')
  beforeAll: 委派三者
  test('三者同時 active')

describe('三成員並行組: 逐個完成的收斂行為')
  // 分為三步驟：第 1 個完成、第 2 個完成、第 3 個完成
  test('第 1 個完成時不觸發收斂')
  test('第 2 個完成時仍不觸發收斂')
  test('第 3 個完成後收斂，currentStage 推進至 RETRO')

describe('後半 sequential: RETRO -> DOCS 完成')
  beforeAll: 完成 RETRO + DOCS
  test('所有 9 個 stage 均為 completed')
```

## 共用 Pattern 總結

### E2E 測試共用模式（所有 5 個 E2E 檔案一致）

```javascript
// 1. 頂層 imports
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, isAllowed } = require('../helpers/hook-runner');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 2. 唯一 sessionId + afterAll 清理
const SESSION_ID = `e2e-{workflowType}-${Date.now()}`;
afterAll(() => { rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true }); });

// 3. 初始化 describe: runOnStart + runInitWorkflow
// 4. sequential path describe: runPreTask + runSubagentStop 交替
// 5. parallel group describe（若有）: runPreTask 多次委派 + runSubagentStop 逐個完成
// 6. 最終 describe: 所有 stage completed 驗證
```

### completeStage 內嵌模式

```javascript
// 不抽為共用函式，直接在 beforeAll 中寫 2 行
runPreTask(SESSION_ID, { description: '委派 {agent} ...' });
runSubagentStop(SESSION_ID, 'ot:{agent}', 'VERDICT: pass ...');
```

### Agent -> Stage 映射（來自 registry-data.json）

| Agent | Stage | 測試中的 agent_type |
|-------|-------|-------------------|
| planner | PLAN | ot:planner |
| architect | ARCH | ot:architect |
| designer | DESIGN | ot:designer |
| tester | TEST / TEST:2 | ot:tester |
| developer | DEV | ot:developer |
| code-reviewer | REVIEW | ot:code-reviewer |
| security-reviewer | SECURITY | ot:security-reviewer |
| debugger | DEBUG | ot:debugger |
| qa | QA | ot:qa |
| e2e-runner | E2E | ot:e2e-runner |
| retrospective | RETRO | ot:retrospective |
| doc-updater | DOCS | ot:doc-updater |

## 關鍵技術決策

### 決策 1: parseFrontmatter 不抽共用

- **選擇內嵌**：每個測試檔自行定義（與 3 個既有檔案一致的慣例）
- **未選共用模組**：改既有 3 個檔案 + 新增 1 個 helper 模組 = 觸及更多檔案，且解析需求略有差異

### 決策 2: agent-domain 映射用常數而非動態推導

- **選擇常數**：`AGENT_DOMAIN_MAP = { tester: 'testing', ... }` 直接定義
- **未選從 registry 推導**：registry 不含 agent-skill 映射（這是 agent .md frontmatter 的職責）
- **注意**：workflow-core 沒有直接 agent consumer（由 auto skill 引用），測試時獨立驗證

### 決策 3: E2E 不測試 timeline 事件

- **選擇只測 workflow state**：timeline 的正確性已由 single-workflow.test.js 和 fail-retry-path.test.js 驗證
- **未選重複驗證**：5 個新 E2E 只需確認 state transition 正確（stage status、currentStage、activeAgents），不需重複驗證 timeline emit

## 實作注意事項

- debug workflow 的 TEST 只有一個（不像 tdd/standard/refactor/full/secure 有兩個 TEST），所以只有 `TEST` 沒有 `TEST:2`
- debug workflow 的 TEST 在 DEV 之後，`mode` 應為 `verify`（state.js L60-63: `hasDevBefore ? 'verify' : 'spec'`）
- full workflow 的 DESIGN stage 對應 designer agent（ot:designer）
- secure workflow 的 SECURITY stage 對應 security-reviewer agent（ot:security-reviewer）
- 三成員並行組（secure-quality）的收斂邏輯與二成員相同（checkParallelConvergence 遍歷所有 members），但測試需要驗證前 2 個完成時不收斂
