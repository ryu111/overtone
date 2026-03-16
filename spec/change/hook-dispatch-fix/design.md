# 修復 PreToolUse:Bash dispatch hook error — 技術設計

## 深度路由：D2
**理由**：跨 2 個模組（hook-client.js + error-analyzer.js）+ 對應測試，中型修復，不需安全審查（fallback 機制不變）

---

## 技術摘要

- **方案**：autoStart 固定 sleep 改為 health check polling + error-analyzer 新增自癒錯誤過濾
- **理由**：polling 自適應 server 啟動速度（快時 200ms 完成，慢時最多 1000ms），比固定 800ms 更可靠且平均更快
- **取捨**：最壞情況 1000ms 比 800ms 多 200ms，但發生機率低（server 通常 300-500ms 就緒）

## 方案比較

| 維度 | 方案 A：health polling（選擇） | 方案 B：加大固定 sleep |
|------|:------------:|:------:|
| 複雜度 | 低（新增 1 個 polling 函式） | 極低（改一個數字） |
| 效能 | 自適應：快時 200ms，慢時 1000ms | 固定 1500ms，浪費等待時間 |
| 可靠性 | 高（確認 server 真正就緒） | 中（仍是猜測，大延遲場景可能不夠） |
| 可維護性 | 好（polling 邏輯清晰） | 差（magic number，改了一次還會再改） |
| **結論** | ✅ 選擇 | ❌ 治標不治本，固定 sleep 是根因 |

## 模組介面

### 新增檔案

無。

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/hook-client.js` | autoStart 內 `Bun.sleep(800)` 改為 `pollHealth()` 迴圈 |
| 2 | `~/.claude/scripts/error-analyzer.js` | `createRepairTaskIfNeeded` 新增自癒錯誤過濾邏輯 |
| 3 | `~/projects/overtone/tests/unit/hook-client.test.js` | 新增 polling 邏輯測試 |
| 4 | `~/projects/overtone/tests/unit/error-analyzer.test.js` | 新增自癒錯誤過濾測試 |

### API 設計

#### hook-client.js — 新增內部函式 `pollHealth()`

```javascript
/**
 * Polling /health 直到 nova-server 就緒或達到重試上限
 * @param {object} opts - { maxRetries: 5, intervalMs: 200 }
 * @returns {Promise<boolean>} - true = server 就緒，false = 重試耗盡
 */
async function pollHealth({ maxRetries = 5, intervalMs = 200 } = {}) {
  for (let i = 0; i < maxRetries; i++) {
    await Bun.sleep(intervalMs);
    try {
      const h = await fetch('http://127.0.0.1:3457/health', {
        signal: AbortSignal.timeout(1000),
      });
      if (h.ok) {
        const body = await h.json();
        if (body.status === 'ok' && body.title === 'nova-server') return true;
      }
    } catch {}
  }
  return false;
}
```

#### error-analyzer.js — 新增 export 函式 `isSelfHealingError(clusterKey)`

```javascript
/**
 * 判斷錯誤是否為「自癒型」：dispatch 失敗但有 fallback 模組
 * 自癒型錯誤不該觸發 P1 Notion 任務
 * @param {string} clusterKey - "event:phase" 格式
 * @returns {boolean}
 */
export function isSelfHealingError(clusterKey) {
  // phase 必須是 "all-failed"（恢復鏈全失敗才記 error）
  // event 必須有對應 fallback 模組
  const FALLBACK_EVENTS = [
    'PreToolUse:Bash',
    'PreToolUse:Write',
    'PreToolUse:Edit',
    'PreToolUse:Write|Edit',
  ];
  const [event] = clusterKey.split(':');
  // 注意：clusterKey 格式是 "PreToolUse:Bash:all-failed"
  // 拆解後 event 部分需要重組
  const parts = clusterKey.split(':');
  const phase = parts[parts.length - 1];
  const eventKey = parts.slice(0, -1).join(':');

  if (phase !== 'all-failed') return false;
  return FALLBACK_EVENTS.some(fe => eventKey === fe || eventKey.startsWith(fe.split(':')[0]));
}
```

**修正**：重新審視 clusterKey 格式。`clusterErrors` 使用 `${e.event}:${e.phase}` 為 key，而 hook-client.js 記錄的 event 是 `"PreToolUse:Bash"`，phase 是 `"all-failed"`。所以 clusterKey = `"PreToolUse:Bash:all-failed"`。

簡化判斷：只要 phase 尾端是 `all-failed` 且 event 部分在 FALLBACK_MODULES 中有對應，就是自癒型。

## 資料模型

不新增資料結構。現有 `/tmp/hook-errors.jsonl` 和 `/tmp/hook-error-tasks-created.json` 格式不變。

## 執行步驟

### Phase 1：程式碼修改（parallel）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| T1 | `~/.claude/hooks/hook-client.js` | autoStart 中 `Bun.sleep(800)` 替換為 `pollHealth()` |
| T2 | `~/.claude/scripts/error-analyzer.js` | 新增 `isSelfHealingError` + 在 `createRepairTaskIfNeeded` 中過濾 |

T1 和 T2 修改不同檔案，無依賴，可並行。

### Phase 2：測試更新（parallel，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| T3 | `~/projects/overtone/tests/unit/hook-client.test.js` | 新增 pollHealth 行為測試：靜態驗證 hook-client.js 不含 `Bun.sleep(800)` |
| T4 | `~/projects/overtone/tests/unit/error-analyzer.test.js` | 新增 `isSelfHealingError` 單元測試 + `createRepairTaskIfNeeded` 過濾測試 |

T3 和 T4 修改不同測試檔案，無依賴，可並行。

### Phase 3：驗收（sequential，依賴 Phase 2）

| 步驟 | 說明 |
|------|------|
| T5 | `bun test` 全部通過 + E2E 驗證 fallback 仍正常 |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | polling 5 次仍不夠，server 某些場景需 >1000ms 啟動 | 低 | 中 | polling 參數設為常數，未來可調整；走 fallback 保底 |
| 2 | isSelfHealingError 誤判真正的 all-failed 為自癒，漏建 P1 | 低 | 高 | 只有 FALLBACK_MODULES 中列出的 3 個事件才算自癒；其他事件的 all-failed 正常建任務 |
| 3 | pollHealth 的多次 fetch 在高負載時增加 server 壓力 | 低 | 低 | 最多 5 次 health check，每次 timeout 1000ms，負載微乎其微 |

**Pre-mortem 觸發重新設計的條件**：無高機率+高影響項，繼續實作。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/unit/hook-client.test.js` | hook-client.js 不含 `Bun.sleep(800)`；E2E fallback 測試通過 |
| `tests/unit/error-analyzer.test.js` | `isSelfHealingError` 正確分類 6 個測試案例；過濾後不建假任務 |

## 不做什麼

1. **不做 nova-server 啟動優化**：根因是 hook-client 的等待策略，不是 server 慢
2. **不做 lockfile 機制重構**：現有 lockfile 防重複啟動運作正常，polling 只是替換 sleep
3. **不做 fallback 模組擴展**：觀測型事件（PostToolUse、SessionStart）失敗無害，不需要 fallback
