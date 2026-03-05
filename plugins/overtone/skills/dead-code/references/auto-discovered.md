---
## 2026-03-03 | developer:DEV Findings
1. **Dead Exports 為零**：`dead-code-scanner.runDeadCodeScan()` 回傳 `unusedExports: []`、`orphanFiles: []`，health-check 確認 `dead-exports: passed: true`。任務 A 不需要任何改動。

2. **guard-system unit test 已完整**：`guard-system.js` 匯出 5 個 eval 函式和 1 個 `runFullGuardCheck`，全部在 `tests/unit/guard-system.test.js` 中有覆蓋（Feature 1-6）。此 test 同時被 `guard-coverage.test.js` 的 meta-guard 監控。

3. **測試計數**：2693 pass，0 fail，115 檔案，所有現有測試保持正常。

4. **任務原始描述基於舊狀態**：Handoff 提到「~50 個 dead exports」，但實際上在 v0.28.16 的 guard-system 整合時已清理完畢，`dead-code-scanner` 已加入 `ENTRY_POINT_BASENAMES` 避免誤判 orchestrator 模組。
Keywords: dead, exports, code, scanner, rundeadcodescan, unusedexports, orphanfiles, health, check, passed
---
## 2026-03-04 | tester:TEST Findings
測試結果摘要：88 passed（目標測試），3146 passed（完整套件）/ 0 failed

目標測試詳細：
- `tests/unit/session-cleanup.test.js` — 27 個測試全部通過（含新增的 `cleanupStaleGlobalDirs` 7 個場景 + `runCleanup` 整合測試）
- `tests/unit/global-instinct.test.js` — 36 個測試全部通過（`afterEach` 已加入 hash 目錄清理）
- `tests/unit/failure-tracker.test.js` — 25 個測試全部通過（`afterAll` 已加入 hash 目錄清理）

所有 BDD 驗收標準均已達成：
- 測試執行後 `~/.overtone/global/` 不殘留對應 hash 目錄（測試自行清理）
- `cleanupStaleGlobalDirs` 正確刪除超過 maxAgeDays 的孤兒 hash 目錄
- `dryRun: true` 模式回傳清單但不實際刪除
- `runCleanup` 整合入口正確呼叫三項清理（sessions / orphanFiles / globalDirs）
Keywords: passed, failed, tests, unit, session, cleanup, test, cleanupstaleglobaldirs, runcleanup, global
---
## 2026-03-04 | retrospective:RETRO Findings
**回顧摘要**：

整體實作品質良好。`cleanupStaleGlobalDirs()` 函式設計完整，`runCleanup()` 整合正確，測試覆蓋 11 個場景含 dry-run、混合場景、邊界情況。`global-instinct.test.js` 的 8 個 `afterEach` 清理補全避免了測試孤兒目錄洩漏。`failure-tracker.test.js` 的 `afterAll` 也正確清理 global hash 目錄。

然而，在跨模組整合層發現一個遺漏。
Keywords: cleanupstaleglobaldirs, runcleanup, global, instinct, test, aftereach, failure, tracker, afterall, hash
---
## 2026-03-04 | refactor-cleaner:REFACTOR Findings
**清理報告**：

- 未使用依賴：0 個（`gray-matter` 正常被 7 個模組使用）
- 未使用 exports：0 個（所有疑似死碼 exports 均有測試覆蓋，依規則保留）
- 未使用檔案：0 個

**工具輸出**：

- depcheck：因 npm cache 權限問題（`EACCES`）無法執行，改用手動 grep 分析
- health-check.js `dead-exports`：0 個問題
- bun test：3366 pass / 0 fail（151 files）

**掃描結果摘要**：

所有業務程式碼未使用的 exports 均有完整測試覆蓋（unit test），依照規則「不可刪除有 test 覆蓋但未被應用碼引用的 utility」，全數保留：

| 模組 | 業務0的 exports | 規則判定 |
|------|----------------|----------|
| `component-repair` | scanInconsistencies, autoRepair, 等 9 個 | 有測試，保留 |
| `docs-sync-engine` | scanDrift, fixDrift, 等 6 個 | 有測試，保留 |
| `hook-diagnostic` | extractScriptPaths 等 7 個 | 有測試，保留 |
| `guard-system` | runFullGuardCheck 等 6 個 | 有測試，保留 |
| `config-api` | validateAgent, validateHook, validateSkill | 有測試，保留 |
| `dead-code-scanner` | scanUnusedExports 等 5 個 | 有測試，保留 |
| `test-quality-scanner` | scanFile, detectEmptyTests 等 6 個 | 有測試，保留 |
| `baseline-tracker` | compareToBaseline | 有測試，保留 |
| `global-instinct` | decayGlobal, pruneGlobal | 有測試，保留 |
| `score-engine` | saveScore | 有測試，保留 |
| `session-cleanup` | cleanupStaleSessions, cleanupOrphanFiles | 有測試，保留 |

**驗證結果**：

- build: 不適用（此專案無 build 步驟）
- test: 3366 pass / 0 fail
Keywords: gray, matter, exports, depcheck, cache, eacces, grep, health, check, dead
---
## 2026-03-05 | developer:DEV Findings
1. **段落級移除策略**：以空行（`\n\s*\n`）分段，對每個段落比對預設 + 自訂 pattern，匹配即整段移除。設計文件的 ADR-3 明確要求純函式、無 I/O 依賴 — 已完全遵守。

2. **BDD 偏差澄清**：
   - BDD Scenario 2-4 描述的是 `isEmpty` 行為，`minLength` 選項預設 50（設計文件 API 規格）。
   - 設計文件 API 說 `removedCount: number` 但設計文件的 GeneralizeResult schema 說 `removed: string[]`。實作採用 `removed: string[]`（設計文件內文），因為 `removed.length` 即可取得 count，且 debug 時能查看被移除的內容。

3. **`generalizeEntries` 行為**：只處理 `qualified=true` 的條目（符合 BDD Scenario 2-6 規格）。注意：根據 BDD 規格 generalizeEntries **不**過濾掉 isEmpty 的條目 — 過濾邏輯由上層（T4 evolution.js internalize）決定，generalizeEntries 只負責過濾 qualified=false。

4. **Pattern 設計**：
   - Session ID pattern（`/\b[0-9a-f]{8,}\b/`）可能誤匹配較長的十六進制字串（如 SHA），這是設計上的合理取捨。
   - `import ... from '...'` 的 pattern 採用 `\s+.*\s+` 避免過度貪婪。
Keywords: pattern, scenario, isempty, minlength, removedcount, number, generalizeresult, schema, removed, string
---
## 2026-03-05 | planner:PLAN Context
使用者需要擴充 queue.js CLI 的個別項目操作能力。現有 CLI 只有批次操作（add/append/clear）和唯讀查詢（list），缺乏對單一佇列項目的精細控制。核心場景：佇列中某項目失敗，目前只能重建整個佇列，操作成本過高。

新增五個子命令：`insert`（位置插入）、`remove`（by name 刪除）、`move`（移動位置）、`info`（單項詳情）、`retry`（failed 重標 pending）。
Keywords: queue, append, clear, list, insert, remove, name, move, info, retry
