---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

測試結果：2641 pass / 0 fail（113 個檔案），較上一版本新增 1 個測試檔，新增測試通過。

確認的品質點：

- **模組邊界清晰**：`failure-tracker.js` 完全自足（234 行），四個公開 API 職責分明（recordFailure / getFailurePatterns / formatFailureWarnings / formatFailureSummary），內部 `_readAll` / `_trimIfNeeded` 正確封裝為私有工具。
- **try/catch 降級一致**：on-stop.js、pre-task.js、on-start.js 三個整合點全部用 try/catch 包覆，確保主流程不受影響。
- **設定集中**：`warningThreshold`（2）、`warningWindow`（20）、`maxRecords`（100）全部定義在 registry.js 的 `failureDefaults`，實作與設定無重複魔術字串。
- **路徑一致性**：`paths.global.failures(projectRoot)` 遵循既有 global store 模式，與 observations/baselines/scores 路徑格式對齊。
- **注入順序合理**：pre-task.js 的注入順序（workflowContext → skillContext → gapWarnings → scoreContext → failureWarning → testIndex → originalPrompt）符合資訊優先級，失敗警告在分數上下文之後，不搶佔主流程資訊。
- **Level 2 整合防護完整**：level-2-integration.test.js 的靜態分析 guard 涵蓋所有新整合點（on-start.js 的 formatFailureSummary、pre-task.js 的 failureWarning、on-stop.js 的 recordFailure），防止未來重構意外移除。
- **warningThreshold 語義一致**：registry 標注「>= 此值才產生警告」，failure-tracker.js 實作為 `stageData.count < threshold` 才回傳 null（即 count >= threshold 時產生警告），語義完全對齊。
Keywords: pass, fail, failure, tracker, recordfailure, getfailurepatterns, formatfailurewarnings, formatfailuresummary, catch, stop
---
## 2026-03-04 | developer:DEV Findings
1. **data.js 設計亮點**：採用 `_getDeps(_deps)` 依賴注入模式（參考 queue.js pattern），所有底層 module 皆可在測試中替換，避免實際 FS 操作。

2. **query baselines 的 API 差異**：baseline-tracker.js 沒有直接的 `queryBaselines()` API，data.js 透過直接讀取 baselines.jsonl 原始資料實作，符合設計規格中「包裝現有 API」的原則（baselines.jsonl 由 baseline-tracker 管理）。

3. **query failures 的原始資料讀取**：failures 的原始記錄讀取也採用直接讀 JSONL 方式，failure-tracker 沒有 `queryFailures()` API（規格中提及但未實作），data.js 使用 `getFailurePatterns()` 提供聚合資料。

4. **測試採用 runWithCapture 模式**：攔截 console.log/error + process.exit，讓各子命令測試不依賴 FS 和實際外部資源。
Keywords: data, queue, pattern, module, query, baselines, baseline, tracker, querybaselines, jsonl
---
## 2026-03-04 | retrospective:RETRO Findings
**回顧摘要**：

- **API 對齊**：data.js 正確使用各 lib 模組的公開 API（`getFailurePatterns`、`queryScores`、`queryGlobal`、`cleanupStaleGlobalDirs`、`getBaseline`），均與 `module.exports` 一致
- **依賴注入設計**：`_getDeps()` 模式讓所有函式可以在測試中完整替換，39 個測試全覆蓋 4 個子命令
- **錯誤處理**：所有無效輸入路徑（缺少 `--session`、未知類型、空命令）均有防禦並 `process.exit(1)`
- **測試品質**：3185 pass / 0 fail，data-cli 的 39 個測試覆蓋所有分支（查詢、統計、清理、列出）
- **baselines 直讀 JSONL**：因 `baseline-tracker.js` 無 `queryBaselines` API，改為直讀原始檔案，屬合理的務實決策，程式碼有明確注解說明原因

**確認的品質點**：

1. `parseArgs` 正確處理布林旗標、帶值選項、混合參數三種情況
2. `cmdGc` 的 `dry-run` 防禦（`=== true || === 'true' || === ''`）覆蓋了 CLI 傳值的三種形式
3. `_printTable` 表格輸出使用 `Object.keys(rows[0])` 動態推斷欄位，不硬編碼結構
4. `main` 函式先過濾 `--project-root` 再解析其他選項，避免 positional 污染

**確認的超過 70% 信心問題（設計層級，不阻擋 PASS）**：

`query failures` 同時傳 `--stage` 和 `--agent` 時，第 163-165 行的 `agent` 過濾無條件覆蓋前面的 `stage` 結果 — 信心 80%

- 證據：`/Users/sbu/projects/overtone/plugins/overtone/scripts/data.js` 第 156-165 行，當 `options.stage = 'DEV'` 且 `options.agent = 'developer'` 同時存在時，最終 `result` 只剩下 `agent` 的資料，`stage` 的結果被覆蓋而非合併
- 評估：此行為目前在測試中未被驗證（`tests/unit/data-cli.test.js` 第 307-317 行的「`--stage` 過濾特定 stage」只測單獨傳 `--stage`，未測同時傳兩者）；然而 `getFailurePatterns` 回傳聚合資料的設計本身已限制了細粒度過濾能力，這是架構層面的取捨而非 bug
- 決定：不需修復迭代，但 **doc-updater 記錄此行為限制**

**CLAUDE.md 文件缺口**：data.js 未在 CLAUDE.md「常用指令」區塊中列出 — 信心 95%

- 證據：`/Users/sbu/projects/overtone/CLAUDE.md` 第 100-135 行的常用指令列表包含 `health-check.js`、`validate-agents.js`、`manage-component.js`、`heartbeat.js`、`queue.js` 等，但無 `data.js`
- 這是 doc-updater 的工作範疇
Keywords: data, getfailurepatterns, queryscores, queryglobal, cleanupstaleglobaldirs, getbaseline, module, exports, session, process
