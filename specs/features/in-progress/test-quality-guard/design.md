# Design: test-quality-guard

> 測試品質守衛 -- Knowledge + Perception 雙管齊下，防止 agent 產生低品質 / 重複測試。

---

## 技術摘要（What & Why）

- **方案**：雙管齊下 -- (1) Knowledge 層面新增反模式文件讓 agent 知道什麼不能做；(2) Perception 層面在 pre-task.js 注入測試檔案摘要讓 agent 知道已有哪些測試
- **理由**：目前 agent 只有「怎麼做對」的正面指引，缺少「什麼不能做」的負面清單；且委派時完全看不到已有測試，導致重複測試不斷累積
- **取捨**：test-index 摘要會增加 prompt 長度（約 2-4KB），但與 14KB 全量相比已大幅精簡

## API 介面設計

### test-index.js -- 測試索引掃描工具

```javascript
/**
 * 掃描 tests/ 目錄，產出測試檔案摘要。
 *
 * @param {string} testsDir - tests 目錄的絕對路徑
 * @param {object} [options]
 * @param {number} [options.maxChars=4000] - 輸出最大字元數
 * @returns {string} 摘要文字
 */
function buildTestIndex(testsDir, options = {}) => string
```

### 輸出格式

```
[Test Index] 81 files (unit: 38, integration: 33, e2e: 10)

## unit/
- registry.test.js: 資料完整性
- paths.test.js: 路徑解析
- hook-utils.test.js: safeReadStdin | safeRun | hookError
...

## integration/
- pre-task.test.js: 前置 stage 檢查 + agent 辨識 + 並行放行
...

## e2e/
- workflow-lifecycle.test.js: 完整生命週期
...
```

設計原則：
- 每檔一行，格式 `{filename}: {top-level describe 名稱（| 分隔）}`
- describe 名稱擷取後去重，並截斷過長的部分
- 超過 maxChars 時截斷尾部，加 `... (已截斷)` 後綴

### 錯誤處理

| 錯誤情況 | 處理方式 |
|---------|---------|
| tests/ 目錄不存在 | 回傳空字串 |
| 單一檔案讀取失敗 | 跳過該檔案，繼續處理 |
| 所有檔案讀取失敗 | 回傳空字串 |

## 資料模型

無持久化資料。test-index.js 為純函式，每次呼叫即時掃描。

## 檔案結構

```
修改的檔案：
  plugins/overtone/skills/testing/SKILL.md          ← 修改：加第 7 條 reference
  plugins/overtone/skills/code-review/SKILL.md      ← 修改：加跨域 reference
  plugins/overtone/hooks/scripts/tool/pre-task.js   ← 修改：注入 test-index 摘要
  plugins/overtone/agents/tester.md                 ← 修改：加 DON'T 規則（透過 manage-component.js）
  plugins/overtone/agents/developer.md              ← 修改：加 DON'T 規則（透過 manage-component.js）

新增的檔案：
  plugins/overtone/skills/testing/references/test-anti-patterns.md  ← 新增：6 種反模式文件
  plugins/overtone/scripts/test-index.js                            ← 新增：測試索引掃描工具
  tests/unit/test-index.test.js                                     ← 新增：掃描工具單元測試
```

## 關鍵技術決策

### 決策 1：test-index 摘要粒度 -- 只 describe 名稱

- **選項 A**（選擇）：每檔一行，只列 top-level describe 名稱（| 分隔）-- 優點：81 行約 3-4KB，符合 prompt 預算
- **選項 B**（未選）：含 it 描述 -- 原因：81 檔 x 每檔多個 it 會超過 10KB，prompt 爆炸

### 決策 2：注入位置 -- pre-task.js buildWorkflowContext 後追加

- **選項 A**（選擇）：在 pre-task.js 的 updatedInput prompt 前綴追加，與 workflowContext 串接 -- 優點：單一注入點，不需修改 hook-utils.js
- **選項 B**（未選）：修改 buildWorkflowContext 本身 -- 原因：buildWorkflowContext 是通用函式，test-index 只對 tester/developer agent 有意義

### 決策 3：注入條件 -- 只對 tester 和 developer 注入

- **選項 A**（選擇）：在 pre-task.js 辨識出 targetAgent 為 tester 或 developer 時才呼叫 buildTestIndex -- 優點：不浪費其他 agent 的 prompt 空間
- **選項 B**（未選）：對所有 agent 注入 -- 原因：planner、architect、code-reviewer 不需要測試檔清單

### 決策 4：test-index.js 放在 scripts/ 而非 lib/

- **選項 A**（選擇）：放 scripts/test-index.js（獨立工具腳本）-- 優點：可獨立執行（CLI `bun scripts/test-index.js`），也可被 require
- **選項 B**（未選）：放 scripts/lib/test-index.js -- 原因：test-index 不是 hook/state/timeline 等核心庫，放 scripts/ 更合適（與 health-check.js、validate-agents.js 同層級）

### 決策 5：code-reviewer 跨域引用 anti-patterns

- **選項 A**（選擇）：在 code-review/SKILL.md 新增一條跨域引用 `testing/references/test-anti-patterns.md` -- 優點：reviewer 審查測試程式碼時有反模式清單可參考
- **選項 B**（未選）：複製一份到 code-review/references/ -- 原因：違反 Single Source of Truth

### 決策 6：agent .md 更新方式

tester.md 和 developer.md 受 pre-edit-guard 保護，developer agent 必須用 `manage-component.js update agent` 命令更新。

## 實作注意事項

給 developer 的提醒：

- pre-task.js 的 test-index 注入要放在 `buildWorkflowContext` 組裝完成後、寫入 `updatedInput` 之前
- test-index.js 的掃描只用 `fs.readFileSync` + `matchAll`，不引入新依賴
- anti-patterns.md 的 6 種反模式清單由 planner 定義，developer 照規格撰寫即可
- 注入 test-index 時要用 `const testDir = path.join(projectRoot, 'tests')` 取得路徑，不硬編碼
- test-index.js 需同時 export `buildTestIndex` 函式和支援 CLI 直接執行（`if (require.main === module)`）
- 更新 tester.md / developer.md 用 `manage-component.js` 的 `update agent` 子命令，不可直接 Edit
