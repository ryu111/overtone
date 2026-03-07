# Design：global-migrate-batch-replace

## 技術方案

### 核心問題解答

#### Q1：替換順序 — 中間狀態是否能正常工作？

**結論：是，相對路徑在搬移前後都能正常工作。**

分析：
- Claude Code 平台讀取 SKILL.md 時，`.` 被解析為 SKILL.md 所在目錄
- `./references/xxx.md` 在 `plugins/overtone/skills/testing/SKILL.md` 中 → 解析為 `plugins/overtone/skills/testing/references/xxx.md` ✓
- 搬移後 SKILL.md 在 `~/.claude/skills/testing/SKILL.md` → 解析為 `~/.claude/skills/testing/references/xxx.md` ✓
- 因此可以先替換文字，再搬移檔案，中間狀態完全可用

health-check.js 的 `checkSkillReferenceIntegrity` 已經分兩格式：
- 格式1（無 `${CLAUDE_PLUGIN_ROOT}` 的行）：`\b(references|examples)\/([^\s|`'"]+\.md)\b` — 替換後的 `./references/xxx.md` 會被此 regex 捕捉，**不需改動**
- 格式2（有 `${CLAUDE_PLUGIN_ROOT}` 的行）：替換後格式消失，此路徑的 cross-skill 引用改為 `../otherSkill/references/xxx.md`，同樣被格式1 捕捉

#### Q2：dependency-graph.js 掃描策略

**選擇方案 A：本迭代同步更新掃描器。**

理由：
- dependency-graph.js `scanSkillReferences` 只掃描 `` `${CLAUDE_PLUGIN_ROOT}/...` `` 格式（L103）
- 替換後若不更新，掃描器建立的依賴圖會遺漏所有 SKILL.md → reference 的邊，導致 `bun scripts/impact.js` 和 health-check 的 `checkDependencySync` 失效
- 此掃描器的更新本質上是「修改一個 regex + 解析函式」，工作量輕微，不值得獨立為另一個迭代的 blocker
- 更新策略：改為同時支援三種格式：
  1. `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/{type}/{file}` （舊格式，向後相容）
  2. `./{type}/{file}` （同 skill 相對路徑）
  3. `../{otherSkill}/{type}/{file}` （跨 skill 相對路徑）

#### Q3：claude-dev references 文件（類別 F）的處理策略

**策略：更新為全域路徑說明，保留舊格式作為「遷移前範例」。**

分析：
- 這些文件是「如何開發 Overtone 元件」的規範文件（hooks-api.md、agent-api.md、skill-api.md 等）
- 全域遷移後 `${CLAUDE_PLUGIN_ROOT}` 概念不存在，繼續使用舊範例會誤導開發者
- 更新範疇：
  - hooks.json command 範例中的 `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/...` → `~/.claude/hooks/scripts/...`
  - 說明文字中提到「CLAUDE_PLUGIN_ROOT 變數」的段落 → 更新為「全域路徑 `~/.claude/`」
  - code-block 中的範例路徑 → 更新為新格式
- **不刪除 `${CLAUDE_PLUGIN_ROOT}` 的解釋**：保留一段「歷史說明」或「遷移說明」，說明舊格式已被全域路徑取代

#### Q4：是否合併迭代？

**不合併。維持分離的 batch-replace 和 move-files 兩個迭代。**

理由：
- batch-replace（本迭代）：純文字替換，風險低，可驗證（health-check 過關即完成）
- move-files：實際搬移 67+ 個模組和數十個 SKILL.md，涉及 hooks.json 路徑、config-io.js 路徑解析、安裝腳本，風險高
- 分離後每個迭代都有明確的 Definition of Done（DoD），問題容易隔離
- 相對路徑的中間狀態可用，因此不存在「必須同時做」的技術壓力

---

## 替換規則表

| 類別 | 原格式 | 替換為 | 說明 |
|------|--------|--------|------|
| A | `` `${CLAUDE_PLUGIN_ROOT}/skills/{self}/references/xxx.md` `` | `` `./references/xxx.md` `` | 同 skill 目錄下的 references |
| A | `` `${CLAUDE_PLUGIN_ROOT}/skills/{self}/examples/xxx.md` `` | `` `./examples/xxx.md` `` | 同 skill 目錄下的 examples |
| B | `` `${CLAUDE_PLUGIN_ROOT}/skills/{other}/references/xxx.md` `` | `` `../{other}/references/xxx.md` `` | 跨 skill 引用 |
| C | `node ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` | `bun ~/.claude/scripts/xxx.js` | SKILL.md 腳本呼叫 |
| C | `bun ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` | `bun ~/.claude/scripts/xxx.js` | SKILL.md 腳本呼叫 |
| C | `bun run ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` | `bun ~/.claude/scripts/xxx.js` | SKILL.md 腳本呼叫 |
| D | `node ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` | `bun ~/.claude/scripts/xxx.js` | Command .md 腳本呼叫 |
| D | `bun run ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` | `bun ~/.claude/scripts/xxx.js` | Command .md 腳本呼叫 |
| E | `${CLAUDE_PLUGIN_ROOT}/skills/xxx/references/yyy.md` | `~/.claude/skills/xxx/references/yyy.md` | Command .md 中的 skill reference 引用 |
| F | `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/xxx.js` | `~/.claude/hooks/scripts/xxx.js` | claude-dev references 範例路徑 |
| G1 | `process.env.CLAUDE_PLUGIN_ROOT ?? 'plugins/overtone'` | `process.env.CLAUDE_PLUGIN_ROOT ?? os.homedir() + '/.claude'` | post-use-handler.js fallback |
| G2 | dependency-graph.js `refRegex` | 改為支援三種路徑格式 | 見介面定義 |
| G3 | config-io.js `resolveCommand` | 維持不動（runtime 傳入 pluginRoot 仍需支援） | config-io 由上游傳入路徑 |
| G4 | skill-forge.js SKILL.md 範本 | 生成 `./references/` 格式 | 新 skill 預設用相對路徑 |

**類別 G3 決策說明**：config-io.js 的 `resolveCommand` 接受 `pluginRoot` 參數，由呼叫方傳入。此函式本身不需改動，只需確保呼叫方傳入正確路徑（`~/.claude` 而非 `plugins/overtone`）。這屬於 move-files 迭代的範疇，本迭代維持不動。

---

## 介面定義

### dependency-graph.js 更新後的掃描器介面

```javascript
// scanSkillReferences 更新後支援三種格式：
// 格式 1（舊）：`${CLAUDE_PLUGIN_ROOT}/skills/{skill}/references/{file}`
// 格式 2（新，同 skill）：`./references/{file}` 或 `./examples/{file}`
// 格式 3（新，跨 skill）：`../{otherSkill}/references/{file}`

/**
 * @param {string} pluginRoot - plugin 根目錄
 * @param {(from: string, to: string) => void} addEdge
 * @param {string} skillRelPath - 當前 SKILL.md 的相對路徑（供解析相對引用）
 */
function scanSkillReferences(pluginRoot, addEdge)

// 新增輔助函式：從 SKILL.md 的相對路徑解析 reference 的 pluginRoot 相對路徑
// e.g. SKILL.md = skills/testing/SKILL.md
//      引用 = ./references/bdd-spec-guide.md
//      結果 = skills/testing/references/bdd-spec-guide.md
function resolveSkillRef(skillRelPath, refPath) // => string | null
```

### skill-forge.js 生成的 SKILL.md 範本格式

```javascript
// 舊格式（不再使用）：
`💡 讀取 \`\${CLAUDE_PLUGIN_ROOT}/skills/${domain}/references/${file}.md\``

// 新格式：
`💡 讀取 \`./references/${file}.md\``
```

### post-use-handler.js fallback 路徑

```javascript
// 舊
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? 'plugins/overtone';

// 新（需 require('os')）
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? require('os').homedir() + '/.claude';
```

---

## 檔案結構（修改清單）

### Phase 1：JS 程式碼（可並行）

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `plugins/overtone/scripts/lib/dependency-graph.js` | 修改 | `scanSkillReferences` 支援三種路徑格式 |
| `plugins/overtone/scripts/lib/post-use-handler.js` | 修改 | fallback 路徑改為 `os.homedir()/.claude` |
| `plugins/overtone/scripts/lib/analyzers/hook-diagnostic.js` | 修改 | 路徑解析邏輯 |
| `plugins/overtone/scripts/lib/skill-forge.js` | 修改 | 生成 SKILL.md 範本改為相對路徑 |

### Phase 2：SKILL.md 批量替換（可並行）

| 檔案群組 | 變更類型 | 說明 |
|----------|----------|------|
| `plugins/overtone/skills/*/SKILL.md`（26 個）| 修改 | 類別 A：同 skill 引用改相對路徑 |
| `plugins/overtone/skills/{architecture,code-review,auto,craft}/SKILL.md` | 修改 | 類別 B：跨 skill 引用改相對路徑 |
| `plugins/overtone/skills/{specs,pm,issue,auto}/SKILL.md` | 修改 | 類別 C：腳本呼叫改 `bun ~/.claude/scripts/` |

### Phase 3：Command .md 批量替換

| 檔案群組 | 變更類型 | 說明 |
|----------|----------|------|
| `plugins/overtone/commands/*.md`（14 個）| 修改 | 類別 D+E：腳本呼叫 + skill reference 引用 |

### Phase 4：claude-dev references

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `plugins/overtone/skills/claude-dev/references/hooks-api.md` | 修改 | 範例路徑更新 |
| `plugins/overtone/skills/claude-dev/references/command-api.md` | 修改 | 範例路徑更新 |
| `plugins/overtone/skills/claude-dev/references/skill-api.md` | 修改 | 範例路徑更新 |
| `plugins/overtone/skills/claude-dev/references/overtone-conventions.md` | 修改 | 範例路徑更新 |
| `plugins/overtone/skills/claude-dev/references/settings-api.md` | 修改 | 範例路徑更新 |

---

## 狀態同步策略

本迭代為純文字替換，不涉及前端或跨頁面狀態。health-check.js 的兩格式解析邏輯（格式1 偵測相對路徑、格式2 偵測 `${CLAUDE_PLUGIN_ROOT}` 格式）在替換後仍可正確運作，不需特別同步。

---

## Edge Cases

1. **類別 A/B 邊界混淆** — 語意陷阱：auto/SKILL.md 同時有類別 A（自身 auto skill 的 references）和類別 B（引用 workflow-core 和 testing 的 references），sed 批量替換若只按「含有 `skills/auto/`」替換可能誤判跨 skill 引用。需先精確定位各行再替換，或分兩個 pass 執行（先 A 後 B）。

2. **dependency-graph.js 三格式 regex 優先順序** — 狀態組合：同一個 SKILL.md 可能同時含有舊格式（`${CLAUDE_PLUGIN_ROOT}`，在 Phase 2 完成前）和新格式（`./references/`），掃描器必須在轉換期間同時支援兩種格式而不重複計邊。`lastIndex` 重置和 Set 去重邏輯需更新。

3. **`~/.claude` 與 `$HOME/.claude` 一致性** — 資料邊界：post-use-handler.js 改用 `os.homedir() + '/.claude'`，但其他模組（hook-diagnostic.js）可能用 `process.env.HOME + '/.claude'`，兩者在大多數 Unix 環境等效，但在部分受控環境可能不同。統一使用 `os.homedir()` 確保一致。

4. **manage-component.js 說明文字不在本迭代範圍** — 並行競爭：若 developer 誤將 manage-component.js 也一起替換（因為 grep 結果中有此檔案），會污染範圍。需在 tasks.md 和 Handoff 明確標注 manage-component.js 排除在外。
