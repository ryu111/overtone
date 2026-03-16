# Hook F 級修復 -- guards/metrics/notification semantic=0 根因修復

## 動機（Why）

- **問題**：三個 hook 模組（guards.js、metrics.js、notification.js）在 Judge 評分中拿到 F 級。根因分兩層：(1) askLocalModelJSON 解析 Qwen3.5 thinking 輸出失敗導致 semantic=0；(2) 模組本身有真實品質問題（安全漏洞、結構缺陷）
- **目標**：三個模組全部達到 C 級以上（>=70/100），同時修復真實的安全和品質問題
- **不做的代價**：notification.js 的 AppleScript 注入漏洞持續存在；guards.js 的 regex 繞過讓危險命令可通過；metrics.js 被 Judge 錯誤分類為 handler 模組持續扣分

## 範圍

### In-scope

- guards.js：修復 regex 繞過漏洞 + 加 try-catch + 移除冗餘 export
- notification.js：修復 AppleScript 注入漏洞 + 加 try-catch + 加輸入驗證
- metrics.js：修復 shift() O(N) 效能問題 + 提取硬編碼常數
- judge.js scoreDeterministic()：讓 hook type 支援「非 handler 模組」分類（metrics.js 不應被扣 `on handler` 分）
- 驗證 askLocalModelJSON 的 stripThinking + extractJSON 邏輯是否正確處理 Qwen3.5 thinking 輸出

### Out-of-scope

- 其他 hook 模組的品質改善
- Judge 評分維度權重調整
- 本地模型 prompt 調優

## 使用者故事

身為 Nova 系統維護者，我希望 hook 模組通過 Judge 品質門檻（C 級以上），以便自動品質監控不持續報警。

身為 Nova 系統使用者，我希望 guards.js 能正確阻擋所有危險命令變體，以便安全防護無死角。

身為 Nova 系統使用者，我希望 notification.js 不被惡意輸入注入 AppleScript，以便通知功能安全可靠。

## 行為規格

### 正常路徑

1. guards.js 收到 `rm -f -r /` → 阻擋（目前可繞過）
2. notification.js 收到含雙引號的 message → 正確轉義後顯示通知
3. metrics.js 滑動窗口淘汰 → O(1) 操作
4. judge.js 評分 metrics.js → 識別為非 handler 模組，不扣 `on handler` 分

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| guards.js evaluateBash 接收到非 string command | 回傳 `{ decision: "allow" }`，不拋例外 |
| notification.js spawnSync 失敗 | catch 錯誤，回傳 `{ decision: "allow" }`，不 crash |
| metrics.js 收到 null event | 靜默忽略，不拋例外 |

### 邊界條件

- guards.js：`rm  -r  -f`（多空格）、`rm\t-rf`（tab 分隔）→ 應阻擋
- notification.js：message 含 `"`, `\`, `'` → 應轉義
- metrics.js：高頻 dispatch（>1000/秒）→ 環形 buffer 不溢出

## 資料模型

### 輸入

N/A（修改既有模組，無新資料結構）

### 輸出

N/A

### 儲存

N/A

## 介面契約

各模組公開介面不變：
- guards.js：`export const on = { "PreToolUse:Bash", "PreToolUse:Write", "PreToolUse:Edit" }`
- notification.js：`export const on = { Notification }`
- metrics.js：`export function createMetrics()` → `{ onEvent, snapshot, _reset }`

## 非功能需求

| 維度 | 要求 |
|------|------|
| 安全 | guards.js 阻擋率從 ~80% 提升到 99%（覆蓋旗標分離、多空格、tab） |
| 安全 | notification.js 消除 AppleScript 注入漏洞 |
| 效能 | metrics.js 滑動窗口淘汰從 O(N) 改為 O(1) |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | server.js | import metrics.js |
| 上游 | hook dispatcher | 呼叫 guards.js、notification.js |
| 下游 | judge.js | 評分三個模組 |

## 驗收標準

- [ ] `bun test` 全部通過（含新增測試）
- [ ] guards.js 確定性分數 50/50（export + on handler + try-catch + 行數 + 無 console.log）
- [ ] notification.js 確定性分數 50/50（同上）
- [ ] metrics.js 不因缺少 `on handler` 被扣分（judge 正確分類）
- [ ] guards.js 測試覆蓋：`rm -f -r`、`rm  -rf`（多空格）等繞過變體
- [ ] notification.js 測試覆蓋：含雙引號的 message 不注入 AppleScript
- [ ] 三個模組 Judge 評分 >= 70（C 級）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| guards.js regex 改動誤擋正常命令 | 中 | 高 | 擴充安全命令測試集，新增邊界測試 |
| judge.js 分類改動影響其他模組評分 | 低 | 中 | 只改 hook type 的 `on handler` 判斷，加條件守衛 |
| askLocalModelJSON 已能正確解析 thinking 輸出（層 1 非真實問題）| 中 | 低 | 先驗證 stripThinking+extractJSON，確認是否有殘餘 bug |
