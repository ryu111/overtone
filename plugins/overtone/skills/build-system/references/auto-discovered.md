---
## 2026-03-06 | planner:PLAN Findings
**需求分解**（6 個 Phase，22 個子任務）：

**Phase 0 — 基礎建設（sequential）**：
1. 專案骨架建立 | agent: developer | files: 專案根目錄、package.json
2. 資料庫 Schema 設計（含鎖策略決定）| agent: architect | files: 設計文件
3. 開發環境設定（env + Docker）| agent: developer

**Phase 1 — 核心資料層（sequential，依賴 Phase 0）**：
4. 資料庫 Migration | agent: developer | files: drizzle schema、migrations/
5. 抽獎引擎核心（**最高風險模組**，公平隨機 + 鎖防超賣）| agent: developer | files: src/lib/gacha.ts

**Phase 2 — 後端 API（parallel，依賴 Phase 1）**：
6. 會員 API（JWT + bcrypt）| agent: developer
7. 地址管理 API | agent: developer
8. 一番賞 CRUD API | agent: developer
9. 抽獎 API（串接引擎 + 金流前置）| agent: developer
10. 訂單管理 API | agent: developer
11. 即時更新機制（SSE/WS）| agent: developer

**Phase 3 — 金流串接（sequential，依賴 2-4）**：
12. 信用卡付款串接（測試模式）+ webhook | agent: developer

**Phase 4 — 前台頁面（parallel，依賴對應 API）**：
13. 會員頁面 | 14. 列表頁 | 15. 詳情頁（SSE）| 16. 抽獎流程頁 | 17. 訂單頁

**Phase 5 — 後台頁面（5-1 先，其餘 parallel）**：
18. 後台布局 & 登入 | 19. 上架管理 | 20. 訂單管理 | 21. 營運總覽

**Phase 6 — 測試 & 部署（sequential，所有 Phase 完成後）**：
22. 抽獎引擎壓力測試（並發超賣 BDD）| 23. 金流 E2E | 24. 資安檢查 | 25. 部署設定

**優先順序**：
- 關鍵路徑：Phase 0 → 1 → 2（抽獎 API）→ 3（金流）→ 4-4（抽獎頁面）→ Phase 6
- Phase 2 的 6 個子任務全部可並行
- Phase 4 和 Phase 5 可同時進行（各自依賴對應 API 完成）

**範圍邊界（明確不做）**：
- 點數儲值、獎品回收、個人倉庫、合併出貨
- Excel 批次匯入、物流 API 自動串接（Phase 2）
- 多角色權限管理、連抽、社群分享、多語系

---
Keywords: phase, sequential, agent, developer, files, package, json, schema, architect, docker
---
## 2026-03-06 | developer:DEV Findings
- `bun:test` 的 `it()` 第三個參數可接受 `{ retry, timeout }` 物件，與原本的純數字 timeout 語意相容，直接替換即可
- `// @stress-test` 必須放在第一行（`'use strict'` 之前），否則被 strict mode pragma 覆蓋後位置語意不明確
- `filesystem-concurrency.md` 不存在（Handoff 中引用了一個不存在的文件），指南改為直接描述三種策略並從現有測試中引用程式碼範例
- 7 個測試全數通過，執行時間 80ms（因使用 Bun 快取，子進程 spawn 很快）
Keywords: test, retry, timeout, stress, strict, mode, pragma, filesystem, concurrency, handoff
