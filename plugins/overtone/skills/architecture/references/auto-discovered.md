# Architecture — 自動歸檔知識
---
## 2026-03-05 | developer:DEV Findings
**問題根因識別：**
- 舊算法分母統一用 domain keywords 總數，沒有對 fragment 的資訊量做正規化
- 歧義詞（如 `solid`、`refactor`、`design pattern`）同時存在於多個 domain，會導致路由偏差
- 無最小命中數門檻：即使只命中 1 個詞也可能路由
- 無信心差距保護：兩個 domain 分數接近時仍盲目路由

**v2 演算法改善：**
1. **AMBIGUOUS_KEYWORDS 預計算**：掃描 DOMAIN_KEYWORDS，標記跨 2+ domain 出現的詞（`solid`、`refactor`、`design pattern`），命中時折半權重
2. **fragment.keywords 強信號 ×2**：明確指定的 keywords 比 content 推測更可靠
3. **最小命中數門檻（totalHits >= 2）**：單詞命中不足以決定路由
4. **信心差距保護（< 0.05 降級）**：前兩名太接近時降為 gap-observation

**量化改善確認：**
- 純歧義詞片段（`refactor solid design pattern`）：舊版本可能誤路由，新版本正確降級為 gap-observation
- 強信號片段（`security xss injection auth`）：新版本 score > 0.4，明確路由
- API 介面完全不變：`routeKnowledge(fragment, options)` / `writeKnowledge(...)` 簽名不動
Keywords: domain, keywords, fragment, solid, refactor, design, pattern, content, totalhits, observation
---
## 2026-03-05 | developer:DEV Context
在 `knowledge-gap-detector.js` 的 `detectKnowledgeGaps` 中加入歧義詞處理，對齊 `skill-router.js` v2 的機制，防止通用詞（refactor、solid、design pattern）造成 gap 誤判。
Keywords: knowledge, detector, detectknowledgegaps, skill, router, refactor, solid, design, pattern
