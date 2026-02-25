# Overtone Plugin 全面審計報告

> 審計日期：2026-02-25 | Plugin 版號：0.10.0 | 審計範圍：全部程式碼+文檔+配置

## 摘要統計

| 嚴重度 | 數量 | 分類分布 |
|:------:|:----:|---------|
| CRITICAL | 0 | — |
| HIGH | 6 | Correctness (3), Security/Quality (1), Documentation (2) |
| MEDIUM | 14 | Correctness (6), Quality (1), Performance (1), Security (1), Structure (1), Documentation (4) |
| LOW | 12 | Quality (4), Correctness (1), Structure (4), Documentation (3) |
| **合計** | **32** | |

---

## 一、程式碼問題

### CRITICAL（0 個）

無。Plugin 核心安全設計合理，零依賴降低了供應鏈風險。

---

### HIGH（4 個）

#### H-1. state.js 讀寫存在 TOCTOU Race Condition

- **檔案**: `scripts/lib/state.js:87-134`
- **分類**: Security / Correctness
- **描述**: `updateStage`、`setActiveAgent`、`removeActiveAgent` 都使用 read-modify-write 模式（`readState() → modify → writeState()`）。雖然 `atomicWrite` 讓最終寫入是原子的，但兩次操作之間沒有鎖。若並行群組（REVIEW + TEST 同時完成）的兩個 SubagentStop hook 同時觸發，可能讀到相同的 state，各自寫入，導致其中一個修改丟失。
- **建議**: 使用 file lock（如 `proper-lockfile`）包裹 read-modify-write，或使用 compare-and-swap 模式（讀取 mtime → 寫回時驗證）。

#### H-2. on-stop.js (SubagentStop) 三次獨立讀寫 race

- **檔案**: `hooks/scripts/agent/on-stop.js:62-100`
- **分類**: Correctness
- **描述**: 同一個 hook 中對 state 做了三次獨立的 read-modify-write：(1) `removeActiveAgent` (2) `updateStage` (3) 讀取 + 修改 failCount/rejectCount + writeState。每一步都可能被其他並行 hook 中斷。
- **建議**: 合併為單次 read-modify-write，或引入鎖機制。

#### H-3. SSE CORS 硬編碼 localhost

- **檔案**: `scripts/server.js:151, 354`
- **分類**: Quality / Security
- **描述**: `Access-Control-Allow-Origin` 硬編碼為 `http://localhost:${PORT}`。透過區網 IP 存取 Dashboard 時，SSE 和 API 回應被 CORS 擋掉。
- **建議**: 根據請求的 `Origin` header 動態回傳，或支援 `VIBE_CORS_ORIGIN` 環境變數。

#### H-4. db-review skill 初始化使用錯誤的 workflow key

- **檔案**: `skills/db-review/SKILL.md:10`
- **分類**: Correctness
- **描述**: 初始化命令使用 `review-only` workflow key，但 `review-only` 對應 `['REVIEW']`（code-reviewer），而非 `['DB-REVIEW']`（database-reviewer）。Registry 中缺少 `db-review` workflow 定義。
- **建議**: 在 `registry.js` 新增 `'db-review': { label: 'DB審查', stages: ['DB-REVIEW'] }`，並更新 skill init 命令。

---

### MEDIUM — 程式碼（10 個）

#### M-1. timeline.js `query()` 有寫入副作用

- **檔案**: `scripts/lib/timeline.js:62-67`
- **分類**: Quality / Correctness
- **描述**: `query()` 是查詢語意，但超過 `MAX_EVENTS` 時會觸發 `atomicWrite` 截斷 JSONL。違反函式命名語意，多個並行呼叫者可能同時觸發截斷。
- **建議**: 將截斷提取為獨立 `trim()` 函式，在 `emit()` 中觸發。

#### M-2. `atomicWrite` 缺少 counter 唯一因子

- **檔案**: `scripts/lib/utils.js:25`
- **分類**: Correctness
- **描述**: tmp 路徑使用 `${pid}.${Date.now()}.tmp`，同 pid 同毫秒內多次呼叫會產生相同 tmp 路徑。Vibe 已使用三因子（`pid.timestamp.counter`）。
- **建議**: 加入遞增 counter。

#### M-3. `parseResult` 字串匹配 false positive 風險

- **檔案**: `hooks/scripts/agent/on-stop.js:160-203`
- **分類**: Correctness
- **描述**: fallback 的 `lower.includes()` 匹配可能誤判。例如 "error-free" 不在排除清單中。結構化 `<!-- VERDICT -->` 是主要方案，但 agent 未輸出時 fallback 有風險。
- **建議**: 強化 agent prompt 中 `<!-- VERDICT: {...} -->` 的 ⛔ 強制要求，擴充排除清單。

#### M-4. event-bus.js 檔案監聽缺少防抖

- **檔案**: `scripts/lib/remote/event-bus.js:153-206`
- **分類**: Performance
- **描述**: `fs.watch` 回調無防抖。`atomicWrite` 的 rename 操作可能觸發多次 watch 事件，導致重複推送。
- **建議**: 加入 50-100ms debounce。

#### M-5. dashboard-adapter.js `createAllSSEStream` cancel 閉包 bug

- **檔案**: `scripts/lib/remote/dashboard-adapter.js:103-125`
- **分類**: Correctness
- **描述**: `cancel()` 引用 `start()` 函式內的局部變數 `wrapper`，無法存取。SSE 斷開後連線不會被正確清理。
- **建議**: 將 `wrapper` 存到 `controller._sseWrapper` 上。

#### M-6. 缺少 `diagnose`、`clean`、`db-review` workflow 定義

- **檔案**: `scripts/lib/registry.js:52-68`
- **分類**: Structure / Correctness
- **描述**: `/ot:auto` 列出的 `diagnose`（DEBUG）、`clean`（REFACTOR）、`db-review`（DB-REVIEW）在 registry 的 `workflows` 中缺少定義。
- **建議**: 補齊三個 workflow 定義。

#### M-7. `on-submit.js` 使用 `additionalContext` 欄位

- **檔案**: `hooks/scripts/prompt/on-submit.js:57`
- **分類**: Correctness
- **描述**: UserPromptSubmit hook 使用 `{ additionalContext: systemMessage }`。需確認此欄位名是否被 ECC 正確辨識。
- **建議**: 驗證 ECC 文檔確認 UserPromptSubmit hook 的回應格式。

#### M-8. post-use.js sessionId 取值不一致

- **檔案**: `hooks/scripts/tool/post-use.js:33`
- **分類**: Correctness
- **描述**: 其他 hook 使用 `process.env.CLAUDE_SESSION_ID`，此檔案使用 `input.session_id`。
- **建議**: 統一為 `process.env.CLAUDE_SESSION_ID || input.session_id`。

#### M-9. instinct.js `emit()` 全量重寫可能丟失資料

- **檔案**: `scripts/lib/instinct.js:78-108`
- **分類**: Correctness
- **描述**: `_readAll()` 和 `_writeAll()` 之間，若有另一個並行 hook 的 `_append()`，那筆資料會被覆蓋。
- **建議**: 改為 append-only 模式（append "update" 紀錄），查詢時合併。

#### M-10. Telegram 未驗證 chat_id 白名單

- **檔案**: `scripts/lib/remote/telegram-adapter.js:137-162`
- **分類**: Security
- **描述**: 任何向 Bot 發送 `/start` 的使用者都能成為通知接收者，`/stop` 可被任何人執行。
- **建議**: 當 `TELEGRAM_CHAT_ID` 已設定時，拒絕其他 chat 的控制命令。

---

### LOW — 程式碼（8 個）

#### L-1. pid.js 使用 `writeFileSync` 而非 `atomicWrite`

- **檔案**: `scripts/lib/dashboard/pid.js:18-19`
- **建議**: 改用 `atomicWrite` 保持一致性。

#### L-2. on-start.js `setTimeout` 開啟瀏覽器可能不執行

- **檔案**: `hooks/scripts/session/on-start.js:67-71`
- **描述**: hook 進程可能在 500ms 前退出，導致 `setTimeout` 永不執行。
- **建議**: 使用 `spawn` + `detached` + `unref` 取代 setTimeout。

#### L-3. Dashboard spawn 的 catch 空白

- **檔案**: `hooks/scripts/session/on-start.js:48-50`
- **建議**: 至少用 `console.error` 記錄啟動失敗。

#### L-4. 多處空 `catch {}` 塊

- **檔案**: `post-use.js:29,50`、`event-bus.js:158,172,204` 等
- **建議**: 開發模式下記錄錯誤。

#### L-5. `identifyAgent` 別名 `test` 可能誤匹配

- **檔案**: `hooks/scripts/tool/pre-task.js:151-152`
- **描述**: `test(?:er|ing)?` 會匹配獨立的 "test" 字串。已知設計取捨。

#### L-6. plugin.json `permissions` 為空陣列

- **檔案**: `.claude-plugin/plugin.json:22`
- **建議**: 確認 ECC permissions 規範是否需要宣告。

#### L-7. Alpine.js CDN 無離線 fallback

- **檔案**: `web/session.html`、`web/index.html`
- **描述**: 無網路環境下頁面功能失效。
- **建議**: 考慮 bundle Alpine.js 到 `web/` 目錄。

#### L-8. 缺少 lock file

- **檔案**: plugin 根目錄
- **描述**: 當前零依賴所以無影響。未來新增依賴時需注意。

---

## 二、文檔問題

### HIGH — 文檔（2 個）

#### D-H1. CLAUDE.md 目錄結構未反映 `plugins/overtone/` 架構

- **描述**: 遷移到 `plugins/overtone/` 後未同步更新。目錄結構仍顯示根目錄下的平面結構，會誤導新貢獻者。
- **額外問題**: `templates/` 列出但不存在、`openspec/` 位置描述錯誤、缺少 `tests/`（6 個測試檔）

#### D-H2. HANDOFF.md 「待實作」/「已完成」共存造成混亂

- **描述**: Phase 1-8 全部標為 ✅ 已完成，但「待實作」區塊仍保留完整計畫細節。讀者無法判斷哪個區塊是權威的。
- **建議**: 刪除或重新標記「待實作」區塊為「設計規格記錄」。

---

### MEDIUM — 文檔（4 個）

#### D-M1. Hook 行數嚴重不符

- **CLAUDE.md + HANDOFF.md**: 聲稱 ~570 行
- **實際**: 930 行（差距 63%）

#### D-M2. Skill 數量過時

- **HANDOFF.md Phase 3**: 聲稱 18 個 skill
- **實際**: 27 個 skill 目錄

#### D-M3. 程式碼量預估過時

- **HANDOFF.md**: 聲稱 ~4,270 行合計
- **實際**: 光 scripts + hooks 就超過 3,600 行，加上 agents/skills/web/tests 遠超預估

#### D-M4. 8 個空目錄未清理

Phase 8 聲稱「清理 2 個廢棄空目錄」，但以下空目錄仍存在：
1. `hooks/scripts/lib/`
2. `hooks/scripts/memory/`
3. `hooks/scripts/sentinel/`
4. `hooks/scripts/workflow/`
5. `scripts/lib/flow/`
6. `scripts/lib/timeline/`
7. `web/components/`
8. `web/state/`

---

### LOW — 文檔（4 個）

#### D-L1. 缺少 README.md

專案根目錄無 README，缺少快速入門指引。

#### D-L2. 缺少 CHANGELOG.md

無版本歷史記錄。

#### D-L3. CLAUDE.md 未記錄版號和 skill 數量

`plugin.json` 為 0.10.0，CLAUDE.md 未標明。27 個 skill 也未在任何文檔統計。

#### D-L4. `.claude/agent-memory/vibe-developer/` 命名殘留

應為 `overtone-developer` 或直接清除。

---

## 三、架構優勢（值得保留）

| # | 優勢 | 說明 |
|:-:|------|------|
| S-1 | 零依賴設計 | 只用 Node.js/Bun 內建 API，無供應鏈風險 |
| S-2 | registry.js SoT | Agent/stage/workflow/color/model 集中定義，消除跨模組重複 |
| S-3 | 原子寫入模式 | `atomicWrite`（tmp + rename）統一使用，避免 JSON 損壞 |
| S-4 | 路徑穿越防護 | `server.js` 的 `resolve()` + `startsWith()` 檢查正確 |
| S-5 | HTML 轉義 | `escapeHtml()` 在 server-side 渲染中正確使用，防止 XSS |
| S-6 | Telegram token 遮蔽 | 錯誤處理中不印完整 URL，避免 token 洩漏 |
| S-7 | 結構化 verdict 優先 | `<!-- VERDICT: {...} -->` 優先，字串匹配只作為 fallback |
| S-8 | Hook 檔案權限正確 | 6 個 hook 腳本都是 755，shebang 正確 |
| S-9 | BDD 雙模式設計 | Tester 的 spec/verify 模式自動切換 |
| S-10 | EventBus + Adapter 可擴展 | 新增 Slack/Discord adapter 只需繼承基類 |
| S-11 | 增量 JSONL 讀取 | byte offset 增量讀取，對大型 timeline 友善 |
| S-12 | 完善測試覆蓋 | 6 個測試檔覆蓋核心邏輯，正確清理測試資料 |
