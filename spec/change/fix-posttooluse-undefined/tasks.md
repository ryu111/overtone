# PostToolUse:undefined hook error 修復 -- 任務清單

## 依賴分析

```
Phase 1（sequential）: T1 修改 hook-client.js（單一檔案，不可拆分）
Phase 2（sequential）: T2 擴充測試（依賴 Phase 1 的 hasFallback export）
Phase 3（sequential）: T3 驗收（依賴 Phase 2）
```

**為何全序列**：只修改 1 個生產檔案 + 1 個測試檔案，無並行收益。

---

## Phase 1：修改 hook-client.js（executor）

### T1：hook-client.js 三處修改

**檔案**：`~/.claude/hooks/hook-client.js`

- [ ] Line 28：`matcher` 預設值 `undefined` → `''`
  ```javascript
  // 修改前
  const [eventType, matcher] = process.argv.slice(2);
  // 修改後
  const [eventType, matcher = ''] = process.argv.slice(2);
  ```

- [ ] 新增 `hasFallback` 函式（FALLBACK_MODULES 定義之後）
  ```javascript
  function hasFallback(eventType, matcher) {
    if (!matcher) return !!FALLBACK_MODULES[eventType];
    return matcher.split('|').some(m => !!FALLBACK_MODULES[`${eventType}:${m}`]);
  }
  ```

- [ ] Line 111-141：替換錯誤處理段落為分流邏輯
  - 提取 `eventKey = ${eventType}:${matcher}`（統一使用，避免散落的 template literal）
  - dispatch 失敗：debugLog（不 logError）
  - `hasFallback === true`：autoStart → retry → fallback（原流程）
  - `hasFallback === false`：autoStart → exit（不 retry、不 logError）

- [ ] 確認所有 `${eventType}:${matcher}` 統一改用 `eventKey`（line 41, 42, 114, 117, 118, 124, 125, 137）

**驗證**：`grep 'undefined' hook-client.js` 不包含 matcher 相關的 undefined 引用

## Phase 2：擴充測試（executor）

### T2：擴充 hook-client.test.js

**檔案**：`~/projects/overtone/tests/unit/hook-client.test.js`

- [ ] 新增 describe：`event name 格式`
  - 測試 matcher 預設為 `''` 時，event key 不含 `undefined`
  - 模擬 `process.argv.slice(2)` 只有 eventType 無 matcher → `matcher = ''`

- [ ] 新增 describe：`hasFallback 分流判斷`
  - `hasFallback('PreToolUse', 'Bash')` → `true`
  - `hasFallback('PreToolUse', 'Write|Edit')` → `true`（pipe matcher）
  - `hasFallback('PostToolUse', '')` → `false`
  - `hasFallback('SessionStart', '')` → `false`
  - `hasFallback('Notification', '')` → `false`
  - `hasFallback('PreToolUse', 'Agent')` → `false`（Agent 無 fallback）

- [ ] 新增 describe：`觀測型事件不 retry`（E2E）
  - spawn hook-client.js 帶 `PostToolUse`（不帶 matcher）
  - stdin 傳入 `{"tool_name":"Bash","tool_input":{}}`
  - 驗證：exit 0
  - 驗證：stdout 無 block/error output
  - 注意：此測試在 server 未跑時才能驗證分流邏輯，在 server 運行時會正常 dispatch 成功

- [ ] 既有測試不動：確認 PreToolUse:Bash E2E 測試仍通過（guard fallback 路徑不變）

## Phase 3：驗收（executor → reviewer）

### T3：全面驗收

- [ ] `bun test` 全部通過
- [ ] 手動驗證：`echo '{"tool_name":"Bash"}' | bun ~/.claude/hooks/hook-client.js PostToolUse` → exit 0，stderr 無 retry error
- [ ] 手動驗證：`echo '{"tool_input":{"command":"rm -rf /"}}' | bun ~/.claude/hooks/hook-client.js PreToolUse Bash` → stdout 含 `"decision":"block"`
- [ ] 檢查 `/tmp/hook-client-debug.log` 確認 PostToolUse 事件記錄格式為 `PostToolUse:` 而非 `PostToolUse:undefined`
- [ ] reviewer 審查：確認 hasFallback 邏輯覆蓋所有 FALLBACK_MODULES key + 確認 PreToolUse guard 路徑未受影響
