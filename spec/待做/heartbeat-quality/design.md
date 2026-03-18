# Heartbeat 品質提升 + Spawn 穩定性 — 技術設計

## 深度路由：D2
**理由**：10 個修復點橫跨 3 個檔案，需要 planner 產出分組計劃 + executor 實作。不選 D1 因跨 3 個檔案超過 3 檔閾值；不選 D3 因不涉及安全敏感邏輯；不選 D4 因修改點雖跨檔案但共用測試檔，不適合多 executor 並行。

---

## 技術摘要

- **方案**：逐點修復（空 catch 加 log → 穩定性 guard → spawn 防護 → 測試擴充）
- **理由**：每個修復點獨立明確，不需架構重構，直接在現有程式碼上補強
- **取捨**：不做結構重構（如抽出共用 error handler），保持最小改動

## 方案比較

| 維度 | 方案 A：逐點修復（選擇） | 方案 B：抽出共用 ErrorReporter |
|------|:------------:|:------:|
| 改動量 | 小（每個點 1-5 行） | 中（新增模組 + 所有 catch 改用） |
| 風險 | 低（不改結構） | 中（引入新依賴） |
| 可維護性 | 中（每個 catch 獨立 log） | 高（統一 error 出口） |
| 即時效果 | 立即解決所有空 catch | 需先建 ErrorReporter 再替換 |
| **結論** | 選擇：最小改動，問題規模不需新抽象 | 不選：Over-engineering，10 個 catch 不足以正當化新模組 |

## 模組介面

### 新增檔案

無新增檔案。

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/modules/heartbeat.js` | 空 catch 加 log（L14）、while 上限（L94）、deps guard（L86） |
| 2 | `~/.claude/scripts/heartbeat.js` | 空 catch 加 log（L229、L346）、CLI fallback 效能（L374） |
| 3 | `~/.claude/scripts/session-spawner.js` | process.kill catch 加 debug log（L167）、spawn 前健康檢查、spawn 失敗寫 hook-errors.jsonl |
| 4 | `~/projects/overtone/tests/unit/heartbeat.test.js` | 新增 8+ 測試覆蓋所有修復點 |

### API 設計

不變更任何 public API。內部新增：

```javascript
// heartbeat.js 新增常數
const MAX_BATCH = 50;  // Phase 1 while 迴圈上限

// session-spawner.js 新增內部函式
function logSpawnError(event, error) {
  // 寫入 /tmp/hook-errors.jsonl
  const entry = { ts: new Date().toISOString(), event, error: String(error), phase: 'heartbeat-spawn' };
  appendFileSync('/tmp/hook-errors.jsonl', JSON.stringify(entry) + '\n');
}
```

## 資料模型

不新增。沿用既有 `/tmp/hook-errors.jsonl` 格式。

## 執行步驟

### Phase 1：空 catch 修復 + 穩定性 guard（parallel）

4 個修改點互相獨立，修改不同行號範圍，可並行。

| 步驟 | 檔案 | 行號 | 說明 |
|------|------|------|------|
| 1a | `hooks/modules/heartbeat.js` | L14 | `catch {}` → `catch (e) { console.error('[heartbeat] loadConfig error:', e.message); }` |
| 1b | `scripts/heartbeat.js` | L229 | `catch { /* best effort */ }` → `catch (e) { console.error('[heartbeat] resetTask fallback error:', e.message); }` |
| 1c | `scripts/heartbeat.js` | L346 | `catch { return null; }` → `catch (e) { console.error('[heartbeat] NOTION_TOKEN read error:', e.message); return null; }` |
| 1d | `scripts/session-spawner.js` | L166-167 | `catch { /* ... */ }` → `catch (e) { console.debug('[session-spawner] kill process group failed (normal if already exited):', e.message); }` |

### Phase 2：穩定性防護（sequential，依賴 Phase 1 同檔案）

| 步驟 | 檔案 | 行號 | 說明 |
|------|------|------|------|
| 2a | `hooks/modules/heartbeat.js` | L86-87 | handler 開頭加 deps null guard：`if (!deps) { console.error('[heartbeat] deps not initialized'); return; }` |
| 2b | `hooks/modules/heartbeat.js` | L94 | while 加 MAX_BATCH 上限：`let batch = 0; while (batch < MAX_BATCH) { ... batch++; }` + 超限 warn |
| 2c | `scripts/heartbeat.js` | L373-376 | `for await (const chunk of p.stdout)` → `const output = await Bun.readableStreamToText(p.stdout);` |

### Phase 3：Spawn 穩定性（sequential，修改 session-spawner.js + heartbeat module）

| 步驟 | 檔案 | 行號 | 說明 |
|------|------|------|------|
| 3a | `scripts/session-spawner.js` | L100（spawnSession 開頭） | spawn 前加 `Bun.which('claude')` 檢查，失敗回傳 `{ ok: false, error: 'claude CLI not found' }` |
| 3b | `scripts/session-spawner.js` | L150-151 | spawn catch 區塊加 logSpawnError 寫入 hook-errors.jsonl |
| 3c | `hooks/modules/heartbeat.js` | L131-132 | spawned.ok === false 時 emit 包含 error 的 sd:done event（已有，確認 hook-errors 也寫入） |

### Phase 4：測試擴充（sequential，依賴 Phase 1-3）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4a | `tests/unit/heartbeat.test.js` | Group A 測試：loadConfig 錯誤 log、resetTask catch log、NOTION_TOKEN catch log |
| 4b | `tests/unit/heartbeat.test.js` | Group B 測試：while 超過 MAX_BATCH 時 break、deps null guard、CLI fallback 使用 readableStreamToText |
| 4c | `tests/unit/heartbeat.test.js` | Group C 測試：claude CLI 不存在時 spawn 回傳 error、spawn 失敗寫 hook-errors.jsonl |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | MAX_BATCH=50 太小，正常大批量任務被截斷 | 低 | 中 | warn log 中包含截斷資訊，可從 log 發現並調整常數 |
| 2 | Bun.readableStreamToText 在 subprocess pipe 上行為不同 | 低 | 中 | Phase 4 測試覆蓋 CLI fallback 路徑 |
| 3 | Bun.which 在 detached subprocess 環境中 PATH 不同 | 低 | 低 | spawn 前已有遞迴防護（OVERTONE_SPAWNED），Bun.which 只是額外安全層，失敗時 fallback 到原有行為 |
| 4 | console.error 在高頻錯誤場景下 log 暴增 | 低 | 低 | 高頻錯誤會觸發 consecutiveFailures → paused，自然限流 |

無「高機率 + 高影響」情境，設計可繼續。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/unit/heartbeat.test.js` | Group A：3 個測試驗證空 catch 修復後有 log 輸出（mock console.error） |
| `tests/unit/heartbeat.test.js` | Group B：3 個測試驗證 while 上限、deps guard、CLI fallback |
| `tests/unit/heartbeat.test.js` | Group C：2 個測試驗證 claude CLI 檢查、spawn 失敗寫 hook-errors |
| 全域 | `bun test` 全部通過 |

## 不做什麼

1. **不抽出共用 ErrorReporter 模組**：10 個 catch 點不足以正當化新抽象，逐點修復更直接
2. **不改 heartbeat module 的事件訂閱模式**：subscribe: ['hb:tick'] 不變，只修復 handler 內部品質
3. **不改 session-spawner 的 stream-json 解析**：parseStreamJson 內的 `catch` 已有正當理由（跳過非 JSON 行），不屬於空 catch 問題
