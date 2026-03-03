---
feature: p3-3-system
stage: PLAN
created: 2026-03-04
workflow: standard
---

# P3.3 管得住（系統層）— Proposal

## 需求摘要

P3.3 是 Phase 3 感知操控路線的第三個子階段，目標是讓 agent 擁有系統層操控能力，包含：
Process 管理、剪貼簿讀寫、系統資訊查詢、macOS 通知推送、檔案系統變更監控。

完成後 agent 可以「管得住」本機系統：知道有哪些 process、可以傳遞資料（clipboard）、可以監控環境變化（fswatch）、可以主動通知使用者（notification）。

## 背景與動機

- P3.1（感知層）✅：看得見（screenshot + window）
- P3.2（心跳引擎）✅：可自主排程（heartbeat + session-spawner）
- P3.3（系統層）：管得住（process + clipboard + system-info + notification + fswatch）
- P3.4（操控層）：動得了（keyboard + mouse + applescript）

P3.3 是 P3.4 的前置能力——啟動/終止 process、監控狀態，是操控層的基礎。

## MVP 範圍（Must）

### 腳本（5 個）

| 腳本 | 路徑 | 核心能力 |
|------|------|---------|
| process.js | `plugins/overtone/scripts/os/process.js` | listProcesses（Unix ps）、startProcess（spawn）、killProcess（kill signal） |
| clipboard.js | `plugins/overtone/scripts/os/clipboard.js` | readClipboard（pbpaste）、writeClipboard（pbcopy） |
| system-info.js | `plugins/overtone/scripts/os/system-info.js` | getCpuUsage（top/ps）、getMemoryInfo（vm_stat）、getDiskInfo（df）、getNetworkInfo（ifconfig/netstat） |
| notification.js | `plugins/overtone/scripts/os/notification.js` | sendNotification（osascript display notification） |
| fswatch.js | `plugins/overtone/scripts/os/fswatch.js` | watchPath（Bun fs.watch）、stopWatch、listWatchers |

### 知識文件（1 個）

- `plugins/overtone/skills/os-control/references/system.md` — P3.3 API Reference + 使用指引

### 索引更新（1 個）

- `plugins/overtone/skills/os-control/SKILL.md` — Reference 索引表第 2 欄位狀態從「P3.3」更新為「P3.3 ✅」

### 單元測試（5 個）

延續 P3.1 測試模式（`'use strict'` + `_deps` 依賴注入 + 平台守衛 + mock execSync）：

| 測試檔 | 路徑 |
|--------|------|
| process.test.js | `tests/unit/process.test.js` |
| clipboard.test.js | `tests/unit/clipboard.test.js` |
| system-info.test.js | `tests/unit/system-info.test.js` |
| notification.test.js | `tests/unit/notification.test.js` |
| fswatch.test.js | `tests/unit/fswatch.test.js` |

## Should 範圍

- pre-bash-guard.js 擴充（補充 P3.3 相關危險命令，如 `kill -9 <pid>` 濫用情境）
- health-check 擴充（新增第 8 項：偵測 `pbcopy`/`pbpaste`/`osascript` 是否可用）

## Won't 範圍（明確排除）

- 跨平台支援（非 macOS 平台，如 Linux、Windows）
- GUI 進程管理界面
- fswatch 深層遞迴監控（僅做單一目錄 watch，不做 recursive 深層）

## 現有模式（延續）

參考 P3.1 腳本結構：
- `plugins/overtone/scripts/os/screenshot.js` — 函式結構、依賴注入模式
- `plugins/overtone/scripts/os/window.js` — AppleScript 整合、平台守衛

共同慣例：
- `'use strict'` 開頭
- 依賴注入：`_deps = { execSync }` 作為最後一個參數
- 平台守衛：`if (process.platform !== 'darwin') return fail('UNSUPPORTED_PLATFORM', ...)`
- 不 throw：所有錯誤以 `{ ok: false, error, message }` 回傳

## Open Questions for Architect

1. **fswatch.js 實作策略**：`Bun.file` watch API vs Node `fs.watch()` vs `fs.watchFile()` vs macOS `fsevents`？哪個在 Bun 環境最穩定？
2. **process.js 的 `killProcess` 安全邊界**：應該信任 pre-bash-guard 守護、還是在函式內加白名單/黑名單保護？
3. **system-info.js 的 `vm_stat` 解析**：vm_stat 輸出格式解析策略（regex vs 固定欄位）？
4. **notification.js action button**：只做最簡通知（title + message），還是支援 action/subtitle/sound 參數？
5. **process.js 與 window.js 的 `listProcesses` 重疊**：window.js 已有 `listProcesses`（AppleScript System Events 版本），process.js 的 `listProcesses` 應使用 Unix `ps aux` 提供不同維度資料（CPU%、MEM%、啟動時間），還是廢棄 window.js 版本合併？

## 任務分解

### 核心實作（可並行）

1. **process.js 實作** | agent: developer | files: `scripts/os/process.js`, `tests/unit/process.test.js`
2. **clipboard.js 實作** | agent: developer | files: `scripts/os/clipboard.js`, `tests/unit/clipboard.test.js`
3. **system-info.js 實作** | agent: developer | files: `scripts/os/system-info.js`, `tests/unit/system-info.test.js`
4. **notification.js 實作** | agent: developer | files: `scripts/os/notification.js`, `tests/unit/notification.test.js`
5. **fswatch.js 實作** | agent: developer | files: `scripts/os/fswatch.js`, `tests/unit/fswatch.test.js`

### 知識整合（依賴核心實作完成）

6. **system.md reference 建立** | agent: developer | files: `skills/os-control/references/system.md`
7. **SKILL.md 索引更新** | agent: developer | files: `skills/os-control/SKILL.md`

### Should 範圍（可並行，獨立於核心）

8. **pre-bash-guard.js 擴充** | agent: developer | files: `hooks/scripts/tool/pre-bash-guard.js`, `tests/unit/pre-bash-guard.test.js`
9. **health-check 擴充** | agent: developer | files: `scripts/health-check.js`, `tests/unit/health-check.test.js`
