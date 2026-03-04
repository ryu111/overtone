# Clean Code 規則

> 來源：Robert C. Martin《Clean Code》+ 團隊實踐

## 命名

| 規則 | 好 | 壞 |
|------|----|----|
| 意圖明確 | `getActiveUsers()` | `getList()` |
| 可發音 | `createdAt` | `crtdAt` |
| 可搜尋 | `MAX_RETRY_COUNT = 3` | 直接寫 `3` |
| 避免編碼 | `users` | `usersList`, `arrUsers` |
| 名詞=變數、動詞=函式 | `user.save()` | `user.doSave()` |
| Boolean 用 is/has/can | `isActive`, `hasPermission` | `active`, `permission` |

## 函式

| 規則 | 說明 |
|------|------|
| 小 | 一個函式 ≤ 20 行，超過就拆 |
| 做一件事 | 函式名稱完整描述它做的事，不多不少 |
| 參數少 | 0-2 個最佳，3+ 考慮用 options object |
| 無副作用 | 名稱說 `check` 就不該 `modify` |
| Command-Query 分離 | 要嘛改狀態（command），要嘛回傳值（query），不要同時 |
| 提早返回 | Guard clause 處理異常路徑，主邏輯不縮排 |

```javascript
// ❌ 壞：深層嵌套
function processOrder(order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.status === 'pending') {
        // ... 真正的邏輯
      }
    }
  }
}

// ✅ 好：Guard clause
function processOrder(order) {
  if (!order) return;
  if (order.items.length === 0) return;
  if (order.status !== 'pending') return;
  // ... 真正的邏輯
}
```

## 註解

| 好的註解 | 壞的註解 |
|----------|----------|
| 解釋 **為什麼**（業務決策） | 解釋 **是什麼**（程式碼已經說了） |
| TODO/FIXME（帶 issue 編號） | 註解掉的程式碼 |
| 公開 API 文件 | 日誌式註解（誰在何時改了什麼） |
| 警告後果（`// 順序很重要！先 X 再 Y`） | 位置標記（`// ---- Section ----`） |

## 錯誤處理

| 規則 | 說明 |
|------|------|
| 例外優於錯誤碼 | `throw new Error()` 而非 `return -1` |
| 不吞例外 | `catch {}` 至少要 log |
| 定義清楚的例外類別 | `ValidationError`, `NotFoundError` |
| Fail fast | 在邊界（入口）驗證，核心邏輯信任輸入 |
| 不用 null 傳遞 | 回傳空陣列 `[]` 而非 `null`，或用 Optional pattern |

## 格式

- 垂直：相關的放一起，不相關的空行分隔
- 水平：單行 ≤ 100 字元
- 一致性：整個專案遵循同一套格式（用 formatter 強制）
