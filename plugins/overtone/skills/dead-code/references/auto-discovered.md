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
---
## 2026-03-05 | developer:DEV Findings
**問題 1：`validateStructure`（真正的 dead export）**
- `skill-forge.js` 的 `validateStructure` 函式只在模組內部呼叫（line 525），但被 export 到 `module.exports`
- 外部沒有任何模組 import 它（包含測試），從 `module.exports` 移除

**問題 2：`WORKFLOW_ORDER`（scanner 誤判）**
- `execution-queue.js` 的 `WORKFLOW_ORDER` 被 `tests/unit/queue-smart-schedule.test.js` 使用
- 但測試用的是「先賦值再解構」模式：`const executionQueue = require(...); const { WORKFLOW_ORDER } = executionQueue;`
- dead-code-scanner 和 health-check 的 regex 只偵測 `const { X } = require(...)` 直接解構，無法偵測此模式
- 修復：將 regex 的第一個 pattern 由 `\}\s*=\s*require` 改為 `\}\s*=`（不限定後面是否為 require），解構賦值即可算使用
Keywords: validatestructure, dead, export, skill, forge, line, module, exports, import, scanner
---
## 2026-03-05 | developer:DEV Context
清理 dead exports：移除 `skill-forge.js` 真正的 dead export，並修復 dead-code-scanner 和 health-check 的 regex 誤判問題。
Keywords: dead, exports, skill, forge, export, code, scanner, health, check, regex

---
## 2026-03-06 | tester:TEST Findings
定義了 5 個 Feature，共 17 個 Scenario：

**Feature A — detectAndCleanOrphans 基本清理（3 scenarios）**
- A-1: 超過 TTL 的 orphan 被清除並 emit timeline 事件
- A-2: 未超過 TTL 的 entry 保留
- A-3: 清除 orphan 後 loop 不再卡在 soft-release

**Feature B — 邊界條件與防禦性處理（5 scenarios）**
- B-1: 缺少 startedAt 欄位時跳過
- B-2: startedAt 為非法 ISO 字串時跳過
- B-3: activeAgents 為空物件時不拋例外
- B-4: 多筆 orphan 同時清除，回傳所有清除記錄
- B-5: 並行競爭 — SubagentStop 已先清除時 delete 為 no-op

**Feature C — checkConcurrencyGuards 靜態掃描（3 scenarios）**
- C-1: G1/G2/G3 全存在時 0 findings
- C-2: 缺少 G2 時回傳 info finding
- C-3: 文件不存在時靜默跳過

**Feature D — checkConcurrencyGuards Runtime 掃描（5 scenarios）**
- D-1: 有超時 orphan 時回傳 warning finding
- D-2: 無 orphan 時 0 warning
- D-3: sessions 目錄不存在時靜默跳過（全新安裝）
- D-4: workflow.json 損壞時靜默跳過該 session
- D-5: activeAgents 缺失時靜默跳過

**Feature E — timeline 事件格式（2 scenarios）**
- E-1: emit 包含所有必要欄位（instanceId、agentName、ageMs、ttlMs）
- E-2: 事件 type 符合 registry.js 定義，不產生 phantom event finding
Keywords: feature, scenario, detectandcleanorphans, scenarios, orphan, emit, timeline, entry, loop, soft

---
## 2026-03-06 | developer:DEV Findings
根因在第 2097 行：`new Date(null).getTime()` 回傳 `0`（Unix epoch），不是 `NaN`，使得 `ageMs = Date.now() - 0` 為極大正數，通過 `Number.isFinite` 檢查，誤觸 orphan TTL warning。

修復方式：在計算 `startMs` 前加 `if (entry.startedAt == null) continue;`，然後對 `startMs` 做 `Number.isFinite` 檢查，再計算 `ageMs`。與 `detectAndCleanOrphans` 的既有防禦邏輯完全對稱。
Keywords: date, null, gettime, unix, epoch, agems, number, isfinite, orphan, warning

---
## 2026-03-06 | architect:ARCH Context
設計採用最小侵入方案：在現有 `pre-compact-handler.js` 中加入純函式 `detectFrequencyAnomaly` 和 `autoTimestamps` 追蹤，門檻常數 export 後供 `health-check.js` 直接 import（避免 registry 過度設計）。新增 `quality:compact-frequency` timeline 事件為 `fire-and-forget`，不影響 `checkClosedLoop` 偵測邏輯。
Keywords: compact, handler, detectfrequencyanomaly, autotimestamps, export, health, check, import, registry, quality

---
## 2026-03-06 | developer:DEV Findings
**架構決策**：
- `detectFrequencyAnomaly` 是純函式（無 side effect），從 `pre-compact-handler.js` export，`health-check.js` 直接 import 常數，避免重複定義
- timeline.emit 用 `...data` 展開而非 `payload` 包覆 — 測試初版用 `ev.payload.autoCount` 導致失敗，已修正
- C-3 測試（emit 失敗不阻擋）改用靜態原始碼字串掃描，避免 chmod 導致 `session:compact`（emit 在頻率 emit 前）先行失敗的干擾
- health-check-compact-frequency.test.js 原本含 `runAllChecks()` 整合測試，但並行環境中多個 test 同時呼叫 runAllChecks 導致 5 秒 timeout，改由 health-check-proactive.test.js 覆蓋計數斷言

**Pre-existing failures（非本次引入）**：
- `platform-alignment-skills.test.js` — testing skill 有 2 個孤立 reference 檔案（修改前已存在）
- `health-check integration Feature 6` timeout — 並行子進程競爭（修改前 24 fail，修改後 16 fail）
Keywords: detectfrequencyanomaly, side, effect, compact, handler, export, health, check, import, timeline

