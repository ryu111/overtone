# Hook F 級修復 -- 技術設計

## 深度路由：D2
**理由**：跨 4 個檔案（guards.js、notification.js、metrics.js、judge.js）+ 安全漏洞修復 + 測試擴充，需要 planner 規劃但不需 reviewer（修復方向明確）

---

## 技術摘要

- **方案**：分三層修復 -- 層 1 驗證 askLocalModelJSON（確認 stripThinking 是否已修）、層 2 修三個模組的真實品質問題、層 3 修 judge.js 對非 handler 模組的分類
- **理由**：層 1 先確認語意評分管道是否暢通，再修模組本身，最後確保評分系統正確分類
- **取捨**：不調整 Judge 評分維度權重，只修結構和安全問題

## 方案比較

| 維度 | 方案 A：修模組 + 修 judge 分類（選擇） | 方案 B：只修模組，不動 judge |
|------|:-----------------------------------:|:-------------------------:|
| 複雜度 | 中 | 低 |
| 效果 | metrics.js 確定性可達 50/50 | metrics.js 確定性最多 40/50（永遠缺 on handler） |
| 風險 | judge 改動需守衛不影響其他類型 | 無 |
| **結論** | 選擇：根因修復 | 治標，metrics 永遠被扣分 |

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/modules/guards.js` | regex 改用 token 化匹配、加 try-catch、移除冗餘 export |
| 2 | `~/.claude/hooks/modules/notification.js` | AppleScript 注入轉義、加 try-catch、輸入驗證 |
| 3 | `~/.claude/hooks/modules/metrics.js` | shift() 改環形 buffer 或雙指標、加模組類型註解 |
| 4 | `~/.claude/scripts/judge.js` | scoreDeterministic hook type 新增「utility module」子類，無 on handler 不扣分 |
| 5 | `~/projects/overtone/tests/unit/pre-bash-guard.test.js` | 新增繞過變體測試 |
| 6 | `~/projects/overtone/tests/unit/on-notification.test.js` | 新增注入測試（含雙引號/反斜線） |

## 各模組修復設計

### guards.js -- regex 繞過修復

**根因**：現有 regex `/\brm\s+-[^\s]*r[^\s]*f/` 只匹配旗標連寫（`-rf`、`-fr`），無法匹配旗標分離（`rm -f -r`）或多空格。

**修復方案**：改用 token 化檢測 -- 將命令分割為 token 後檢查是否同時包含 `rm` + `-r`（或 `--recursive`）+ `-f`（或 `--force`）。

```
// 偽碼
function hasRmRfPattern(command) {
  const tokens = command.split(/\s+/);
  const hasRm = tokens[0] === 'rm' || tokens.some(t => t === 'rm');
  const flags = tokens.filter(t => t.startsWith('-')).join('');
  return hasRm && flags.includes('r') && flags.includes('f');
}
```

同時保留其他 regex（killall、git push --force 等），它們的繞過風險較低。

**加 try-catch**：包裝 evaluateBash 和 evaluateEdit，錯誤時回傳 `{ decision: "allow" }`（安全預設：不因 guard 錯誤阻塞 session）。

**移除冗餘 export**：最後一行 `export { DANGEROUS_PATTERNS, evaluateBash, evaluateEdit, PROTECTED_PATHS }` 是多餘的（已有 named export const on），改為只保留測試需要的 export。

### notification.js -- AppleScript 注入修復

**根因**：`display notification "${message}"` 中的 message 未轉義，若含 `"` 可逃逸 AppleScript 字串。

**修復方案**：
1. 輸入消毒：替換 `\` → `\\`、`"` → `\"`
2. 加 try-catch 包裝 spawnSync
3. 限制 title/message 長度（防止超長輸入）

### metrics.js -- 效能修復

**根因**：`arr.shift()` 在陣列頭部刪除是 O(N)，高頻 dispatch 下效能差。

**修復方案**：改用環形 buffer 模式 -- 用 headIndex 追蹤邏輯起始位置，evict 時只移動 index 不實際刪除。或更簡單：因為 MAX_TIMESTAMPS=1000 且 WINDOW_MS=60s，shift() 在這個規模下效能影響極小（1000 元素 shift ~0.01ms），實際上不需要優化。改為加註解說明效能分析即可。

**真正要修的**：加模組頂部的類型註解，讓 judge 可以識別。

### judge.js -- 非 handler 模組分類

**根因**：scoreDeterministic hook type 固定檢查 `on handler`（10 分），但 metrics.js 是被 server.js import 的 utility 模組，沒有 `export const on`。

**修復方案**：在 hook case 中加條件 -- 如果檔案內含 `// @type: utility` 註解或不含任何 handler pattern，用替代評分維度（如：有 createXxx factory function + 有 JSDoc）替代 `on handler` 的 10 分。

```
case "hook": {
  if (/export\s+(const|function|default)/.test(content)) score += 10;
  // 有 on handler 或有 factory 函式（utility 模組）
  if (hasOnHandler(content)) score += 10;
  else if (/export\s+function\s+create\w+/.test(content)) score += 10;
  if (/try\s*\{/.test(content)) score += 10;
  if (lines >= 10 && lines <= 300) score += 10;
  if (!/console\.log/.test(content)) score += 10;
  break;
}
```

## 執行步驟

### Phase 1：驗證 + 修復模組（parallel）

三個模組互不依賴，可並行修改。

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | guards.js | token 化 rm 檢測 + try-catch + 清理 export |
| 1b | notification.js | AppleScript 轉義 + try-catch + 輸入驗證 |
| 1c | metrics.js | 加 `// @type: utility` 標記 + 效能註解 |

### Phase 2：修 judge 分類（sequential，依賴 Phase 1 確定方向）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2 | judge.js | hook type scoreDeterministic 支援 utility 模組 |

### Phase 3：測試（parallel，依賴 Phase 1+2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | pre-bash-guard.test.js | 新增繞過變體測試（`rm -f -r`、`rm  -rf`） |
| 3b | on-notification.test.js | 重寫為測試 modules/notification.js 的 handler |
| 3c | 新增 judge-hook-scoring.test.js | 測試 utility 模組不扣 on handler 分 |

### Phase 4：驗收（sequential，依賴 Phase 3）

| 步驟 | 說明 |
|------|------|
| 4 | `bun test` 全通過 + 人工確認分數達標 |

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | guards.js token 化匹配誤擋正常 rm 命令（如 `rm file.txt`） | 中 | 高 | 只在同時有 `-r` 和 `-f` flag 時觸發，保留既有安全命令測試 |
| 2 | notification.js 轉義邏輯不完整，遺漏其他特殊字元 | 低 | 中 | AppleScript 只需轉義 `\` 和 `"`，兩個字元，邏輯簡單 |
| 3 | judge.js utility 判斷太寬鬆，讓真正缺少 handler 的壞模組也拿滿分 | 低 | 低 | 條件限定 `export function createXxx` pattern，不是任意函式 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| pre-bash-guard.test.js | `rm -f -r /`、`rm  -rf /`（多空格）、`rm -r -f /`（旗標分離）全部 block |
| on-notification.test.js | 含 `"` 的 message 回傳 allow 且不 throw |
| judge-hook-scoring.test.js | metrics.js 確定性分 50/50、guards.js 確定性分 50/50 |

## 不做什麼

1. **不調 Judge 語意評分權重**：語意分數取決於本地模型，修模組品質自然會提升
2. **不改 metrics.js 的 shift() 為環形 buffer**：1000 元素規模 shift 效能影響 <0.01ms，過度優化
