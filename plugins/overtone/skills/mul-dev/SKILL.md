---
name: mul-dev
description: 多開發者並行機制。在 DEV 階段將獨立子任務分批並行，縮短執行時間。
---

# Mul Dev — 多開發者並行

> **何時讀取**：DEV 階段開始時，判斷是否有可並行的子任務。

---

## 兩種模式

### Mode A — 有 specs（standard / full / secure / tdd / refactor）

architect 在 ARCH 階段已將並行分析結果寫入 `specs/features/in-progress/{featureName}/tasks.md` 的 `## Dev Phases` 區塊。

**執行流程**：
1. 讀取 `tasks.md`，找到 `## Dev Phases` 區塊
2. 依 Phase 順序執行（sequential Phase 一個 developer，parallel Phase 同一訊息多個 Task）
3. 等待當前 Phase 全部完成後，才啟動下一 Phase

### Mode B — 無 specs（quick / debug / single）

architect 不存在，由 Main Agent 自行在 context window 中分析。

**執行流程**：
1. 閱讀本 skill，理解判斷標準
2. 根據任務描述判斷是否有可獨立完成的子任務
3. 若有 → 在同一訊息中發多個 Task（每個子任務一個 developer）
4. 若無 → 單一 developer，正常執行

---

## Phase 標記格式

architect 在 `tasks.md` 末尾追加 `## Dev Phases` 區塊，格式如下：

```markdown
## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] 建立資料模型和 schema | files: src/models/user.ts
- [ ] 設定路由骨架 | files: src/routes/index.ts

### Phase 2: 核心功能 (parallel)
- [ ] 實作使用者 CRUD API | files: src/handlers/user.ts, src/services/user.ts
- [ ] 實作認證中間件 | files: src/middleware/auth.ts
- [ ] 撰寫單元測試 | files: tests/user.test.ts

### Phase 3: 整合 (sequential, depends: 2)
- [ ] 整合 CRUD 與認證 | files: src/routes/user.ts, src/app.ts
```

### Phase 標記說明

| 標記 | 意義 |
|------|------|
| `(sequential)` | 此 Phase 的子任務依序執行（單一 developer） |
| `(parallel)` | 此 Phase 的子任務可並行（同一訊息多個 Task） |
| `(sequential, depends: N)` | 需等 Phase N 完成後，子任務依序執行 |
| `(parallel, depends: N)` | 需等 Phase N 完成後，子任務可並行 |

`depends: N` 只需在**非前一 Phase** 依賴時標注。Phase 預設按順序執行（前一 Phase 完成即可啟動），`depends: N` 用於跨越中間 Phase 的非相鄰依賴。

### `files:` 欄位

每個子任務 `files:` 標注會影響的檔案路徑（逗號分隔）。這是並行判斷的主要依據。

---

## 並行判斷標準

### 可並行（parallel）

- 操作不同的檔案（無重疊）
- 子任務之間無邏輯依賴（B 不需要 A 的輸出）
- 每個子任務可以獨立完成且不互相干擾
- 典型範例：分別實作不同 feature 的 handler、各自的單元測試、獨立的 UI 元件

### 不可並行（sequential）

- 修改同一個檔案（會產生衝突）
- B 需要 A 建立的 type、function 或 schema
- 有明確的執行順序（如：先建 model 才能建 service）
- 典型範例：建 DB schema → 建 ORM model → 建 service layer

---

## 調度方式

### Parallel Phase — 同一訊息多個 Task

```
# DEV 階段 Phase 2（parallel）— 同一訊息發出三個 Task

Task 1: 委派 developer 實作使用者 CRUD API
  - 任務：實作 src/handlers/user.ts 和 src/services/user.ts
  - Handoff：[architect Handoff 內容]
  - 負責檔案：src/handlers/user.ts, src/services/user.ts

Task 2: 委派 developer 實作認證中間件
  - 任務：實作 src/middleware/auth.ts
  - Handoff：[architect Handoff 內容]
  - 負責檔案：src/middleware/auth.ts

Task 3: 委派 developer 撰寫單元測試
  - 任務：撰寫 tests/user.test.ts
  - Handoff：[architect Handoff 內容]
  - 負責檔案：tests/user.test.ts
```

### Sequential Phase — 單一 Task

```
# DEV 階段 Phase 1（sequential）— 單一 Task 含所有子任務

Task: 委派 developer 建立基礎建設
  - 任務：依序完成 (1) 建立資料模型 (2) 設定路由骨架
  - Handoff：[architect Handoff 內容]
  - 負責檔案：src/models/user.ts, src/routes/index.ts
```

---

## 失敗隔離

- **某子任務 FAIL** → 只重試該失敗的子任務，不影響同 Phase 其他子任務
- **整個 Phase FAIL** → 不進入下一 Phase，回報 Main Agent 處理
- **重試上限**：同一子任務最多重試 3 次，超過則標記為 BLOCKED 並說明原因

---

## 退化條件

以下情況退化為單一 developer：

1. **無 Dev Phases 區塊**：architect 未寫入或判斷所有子任務都有依賴
2. **只有一個 Phase**：分解後僅有一組任務，無並行效益
3. **Mode B 分析後無並行機會**：所有子任務都有依賴關係
4. **子任務數量為 1**：無需分拆，直接單一 developer

退化後正常執行標準的單一 developer 流程。

---

## 完整流程範例（Mode A）

假設 tasks.md 有以下 Dev Phases：

```markdown
## Dev Phases

### Phase 1: 資料層 (sequential)
- [ ] 建立 User model | files: src/models/user.ts
- [ ] 建立 DB migration | files: migrations/001_create_users.sql

### Phase 2: API 層 (parallel)
- [ ] 實作 GET /users | files: src/handlers/get-users.ts
- [ ] 實作 POST /users | files: src/handlers/create-user.ts
- [ ] 實作 DELETE /users/:id | files: src/handlers/delete-user.ts

### Phase 3: 測試 (parallel, depends: 2)
- [ ] GET /users 測試 | files: tests/get-users.test.ts
- [ ] POST /users 測試 | files: tests/create-user.test.ts
- [ ] DELETE /users/:id 測試 | files: tests/delete-user.test.ts
```

**執行順序**：
1. Phase 1（sequential）→ 單一 developer 依序完成 model + migration
2. Phase 1 完成 → 進入 Phase 2（parallel）→ 同一訊息發 3 個 Task
3. Phase 2 全部完成 → 進入 Phase 3（parallel, depends: 2）→ 同一訊息發 3 個 Task
4. Phase 3 全部完成 → DEV 階段結束
