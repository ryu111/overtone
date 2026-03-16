# 修復 PreToolUse:Bash dispatch hook error（3 次/小時）

## 動機（Why）

- **問題**：hook-client.js 的 `tryDispatch()` 在 nova-server 重啟期間間歇性失敗（"Unable to connect"），集中在 14:15-14:16 有 14 次。雖然 fallback（直接 import guards.js）保證功能無損，但錯誤累積觸發 error-analyzer 建立假 P1 Notion 任務，形成自我回饋迴圈（server 重啟 → 失敗 → 建任務 → heartbeat 嘗試修復 → 可能再重啟）。
- **目標**：(1) autoStart 在 server 實際就緒後才 return；(2) error-analyzer 區分「自癒成功」與「真正失敗」，只對後者建 Notion 任務。
- **不做的代價**：每次 server 瞬斷都產生假 P1，人工排查浪費時間，降低 Notion 任務信噪比。

## 範圍

### In-scope

- hook-client.js autoStart：固定 800ms sleep 改為 health check polling（最多重試 N 次，每次間隔 M ms）
- error-analyzer.js：新增「自癒錯誤」分類，dispatch 失敗但 fallback 成功不計入建任務門檻
- 對應的單元測試更新

### Out-of-scope

- nova-server 本身的啟動效能優化（不改 server.js）
- hook-client.js 的 fallback 機制變更（已驗證可靠，不動）
- Notion 任務清理（已建的假任務手動處理）
- error-analyzer.js 的聚類演算法（現有邏輯足夠）

## 使用者故事

身為 Nova 系統的使用者，我希望 nova-server 瞬斷恢復後不會產生假 P1 Notion 任務，以便我能信任 Notion 任務列表中的每一筆都是需要人工介入的真實問題。

## 行為規格

### 正常路徑

1. hook-client 首次 `tryDispatch()` 失敗 → 呼叫 `autoStart()`
2. `autoStart()` 檢查 `/health` → 無回應 → 檢查 lockfile → 無 → 啟動 nova-server
3. `autoStart()` 進入 polling 迴圈：每 200ms 檢查 `/health`，最多 5 次（共計最多 1000ms）
4. `/health` 回應 `status === 'ok' && title === 'nova-server'` → polling 結束
5. `tryDispatch()` retry 成功 → 正常輸出，不記 error

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| autoStart polling 5 次都失敗（server 真的起不來） | polling 結束，走 fallback，記 `all-failed` error |
| dispatch 失敗 + fallback 成功 | 不記 hook-errors.jsonl（現行行為，維持不變） |
| lockfile 存在（另一個 hook-client 正在啟動） | 等 lockfile 消失（polling），再 retry dispatch |
| port 被非 nova-server 佔用 | 不 spawn，直接走 fallback（現行行為，維持不變） |

### 邊界條件

- 並行：2 個 hook-client 同時觸發 autoStart → lockfile 機制阻擋第二個 → 第二個 polling 等待 server 就緒
- server 在 polling 第 3 次時就緒 → 第 3 次 health check 成功 → 立即結束 polling（不浪費剩餘 2 次）
- server 啟動耗時超過 1000ms → polling 失敗 → 走 fallback → 下一次 hook 觸發時 server 已就緒

## 資料模型

### 輸入

N/A（不新增資料結構）

### 輸出

N/A（不新增資料結構）

### 儲存

- `/tmp/hook-errors.jsonl`：現有格式不變
- `/tmp/hook-error-tasks-created.json`：現有格式不變

## 介面契約

### hook-client.js autoStart（內部函式，不變更公開 API）

```javascript
// 改動前
await Bun.sleep(800);

// 改動後
await pollHealth({ maxRetries: 5, intervalMs: 200 });
```

### error-analyzer.js clusterErrors（公開 API 不變）

不變更 `clusterErrors` 和 `createRepairTaskIfNeeded` 簽名。新增內部邏輯：
- `createRepairTaskIfNeeded` 新增 `isSelfHealingError(cluster)` 判斷：phase 為 `"all-failed"` 且 event 有對應 fallback 模組 → 已自癒 → 不計入建任務門檻

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | autoStart polling 最壞情況 1000ms（5 次 x 200ms），/health timeout 維持 ≤1000ms |
| 安全 | PreToolUse:Bash fallback 機制不受影響，guards 防護持續有效 |
| 相容性 | 不需向後相容（nova 原則） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | nova-server (server.js) | autoStart 啟動目標，不修改 |
| 上游 | guards.js | fallback 模組，不修改 |
| 下游 | maintainer.js Phase 3c | 呼叫 error-analyzer.createRepairTaskIfNeeded |

## 驗收標準

- [ ] autoStart 不再使用固定 `Bun.sleep(800)`，改用 health check polling
- [ ] polling 參數：最多 5 次、每次間隔 200ms、/health timeout ≤1000ms
- [ ] error-analyzer 對 dispatch 失敗但有 fallback 的事件不建 P1 任務
- [ ] `bun test` 全部通過（含新增測試）
- [ ] E2E：server 斷線時 PreToolUse:Bash 仍被 fallback 攔截（現有測試覆蓋）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| polling 延長 hook 執行時間導致 Claude Code 感知延遲 | 低 | 中 | 最壞 1000ms 與現行 800ms 相當；正常情況 server 200-400ms 就緒，反而更快 |
| error-analyzer 過濾自癒錯誤後遺漏真正問題 | 低 | 高 | 只過濾有 fallback 模組的事件；無 fallback 的事件（觀測型）本來就不記 error |
| lockfile 殘留導致 polling 永遠等待 | 低 | 中 | autoStart 已有 finally 清理；polling 有最大重試次數上限 |
