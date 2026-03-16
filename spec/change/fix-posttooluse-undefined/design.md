# PostToolUse:undefined hook error 修復 -- 技術設計

## 深度路由：D3
**理由**：修改 hook-client.js 影響所有 session 的所有 hook 事件（每 session 觸發數十至數百次），屬安全敏感變更，需 reviewer 確認修改不破壞 guard fallback 路徑

---

## 技術摘要

- **方案**：在 hook-client.js 中做兩處精確修改——(1) `matcher` 預設值 `undefined` → `''`；(2) dispatch 失敗後根據 FALLBACK_MODULES 是否有對應條目決定是否 retry
- **理由**：最小修改範圍，根因修復，防護由測試提供
- **取捨**：不調整 autoStart 的 800ms 等待時間（獨立議題）；不改 settings.json（設計正確）

## 方案比較

| 維度 | 方案 A：hook-client 分流（選擇） | 方案 B：settings.json 傳 matcher arg | 方案 C：PostToolUse 改用 fire-and-forget |
|------|:------:|:------:|:------:|
| 修改範圍 | 1 檔案（hook-client.js） | 1 檔案（settings.json）+ hook-client.js | hook-client.js + server.js |
| 根因修復 | 修 undefined + 消除無效 retry | 只修 undefined，不解決無效 retry | 不修 undefined |
| 安全 | guard 路徑不變 | guard 路徑不變 | 需確認 fire-and-forget 不影響 guard |
| **結論** | 選擇：根因修復，最小範圍 | 治標，retry 噪音仍在 | 架構變更過大 |

## 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/hook-client.js` | matcher 預設值 + 分流邏輯 |
| 2 | `~/projects/overtone/tests/unit/hook-client.test.js` | 新增 event name 格式測試 + 分流行為測試 |

## 詳細設計

### 修改 1：matcher 預設值（line 28）

```javascript
// 修改前
const [eventType, matcher] = process.argv.slice(2);

// 修改後
const [eventType, matcher = ''] = process.argv.slice(2);
```

**影響分析**：
- `matcher` 從 `undefined` 變為 `''`
- template literal `${eventType}:${matcher}` 從 `PostToolUse:undefined` 變為 `PostToolUse:`
- FALLBACK_MODULES 查找：`FALLBACK_MODULES['PostToolUse:']` → `undefined`（與 `FALLBACK_MODULES['PostToolUse:undefined']` 結果相同，無行為差異）
- fallback 段落 line 127：`matcher ? matcher.split('|') : [eventType]` — `''` 是 falsy，走 `[eventType]` 分支（與 `undefined` 相同）

### 修改 2：分流邏輯（line 116-141）

目前錯誤處理流程（line 116-141）：

```
dispatch 失敗
  → logError(dispatch)
  → autoStart()
  → retry dispatch
  → 失敗 → logError(retry) ← PostToolUse 噪音源
  → fallback lookup（PostToolUse 無對應 → 空轉）
```

修改後：

```
dispatch 失敗
  → debugLog(dispatch fail)  // 不寫 error log
  → 判斷：hasFallback?
    ├─ 是（PreToolUse:Bash/Write/Edit）
    │    → autoStart()
    │    → retry dispatch
    │    → 失敗 → logError(retry) + fallback import
    └─ 否（PostToolUse、SessionStart、Notification 等）
         → autoStart()  // 仍嘗試啟動 server，讓後續 hook 受益
         → exit（不 retry、不 logError）
```

**關鍵設計決策**：

1. **autoStart 仍執行**：即使觀測型事件不 retry，autoStart 仍嘗試啟動 server。這讓下一次 hook 觸發時 server 已就緒。一次觀測事件丟失不影響功能。

2. **dispatch 失敗改用 debugLog 而非 logError**：第一次 dispatch 失敗對所有事件類型都改用 debugLog（寫入 `/tmp/hook-client-debug.log`）。只有 retry 失敗才寫 logError（寫入 `/tmp/hook-errors.jsonl`）——而觀測型事件不 retry，所以不會產生 error log。

3. **hasFallback 判斷方式**：檢查 `FALLBACK_MODULES` 中是否有匹配的 key。對於 pipe matcher（如 `Write|Edit`），拆分後逐一檢查。

```javascript
function hasFallback(eventType, matcher) {
  if (!matcher) return !!FALLBACK_MODULES[eventType];
  return matcher.split('|').some(m => !!FALLBACK_MODULES[`${eventType}:${m}`]);
}
```

### 修改後完整錯誤處理段落（line 111-141 替換）

```javascript
const eventKey = `${eventType}:${matcher}`;

try {
  const result = await tryDispatch();
  const t2 = performance.now();
  debugLog(`[${eventKey}] ok stdin=${(t1-t0).toFixed(1)}ms dispatch=${(t2-t1).toFixed(1)}ms total=${(t2-t0).toFixed(1)}ms decision=${result?.decision} path=${input?.tool_input?.file_path?.split('/').slice(-2).join('/') || '-'}`);
  output(result);
} catch (e1) {
  debugLog(`[${eventKey}] dispatch fail (${(performance.now()-t0).toFixed(1)}ms): ${e1.message}`);

  if (hasFallback(eventType, matcher)) {
    // Guard 型事件：retry + fallback
    try {
      await autoStart();
      output(await tryDispatch());
    } catch (e2) {
      logError(eventKey, e2, "retry");
      debugLog(`[${eventKey}] retry fail (${(performance.now()-t0).toFixed(1)}ms): ${e2.message} → fallback`);
      const keys = matcher ? matcher.split('|').map(m => `${eventType}:${m}`) : [eventType];
      for (const k of keys) {
        const fb = FALLBACK_MODULES[k];
        if (!fb) continue;
        try {
          const mod = await import(join(CLAUDE_DIR, fb.path));
          output(mod[fb.fn](input));
          break;
        } catch (e3) {
          logError(eventKey, e3, "fallback");
          debugLog(`[${eventKey}] fallback ${k} fail: ${e3.message}`);
        }
      }
    }
  } else {
    // 觀測型事件：只 autoStart（讓後續 hook 受益），不 retry
    try { await autoStart(); } catch {}
  }
}
```

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | hasFallback 邏輯有 bug，PreToolUse:Bash 被判為無 fallback → guard 失效 | 低 | 高 | 測試明確驗證 `hasFallback('PreToolUse', 'Bash') === true` |
| 2 | matcher 預設 `''` 造成 server.js dispatch 解析錯誤 | 無 | 無 | server.js dispatch 已處理空 matcher（全匹配），且 settings.json 的 `matcher: ""` 正在正常運作 |
| 3 | 觀測型事件長期不 retry 導致 server 永遠未啟動 | 低 | 低 | autoStart 仍執行；PreToolUse guard 事件仍會 retry + autoStart；SessionStart 也會 autoStart |

## 測試策略

| 測試 | 驗收條件 |
|------|---------|
| matcher 預設值 | `['PostToolUse', 'SessionStart', 'Notification'].forEach` → event key 不含 `undefined` |
| hasFallback 判斷 | `hasFallback('PreToolUse', 'Bash') === true`、`hasFallback('PostToolUse', '') === false` |
| E2E 觀測型事件 | PostToolUse hook（server 未跑）→ exit 0 + 無 retry error |
| E2E guard 型事件 | PreToolUse:Bash hook（server 未跑 + 危險命令）→ fallback block |

## 不做什麼

1. **不改 settings.json**：`matcher: ""` 全匹配是正確設計，hook-client.js 的 CLI arg 不帶 matcher 也是正確的（PostToolUse 匹配所有工具）
2. **不改 server.js**：dispatch 函式的 matcher 處理邏輯正確
3. **不調 autoStart 800ms**：獨立議題，此次 PR 不混入
