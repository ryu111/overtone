---
feature: health-check-principles
stage: PLAN
created: 2026-03-05
author: planner
---

# Proposal: health-check-principles

## 需求摘要

為 Overtone 三大製作原則（完全閉環 / 自動修復 / 補全能力）新增 health-check 自動偵測，
並在 manage-component.js 的 create 動作中整合原則合規提示。

規範來源：`docs/spec/overtone-製作規範.md`

---

## 需求分解

### 功能 A：health-check 新增 3 項偵測

**A1 — checkClosedLoop**
- 偵測「有 emit 但無對應 consumer」的孤立事件流
- 掃描所有 timelineEvents（registry.js），對每個事件確認 codebase 中至少有一個 consumer
  （即「讀取」或「依此觸發後續行動」的程式碼，非僅 emit 本身）
- 反向邏輯：checkPhantomEvents 找「registry 有但無 emit」；checkClosedLoop 找「有 emit 但無 consumer」
- 嚴重度：warning
- 影響檔案：`plugins/overtone/scripts/health-check.js`

**A2 — checkRecoveryStrategy**
- 偵測元件是否定義失敗恢復行為
- 子項 1：掃描 9 個 handler 模組（`scripts/lib/*-handler.js`），檢查是否有頂層 try-catch 保護主入口函式
- 子項 2：掃描 agents/*.md，檢查 agent body 是否包含停止條件相關描述（關鍵詞：「停止條件」、「STOP」、「失敗」、「error」）
- 嚴重度：warning
- 影響檔案：`plugins/overtone/scripts/health-check.js`

**A3 — checkCompletionGap**
- 偵測補全能力缺口
- 子項 1：掃描 skill 目錄，偵測缺少 references/ 子目錄的情況（目前已知：auto skill）
- 子項 2：掃描 health-check.js 的 checkDefs，確認所有 finding 的 message 非空（保底確認）
- 嚴重度：warning
- 影響檔案：`plugins/overtone/scripts/health-check.js`

### 功能 B：manage-component.js 整合原則合規提示

**B1 — create agent 原則合規提示**
- 在 create agent 成功後，新增 stderr 提示：「記得為此 agent 新增失敗恢復策略（停止條件 + 誤判防護）」
- 擴展現有的依賴提示 checklist 區塊
- 影響檔案：`plugins/overtone/scripts/manage-component.js`

**B2 — create skill 原則合規提示**
- 在 create skill 成功後，新增 stderr 提示：「記得建立 references/ 目錄以支援補全能力（checkCompletionGap）」
- 擴展現有的依賴提示 checklist 區塊
- 影響檔案：`plugins/overtone/scripts/manage-component.js`

### 功能 C：更新文件與測試

**C1 — 更新 health-check.js 頂部註解**（列表從 12 項 → 15 項）

**C2 — 新增測試**
- `tests/unit/health-check.test.js`（或新的獨立測試檔）新增 3 個 describe block
- checkClosedLoop：happy path（有 consumer）+ sad path（缺 consumer）
- checkRecoveryStrategy：happy path（handler 有 try-catch）+ sad path
- checkCompletionGap：happy path（skills 有 references/）+ sad path（缺少 references/）

---

## 實作策略

### checkClosedLoop 偵測邏輯

「consumer」的定義：codebase 中有讀取 timeline JSONL 的程式碼，且會根據 event type 分派或過濾。
實際掃描方式：
1. 從 registry.js 取得所有 timelineEvents key
2. 掃描 scripts/lib/*.js：找 `readTimeline` / `queryTimeline` / `getTimeline` 呼叫，
   以及用 `.type` / `entry.type` 過濾事件的程式碼
3. 判定：若 consumer 掃描只找到 generic 讀取（不區分 type），則視為「有讀取但無分類 consume」
4. 注意：部分事件（如 `session:compact-suggestion`）可能只寫不讀是合理的，severity 定為 warning 而非 error

### checkRecoveryStrategy 偵測邏輯

Handler 模組主入口函式判定：
- 取 handler 模組 export 的第一個函式（通常是 `run()` 或主 handler）
- 檢查函式 body 是否包含 `try {` 語法
- 9 個 handler 模組全部掃描

Agent prompt 停止條件判定：
- 讀取 agents/*.md 的 body（frontmatter 以外的 markdown 內容）
- 搜尋關鍵詞：`停止條件`、`STOP`、`誤判防護`、`失敗恢復`、`error recovery`

### checkCompletionGap 偵測邏輯

Skills references 缺口：
- 列出 `skills/` 下所有子目錄名稱
- 對每個 skill 確認 `skills/{name}/references/` 目錄存在
- 缺少 references/ → warning

---

## 並行可行性分析

| 任務組 | 可並行原因 |
|--------|-----------|
| A1 + A2 + A3 | 三個函式獨立，操作不同邏輯，寫同一檔案不同函式位置 |
| B1 + B2 | 修改同一檔案但不同 if/else 分支，需序列 |
| C1 + C2 | 文件更新 vs 測試撰寫，可並行 |

實際執行建議：
- **第一批（並行）**：A1 + A2 + A3 + B（單一 PR）→ developer 主筆
- **第二批（接續）**：C1 + C2 → developer 主筆，先有實作才能寫測試

---

## 範圍邊界

此次 **不包含**：
- 實作 hook-error-tracker（P0 缺口，需獨立 feature）
- Dashboard/Server 自動重啟機制
- 修復 intent_journal 無分析回饋問題
- 新增 `suggestedAction` 欄位給現有 12 項偵測（獨立改進）
- checkWorkflowCoverage、checkHookEventCoverage（文件已標記為 P1，獨立 feature）

---

## 關鍵約束

1. **health-check.js 輸出格式不變**：Finding schema 不增加必填欄位（不破壞現有測試）
2. **manage-component.js 提示走 stderr**：與現有警告風格一致（黃色 `⚠️` 前綴）
3. **偵測邏輯必須確定性**：不使用 AI 判斷，只做 regex/exists 靜態分析
4. **測試需 DI 友好**：新 check 函式需要 override 參數（参考 checkTestGrowth 的 getDepsOverride 模式）

---

## 影響檔案清單

| 檔案 | 變更類型 |
|------|---------|
| `plugins/overtone/scripts/health-check.js` | 新增 3 個 check 函式 + module.exports + runAllChecks |
| `plugins/overtone/scripts/manage-component.js` | 擴展 stderr 提示 2 條 |
| `tests/unit/health-check.test.js` | 新增 3 個 describe block |
| `docs/spec/overtone-製作規範.md` | 更新「已知缺口」狀態（待實作 → 已實作） |
| `docs/status.md` | 更新 health-check 項目數 12 → 15 |
