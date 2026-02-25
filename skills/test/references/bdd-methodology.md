# BDD 完整方法論

> 📋 **何時讀取**：撰寫 BDD spec 或需要 BDD 最佳實踐指引時。

## GIVEN/WHEN/THEN 範式

### 三段式結構

| 段落 | 目的 | 描述對象 |
|------|------|----------|
| **Given** | 前置條件 | 系統的初始狀態 |
| **When** | 動作 | 觸發行為的操作 |
| **Then** | 預期結果 | 可觀察的結果 |
| **And** | 延伸 | 擴展上一個段落 |
| **But** | 例外 | 否定形式的延伸 |

### 寫作原則

1. **宣告式優於命令式**
   ```gherkin
   # ✅ 宣告式（描述狀態）
   Given 使用者已登入

   # ❌ 命令式（描述操作步驟）
   Given 使用者打開登入頁面
   And 使用者輸入帳號 "admin"
   And 使用者輸入密碼 "password"
   And 使用者點擊登入按鈕
   ```

2. **使用業務語言**
   ```gherkin
   # ✅ 業務語言
   When 使用者將商品加入購物車

   # ❌ 技術語言
   When POST /api/cart with body { productId: 1 }
   ```

3. **一個 Scenario 一個行為**
   - 每個 Scenario 測試一個單獨的行為
   - 不在一個 Scenario 中測試多個無關行為

## Scenario Outline（資料驅動）

### 基本語法

```gherkin
Scenario Outline: 計算運費
  Given 購物車總金額為 <amount> 元
  When 使用者選擇 <shipping> 配送
  Then 運費為 <fee> 元

  Examples:
    | amount | shipping | fee |
    | 500    | 標準     | 60  |
    | 500    | 快遞     | 120 |
    | 1000   | 標準     | 0   |
    | 1000   | 快遞     | 60  |
```

### 使用時機

- 多組輸入/輸出的相同邏輯
- 邊界值測試
- 多角色/權限的行為差異

## 資料表格（Data Table）

```gherkin
Scenario: 批次建立使用者
  Given 以下使用者資料：
    | name   | email           | role   |
    | Alice  | alice@test.com  | admin  |
    | Bob    | bob@test.com    | user   |
  When 管理員匯入使用者資料
  Then 系統建立 2 個使用者帳號
  And 每個使用者收到啟用 email
```

## Tag 分類系統

### 常用 tag

| Tag | 用途 | 範例 |
|-----|------|------|
| `@smoke` | 冒煙測試（核心功能） | 登入、首頁載入 |
| `@regression` | 回歸測試 | 修 bug 後的驗證 |
| `@security` | 安全相關場景 | 注入防護、權限檢查 |
| `@edge-case` | 邊界條件 | 空值、超長輸入 |
| `@slow` | 耗時測試 | E2E、大資料量 |
| `@wip` | 進行中（暫不執行） | 開發中的新功能 |

### Tag 使用方式

```gherkin
@smoke @auth
Feature: 使用者認證

  @happy-path
  Scenario: 正確帳密登入
    ...

  @security @edge-case
  Scenario: SQL injection 防護
    ...
```

## spec ↔ verify 雙模式最佳實踐

### spec 模式（DEV 前）

**目標**：定義行為規格，不寫測試碼。

**最佳實踐**：
1. 從使用者視角描述行為
2. 覆蓋 happy path + edge case + error case
3. 每個 Feature 至少 3 個 Scenario
4. 使用 tag 分類場景
5. 安全功能額外加攻擊場景

**產出位置**：`openspec/specs/{feature}.md`

### verify 模式（DEV 後）

**目標**：根據 spec 撰寫並執行測試碼。

**最佳實踐**：
1. 逐條對照 BDD spec 實作測試
2. 使用專案既有的測試框架（Jest/Vitest/pytest 等）
3. 測試命名對應 Scenario 名稱
4. 不自行發明新場景（以 spec 為準）
5. 驗證 Then 中的每一條預期

**測試結構**：
```typescript
// Scenario 名稱作為 test 名稱
describe('Feature: 使用者認證', () => {
  test('Scenario: 正確帳密登入', async () => {
    // Given 使用者已在登入頁面
    // When 使用者輸入正確帳密
    // Then 登入成功並跳轉到首頁
  });

  test('Scenario: 密碼錯誤', async () => {
    // Given 使用者已在登入頁面
    // When 使用者輸入錯誤密碼
    // Then 顯示錯誤訊息
  });
});
```

## Gherkin 檔案組織

### 單功能檔案

```
openspec/specs/
├── auth.md              # 認證相關所有場景
├── user-crud.md         # 使用者 CRUD
├── order.md             # 訂單流程
└── notification.md      # 通知系統
```

### 命名慣例

- 檔名使用 kebab-case
- 對應功能模組名稱
- 一個檔案一個 Feature（大功能可拆多個 Feature）

## 常見反模式

| 反模式 | 問題 | 修正 |
|--------|------|------|
| 場景過長（>10 步驟） | 難以理解和維護 | 拆分為多個場景或抽取 Given |
| 技術語言 | 非開發人員無法理解 | 改用業務語言 |
| 重複 Given | 多個場景相同前置條件 | 使用 Background |
| 缺少 Edge Case | 只測 happy path | 至少 3 種場景 |
| 實作細節暴露 | 規格耦合實作 | 描述「什麼」不描述「怎麼做」 |
