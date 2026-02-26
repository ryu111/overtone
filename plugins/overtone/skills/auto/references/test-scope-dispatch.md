# Test Scope 動態調度規則（test-scope-dispatch）

> 版本：v1.0（2026-02-27）
> 適用對象：Main Agent（解析 developer Handoff 並決定委派目標）

---

## 1. Test Scope 區塊格式

Developer Handoff 中的 `### Test Scope` 區塊格式如下：

```markdown
### Test Scope

| Scope | 標記 | 說明 |
|-------|------|------|
| unit | ✅ | 新增了 registry.js 的純函式測試 |
| integration | ✅ | 新增了 specs.test.js 整合測試 |
| e2e | -- | 不需要 |
| qa | -- | 不需要 |
```

### 標記定義

| 標記 | 含義 |
|------|------|
| `✅` | 需要此 scope 的測試，應委派對應 agent |
| `⚠️` | 不確定是否需要，Main Agent 自行評估 |
| `--` | 明確不需要，跳過此 scope |

---

## 2. 調度規則

### 2a. 標準調度邏輯

```
IF unit == ✅ OR integration == ✅
  → 委派 tester agent（verify 模式）
  → tester 針對標記為 ✅ 的 scope 執行測試

IF e2e == ✅
  → 委派 e2e-runner agent
  → 不委派 tester 處理 e2e（各司其職）

IF qa == ✅
  → 委派 qa agent（行為驗證）
  → qa 獨立於 tester 執行（可並行）
```

### 2b. 可並行的委派

`tester`、`e2e-runner`、`qa` 三個 agent 互相獨立，當多個 scope 都是 ✅ 時可並行委派：

```
unit ✅ + qa ✅ → 並行委派 tester + qa
integration ✅ + e2e ✅ → tester 完成後才委派 e2e-runner（e2e 依賴 integration 通過）
```

---

## 3. 特殊情況處理

### 3a. ⚠️ 的判斷方式

當標記為 `⚠️` 時，Main Agent 根據以下條件判斷：

1. **改動範圍**：改動是否影響已有測試覆蓋的功能？→ 若是，委派對應 agent
2. **風險等級**：變更涉及核心模組（registry、state、loop）→ 優先委派
3. **說明欄位**：閱讀 `說明` 欄的文字，理解 developer 的顧慮

如果仍不確定：**預設委派**（寧可多測，不可遺漏）。

### 3b. Test Scope 區塊缺失

如果 developer Handoff 中**完全沒有** `### Test Scope` 區塊：

```
→ 預設委派 tester agent（verify 模式）
→ 不因缺少標記而跳過測試階段
```

### 3c. 全部為 `--`

如果所有 scope 都是 `--`：

```
→ 跳過所有測試 agent
→ 在 workflow 記錄「開發者明確標記跳過測試」
→ 直接進入下一個 workflow 階段（如 REVIEW）
```

**注意**：全 `--` 是開發者的明確決策，Main Agent 尊重但應在 timeline 記錄原因。

---

## 4. 委派時需傳遞的 Handoff 資訊

委派測試 agent 時，需將以下資訊從 developer Handoff 傳遞：

- `### Test Scope` 區塊（讓 tester 知道需要覆蓋哪些 scope）
- `### Files Modified` 清單（讓 tester 知道哪些模組被改動）
- `### 待清理測試` 清單（若存在，讓 tester 執行清理）
- `### Context`（讓 tester 理解功能背景）

---

## 5. 決策摘要

| Handoff 狀態 | 動作 |
|-------------|------|
| unit/integration 有 ✅ | 委派 tester |
| e2e 有 ✅ | 委派 e2e-runner |
| qa 有 ✅ | 委派 qa |
| 有 ⚠️ | Main Agent 評估後決定 |
| Test Scope 區塊缺失 | 預設委派 tester |
| 全部 `--` | 跳過所有測試，記錄原因 |
