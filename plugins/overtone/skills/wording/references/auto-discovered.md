---
## 2026-03-03 | architect:ARCH Context
P3.3 延續 P3.1 已確立的 pattern（`'use strict'` + `_deps` 依賴注入 + 平台守衛 + `{ ok, error, message }` 不 throw）。5 個新腳本放在 `plugins/overtone/scripts/os/`，5 個 Open Questions 全部做出明確決策。核心設計選擇：fswatch 用 `fs.watch()` 原生 API、`killProcess` 函式內部加 PID 安全邊界、`vm_stat` 用 regex 按關鍵詞解析、notification 支援 title+message+subtitle+sound、`process.js.listProcesses` 與 `window.js.listProcesses` 共存提供不同維度。
Keywords: pattern, strict, error, message, throw, plugins, overtone, scripts, open, questions
---
## 2026-03-05 | developer:DEV Context
為 `plugins/overtone/scripts/lib/wording.js` 和 `plugins/overtone/scripts/lib/utils.js` 補齊缺少的單元測試。health-check `checkTestFileAlignment` 偵測到這兩個模組沒有對應的測試檔案。
Keywords: plugins, overtone, scripts, wording, utils, health, check, checktestfilealignment
