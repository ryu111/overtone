# Overtone 並行執行

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：Loop 模式、並行設計、Mul-Dev、D1-D4 缺陷修復
> 版本：v0.17.7

---

## Loop 模式

### 預設行為

Loop **預設開啟**。每個 workflow 完成後自動繼續下一個任務。

```
使用者 prompt → /ot:auto 選工作流 → 執行 workflow → 完成
                                                    ↓
                              ← 讀 tasks.md checkbox ←
                              ↓
                     還有 [ ] 未完成？
                    ├─ 是 → 自動開始下一個任務（禁止詢問）
                    └─ 否 → Loop 完成，允許退出
```

### 退出條件（四選一）

| 條件 | 行為 |
|------|------|
| tasks.md checkbox 全部 `[x]` | 自動退出 |
| 使用者執行 `/ot:stop` | 手動退出 |
| 達到 max iterations（預設 100） | 暫停，顯示進度 |
| 連續 3 次錯誤 | 暫停，報告問題 |

### 實作機制

Stop hook 截獲 Claude 退出：
1. 讀取 loop 狀態檔案（iteration 計數）
2. 檢查 tasks.md checkbox 完成度
3. 未完成 → `decision: "block"` + 重注入 prompt
4. 已完成 → 允許退出

---

## 並行執行

### 設計原則

**同一訊息多 Task** = ECC 原生並行。不需要 barrier/slot/FIFO。

- **無硬上限**：有多少 (parallel) 任務就並行多少
- **失敗隔離**：一個失敗不影響其他，失敗的進入 DEBUG→DEV
- **不偵測檔案衝突**：信任 tasks.md 分配
- **Main Agent 收斂**：hook 記錄結果，全部完成後提示 Main

### 並行缺陷修復（D1–D4）

經實戰驗證，多 agent 並行時存在 4 項設計缺陷，已全數修復：

| 缺陷 | 根因 | 修復 |
|------|------|------|
| **D1 TOCTOU** | `updateStateAtomic` mtime 讀寫間衝突 | 1–5ms jitter retry + Atomics.wait 優先 |
| **D2 hint 過時** | 第一完成 agent 的 hint 可能跳過未完成的並行 agent | `getNextStageHint()` 檢查 `activeAgents` 是否為空 |
| **D3 雙重失敗** | FAIL + REJECT 同時發生時缺乏明確優先順序 | TEST FAIL > REVIEW REJECT 優先，統一協調提示 |
| **D4 並行硬編碼** | `parallelGroups` 無法自訂，所有 workflow 共用固定群組 | 移入 workflow 定義，各 workflow 透過 `parallelGroups` 欄位引用群組名 |

詳見 `docs/reference/parallel-defects.md`。

### 靜態並行（registry 定義 + 動態推導）

registry.js 定義全域 `parallelGroupDefs`：

```javascript
parallelGroupDefs: {
  'quality':        ['REVIEW', 'TEST'],
  'verify':         ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
}
```

各 workflow 在定義中透過字串引用（避免重複）：

```javascript
workflows: {
  'standard': {
    stages: [...],
    parallelGroups: ['quality'],     // 只列群組名，成員定義在 parallelGroupDefs
  },
  'full': {
    stages: [...],
    parallelGroups: ['quality', 'verify'],
  },
  ...
}
```

**向後相容**：外部模組 import `parallelGroups` 時，動態推導為舊格式（群組名 → 成員陣列）。

### 動態並行（tasks.md parallel）

```markdown
## 2. Core Services (parallel)
- [ ] 2.1 建立 UserService | agent: developer | files: src/services/user.ts
- [ ] 2.2 建立 ProductService | agent: developer | files: src/services/product.ts
- [ ] 2.3 建立 OrderService | agent: developer | files: src/services/order.ts
```

### DEV 階段內部並行：Mul-Dev 機制

DEV 階段可進一步分解為多個並行子任務（Phase），通過 **mul-dev skill** 協調。

**兩種模式**：

| 模式 | 觸發條件 | 分析者 | Phase 存放位置 |
|------|--------|--------|:----:|
| **Mode A** | 有 specs（standard/full/secure/refactor） | architect | `tasks.md` → `## Dev Phases` 區塊 |
| **Mode B** | 無 specs（quick/debug/single） | Main Agent | context window 自行判斷 |

**Phase 標記格式**：

```markdown
## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] 建立資料模型 | files: src/models/user.ts
- [ ] 設定路由骨架 | files: src/routes/index.ts

### Phase 2: 核心功能 (parallel)
- [ ] 實作 CRUD API | files: src/handlers/user.ts
- [ ] 實作認證中間件 | files: src/middleware/auth.ts
- [ ] 撰寫單元測試 | files: tests/user.test.ts

### Phase 3: 整合 (sequential, depends: 2)
- [ ] 整合 CRUD 與認證 | files: src/routes/user.ts
```

- `(sequential)`：Phase 內子任務依序執行（單一 developer）
- `(parallel)`：Phase 內子任務同一訊息並行（多個 developer Task）
- `(depends: N)`：非前一 Phase 時標注跨越依賴

**判斷標準**：操作不同檔案 ∧ 無邏輯依賴 → parallel；否則 sequential。

**失敗隔離**：某子任務 FAIL → 只重試該子任務；整個 Phase FAIL → 不進入下一 Phase。

#### TaskList 同步

Mul-Dev 執行期間同步維護 TaskList，提供可見性（不取代 workflow.json）：

| 時機 | 操作 |
|------|------|
| DEV 啟動，分析出子任務 | 每個子任務 `TaskCreate`（subject = Phase 子任務描述） |
| 委派前 | `TaskUpdate → in_progress` |
| 子任務完成後 | `TaskUpdate → completed`；Mode A 同時回寫 tasks.md checkbox |
| 退化（無法分解）時 | 仍建立一個 `TaskCreate`，操作同一般流程 |

詳見 `skills/mul-dev/SKILL.md`。

### 編排模式

**順序 + 並行 + Phase 依賴**：不需要 DAG、不需要 /ot:orchestrate 專門命令。
