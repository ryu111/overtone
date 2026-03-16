# 修復 hook error: PreToolUse:Bash:dispatch — 任務拆分

## Phase 1：根因修復 + 防護（parallel）

4 個子任務操作不同檔案，無依賴，全部並行。

### T1: 建立 self-drive-prompt.md
- **執行者**：executor
- **檔案**：`~/.claude/data/self-drive-prompt.md`（新增）
- **內容**：從 server.js L53-78 提取 SELF_DRIVE_PROMPT 內容，去除所有 `\`` escape，保持純 Markdown
- **驗收**：檔案存在且內容與原 prompt 語意一致（反引號為原生 Markdown，非 escaped JS）

### T2: server.js 改讀外部檔案 + process error handler
- **執行者**：executor
- **檔案**：`~/.claude/hooks/server.js`（修改）
- **步驟**：
  1. 刪除 L53-78 的 `const SELF_DRIVE_PROMPT = \`...\``
  2. 替換為 try-catch 的 `readFileSync`：
     ```js
     let SELF_DRIVE_PROMPT = '';
     try {
       SELF_DRIVE_PROMPT = readFileSync(join(CLAUDE_DIR, 'data/self-drive-prompt.md'), 'utf-8');
     } catch (e) {
       console.error('[server] self-drive-prompt.md 讀取失敗:', e.message);
     }
     ```
  3. 在檔案末尾（export 之前）加 process error handler：
     ```js
     process.on('uncaughtException', (err) => {
       console.error('[server] uncaughtException:', err.message, err.stack);
     });
     process.on('unhandledRejection', (reason) => {
       console.error('[server] unhandledRejection:', reason);
     });
     ```
- **驗收**：server.js 不含 template literal prompt；readFileSync 有 try-catch；process handler 已加

### T3: hook-client.js pollHealth 指數退避
- **執行者**：executor
- **檔案**：`~/.claude/hooks/hook-client.js`（修改）
- **步驟**：
  1. `pollHealth` 改為指數退避：
     ```js
     async function pollHealth({ maxRetries = 4, baseMs = 200 } = {}) {
       for (let i = 0; i < maxRetries; i++) {
         const delay = baseMs * Math.pow(2, i); // 200, 400, 800, 1600
         await Bun.sleep(delay);
         try {
           const h = await fetch('http://127.0.0.1:3457/health', { signal: AbortSignal.timeout(1000) });
           if (h.ok) {
             const body = await h.json();
             if (body.status === 'ok' && body.title === 'nova-server') return true;
           }
         } catch {}
       }
       return false;
     }
     ```
- **驗收**：pollHealth 總等待 >= 3 秒（200+400+800+1600 = 3000ms）

### T4: error-analyzer.js 擴充自癒判定
- **執行者**：executor
- **檔案**：`~/.claude/scripts/error-analyzer.js`（修改）
- **步驟**：
  1. `isSelfHealingError` 擴充判定邏輯，`dispatch` phase 且事件有 fallback → 自癒：
     ```js
     export function isSelfHealingError(clusterKey) {
       const parts = clusterKey.split(":");
       const phase = parts[parts.length - 1];
       const eventKey = parts.slice(0, -1).join(":");
       // all-failed 和 dispatch phase 都視為自癒（前提：該事件有 fallback）
       if (phase === "all-failed" || phase === "dispatch") {
         return FALLBACK_EVENTS.has(eventKey);
       }
       return false;
     }
     ```
- **驗收**：
  - `isSelfHealingError('PreToolUse:Bash:all-failed')` === true（原有行為不變）
  - `isSelfHealingError('PreToolUse:Bash:dispatch')` === true（新增）
  - `isSelfHealingError('SessionStart:dispatch')` === false（無 fallback 不標自癒）

## Phase 2：測試驗收（sequential，依賴 Phase 1）

### T5: 執行測試
- **執行者**：executor
- **步驟**：
  1. `bun test` 全部通過
  2. 確認 error-analyzer 測試覆蓋新行為
- **驗收**：0 fail
