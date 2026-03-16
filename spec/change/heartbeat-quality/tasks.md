# Heartbeat 品質提升 — 任務清單

## 子任務依賴分析

```
Phase 1（parallel）: T1a + T1b + T1c + T1d（空 catch 修復，不同行號不衝突）
Phase 2（sequential）: T2a → T2b → T2c（T2a/T2b 改 heartbeat.js module 同檔案，T2c 改 scripts/heartbeat.js）
Phase 3（sequential）: T3a → T3b → T3c（都改 session-spawner.js 或依賴其輸出）
Phase 4（sequential，依賴 Phase 1-3）: T4a → T4b → T4c（都改同一測試檔案）
```

## Group A：空 catch 修復（Phase 1, parallel）

### T1a — loadConfig 空 catch 加 log
- **檔案**：`~/.claude/hooks/modules/heartbeat.js`
- **行號**：L14
- **改動**：`catch {}` → `catch (e) { console.error('[heartbeat] loadConfig error:', e.message); }`
- **驗證**：grep 該行無空 catch

### T1b — resetTask 空 catch 加 log
- **檔案**：`~/.claude/scripts/heartbeat.js`
- **行號**：L229
- **改動**：`catch { /* best effort */ }` → `catch (e) { console.error('[heartbeat] resetTask fallback error:', e.message); }`
- **驗證**：grep 該行無空 catch

### T1c — NOTION_TOKEN 讀取空 catch 加 log
- **檔案**：`~/.claude/scripts/heartbeat.js`
- **行號**：L346
- **改動**：`catch { return null; }` → `catch (e) { console.error('[heartbeat] NOTION_TOKEN read error:', e.message); return null; }`
- **驗證**：grep 該行無空 catch

### T1d — process.kill catch 加 debug log
- **檔案**：`~/.claude/scripts/session-spawner.js`
- **行號**：L166-167
- **改動**：`catch { /* process group 已結束... */ }` → `catch (e) { console.debug('[session-spawner] kill process group failed (expected if already exited):', e.message); }`
- **驗證**：grep 該行無空 catch

## Group B：穩定性防護（Phase 2, sequential）

### T2a — deps null guard
- **檔案**：`~/.claude/hooks/modules/heartbeat.js`
- **行號**：L86-87（handler 開頭，`state.executing` 檢查之後）
- **改動**：加入 `if (!deps) { console.error('[heartbeat] handler called before init — deps is null'); return; }`
- **驗證**：單元測試模擬 deps=null 呼叫 handler，確認不 throw

### T2b — Phase 1 while 迴圈加 MAX_BATCH 上限
- **檔案**：`~/.claude/hooks/modules/heartbeat.js`
- **行號**：L92-112
- **改動**：
  - 檔案頂部加常數 `const MAX_BATCH = 50;`
  - `while (true)` → `let batch = 0; while (batch < MAX_BATCH)`
  - 迴圈末尾 `executed++` 後加 `batch++`
  - 迴圈後加 `if (batch >= MAX_BATCH) console.warn('[heartbeat] Phase 1 hit MAX_BATCH limit:', MAX_BATCH);`
- **驗證**：單元測試模擬 poll 持續返回 execute，確認第 50 次後 break

### T2c — CLI fallback 效能修復
- **檔案**：`~/.claude/scripts/heartbeat.js`
- **行號**：L373-376
- **改動**：
  ```javascript
  // 替換前
  const chunks = [];
  for await (const chunk of p.stdout) { chunks.push(Buffer.from(chunk)); }
  await p.exited;
  const output = Buffer.concat(chunks).toString("utf-8");

  // 替換後
  const [output, _exit] = await Promise.all([
    Bun.readableStreamToText(p.stdout),
    p.exited,
  ]);
  ```
- **驗證**：grep 確認無 `for await.*p.stdout`

## Group C：Spawn 穩定性（Phase 3, sequential）

### T3a — spawn 前 claude CLI 健康檢查
- **檔案**：`~/.claude/scripts/session-spawner.js`
- **行號**：L107 之後（遞迴防護檢查之後、env 組裝之前）
- **改動**：
  ```javascript
  // claude CLI 可用性檢查
  if (!Bun.which('claude')) {
    return { ok: false, error: 'claude CLI not found in PATH' };
  }
  ```
- **驗證**：單元測試 mock Bun.which 回傳 null，確認 ok: false

### T3b — spawn 失敗寫入 hook-errors.jsonl
- **檔案**：`~/.claude/scripts/session-spawner.js`
- **行號**：L149-151（spawn catch 區塊）
- **改動**：在 console.error 後加寫入 hook-errors.jsonl：
  ```javascript
  import { appendFileSync } from 'node:fs';
  // 在 catch 中
  try {
    appendFileSync('/tmp/hook-errors.jsonl', JSON.stringify({
      ts: new Date().toISOString(),
      event: 'heartbeat-spawn',
      error: e.message,
      phase: 'spawnSession',
    }) + '\n');
  } catch { /* log write failure is non-critical */ }
  ```
  注意：appendFileSync 已在 heartbeat.js 有 import，session-spawner.js 需新增 import
- **驗證**：單元測試確認 spawn 失敗後 /tmp/hook-errors.jsonl 有對應條目

### T3c — heartbeat module spawn 失敗也寫 hook-errors
- **檔案**：`~/.claude/hooks/modules/heartbeat.js`
- **行號**：L131-132（spawned.ok === false 分支）
- **改動**：在 emit sd:done 前加 hook-errors 寫入（同 T3b 格式）
- **驗證**：整合測試確認 spawn fail → hook-errors + event 都有

## Group D：測試擴充（Phase 4, sequential）

### T4a — Group A 測試（空 catch 修復驗證）
- **檔案**：`~/projects/overtone/tests/unit/heartbeat.test.js`
- **新增測試**：
  1. `loadConfig JSON 損壞時 console.error 被呼叫`（mock console.error，觸發 JSON parse error）
  2. `resetTask fallback 失敗時有 log`（mock deps.resetTask throw → 驗證 console.error）
  3. `NOTION_TOKEN .zshrc 讀取失敗時有 log`（需要從 makeListTasks 測試，或驗證 catch 存在）

### T4b — Group B 測試（穩定性防護驗證）
- **檔案**：`~/projects/overtone/tests/unit/heartbeat.test.js`
- **新增測試**：
  1. `Phase 1 while 超過 MAX_BATCH 時 break`（mock poll 永遠返回 execute，驗證 handler 不卡死且 executed <= 50）
  2. `deps null 時 handler 不 throw`（不呼叫 init 直接觸發 handler）
  3. `spawnSession CLI 不在 PATH 時回傳 ok: false`（mock Bun.which 回傳 null）

### T4c — Group C 測試（spawn 穩定性驗證）
- **檔案**：`~/projects/overtone/tests/unit/heartbeat.test.js`
- **新增測試**：
  1. `spawn 失敗寫入 hook-errors.jsonl`（mock spawn throw → 讀取 /tmp/hook-errors.jsonl 最後一行）
  2. `claude CLI 不存在時 spawnSession 回傳 error`（驗證 error message 包含 'not found'）

## 執行順序總覽

```
executor 接到任務後：
1. Phase 1（T1a + T1b + T1c + T1d）— 並行修改 4 處空 catch
2. Phase 2（T2a → T2b → T2c）— 依序加 guard
3. Phase 3（T3a → T3b → T3c）— 依序加 spawn 防護
4. Phase 4（T4a → T4b → T4c）— 依序寫測試
5. `bun test` 全部通過
6. grep 驗證無殘留空 catch
```
