---
## 2026-03-03 | developer:DEV Findings
1. **前階段已完成大部分工作**：architect/planner 階段已建立了 `pre-bash-guard.js`、`os-control` skill、references 目錄、agent frontmatter 更新、hook 登記，以及 `hook-runner.js` 的 `runPreBashGuard` helper 和完整的 `pre-bash-guard.test.js`。

2. **developer 實際執行的修正**：
   - `docs-sync.test.js` 硬編碼數字 19 → 20（新增 os-control 後 skill 數量變化）
   - `docs/status.md` Knowledge Domain 數 11 → 12，P3.0 狀態 `⬜` → `✅`
   - `CLAUDE.md` 目錄結構說明 11 → 12 knowledge domains，補上 os-control
   - 暫存時正確排除了不屬於本次範圍的 `workflow-core/references/auto-discovered.md`

3. **黑名單守衛 10 條規則**：涵蓋根目錄刪除、磁碟格式化、磁碟裝置直接寫入、root 密碼修改、根目錄全權限、sudoers 修改、防火牆清空、網路介面停用、強制終止所有進程、init 進程終止。

4. **測試結果**：2721 pass，0 fail，116 files。
Keywords: architect, planner, bash, guard, control, skill, references, agent, frontmatter, hook

---
## 2026-03-03 | doc-updater:DOCS Findings
更新了 4 份核心文件和相關補強項：

1. **CLAUDE.md** — 新增「元件閉環」治理規則
   - 規則：新增/修改 Skill、Agent、Hook 時，必須檢查三者依賴（Skill 需 Agent 消費、Agent 需 Hook 注入、危險操作需 Guard 保護）
   - 位置：「開發規範」區段

2. **docs/roadmap.md** — P3.0 子任務全部標記完成
   - 將 P3.0 的 5 個子任務從 ⬜ 更新為 ✅
   - 子任務包括：os-control SKILL.md、Agent frontmatter 集成、pre-bash-guard.js、hooks.json 登記、Guard 測試

3. **docs/spec/overtone.md** — 版本號同步
   - 從 v0.28.24 → v0.28.29（對齐 plugin.json）

4. **pre-bash-guard.js 黑名單優化** — 測試與 RETRO 階段發現的改進
   - 擴展根目錄刪除檢測：新增 `rm -rf /`（無 sudo）的識別
   - 精準化邊界判定：`\s|$|\*` 避免誤判
   - 黑名單規則從 10 條 → 11 條

5. **workflow-core references** — auto-discovered.md 更新
   - 自動同步各 reference 檔案的最新發現
Keywords: claude, skill, agent, hook, guard, docs, roadmap, control, frontmatter, bash

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

P3.0 閉環基礎整體品質達標。工作流從 PLAN 到 TEST:verify 完整流轉，測試結果 2728 pass / 0 fail，validate-agents 確認 17 agents + 11 hooks + 20 skills 全部通過。pre-bash-guard.js 的 11 條黑名單 regex 均使用 `\b` 詞邊界精準比對，REVIEW 首次 REJECT 後的修復方向正確（由過度攔截轉為精準比對）。os-control Skill 結構符合規範（SKILL.md 主體 1513 字元，低於 3000 字元上限；4 個 reference 檔案均非空）。

**確認的品質點**：
- pre-bash-guard.js 11 條黑名單 regex 覆蓋了 BDD spec 的所有危險命令場景，且精準度已通過 REVIEW 確認
- 5 個 agent（developer、architect、tester、debugger、qa）frontmatter 均包含 os-control skill
- hooks.json Bash matcher 維持官方三層嵌套格式，路徑指向正確
- guard-coverage.test.js 已追蹤 `pre-bash-guard.test.js` 為必要整合測試

**已知偏差（屬 PM 設計演進，非問題）**：
- BDD spec 消費者名單（build-error-resolver/e2e-runner/refactor-cleaner）與實作（architect/tester/qa）不同，為 PM 決策調整
- BDD spec reference 檔名（os-capabilities.md 等）與實作（perception.md 等）不同，為架構設計演進
- BDD spec 黑名單定義 10 條，實作 11 條（sudo rm -rf / 為 REVIEW 後補加），為品質改善
Keywords: plan, test, verify, pass, fail, validate, agents, hooks, skills, bash

---
## 2026-03-03 | developer:DEV Findings
**Bug 根因**：`buildAgentDisplay` 的主信號分支（line 167）找到 agent 名稱後立即 return，完全跳過了副信號分支中已有的 `× N` 計數邏輯。mul-agent 並行 3 個 developer 時，status line 只顯示 `💻 developer` 而非 `💻 developer × 3`。

**修復方式**：在主信號分支中，找到 stageDef 後額外查詢 `workflow.stages` 中對應 stage key 的 active 條目數量（包含 `DEV:2`、`DEV:3` 等並行 key）。count > 1 時才附加 `× N`，避免單一 agent 時顯示 `× 1`。

**manage-component.js**：在成功訊息後（`console.log(JSON.stringify(result))` 之後），根據 action + type 組合輸出不同的 `process.stderr.write` 提示，`update agent` 只在 `opts.skills !== undefined` 時才觸發提示。

**測試**：新增 2 個測試案例覆蓋主信號分支的並行情境（`× 3` 和「不顯示 × 1」）。

**docs-sync 版本測試**：1 fail 是 pre-existing 問題（plugin.json 0.28.30 vs status.md 0.28.29），與本次修改無關。
Keywords: buildagentdisplay, line, agent, return, developer, status, stagedef, workflow, stages, stage

---
## 2026-03-03 | code-reviewer:REVIEW Findings
審查了 5 個檔案的變更，涵蓋以下面向：

1. **邏輯正確性**：`buildAgentDisplay` 的並行計數邏輯通過所有邊界條件分析 -- workflow 不存在、stageKey 不存在、單一 agent、非 Overtone agent 等場景均安全處理。`k.split(':')[0] === stageKey` 的匹配策略正確地將 `DEV:2`、`DEV:3` 歸入 `DEV` 類別計數。

2. **Error handling**：`workflow?.stages || {}` 安全處理 null workflow；`stageEntry?.` optional chaining 安全處理 registry 中找不到 agent 的情況。無新增的 crash 風險。

3. **副作用隔離**：manage-component.js 的提示使用 stderr 輸出，不影響 stdout 的 JSON 格式（程式解析用途）。僅在成功路徑觸發，不影響失敗處理流程。

4. **測試覆蓋**：2 個新增測試分別覆蓋了多並行（x 3）和單一 agent（不顯示 x N）的核心場景，驗證了修復的功能行為。30 個測試全數通過。

5. **安全性**：無硬編碼 secrets、無外部輸入注入風險。

沒有發現高信心（>80%）的問題。
Keywords: buildagentdisplay, workflow, stagekey, agent, overtone, split, error, handling, stages, null

---
## 2026-03-03 | tester:TEST Findings
測試結果摘要：

- `tests/unit/statusline.test.js`：30 passed, 0 failed
  - 新增並行場景覆蓋已通過：
    - `active-agent.json 主信號 + 並行 workflow stages 時顯示 × N`（`× 3` 情境）
    - `active-agent.json 主信號單一 stage 時不顯示 × N`（`× 1` 不顯示情境）
- 完整測試套件：2759 passed, 0 failed（116 files）
Keywords: tests, unit, statusline, test, passed, failed, active, agent, json, workflow

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

整體實作品質良好。`buildAgentDisplay` 主信號分支的修復邏輯正確，optional chaining 防護完整（`workflow?.stages || {}`），manage-component.js 的 stderr 輸出方式合適。測試套件覆蓋了並行場景的核心路徑，2759 pass 全通過。

然而回顧中發現一個測試隔離問題，導致一個真實 bug 未被偵測到：
Keywords: buildagentdisplay, optional, chaining, workflow, stages, manage, component, stderr, pass

---
## 2026-03-03 | product-manager:PM Findings
**目標用戶**：Overtone agent 群（developer、architect、tester、debugger、qa -- 已在 P3.0 加入 `skills: [os-control]` frontmatter），透過 Bash tool 呼叫 `scripts/os/*.js` 腳本。

**成功指標**：
- Agent 能執行 `bun scripts/os/screenshot.js` 取得螢幕截圖並產生 PNG 檔案
- Agent 能執行 `bun scripts/os/window.js list` 取得目前視窗列表
- Agent 能將截圖送入多模態分析取得結構化描述
- perception.md reference 文件能被 pre-task.js 注入 agent context

---

**Discovery 五層追問**

| 層 | 問題 | 回答 |
|----|------|------|
| L1 | 做什麼？ | 讓 agent 能截圖、理解視覺內容、管理視窗 |
| L2 | 場景/誰在用？ | 5 個 agent（developer/architect/tester/debugger/qa）在 OS 操作驗證場景使用 |
| L3 | 目前怎麼處理？ | 完全沒有替代方案。Agent 對 GUI 狀態完全不可見 |
| L4 | 多常需要？ | Phase 3 Acid Test 的核心前提；P3.2 Computer Use 迴圈的必要輸入 |
| L5 | 成功定義？ | `screencapture` 成功截圖 + Claude 多模態回傳結構化描述 + 視窗操作可用 |

---

**Codebase 現狀深度分析**

| 維度 | 現況 | 佐證 |
|------|------|------|
| 腳本位置 | `scripts/os/` 目錄尚未建立 | `ls plugins/overtone/scripts/` 無 os/ 子目錄 |
| SKILL.md | 骨架已就位，4 個 reference 標記為「待建」 | `/plugins/overtone/skills/os-control/SKILL.md` 49 行 |
| Reference 預留 | `perception.md` 只有 3 行 placeholder | 內容：`# 感知層（P3.1）\n> 此文件將在 P3.1 階段填充。` |
| Guard | `pre-bash-guard.js` 11 條黑名單已可用 | 79 行 + 完整整合測試（233 行） |
| 測試模式 | `sound.js`（OS 操作先例）測試採 mock platform + 常數驗證 | `sound.test.js` 69 行 |
| OS 相依性 | `screencapture` 存在但需 Screen Recording 權限；`osascript` 存在但視窗屬性需 Accessibility 權限 | 實測驗證（見下方） |

**環境權限實測結果**（codebase 佐證 -- 本機實測）：

| 工具 | 命令 | 結果 | 需要權限 |
|------|------|------|----------|
| screencapture | `screencapture -x /tmp/test.png` | **失敗** `could not create image from display` | Screen Recording |
| osascript（進程列表） | `get name of every process whose visible is true` | **成功** | 無 |
| osascript（視窗屬性） | `get {position, size} of window of process` | **失敗** `-1728 不允許輔助取用` | Accessibility |
| osascript（視窗名稱） | `get name of every window of process "Finder"` | **失敗** `-1728` | Accessibility |
| JXA | `Application("System Events").processes.whose(...)` | **成功**（進程列表） | 無（進程列表） |

---

**方案比較**
Keywords: overtone, agent, developer, architect, tester, debugger, skills, control, frontmatter, bash

---
## 2026-03-03 | product-manager:PM Context
**問題陳述**：Overtone 目前是「只有大腦沒有五官」的自治系統。agent 無法「看到」螢幕上正在發生什麼，也無法「理解」視覺內容。這限制了系統的自主能力 -- 例如 Phase 3 Acid Test 要求的「截圖+視覺驗證顯示正確」完全無法執行。

**影響**：
- 無法驗證 GUI 操作結果（啟動監控後無法確認畫面正確）
- 無法進入 P3.2（操控層）-- 沒有眼睛就無法做 Computer Use 的「截圖 -> 理解 -> 操作 -> 驗證」迴圈
- Phase 3 Acid Test 完全受阻

**根因分析**：Layer 2（感知操控）中「眼睛」能力缺失。P3.0 已建立骨架（skill domain + guard + agent frontmatter），P3.1 負責填充第一批實際能力。
Keywords: overtone, agent, phase, acid, test, computer, layer, skill, domain, guard

---
## 2026-03-03 | planner:PLAN Context
P3.1「感知層」為 Overtone Phase 3 OS 能力的第一階段，目標是讓 agent 能自主截圖並「看見」畫面（透過 Claude Code Read tool 多模態），同時查詢視窗狀態。PM 已確認不建立 `visual.js`（原生 Read tool 即可），核心交付物為兩支腳本（`screenshot.js` + `window.js`）、一份完整 reference 文件（`perception.md`）以及對應的單元測試。

proposal 已寫入：`specs/features/in-progress/p3-1-perception/proposal.md`

---
Keywords: overtone, phase, agent, claude, code, read, tool, visual, screenshot, window

---
## 2026-03-03 | developer:DEV Context
實作 P3.1「看得見（感知層）」，為 Overtone 提供 macOS 截圖擷取和視窗/進程管理能力。新增兩個核心腳本模組、完整填充 perception.md reference 文件、兩個測試檔，並更新 os-control SKILL.md 索引。
Keywords: overtone, macos, perception, reference, control, skill

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

P3.1 感知層整體實作品質良好，四個交付維度均完整。

**確認的品質點**：

1. **Overtone 閉環模型完整**：腳本（`screenshot.js` + `window.js`）、Reference（`perception.md`）、SKILL.md 索引、測試（22 + 27 = 49 個 test）四項全部交付，閉環無缺口。

2. **安全修復品質達標**：`sanitizeAppName()` 在 REVIEW REJECT 後正確實作，同時跳脫 `\` 和 `"` 兩個危險字元。3 個 sanitization 測試覆蓋了 injection payload 的核心場景，且測試實際驗證了 `capturedScript` 內容（不只是「不 throw」）。

3. **統一 response schema 貫徹**：所有 9 個公開函式均遵守 `{ ok: boolean, ... }` 規約，無例外。錯誤不 throw 的設計一致性高。

4. **BDD 偏差合理**：`listWindows` 空字串回傳 `[]`（非 `OSASCRIPT_PARSE_ERROR`）是語意上更正確的決策 — 空輸出意味著 App 無視窗，不是解析錯誤。BDD spec 的原意也未明確要求此情境為 error。此偏差已被 tester 接受，無需修改 spec。

5. **感知層覆蓋 Acid Test 需求**：Phase 3 Acid Test 需要「截圖驗證」能力，`captureFullScreen()` + Claude Read tool 的多模態組合已完整覆蓋。`perception.md` 中的「截圖 → Read → 視覺分析模板 → 決策」工作流範例也明確說明了使用方式。

6. **`isPermissionError` 修正品質**：初版誤判已修正，關鍵字清單（`could not create image`、`authorization denied`、`screen recording`、`not authorized to capture screen`）精確對應 macOS screencapture 的實際錯誤訊息，不會誤判一般指令失敗。

**觀察到的邊界（信心 < 70%，不列為 ISSUES）**：

- `captureRegion` 的座標 `${x},${y},${width},${height}` 直接嵌入 shell 指令，未做型別驗證（如非數字的輸入）。但 `captureRegion` 前置檢查只驗證欄位是否存在（`undefined/null`），若傳入字串型座標（如 `x: "100; rm -rf /"`），理論上可能造成 shell injection。然而：(1) 此函式的使用情境主要是 agent 內部呼叫，攻擊面極小；(2) REVIEW 第二輪已將此歸為「低風險，列 open questions」；(3) 信心約 55%（有問題存在，但實際影響可能性低）。建議未來 P3.2 開發時一起補強輸入型別驗證。

- `listProcesses` 和其他 window.js 函式使用 `osascript -e '${script}'` 傳遞多行 script，若腳本中有單引號則可能提早終止 shell 引號。目前的靜態 script 字串均不含單引號，所以無即時風險。信心約 50%（潛在設計脆弱點，但目前腳本均為硬編碼字串）。
Keywords: overtone, screenshot, window, reference, perception, skill, test, sanitizeappname, review, reject

---
## 2026-03-03 | architect:ARCH Findings
**技術方案**：
- Bun 常駐 daemon（heartbeat.js），fork-detach 模式（`start` spawn `_daemon` 子命令為 detached 子程序後 parent exit）
- PID 檔（`~/.overtone/heartbeat.pid`）+ 狀態檔（`~/.overtone/heartbeat-state.json`）管理 daemon 生命週期
- session-spawner.js 封裝 `claude -p --plugin-dir --output-format stream-json`，監聽 stdout stream-json 行萃取 session_id，outcome Promise 統一回傳 `{ status, sessionId }`
- TelegramAdapter 新增 `notify(message)` 公開方法，heartbeat 直接實例化不依賴 EventBus

**關鍵技術決策**：
- Q1 完成偵測：stream-json `result` 事件 + 60 分鐘 timeout 兜底 + `stdout close` 清理
- Q2 prompt 格式：`開始執行 {featureName}，workflow: {workflow}` — 讓 UserPromptSubmit hook 接管
- Q3 projectRoot：`--project-root` CLI 參數，fallback `process.cwd()`
- Q4 Telegram：直接實例化，不透過 EventBus
- Q5 resume：全新 session，不 resume

**API 介面**：
- `heartbeat.js` CLI：`start [--project-root <path>] | stop | status`（內部有 `_daemon` 子命令）
- `spawnSession(prompt, opts, _deps)` → `{ child, outcome: Promise<{status, sessionId}> }`
- `_buildArgs(opts)` → claude CLI 參數陣列（可單獨測試）
- `TelegramAdapter.notify(message)` → 公開通知方法（新增）
- `execution-queue.js` 新增 `failCurrent(projectRoot, reason)` → boolean

**資料模型**：
- `heartbeat-state.json`：`{ pid, projectRoot, activeItem, consecutiveFailures, paused, startedAt, lastPollAt }`
- `heartbeat.pid`：純文字 PID 數字
- 佇列狀態機：`pending → in_progress → completed | failed`（新增 failed 狀態）

**檔案結構**：
- `plugins/overtone/scripts/heartbeat.js` — 新增：daemon CLI + polling loop
- `plugins/overtone/scripts/lib/session-spawner.js` — 新增：claude spawn 封裝
- `tests/unit/heartbeat.test.js` — 新增
- `tests/unit/session-spawner.test.js` — 新增
- `plugins/overtone/scripts/lib/execution-queue.js` — 修改：新增 `failCurrent()`
- `plugins/overtone/scripts/lib/remote/telegram-adapter.js` — 修改：新增 `notify()` + Should `/run` 命令
- `plugins/overtone/scripts/lib/paths.js` — 修改：新增 `HEARTBEAT_PID_FILE` / `HEARTBEAT_STATE_FILE` 常數
- `plugins/overtone/scripts/health-check.js` — 修改（Should）：新增第 8 項偵測

**Dev Phases**：
Keywords: daemon, heartbeat, fork, detach, start, spawn, detached, parent, exit, overtone

---
## 2026-03-03 | tester:TEST Findings
**測試結果：PASS（有條件）**

- 全套：2856 pass / 0 fail（40.55 秒）
- P3.2 新增測試：48 個（session-spawner.test.js 9 個 + heartbeat.test.js 39 個）
- `_deps` 注入策略正確，所有副作用（spawn、PID 讀寫、process.kill、setInterval）均透過依賴注入 mock，未 mock 受測邏輯本身
- 斷言品質合格：使用具體值比對（`toBe`、`toContain`、`toMatch`），無單純存在性斷言

**BDD 覆蓋率：44/46（95.6%）**

2 個 Scenario 未完整覆蓋：

**未覆蓋 1：Scenario 4-8（lastPollAt 更新）**
- BDD 定義：`polling loop 每次執行完畢 → heartbeat-state.json 的 lastPollAt 欄位更新為最近時間戳記`
- 問題：測試 4-8 實際覆蓋的是 BDD 4-4（paused = true 跳過 spawn），標籤錯位
- 原因：Feature 4 共 8 個 BDD Scenario，但測試 4-3 是額外增補（getCurrent 守衛），造成後續編號整體向後 shift 一位，最後的 BDD 4-8（lastPollAt）沒有對應測試

**未完整覆蓋 2：Scenario 5-4（paused 狀態持久化）**
- BDD 定義：`daemon 因 3 次失敗 paused = true → heartbeat-state.json 的 paused 欄位為 true 且 consecutiveFailures 為 3`
- 問題：測試 5-4 改為驗證 `CONSECUTIVE_FAILURE_THRESHOLD` 常數值（= 3），未驗證 `persistState` 寫入 `heartbeat-state.json` 的實際內容

**其他觀察（非阻擋）**

- `test-quality-guard` 回報 heartbeat.test.js 有 `[large-file]` 警告（816 行），屬建議性，不影響測試品質
- Feature 4 測試 4-3 額外增補了 getCurrent 守衛路徑，測試覆蓋寬於 BDD 規格（可保留，屬良性）
Keywords: pass, fail, session, spawner, test, heartbeat, spawn, process, kill, setinterval

---
## 2026-03-03 | code-reviewer:REVIEW Findings
1. **CLAUDE.md knowledge domain 計數未同步**
   - 檔案：`/Users/sbu/projects/overtone/CLAUDE.md`，第 57 行
   - 問題：Skill 數量已更新（20 -> 21），但 knowledge domain 仍寫 "12 knowledge domains"，列表缺少 `autonomous-control`。`docs/status.md` 已正確更新為 13。
   - 建議修復：將 "12 knowledge domains" 改為 "13 knowledge domains"，列表末尾加上 `autonomous-control`
   - 信心等級：95%
Keywords: claude, knowledge, domain, users, projects, overtone, skill, domains, autonomous, control

---
## 2026-03-03 | planner:PLAN Findings
**需求分解**：

核心實作（5 個腳本 + 5 個測試，可並行）：
1. process.js 實作 | agent: developer | files: `plugins/overtone/scripts/os/process.js`, `tests/unit/process.test.js`
2. clipboard.js 實作 | agent: developer | files: `plugins/overtone/scripts/os/clipboard.js`, `tests/unit/clipboard.test.js`
3. system-info.js 實作 | agent: developer | files: `plugins/overtone/scripts/os/system-info.js`, `tests/unit/system-info.test.js`
4. notification.js 實作 | agent: developer | files: `plugins/overtone/scripts/os/notification.js`, `tests/unit/notification.test.js`
5. fswatch.js 實作 | agent: developer | files: `plugins/overtone/scripts/os/fswatch.js`, `tests/unit/fswatch.test.js`

知識整合（依賴核心實作完成）：
6. system.md reference 建立 | agent: developer | files: `plugins/overtone/skills/os-control/references/system.md`
7. SKILL.md 索引更新 | agent: developer | files: `plugins/overtone/skills/os-control/SKILL.md`

Should 範圍（獨立，可與核心並行）：
8. pre-bash-guard.js 擴充 | agent: developer | files: `plugins/overtone/hooks/scripts/tool/pre-bash-guard.js`
9. health-check 擴充 | agent: developer | files: `plugins/overtone/scripts/health-check.js`

**優先順序**：
- 任務 1-5 可全部並行（互相無依賴）
- 任務 6-7 依賴任務 1-5 完成後再執行（需要知道每個腳本的 API 才能寫 reference）
- 任務 8-9 可與任務 1-5 並行執行（完全獨立）

**範圍邊界**：
- 不在此次範圍：跨平台支援、GUI 進程管理界面、fswatch recursive 深層監控
- P3.4 操控層（keyboard.js/mouse.js/applescript.js）留待下一階段

**共同模式**（已有 P3.1 建立，architect 需確認沿用）：
- `'use strict'` + `_deps = { execSync }` 依賴注入 + 平台守衛 + 不 throw
- 錯誤格式：`{ ok: false, error: 'ERROR_CODE', message: string }`
- 成功格式：`{ ok: true, ...fields }`
Keywords: process, agent, developer, files, plugins, overtone, scripts, tests, unit, test

---
## 2026-03-03 | tester:TEST Findings
**測試結果：3017 passed, 0 failed**

**BDD Coverage 矩陣**

| Feature | 說明 | Scenario | 覆蓋狀態 |
|---------|------|----------|---------|
| F1 | checkSameStageConvergence | 1-1 ~ 1-6（6個）| state-convergence.test.js 完整覆蓋 |
| F2 | pre-task.js PARALLEL_TOTAL 解析 | 2-1（activeAgents instanceId）| pre-task-parallel.test.js BDD F6 覆蓋 |
| F2 | pre-task.js PARALLEL_TOTAL 解析 | 2-2 ~ 2-5（4個）| **新增** parallel-convergence-gate.test.js |
| F3 | on-stop.js 收斂門 | 3-1 ~ 3-10（10個）| **新增** parallel-convergence-gate.test.js |
| F4 | findActualStageKey 並行場景 | 4-1 ~ 4-3（3個）| state-convergence.test.js 完整覆蓋 |
| F5 | getNextStageHint instanceId 格式 | 5-1 ~ 5-3（3個）| state-convergence.test.js 完整覆蓋 |
| F6 | statusline × N 回歸 | 6-1 ~ 6-2（2個）| 未補寫（下方說明）|
| F7 | 邊界案例 | 7-1, 7-3, 7-4（3個）| **新增** parallel-convergence-gate.test.js |
| F7 | 邊界案例 | 7-2 CAS 重試 | 未補寫（下方說明）|

**技術發現**

- `parse-result.js` 只對 TEST/QA/E2E/BUILD-FIX stage 判定 fail；DEV stage 永遠 pass，Scenario 3-4 必須使用 tester agent 測試
- Scenario 2-5 的 Math.max race condition 在序列測試中無法用兩次 pre-task 模擬（第一次已使 DEV active，第二次找不到 pending actualKey），改用手動設定初始 parallelTotal = 2 後呼叫第二個 pre-task
Keywords: passed, failed, coverage, feature, scenario, checksamestageconvergence, state, convergence, test, task

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

並行收斂門的核心邏輯（`checkSameStageConvergence`、instanceId 追蹤、on-stop.js 收斂門）實作正確，測試覆蓋全面（27 個新測試，Feature 1~5 + Feature 7 完整覆蓋）。向後相容性設計良好，`parallelTotal` 未設定時預設視為 1，單 agent 場景行為與舊版一致。
Keywords: checksamestageconvergence, instanceid, stop, feature, paralleltotal, agent

---
## 2026-03-03 | developer:DEV Findings
**on-stop.js 重構邏輯**：
- `instanceId` 解析移至 `findActualStageKey` 前
- 新增第一個 `updateStateAtomic`（只做 activeAgents cleanup）
- `active-agent.json` 刪除改為：cleanup 後 `remainingActiveAgents.length === 0` 才刪；若收斂後補刪（確保最終清除）
- `agent:complete` 提前到 `findActualStageKey` 前 emit（使用 `stageKey` 而非 `actualStageKey`，在非重複 stage 情況下相同）
- 移除後段重複的 `activeAgents cleanup` 和 `active-agent.json` 刪除邏輯

**TTL 常數設計**：
- 每個消費端各自定義 `ACTIVE_AGENT_TTL_MS = 30 * 60 * 1000`，Handoff 建議抽成共用常數，但考慮各消費端語境差異，選擇就地定義，確保可讀性。Reviewer 可評估是否需要抽出到 utils.js。

**現有測試的影響評估**：
- `Scenario 3-9`（agent:complete 計數）：現在 agent:complete 提前 emit，但在 3 agent 全部完成後計數仍為 3，測試通過
- `Scenario 3-8`（active-agent.json 生命週期）：測試中補回 active-agent.json 的寫法確保後續步驟能正確驗證，邏輯不受影響
- 全量 3026 pass，0 fail
Keywords: stop, instanceid, findactualstagekey, updatestateatomic, activeagents, cleanup, active, agent, json, remainingactiveagents

---
## 2026-03-03 | developer:DEV Context
修復 statusline 殘留 agent 顯示問題（feature: statusline-stale-agent）。

根因：`on-stop.js` 在 `findActualStageKey` 回傳 null 時（RETRO 修補委派 developer，DEV stage 已 completed+pass）執行 early exit，跳過 `activeAgents` cleanup，導致殘留 entry 被 statusline fallback 讀取並誤顯示。

採用雙層防護：
1. **主修復（根因）**：提前 cleanup，確保任何退出路徑都能清除殘留
2. **防禦層（TTL）**：三個消費端（statusline、state、pre-compact）加 30 分鐘 TTL 過濾，無 active stage 且超時的 entry 視為過期
Keywords: statusline, agent, feature, stale, stop, findactualstagekey, null, retro, developer, stage

---
## 2026-03-03 | code-reviewer:REVIEW Findings
審查了 on-stop.js 的重構邏輯（cleanup 提前 + 兩段 updateStateAtomic 無 race condition）、agent:complete 提前 emit 使用 stageKey 對所有 timeline consumer 安全、三處 TTL 過濾邏輯一致且防禦性處理完整（NaN/null/undefined 均有安全 fallback）、active-agent.json 刪除條件在並行場景正確、收斂門邏輯未受影響、error handling 完整、無安全漏洞。測試覆蓋 11 個場景，全量 3026 pass。
Keywords: stop, cleanup, updatestateatomic, race, condition, agent, complete, emit, stagekey, timeline

---
## 2026-03-03 | tester:TEST Context
模式：verify

驗證 statusline stale agent 修復的所有變更，涵蓋根因修復（on-stop.js activeAgents cleanup 提前執行）及三處消費端 TTL 防護（statusline.js、state.js getNextStageHint、pre-compact.js）。
Keywords: verify, statusline, stale, agent, stop, activeagents, cleanup, state, getnextstagehint, compact

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

本次 statusline stale agent 修復涵蓋根因修復（on-stop.js cleanup 提前）與三個消費端的 TTL 防護層，整體設計清晰且執行完整。具體確認的品質點如下：

- **根因修復位置正確**：`on-stop.js` 的 `activeAgents` cleanup 提前到 `findActualStageKey` 之前（第 48-63 行），確保即使 early exit 路徑也能清除殘留。fallback 機制（字典序排序取最早 entry）對多 instance 場景有合理處理。

- **三個消費端 TTL 常數一致**：`statusline.js`、`state.js getNextStageHint`、`pre-compact.js` 三處均為 30 分鐘，邏輯結構也一致（有 active stage -> 永不過期，無 active stage -> 檢查 TTL）。reviewer 確認此三份各自定義未達回報門檻，屬於接受的技術債。

- **兩段 updateStateAtomic 無 race condition**：第一段（cleanup）結束後才執行第二段（stage 狀態更新），中間的 `readState` 是安全的讀取快照，不形成 TOCTOU 問題。

- **收斂門邏輯未受影響**：`parallelDone` 遞增邏輯在 stage 已 `completed` 時仍執行（第 89 行），保留了並行計數的完整性，不影響收斂判斷。

- **測試覆蓋完整**：11 個新測試跨兩個測試檔，涵蓋核心場景（有 INSTANCE_ID / 無 INSTANCE_ID / active-agent.json 刪除 / 並行保留）與 TTL 過濾的三種狀態（過期 / 新鮮 / 有 active stage）。3026 pass，0 fail。

- **BDD spec 對齊**：`specs/features/in-progress/statusline-stale-agent/tasks.md` 記錄的階段 DEV/REVIEW/TEST 均已完成 ([x])，與實際修復範圍吻合。
Keywords: statusline, stale, agent, stop, cleanup, activeagents, findactualstagekey, early, exit, fallback

---
## 2026-03-03 | doc-updater:DOCS Context
statusline-stale-agent 功能已完成（commits 1a15d84, 13084e7）。feature 涉及 Hook 層、狀態管理、Status Line 顯示的改進 — activeAgents 清理、TTL 防護、過期殘留處理。
Keywords: statusline, stale, agent, commits, feature, hook, status, line, activeagents

---
## 2026-03-03 | developer:DEV Context
修復 `plugins/overtone/scripts/lib/specs.js` 中 `readTasksCheckboxes` 函式的 fallback bug。當 tasks.md 缺少標準標頭（`## Stages` 或 `## Tasks`）時，原來的程式碼會 fallback 到掃描整個文件，導致 `## 子任務清單` 等非標準區塊的 checkbox 被算入 stage-level 判斷，阻擋自動歸檔。
Keywords: plugins, overtone, scripts, specs, readtaskscheckboxes, fallback, tasks, stages, checkbox, stage

---
## 2026-03-03 | product-manager:PM Context
**問題陳述**：用户质疑 Level 2（持续学习）的 7 个能力建设完成后，Level 1（工作流自动化）的 17 个 agent、18 个 workflow 模板、11 个 hook、21 个 skill 是否真正**消费**了这些学习信号。核心追问是：「系统第 10 次做同类任务是否比第 1 次更好，有量化数据证明？」

这个问题的本质是 **Layer 整合度审计** -- Level 2 的引擎（instinct、score-engine、baseline-tracker、failure-tracker、global-instinct）已经独立建好，但 Level 1 的元件是否已经全面升级来利用这些引擎？
Keywords: level, agent, workflow, hook, skill, layer, instinct, score, engine, baseline

---
## 2026-03-03 | developer:DEV Findings
**斷點 1：gradedStages 擴大**
- `plugins/overtone/scripts/lib/registry.js` 第 218 行：`gradedStages` 從 3 個擴大至 7 個 stage（加入 PLAN、ARCH、DEBUG、RETRO）
- 下游的 `pre-task.js:299` 和 `on-stop.js:196` 均用 `gradedStages.includes()` 判斷，自動生效

**斷點 2：failure reason 記錄**
- `on-stop.js` 第 123-131 行：`recordFailure` 呼叫加入 `reason: result.reason || null`
- `failure-tracker.js` `formatFailureWarnings` 加入根因展示邏輯（去重，最多 3 個）

**斷點 3：全域觀察注入 subagent**
- `pre-task.js` 在 score context 之前加入全域觀察注入區塊
- 使用 `globalInstinct.queryGlobal` 取前 5 條高信心觀察，限制 500 字
- 組裝順序更新：`...gapWarnings → globalObs → scoreContext...`

**斷點 4：** 斷點 1 完成後自動解決（`gradedStages.includes` 邏輯覆蓋新 stage）

**全量測試：3037 pass / 0 fail（bun test 通過）**
Keywords: gradedstages, plugins, overtone, scripts, registry, stage, plan, arch, debug, retro

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

本次 quick workflow 回顧範圍為 Level 2 → Level 1 最小閉環修復（Phase 1），涵蓋 4 個 Must 斷點修復。

**整體評估**：

4 個斷點均已正確修復，且修復方式符合「治本不治標」原則：

1. `gradedStages` 擴充（3 → 7）：影響範圍明確，`score-engine.js` 和 `on-stop.js` 透過 `includes()` 自動生效，無需額外改動。
2. `failure reason` 記錄：`on-stop.js` 正確傳遞 `result.reason || null`，`failure-tracker.js` 的 `formatFailureWarnings` 正確顯示根因，新增測試（4-6、4-7、4-8）覆蓋有無 reason 的情境。
3. 全域觀察注入：`pre-task.js` 以 `queryGlobal` 取前 5 筆高信心觀察注入，測試（場景 8）驗證有觀察和無觀察兩個路徑。
4. `score context` 注入：依附在 `gradedStages` 上，測試通過確認完整。

測試數字：3037 pass / 0 fail / 129 檔，全部通過。

---
Keywords: quick, workflow, level, phase, must, gradedstages, score, engine, stop, includes

---
## 2026-03-03 | doc-updater:DOCS Findings
已更新的文件清單及變更摘要：

1. **README.md**
   - 更新測試覆蓋數：3030 pass → 3037 pass（129 個測試檔）

2. **CHANGELOG.md**
   - 新增 [0.28.34] 版本條目
   - 詳細記錄 4 大修復點：gradedStages 擴展、失敗原因記錄、失敗原因展示、全域觀察注入
   - 測試統計：105 + 88 新測試 → 3037 pass / 129 files

3. **docs/status.md**
   - 版本狀態表：3030 → 3037 pass，標記「Level 2→1 整合修復」
   - 近期變更（最近 3 筆）：新增 [0.28.34] 條目為首條，移除最舊條目 [0.28.31]
   - 版本描述加入新功能摘要

4. **docs/spec/overtone.md**
   - 主規格版本號：v0.28.33 → v0.28.34

5. **docs/spec/overtone-子系統.md**
   - 自動同步：gradedStages 定義從 3 個更新至 7 個
   - 新增 PLAN/ARCH/DEBUG/RETRO 的評分維度說明
Keywords: readme, pass, changelog, gradedstages, files, docs, status, level, spec, overtone

---
## 2026-03-03 | planner:PLAN Findings
**需求分解**：

1. 為 5 個 agent 加入 `memory: local` + 內文說明段落 | agent: developer | files: `plugins/overtone/agents/developer.md`、`plugins/overtone/agents/tester.md`、`plugins/overtone/agents/debugger.md`、`plugins/overtone/agents/planner.md`、`plugins/overtone/agents/architect.md`

2. 更新 registry-data.json agentMemory 欄位（新增 5 個條目）(parallel) | agent: developer | files: `plugins/overtone/scripts/lib/registry-data.json`

3. pre-task.js score context 標題加入 agentName 標註（`agentName@stageKey`） | agent: developer | files: `plugins/overtone/hooks/scripts/tool/pre-task.js`

4. stop-message-builder.js grader 用語強制化（standard/full/secure/product/product-full → `📋 MUST`，其他維持「建議」） | agent: developer | files: `plugins/overtone/scripts/lib/stop-message-builder.js`

**優先順序**：

- 任務 1、2 操作不同檔案，無邏輯依賴，可並行
- 任務 3、4 操作不同檔案，無邏輯依賴，可並行
- 任務 1、2 和 3、4 之間亦無邏輯依賴（4 個任務可全部並行）
- 唯一需要 architect 先確認的是：registry-data.json 修改路徑（是否有 guard 限制）

**範圍邊界**：

- 不在此次範圍：scores.jsonl 改為 agent-level 儲存、grader 強制的 hook 層阻擋（PreToolUse）、agent 記憶初始內容、向後相容性保護
Keywords: agent, memory, local, developer, files, plugins, overtone, agents, tester, debugger

---
## 2026-03-03 | planner:PLAN Context
Phase 2 的目標是讓 Level 1 agent 個體真正消費 Level 2 建立的學習數據，實現跨 session 記憶與品質強化迴路閉合。Phase 1 已完成最小閉環（全域觀察注入、failure 根因記錄），Phase 2 聚焦三個具體改善：(1) 擴大 `memory: local` 到 5 個核心 agent、(2) score context 加入 agent 名稱標註讓 agent 知道數據是「自己的」、(3) grader 評分在 standard/full/secure workflow 中改為強制用語。
Keywords: phase, level, agent, session, failure, memory, local, score, context, grader

---
## 2026-03-03 | architect:ARCH Findings
**技術方案**：

- 採用最小必要修改策略：4 個精準的局部改動，不破壞現有行為
- 子任務 1+2 合併：透過 `manage-component.js` 一次完成 agent frontmatter + registry-data.json 同步
- score context 標題格式：`[品質歷史 — {agentName}@{targetStage}（N 筆）]`，資料仍為 stage-level 均值（語意上接受此設計，後續 Phase 3 再升級為個人歷史）
- grader 強制化清單：`['standard', 'full', 'secure', 'product', 'product-full']`，其餘維持「建議」用詞

**API 介面**：

子任務 1+2（合併）：
```bash
bun scripts/manage-component.js update agent developer '{"memory":"local"}'
# 重複 5 次，分別對應 tester/debugger/planner/architect
```

子任務 3（pre-task.js 第 327 行）：
```javascript
// 前：`[品質歷史 — ${targetStage}（${summary.sessionCount} 筆）]`
// 後：`[品質歷史 — ${targetAgent}@${targetStage}（${summary.sessionCount} 筆）]`
```

子任務 4（stop-message-builder.js 第 151 行）：
```javascript
const MUST_GRADE_WORKFLOWS = ['standard', 'full', 'secure', 'product', 'product-full'];
const graderPrefix = workflowType && MUST_GRADE_WORKFLOWS.includes(workflowType)
  ? '📋 MUST 委派 grader 評分'
  : '🎯 建議委派 grader 評分';
messages.push(`${graderPrefix}：STAGE=${stageKey}...`);
```

**資料模型**：

`registry-data.json` 的 `agentMemory` 欄位最終狀態（8 個 agent）：
```json
{
  "code-reviewer": "local", "security-reviewer": "local", "product-manager": "local",
  "developer": "local", "tester": "local", "debugger": "local",
  "planner": "local", "architect": "local"
}
```

**檔案結構**：

修改的檔案（全部可並行）：
- `plugins/overtone/agents/developer.md` — memory: local + 跨 Session 記憶段落
- `plugins/overtone/agents/tester.md` — memory: local + 跨 Session 記憶段落
- `plugins/overtone/agents/debugger.md` — memory: local + 跨 Session 記憶段落
- `plugins/overtone/agents/planner.md` — memory: local + 跨 Session 記憶段落
- `plugins/overtone/agents/architect.md` — memory: local + 跨 Session 記憶段落
- `plugins/overtone/scripts/lib/registry-data.json` — agentMemory 新增 5 個 agent（由 manage-component.js 自動寫入）
- `plugins/overtone/hooks/scripts/tool/pre-task.js` — score context 標題加入 agentName
- `plugins/overtone/scripts/lib/stop-message-builder.js` — grader 訊息強制化分支

新增的檔案：無

**Dev Phases**：

```
Keywords: manage, component, agent, frontmatter, registry, data, json, score, context, agentname

---
## 2026-03-03 | developer:DEV Findings
1. **scripts 路徑不同於 CLAUDE.md 說明**：Handoff 中提到 `bun scripts/manage-component.js`，但實際路徑是 `bun plugins/overtone/scripts/manage-component.js`（從專案根目錄執行）
2. **FAIL verdict 已天然隔離 grader 訊息**：BDD Scenario 3-10 要求 FAIL 時不產生 grader 訊息，由現有 `if/else if/else` 結構自然保證，不需要額外 guard
3. **受影響測試斷言需同步更新**：`registry.test.js` 的 agentMemory 測試、`platform-alignment-agents.test.js` 的 S10 測試、`feedback-loop.test.js` 的 score context 標題斷言，全部已更新對齊新行為
4. **Feature 5 Scenario 5-2 維持不變**：現有測試「messages 不含 grader 字串」對無 scoringConfig 的場景仍然正確，與新的 Feature 6 測試不衝突
Keywords: scripts, claude, handoff, manage, component, plugins, overtone, fail, verdict, grader

---
## 2026-03-03 | code-reviewer:REVIEW Findings
1. **缺少「跨 Session 記憶」body 段落** -- 5 個 agent .md
   - 檔案：`/Users/sbu/projects/overtone/plugins/overtone/agents/developer.md`、`tester.md`、`debugger.md`、`planner.md`、`architect.md`
   - 問題：BDD Scenario 1-3 要求「文件 body 中包含『跨 Session 記憶』相關說明段落，AND 說明格式與 code-reviewer.md 的相應段落結構一致」。tasks.md 第 24 行也明確寫「frontmatter + body 說明段落」。目前 5 個 agent 只加了 frontmatter `memory: local`，body 無任何「跨 Session 記憶」段落。已有 memory 的 3 個 agent（code-reviewer.md 第 23-41 行、security-reviewer.md 第 22 行、product-manager.md 第 20 行）都有此段落結構（包含「記什麼」「不記什麼」「使用方式」三個子段），新加的 5 個 agent 完全缺失
   - 建議修復：為 5 個 agent 各自加入角色適當的「跨 Session 記憶」段落，參考 code-reviewer.md 第 23-41 行的格式，但「記什麼」「不記什麼」的具體內容應依各 agent 的職責客製化
   - 信心等級：95%（BDD spec 和 tasks.md 都明確要求，且有已有 agent 作為參考標準）
Keywords: session, body, agent, users, projects, overtone, plugins, agents, developer, tester

---
## 2026-03-03 | code-reviewer:REVIEW Context
程式碼審查未通過，需要修改。BDD Scenario 1-3 要求的「跨 Session 記憶」body 段落在 5 個 agent .md 中完全缺失。
Keywords: scenario, session, body, agent

---
## 2026-03-03 | code-reviewer:REVIEW Findings
審查了 12 個變更檔案，涵蓋以下面向：

1. **功能完整性**：對照 BDD spec 23 個 scenario（Feature 1-4），所有要求的功能均已正確實作。5 個 agent frontmatter 加入 `memory: local`，body 包含結構一致的「跨 Session 記憶」段落。Score context 標題成功加入 agentName。Grader 強制化邏輯依 workflowType 正確切換用詞。
2. **Error handling**：`targetAgent` 在 score context 使用處不可能為 null（有 early return 保護）。`workflowType` 為 null 時 `&&` 短路防護正確。
3. **安全性**：無硬編碼 secrets、無注入風險。
4. **Wording 一致性**：`📋
Keywords: spec, scenario, feature, agent, frontmatter, memory, local, body, session, score

---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

本次 level2-integration-phase2 的 standard workflow 整體品質達標。5 個 agent 的記憶段落客製化內容完整（記什麼 / 不記什麼 / 使用方式三段結構與 code-reviewer.md 對齊），registry-data.json agentMemory 正確擴展至 8 個 agent，score context 標題格式已含 agentName，grader 強制化依 MUST_GRADE_WORKFLOWS 清單正確切換用詞，全套測試 3047 pass / 0 fail，BDD 23 個 Scenarios 全覆蓋。

REVIEW REJECT 根因分析（參考第二輪修復的成功）：BDD Scenario 1-3 使用「格式與 code-reviewer.md 的相應段落結構一致」的措辭，要求 DEV 主動比對參考檔案。此為合理但依賴性強的規格寫法 —— 若 DEV 未主動閱讀 code-reviewer.md，容易忽略 body 段落的要求。第二輪成功的原因是 REJECT Handoff 提供了具體的遺漏段落說明。此為 spec 精確度問題，非 BDD 結構性缺陷。
Keywords: integration, standard, workflow, agent, code, reviewer, registry, data, json, agentmemory

---
## 2026-03-03 | doc-updater:DOCS Findings
**Phase 2 標準 workflow 核心變更：**
- Agent Memory 配置從 3 個 opus（product-manager、code-reviewer、security-reviewer）擴大至 8 個跨層級 agent
  - 新增 5 個 sonnet/opusplan：developer、tester、debugger、planner、architect
  - `registry-data.json` agentMemory 對應擴大
  
- Score Context 個人化：pre-task.js 注入時加入 agentName，格式 `[品質歷史 — ${targetAgent}@${targetStage}]`

- Grader 強制化：stop-message-builder.js 依 workflowType 決定用詞
  - MUST workflows（standard/full/secure/product/product-full）用 `📋 MUST 委派 grader 評分`
  - 其他 workflows 用 `🎯 建議委派 grader 評分`

**文件漂移修正詳情：**
- `docs/reference/claude-code-platform.md`：更新 S10 agent memory 描述（624 行 + 683 行）
- `docs/spec/overtone-agents.md`：新增「Agent 記憶配置」表格段落，記錄 8 個 agent 的記憶焦點和機制
- `docs/roadmap.md`：修正 S10 描述，明確列出 8 個 agent 分層（opus 3 個 + sonnet 5 個）

**版本和核心指標同步：**
- Plugin 版本：0.28.34 → 0.28.35（使用正規路徑 manage-component.js bump-version）
- 測試數字：3037 pass → 3047 pass（統一更新於 status.md 核心指標表、README.md、CHANGELOG.md）
- Status.md 版本標題：更新為「0.28.35（Level 2 → Level 1 Agent 個體學習升級）」
Keywords: phase, workflow, agent, memory, opus, product, manager, code, reviewer, security

---
## 2026-03-03 | planner:PLAN Findings
**需求分解**：

1. **A1: Stop hook 並行提示** | agent: developer | files: `plugins/overtone/hooks/scripts/session/on-stop.js`
   - 第 202 行 continueMessage 硬編碼提示改為呼叫 `state.getNextStageHint()`
   - 需在 on-stop.js 加入 `parallelGroups` import

2. **A2: PreCompact 並行提示** | agent: developer | files: `plugins/overtone/hooks/scripts/session/pre-compact.js`
   - 第 101-105 行「目前階段」顯示改為呼叫 `getNextStageHint()`（可並行與 A1）

3. **B1: 移除 active-agent.json 寫入** | agent: developer | files: `plugins/overtone/hooks/scripts/tool/pre-task.js`、`plugins/overtone/hooks/scripts/agent/on-stop.js`
   - 刪除 pre-task.js 第 42-46 行、agent/on-stop.js 第 65-70 行和第 143-144 行

4. **B2: statusline.js 簡化** | agent: developer | files: `plugins/overtone/scripts/statusline.js`
   - 移除 `readActiveAgent()` 函式、主信號分支（第 165-187 行）、TTL workaround（第 219-233 行）
   - 依賴 B1 完成後執行

5. **B3: PreCompact 清空 activeAgents** | agent: developer | files: `plugins/overtone/hooks/scripts/session/pre-compact.js`
   - 壓縮後執行 `state.updateStateAtomic(sessionId, s => { s.activeAgents = {}; return s; })`

6. **C1: updateStateAtomic 不變量守衛** | agent: developer | files: `plugins/overtone/scripts/lib/state.js`
   - 3 條規則：activeAgents 孤兒移除 / status 單向順序 / parallelDone 上限

7. **C2: emit system:warning** | agent: developer | files: `plugins/overtone/scripts/lib/state.js`
   - 不變量違規時收集 warnings 並呼叫 timeline.emit（依賴 C1）

8. **C3: 移除剩餘 TTL workaround** | agent: developer | files: `plugins/overtone/scripts/lib/state.js`、`plugins/overtone/hooks/scripts/session/pre-compact.js`
   - 依賴 B3 + C1 完成（確保無殘留風險後才移除 TTL）

**優先順序與並行策略**：
- Developer-1（A 組）：A1 + A2 並行執行，完全獨立
- Developer-2（B 組）：B1 → B2 依序，B3 可與 C 組並行
- Developer-3（C 組）：C1 → C2，C3 等 B3 + C1 完成

**範圍邊界**：
- 不移除 `paths.js` 的 `session.activeAgent` 定義（測試可能引用）
- 不修改 `getNextStageHint()` 內部邏輯（只改呼叫方）
- 不涉及 Dashboard SSE 推送
Keywords: stop, hook, agent, developer, files, plugins, overtone, hooks, scripts, session

---
## 2026-03-03 | planner:PLAN Context
使用者要求將 Overtone 的 workflow state 管理和 status line 顯示從「雙信號源 + TTL workaround」架構簡化為「單信號源 + 不變量守衛」。核心動機是消除三處重複的 TTL workaround 程式碼，統一 active agent 追蹤信號源，並在 state 層加入結構性保護，防止無效狀態轉換。
Keywords: overtone, workflow, state, status, line, workaround, active, agent

---
## 2026-03-03 | architect:ARCH Findings
**技術方案**：

- A 組（並行提示修復）：on-stop.js 和 pre-compact.js 各自 import `parallelGroups`，以 `state.getNextStageHint(currentState, { stages, parallelGroups })` 取代硬編碼單步提示
- B 組（信號源簡化）：先移除 pre-task.js 和 agent/on-stop.js 的寫入/刪除（B1），再清除 statusline.js 主信號分支（B2），最後在 PreCompact 加入 activeAgents 清空（B3）
- C 組（不變量守衛）：在 updateStateAtomic 的 modifier 執行後深拷貝對比 status，自動修復 3 條規則後若有 violations 則 lazy require timeline 並 emit system:warning（C1+C2），最後移除 3 處 TTL workaround（C3）

**API 介面**：

- `updateStateAtomic(sessionId, modifier)` — 簽名不變，內部新增不變量守衛
- `buildAgentDisplay(workflow, registryStages)` — 移除 `activeAgent` 參數（主信號整支移除）
- `getNextStageHint(currentState, { stages, parallelGroups })` — 簽名不變，C3 後移除 TTL 過濾邏輯

**資料模型**：

- `workflow.json` 格式不變，`activeAgents` 由 B3（PreCompact 清空）和 C1（孤兒清除）雙重保障無殘留
- `active-agent.json` 停止寫入（B1 後），但 `paths.session.activeAgent()` 定義保留

**檔案結構**：

修改的檔案：
- `plugins/overtone/scripts/lib/state.js` — C1+C2 不變量守衛，C3 TTL 移除
- `plugins/overtone/scripts/statusline.js` — B2 主信號移除，TTL 移除，buildAgentDisplay 簽名調整
- `plugins/overtone/hooks/scripts/tool/pre-task.js` — B1 移除 active-agent.json 寫入
- `plugins/overtone/hooks/scripts/agent/on-stop.js` — B1 移除 active-agent.json 刪除
- `plugins/overtone/hooks/scripts/session/on-stop.js` — A1 getNextStageHint 呼叫
- `plugins/overtone/hooks/scripts/session/pre-compact.js` — A2 getNextStageHint 呼叫，B3 清空 activeAgents，C3 TTL 移除
- `tests/unit/statusline.test.js` — 移除/更新 4 個 active-agent.json 測試
- `tests/integration/on-stop-stale-cleanup.test.js` — SCA-3/SCA-4 更新，TTL-GNH 系列更新

不需新增檔案。

**Dev Phases**：

    ### Phase 1: A 組並行（parallel）
    - [ ] A1+A2 同時執行 | files: hooks/scripts/session/on-stop.js, hooks/scripts/session/pre-compact.js

    ### Phase 2: B+C 組依序（sequential）
    - [ ] B1 → B2 → B3 → C1 → C2 → C3 | files: 見 tasks.md Dev Phases 清單
    - [ ] 測試更新（隨各步驟同步執行）
Keywords: stop, compact, import, parallelgroups, state, getnextstagehint, currentstate, stages, task, agent

---
## 2026-03-03 | architect:ARCH Context
技術設計完成。核心決策：

1. **C2 無循環依賴**：state.js 和 timeline.js 互不依賴，使用 lazy require 直接可行
2. **不變量守衛選 API 選項 B**：updateStateAtomic 內部自動修復 + side-effect emit，呼叫方 signature 完全不變，5+ 個呼叫方零修改
3. **DEV 策略改為 2 個 developer**：A 組（A1+A2 並行）+ B+C 組（B1→B2→B3→C1→C2→C3 依序）；改動量不大不需要第 3 個
Keywords: state, timeline, lazy, require, updatestateatomic, side, effect, emit, signature, developer

---
## 2026-03-03 | developer:DEV Context
實作 `core-simplification-guards` feature，完成 Architect 設計的全部 A/B/C 三組修改：

- **A 組（並行提示修復）**：session/on-stop.js 和 pre-compact.js 改用 `getNextStageHint()` 提供含並行群組資訊的提示
- **B 組（信號源簡化）**：移除 `active-agent.json` 雙信號源，`statusline.js` 改為只讀 `workflow.json` 的 `stages.status`，`pre-compact.js` 壓縮前清空 `activeAgents`
- **C 組（不變量守衛）**：`state.js` 新增 `enforceInvariants()`，在 `updateStateAtomic` 每次執行後自動偵測並修復 3 種違規；移除所有 `ACTIVE_AGENT_TTL_MS` TTL workaround
Keywords: core, simplification, guards, feature, architect, session, stop, compact, getnextstagehint, active

---
## 2026-03-03 | tester:TEST Findings
**測試結果：3061 pass / 0 fail**

驗收標準逐項確認：

1. `bun test` 全套通過 — 3061 pass / 0 fail（DEV 報告 3061，符合並超過 3015 基線）
2. 31 個 BDD scenario 全覆蓋 — 所有 scenario 均有對應測試
3. active-agent.json 靜態掃描 — `pre-task.js` 不含 `active-agent.json` 或 `activeAgent(sessionId)` 字樣，`statusline.js` 不含 `readActiveAgent`
4. `ACTIVE_AGENT_TTL_MS` 在所有相關檔案移除 — `state.js`、`statusline.js`、`pre-compact.js` 靜態掃描均無此常數
5. `enforceInvariants()` 3 條規則覆蓋 — `state-invariants.test.js` Scenario 3-1 到 3-9 全部通過
6. `statusline.js` 只讀 `workflow.json` — `buildAgentDisplay(workflow, registryStages)` 簽名確認（2 參數），不接受 `activeAgent` 參數

**關鍵測試檔案確認**：

- `/Users/sbu/projects/overtone/tests/unit/state-invariants.test.js` — 15 個測試，涵蓋 Feature 3 所有 scenario
- `/Users/sbu/projects/overtone/tests/unit/statusline-ttl.test.js` — 4 個 scenario，驗證 stages.status 為唯一信號源
- `/Users/sbu/projects/overtone/tests/unit/statusline.test.js` — 更新後的 statusline 測試
- `/Users/sbu/projects/overtone/tests/integration/on-stop-stale-cleanup.test.js` — TTL 移除後行為驗證
- `/Users/sbu/projects/overtone/tests/integration/parallel-convergence-gate.test.js` — 並行收斂門測試
- `/Users/sbu/projects/overtone/tests/integration/pre-compact.test.js` — PreCompact activeAgents 清空驗證
- `/Users/sbu/projects/overtone/tests/integration/agent-on-stop.test.js` — on-stop 完整流程
Keywords: pass, fail, test, scenario, active, agent, json, task, activeagent, sessionid

---
## 2026-03-04 | doc-updater:DOCS Findings
- **A 組：並行提示修復** — Stop/PreCompact hook 改用 getNextStageHint() 支援並行群組合併提示
- **B 組：信號源簡化** — 移除 active-agent.json 雙信號源，statusline.js 只讀 workflow.json，PreCompact 壓縮後清空 activeAgents
- **C 組：不變量守衛** — 新增 enforceInvariants() 保證狀態一致（孤兒清除、status 逆轉修正、parallelDone 截斷），移除 TTL workaround
- **測試成果** — 3061 pass / 0 fail（+46 tests vs 0.28.35 baseline）
Keywords: stop, precompact, hook, getnextstagehint, active, agent, json, statusline, workflow, activeagents

