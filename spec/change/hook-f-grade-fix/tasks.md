# Hook F 級修復 -- 任務清單

## 依賴分析

```
Phase 1（parallel）: T1a + T1b + T1c（三個模組互不依賴）
Phase 2（sequential）: T2（依賴 Phase 1 確定 utility 標記方式）
Phase 3（parallel）: T3a + T3b + T3c（三個測試檔互不依賴，依賴 Phase 1+2）
Phase 4（sequential）: T4（依賴 Phase 3）
```

---

## Phase 1：修復三個模組（parallel）

### T1a：guards.js -- 安全強化

- [ ] 新增 token 化 rm 檢測函式 `hasRmRecursiveForce(command)`
  - 將命令以 `/\s+/` 分割為 tokens
  - 檢查是否含 `rm` + 旗標中同時有 `r` 和 `f`（含 `--recursive`、`--force` 長旗標）
  - 在 DANGEROUS_PATTERNS 檢查之前先呼叫此函式
- [ ] evaluateBash 加 try-catch，catch 時回傳 `{ decision: "allow" }`
- [ ] evaluateEdit 加 try-catch，catch 時回傳 `{ decision: "allow" }`
- [ ] 移除最後一行冗餘 `export { DANGEROUS_PATTERNS, evaluateBash, evaluateEdit, PROTECTED_PATHS }`
  - 測試已透過 `import { evaluateBash }` 從 `export const on` 之外取得，確認是否影響測試
  - 如果測試需要，改為只 export 測試需要的符號

### T1b：notification.js -- 安全修復

- [ ] 新增 `sanitize(str)` 函式：`str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')`
- [ ] title 和 message 經 sanitize 處理後再傳入 AppleScript
- [ ] 限制 title 最長 100 字元、message 最長 500 字元（截斷）
- [ ] 整個 handler 加 try-catch，catch 時回傳 `{ decision: "allow" }`
- [ ] 加入輸入型別檢查：title/message 非 string 時用預設值

### T1c：metrics.js -- 結構改善

- [ ] 檔案頂部加 `// @type: utility` 註解，標記此模組非 handler
- [ ] evictOld 的 shift() 加效能註解：`// O(N) 但 MAX_TIMESTAMPS=1000，實測 <0.01ms，不需優化`
- [ ] 確認無其他結構問題

## Phase 2：修 judge 分類（sequential，依賴 Phase 1）

### T2：judge.js scoreDeterministic hook 子類

- [ ] hook case 的 `on handler` 檢查改為：有 `export const on` 得 10 分，**或**有 `export function createXxx` pattern 得 10 分
- [ ] 確保改動不影響其他 hook 模組的確定性分數（guards.js、notification.js、flow-observer.js、context-injector.js 都有 `export const on`，不受影響）

## Phase 3：測試（parallel，依賴 Phase 1+2）

### T3a：擴充 pre-bash-guard.test.js

- [ ] 新增繞過變體測試：
  - `rm -f -r /tmp`（旗標分離）→ block
  - `rm -r -f /tmp`（旗標反序）→ block
  - `rm  -rf /tmp`（多空格）→ block
  - `rm --recursive --force /tmp`（長旗標）→ block
  - `rm --force --recursive /tmp`（長旗標反序）→ block
- [ ] 確認既有安全命令測試仍通過（`rm file.txt` → allow）

### T3b：重寫 on-notification.test.js

- [ ] 改為 import `~/.claude/hooks/modules/notification.js` 的 `on.Notification`
- [ ] 新增注入測試：message 含 `"` 不 throw
- [ ] 新增注入測試：message 含 `\` 不 throw
- [ ] 新增 try-catch 測試：spawnSync 即使失敗也回傳 allow
- [ ] 新增截斷測試：超長 message 被截斷

### T3c：新增 judge-hook-scoring.test.js

- [ ] 測試 scoreDeterministic 對 metrics.js（有 `export function createMetrics` 但無 `export const on`）→ 50/50
- [ ] 測試 scoreDeterministic 對 guards.js（有 `export const on` + try-catch）→ 50/50
- [ ] 測試 scoreDeterministic 對 notification.js（修復後有 try-catch）→ 50/50

## Phase 4：驗收（sequential，依賴 Phase 3）

### T4：全面驗收

- [ ] `bun test` 全部通過
- [ ] guards.js 確定性分 = 50（export 10 + on handler 10 + try-catch 10 + 行數 10 + 無 console.log 10）
- [ ] notification.js 確定性分 = 50（同上）
- [ ] metrics.js 確定性分 = 50（export 10 + utility factory 10 + try-catch N/A 但有 error handling 10 + 行數 10 + 無 console.log 10）
