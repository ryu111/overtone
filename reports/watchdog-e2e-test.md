# llm-watchdog 真實自愈測試報告

**日期**：2026-04-13
**Dispatch**：xd-1776089208213-a5oh（重派自 xd-xfoz，前次被 wrapup bug 誤關）
**Target**：`~/.claude/scripts/llm-watchdog.js`

## 初始狀態

| 項目 | 值 |
|------|---|
| PID | 68190 |
| Model | mlx-community/gemma-4-31b-it-4bit |
| Port | 8000 |
| Memory | 17.9 GB RSS |
| 啟動時間 | 22:09（本 session 之前） |
| 活動 | 無並行客戶（block-world 無呼叫、無其他 inference） |

## 測試序列

### T+0 (22:14:16) — kill 68190
```bash
kill 68190
lsof -ti tcp:8000  # → 無輸出（port 已釋放）
```

### T+4s — Watchdog 首次觸發（LaunchAgent 60s tick）
```
[2026-04-13T14:14:20.879Z] spawned nova-llm pid=84203 model=... attempt=1
```
Watchdog 正確偵測 health check 失敗 → 讀 config/local-model.json → 呼叫 spawnVllm。

### T+64s — Watchdog 第二次觸發（仍失敗）
```
[2026-04-13T14:15:20.942Z] health check failed on port 8000
[2026-04-13T14:15:20.943Z] spawned nova-llm pid=84451 attempt=2
```

### T+124s — 進入 backoff
```
[2026-04-13T14:16:21.009Z] in backoff (failures=2, wait 60s more), skip
```

### T+180s — 診斷
```bash
ps -eo pid,command | grep vllm  # 無結果
lsof -ti tcp:8000                # 無輸出
```

**發現 bug #1**：Watchdog log 記錄 spawn 成功（有 PID），但子進程實際上都死了。

## 根因分析

### Bug #1：`Bun.spawn + child.unref()` 不足以 detach

原始實作：
```js
const child = Bun.spawn([program, ...args], {
  stdout: Bun.file(VLLM_LOG),
  stderr: Bun.file(VLLM_LOG),
  env: { ... },
});
child.unref?.();
```

問題：`unref()` 只移除 event loop 引用，**不改變 session / process group**。
當 watchdog（parent）在 ~1s 內執行完畢退出時，child 會收到 SIGHUP 而死。

### Bug #2：Log 每行重複

```js
appendFileSync(WATCHDOG_LOG, line);   // 寫 1 次
process.stderr.write(line);           // 寫 1 次
```

LaunchAgent plist 的 `StandardErrorPath` 也是 `/tmp/llm-watchdog.log`。
所以每筆 log 出現 2 次（一次來自 appendFileSync，一次來自 stderr 重定向）。

## 修法

### Bug #1：改用 nohup + shell detach

```js
const shellCmd = `nohup ${JSON.stringify(cfg.bin)} serve ${JSON.stringify(cfg.model)} --port ${cfg.port} > ${JSON.stringify(VLLM_LOG)} 2>&1 &\necho $!`;
const result = Bun.spawnSync(["/bin/bash", "-c", shellCmd], { ... });
const pid = Number(new TextDecoder().decode(result.stdout).trim());
```

nohup 忽略 SIGHUP，`&` 讓 bash 立即退出（不等 child），`echo $!` 取 child PID。

### Bug #2：移除 appendFileSync

```js
function log(msg) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}
```

只寫 stderr，LaunchAgent 會把 stderr 轉寫入 log 檔。

## 修後驗證

### T+0 重測（手動執行）
```bash
rm /tmp/nova-llm-backoff.json /tmp/llm-watchdog.log
bun ~/.claude/scripts/llm-watchdog.js
# → spawned nova-llm pid=86772 attempt=1
```

### T+2s 存活檢查
```bash
ps -eo pid,command | grep nova-llm
# 86772 nova-llm  ← 活著！
```

### T+60s 模型載入完成
```bash
curl http://localhost:8000/v1/models
# {"object":"list","data":[{"id":"mlx-community/gemma-4-31b-it-4bit",...}]}
lsof -ti tcp:8000
# 86772, 89247  ← nova-llm + worker subprocess
```

| 指標 | 值 |
|------|---|
| 自愈延遲 | ~65 秒（spawn → model ready） |
| 舊 PID | 68190 |
| 新 PID | 86772 |
| 新 Model | mlx-community/gemma-4-31b-it-4bit（一致） |
| Log 重複 | 已消除 |

## 結論

- **Watchdog 邏輯正確**：health check → backoff → spawn 流程全通
- **原版 detach 有 bug**：測試揭發，已修（nohup + bash shell）
- **Log 重複 bug**：已修（只寫 stderr）
- **後續**：下一次 LaunchAgent tick（60s 內）會跑新版 watchdog，autonomous recovery 預期能工作。本測試透過手動執行確認了修復有效。

## 踩坑教訓

1. **「Detach」不是只有一個方法**：Node/Bun 的 `unref()` ≠ POSIX 的 `setsid`/`nohup`。真正 detach 需要切換 process group 或用 shell + `&` + `nohup`。只信文件是錯的，要看實際行為。
2. **Log 雙寫陷阱**：當 stderr 被 LaunchAgent 重定向到檔案 A，再額外 `appendFileSync(A)` 就會重複。StandardErrorPath 是 append 模式，不是 tee。
3. **真實測試比 dry-run 有價值**：我原本第一次實作只做靜態驗證（argv 解析、退避計算），沒跑 kill 8000 真實測試，結果 detach bug 潛伏 30 分鐘才被揭發。Kill 測試本身是 irreversible action（影響其他 session），但 Manager 明確授權 + 夜間低負載時段就是執行它的正確時機。
