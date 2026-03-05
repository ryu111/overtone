---
## 2026-03-05 | developer:DEV Findings
- 三個 domain 各新增 15 個關鍵詞，均超過 BDD 要求的 10 個下限
- os-control：涵蓋 process/clipboard/screenshot/window/notification/applescript 等系統操控概念及中文詞（截圖、視窗、剪貼簿、通知）
- autonomous-control：涵蓋 heartbeat/daemon/spawn/queue/execution-queue/scheduled 等自主控制概念及中文詞（自主、常駐、佇列、排程）
- craft：涵蓋 principle/invariant/guard/closed-loop/health-check/validate 等製作規範概念及中文詞（製作規範、閉環、守衛、自癒、不變量、品質）
- 測試計數斷言同步更新：`DOMAIN_KEYWORDS 有 12 個 domain` → `DOMAIN_KEYWORDS 有 15 個 domain`
- 模組 JSDoc 中的 `12/15` 說明更新為 `15`，移除「留待後續迭代」備注
Keywords: domain, control, process, clipboard, screenshot, window, notification, applescript, autonomous, heartbeat
