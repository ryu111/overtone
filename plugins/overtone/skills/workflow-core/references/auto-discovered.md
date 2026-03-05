---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：
1. **分析 plugin 結構並輸出 design.md** | agent: architect | files: `agents/*.md`、`skills/*/SKILL.md`、`scripts/lib/registry-data.json`、`hooks/scripts/**/*.js`
2. **實作 `dependency-graph.js` 核心模組** | agent: developer | files: `plugins/overtone/scripts/lib/dependency-graph.js`（新建）
3. **實作 `impact.js` CLI 入口**（parallel with 2，API 定義清楚後） | agent: developer | files: `plugins/overtone/scripts/impact.js`（新建）
4. **撰寫 BDD 驗收測試** | agent: tester | files: `tests/unit/dependency-graph.test.js`（新建）

**優先順序**：
- Phase 1（序列）：architect 完成 design.md — 確認 SKILL.md 格式一致性、require() 路徑正規化策略、API 簽名
- Phase 2（並行）：developer 實作 dependency-graph.js（核心）+ impact.js（CLI）可並行，因 API 在 design.md 定義清楚後兩者互不依賴
- Phase 3（序列）：tester 撰寫驗收測試，需要 dependency-graph.js 已存在

**範圍邊界**：
- 不含：Command → Agent 引用解析（自由文字，v2）
- 不含：整合進 pre-edit-guard（dependency-graph-core 穩定後下一步）
- 不含：持久化快取、循環依賴偵測、視覺化輸出
Keywords: plugin, design, agent, architect, files, agents, skills, skill, scripts, registry

---
## 2026-03-05 | planner:PLAN Context
**需求分析**：Overtone 的閉環機制目前仰賴人工記憶，`pre-edit-guard` 只能給通用提示。目標是建立 `scripts/lib/dependency-graph.js` 掃描 plugin 結構，產生雙向依賴圖，再透過 `scripts/impact.js` CLI 提供對外查詢介面。這是閉環完整性的自動化升級，不是新功能，是對現有製作規範缺口的補全。

**四類資料來源**（已確認各來源位置）：
1. `agents/*.md` frontmatter 的 `skills` 欄位（gray-matter 解析）
2. `skills/*/SKILL.md` 的 Reference 索引表（各 SKILL.md 格式需 architect 確認一致性）
3. `scripts/lib/registry-data.json` 的 `stages[stage].agent` 欄位（JSON，已確認格式清楚）
4. `hooks/scripts/**/*.js` 的 `require()` 呼叫（需路徑正規化）
Keywords: overtone, edit, guard, scripts, dependency, graph, plugin, impact, agents, frontmatter

---
## 2026-03-05 | architect:ARCH Findings
**技術方案**：
- on-demand 掃描（每次呼叫重新掃描所有 plugin 元件），不持久化
- 雙向索引：`dependencies`（X→Y）和 `dependents`（Y→X）同步維護
- 四類掃描器獨立實作，組合成完整圖

**Open Questions 解答**：
1. **SKILL.md Reference 表格格式**：有 2 欄和 4 欄兩種，但路徑格式一致（`` `${CLAUDE_PLUGIN_ROOT}/skills/...` ``）。掃描策略：regex 全文掃描，pattern 為 `` /`\${CLAUDE_PLUGIN_ROOT}\/skills\/[^`]+`/g ``
2. **路徑參數慣例**：相對路徑（相對於 plugin root）。CLI 支援絕對路徑輸入（自動轉換）
3. **require() 正規化**：`path.resolve(hookDir, relativePath)` → `path.relative(pluginRoot, absPath)` → 加 `.js`，只收錄 plugin root 下的依賴
4. **Commands 依賴**：不納入 v1（自由文字，複雜度高），列為 v2

**API 介面**：
- `buildGraph(pluginRoot: string): DependencyGraph`
- `graph.getImpacted(path: string): ImpactResult`（`{ path, impacted: [{ path, type, reason }] }`）
- `graph.getDependencies(path: string): string[]`
- `graph.getRawGraph(): RawGraph`
- CLI：`bun scripts/impact.js <path> [--deps] [--json]`

**資料模型**：
- 內部：`Map<string, Set<string>>`（dependencies + dependents 雙向）
- 對外：plain object（JSON 可序列化）
- 無持久化，純記憶體

**檔案結構**：
- 新增：`plugins/overtone/scripts/lib/dependency-graph.js`（核心模組）
- 新增：`plugins/overtone/scripts/impact.js`（CLI 入口）
- 新增：`tests/unit/dependency-graph.test.js`（BDD 測試）

**Dev Phases**：

    ### Phase 1: 核心模組 + CLI (parallel)
    - [ ] 實作 dependency-graph.js（buildGraph + 四類掃描器） | files: plugins/overtone/scripts/lib/dependency-graph.js
    - [ ] 實作 impact.js CLI（參數解析 + 格式化輸出） | files: plugins/overtone/scripts/impact.js

    ### Phase 2: 測試 (sequential)
    - [ ] 撰寫 BDD 驗收測試（3 場景） | files: tests/unit/dependency-graph.test.js
Keywords: demand, plugin, dependencies, dependents, open, questions, skill, reference, skills, regex

---
## 2026-03-05 | code-reviewer:REVIEW Findings
**1. [M] 遺漏檔案：impact.js 未被 commit**
- 檔案：`plugins/overtone/scripts/impact.js`
- 描述：Handoff 聲明三個檔案（dependency-graph.js、impact.js、test），但 impact.js 是 untracked（`git status` 顯示 `??`），未包含在 commit 中。
- 影響：BDD Feature 9 的全部 6 個 scenario（CLI 入口）缺少對應的已提交程式碼。
- 建議修法：將 impact.js 加入 commit。
- 信心：100%

**2. [M] 測試缺口：Feature 9（impact.js CLI）完全無測試覆蓋**
- 檔案：`tests/unit/dependency-graph.test.js`
- 描述：BDD spec 定義了 Feature 9 的 6 個 CLI scenario（9-1 ~ 9-6），但測試檔案中完全沒有 Feature 9 的測試。測試檔案涵蓋 Feature 1-8 和 Feature 10，唯獨跳過 Feature 9。
- 影響：CLI 的路徑正規化、`--deps`/`--json` flag 組合、退出碼、pluginRoot 自動偵測等行為完全未驗證。
- 建議修法：新增 Feature 9 的整合測試，使用 `Bun.spawn` 或 `child_process.execSync` 執行 `bun scripts/impact.js` 並驗證 stdout/退出碼。
- 信心：100%
Keywords: impact, commit, plugins, overtone, scripts, handoff, dependency, graph, test, untracked

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. 實作 `websocket.js` CLI 腳本 | agent: developer | files: `plugins/overtone/scripts/os/websocket.js`
   - 三個子命令：`connect`、`send`、`listen [--duration <ms>]`
   - Bun 原生 WebSocket API + 依賴注入模式（`_deps = { WebSocket }`）
   - JSON 輸出格式（結構化，agent 可 parse）
   - 錯誤碼：`INVALID_ARGUMENT` / `CONNECTION_FAILED` / `TIMEOUT` / `SEND_FAILED`
   - 不 throw，所有錯誤以 `{ ok: false, error, message }` 回傳

2. 撰寫 `realtime.md` 參考文件 | agent: developer | files: `plugins/overtone/skills/os-control/references/realtime.md`
   - 使用場景說明（何時用 WebSocket vs HTTP）
   - 三個子命令的 CLI 範例
   - 輸出格式解析指引（agent 看懂 JSON 欄位意義）
   - 常見場景：幣安行情、IoT 訊號、即時通知

3. 更新 SKILL.md 索引 | agent: developer | files: `plugins/overtone/skills/os-control/SKILL.md`
   - `realtime.md` 條目狀態更新（P3.5 ✅）
   - 確認「按需讀取」章節的 realtime.md 指引完整

4. 撰寫 `websocket.test.js` | agent: tester（TEST 階段）| files: `tests/unit/websocket.test.js`
   - mock WebSocket 依賴注入
   - 情境覆蓋：正常連線、訊息接收、逾時、無效 URL、連線失敗
   - 對齊 bdd.md BDD 情境（由 TEST:spec 階段產出）

**優先順序**：

- 第一優先：子任務 1（websocket.js）— 核心能力，其他均依賴它的 API 設計
- 子任務 2 和 3 在 websocket.js API 設計確定後可**並行**進行（文件和 SKILL.md 索引互不影響）
- 子任務 4（測試）依賴 BDD 規格（TEST:spec 階段輸出），在 DEV 後驗證

**範圍邊界**：

- 明確不做：TTS（`tts.js`）、STT（`stt.js`）、Guard 擴充
- 明確不做：重連邏輯、訊息佇列、Binary frame 支援
- roadmap.md 中 P3.5 的 `tts.js` 和 `stt.js` 為後續獨立迭代
Keywords: websocket, agent, developer, files, plugins, overtone, scripts, connect, send, listen

---
## 2026-03-05 | planner:PLAN Context
**需求**：實作 Overtone P3.5 WebSocket 能力（websocket-realtime），讓 agent 透過 Bash tool 建立 WebSocket 連線進行即時通訊。

**為什麼**：Phase 4 交易場景驗收條件明確要求「WebSocket 接收即時幣安行情」，本次提前（在 P3.4 操控層之前）交付 WebSocket 能力以鋪路。PM Discovery 認定此為優先子項。

**範圍**：遵循已驗證的 P3.x 閉環交付模型（腳本 + Reference + SKILL.md 索引 + 測試），不做 TTS/STT/Guard 擴充。
Keywords: overtone, websocket, realtime, agent, bash, tool, phase, discovery, reference, skill

---
## 2026-03-05 | product-manager:PM Findings
**目標用戶**：個人 dogfooding（Product Owner 自己），場景為讓 Overtone 自主建構新領域能力（Acid Test：自動交易系統）。

**成功指標**：
- 系統能自主偵測「缺少交易相關 skill」並建議建立
- 系統能用 manage-component.js 自主建立 skill + agent，且通過閉環檢查
- 整個過程無需人工編寫 skill/agent prompt

**方案比較**：

| 維度 | 方案 A：繼續完成 P3.4-P3.6 | 方案 B：跳到 Phase 4 進化引擎 PoC | 方案 C：混合 -- P3.6 精簡版 + 進化引擎 PoC |
|------|---|---|---|
| 概述 | 按原 roadmap 依序完成 P3.4/P3.5/P3.6 | 跳過 P3.4/P3.5，直接做 Level 3 進化引擎 | P3.6 只做 Guard 精鍊 + health-check 擴展，然後做進化引擎 |
| 優點 | Phase 3 完整收尾，roadmap 一致性；OS 能力齊全 | 直接觸及最高價值目標；現有零件可串聯；ROI 最高 | 安全基礎紮實後再開放自我修改；風險較低 |
| 缺點 | P3.4 keyboard/mouse 對 Phase 4 無貢獻（codebase 佐證：Acid Test 是 API 交易，不需要 UI 操控）；延遲最高價值工作 | P3.4/P3.5/P3.6 變成技術債；E2E 安全驗證未做就開放自我修改 | 工作量略多於方案 B |
| 工作量 | 8-12 人天（P3.4: 3-5 + P3.5: 1-2 + P3.6: 3-5） | 5-8 人天 | 6
Keywords: dogfooding, product, owner, overtone, acid, test, skill, manage, component, agent

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. Guard 精鍊：pre-bash-guard.js 新增 OS 相關危險命令黑名單 | agent: developer | files: `plugins/overtone/hooks/scripts/tool/pre-bash-guard.js`

2. Guard 測試更新 | agent: developer | files: `tests/unit/pre-bash-guard.test.js`（或對應路徑）

3. health-check 擴展：checkOsTools() 新增 screencapture 偵測 + heartbeat daemon 狀態偵測 | agent: developer | files: `plugins/overtone/scripts/health-check.js`

4. health-check 測試更新 | agent: developer | files: `tests/unit/health-check.test.js` 或整合測試

5. os-control SKILL.md 狀態標記更新 | agent: developer | files: `plugins/overtone/skills/os-control/SKILL.md`（受 pre-edit-guard 保護，需 manage-component.js）

6. OS 腳本整合測試（新建）| agent: developer | files: `tests/integration/os-scripts.test.js`

**優先順序**：

- 任務 1+2 可並行於任務 3+4（操作不同檔案，無邏輯依賴）
- 任務 5 獨立（SKILL.md 更新不依賴其他任務）
- 任務 6 獨立（整合測試覆蓋已有功能，不依賴 guard 或 health-check 變化）
- 因此可三組並行：{1,2} + {3,4} + {5,6}

**範圍邊界**：

- 明確不在此次範圍：P3.4 操控層（keyboard/mouse/applescript/computer-use）、截圖→理解→操作→驗證完整 E2E
- fswatch 外部工具偵測不需要新增（fswatch.js 使用 Node.js `fs.watch()` 原生 API，無外部 CLI 依賴）
Keywords: guard, bash, agent, developer, files, plugins, overtone, hooks, scripts, tool

---
## 2026-03-05 | code-reviewer:REVIEW Findings
**1. [M] 邏輯不一致：`defaults write` 的 label 與實際行為不符**

檔案：`/Users/sbu/projects/overtone/plugins/overtone/hooks/scripts/tool/pre-bash-guard.js` 第 67 行

```javascript
{ pattern: /\bdefaults\s+(delete|write)\b/, label: '刪除系統偏好設定' },
```

pattern 同時匹配 `defaults delete` 和 `defaults write`，但 label 只寫「刪除系統偏好設定」。`defaults write` 的行為是「修改」而非「刪除」。註解（第 19 行、第 30 行）正確寫了「刪除或修改」，但 label 只有「刪除」。

影響：測試 `tests/integration/pre-bash-guard.test.js` 第 176 行驗證 `defaults write NSGlobalDomain` 的 deny reason 期望包含「刪除系統偏好設定」，雖然測試通過（因為 label 確實是這個字串），但呈現給使用者的攔截原因描述不正確 -- 使用者執行 `defaults write` 被告知「刪除系統偏好設定」會造成困惑。

建議：label 改為 `'修改或刪除系統偏好設定'`，測試的 expect 也同步更新。信心：90%。

**2. [M] 語法錯誤：SKILL.md 平台偵測範例缺少引號**

檔案：`/Users/sbu/projects/overtone/plugins/overtone/skills/os-control/SKILL.md` 第 45 行

```
- macOS：`process.platform === darwin`
```

修改前是 `'darwin'`（有引號），修改後引號被移除了。這是一個 JavaScript 比較語句，`process.platform === darwin` 在 JS 中 `darwin` 是未定義變數而非字串。作為文件中的範例程式碼，這會誤導 Agent 寫出有 bug 的程式碼。

建議：改回 `process.platform === 'darwin'`。信心：95%。

**3. [m] 測試與 spec 的 API 名稱不一致**

`os-scripts.test.js` 的函式名稱與 BDD spec 有偏差：
- BDD spec Feature 6 Scenario 1 寫 `takeScreenshot({ type: 'full' })`，測試使用 `captureFullScreen()`
- BDD spec Feature 6 Scenario 2 寫 `getWindowList()`，測試使用 `listProcesses()`
- BDD spec Feature 6 Scenario 4 寫 `getSystemInfo()`，測試使用 `getMemoryInfo()`

測試已加註解說明差異原因（模組實際匯出名稱不同），且功能等價。這屬於 spec 與實作 API 名稱的漂移，不影響功能覆蓋。
Keywords: defaults, write, label, users, projects, overtone, plugins, hooks, scripts, tool

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. **建立 gap-analyzer.js 核心模組** | agent: developer | files: `plugins/overtone/scripts/lib/gap-analyzer.js`（新增）
   - 整合信號源：health-check 的 `checkComponentChain` + `checkCompletionGap` + `checkDependencySync` + `checkClosedLoop`（已有 module.exports）
   - 統一 Gap 格式：`{ type, severity, file, message, suggestion }`
   - suggestion 含 manage-component.js 指令 skeleton

2. **建立 evolution.js CLI 入口** | agent: developer | files: `plugins/overtone/scripts/evolution.js`（新增）
   - 支援 `analyze [--json]`
   - 純文字報告 + JSON 模式雙輸出
   - exit code：有缺口 1，無缺口 0

3. **撰寫 gap-analyzer.js unit tests** | agent: tester | files: `tests/unit/gap-analyzer.test.js`（新增）
   - 使用暫存目錄 fixture，驗證各缺口類型偵測和 suggestion 格式

4. **撰寫 evolution.js CLI 整合測試**（可與 3 並行）| agent: tester | files: `tests/integration/evolution-analyze.test.js`（新增）
   - 驗證 JSON schema、exit code、--json flag 行為

**優先順序**：
- 1 → 2（CLI 依賴 lib）
- 3 和 4 依賴 1+2，但 3 和 4 可並行
- 整體：序列 [1 → 2]，然後並行 [3, 4]

**範圍邊界**：
- 不做 P4.2 自動執行建議
- 不修改 health-check.js / fix-consistency.js / dependency-graph.js
- knowledge-gap-detector.js 的 AI 語意分析缺口不在此次範圍
- fix-consistency.js 不需要新增 module.exports（health-check 已匯出 `checkDependencySync` 已足夠）
Keywords: analyzer, agent, developer, files, plugins, overtone, scripts, health, check, checkcomponentchain

---
## 2026-03-05 | developer:DEV Findings
1. **health-check 匯出確認**：四個目標函式（checkComponentChain, checkClosedLoop, checkCompletionGap, checkDependencySync）已在 health-check.js 底部 `module.exports` 中正確匯出，無需修改現有檔案。

2. **checkCompletionGap 參數注意**：此函式接受 `skillsDirOverride`（skills 目錄路徑），非 pluginRoot。gap-analyzer.js 中已正確計算：`const skillsDir = pluginRoot ? path.join(pluginRoot, 'skills') : undefined`。

3. **checkClosedLoop 無 pluginRoot 參數**：此函式直接使用 registry，無法透過參數覆寫路徑。這是 health-check.js 的既有設計，不影響功能。

4. **實際測試**：現有 plugin 環境下 `analyzeGaps()` 回傳 0 個缺口（系統健康），符合預期。`pluginRoot: '/nonexistent/path'` 測試回傳 16 個缺口（component-chain 和 dependency-sync 掃描到錯誤路徑下的結果被計入），不拋例外，結構完整。

5. **BDD 覆蓋**：五種 GapType 映射、三種 severity、去重邏輯、checks 過濾、pluginRoot 不存在優雅降級、CLI 輸出格式均已實作。
Keywords: health, check, checkcomponentchain, checkclosedloop, checkcompletiongap, checkdependencysync, module, exports, skillsdiroverride, skills

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. 擴展 gap-analyzer.js — 新增 fixable + fixAction 欄位 | agent: developer | files: `plugins/overtone/scripts/lib/gap-analyzer.js`

2. 實作 gap-fixer.js — lib 層修復執行邏輯（新建）| agent: developer | files: `plugins/overtone/scripts/lib/gap-fixer.js` — 可與子任務 1 並行（需等 1 定義完 fixAction 格式）

3. 更新 evolution.js — 新增 fix 子命令 | agent: developer | files: `plugins/overtone/scripts/evolution.js` — 依賴 1、2 完成

4. 新增 unit 測試 — gap-analyzer 新欄位 + gap-fixer | agent: developer | files: `tests/unit/gap-analyzer.test.js`（擴展）、`tests/unit/gap-fixer.test.js`（新建）— 4 可與 2 並行

5. 新增 integration 測試 — evolution.js fix 子命令 | agent: developer | files: `tests/integration/evolution-fix.test.js`（新建）— 依賴 3 完成

**優先順序**：

- 子任務 1 先做（定義 fixable/fixAction 格式，是後續的依據）
- 子任務 2 和 4 的 unit 測試部分可在 1 完成後並行
- 子任務 3 依賴 1+2，完成後執行 5

**範圍邊界**：

- missing-skill / broken-chain / missing-consumer 不自動修復，只顯示建議
- fix-consistency.js 的核心邏輯不修改（只呼叫）
- manage-component.js 不修改
- 不做互動式修復模式
Keywords: analyzer, fixable, fixaction, agent, developer, files, plugins, overtone, scripts, fixer

---
## 2026-03-05 | planner:PLAN Context
P4.2 目標是為 gap-analyzer 的偵測結果新增自動執行層。使用者執行 `bun scripts/evolution.js fix` 後，系統自動修復 `sync-mismatch`（SKILL.md 消費者表不一致）和 `no-references`（skill 缺少 references 目錄）兩種可安全修復的缺口，並重新驗證缺口是否消失。安全邊界：預設 dry-run，需明確加旗標才真正執行；不自動建立 agent 或 skill。
Keywords: analyzer, scripts, evolution, sync, mismatch, skill, references, agent

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. **掃描所有決策點來源，整理原始資料** | agent: developer | files: `plugins/overtone/scripts/lib/registry.js`, `pre-task-handler.js`, `agent-stop-handler.js`, `session-stop-handler.js`, `skills/pm/SKILL.md`, `skills/workflow-core/references/failure-handling.md`, `docs/spec/overtone-工作流.md`

2. **撰寫 `docs/spec/overtone-decision-points.md`**（依賴 1）| agent: developer | files: `docs/spec/overtone-decision-points.md`（新建）

3. **更新 `docs/spec/overtone.md` 規格索引**（依賴 2）| agent: developer | files: `docs/spec/overtone.md`

**優先順序**：1 → 2 → 3 序列執行（各有依賴），整體為單一 DEV 任務，不需拆成多個 subagent。

**範圍邊界**（明確不在此次範圍）：
- 程式化 Decision Registry（JSON 可查詢結構）
- health-check 整合 checkDecisionPoints
- 18 個 workflow 的完整 Mermaid 狀態機（只做 standard）
- timeline event 發射/消費索引
Keywords: agent, developer, files, plugins, overtone, scripts, registry, task, handler, stop

---
## 2026-03-05 | planner:PLAN Context
**需求**：建立 `docs/spec/overtone-decision-points.md`，將 Overtone 控制流決策點從 6 個散落的層次（registry.js、SKILL.md、pre-task-handler.js、agent-stop-handler.js、session-stop-handler.js、hooks.json）整合成單一可查詢的索引文件。

**為什麼**：設計者目前需要逐一翻讀多個 handler 才能回答「某 stage 結束後系統做什麼」。這份索引的目標是讓任何決策點在 30 秒內可定位，以及讓新功能設計時能快速判斷是否需要新增 user gate。

**PM 已定義的 MVP 範圍（MoSCoW Must）**：
- User Gate 索引（decision tree 格式）
- 自動決策索引（表格格式）
- Stage 轉場摘要（按 workflow 類型）
- standard workflow Mermaid 狀態圖
Keywords: docs, spec, overtone, decision, points, registry, skill, task, handler, agent

---
## 2026-03-05 | architect:ARCH Findings
**技術方案**：

- 純文件方案，新建 `docs/spec/overtone-decision-points.md`
- 5 個 Section：User Gate 索引、自動決策索引、Stage 轉場摘要、Standard Workflow 狀態圖、快速查找索引
- 不引入新的程式模組，不需要測試

**Open Questions 解答**：

- Q1 (entry schema)：統一格式含 Gate ID / 觸發條件 / 觸發時機 / 呈現方式 / Handler 位置 / 選項列表。`呈現方式` 欄位區分「正常互動 gate」（AskUserQuestion）與「異常介入 gate」（停止並等待）。
- Q2 (Mermaid 粒度)：主幹路徑 + subgraph 包圍 retry loop，圖外文字說明重試上限。使用 `stateDiagram-v2` + `<<fork>>`/`<<join>>` 語法。
- Q3 (佇列控制流定位)：納入 Section 二「自動決策索引」的獨立子節 2.4，不與 loop 決策混合。

**User Gate 清單（5 個，UG-01 ~ UG-05）**：
- UG-01：Discovery 模式使用者確認（pm/SKILL.md L84-92）
- UG-02：規劃模式確認（pm/SKILL.md L109-113）
- UG-03：TEST FAIL 上限 3 次（failure-handling.md L31-47）
- UG-04：REVIEW REJECT 上限 3 次（failure-handling.md L61-73）
- UG-05：RETRO ISSUES 上限 3 次（failure-handling.md L119-125）

**自動決策來源**：
- PreToolUse 阻擋：`pre-task-handler.js` L142-172（前置 stage 未完成 → deny）
- SubagentStop 收斂：`agent-stop-handler.js` L100-138（fail/reject 立即標記；全 pass 收斂；PM stage 完成 → 寫佇列）
- Stop hook 退出（7 級優先順序）：`session-stop-handler.js` L152-270
- 佇列控制流：`session-stop-handler.js` L119-218（completeCurrent + getNext + decision:block）

**Stop hook 7 級退出優先順序**（Section 2.3 核心內容）：
1. loopState.stopped → 手動退出
2. iteration >= 100 → 最大迭代退出
3. consecutiveErrors >= 3 → 連續錯誤退出
4. allCompleted + hasFailedStage → workflow abort
5. allCompleted + !hasFailedStage → workflow complete（→ 觸發佇列邏輯）
6. nextStage === 'PM' → 不阻擋（PM 互動模式）
7. 其他 → decision: block（loop 繼續）

**Stage 轉場摘要資料**（來自 registry.js L46-80）：
- 18 個 workflow，3 個並行群組（quality/verify/secure-quality）
- 詳見 design.md 中各 Section 格式規範

**API 介面**：無（純文件任務）

**資料模型**：無（純文件任務）

**檔案結構**：

```
新增：
  docs/spec/overtone-decision-points.md   <- 控制流決策點索引（主要產出）

修改：
  docs/spec/overtone.md                   <- 加入 overtone-decision-points.md 引用

Specs：
  specs/features/in-progress/decision-point-index/design.md   <- 已建立
  specs/features/in-progress/decision-point-index/tasks.md    <- 已建立
```

**Dev Phases**：所有子任務線性依賴（撰寫文件 → 更新索引），無並行可能，省略 Dev Phases 區塊。
Keywords: docs, spec, overtone, decision, points, section, user, gate, stage, standard

---
## 2026-03-05 | developer:DEV Findings
1. **實際行號與 BDD spec 記載一致**：session-stop-handler.js 的 7 級退出條件優先順序（L152 手動退出 → L158 最大迭代 → L165 連續錯誤 → L172 allCompleted → L227 PM 特例 → L244 block）與 BDD scenario 描述吻合。

2. **UG-05（RETRO ISSUES）與 UG-03/04 的本質差異**：UG-05 不是 workflow abort，而是「停止迭代、繼續 workflow」— 文件中特別標注此差異避免誤解。

3. **PM Gate 分拆為 UG-01 和 UG-02**：UG-01 是 discovery workflow 的 AskUserQuestion 互動，UG-02 是 `/ot:pm plan` 的「寫佇列後停止」，兩者呈現方式不同（前者 AskUserQuestion，後者靜默停止）。

4. **Mermaid 語法**：使用 `stateDiagram-v2` + `<<fork>>` / `<<join>>` 語法。`retry_test` 用 `state retry_test {}` subgraph 包圍修復迴圈，符合 BDD 要求。

5. **BDD 第 2 個 scenario（PM 佇列控制流與程式碼一致）**：agent-stop-handler.js L178-188 對應 PM stage 完成後解析佇列表格，session-stop-handler.js L196-218 對應 queueCompleted + getNext decision:block — 均已在 2.4 節詳細描述。
Keywords: spec, session, stop, handler, allcompleted, block, scenario, retro, issues, workflow

---
## 2026-03-05 | code-reviewer:REVIEW Findings
審查了 `docs/spec/overtone-decision-points.md`（新建 358 行）和 `docs/spec/overtone.md`（+1 行引用）。主要檢查：
- 抽查所有標註的 Handler 行號（pm/SKILL.md、session-stop-handler.js、agent-stop-handler.js、pre-task-handler.js、failure-handling.md），全部與實際程式碼一致
- Stop hook 7 級退出優先順序與 session-stop-handler.js if-else 順序完全吻合
- 18 個 workflow 定義與 registry.js L46-72 完全對齊
- 佇列控制流描述（completeCurrent + getNext + decision:block）與實際邏輯一致
- Mermaid stateDiagram-v2 語法正確
- overtone.md 引用行格式一致

無高信心問題。
Keywords: docs, spec, overtone, decision, points, handler, skill, session, stop, agent

---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

- 文件內容與程式碼原始碼高度一致：所有 18 個 workflow 的 key、中文標籤、stages 序列、parallelGroups 均與 `/Users/sbu/projects/overtone/plugins/overtone/scripts/lib/registry.js` L46-80 對齊
- User Gate 五個 entry（UG-01 ~ UG-05）的觸發條件、handler 位置（含行號）與實際程式碼路徑一致
- 自動決策索引（2.1 PreToolUse / 2.2 SubagentStop / 2.3 Stop hook / 2.4 佇列控制流）的決策樹描述與各 handler 程式碼邏輯吻合
- `overtone.md` 已在 L35 正確加入引用，說明文字包含「控制流決策點」關鍵字
- 快速查找索引提供 14 個情境，超過 BDD spec 最低要求（7 個），覆蓋範圍完整
- Mermaid 狀態圖語法有效（`stateDiagram-v2`、`<<fork>>`、`<<join>>`、retry 迴圈 `state retry_test`），結構正確
- 純文件任務採用 BDD spec 驗證文件結構完整性與程式碼一致性的做法合適，且可重現（tester 18/18 PASS）
Keywords: workflow, stages, parallelgroups, users, projects, overtone, plugins, scripts, registry, user

---
## 2026-03-05 | doc-updater:DOCS Findings
**文件同步完成：**

1. ✅ `docs/spec/overtone-decision-points.md` — DEV 已新建，內容完整（v1.0，293 行）
   - 五個維度：User Gate × 自動決策 × Stage 轉場 × Standard Workflow 狀態圖 × 快速查找索引
   - 已對照原始碼驗證（session-stop-handler.js、pre-task-handler.js、agent-stop-handler.js、registry.js）

2. ✅ `docs/spec/overtone.md` — 文檔目錄已正確新增引用（L35）
   - 無需修改，DEV 已完成

3. ✅ `docs/status.md` — 文檔索引表更新
   - 新增「決策點」列：`docs/spec/overtone-decision-points.md`
   - 順帶修正：「願景」說明「四層」→「五層」（對照 vision.md）

4. ✅ `CLAUDE.md` — 關鍵文件表更新
   - 新增決策點索引行：「控制流決策點快查（30 秒找到任意決策點）」
   - 置於 overtone.md 之後、status.md 之前（邏輯順序：規格 → 決策點查詢 → 現況 → SoT）
Keywords: docs, spec, overtone, decision, points, user, gate, stage, standard, workflow

---
## 2026-03-05 | product-manager:PM Findings
**目標用戶**：Overtone 開發者（個人 dogfooding），在面對新領域時需要系統自主建構能力堆疊。

**成功指標**：
- L3.3：score < 0.2 的 prompt 自動觸發 Skill Forge，成功率 >= 80%
- L3.4：PM 訪談產出的 Project Spec 包含 >= 10 個 BDD 場景
- L3.5：收到高層目標後，系統自主完成能力盤點 + 排程 + 迭代，人工介入 <= 2 次
- L3.7：專案完成後 skill 通用化 + 納入永久庫的自動化率 >= 90%
- 10 次迭代後，系統指標可量化改善（測試覆蓋率、health-check 通過項、skill 完整度）

**方案比較**：

| 維度 | 方案 A：按 Roadmap 順序 | 方案 B：依賴優化順序 | 方案 C：先清理再建新 |
|------|------------------------|---------------------|---------------------|
| 概述 | L3.3 -> L3.4 -> L3.5 -> L3.7 -> 10x 優化 | L3.4 -> L3.3 -> L3.5 -> L3.7 -> 10x 優化（PM 先行） | 5x 清理/重構 -> L3
Keywords: overtone, dogfooding, score, prompt, skill, forge, project, spec, health, check

---
## 2026-03-05 | product-manager:PM Context
Overtone 已完成 L1（核心大腦）和 L2（感知操控），目前在 L3（自我進化）。L3.1-3.2（Gap Detection + Auto-Fix）已完成。使用者需要完成 L3 剩餘能力（L3.3 Skill Forge、L3.4 深度 PM、L3.5 Project Orchestrator、L3.7 Skill Internalization），加上 10 次自我優化迭代和技術棧清理。

核心問題不是「能不能做」而是「用什麼順序做最高效」。Codebase 分析顯示基礎設施覆蓋率高，許多模組只需串接而非重寫。
Keywords: overtone, detection, auto, skill, forge, project, orchestrator, internalization, codebase

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. **interview.js 引擎核心**（新建）
   | agent: developer | files: `plugins/overtone/scripts/lib/interview.js`
   建立訪談狀態機，純函式模組，API：`init` / `nextQuestion` / `recordAnswer` / `isComplete` / `generateSpec`

2. **Project Spec 模板**（新建）— 可與任務 1 並行
   | agent: developer | files: `plugins/overtone/skills/pm/references/project-spec-template.md`
   定義含 ≥10 個 BDD 場景骨架的標準格式，供 `generateSpec()` 組裝使用

3. **PM agent prompt 升級**（修改）— 依賴任務 1, 2
   | agent: developer | files: `plugins/overtone/agents/product-manager.md`
   加入訪談模式章節，透過 manage-component.js 更新（受 pre-edit-guard 保護）

4. **PM skill 更新**（修改）— 依賴任務 2
   | agent: developer | files: `plugins/overtone/skills/pm/SKILL.md`
   新增 project-spec-template.md 索引和 interview.js API 摘要，透過 manage-component.js 更新

5. **interview.js 單元測試**（新建）— 依賴任務 1 (parallel with 3, 4)
   | agent: developer | files: `tests/unit/interview.test.js`
   五個核心函式的完整測試（含邊界條件）

6. **整合測試**（新建）— 依賴所有前置任務
   | agent: developer | files: `tests/integration/interview.test.js`
   端到端驗證 10 輪問答流程、五面向覆蓋、Spec 格式正確性

**優先順序**：
- 第一批並行：任務 1 + 任務 2
- 第二批並行（第一批完成後）：任務 3 + 任務 4 + 任務 5
- 最後執行：任務 6

**範圍邊界**：明確不在此次範圍內：
- L3.5 Project Orchestrator 整合（訪談自動觸發）
- 訪談回答的跨 session 持久化
- Dashboard 訪談進度可視化
- 多語言支援
Keywords: interview, agent, developer, files, plugins, overtone, scripts, init, nextquestion, recordanswer

---
## 2026-03-05 | architect:ARCH Findings
**技術方案**：
- 新建 `interview.js`：純 CJS module（符合現有 lib 慣例），提供 `init/nextQuestion/recordAnswer/isComplete/generateSpec/loadSession/saveSession` 七個 API
- 靜態問題庫（五面向：functional/flow/ui/edge-cases/acceptance），每面向必問題 + 補充題，完成門檻可透過 options 覆蓋（預設 minAnswersPerFacet = 2）
- session 狀態存 `~/.overtone/sessions/{sessionId}/interview-state.json`，支援中斷恢復，使用 `utils.atomicWrite` 原子寫入
- Project Spec 直接寫檔到 `specs/features/in-progress/{featureName}/project-spec.md`（非 Handoff 輸出），確保無人值守場景下資料不丟失
- PM agent prompt 和 SKILL.md 透過 `manage-component.js` 更新（pre-edit guard 保護）

**關鍵技術決策和理由**：
- 靜態問題庫 vs LLM 生成 → 靜態：一致性高、可測試、0 latency
- CLI 入口 vs inline → inline（`node -e`）：與 knowledge-gap-detector.js、execution-queue.js 現有模式一致
- 寫檔 vs Handoff → 寫檔：Handoff 在 context compact 後消失，無人值守不可靠
- 無需更新 pre-task-handler.js：interview.js 是 PM agent 主動呼叫的工具，不是 Hook 注入 context

**API 介面**：

```javascript
// 七個核心函式（module.exports）
init(featureName, outputPath, options?)  → InterviewSession
nextQuestion(session)                    → Question | null
recordAnswer(session, questionId, answer) → InterviewSession
isComplete(session)                      → boolean
generateSpec(session)                    → ProjectSpec（並寫入 outputPath）
loadSession(statePath)                   → InterviewSession | null
saveSession(session, statePath)          → void
```

**資料模型**：
- `InterviewSession`：featureName, outputPath, answers(Record), startedAt, completedAt?, options
- `Question`：id（格式 `func-1`）, facet, text, required, dependsOn?
- `ProjectSpec`：feature, generatedAt, facets（functional/flow/ui?/edgeCases/acceptance>=10個BDD）
- `InterviewStateFile`：version:1, featureName, outputPath, answers, startedAt, completedAt?, options

**檔案結構**：

| 檔案 | 操作 | 用途 |
|------|------|------|
| `plugins/overtone/scripts/lib/interview.js` | 新增 | 引擎核心 |
| `plugins/overtone/skills/pm/references/interview-guide.md` | 新增 | PM agent 訪談指引 |
| `plugins/overtone/agents/product-manager.md` | 修改 | 新增多輪訪談模式章節 |
| `plugins/overtone/skills/pm/SKILL.md` | 修改 | 新增 interview-guide.md reference |
| `tests/unit/interview.test.js` | 新增 | 單元測試 |
| `tests/integration/pm-interview-integration.test.js` | 新增 | 整合測試 |

**Dev Phases**：
Keywords: interview, module, init, nextquestion, recordanswer, iscomplete, generatespec, loadsession, savesession, functional

---
## 2026-03-05 | architect:ARCH Context
PM agent 從「單輪分析」升級為「多輪結構化訪談」引擎。核心方案是新建 `interview.js` 引擎模組，提供靜態問題庫（五面向 20 題）+ session 狀態持久化 + BDD Project Spec 產生能力，再升級 PM agent prompt 和 PM SKILL.md 讓 PM agent 主動呼叫。
Keywords: agent, interview, session, project, spec, prompt, skill

---
## 2026-03-05 | doc-updater:DOCS Context
L3.4 深度 PM 多輪訪談引擎已完成開發、測試與代碼審查，進入文件同步階段。主要變更包括：

- **新增核心模組**：interview.js（多輪結構化訪談引擎，7 API，24 題問題庫）
- **新增操作指引**：interview-guide.md（PM 訪談操作指南）
- **升級 Agent**：product-manager.md（新增 Advisory vs Interview 模式）
- **升級 Skill**：pm/SKILL.md（新增 interview-guide.md reference）
- **測試補強**：43 個新增測試（33 unit + 10 integration）
- **版本更新**：0.28.61 → 0.28.62
Keywords: interview, guide, agent, product, manager, advisory, skill, reference, unit, integration

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. `skill-evaluator.js` — 評估模組 | agent: developer | files: `scripts/lib/skill-evaluator.js`, `scripts/lib/score-engine.js`, `scripts/lib/knowledge/instinct.js`, `scripts/lib/timeline.js`, `scripts/lib/paths.js`

2. `skill-generalizer.js` — 通用化模組 | agent: developer | files: `scripts/lib/skill-generalizer.js`, `scripts/lib/skill-forge.js`, `plugins/overtone/skills/*/references/`

3. `experience-index.js` — 經驗索引模組 | agent: developer | files: `scripts/lib/experience-index.js`, `scripts/lib/paths.js`

4. `evolution.js internalize 子命令` | agent: developer | files: `scripts/evolution.js`（需 T1+T2+T3 完成）

5. `project-orchestrator.js 整合經驗查詢` (parallel with T6) | agent: developer | files: `scripts/lib/project-orchestrator.js`（需 T3 完成）

6. `health-check.js 新增 checkInternalizationIndex` (parallel with T5) | agent: developer | files: `scripts/health-check.js`（需 T3 完成）

7. `測試覆蓋`（unit x3 + integration x1）| agent: tester | files: `tests/unit/skill-evaluator.test.js`, `tests/unit/skill-generalizer.test.js`, `tests/unit/experience-index.test.js`, `tests/integration/skill-internalization.test.js`

**優先順序**：
- Phase 1（可並行）：T1 + T2 + T3
- Phase 2（需等 T1+T2+T3）：T4
- Phase 3（T3 後可並行）：T5 + T6
- Phase 4（全部完成後）：T7

**範圍邊界**：
- 不包含：跨專案 skill 語意合併、SessionEnd 自動觸發、Dashboard 可視化
- 不包含：多語言 skill 支援
Keywords: skill, evaluator, agent, developer, files, scripts, score, engine, knowledge, instinct

---
## 2026-03-05 | planner:PLAN Context
L3.7 Skill Internalization 目標是建立「經驗內化飛輪」：專案完成後，系統性評估哪些 skill 值得永久保留，通用化後合併到永久 skill 庫，並建立跨專案的「什麼樣的專案需要哪些 skill」經驗索引，加速未來專案啟動。

現有基礎設施：
- `score-engine.js`：JSONL append-only 評分記錄（scores.jsonl）
- `knowledge-archiver.js`：SubagentStop 時提取知識片段 → skill-router → auto-discovered.md
- `global-instinct.js`：高信心觀察升級到全域 store
- `timeline.js`：session 事件流（timeline.jsonl）
- `session-digest.js`：SessionEnd 時產生 session 摘要（digests.jsonl）
- `evolution.js`：現有 analyze/fix/forge/orchestrate 子命令，擴展模式已成熟
Keywords: skill, internalization, score, engine, jsonl, append, only, scores, knowledge, archiver

---
## 2026-03-05 | architect:ARCH Context
L3.7 Skill Internalization 的技術設計已完成。目標是建立「經驗內化飛輪」：從 session 學習資料評估知識條目是否值得永久保留，通用化後寫入 `skills/instinct/internalized.md`，並透過 experience-index 支援 project-orchestrator 加速能力盤點。
Keywords: skill, internalization, session, skills, instinct, internalized, experience, index, project, orchestrator

---
## 2026-03-05 | developer:DEV Context
實作 L3.7 Skill Internalization T2：`skill-generalizer.js` — 知識條目通用化處理器。

純函式模組，負責移除知識條目中的專案特定內容（段落級移除策略），使其可通用化後保存至 `skills/instinct/internalized.md`。
Keywords: skill, internalization, generalizer, skills, instinct, internalized

---
## 2026-03-05 | developer:DEV Findings
**根因分析**：
- `~/.overtone/.current-session-id` 是全域共享文件
- `on-submit-instinct.test.js` 執行 `on-submit.js` 子進程，此 hook 會將 `session_id` 寫入該共享文件
- `session-id-bridge.test.js` 的測試 A 先寫入自己的 session ID，再執行 `init-workflow.js`（從共享文件讀取）
- `bun test file1 file2` 同一 invocation 中多個文件並行執行（max-concurrency=20）
- 當這兩個文件在同一個 worker 中並行執行時，`on-submit-instinct.test.js` 的 `runHook` 可能在測試 A 的寫入和讀取之間覆寫共享文件，導致 `init-workflow.js` 讀到錯誤的 session ID，workflow.json 被建立在錯誤目錄

**修復方式**：
- 在 `test-parallel.js` 中新增 `SEQUENTIAL_FILES` 機制
- `session-id-bridge.test.js` 加入此列表，在所有並行 worker 完成後獨立執行
- 使用 `--max-concurrency=1` 確保完全隔離
- 不影響整體測試時間（+~0.3s），無需修改任何實作碼或測試邏輯

**確認**：
- 修復後執行 5 次 `test-parallel.js` 全部 pass
- `bun test` 3864 pass, 0 fail
Keywords: overtone, current, session, submit, instinct, test, hook, bridge, init, workflow

---
## 2026-03-05 | developer:DEV Findings
1. **health-check doc-code-drift** — 執行前已是 `passed: true`，無 drift 發現（doc-sync-engine 只追蹤 agents/skills/commands/hooks 四項，不含 scripts/lib 計數）
2. **docs-sync.test.js** — 28 pass，執行前後皆通過
3. **scripts/lib 實際計數**：
   - 頂層 `.js`：42 個
   - `analyzers/`：7 個
   - `knowledge/`：9 個
   - `dashboard/`：2 個
   - `remote/`：4 個
   - 總計：**64 個**（文件記載 51，差距 13 個）
4. **其他數字確認**：agents 18、skills 24、hooks 11、commands 28、health-check 17 項 — 均已正確
Keywords: health, check, code, drift, passed, true, sync, engine, agents, skills

---
## 2026-03-05 | developer:DEV Findings
**queryPastInterviews(projectRoot, options?)**
- 掃描 `~/.overtone/sessions/{sessionId}/interview-state.json`
- 支援 `options.limit`（預設 10）和 `options.feature`（依 feature 名稱過濾）
- 已完成的訪談（有 completedAt）排在未完成前面
- 無法讀取的 session 靜默跳過
- JSDoc 中避免使用 `*` 萬用字元（Bun 會把 JSDoc 註解中的 glob 路徑當成語法解析）

**extractInsights(sessions)**
- 純函式，無 I/O，輸入含 `answers` 欄位的 session 物件陣列
- functional 回答 → commonRequirements
- edge-cases 回答 → boundaryConditions
- flow + ui 回答 → userPreferences
- 各類別最多 5 筆，重複去重

**設計決策**
- `queryPastInterviews` 使用硬編碼 `~/.overtone` 路徑（與 paths.js 一致，不依賴 projectRoot 來定位 sessions）
- projectRoot 參數保留供未來依專案隔離訪談使用
Keywords: querypastinterviews, projectroot, options, overtone, sessions, sessionid, interview, state, json, limit

---
## 2026-03-05 | developer:DEV Context
實作了 PM agent 的跨 session 記憶能力。在 `interview.js` 新增兩個 export 函式，讓 PM 在開始新訪談前可以查詢並參考過去的訪談記錄。
Keywords: agent, session, interview, export

---
## 2026-03-05 | code-reviewer:REVIEW Findings
無 Critical 或 Major 等級問題。

[n] `extractInsights` 的 JSDoc `@param` 描述的型別是 `queryPastInterviews` 回傳的 sessions 陣列（不含 `answers`），但實際函式需要含 `answers` 欄位的完整 session 物件（來自 `loadSession`）。JSDoc 已在描述中補充「需包含完整 answers，來自 loadSession」，但型別定義與實際需求不一致。不阻擋合併。
Keywords: critical, major, extractinsights, jsdoc, param, querypastinterviews, sessions, answers, session, loadsession

---
## 2026-03-05 | developer:DEV Context
完成 `skill-router-tune`（opt-7）：調優 `skill-router.js` 路由演算法，提升 agent 知識路由的精準度，減少歧義詞造成的 false positive。
Keywords: skill, router, tune, agent, false, positive

---
## 2026-03-05 | developer:DEV Findings
- **格式 2 跨 skill 引用問題**：最初的 regex 錯誤地把跨 skill 引用（如 `auto` skill 引用 `workflow-core/references/handoff-protocol.md`）解析為當前 skill 的路徑，導致 9 個假陽性 error。修正方式：格式 2 改用捕捉完整三部分（`targetSkill`、`type`、`file`），驗證 `skills/{targetSkill}/{type}/{file}` 的實際存在
- **`crossRefs` Set 無效問題**：物件在 Set 中比對引用而非值，需改用字串 key 去重（`${targetSkill}/${type}/${file}`）
- **計數斷言更新**：共 6 個測試檔案有計數斷言需更新（17 → 19），其中 `health-check-internalization.test.js` 未在 MEMORY.md 配套清單中記錄，已補充
Keywords: skill, regex, auto, workflow, core, references, handoff, protocol, error, targetskill

---
## 2026-03-05 | developer:DEV Findings
- registry 匯出 `workflows`（非 `WORKFLOW_TYPES`），timeline 匯出 `emit`（非 `appendEvent`）— 初次斷言錯誤，已根據實際 API 修正
- `evolution.js status` 子命令存在且 exit 0
- `queue.js list` 空佇列時 exit 1 為預期行為，測試接受 `[0, 1]`
- spawn 時加入 `OVERTONE_NO_DASHBOARD=1` 和 `OVERTONE_TEST=1` 避免副作用
- 18 個測試全部通過，執行時間約 2.3s
Keywords: registry, workflows, timeline, emit, appendevent, evolution, status, exit, queue, list

---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

1. **架構一致性良好**：`extractWebKnowledge` 的設計遵循 Overtone 的降級（graceful fallback）模式 — `tryWithTools()` 失敗或品質不足時自動 fallback 到 `tryWithoutTools()`，符合系統一貫的容錯設計。

2. **快取機制設計合理**：
   - 快取路徑選在 `skills/{domain}/references/web-research.md`，與現有 references/ 目錄結構一致
   - TTL 使用 `fs.statSync().mtimeMs`（基於檔案修改時間）而非寫入後追蹤，語意正確
   - 空字串不寫入快取，邊界情況處理得宜

3. **品質驗證（isQualityResearch）門檻保守但合理**：只檢查是否含 `## 或 ###` 標題。雖然門檻低，但配合 fallback 邏輯（品質不足時再試 without tools），整體防誤判能力足夠。

4. **測試覆蓋完整**：Feature 8（enableWebResearch）+ Feature 9（快取機制）共 15 個新測試涵蓋主要路徑，包含快取命中、未命中、空字串、TTL 過期前（9-3）等場景。

5. **Overtone principles checklist**：
   - 自動修復：`extractWebKnowledge` 有雙層 try-catch + fallback，符合容錯原則
   - 補全能力：快取寫入時自動建立 `references/` 目錄（`mkdirSync recursive`），符合慣例
   - 驗證品質：測試覆蓋到位，新函式全部從 `module.exports` 導出供測試使用

6. **一個觀察（信心不足 70%，不列為 ISSUES）**：`isQualityResearch` 的截斷發生在 `extractWebKnowledge` 之後（先截斷後判斷品質），若截斷恰好切到最後一個 section header 之前理論上可能誤判為低品質。但 5000 字元的截斷上限實際上遠大於任何合法的 section header，此情況在實際執行中概率極低，不構成可報告問題。
Keywords: extractwebknowledge, overtone, graceful, fallback, trywithtools, trywithouttools, skills, domain, references, research

---
## 2026-03-05 | doc-updater:DOCS Findings
本次 commit (507a401) 修復了 PM domain research session 持久化的問題：

**實作變更**：
- `plugins/overtone/scripts/lib/interview.js`：
  - `saveSession()` 新增 `domainResearch: session.domainResearch || null` 序列化
  - `loadSession()` 新增 `domainResearch: data.domainResearch || undefined` 還原
  - 確保含領域研究的 session 在中斷恢復時研究資料完整性

**測試補強**：
- `tests/unit/pm-domain-research.test.js`：新增 2 個 roundtrip 測試
  - Scenario 4-1：含 domainResearch 的 session 存取後完整保留
  - Scenario 4-2：無 domainResearch 的 session 存取後 domainResearch 為 undefined

**更新的文件**：

1. **CHANGELOG.md**：
   - 新增 [0.28.64] bugfix 條目（修復 domainResearch 序列化）
   - 補充 [0.28.63+feature] 說明（pm-domain-research 功能，3 個新 API：researchDomain/startInterview/getResearchQuestions）
   - 測試統計更新（4054 → 4086 → 4088）

2. **docs/status.md**：
   - 更新「最後更新」版本描述（含 pm-domain-research + bugfix）
   - 更新「測試通過」：4054 → 4088 pass（+34 個測試）
   - 更新「近期變更」（3 筆最新）：0.28.64 pm-domain-research + 0.28.63+feature auto-forge-trigger/queue-cli-enhancement + 0.28.62 internalization

3. **docs/roadmap.md**：
   - L3.4 深度 PM 狀態：🟡 部分完成 → ✅ 完成
   - L3.4 子項「領域研究整合」：⬜ → ✅（新增 researchDomain/startInterview/getResearchQuestions 三個 API）

4. **plugins/overtone/skills/pm/references/interview-guide.md**（技術同步）：
   - 新增「領域研究 API」表格（researchDomain/startInterview/getResearchQuestions）
   - 更新「領域研究整合」章節，加入新 API 使用說明與流程
   - 補充呼叫範例：「帶領域研究的完整訪談流程」

5. **plugins/overtone/skills/claude-dev/references/auto-discovered.md**（自動知識記錄）：
   - Hook 自動記錄 pm-domain-research feature 實作訊息
Keywords: commit, domain, research, session, plugins, overtone, scripts, interview, savesession, domainresearch

---
## 2026-03-05 | doc-updater:DOCS Context
pm-domain-research 功能 + bugfix 提交已完成。涉及 interview.js 核心模組（saveSession/loadSession domainResearch 欄位序列化修復）和測試新增（2 個 roundtrip 測試）。
Keywords: domain, research, bugfix, interview, savesession, loadsession, domainresearch, roundtrip

---
## 2026-03-05 | developer:DEV Findings
**主要實作決策：**

1. `buildBDDScenarios` 改為從三個 facet 衍生場景：
   - `acceptance` facet → 驗收場景（given 含「功能已啟用」）
   - `edge-cases` facet → 邊界條件場景（given 含「邊界條件」，title 以「邊界場景：」開頭）
   - `flow` facet → 流程場景（given 含「操作流程」，title 以「流程場景：」開頭）
   - 內建 title 去重（Set 追蹤）

2. `enrichBDDScenarios(scenarios, session)` 新增為獨立導出函式：
   - 先對傳入 base 陣列進行 title 去重（防禦性）
   - 從 `functional` facet 補充 happy path 場景（title 以「功能場景：」開頭）
   - 加入三個通用模板（空輸入、權限不足、網路逾時），但透過關鍵詞比對跳過 edgeCases 已涵蓋的議題
   - Fallback 到 `buildSupplementaryScenarios` 確保到達 10 個

3. `generateSpec` 改為：`enrichBDDScenarios(buildBDDScenarios(session), session)`，雙重保險確保場景數

**函式宣告順序**：`buildBDDScenarios`（330）在 `enrichBDDScenarios`（439）之前，因為兩者均為 `function` 宣告，JavaScript hoisting 正常運作。
Keywords: buildbddscenarios, facet, acceptance, given, edge, cases, title, flow, enrichbddscenarios, scenarios

---
## 2026-03-05 | developer:DEV Context
強化 `interview.js` 的 `buildBDDScenarios()` 函式，新增從多個 facet 自動衍生 BDD 場景的能力，並新增 `enrichBDDScenarios()` 函式確保場景數量達到 PM spec 的最低要求（≥10 個）。
Keywords: interview, buildbddscenarios, facet, enrichbddscenarios, spec

---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

1. **架構一致性良好** — `buildBDDScenarios` 內部在場景不足 10 個時呼叫 `enrichBDDScenarios`，`generateSpec` 又以 `enrichBDDScenarios(buildBDDScenarios(session), session)` 組合兩層。表面上看像雙重調用，但邏輯正確：`buildBDDScenarios` 內部的 `enrichBDDScenarios` 呼叫只發生在場景 < 10 時，且 `generateSpec` 的外層 `enrichBDDScenarios` 是幂等的（`seenTitles` 去重保護），不會造成重複或錯誤。

2. **去重邏輯一致** — `buildBDDScenarios` 與 `enrichBDDScenarios` 皆使用 `Set` 追蹤 `seenTitles`，兩個函式邊界清晰，互不破壞對方的不變量。

3. **測試覆蓋結構合理** — 16 個測試橫跨 Feature A（場景衍生）、Feature B（補充邏輯）、Feature C（generateSpec 整合），涵蓋邊界情境（空輸入、極少回答、已滿場景、去重）。

4. **純函式設計確認** — `enrichBDDScenarios` 不修改傳入的 `scenarios` 陣列（Scenario B-4 驗證），符合不可變原則。

5. **Overtone 原則 Checklist 對照**：
   - 測試通過（DEV Handoff 確認）
   - 行為符合規格（場景 ≥10、多 facet 衍生、去重）
   - `generateSpec` 的錯誤路徑有 `try-catch` 保護並拋出帶 code 的 Error

6. **一個觀察（信心 < 70%，不列為 ISSUES）** — `generateSpec` 在 `acceptance` facet 的處理為 `enrichBDDScenarios(buildBDDScenarios(session), session)`，其中 `buildBDDScenarios` 本身在場景不足時已內部呼叫 `enrichBDDScenarios`，外層再包一次雖然幂等但稍顯冗餘。這是設計選擇而非缺陷，且無法量化其對行為的影響，因此不升為 ISSUES。
Keywords: buildbddscenarios, enrichbddscenarios, generatespec, session, seentitles, feature, scenarios, scenario, overtone, checklist

---
## 2026-03-05 | code-reviewer:REVIEW Findings
審查了以下面向，未發現高信心問題：
- **功能完整性**：buildBDDScenarios 的多 facet 衍生 + enrichBDDScenarios 的三層補充策略 + generateSpec 整合，均符合需求
- **去重機制**：title-based Set 去重在 buildBDDScenarios 和 enrichBDDScenarios 中各有獨立實作，防禦性足夠
- **Error handling**：answers[q.id] 為空時 `if (!answer) continue` 正確處理、enrichBDDScenarios 對空陣列輸入有防禦
- **測試覆蓋**：16 個新測試涵蓋 facet 衍生、補充策略、去重、immutability、通用模板條件判斷、generateSpec 整合
- **向後相容**：33 個既有 interview.test.js 測試全部通過
- **安全性**：無硬編碼 secrets、無外部輸入注入風險

[m] 雙重 enrichBDDScenarios 呼叫是有意設計（雙重保險），功能正確但略增認知負擔。
Keywords: buildbddscenarios, facet, enrichbddscenarios, generatespec, title, based, error, handling, answers, answer

---
## 2026-03-05 | doc-updater:DOCS Findings
- ✅ 無新 CLI 指令
- ✅ 無新 agent/hook/skill 配置
- ✅ 無公開 API 新增（enrichBDDScenarios 是內部實現）
- ✅ 無架構決策點變更
- ✅ README/CHANGELOG 無需同步
Keywords: agent, hook, skill, enrichbddscenarios, readme, changelog

---
## 2026-03-05 | doc-updater:DOCS Context
開發完成 pm-spec-bdd-enrichment feature，變更限於：
- `plugins/overtone/scripts/lib/interview.js` — 內部函式強化（buildBDDScenarios 多 facet 衍生、enrichBDDScenarios 補充場景）
- `tests/unit/pm-bdd-enrichment.test.js` — 新增 16 個測試
Keywords: spec, enrichment, feature, plugins, overtone, scripts, interview, buildbddscenarios, facet, enrichbddscenarios

---
## 2026-03-05 | developer:DEV Findings
- `config-io.js` 導出 8 個函式：`resolveCommand`、`readAgentFile`、`readSkillFile`、`readHooksJson`、`getHookHandler`、`readRegistryData`、`writeRegistryData`、`readPluginJson`、`writePluginJson`
- 使用 tmpdir 隔離，`beforeEach` 建立、`afterEach` 清理，符合現有測試慣例
- `rmSync` 需加 `{ force: true }` 以防前一個測試（如 `writeRegistryData`）沒有預建目標檔案的情況（初始 `makeTmpPluginRoot` 不預建 `registry-data.json`）
- `getHookHandler` 有副本不污染原始物件的測試，驗證 spread 行為
Keywords: config, resolvecommand, readagentfile, readskillfile, readhooksjson, gethookhandler, readregistrydata, writeregistrydata, readpluginjson, writepluginjson

---
## 2026-03-05 | developer:DEV Findings
- `config-validator.js` 有 6 個公開導出（`validateAgent`、`validateHook`、`validateSkill`、`validateAll`、`validateAgentFrontmatter`、`validateSkillFrontmatter`），測試全部覆蓋。
- `loop.js` 有 4 個公開導出（`readLoop`、`writeLoop`、`exitLoop`、`readTasksStatus`），測試全部覆蓋。
- **關鍵發現**：`readTasksCheckboxes` 只解析 `## Stages` 或 `## Tasks` 區塊的 checkbox，測試 tasks.md 必須包含這些標頭；未含標頭的測試會得到 null 回傳值。
- **關鍵發現**：`validateHook` 的 `resolveCommand` 只替換 `${CLAUDE_PLUGIN_ROOT}` 佔位符，測試中 hooks.json 的 command 必須使用此格式。
- `exitLoop` 會向 timeline.jsonl emit 兩個事件（`loop:complete` + `session:end`），測試透過真實 session 目錄操作驗證。
- 全部 41 個新測試通過，整體 4167 pass, 0 fail。
Keywords: config, validator, validateagent, validatehook, validateskill, validateall, validateagentfrontmatter, validateskillfrontmatter, loop, readloop

---
## 2026-03-05 | developer:DEV Findings
**根因分析**：
- `failure-tracker.js` 的 `recordResolution()` 函數把 `verdict: 'resolved'` 的記錄寫入 `failures.jsonl`，格式為 `{ ts, sessionId, stage, verdict: 'resolved' }`（無 `agent` 欄位），這是設計行為，用於 `_filterResolved()` 的去重機制
- `health-check.js` 的驗證規則要求 `failures.jsonl` 所有記錄必須含 `agent` 欄位，且 `verdict` 只允許 `'fail'` 或 `'reject'`，未考慮 `resolved` 記錄的存在
- 受影響資料：`~/.overtone/global/7f2b45a9/failures.jsonl` 中 101 行有 50 行 `resolved` 記錄，損壞率 49.5%（遠超 10% 觸發門檻）

**修復方式**：
- `required` 欄位從 `['ts', 'stage', 'agent', 'verdict']` 改為 `['ts', 'stage', 'verdict']`（resolved 無需 agent）
- 合法 `verdict` 值擴充為 `fail` / `reject` / `resolved`
- 針對 `fail`/`reject` 記錄額外驗證 `agent` 欄位存在

**測試前後**：修改前 test-parallel.js 15 fail，修改後 14 fail（少了 1 個 — data-quality 的 spawn 測試不再失敗，無新增失敗）
Keywords: failure, tracker, recordresolution, verdict, resolved, failures, jsonl, sessionid, stage, agent

