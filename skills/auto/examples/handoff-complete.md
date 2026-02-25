# Handoff 完整填寫範例

> 📋 **何時讀取**：首次撰寫 Handoff 或對格式不確定時。

## 範例 1：developer → code-reviewer

```markdown
## HANDOFF: developer → code-reviewer

### Context
根據 architect 的技術方案，實作了使用者個人資料 API（CRUD）。
使用 Express.js + Prisma ORM，遵循 RESTful 設計原則。
涵蓋 BDD spec 中定義的 5 個 Scenario。

### Findings
- 新增 4 個 API endpoints：GET/POST/PUT/DELETE /api/users/:id
- 實作 input validation（zod schema）
- 新增 15 個單元測試，全部通過
- 程式碼覆蓋率：87%（目標 80%✅）

### Files Modified
- src/routes/users.ts — 使用者 API route 定義 [新建]
- src/controllers/user.controller.ts — 控制器邏輯 [新建]
- src/schemas/user.schema.ts — Zod 驗證 schema [新建]
- prisma/schema.prisma — 新增 User model
- tests/user.test.ts — 單元測試 [新建]
- src/routes/index.ts — 掛載 users route

### Open Questions
- User 的 email 欄位是否需要唯一索引？（目前設為 unique，但 spec 未明確）
- 刪除 API 是否需要軟刪除？（目前實作硬刪除）
```

## 範例 2：architect → tester（spec 模式）

```markdown
## HANDOFF: architect → tester

### Context
設計了評論系統的技術架構，包含巢狀回覆、分頁和即時通知。
選用 WebSocket 處理即時通知，PostgreSQL 儲存評論（Adjacency List 模型）。

### Findings
- API 設計：5 個 endpoints（CRUD + 巢狀查詢）
- 資料模型：Comment table 含 parentId 自關聯
- 分頁策略：cursor-based pagination（按時間排序）
- 即時通知：WebSocket channel per post
- 效能：支援 3 層巢狀，每頁 20 則

### Files Modified
（無修改 — 唯讀分析）

### Open Questions
- 巢狀超過 3 層時是否摺疊？（建議摺疊並顯示「查看更多」）
- 已刪除的評論是否顯示為「此評論已刪除」保留結構？
```

## 範例 3：debugger → developer

```markdown
## HANDOFF: debugger → developer

### Context
診斷使用者回報的「上傳圖片後顯示空白」問題。
透過 log 分析、API 追蹤和前端 DevTools 進行系統性排查。

### Findings
- **根因**：S3 上傳成功後，回傳的 URL 使用 `http://` 而非 `https://`
  導致混合內容（Mixed Content）被瀏覽器阻擋
- **假設驗證**：
  1. ❌ 前端圖片元件 bug → 測試靜態 URL 正常顯示
  2. ❌ S3 權限設定 → 直接存取 URL 可下載
  3. ✅ Mixed Content → Chrome DevTools 顯示 blocked:mixed-content
- **影響範圍**：所有 HTTPS 環境下的圖片上傳（開發環境用 HTTP 未受影響）

### Files Modified
（無修改 — 唯讀診斷）

### Open Questions
- S3 客戶端設定中 `forcePathStyle` 是否影響 URL scheme？（需確認）
- 建議修復方式：在 S3 config 中設定 `endpoint` 為 `https://` 前綴
```
