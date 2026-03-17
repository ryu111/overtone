# health-check 57 Warning 分類清理 -- 任務拆分

## 依賴分析

```
Phase 1（sequential）: T1 health-check.js 偵測擴展
Phase 2（parallel，依賴 Phase 1）: T2a-T2n 18 個 SKILL.md reference 索引修補
Phase 3（sequential，依賴 Phase 1）: T3 測試更新
Phase 4（sequential，依賴 Phase 1+2+3）: T4 驗證
```

注意：Phase 2 和 Phase 3 互不依賴（修改不同檔案），可並行執行。

---

## Phase 1：health-check.js 偵測擴展（sequential）

### T1：修改 `~/.claude/scripts/health-check.js`

**executor**: sonnet

**修改內容**：

#### T1.1 新增 scan 函式（scan 層，約 50 行）

在現有 `scanScripts()` 之後新增 3 個函式：

```javascript
// scanCommands(): 掃描 ~/.claude/commands/*.md
// 回傳 [{ name, path, content }]
// 目錄不存在 → 回傳 []

// scanRules(): 掃描 ~/.claude/rules/*.md + ~/.claude/CLAUDE.md
// 回傳 [{ name, path, content }]
// 目錄不存在 → 回傳 []

// scanScriptContents(): 掃描 ~/.claude/scripts/*.js 的 content
// 回傳 [{ name, path, content }]
// 沿用現有 scanScripts 結構，只是多讀 content
```

#### T1.2 修改 checkClosedLoop（check 層，約 30 行）

在現有第 289-296 行（建立 referencedSkills 集合）之後，追加 3 個引用管道：

1. **commands 管道**：遍歷 `scanCommands()` 結果，對每個 skill name 檢查 command content 中是否出現
2. **EXTRA_SKILLS 管道**：遍歷 `scanRules()` 結果，regex 提取 `EXTRA_SKILLS:?\s*[^]]*` 中的 skill name
3. **domain-knowledge-skill 排除**：在產生 orphan-skill finding 前，檢查 skill frontmatter 的 `user-invocable` 欄位。若為 `false`（明確標記為非使用者可呼叫的 domain knowledge skill），跳過此 finding

orphan-skill 判定邏輯修改為：
```
skill 不在 agents skills[] 中
AND 不在 commands content 中
AND 不在 EXTRA_SKILLS 中
AND frontmatter user-invocable !== 'false'
→ 才報 orphan-skill
```

#### T1.3 修改 checkSkillCoverage（check 層，約 30 行）

在現有第 378-393 行（orphan-script 偵測）中，將引用來源從只有 skill content 擴展為 7 個管道。

建立統一的「reference content 集合」：
```javascript
const allRefContents = [
  ...skillContents,                          // 1. skills content（現有）
  ...hookCommandScriptPaths,                 // 2. settings.json hook commands 中的 script 路徑
  ...moduleContents,                         // 3. hooks/modules/*.js content
  ...scriptContents,                         // 4. scripts/*.js content（互相引用）
  ...agentContents,                          // 5. agents/*.md content
  ...commandContents,                        // 6. commands/*.md content
  ...ruleContents,                           // 7. CLAUDE.md + rules/*.md content
];
```

script 引用判定用 basename 匹配（`content.includes(scriptName)`）。

---

## Phase 2：18 個 SKILL.md reference 索引修補（parallel）

**executor**: sonnet（可並行委派）

所有修改互相獨立。每個 SKILL.md 在「資源索引」區塊補上缺失的 backtick 索引。

格式統一為：`| \`./references/{filename}\` | {一句話描述} |`

若 SKILL.md 無「資源索引」區塊，在文件末尾新增。

### T2a: database/SKILL.md
- 補：`./references/auto-discovered.md`

### T2b: wording/SKILL.md
- 補：`./references/auto-discovered.md`

### T2c: craft/SKILL.md
- 補：`./references/auto-discovered.md`

### T2d: pinchtab/SKILL.md
- 補：`./references/api.md`、`./references/profiles.md`、`./references/env.md`

### T2e: commit-convention/SKILL.md
- 補：`./references/auto-discovered.md`

### T2f: security-kb/SKILL.md
- 補：`./references/auto-discovered.md`

### T2g: auto/SKILL.md
- 補：`./references/boundary-cases.md`、`./references/implicit-dependencies.md`、`./references/delegation-quality.md`

### T2h: dead-code/SKILL.md
- 補：`./references/auto-discovered.md`

### T2i: claude-dev/SKILL.md
- 補：`./references/auto-discovered.md`

### T2j: code-review/SKILL.md
- 補：`./references/auto-discovered.md`

### T2k: debugging/SKILL.md
- 補：`./references/auto-discovered.md`

### T2l: os-control/SKILL.md
- 補：`./references/auto-discovered.md`

### T2m: nova-autonomous-control/SKILL.md
- 補：`./references/auto-discovered.md`

### T2n: architecture/SKILL.md
- 補：`./references/auto-discovered.md`

---

## Phase 3：測試更新（sequential，與 Phase 2 可並行）

### T3：修改 `~/projects/overtone/tests/unit/health-check.test.js`

**executor**: sonnet

新增測試案例：

#### T3.1 orphan-skill 管道測試

```javascript
// a) commands 管道：cache 中 skill 不在 agents skills[] 但在 commands content 中 → 不報 orphan
// b) EXTRA_SKILLS 管道：cache 中 skill 不在 agents 但 rules content 含 EXTRA_SKILLS: {name} → 不報 orphan
// c) domain-knowledge：cache 中 skill frontmatter user-invocable: 'false' → 不報 orphan
// d) 陰性：真正的 orphan（4 管道都找不到）→ 仍報 orphan
```

#### T3.2 orphan-script 管道測試

```javascript
// a) hook command 引用：cache 中 script 在 hookCommands 中 → 不報 orphan
// b) script 互相引用：cache 中 script 在 scriptContents 中被 import → 不報 orphan
// c) 陰性：真正的 orphan（7 管道都找不到）→ 仍報 orphan
```

#### T3.3 真實系統整合

```javascript
// 修改現有「0 個 critical finding」測試，新增：
it('全量檢查：0 個 warning finding', async () => {
  const report = await runAll();
  const warnings = report.findings.filter(f => f.severity === 'warning');
  expect(warnings.length).toBe(0);
});
```

---

## Phase 4：驗證（sequential，依賴 Phase 1+2+3）

### T4：端到端驗證

**executor**: Main（直接執行）

1. `bun ~/.claude/scripts/health-check.js` → 驗證 0 critical + 0 warning
2. `bun test` → 全量通過
3. 確認 health-check.js 行數 <= 800 行

---

## 完成定義

| 驗收項 | 驗證方式 |
|--------|---------|
| 0 critical + 0 warning | `bun ~/.claude/scripts/health-check.js` stdout JSON |
| 測試通過 | `bun test` exit 0 |
| HealthReport schema 不變 | 現有 CLI 測試 + runAll 結構測試 |
| 行數合規 | `wc -l ~/.claude/scripts/health-check.js` <= 800 |
