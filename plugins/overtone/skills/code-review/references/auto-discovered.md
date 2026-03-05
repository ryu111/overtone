---
## 2026-03-05 | doc-updater:DOCS Context
Failure Tracker 精確度改善功能（commit 023aa83）的文件同步。DEV 階段開發完成、CODE REVIEW 階段已 reject（設計誤解），進入 RETRO 階段後需要同步文件。
Keywords: failure, tracker, commit, code, review, reject, retro
---
## 2026-03-05 | developer:DEV Findings
- 目前僅有 3 個歧義詞（refactor、solid、design pattern），均跨 `code-review` 和 `craft` 兩個 domain
- `_buildAmbiguousKeywords()` 函式從 `skill-router.js` 直接移植，邏輯完全一致，模組級快取避免重複計算
- `minTotalHits`（預設 2）採「非歧義詞命中數」作為門檻，歧義詞只貢獻 score 不貢獻 hits
- 現有 16 個測試全部通過，新增 6 個測試驗證歧義詞場景，共 22 個
Keywords: refactor, solid, design, pattern, code, review, craft, domain, skill, router
