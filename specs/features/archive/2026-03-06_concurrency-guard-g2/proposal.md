# Proposal: concurrency-guard-g2

## 功能名稱

`concurrency-guard-g2`

## 需求背景（Why）

- **問題**：Overtone 的並發防護目前有三個已知風險（G1/G2/G3），其中 G2（orphan agent TTL 偵測）完全依賴 `sanitize()`（下一個 session 啟動時）和 `enforceInvariants() 規則 4`（下次 state 寫入時）被動修復。在同一 session 內若 agent crash 且 SubagentStop 未觸發、也沒有後續的 state 寫入，orphan activeAgents 會持續殘留整個 session，導致 `getNextStageHint()` 持續回傳「等待並行 agent 完成」，讓 Stop hook 的 soft-release 路徑不斷觸發而無法推進 workflow。
- **目標**：新增 G2 主動偵測：Stop hook 在 loop 繼續前掃描 activeAgents，清除超過 15 分鐘無更新的 orphan，並 emit `agent:orphan-cleanup` 事件。同時新增 health-check 第 20 項 `checkConcurrencyGuards`，靜態驗證 G1/G3 風險文件齊全 + runtime 掃描 active session 的 orphan。
- **優先級**：G2 是目前唯一在 session 內無法自癒的並發缺口，其他 L3.6 Acid Test 場景（長時間任務）最容易觸發 agent crash，現在修復可降低 Acid Test 失敗率。

## 使用者故事

```
身為 Overtone Loop 系統
我想要在 Stop hook 執行時主動偵測超時的 activeAgents
以便即使 SubagentStop 未觸發，orphan agent 也能在同一 session 內被清除
```

```
身為開發者執行 health-check
我想要看到並發守衛的完整狀態報告（G1/G2/G3）
以便快速確認系統的並發安全邊界是否完整
```

## BDD 驗收標準

```
GIVEN 一個 agent 在 activeAgents 中且 startedAt 超過 15 分鐘
WHEN session-stop-handler.js 的 handleSessionStop() 執行
THEN 該 agent 被從 activeAgents 移除
  AND timeline 有 agent:orphan-cleanup 事件，含 agentName + instanceId + ageMs
  AND 繼續正常的 loop 決策邏輯（不因 orphan 而卡在 soft-release）
```

```
GIVEN health-check 執行（無 active session）
WHEN checkConcurrencyGuards() 運行
THEN 回傳 info finding：G1（execution-queue TOCTOU）已知風險標記
  AND 回傳 info finding：G3（JSONL trim）已知風險標記
  AND 回傳 G2 狀態（無 active orphan）
```

```
GIVEN registry.js 中有 agent:orphan-cleanup 事件定義
WHEN checkPhantomEvents() 掃描 session-stop-handler.js
THEN 無 phantom-events error（emit 與 registry 對齊）
```

## 範圍邊界

### 在範圍內（In Scope）

- session-stop-handler.js 中新增 `detectAndCleanOrphans()` 輔助函式，TTL = 15 分鐘
- registry.js 新增 `agent:orphan-cleanup` timeline event 定義
- health-check.js 新增第 20 項 `checkConcurrencyGuards()`，包含靜態（文件）+ runtime（active session orphan）掃描
- filesystem-concurrency.md 更新：G1/G2/G3 三者完整記錄（G1/G3 標記為「已知風險」、G2 標記為「已修復」）
- CLAUDE.md 的 health-check 說明更新為 20 項（含 checkConcurrencyGuards）
- 單元測試：`detectAndCleanOrphans` 純函數測試（TTL 邏輯）
- 整合測試：`handleSessionStop` 帶 orphan agent 的完整路徑測試
- health-check 單元測試：`checkConcurrencyGuards` 的靜態掃描路徑

### 不在範圍內（Out of Scope）

- G1（execution-queue TOCTOU）修復 — 屬於不同模組範疇，優先在 filesystem-concurrency.md 記錄為已知風險
- G3（JSONL trim 競爭）修復 — 觸發機率極低，只記錄不修復
- heartbeat daemon 的 orphan 偵測（不同 session 邊界）
- 跨 session 的 orphan 統計 / 報表功能
- TTL 值的動態配置（固定 15 分鐘，未來可抽出為常數）

## 子任務清單

依照執行順序：

1. **新增 `agent:orphan-cleanup` timeline event 至 registry.js**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/registry.js`
   - 說明：在 timelineEvents 物件中新增 `'agent:orphan-cleanup': { label: 'Agent Orphan 清理', category: 'agent', consumeMode: 'broadcast' }`。必須先完成此項，否則後續的 emit 會觸發 phantom-events error。

2. **實作 orphan 偵測與清理（session-stop-handler.js）**（依賴 1）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/session-stop-handler.js`
   - 說明：新增 `detectAndCleanOrphans(sessionId, currentState, ttlMs)` 純函數，掃描 `currentState.activeAgents`，找出 `startedAt` 早於 `Date.now() - ttlMs` 的項目，用 `updateStateAtomic` 清除，並 emit `agent:orphan-cleanup` timeline 事件。在 `handleSessionStop` 中，於 loop 繼續判斷前（讀取 currentState 後、退出條件之前）呼叫此函式。TTL 常數 `ORPHAN_TTL_MS = 15 * 60 * 1000`。注意：需確認 activeAgents 的 entry 格式包含 `startedAt` 欄位（查看 agent-stop-handler.js / pre-tool-use-task 如何寫入）。

3. **新增 `checkConcurrencyGuards` 至 health-check.js**（可與 2 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`
   - 說明：實作 `checkConcurrencyGuards()` 函式，分兩部分：(a) 靜態掃描 — 讀取 filesystem-concurrency.md，確認 G1/G2/G3 章節存在，以 `info` severity 回報已知風險；(b) runtime 掃描 — 列舉 `~/.overtone/sessions/` 下的 active session（讀取 workflow.json），找出 activeAgents 中 startedAt 超過 15 分鐘的 entry，以 `warning` 回報。在 `runAllChecks()` 的 checkDefs 陣列末尾（第 20 項）新增 `{ name: 'concurrency-guards', fn: checkConcurrencyGuards }`，並在 module.exports 新增。

4. **更新 filesystem-concurrency.md**（可與 2、3 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/workflow-core/references/filesystem-concurrency.md`
   - 說明：在第 8 節「已知的並發風險與緩解」中：(a) 在「運行中 orphan agent 無 TTL」段落更新為「已在 session-stop-handler.js 中加入 TTL 偵測（G2 已修復）」；(b) 新增 G1 段落（execution-queue TOCTOU — readQueue + 修改 + writeQueue 非 CAS，多個 session 並行時有競爭窗口，已知風險）；(c) 新增 G3 段落（JSONL trim — 截斷操作與 append 的競爭，已知風險，觸發機率極低）。

5. **撰寫單元與整合測試**（依賴 2、3 完成）
   - 負責 agent：tester
   - 相關檔案：
     - `tests/unit/session-stop-handler.test.js`（新增 detectAndCleanOrphans 測試）
     - `tests/unit/health-check-expand.test.js`（新增 checkConcurrencyGuards 測試）
   - 說明：
     - 單元：`detectAndCleanOrphans` 邊界測試 — 無 activeAgents、全未超時、部分超時（只清超時的）、全超時、startedAt 缺失（防禦性）
     - 整合：擴充 `handleSessionStop 背景 agent soft-release` describe，新增一個測試 — 設置 activeAgents 中有 startedAt 超過 15 分鐘的 entry，驗證呼叫後 activeAgents 為空、timeline 有 agent:orphan-cleanup 事件
     - health-check 單元：checkConcurrencyGuards 的靜態掃描路徑（傳入 tmpDir 的 filesystem-concurrency.md）

6. **更新 CLAUDE.md 的 health-check 說明**（依賴 3 完成）
   - 負責 agent：developer
   - 相關檔案：`CLAUDE.md`（專案根目錄）
   - 說明：將「19 項偵測」改為「20 項偵測」，在 checkSkillReferenceIntegrity 後新增 `/checkConcurrencyGuards`。

## 開放問題

1. **activeAgents entry 是否有 startedAt 欄位**：需要確認 PreToolUse(Task) hook 寫入 activeAgents 時的格式（pre-tool-use-task-handler.js 或等效模組），以確定 orphan 偵測可直接用 `startedAt` 還是要改用 `registeredAt` 或其他欄位名稱。這影響 `detectAndCleanOrphans` 的實作細節，由 architect/developer 查閱後決定。

2. **runtime 掃描的 session 目錄列舉方式**：`checkConcurrencyGuards` 的 runtime 部分需要列舉 `~/.overtone/sessions/`，但 health-check.js 目前只使用靜態路徑常數（PLUGIN_ROOT 等）。需要決定是否引入 `paths.js` 或硬編碼 `~/.overtone/sessions/` 路徑（paths.js 可能有 HOME 依賴）。

3. **TTL 值是否需要進 registry 或 config**：15 分鐘是硬編碼常數，若未來需要調整是否要放入 `loopDefaults` 或 `registry.js` 的某個 config 物件。建議放入 registry 的 `loopDefaults` 或新增 `concurrencyConfig`，由 architect 決定。
