# 修復 dispatch fallback 順序 -- 技術設計

## 深度路由：D2
**理由**：僅修改 hook-client.js 1 個檔案，邏輯重排明確，不涉及跨模組架構變更。D1 不足因需 spec 記錄恢復路徑語意。

---

## 技術摘要

- **方案**：重排錯誤恢復順序（fallback-first + background autoStart）+ autoStart 加 debugLog + log append 模式
- **理由**：根因是 fallback 順序錯誤，不是缺機制。2 天數據中 0 次 retry 成功，autoStart 等待 6 秒全浪費。
- **取捨**：放棄 retry dispatch 機會（server 瞬斷快速恢復的場景），換取 guard 事件從 6000ms+ 降到 <15ms

## 方案比較

| 維度 | 方案 A：fallback-first + 背景 autoStart（選擇） | 方案 B：並行 fallback + autoStart |
|------|:----------------------------------------------:|:-------------------------------:|
| 恢復延遲 | <15ms（fallback 立即回應） | <15ms（相同） |
| 實作複雜度 | 低（重排 try-catch 順序） | 中（Promise.race + 額外狀態管理） |
| 語意清晰度 | 高（線性：fallback → 背景恢復） | 低（並行路徑需處理 race condition） |
| autoStart 成功後 retry | 不做（數據顯示無效） | 可做但增加複雜度 |
| **結論** | 選擇：最簡單，數據驗證有效 | 不選：複雜度無收益 |

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/hook-client.js` | (a) 錯誤恢復路徑重排：L170-203 → fallback-first 模式 (b) autoStart 內加 debugLog (c) openSync flag 確認為 'a' |

### 新增檔案

無

### API 設計

無新增 API。內部函式簽名不變，只改呼叫順序。

## 資料模型

- 不新增資料結構
- `/tmp/hook-client-debug.log`：autoStart debugLog 訊息密度增加（每步 1 行）
- `/tmp/nova-server.log`：保持 append 模式

## 執行步驟

### Phase 1：hook-client.js 修改（sequential，同一檔案）

| 步驟 | 說明 |
|------|------|
| 1a | 重寫 L170-203 錯誤恢復路徑：dispatch fail → tryFallback（如有）→ 背景 autoStart |
| 1b | autoStart 函式內加 debugLog：health-check 結果、lockfile 狀態、spawn PID、pollHealth 每次嘗試、完成耗時 |
| 1c | 確認 openSync('/tmp/nova-server.log', 'a') 的 'a' flag（已是 append，驗證即可） |

### Phase 2：測試（依賴 Phase 1）

| 步驟 | 說明 |
|------|------|
| 2a | 靜態驗證：錯誤恢復路徑中 autoStart 不被 await（背景執行） |
| 2b | 靜態驗證：有 fallback 事件的恢復路徑先呼叫 tryFallback |
| 2c | 靜態驗證：autoStart 內含 debugLog 呼叫 |
| 2d | `bun test` 全部通過 |

## Pre-mortem

**假設這個修復上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 背景 autoStart 的 unhandled promise rejection crash hook-client | 中 | 高 | `.catch()` 捕捉所有 autoStart 錯誤，debugLog 記錄 |
| 2 | tryFallback 的 import() 在 guards.js 有語法錯誤時 crash | 低 | 高 | tryFallback 已有 try-catch（現有防護不變） |
| 3 | 移除 retry 後，server 瞬斷場景的觀測型事件丟失增加 | 低 | 低 | 觀測型事件丟失本來就可接受（spec 明確記錄） |
| 4 | autoStart 背景執行但 process.exit 先觸發，spawn 的 server 成為孤兒 | 中 | 低 | proc.unref() + detached 確保 server 獨立存活，不受 hook-client exit 影響 |

Pre-mortem #1 是「中機率 + 高影響」 → 📋 MUST 確保 `.catch()` 完整覆蓋。設計中已包含此防護。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/unit/hook-client.test.js` | 錯誤恢復路徑中 autoStart 不被 await |
| `tests/unit/hook-client.test.js` | 有 fallback 事件的恢復路徑先呼叫 tryFallback |
| `tests/unit/hook-client.test.js` | autoStart 內含 debugLog |
| `bun test` | 全部通過，0 fail |

## 不做什麼

1. **不做 retry dispatch**：2 天數據中 0 次 retry 成功，移除 retry 簡化邏輯且無功能損失
2. **不改 tryFallback 實作**：現有 fallback 邏輯運作正常，只改呼叫時機
3. **不改 autoStart 的 spawn/pollHealth 邏輯**：前一輪 fix-dispatch-recovery 已優化（isLockfileStale + 指數退避），本次只加 debugLog
4. **不改 server.js**：server 宕機根因另案處理
