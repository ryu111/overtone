# DB 審查報告範例

> 📋 **何時讀取**：首次撰寫 DB 審查報告或需要格式參考時。

## 完整報告範例

```markdown
## DB 審查報告

### 摘要
- 審查範圍：PR #42 — 新增訂單系統（5 個 migration + 3 個 model 變更）
- 審查時間：2026-02-25
- 判定：**REJECT**（1 個 N+1 問題 + 1 個 migration 不可逆）

### 效能問題

#### 🔴 Critical — N+1 查詢（訂單列表 API）

**位置**：`src/controllers/order.controller.ts:28`

**問題**：
取得訂單列表時，對每個訂單單獨查詢 order items。
假設 20 筆訂單/頁，每次請求產生 21 次 DB 查詢。

**程式碼**：
​```typescript
// ❌ 當前程式碼（N+1）
const orders = await Order.findAll({ where: { userId } });
for (const order of orders) {
  order.items = await OrderItem.findAll({
    where: { orderId: order.id },
  });
}
​```

**修復建議**：
​```typescript
// ✅ Eager loading（2 次查詢）
const orders = await Order.findAll({
  where: { userId },
  include: [{ model: OrderItem, as: 'items' }],
});
​```

**影響**：核心列表 API，影響所有使用者。

---

#### 🟡 Medium — 缺少索引

**位置**：`migrations/003-create-order-items.ts`

**問題**：
`order_items` 表的 `product_id` 欄位缺少索引。
此欄位在「按商品查詢訂單」API 的 WHERE 條件中使用。

**修復建議**：
​```sql
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
​```

---

### 安全問題

#### 🟠 High — Migration 不可逆

**位置**：`migrations/005-add-payment-status.ts`

**問題**：
此 migration 將 `orders.status` 欄位從 VARCHAR 改為 ENUM。
`down` migration 嘗試將 ENUM 轉回 VARCHAR，但可能遺失自訂狀態值。

**修復建議**：
1. 保留原 VARCHAR 欄位，新增 ENUM 欄位
2. 資料同步後，在下一版 migration 中移除舊欄位
3. 或在 down migration 中明確處理轉換邏輯

---

### 最佳實踐建議

#### 💡 建議 — Transaction 邊界

**位置**：`src/services/order.service.ts:15`

**建議**：
建立訂單涉及 3 個操作（建立訂單 + 建立項目 + 扣庫存），
建議包裝在 transaction 中確保一致性。

​```typescript
const order = await db.transaction(async (trx) => {
  const order = await Order.create(orderData, { transaction: trx });
  await OrderItem.bulkCreate(items, { transaction: trx });
  await Inventory.decrement(quantities, { transaction: trx });
  return order;
});
​```

---

#### 💡 建議 — 分頁策略

**位置**：`src/controllers/order.controller.ts:25`

**建議**：
目前使用 OFFSET 分頁，在資料量大時效能會下降。
建議改用 cursor-based 分頁。

​```typescript
// 目前（OFFSET）
const orders = await Order.findAll({ offset: page * 20, limit: 20 });

// 建議（Cursor）
const orders = await Order.findAll({
  where: { id: { [Op.lt]: cursor } },
  order: [['id', 'DESC']],
  limit: 20,
});
​```
```
