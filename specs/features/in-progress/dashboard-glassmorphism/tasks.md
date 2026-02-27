---
feature: dashboard-glassmorphism
workflow: standard
status: completed
created: 2026-02-27
completed: 2026-02-27
---

# Tasks: Dashboard Glassmorphism 重設計

## Checklist

- [x] CSS 設計系統完整替換（main.css）
- [x] 後端 API 擴充：/api/registry 增加 parallelGroupDefs + workflows[].parallelGroups
- [x] 後端路由調整：移除 /s/:sessionId、首頁改 serve dashboard.html、移除 SSR 函式
- [x] JS 模組：pipeline.js（buildPipelineSegments 演算法）
- [x] JS 模組：timeline.js（animateNewEvent + scrollToBottom）
- [x] JS 模組：confetti.js（fireConfetti + reduced-motion 保護）
- [x] dashboard.html：頁面骨架 + Alpine.js root state + sidebar
- [x] dashboard.html：Overview Tab（Pipeline 並行分支 + Agent 燈號 + Stats）
- [x] dashboard.html：Timeline Tab + History Tab
- [x] dashboard.html：SSE 雙連線管理（sidebar + session）
- [x] 更新 server.test.js：registry 擴充欄位 + 路由變更測試
- [x] 跑完整測試套件確認無 regression

## Dev Phases

### Phase 1: 基礎層 — CSS + 後端 + JS 模組 (parallel)
- [x] CSS 設計系統完整替換 | files: plugins/overtone/web/styles/main.css
- [x] 後端 API 擴充 + 路由調整 | files: plugins/overtone/scripts/server.js
- [x] JS 模組：pipeline.js | files: plugins/overtone/web/js/pipeline.js
- [x] JS 模組：timeline.js | files: plugins/overtone/web/js/timeline.js
- [x] JS 模組：confetti.js | files: plugins/overtone/web/js/confetti.js

### Phase 2: 前端頁面整合 (sequential, depends: 1)
- [x] dashboard.html 完整實作（骨架 + sidebar + Overview + Timeline + History + SSE 管理）| files: plugins/overtone/web/dashboard.html
- [x] 刪除 index.html + session.html | files: plugins/overtone/web/index.html, plugins/overtone/web/session.html

### Phase 3: 測試 (sequential, depends: 2)
- [x] 更新 server.test.js + 跑完整測試套件 | files: tests/integration/server.test.js
