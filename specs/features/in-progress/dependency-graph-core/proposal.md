# Proposal 格式樣板

## 功能名稱

`dependency-graph-core`

## 需求背景（Why）

- **問題**：目前 Overtone 元件修改後的閉環檢查依賴人工記憶。pre-edit-guard 只能提供通用文字提示（「記得檢查消費者」），manage-component.js 也只有通用閉環提醒。開發者修改 skill reference 時，無法快速知道哪些 agent 會受影響、修改 hook script 時不知道引用了哪些 lib 模組。
- **目標**：建立可程式化查詢的雙向依賴圖，讓開發者和 guard script 能精確知道「改了 X 會影響 Y」，從人工記憶改為自動化影響範圍分析。
- **優先級**：閉環完整性是製作規範核心原則之一，缺乏自動化依賴追蹤是現有閉環機制的明確缺口。

## 使用者故事

```
身為 Overtone 開發者
我想要查詢「修改 testing-conventions.md 會影響哪些元件」
以便在修改前確認需要同步更新的消費者範圍
```

```
身為 pre-edit-guard hook
我想要取得「此 skill reference 的所有消費者 agent」
以便提供精確的影響範圍提示（而非通用文字）
```

## 範圍邊界

### 在範圍內（In Scope）

- `scripts/lib/dependency-graph.js`：核心模組，掃描 plugin 結構建立雙向依賴圖
- `scripts/impact.js`：CLI 入口，提供 `bun scripts/impact.js <path>` 查詢介面
- 四類依賴關係掃描：
  1. Agent frontmatter `skills` 欄位 → agent 消費哪些 skill
  2. SKILL.md Reference 索引表 → skill 包含哪些 reference 檔案
  3. registry-data.json stages → 哪個 stage 對應哪個 agent
  4. hooks/scripts/**/*.js 的 `require()` → hook 依賴哪些 lib 模組
- BDD 驗收測試（`tests/unit/dependency-graph.test.js`）

### 不在範圍內（Out of Scope）

- Command → Agent/Workflow 引用解析（PM brief 有列但複雜度高，可列為 v2）
- 整合進 pre-edit-guard hook（待 dependency-graph-core 穩定後的下一步）
- 持久化快取（此次先做 on-demand 掃描）
- 循環依賴偵測
- 視覺化圖表輸出

## 子任務清單

依照執行順序列出，標記可並行的任務：

1. **分析現有 plugin 結構，確認各資料來源格式**
   - 負責 agent：architect
   - 相關檔案：`plugins/overtone/agents/*.md`、`plugins/overtone/skills/*/SKILL.md`、`plugins/overtone/scripts/lib/registry-data.json`、`plugins/overtone/hooks/scripts/**/*.js`
   - 說明：讀取各類檔案，確認 frontmatter 格式（gray-matter）、SKILL.md Reference 表格格式、require() 路徑慣例，輸出 design.md

2. **實作 `dependency-graph.js` 核心模組**（依賴 1 完成）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/dependency-graph.js`（新建）
   - 說明：實作 `buildGraph(pluginRoot)` 函式，回傳具有 `getImpacted(path)` 和 `getDependencies(path)` 方法的物件；含四類掃描器（agent-skills、skill-references、registry-stages、hook-requires）

3. **實作 `impact.js` CLI 入口**（可與 2 並行，介面定義清楚後）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/impact.js`（新建）
   - 說明：解析 CLI 參數，呼叫 dependency-graph.js，格式化輸出影響範圍或依賴清單；支援 `--json` flag 供程式化使用

4. **撰寫 BDD 驗收測試**（依賴 2 完成）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/dependency-graph.test.js`（新建）
   - 說明：覆蓋三個 BDD 場景：(a) 修改 testing-conventions.md → 影響 SKILL.md + consuming agents；(b) 修改 developer.md → 依賴所有 frontmatter skills；(c) 修改 hook script → 影響 hooks.json 引用此 script 的 event

## 開放問題

- **Q1**：SKILL.md Reference 索引表格式是否一致？部分 SKILL.md（如 workflow-core）用 markdown 表格，其他是否有不同格式？architect 需確認。
- **Q2**：`getImpacted` 的路徑參數應是絕對路徑還是相對於 plugin root 的相對路徑？影響 CLI 使用體驗和測試寫法。
- **Q3**：hook script 的 require() 路徑是相對路徑（`../../../scripts/lib/`），architect 需決定路徑正規化策略。
- **Q4**：Commands → Agent/Workflow 引用的解析是否納入 v1？PM brief 有列但複雜度顯著較高（自由文字搜尋，而非結構化欄位）。建議列為 Out of Scope，確認後可移除此問題。
