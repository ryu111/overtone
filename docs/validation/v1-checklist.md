# V1 驗證 Checklist

> 版本：V1 Roadmap 完整功能驗證文件
> 建立日期：2026-02-26
> 狀態：待驗證

本文件定義 Overtone Plugin V1 的每個功能的通過標準、驗證方式與測試覆蓋狀態。
「通過」的定義是具體的指令或步驟完成，而非主觀判斷。

---

## V1 Roadmap 功能（4 個）

---

### F1. Dashboard History Tab

**功能描述**

Session 詳情頁的第三個 Tab（History），顯示 pass@k 統計報告和 Grader 品質評分歷史。使用者點擊 Tab 時觸發 API 呼叫，取得 `passAtK` 計算結果並以卡片形式渲染每個 stage 的嘗試次數、pass1、pass3、passConsecutive3 指標。

**程式碼位置**

- `scripts/lib/timeline.js` — `passAtK()` 計算函數
- `scripts/server.js` — `GET /api/sessions/:id/passatk` 端點（第 209-214 行）
- `web/session.html` — History Tab UI、`fetchPassatk()` Alpine.js 方法（第 30、104-170、289-336 行）

**驗證標準**

下列所有條件同時成立才算通過：

1. `bun test tests/timeline.test.js` 輸出 `8 pass, 0 fail`
2. Dashboard 啟動後，`curl http://localhost:7777/api/sessions/{有效 sessionId}/passatk` 回傳 JSON，包含 `stages`、`overall`、`computed` 欄位
3. 瀏覽器開啟 `http://localhost:7777/session/{有效 sessionId}`，點擊「History」Tab，顯示 pass@k 卡片（無錯誤訊息）

**驗證方式**

```bash
# 步驟 1：Unit test（自動）
cd plugins/overtone
bun test tests/timeline.test.js

# 步驟 2：API 端點驗證（整合）
bun scripts/server.js &
curl http://localhost:7777/api/sessions/test_session_001/passatk
# 預期：{"sessionId":"test_session_001","computed":"...","stages":{},"overall":{"stageCount":0,...}}

# 步驟 3：手動前端確認
# 瀏覽器開啟 http://localhost:7777
# 點擊任一 Session → 點擊「History」Tab → 確認無 JavaScript 錯誤
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `passAtK()` 計算邏輯 | 已覆蓋 | `tests/timeline.test.js` 8 個測試（空 timeline、pass1/pass3/passConsecutive3、多 stage 混合、false positive 防護） |
| `emit()` 函數 | 未覆蓋 | 需補 emit 事件寫入測試（含無效 eventType 拋出例外） |
| `query()` 函數 | 未覆蓋 | 需補 type/category/limit filter 測試 |
| `latest()` 函數 | 未覆蓋 | 需補「有事件」和「無事件」兩種情境 |
| `GET /api/sessions/:id/passatk` 端點 | 未覆蓋 | 無 server API 整合測試 |
| 前端 `fetchPassatk()` | 未覆蓋 | 需手動驗證（Alpine.js 無法 unit test） |

---

### F2. Model Grader

**功能描述**

Grader 是 Haiku subagent，在 SubagentStop 後由 Main Agent 選擇性委派。讀取 Handoff 檔案後，在 clarity、completeness、actionability 三個維度各給 1-5 整數分，計算 overall 平均，並以 `printf` 寫入 `timeline.jsonl` 的 `grader:score` 事件。Dashboard History Tab 從 `GET /api/sessions/:id/timeline?category=grader` 載入並渲染評分卡片。

**程式碼位置**

- `agents/grader.md` — Grader agent prompt（評分步驟 + Bash 寫入指令）
- `web/session.html` — `graderScores` computed property（第 289 行）、Grader 評分渲染區塊（第 157-177 行）

**驗證標準**

下列所有條件同時成立才算通過：

1. 執行實際工作流後，`~/.overtone/sessions/{sessionId}/timeline.jsonl` 存在至少一筆 `"type":"grader:score"` 事件
2. 事件 JSON 結構完整：`{ ts, type, category, label, stage, agent, scores: { clarity, completeness, actionability, overall } }`，所有 scores 欄位為數字
3. Dashboard History Tab 可見「Grader 品質評分」區塊，顯示對應 stage/agent 與分數條

**驗證方式**

```bash
# 步驟 1：檢查 timeline.jsonl 是否有 grader:score 事件（手動觸發工作流後）
cat ~/.overtone/sessions/{sessionId}/timeline.jsonl | grep '"type":"grader:score"'

# 步驟 2：驗證事件 JSON 結構
cat ~/.overtone/sessions/{sessionId}/timeline.jsonl \
  | grep '"type":"grader:score"' \
  | python3 -c "import sys,json; [json.loads(l) for l in sys.stdin]"
# 預期：無錯誤（JSON 合法）

# 步驟 3：API 端點確認
curl "http://localhost:7777/api/sessions/{sessionId}/timeline?category=grader"
# 預期：JSON 陣列，含 grader:score 事件

# 步驟 4：手動前端確認
# 瀏覽器 History Tab → 確認「Grader 品質評分」區塊出現且分數正確
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| Grader agent prompt 行為 | 未覆蓋 | Agent prompt 行為只能透過實際委派驗證（無 unit test 途徑） |
| `grader:score` 事件格式 | 未覆蓋 | 需手動確認事件 JSON 結構 |
| Dashboard Grader 分數渲染 | 未覆蓋 | 需手動前端視覺確認 |
| `GET /api/sessions/:id/timeline?category=grader` | 未覆蓋 | 無整合測試；可用 `query()` filter 邏輯驗證間接覆蓋 |

---

### F3. `[workflow:xxx]` 覆寫語法

**功能描述**

使用者在 prompt 中加入 `[workflow:xxx]` 語法（如 `請幫我建立 API [workflow:standard]`），UserPromptSubmit hook 的 `parseWorkflowOverride` 邏輯解析並驗證 workflow key，若合法則注入指定 workflow 的 systemMessage，跳過 `/ot:auto` 判斷。非合法 key 靜默忽略，回到正常 `/ot:auto` 流程。

**程式碼位置**

- `hooks/scripts/prompt/on-submit.js` — 第 30-34 行（regex 解析 + 合法性驗證）、第 40-48 行（覆寫 systemMessage 組裝）

**驗證標準**

下列所有條件同時成立才算通過：

1. 輸入含 `[workflow:standard]` 的 prompt，hook 輸出的 `additionalContext` 包含「使用者指定了 workflow：standard」字串
2. 輸入含 `[workflow:invalid_key]` 的 prompt，hook 輸出的 `additionalContext` 包含「/ot:auto」（回到正常流程）
3. 輸入以 `/ot:` 開頭的 prompt，hook 輸出為 `{ additionalContext: '' }`（明確不注入）

**驗證方式**

```bash
# 步驟 1：模擬合法 workflow 覆寫
echo '{"user_prompt":"建立 REST API [workflow:standard]"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：additionalContext 含 "使用者指定了 workflow：standard"

# 步驟 2：模擬非法 workflow key
echo '{"user_prompt":"請執行 [workflow:nonexistent]"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：additionalContext 含 "/ot:auto"（降級到正常流程）

# 步驟 3：模擬 /ot: 命令直接輸入
echo '{"user_prompt":"/ot:standard"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：{"additionalContext":""}

# 步驟 4：大小寫不敏感測試
echo '{"user_prompt":"測試 [Workflow:QUICK]"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：additionalContext 含 "使用者指定了 workflow：quick"
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `parseWorkflowOverride` 解析邏輯 | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 3~6（合法 key、非法 key、大小寫不敏感、`/ot:` 前綴跳過） |
| 有進行中 workflow 時的狀態摘要 | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 8（mock workflow.json） |
| 無 workflow 時注入 `/ot:auto` | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 7 |

---

### F4. Dashboard 動畫版

**功能描述**

`web/styles/main.css` 包含 6 個 `@keyframes` 動畫，用於 stage 狀態切換（activate/complete）、agent 進場、border pulse、loading spinner、dot pulse。支援 `prefers-reduced-motion: reduce` 媒體查詢，可無障礙關閉所有動畫。

**程式碼位置**

- `web/styles/main.css` — 第 477-671 行（6 個 `@keyframes` + `prefers-reduced-motion` 保護）

**驗證標準**

下列所有條件同時成立才算通過（純手動視覺確認）：

1. 瀏覽器 Dashboard 中，有 agent 活躍時對應的 stage 卡片顯示脈衝邊框動畫
2. Stage 從 pending 轉為 completed 時，顯示 0.6s 淡入動畫（不是瞬間切換）
3. Agent 卡片進場時有 0.3s 滑入動畫
4. Loading spinner 在等待時旋轉
5. 在 macOS 系統偏好設定開啟「減少動態效果」後重整頁面，所有動畫停止（CSS `animation: none`）

**驗證方式**

```bash
# 步驟 1：啟動 Dashboard
bun scripts/server.js

# 步驟 2：觸發工作流（需有實際 session）
bun scripts/init-workflow.js standard {sessionId}

# 步驟 3：瀏覽器手動確認
# 開啟 http://localhost:7777/session/{sessionId}
# 確認以下動畫存在：
#   - 活躍 stage 有脈衝邊框（agent-border-pulse）
#   - Stage 完成有淡入效果（stage-complete 0.6s）
#   - Agent 進場有滑入（agent-enter 0.3s）
#   - Loading 有旋轉（spin 1s）

# 步驟 4：減少動態效果測試
# macOS：系統設定 → 輔助使用 → 顯示 → 減少動態效果
# 或 Chrome DevTools：Rendering → Emulate CSS media feature prefers-reduced-motion: reduce
# 重整頁面 → 確認動畫全部停止
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `@keyframes` 動畫定義語法 | 未覆蓋 | CSS 動畫無法 unit test，需手動視覺確認 |
| `prefers-reduced-motion` 保護 | 未覆蓋 | 需手動使用 DevTools 模擬媒體查詢 |
| 動畫觸發條件（class 切換） | 間接覆蓋 | state.js 更新 stage 狀態正確，前端 SSE 推送觸發 class 切換 |

---

## V1 基礎架構（5 個）

---

### F5. Loop 機制

**功能描述**

Stop hook（`hooks/scripts/session/on-stop.js`）攔截 Main Agent 的退出意圖，讀取 `loop.json` 和 `workflow.json`，若工作流未完成且未超過錯誤上限，自動注入繼續指令讓 Main Agent 重新執行下一步。`scripts/lib/loop.js` 提供 `readLoop`、`writeLoop`、`exitLoop`、`readTasksStatus` 等函數管理 Loop 狀態。

**程式碼位置**

- `hooks/scripts/session/on-stop.js` — Stop hook 主程式
- `scripts/lib/loop.js` — Loop 狀態管理

**驗證標準**

下列所有條件同時成立才算通過：

1. `bun test tests/loop.test.js` 輸出 `8 pass, 0 fail`
2. 模擬 Stop hook 執行：workflow 未完成時，hook 輸出的 `decision` 為 `"continue"` 或相等語義的繼續指令，不為空
3. `loop.json` 的 `iteration` 計數在每次 Loop 後遞增 1

**驗證方式**

```bash
# 步驟 1：Unit test（自動）
cd plugins/overtone
bun test tests/loop.test.js

# 步驟 2：整合測試（模擬 Stop hook）
SESSION_ID="test_loop_integration_$(date +%s)"
bun scripts/init-workflow.js quick $SESSION_ID

# 模擬 Stop hook（workflow 進行中）
echo '{"stop_hook_active":true}' \
  | CLAUDE_SESSION_ID="$SESSION_ID" node hooks/scripts/session/on-stop.js
# 預期：輸出含 decision 為繼續執行的 JSON

# 步驟 3：cleanup
rm -rf ~/.overtone/sessions/$SESSION_ID
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `readLoop()` 初始化 | 已覆蓋 | `tests/loop.test.js` — 不存在時自動初始化 |
| `writeLoop()` 往返 | 已覆蓋 | `tests/loop.test.js` — 寫入讀回 + 無殘餘 tmp 檔 |
| `exitLoop()` 停止記錄 | 已覆蓋 | `tests/loop.test.js` — stopped + stopReason + stoppedAt |
| `readTasksStatus()` checkbox 計數 | 已覆蓋 | `tests/loop.test.js` — 4 個情境（不存在/null/有 checkbox/全完成） |
| Stop hook 完整流程 | 未覆蓋 | 需整合測試：init state → 執行 on-stop.js → 驗證 decision |

---

### F6. SubagentStop 記錄

**功能描述**

SubagentStop hook（`hooks/scripts/agent/on-stop.js`）在每個 subagent 結束後執行，解析 agent 輸出文字判定 verdict（pass/fail/reject），更新 `workflow.json` 的 stage 狀態，寫入 `timeline.jsonl` 的 `stage:complete` 事件，並輸出下一步提示給 Main Agent。

**程式碼位置**

- `hooks/scripts/agent/on-stop.js` — SubagentStop hook 主程式
- `scripts/lib/state.js` — `updateStateAtomic()`（CAS 原子更新）
- `scripts/lib/timeline.js` — `emit()` 事件記錄

**驗證標準**

下列所有條件同時成立才算通過：

1. `bun test tests/parse-result.test.js` 輸出 `17 pass, 0 fail`
2. 模擬 SubagentStop hook 執行後，`workflow.json` 的對應 stage 狀態更新為 `completed`
3. `timeline.jsonl` 新增一筆 `stage:complete` 事件，含正確的 `stage`、`result`、`ts` 欄位

**驗證方式**

```bash
# 步驟 1：Unit test（parse 邏輯）
cd plugins/overtone
bun test tests/parse-result.test.js

# 步驟 2：整合測試（模擬 SubagentStop hook）
SESSION_ID="test_agent_stop_$(date +%s)"
bun scripts/init-workflow.js quick $SESSION_ID

# 模擬 developer agent 完成（pass）
echo '{"subagent_name":"developer","output":"實作完成，所有功能已實作"}' \
  | CLAUDE_SESSION_ID="$SESSION_ID" node hooks/scripts/agent/on-stop.js

# 驗證 workflow.json
cat ~/.overtone/sessions/$SESSION_ID/workflow.json | python3 -m json.tool
# 預期：stages.DEV.status = "completed"，stages.DEV.result = "pass"

# 驗證 timeline.jsonl
grep '"type":"stage:complete"' ~/.overtone/sessions/$SESSION_ID/timeline.jsonl
# 預期：有一筆 {"ts":"...","type":"stage:complete","stage":"DEV","result":"pass",...}

# 步驟 3：cleanup
rm -rf ~/.overtone/sessions/$SESSION_ID
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `parseResult()` 結構化 verdict | 已覆蓋 | `tests/parse-result.test.js` — VERDICT HTML comment 解析 |
| `parseResult()` REVIEW 字串匹配 | 已覆蓋 | `tests/parse-result.test.js` — reject/拒絕/false positive 防護 |
| `parseResult()` TEST/QA/E2E 匹配 | 已覆蓋 | `tests/parse-result.test.js` — fail/error/false positive 防護 |
| `parseResult()` 其他 stage 預設 | 已覆蓋 | `tests/parse-result.test.js` — DEV/PLAN/ARCH 預設 pass |
| 完整 hook 流程（state + timeline） | 未覆蓋 | 需整合測試：init state → 執行 on-stop.js → 驗證 workflow.json + timeline.jsonl |

---

### F7. UserPromptSubmit → /ot:auto 注入

**功能描述**

每次使用者送出 prompt，`hooks/scripts/prompt/on-submit.js` 根據當前狀態決定注入內容：無進行中 workflow → 注入 `/ot:auto` 引導；有進行中 workflow → 注入進度摘要；含 `[workflow:xxx]` → 注入指定 workflow 指引；以 `/ot:` 開頭 → 不注入（passthrough）。

**程式碼位置**

- `hooks/scripts/prompt/on-submit.js` — 完整 hook 邏輯（76 行）

**驗證標準**

下列所有條件同時成立才算通過：

1. 輸入無 workflow 的 prompt，hook 輸出的 `additionalContext` 包含「/ot:auto」字串
2. 輸入進行中 workflow 的 prompt（有效 sessionId），hook 輸出的 `additionalContext` 包含「工作流進行中」
3. 輸入 `/ot:` 開頭的 prompt，hook 輸出為 `{ additionalContext: '' }`（明確不注入）
4. 輸入含 `[workflow:quick]` 的 prompt，hook 輸出包含「使用者指定了 workflow：quick」

**驗證方式**

```bash
# 步驟 1：無 workflow（無 sessionId）
echo '{"user_prompt":"請幫我建立一個 REST API"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：{"additionalContext":"[Overtone] 請先閱讀 /ot:auto..."}

# 步驟 2：有進行中 workflow（需先建立 session state）
SESSION_ID="test_submit_$(date +%s)"
bun scripts/init-workflow.js quick $SESSION_ID

echo '{"user_prompt":"繼續執行"}' \
  | CLAUDE_SESSION_ID="$SESSION_ID" node hooks/scripts/prompt/on-submit.js
# 預期：additionalContext 含 "工作流進行中：quick"

# 步驟 3：/ot: 命令直接輸入（passthrough）
echo '{"user_prompt":"/ot:standard"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：{"additionalContext":""}

# 步驟 4：[workflow:xxx] 覆寫語法
echo '{"user_prompt":"建立 API [workflow:quick]"}' \
  | CLAUDE_SESSION_ID="" node hooks/scripts/prompt/on-submit.js
# 預期：additionalContext 含 "使用者指定了 workflow：quick"

# Cleanup
rm -rf ~/.overtone/sessions/$SESSION_ID
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| 無 workflow 注入 `/ot:auto` | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 7 |
| 有 workflow 注入進度摘要 | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 8 |
| `/ot:` 前綴 passthrough | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 1、2 |
| `[workflow:xxx]` 覆寫語法 | ✅ 已覆蓋 | `tests/on-submit.test.js` — 場景 3~6 |

---

### F8. timeline.jsonl 事件記錄

**功能描述**

`scripts/lib/timeline.js` 提供 append-only JSONL 事件記錄系統，支援 18 種事件類型（定義於 `registry.js`）。`emit()` 寫入事件並定期觸發截斷（每 100 次呼叫檢查，超過 2000 筆時保留最新）。`query()` 支援 type/category/limit 篩選。`latest()` 取得最近一筆特定類型事件。

**程式碼位置**

- `scripts/lib/timeline.js` — `emit()`、`query()`、`latest()`、`trimIfNeeded()`、`passAtK()`
- `scripts/lib/registry.js` — `timelineEvents` 定義（18 種事件）

**驗證標準**

下列所有條件同時成立才算通過：

1. `bun test tests/timeline.test.js` 輸出 `8 pass, 0 fail`
2. 呼叫 `emit()` 後，`timeline.jsonl` 新增一行合法 JSON，且 `type` 欄位符合傳入的 eventType
3. 呼叫 `emit()` 傳入未知 eventType，拋出含「未知的 timeline 事件類型」的 Error
4. 呼叫 `query()` 含 `type` filter 只回傳對應類型的事件
5. 呼叫 `latest()` 在無事件時回傳 `null`，有事件時回傳最後一筆

**驗證方式**

```bash
# 步驟 1：Unit test（passAtK 邏輯）
cd plugins/overtone
bun test tests/timeline.test.js

# 步驟 2：emit() 寫入驗證（Node.js REPL 或腳本）
node -e "
const timeline = require('./scripts/lib/timeline');
const sessionId = 'test_emit_' + Date.now();
const e = timeline.emit(sessionId, 'workflow:start', { workflowType: 'quick' });
console.log('事件 ts:', e.ts);
console.log('事件 type:', e.type);
const { readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const content = readFileSync(join(homedir(), '.overtone/sessions/' + sessionId + '/timeline.jsonl'), 'utf8');
console.log('JSONL 行數:', content.trim().split('\\n').length);
// 清理
require('fs').rmSync(join(homedir(), '.overtone/sessions', sessionId), { recursive: true, force: true });
"

# 步驟 3：emit() 無效 eventType 拋出錯誤
node -e "
const timeline = require('./scripts/lib/timeline');
try {
  timeline.emit('test', 'invalid:event:type');
  console.error('應該拋出錯誤但沒有');
} catch(e) {
  console.log('正確拋出:', e.message);
}
"

# 步驟 4：query() filter 驗證（使用 tests/timeline.test.js 的 writeEvent 輔助函式）
# 參考 tests/timeline.test.js 的手動設置方式，建立 JSONL 後呼叫 query()
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `passAtK()` 計算邏輯 | 已覆蓋 | `tests/timeline.test.js` 8 個測試 |
| `emit()` 正常寫入 | 未覆蓋 | 需補：寫入後 JSONL 存在且行數正確 |
| `emit()` 無效 eventType 拋出 | 未覆蓋 | 需補：unknown type 應拋出 Error |
| `query()` type filter | 未覆蓋 | 需補：type/category/limit filter 各自驗證 |
| `query()` 檔案不存在回傳 `[]` | 未覆蓋 | 需補：空 session 呼叫 query() 的 graceful fallback |
| `latest()` 有事件 | 未覆蓋 | 需補：emit 一筆後 latest() 回傳正確事件 |
| `latest()` 無事件回傳 null | 未覆蓋 | 需補：空 session 呼叫 latest() 回傳 null |
| `trimIfNeeded()` 截斷邏輯 | 未覆蓋 | 邊際案例；可透過寫入 >2000 筆後確認行數 |

---

### F9. workflow.json CAS 原子更新

**功能描述**

`scripts/lib/state.js` 管理 `~/.overtone/sessions/{sessionId}/workflow.json` 的讀寫。`writeState()` 使用 `atomicWrite()`（tmp 檔 + rename）確保寫入不中途損壞。`updateStateAtomic()` 實現 CAS（Compare-And-Set）語義，接受一個 modifier function，讀取當前狀態、套用修改、原子寫回。

**程式碼位置**

- `scripts/lib/state.js` — `readState()`、`writeState()`、`initState()`、`updateStage()`、`setActiveAgent()`、`removeActiveAgent()`、`updateStateAtomic()`
- `scripts/lib/utils.js` — `atomicWrite()`（tmp 檔 + rename 實作）

**驗證標準**

下列所有條件同時成立才算通過：

1. `bun test tests/state.test.js` 輸出 `12 pass, 0 fail`
2. `writeState()` 後目錄中不存在任何 `.tmp` 結尾檔案
3. `updateStateAtomic()` 的 modifier 可同時修改多個欄位，讀回後所有修改均生效

**驗證方式**

```bash
# 步驟 1：Unit test（完整覆蓋）
cd plugins/overtone
bun test tests/state.test.js

# 步驟 2：確認 12 個測試全部通過，覆蓋項目：
#   - readState: 不存在 session 回傳 null / 損壞 JSON 回傳 null
#   - writeState / readState 往返: 寫入讀回正確 / 無殘餘 tmp 檔
#   - initState: 正確 stage 結構 / 重複 stage 加編號 / TEST spec/verify mode
#   - updateStage: 更新狀態並推進 currentStage / 不存在 session 拋錯 / 不存在 stage 拋錯
#   - setActiveAgent / removeActiveAgent: 新增移除 / 不存在 session 靜默處理
#   - updateStateAtomic: 多欄位合併修改 / 不存在 session 拋錯 / modifier 回傳值寫入
```

**測試覆蓋狀態**

| 項目 | 狀態 | 說明 |
|------|------|------|
| `readState()` 防禦性讀取 | 已覆蓋 | `tests/state.test.js` — null session / 損壞 JSON |
| `writeState()` 原子寫入 + 往返 | 已覆蓋 | `tests/state.test.js` — 無殘餘 tmp 檔 |
| `initState()` stage 結構初始化 | 已覆蓋 | `tests/state.test.js` — 重複 stage 編號、TEST spec/verify mode |
| `updateStage()` 狀態推進 | 已覆蓋 | `tests/state.test.js` — 推進 currentStage、不存在拋錯 |
| `setActiveAgent()` / `removeActiveAgent()` | 已覆蓋 | `tests/state.test.js` — 新增移除、靜默處理 |
| `updateStateAtomic()` CAS | 已覆蓋 | `tests/state.test.js` — 多欄位合併、不存在拋錯、modifier 回傳值 |
| 並發寫入競爭（真正的 race condition） | 未覆蓋 | Node.js 單線程特性下風險低；CAS 語義確保序列化 |

---

## 整體驗證策略

### 目前狀態摘要

| 功能 | Unit Test | 整合測試 | 手動確認 |
|------|:---------:|:--------:|:--------:|
| F1. Dashboard History Tab（passAtK） | 8/8 通過 | 缺 API 測試 | 缺前端確認 |
| F2. Model Grader | 無 | 無 | 未執行 |
| F3. `[workflow:xxx]` 覆寫語法 | 無 | 無 | 未執行 |
| F4. Dashboard 動畫版 | 不適用 | 不適用 | 未執行 |
| F5. Loop 機制 | 8/8 通過 | 缺完整流程 | 未執行 |
| F6. SubagentStop 記錄 | 17/17 通過 | 缺完整流程 | 未執行 |
| F7. UserPromptSubmit 注入 | 無 | 無 | 未執行 |
| F8. timeline.jsonl 事件記錄 | 8/8（passAtK） | 無 emit/query/latest | 未執行 |
| F9. workflow.json CAS 原子更新 | 12/12 通過 | 完整 | N/A |

**目前通過測試總數：45 個（93 個中的 45 個直接相關）**

### 驗證執行順序建議

**Phase 1：立即可執行（自動）**

```bash
cd plugins/overtone
bun test
# 預期：93 pass, 0 fail（涵蓋 F1 passAtK、F5 Loop、F6 parseResult、F9 CAS）
```

**Phase 2：需補充的 Unit Tests（優先順序由高到低）**

1. `tests/on-submit.test.js` — 覆蓋 F3 和 F7（hook 是純函數，可抽取核心邏輯）
2. `tests/timeline.test.js` 補充 — 覆蓋 F8 的 `emit()`、`query()`、`latest()`
3. `tests/state.test.js` — 已完整覆蓋，無需補充

**Phase 3：整合測試（shell 腳本，需真實環境）**

參考各功能「驗證方式」章節中的 shell 指令，按以下順序執行：

```bash
# F6：SubagentStop 整合
# F5：Loop 整合
# F7：UserPromptSubmit 整合
# F3：覆寫語法整合（含在 F7 測試中）
```

**Phase 4：手動視覺確認**

```bash
bun scripts/server.js
# 按各功能「驗證方式」手動步驟確認：
# F1 History Tab、F2 Grader 分數、F4 動畫
```

### 整體通過條件

V1 視為完整驗證通過的條件（全部同時成立）：

- [x] `bun test` 全部測試通過（288 pass，2026-02-26）
- [x] `tests/on-submit.test.js` 新增後通過（F3 + F7，2026-02-26）
- [x] `tests/timeline.test.js` 補充後 emit/query/latest 測試通過（F8，2026-02-26）
- [x] F5 Loop、F6 SubagentStop 整合測試腳本執行成功（2026-02-26）
- [ ] 瀏覽器手動確認 F1 History Tab、F2 Grader、F4 動畫
