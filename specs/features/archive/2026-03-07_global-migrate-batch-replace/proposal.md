# Proposal：global-migrate-batch-replace

## 需求背景（Why）

- **問題**：Overtone 目前所有 skill、command、hook 中的路徑引用使用 `${CLAUDE_PLUGIN_ROOT}` 佔位符，這個變數指向 `plugins/overtone/`（plugin 結構）。隨著全域遷移計畫，目標結構是 `~/.claude/`，路徑引用必須提前更新。
- **目標**：批量替換所有 `${CLAUDE_PLUGIN_ROOT}` 引用，使其在搬移完成後能正確指向 `~/.claude/` 路徑。
- **優先級**：這是全域遷移的前置步驟。本迭代屬於「路徑文字替換」，不搬移任何檔案，確保替換後系統仍可在現有結構下運作（由 config-io.js 等解析層處理路徑解析）。

## 使用者故事

```
身為 Overtone 開發者
我想要更新所有 ${CLAUDE_PLUGIN_ROOT} 路徑引用
以便在全域遷移完成後，skill/command/hook 的路徑能正確解析到 ~/.claude/ 下的目標位置
```

## 替換規則總表

本迭代處理以下七類使用情境，每類規則不同：

### 類別 A：SKILL.md 自身 skill references（同 skill 目錄）

**格式**：`${CLAUDE_PLUGIN_ROOT}/skills/{skillName}/references/xxx.md`
**替換**：`./references/xxx.md`（相對路徑）
**數量**：約 78 處 / 26 個 SKILL.md
**適用**：當 SKILL.md 引用自己 skill 目錄下的 references/ 或 examples/ 時

### 類別 B：SKILL.md 跨 skill 引用（引用其他 skill 的 references）

**格式**：`${CLAUDE_PLUGIN_ROOT}/skills/{otherSkill}/references/xxx.md`
**替換**：`../{otherSkill}/references/xxx.md`（跨目錄相對路徑）
**數量**：約 7 處
**受影響的跨 skill 引用清單**：
- `plugins/overtone/skills/architecture/SKILL.md` 引用 `craft/references/code-level-patterns.md`
- `plugins/overtone/skills/code-review/SKILL.md` 引用 `testing/references/test-anti-patterns.md`
- `plugins/overtone/skills/auto/SKILL.md` 引用 `workflow-core/references/handoff-protocol.md`、`workflow-core/references/parallel-groups.md`、`workflow-core/references/failure-handling.md`、`workflow-core/references/completion-signals.md`、`testing/references/test-scope-dispatch.md`、`testing/references/bdd-spec-guide.md`
- `plugins/overtone/skills/craft/SKILL.md` 引用 `architecture/references/architectural-patterns.md`

### 類別 C：SKILL.md 中的 node/bun 腳本呼叫

**格式**：`node ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` 或 `bun ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js`
**替換**：`bun ~/.claude/scripts/xxx.js`
**數量**：約 20 處
**受影響檔案**：`specs/SKILL.md`、`pm/SKILL.md`、`issue/SKILL.md`、`auto/SKILL.md`

### 類別 D：Command .md 中的腳本呼叫

**格式**：`node ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` 或 `bun run ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js`
**替換**：`bun ~/.claude/scripts/xxx.js`
**數量**：約 20 處 / 14 個 command 檔
**受影響檔案**：`standard.md`、`quick.md`、`secure.md`、`full.md`、`refactor.md`、`tdd.md`、`debug.md`、`dev.md`、`review.md`、`stop.md`、`e2e.md`、`build-fix.md`、`db-review.md`、`security.md`

### 類別 E：Command .md 中的 references 引用（讀取 skill 文件）

**格式**：`${CLAUDE_PLUGIN_ROOT}/skills/xxx/references/yyy.md`
**替換**：`~/.claude/skills/xxx/references/yyy.md`
**數量**：約 25 處
**注意**：commands 安裝後位於 `~/.claude/commands/`，skill references 相對位置為 `../skills/`，但考慮 AI 可讀性，使用絕對路徑 `~/.claude/` 較清楚

### 類別 F：claude-dev references 說明文件（文件範例中的引用）

**格式**：文件中說明「如何使用 `${CLAUDE_PLUGIN_ROOT}`」的範例程式碼和說明文字
**替換策略**：需要 architect 決定（見 Open Questions）
**受影響檔案**：`claude-dev/references/command-api.md`、`claude-dev/references/skill-api.md`、`claude-dev/references/overtone-conventions.md`、`claude-dev/references/hooks-api.md`、`claude-dev/references/settings-api.md`

### 類別 G：JS 程式碼中的路徑解析邏輯

**受影響檔案與說明**：
- `scripts/lib/post-use-handler.js`：`process.env.CLAUDE_PLUGIN_ROOT ?? 'plugins/overtone'` → 需更新 fallback 路徑
- `scripts/lib/dependency-graph.js`：掃描 SKILL.md 中的 `${CLAUDE_PLUGIN_ROOT}/...` 路徑 regex → 需同步更新解析邏輯（否則掃描替換後的路徑會失效）
- `scripts/lib/config-io.js`：`replaceClaudioPluginRoot()` 函式 → 需更新替換邏輯
- `scripts/lib/skill-forge.js`：forge 時生成 `${CLAUDE_PLUGIN_ROOT}/skills/...` 的範本 → 需更新產生的路徑格式
- `scripts/manage-component.js`：說明文字範例 → 同 class F，視架構決策更新
- `scripts/lib/analyzers/hook-diagnostic.js`：路徑解析 → 需更新

## 範圍邊界

### 在範圍內（In Scope）

- SKILL.md 中的所有 `${CLAUDE_PLUGIN_ROOT}` 引用（類別 A + B + C）
- Command .md 中的所有 `${CLAUDE_PLUGIN_ROOT}` 引用（類別 D + E）
- JS 程式碼中的路徑解析邏輯更新（類別 G，除 manage-component.js 說明文字外）
- claude-dev references 文件中的說明（類別 F，視 architect 決策）

### 不在範圍內（Out of Scope）

- `plugins/overtone/hooks/hooks.json` 中的 14 處引用（由 hooks-config 迭代處理）
- 測試檔案中的路徑（由 test-adapt 迭代處理）
- 實際搬移任何檔案（由 move-files 迭代處理）
- `plugins/overtone/agents/grader.md` 中的 `$CLAUDE_PLUGIN_ROOT`（無大括號，是 JS require 範例，非路徑引用，維持不動）
- plugin.json、README 等配置文件（不含 `${CLAUDE_PLUGIN_ROOT}` 引用）

## 子任務清單

### Phase 1：更新 JS 程式碼路徑解析（阻塞性優先）

1. **更新 dependency-graph.js 掃描 regex**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/dependency-graph.js`
   - 說明：dependency-graph.js 使用 regex 掃描 SKILL.md 中的 `${CLAUDE_PLUGIN_ROOT}/...` 路徑。替換後路徑格式變為相對路徑（`./references/...`）或絕對路徑（`~/.claude/...`），regex 需同步更新否則 health-check 的 skill-reference 掃描會失效。需評估是否維持 `${CLAUDE_PLUGIN_ROOT}` 格式或改為支援新格式。

2. **更新 config-io.js、post-use-handler.js、hook-diagnostic.js**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/config-io.js`、`plugins/overtone/scripts/lib/post-use-handler.js`、`plugins/overtone/scripts/lib/analyzers/hook-diagnostic.js`
   - 說明：三個模組均對 `${CLAUDE_PLUGIN_ROOT}` 做字串替換或路徑解析。需更新 fallback 路徑（`plugins/overtone` → `~/.claude` 或 `$HOME/.claude`）以及替換目標的新路徑邏輯。

3. **更新 skill-forge.js 生成範本**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/skill-forge.js`
   - 說明：forge 生成新 SKILL.md 時，references 表格使用 `${CLAUDE_PLUGIN_ROOT}/skills/{domain}/references/README.md` 格式，需改為生成正確的相對路徑 `./references/README.md`。

### Phase 2：批量替換 SKILL.md（類別 A、B、C）

4. **替換 26 個 SKILL.md 中的自身 references 引用**（類別 A）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/*/SKILL.md`（26 個）
   - 說明：每個 SKILL.md 中 `${CLAUDE_PLUGIN_ROOT}/skills/{skillName}/references/` 或 `${CLAUDE_PLUGIN_ROOT}/skills/{skillName}/examples/` 替換為 `./references/` 或 `./examples/`。可用 sed 批量處理，但需先確認 skill 名稱與目錄名一致（inspect 後確認）。

5. **替換 SKILL.md 中的跨 skill 引用**（類別 B）
   - 負責 agent：developer
   - 相關檔案：`architecture/SKILL.md`、`code-review/SKILL.md`、`auto/SKILL.md`、`craft/SKILL.md`
   - 說明：跨 skill 引用數量少（約 7 處），建議逐一精確替換避免誤判。格式為 `../otherSkill/references/xxx.md`。

6. **替換 SKILL.md 中的腳本呼叫**（類別 C，可與 5 並行）
   - 負責 agent：developer
   - 相關檔案：`specs/SKILL.md`、`pm/SKILL.md`、`issue/SKILL.md`、`auto/SKILL.md`
   - 說明：`node ${CLAUDE_PLUGIN_ROOT}/scripts/` → `bun ~/.claude/scripts/`，`bun ${CLAUDE_PLUGIN_ROOT}/scripts/` → `bun ~/.claude/scripts/`。

### Phase 3：批量替換 Command .md（類別 D、E）

7. **替換 14 個 command .md 中的腳本呼叫和 skill 引用**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/commands/*.md`（14 個受影響的 command）
   - 說明：腳本呼叫（類別 D）替換為 `bun ~/.claude/scripts/xxx.js`；skill references 引用（類別 E）替換為 `~/.claude/skills/xxx/references/yyy.md`。兩類替換可在同一 pass 完成。

### Phase 4：更新 claude-dev references 說明文件（類別 F）

8. **更新 claude-dev references 文件中的說明**
   - 負責 agent：developer
   - 相關檔案：`claude-dev/references/command-api.md`、`claude-dev/references/skill-api.md`、`claude-dev/references/overtone-conventions.md`、`claude-dev/references/hooks-api.md`、`claude-dev/references/settings-api.md`
   - 說明：這些文件是「說明如何開發 Overtone 元件」的 reference 文件，其中包含 `${CLAUDE_PLUGIN_ROOT}` 的使用範例。替換策略由 architect 決定（見 Open Questions）。

### Phase 5：驗證

9. **執行 health-check 和 validate-agents 驗證**（依賴 1-8 完成）
   - 負責 agent：tester
   - 相關檔案：`plugins/overtone/scripts/health-check.js`、`plugins/overtone/scripts/validate-agents.js`
   - 說明：確認替換後 `checkSkillReferenceIntegrity` 等偵測項目不報錯。確認 `bun test` 通過（特別是與路徑解析相關的 unit tests）。

## 並行策略

- Phase 1：任務 1、2、3 可完全並行
- Phase 2：任務 4、5、6 中，5 和 6 可並行，4 可與 5、6 並行（操作不同檔案集）
- Phase 3：可與 Phase 2 並行（command 與 skill 目錄完全分離）
- Phase 4：依賴 architect 決策，待決策後執行

## 開放問題

1. **dependency-graph.js 掃描策略**：health-check 的 `checkSkillReferenceIntegrity` 依賴 dependency-graph.js 掃描 `${CLAUDE_PLUGIN_ROOT}` 格式路徑。替換後路徑格式改變，掃描器是否需要支援新格式（相對路徑 + 絕對路徑 `~/.claude/`）？還是 SKILL.md 應保持 `${CLAUDE_PLUGIN_ROOT}` 格式不變，讓掃描器仍可正確解析？這影響整體替換方向。

2. **claude-dev references 文件（類別 F）的替換策略**：這些文件中的 `${CLAUDE_PLUGIN_ROOT}` 一部分是「API 說明範例」（告訴開發者要用這個變數），更新後應改為說明「新的全域路徑格式」還是保留舊範例並新增說明？這涉及文件意義的改變，需要 architect 確認範圍。

3. **`~/.claude/scripts/` 的 node/bun 執行器**：腳本呼叫統一改為 `bun ~/.claude/scripts/xxx.js` 還是 `node ~/.claude/scripts/xxx.js`？目前 CLAUDE.md 規定使用 Bun，但全域安裝後是否確保 `bun` 可用（PATH 問題）？

4. **manage-component.js 說明文字**：此檔案中有 2 處 `${CLAUDE_PLUGIN_ROOT}` 在說明範例中。是否在本迭代更新？還是隨 JS 程式碼重構一起處理？
