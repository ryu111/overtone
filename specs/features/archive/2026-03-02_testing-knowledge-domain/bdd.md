# Feature: testing knowledge domain skill 建立

## 背景

Overtone 目前有 4 處散布的 BDD/testing 知識：`auto/references/` 中的 bdd-spec-guide 與 test-scope-dispatch、`test/references/` 中的 bdd-methodology 與 testing-conventions、`test/examples/` 的 bdd-spec-samples、以及獨立的 `ref-test-strategy/` skill。建立 `testing` knowledge domain skill 統一管理這些知識。

---

# Feature 1: testing skill 目錄結構正確性

## Scenario: testing skill SKILL.md 存在且 frontmatter 合規
GIVEN 開發者完成 testing skill 建立
WHEN 讀取 `plugins/overtone/skills/testing/SKILL.md` 檔案
THEN 檔案存在
AND frontmatter 包含 `name: testing`
AND frontmatter 包含 `disable-model-invocation: true`
AND frontmatter 包含 `user-invocable: false`

## Scenario: testing skill 的所有 reference 檔案存在
GIVEN testing skill 目錄建立完成
WHEN 列出 `plugins/overtone/skills/testing/references/` 目錄內容
THEN 存在 `bdd-spec-guide.md`
AND 存在 `test-scope-dispatch.md`
AND 存在 `bdd-methodology.md`
AND 存在 `testing-conventions.md`
AND 存在 `test-strategy.md`

## Scenario: testing skill 的 example 檔案存在
GIVEN testing skill 目錄建立完成
WHEN 列出 `plugins/overtone/skills/testing/examples/` 目錄內容
THEN 存在 `bdd-spec-samples.md`

## Scenario: testing skill 目錄不存在時 SKILL.md 檔案不可被讀取
GIVEN 尚未建立 testing skill 目錄
WHEN 嘗試讀取 `plugins/overtone/skills/testing/SKILL.md`
THEN 檔案不存在
AND 系統不應拋出未預期錯誤，而是回傳檔案不存在的狀態

---

# Feature 2: agent skills 欄位設定正確性

## Scenario: tester agent 載入 testing skill
GIVEN 開發者完成 tester.md 的 skills 欄位更新
WHEN 解析 `plugins/overtone/agents/tester.md` 的 frontmatter
THEN `skills` 欄位包含 `testing`
AND `skills` 欄位不包含 `ref-test-strategy`

## Scenario: qa agent 新增 testing skill
GIVEN 開發者完成 qa.md 的 skills 欄位新增
WHEN 解析 `plugins/overtone/agents/qa.md` 的 frontmatter
THEN `skills` 欄位包含 `testing`

## Scenario: tester agent 其他 frontmatter 欄位不受影響
GIVEN 更新 tester.md skills 欄位為 testing
WHEN 解析 tester.md 的完整 frontmatter
THEN `name` 仍為 `tester`
AND `model` 仍為 `sonnet`
AND `permissionMode` 仍為 `bypassPermissions`
AND `color` 仍為 `pink`
AND `maxTurns` 仍為 `50`

---

# Feature 3: 引用路徑更新正確性

## Scenario: auto/SKILL.md 的 bdd-spec-guide 引用指向 testing 路徑
GIVEN 開發者完成 auto/SKILL.md 的引用路徑更新
WHEN 讀取 `plugins/overtone/skills/auto/SKILL.md` 的內容
THEN 不存在指向 `auto/references/bdd-spec-guide.md` 的路徑
AND 存在指向 `testing/references/bdd-spec-guide.md` 的路徑

## Scenario: auto/SKILL.md 的 test-scope-dispatch 引用指向 testing 路徑
GIVEN 開發者完成 auto/SKILL.md 的引用路徑更新
WHEN 讀取 `plugins/overtone/skills/auto/SKILL.md` 的內容
THEN 不存在指向 `auto/references/test-scope-dispatch.md` 的路徑
AND 存在指向 `testing/references/test-scope-dispatch.md` 的路徑

## Scenario: standard/full/secure/refactor SKILL.md 的 bdd-spec-guide 引用指向 testing 路徑
GIVEN 開發者完成 standard、full、secure、refactor 的 SKILL.md 引用路徑更新
WHEN 分別讀取這 4 個 SKILL.md 的內容
THEN 各檔案中不存在指向 `auto/references/bdd-spec-guide.md` 的路徑
AND 各檔案中存在指向 `testing/references/bdd-spec-guide.md` 的路徑

## Scenario: test/SKILL.md 的 bdd-methodology 和 bdd-spec-samples 引用指向 testing 路徑
GIVEN 開發者完成 test/SKILL.md 的引用路徑更新
WHEN 讀取 `plugins/overtone/skills/test/SKILL.md` 的內容
THEN 不存在指向 `test/references/bdd-methodology.md` 的路徑
AND 不存在指向 `test/examples/bdd-spec-samples.md` 的路徑
AND 存在指向 `testing/references/bdd-methodology.md` 的路徑
AND 存在指向 `testing/examples/bdd-spec-samples.md` 的路徑

## Scenario: 更新後的引用路徑目標檔案可被讀取
GIVEN 所有引用路徑已更新且 testing skill 目錄已建立
WHEN 按照各 SKILL.md 中的 💡 路徑讀取目標檔案
THEN 每個路徑對應的 reference 或 example 檔案皆存在
AND 檔案內容非空

---

# Feature 4: 舊路徑清理正確性

## Scenario: ref-test-strategy 目錄已被刪除
GIVEN 開發者完成舊路徑清理
WHEN 檢查 `plugins/overtone/skills/ref-test-strategy/` 目錄
THEN 目錄不存在
AND SKILL.md 不存在

## Scenario: test/references 目錄已被刪除
GIVEN 開發者完成舊路徑清理
WHEN 檢查 `plugins/overtone/skills/test/references/` 目錄
THEN 目錄不存在

## Scenario: test/examples 目錄已被刪除
GIVEN 開發者完成舊路徑清理
WHEN 檢查 `plugins/overtone/skills/test/examples/` 目錄
THEN 目錄不存在

## Scenario: 清理後舊引用路徑的原始目標不可訪問
GIVEN 舊目錄已全部刪除
WHEN 嘗試讀取 `plugins/overtone/skills/auto/references/bdd-spec-guide.md`
THEN 檔案不存在（bdd-spec-guide.md 已搬移到 testing/references/）
WHEN 嘗試讀取 `plugins/overtone/skills/auto/references/test-scope-dispatch.md`
THEN 檔案不存在（test-scope-dispatch.md 已搬移到 testing/references/）

---

# Feature 5: 搬移後 reference 內容完整性

## Scenario: bdd-spec-guide.md 搬移後內容不變
GIVEN bdd-spec-guide.md 已從 auto/references/ 搬移到 testing/references/
WHEN 讀取 `plugins/overtone/skills/testing/references/bdd-spec-guide.md`
THEN 檔案存在且可讀
AND 檔案內容非空（不為 0 bytes）

## Scenario: test-scope-dispatch.md 搬移後內容不變
GIVEN test-scope-dispatch.md 已從 auto/references/ 搬移到 testing/references/
WHEN 讀取 `plugins/overtone/skills/testing/references/test-scope-dispatch.md`
THEN 檔案存在且可讀
AND 內容包含 `test-scope-dispatch` 關鍵字（原始標題）

## Scenario: bdd-methodology.md 搬移後內容不變
GIVEN bdd-methodology.md 已從 test/references/ 搬移到 testing/references/
WHEN 讀取 `plugins/overtone/skills/testing/references/bdd-methodology.md`
THEN 檔案存在且可讀
AND 檔案內容非空

## Scenario: testing-conventions.md 搬移後內容不變
GIVEN testing-conventions.md 已從 test/references/ 搬移到 testing/references/
WHEN 讀取 `plugins/overtone/skills/testing/references/testing-conventions.md`
THEN 檔案存在且可讀
AND 檔案內容非空

## Scenario: test-strategy.md 搬移後去除 frontmatter 且內容不變
GIVEN ref-test-strategy SKILL.md 的主體內容已搬移為 testing/references/test-strategy.md
WHEN 讀取 `plugins/overtone/skills/testing/references/test-strategy.md`
THEN 檔案存在且可讀
AND 檔案內容不包含 YAML frontmatter 分隔符 `---`（frontmatter 已去除）
AND 內容包含測試策略五階段相關內容

## Scenario: bdd-spec-samples.md 搬移後內容不變
GIVEN bdd-spec-samples.md 已從 test/examples/ 搬移到 testing/examples/
WHEN 讀取 `plugins/overtone/skills/testing/examples/bdd-spec-samples.md`
THEN 檔案存在且可讀
AND 內容包含 BDD 範例（如 GIVEN/WHEN/THEN 關鍵字）

---

# Feature 6: platform-alignment-skills 測試更新正確性

## Scenario: 測試驗證 testing skill SKILL.md frontmatter 正確性
GIVEN platform-alignment-skills.test.js 已更新以驗證 testing skill
WHEN 執行 `bun test tests/unit/platform-alignment-skills.test.js`
THEN 測試通過
AND 有測試案例驗證 `testing/SKILL.md` 的 `name` 欄位為 `testing`
AND 有測試案例驗證 `disable-model-invocation: true`
AND 有測試案例驗證 `user-invocable: false`

## Scenario: 測試標記 ref-test-strategy 已被刪除
GIVEN platform-alignment-skills.test.js 已更新「已刪除 skill 清單」
WHEN 執行 `bun test tests/unit/platform-alignment-skills.test.js`
THEN 測試通過
AND 有測試案例驗證 `ref-test-strategy` 目錄不存在

## Scenario: 測試更新後不再驗證已刪除的 ref-test-strategy 為存在狀態
GIVEN 舊測試中有驗證 ref-test-strategy 存在的測試案例
WHEN 開發者更新 platform-alignment-skills.test.js
THEN 不存在斷言 `ref-test-strategy/SKILL.md` 存在的測試
AND 測試意圖清晰反映新架構（testing 取代 ref-test-strategy）

---

# Feature 7: 回歸安全 — 現有測試全部通過

## Scenario: 完整測試套件在重構後仍全部通過
GIVEN 所有開發變更已完成（目錄搬移、路徑更新、agent 設定更新）
WHEN 從專案根目錄執行 `bun test`
THEN 所有測試通過（0 failures）
AND 無新增的測試失敗
AND 測試數量與重構前相符或增加（不允許減少）

## Scenario: 重構不影響 auto/SKILL.md 其他功能引用
GIVEN auto/SKILL.md 的 bdd-spec-guide 和 test-scope-dispatch 路徑已更新
WHEN 讀取 auto/SKILL.md 完整內容
THEN failure-handling.md 的引用路徑不變（仍指向 `auto/references/`）
AND handoff-protocol.md 的引用路徑不變（仍指向 `auto/references/`）
AND parallel-groups.md 的引用路徑不變（仍指向 `auto/references/`）
AND completion-signals.md 的引用路徑不變（仍指向 `auto/references/`）

## Scenario: 重構不影響 test/SKILL.md 核心說明內容
GIVEN test/SKILL.md 的引用路徑已更新
WHEN 讀取 test/SKILL.md 完整內容
THEN 模式選擇表格（spec/verify）仍存在
AND 使用場景說明仍存在
AND 後續流程說明仍存在
