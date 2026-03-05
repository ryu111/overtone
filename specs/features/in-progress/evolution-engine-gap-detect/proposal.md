# Proposal

## 功能名稱

`evolution-engine-gap-detect`（Phase 4 P4.1）

## 需求背景（Why）

- **問題**：Overtone 目前已有多個獨立的缺口偵測工具（health-check 16 項、fix-consistency 消費者表一致性、dependency-graph 依賴分析），但這些工具各自輸出不同格式，無法被程式統一消費。Phase 4 的自我進化目標需要一個統一入口，能從多個信號源整合出「系統現在缺什麼元件、缺什麼能力」的結論，並產出具體建議。
- **目標**：建立 `evolution.js` CLI + `gap-analyzer.js` lib，整合 health-check、fix-consistency、dependency-graph 的輸出，分類缺口並產出可執行的 manage-component.js 建議指令。供開發者一鍵獲得「系統自我診斷報告」，也為 P4.2 自動建立層提供可程式化 API。
- **優先級**：Phase 4 的第一步（P4.1），是自動建立層（P4.2）的必要前置。

## 使用者故事

```
身為 Overtone 開發者
我想要執行 bun scripts/evolution.js analyze
以便獲得一份列出所有元件缺口及具體修復建議的報告
```

```
身為 P4.2 自動建立層的程式碼
我想要 import gap-analyzer.js 並呼叫 analyzeGaps()
以便取得結構化的缺口列表，再依此自動建立元件
```

## 範圍邊界

### 在範圍內（In Scope）

- `scripts/lib/gap-analyzer.js`：整合多信號源、分類缺口、產出建議的核心模組
- `scripts/evolution.js`：CLI 入口，執行 `analyze` 命令並輸出報告
- 缺口類型：`missing-skill`、`missing-agent`、`missing-hook`、`incomplete-skill`、`stale-reference`、`broken-chain`
- 建議格式：含 `manage-component.js` 指令字串的 suggestion 物件
- 測試：gap-analyzer.js 的 unit tests（使用暫存目錄 fixture，獨立於生產資料）
- 整合測試：evolution.js CLI 的 analyze 命令輸出格式驗證

### 不在範圍內（Out of Scope）

- 自動執行建議（P4.2 的工作）
- 修改 health-check.js、fix-consistency.js、dependency-graph.js 的核心邏輯
- heartbeat daemon 整合（P4.3）
- knowledge-gap-detector.js 的 AI 語意分析缺口（另立功能）
- 新增 health-check 偵測項目（保持獨立可用）

## 子任務清單

1. **建立 gap-analyzer.js 核心模組**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/gap-analyzer.js`（新增）
   - 說明：設計並實作 `analyzeGaps(pluginRoot)` 函式。整合三個信號源：(a) 呼叫 `health-check.js` 匯出的 `checkComponentChain`、`checkCompletionGap`、`checkDependencySync`、`checkClosedLoop`（已有 module.exports）；(b) 呼叫 `fix-consistency.js` 的 `checkDependencySync` 找出消費者表缺漏；(c) 呼叫 `dependency-graph.js` 的 `buildGraph` 偵測 dependency 中引用但不存在的路徑。將 raw findings 正規化為統一的 Gap 格式（`{ type, severity, file, message, suggestion }`），其中 suggestion 含 `manage-component.js` 指令字串。

2. **建立 evolution.js CLI 入口**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/evolution.js`（新增）
   - 說明：CLI 支援 `bun scripts/evolution.js analyze [--json]`。純文字模式輸出可讀報告（分類顯示各 type 的缺口數量 + 每個缺口的 message + suggestion 指令）；`--json` 模式輸出結構化 JSON（供 P4.2 程式消費）。pluginRoot 偵測與 impact.js 相同做法（`join(__dirname, '..')`）。

3. **撰寫 gap-analyzer.js 的 unit tests**
   - 負責 agent：tester
   - 相關檔案：`tests/unit/gap-analyzer.test.js`（新增）
   - 說明：使用暫存目錄建立 fixture（最小化 plugin 目錄結構），驗證：(a) 缺少 SKILL.md 時回傳 `missing-skill` 缺口；(b) agent frontmatter 引用不存在 skill 時回傳 `broken-chain` 缺口；(c) skill 缺少 references/ 時回傳 `incomplete-skill` 缺口；(d) 正常結構時回傳空缺口列表；(e) suggestion 物件含正確的 manage-component.js 指令格式。

4. **撰寫 evolution.js CLI 整合測試**（可與 3 並行）
   - 負責 agent：tester
   - 相關檔案：`tests/integration/evolution-analyze.test.js`（新增）
   - 說明：以 `bun scripts/evolution.js analyze --json` 執行，驗證輸出 JSON 的頂層結構（`gaps[]`、`summary`、`generatedAt`）符合 schema；驗證 `--json` flag 時輸出可被 `JSON.parse` 解析；驗證 exit code 有缺口時為 1、無缺口時為 0。

## 開放問題

- **建議指令的完整度**：suggestion 中的 manage-component.js 指令是否需要填入完整 body（需要 AI 推斷），還是只給 skeleton（空 body）？建議先給 skeleton，P4.2 再補 AI 推斷的 body。
- **缺口去重策略**：health-check 的 `checkComponentChain` 和 `checkDependencySync` 可能回報同一個缺口（agent 引用不存在 skill）。需要 architect 決定 gap-analyzer 如何去重（by file+message hash？by file+type？）。
- **fix-consistency.js 的 module.exports**：目前 fix-consistency.js 是 CLI script，沒有 module.exports。gap-analyzer 若要直接 import 其邏輯，需要 health-check.js 已匯出的 `checkDependencySync`（已有）即可，不需改 fix-consistency.js。請 architect 確認這條路徑是否足夠，還是需要額外拆解。
