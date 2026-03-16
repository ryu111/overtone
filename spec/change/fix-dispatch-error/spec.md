# 修復 dispatch fallback 順序（fast-fallback-first）

## 動機（Why）

- **問題**：hook-client.js dispatch 失敗時，有本地 fallback 的事件（PreToolUse:Bash/Write/Edit）仍先等 autoStart 恢復 server（6+ 秒），再 retry dispatch，最後才 fallback。8 次 PreToolUse:Bash dispatch fail（2 天內），最大 burst 27 次連續失敗（3/16 14:15 server 宕機）。
- **目標**：有 fallback 的事件 dispatch 失敗後立即 fallback（<15ms），背景觸發 autoStart；無 fallback 的觀測型事件 dispatch 失敗後直接退出，背景觸發 autoStart。
- **不做的代價**：每次 server 宕機，guard 類 hook 延遲 6+ 秒才生效，期間 Claude Code 工具執行被阻塞。

## 範圍

### In-scope

- hook-client.js 錯誤恢復路徑重排：有 fallback → 先 fallback 再背景 autoStart
- hook-client.js autoStart 加入 debugLog（每個步驟記錄）
- nova-server.log 使用 append 模式保留歷史

### Out-of-scope

- 不改 server.js 架構
- 不改 guards.js fallback 函式本身
- 不改 FALLBACK_MODULES 對應表
- 不追查 server 宕機根因（本次只優化恢復路徑）

## 使用者故事

身為 nova 系統的 hook-client，我希望 dispatch 失敗時優先用本地 fallback 回應（<15ms），以便 guard 保護不因 server 宕機而延遲 6+ 秒。

## 行為規格

### 正常路徑

1. tryDispatch() 成功 → output(result) → 結束（不變）

### 錯誤路徑：有 fallback 的事件（PreToolUse:Bash/Write/Edit）

1. tryDispatch() 失敗
2. 立即呼叫 tryFallback() → output 本地 guard 結果（<15ms）
3. 背景觸發 autoStart()（不 await，不阻塞）
4. 結束

### 錯誤路徑：無 fallback 的觀測型事件（PostToolUse/SubagentStop 等）

1. tryDispatch() 失敗
2. 背景觸發 autoStart()（不 await，不阻塞）
3. 直接退出（觀測型事件丟失可接受，server 恢復後自動補上）

### 邊界條件

- tryFallback 本身也失敗 → logError 記錄 + 背景 autoStart → 退出（不阻塞工具）
- autoStart 背景執行時 process.exit → autoStart 被中斷（可接受，下次 hook 觸發時再嘗試）

## 資料模型

### 輸入

N/A（不新增資料結構）

### 輸出

N/A（不新增資料結構）

### 儲存

- `/tmp/hook-client-debug.log`：autoStart debugLog 訊息新增（現有格式不變）
- `/tmp/nova-server.log`：改為 append 模式保留歷史 crash log

## 介面契約

### hook-client.js 錯誤恢復（虛擬碼）

```javascript
// 改前：dispatch fail → await autoStart(6s) → retry → fallback
// 改後：dispatch fail → fallback(15ms) → 背景 autoStart

try {
  output(await tryDispatch());
} catch (e1) {
  const needsFallback = hasFallback(eventType, matcher);
  if (needsFallback) {
    await tryFallback(eventType, matcher, input);
  }
  // 背景啟動 server（不阻塞）
  autoStart().catch(err => debugLog(`[autoStart] background fail: ${err.message}`));
}
```

### autoStart debugLog 新增

```
[autoStart] start health-check
[autoStart] health-check: nova-server alive / port-occupied / no-response
[autoStart] lockfile: exists(stale) / exists(valid) / absent
[autoStart] spawn: pid={N}
[autoStart] pollHealth: attempt {i} delay={N}ms result={ok|fail}
[autoStart] complete: {success|fail} ({N}ms)
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 有 fallback 的事件恢復時間：6000ms+ → <15ms |
| 效能 | hook-client 總執行時間 budget：<50ms（含 fallback 路徑） |
| 安全 | fallback 語意一致：dispatch 成功用 server 結果，失敗用本地 evaluateBash/evaluateEdit |
| 可觀測性 | autoStart 每步都有 debugLog，crash 分析不再盲區 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 修改 | `~/.claude/hooks/hook-client.js` | 主要修改目標 |
| 上游 | `~/.claude/hooks/modules/guards.js` | fallback 函式來源（不修改） |
| 下游 | `/tmp/hook-client-debug.log` | debugLog 輸出 |
| 下游 | `/tmp/nova-server.log` | autoStart spawn 日誌 |

## 驗收標準

- [ ] dispatch 失敗 + 有 fallback → 先呼叫 tryFallback，不先 await autoStart
- [ ] dispatch 失敗 + 無 fallback → 不呼叫 tryFallback，背景 autoStart
- [ ] autoStart 在錯誤恢復路徑中不被 await（背景執行）
- [ ] autoStart 函式內每個分支有 debugLog
- [ ] nova-server.log 使用 append 模式（openSync flag 為 'a'）
- [ ] tryFallback 失敗時記錄 logError
- [ ] `bun test` 全部通過
- [ ] 現有 fallback 語意不變（block/allow 結果一致）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| autoStart 背景執行時 process.exit 中斷 spawn | 中 | 低 | 可接受：下次 hook 觸發時 autoStart 再執行 |
| tryFallback 的 import() 阻塞超過 15ms budget | 低 | 低 | guards.js 已被 Bun import cache，首次 import ~5ms，後續 <1ms |
| 失去 retry 機會（server 瞬斷但快速恢復的場景） | 低 | 低 | 瞬斷場景極少（2 天數據中 0 次瞬斷成功 retry）；背景 autoStart 確保下次 dispatch 成功 |
| 背景 autoStart 的 catch 吞掉重要錯誤 | 低 | 低 | debugLog 記錄所有 autoStart 步驟，不會完全靜默 |
