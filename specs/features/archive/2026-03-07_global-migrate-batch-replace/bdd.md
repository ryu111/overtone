# Feature: global-migrate-batch-replace

批量將所有 `${CLAUDE_PLUGIN_ROOT}` 路徑引用替換為相對路徑或全域絕對路徑，
涵蓋 SKILL.md、Command .md、JS 程式碼、claude-dev references 四大類型。

---

## Scenario: SKILL.md 同 skill 引用（類別 A）替換為相對路徑
GIVEN 專案中存在 26 個 SKILL.md，部分包含 `${CLAUDE_PLUGIN_ROOT}/skills/{self}/references/xxx.md` 格式
WHEN 執行批量替換（Phase 2 類別 A）
THEN 所有同 skill 的 references 引用格式變為 `./references/xxx.md`
AND 所有同 skill 的 examples 引用格式變為 `./examples/xxx.md`
AND 原 `${CLAUDE_PLUGIN_ROOT}/skills/{self}/` 格式完全消失（不存在任何殘留）

## Scenario: SKILL.md 跨 skill 引用（類別 B）替換為跨目錄相對路徑
GIVEN architecture/SKILL.md、code-review/SKILL.md、auto/SKILL.md、craft/SKILL.md 中存在跨 skill 引用
WHEN 執行批量替換（Phase 2 類別 B）
THEN `${CLAUDE_PLUGIN_ROOT}/skills/{other}/references/xxx.md` 替換為 `../{other}/references/xxx.md`
AND 替換後跨 skill 引用仍指向正確的 skill 名稱（other 部分保留不變）
AND 同 skill 引用（類別 A）未被誤認為跨 skill 引用（兩個 pass 各自正確）

## Scenario: SKILL.md 腳本呼叫（類別 C）替換為全域路徑
GIVEN specs/SKILL.md、pm/SKILL.md、issue/SKILL.md、auto/SKILL.md 含有腳本呼叫
WHEN 執行批量替換（Phase 2 類別 C）
THEN `node ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` 替換為 `bun ~/.claude/scripts/xxx.js`
AND `bun ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` 替換為 `bun ~/.claude/scripts/xxx.js`
AND `bun run ${CLAUDE_PLUGIN_ROOT}/scripts/xxx.js` 替換為 `bun ~/.claude/scripts/xxx.js`
AND runtime 名稱統一改為 `bun`（不保留 `node`）

## Scenario: Command .md 腳本呼叫（類別 D）替換為全域路徑
GIVEN 14 個 command .md 中含有 `${CLAUDE_PLUGIN_ROOT}/scripts/` 腳本呼叫
WHEN 執行批量替換（Phase 3 類別 D）
THEN 所有腳本呼叫格式更新為 `bun ~/.claude/scripts/xxx.js`
AND 替換不影響其他 command 內容

## Scenario: Command .md 中的 skill reference 引用（類別 E）替換為全域絕對路徑
GIVEN 14 個 command .md 中含有 `${CLAUDE_PLUGIN_ROOT}/skills/xxx/references/yyy.md` 格式
WHEN 執行批量替換（Phase 3 類別 E）
THEN 所有 skill reference 引用格式更新為 `~/.claude/skills/xxx/references/yyy.md`
AND skill 名稱和 reference 檔名保留不變

## Scenario: 批量替換後無殘留的 ${CLAUDE_PLUGIN_ROOT} 引用
GIVEN Phase 2、3 全部完成
WHEN 掃描 SKILL.md 和 Command .md 的所有內容
THEN 不存在任何 `${CLAUDE_PLUGIN_ROOT}` 字串
AND hooks.json 和測試檔案中的 `${CLAUDE_PLUGIN_ROOT}` 不在掃描範圍，不受影響

## Scenario: dependency-graph.js 同時支援三種路徑格式（類別 G2）
GIVEN scanSkillReferences 原本只支援 `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/references/{file}` 格式
WHEN 更新 scanSkillReferences 支援三種格式
THEN 舊格式 `${CLAUDE_PLUGIN_ROOT}/skills/{skill}/references/{file}` 仍能建立依賴邊
AND 新格式 `./references/{file}` 能正確解析為當前 skill 下的 reference（使用 skillRelPath 上下文）
AND 跨 skill 格式 `../{otherSkill}/references/{file}` 能正確建立跨 skill 依賴邊
AND 同一個 SKILL.md 同時含有新舊格式時不重複計邊（Set 去重）

## Scenario: dependency-graph.js 轉換期間新舊格式共存不重複計邊
GIVEN Phase 2 執行中，部分 SKILL.md 已替換、部分尚未替換
WHEN scanSkillReferences 掃描混合格式的 SKILL.md
THEN 舊格式和新格式指向同一個 reference 檔案時，只建立一條依賴邊
AND lastIndex 正確重置，不跳過任何引用

## Scenario: post-use-handler.js fallback 路徑使用 os.homedir()（類別 G1）
GIVEN post-use-handler.js 原本的 fallback 為 `'plugins/overtone'`
WHEN 更新 fallback 為 `os.homedir() + '/.claude'`
THEN 環境變數 CLAUDE_PLUGIN_ROOT 未設定時，pluginRoot 解析為 `{homedir}/.claude`
AND 環境變數 CLAUDE_PLUGIN_ROOT 已設定時，仍使用環境變數值（不受影響）
AND fallback 使用 `os.homedir()` 而非 `process.env.HOME`（確保跨平台一致）

## Scenario: skill-forge.js 生成新 SKILL.md 使用相對路徑格式（類別 G4）
GIVEN skill-forge.js 含有 SKILL.md 範本，原本生成 `${CLAUDE_PLUGIN_ROOT}/skills/{domain}/references/` 格式
WHEN 更新 skill-forge.js 範本
THEN 新建立的 SKILL.md 中 references 引用格式為 `./references/{file}.md`
AND 不再生成包含 `${CLAUDE_PLUGIN_ROOT}` 的路徑字串

## Scenario: claude-dev references 範例路徑更新（類別 F）
GIVEN hooks-api.md、command-api.md、skill-api.md、overtone-conventions.md、settings-api.md 含有舊格式路徑範例
WHEN 更新 5 個 claude-dev references 文件（Phase 4）
THEN hooks 範例路徑從 `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/xxx.js` 更新為 `~/.claude/hooks/scripts/xxx.js`
AND 說明文字中「CLAUDE_PLUGIN_ROOT 變數」相關段落更新為「全域路徑 `~/.claude/`」
AND code-block 中的範例路徑全部更新為新格式
AND 保留一段歷史說明，記錄舊格式已被全域路徑取代（不完全刪除舊格式說明）

## Scenario: 類別 A/B 邊界不混淆（auto/SKILL.md 雙類型場景）
GIVEN auto/SKILL.md 同時含有類別 A（自身 auto skill 的 references）和類別 B（引用其他 skill 的 references）
WHEN 執行替換
THEN 類別 A（`skills/auto/references/`）替換為 `./references/`
AND 類別 B（`skills/workflow-core/references/` 等）替換為 `../workflow-core/references/` 等
AND 兩種替換各自正確，不發生混淆或誤替換

## Scenario: health-check 在替換後仍能正常執行
GIVEN Phase 2 全部完成，SKILL.md 全面使用相對路徑格式
WHEN 執行 `bun scripts/health-check.js`
THEN health-check 的 `checkSkillReferenceIntegrity` 能正確偵測到相對路徑格式（格式 1 regex 捕捉）
AND 不再偵測到 `${CLAUDE_PLUGIN_ROOT}` 格式（格式 2 regex 無命中）
AND 整體 health-check 通過，errors 數量為 0

## Scenario: validate-agents 在替換後仍能正常執行
GIVEN Phase 1-4 全部完成
WHEN 執行 `bun scripts/validate-agents.js`
THEN 所有 agent、hook、skill、command 結構校驗通過
AND 不因路徑格式變更出現新的 validation error

## Scenario: manage-component.js 和測試檔案不在替換範圍
GIVEN manage-component.js 內含 `${CLAUDE_PLUGIN_ROOT}` 字串
AND 測試檔案（tests/）內含 `${CLAUDE_PLUGIN_ROOT}` 字串
WHEN 執行所有批量替換（Phase 1-4）
THEN manage-component.js 的內容不被修改
AND tests/ 目錄下的測試檔案不被修改
AND hooks.json 不被修改
