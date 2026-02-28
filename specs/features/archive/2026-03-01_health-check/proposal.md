# Health Check — 系統健康檢查機制

`health-check`

## 需求背景（Why）

- **問題**：Overtone 目前 13 個 lib 模組、7 個 hook、34 個 skill、22 種 timeline events，隨著迭代容易出現 phantom events、dead exports、doc-code drift 等衛生問題。上次手動審計找到 16 個問題（6 phantom events + 1 dead export + 5 doc drift + 2 unused paths + 2 duplicate logic），全部手動排查耗時且不可重複。
- **目標**：建立可重複執行的自動化健康檢查腳本 + 配套 `/ot:audit` skill，讓使用者一個指令就能偵測並分析系統衛生問題。未來可接入 CI 做 gate。
- **優先級**：系統已穩定（742 pass / 0 fail），現在是做衛生自動化的最佳時機。

## 使用者故事

```
身為 Overtone 開發者
我想要執行 /ot:audit 自動掃描系統健康問題
以便在每次大改版後快速找到 phantom events、dead exports、doc drift 等衛生問題
```

```
身為 CI pipeline
我想要 health-check.js exit 1 當有 findings
以便在 PR merge 前攔截衛生退化
```

## 範圍邊界

### 在範圍內（In Scope）

- `scripts/health-check.js`：5 項確定性偵測（phantom events、dead exports、doc-code drift、unused paths、duplicate logic）
- `skills/audit/SKILL.md`：`/ot:audit` skill，串接腳本 + PM agent 分析
- 單元測試：覆蓋 5 項偵測的正向/負向 case
- 整合測試：驗證腳本端到端輸出和退出碼

### 不在範圍內（Out of Scope）

- CI 整合（GitHub Actions 設定）— 留到未來
- 自動修復功能 — 此次只偵測和建議，不自動修改程式碼
- 非 `scripts/lib/` 的外部模組掃描（如 web/ 目錄）
- Dashboard 可視化 health 狀態

## 子任務清單

1. **health-check.js 腳本骨架**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`
   - 說明：建立腳本入口，定義 5 個偵測函式的介面、結構化 findings 輸出格式（JSON stdout）、退出碼邏輯（findings > 0 -> exit 1）。參考 `validate-agents.js` 的模式（同一目錄的既有驗證腳本）。

2. **偵測 #1：Phantom Events**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`, `plugins/overtone/scripts/lib/registry.js`
   - 說明：掃描 `registry.js` 中 `timelineEvents` 的所有 key，再 grep `plugins/overtone/` 下所有 `.js` 檔案中的 `emit(...)` 呼叫，比對 diff。registry 定義了但沒有任何 emit 呼叫的 = phantom。注意排除 health-check.js 自身和測試檔案。

3. **偵測 #2：Dead Exports**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`, `plugins/overtone/scripts/lib/*.js`（13 個模組）
   - 說明：掃描 `scripts/lib/*.js`（含子目錄 `dashboard/`, `remote/`）的 `module.exports`，再 grep 整個 `plugins/overtone/` 目錄的 `require()` 呼叫和解構取用，找出「export 了但沒人 require 的」函式/常數。需處理 `const { a, b } = require(...)` 和 `const x = require(...)` 兩種模式。

4. **偵測 #3：Doc-Code Drift**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`, `docs/status.md`, `docs/spec/*.md`, `plugins/overtone/scripts/lib/registry.js`
   - 說明：比對 docs 中的關鍵數字與程式碼實際值。包含：(a) timeline events 數量 vs registry.js 實際數量、(b) agent 數量、(c) workflow 數量、(d) hook 數量、(e) test 通過數/檔案數（需跑 bun test 或讀 status.md）。用正規表達式從 docs 抽取數字，與程式碼計算值比對。

5. **偵測 #4：Unused Paths**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`, `plugins/overtone/scripts/lib/paths.js`
   - 說明：掃描 `paths.js` 的 `module.exports` 中所有導出名稱，再 grep `plugins/overtone/` 下的 `.js` 檔案（排除 paths.js 自身和測試），找出「導出但沒人呼叫」的路徑函式/常數。

6. **偵測 #5：Duplicate Logic**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`, `plugins/overtone/hooks/scripts/**/*.js`
   - 說明：偵測 7 個 hook 腳本中的相似程式碼片段。策略：定義一組「已知重複模式」的 pattern（如 progressBar 計算、sessionId 取得、state 讀取等常見邏輯），grep 各 hook 檔案，找出同一 pattern 出現在 2+ 個 hook 中的情況。這是啟發式偵測（非 AST），容忍一定程度的 false positive。

7. **`/ot:audit` Skill**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/audit/SKILL.md`
   - 說明：建立 `/ot:audit` skill。流程：(1) 用 Bash 執行 `health-check.js` (2) 將 JSON findings 傳給 PM agent 分析 (3) PM 產出優先級分類和修復建議。Skill 使用 `disable-model-invocation: true`（純指引型）。

8. **單元測試**
   - 負責 agent：developer
   - 相關檔案：`tests/unit/health-check.test.js`
   - 說明：測試 5 個偵測函式的核心邏輯。需要 mock fs 操作或用 fixture 檔案模擬 phantom events、dead exports 等情境。每個偵測至少 2 個 test case（有問題 / 無問題）。

9. **整合測試**
   - 負責 agent：developer
   - 相關檔案：`tests/integration/health-check.test.js`
   - 說明：端到端執行 `health-check.js`，驗證 (a) 輸出是合法 JSON (b) 退出碼邏輯正確 (c) findings 結構符合預期格式。

## 開放問題

- **Duplicate Logic 的偵測精度**：純 grep 的啟發式偵測是否足夠？是否需要更精細的 token-level 比對？（建議 architect 評估，初版用 pattern-based grep 即可。）
- **Doc-Code Drift 的數字來源**：docs 中的數字散落在多個檔案（status.md、CLAUDE.md、spec/*.md），是否全部掃描還是只掃 status.md？（建議 architect 決定掃描範圍。）
- **health-check.js 的模組化程度**：5 個偵測函式是全部寫在一個檔案，還是每個偵測獨立模組放在 `scripts/lib/health/` 下？（建議 architect 決定，考量到零外部依賴和維護成本。）
- **findings 輸出格式**：JSON stdout 的具體 schema（severity、category、description 等欄位）需要 architect 定義，以確保 PM agent 能有效消費。
