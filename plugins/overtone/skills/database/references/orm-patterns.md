# ORM 特定模式與反模式

## N+1 問題偵測與修復

```
症狀：
  - 請求一個列表（N 項）時，生成 N+1 個 SQL 查詢
  - 日誌中看到大量重複的 SELECT（只有 WHERE id = ? 不同）
  - 頁面/API 在資料量增加後突然變慢

識別方式：
  // 開啟 query logging
  // Prisma：
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

  // Sequelize：
  const sequelize = new Sequelize({
    logging: console.log,
  });

問題程式碼（N+1）：
  const orders = await Order.findAll();
  for (const order of orders) {
    order.customer = await Customer.findByPk(order.customerId);
    // 每個 order 各自發一次 SELECT，共 N+1 次
  }

修復：Eager Loading
  // Prisma
  const orders = await prisma.order.findMany({
    include: { customer: true },  // JOIN，一次查詢
  });

  // Sequelize
  const orders = await Order.findAll({
    include: [{ model: Customer }],  // JOIN
  });

  // 或用 DataLoader（批次載入）
  const DataLoader = require('dataloader');
  const customerLoader = new DataLoader(async (ids) => {
    const customers = await Customer.findAll({ where: { id: ids } });
    return ids.map(id => customers.find(c => c.id === id));
  });
```

---

## Connection Pool 管理

```
設定基準（以 Node.js + PostgreSQL 為例）：

const pool = new Pool({
  max: 10,           // 最大連線數（預設 10）
  min: 2,            // 最小閒置連線數
  idleTimeoutMillis: 30000,   // 閒置 30s 後關閉
  connectionTimeoutMillis: 5000,  // 連線逾時 5s
});

Prisma 連線 URL 格式：
  DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20"

常見問題：
  - connection_limit 太低 → 高流量時 "connection pool exhausted"
  - 沒有正確釋放連線 → 連線耗盡

連線洩漏偵測：
  // 監控連線數
  SELECT count(*) FROM pg_stat_activity WHERE state = 'idle';
  // 如果持續增長，代表連線沒有釋放

確保釋放連線：
  // 壞：例外時不釋放
  const client = await pool.connect();
  const result = await client.query(sql);  // 如果這行拋出，client 永不釋放
  client.release();

  // 好：try/finally 確保釋放
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result;
  } finally {
    client.release();  // 一定執行
  }
```

---

## Migration 安全策略

```
基本原則：
  □ Migration 必須可回滾（up + down）
  □ 先部署 migration，再部署應用程式碼
  □ 不要在 migration 中修改資料（用 seeder）
  □ 大表操作要注意鎖定時間

Schema 變更安全順序：

  新增欄位（安全）：
    1. 新增 nullable 欄位（不影響現有查詢）
    2. 部署能讀寫新欄位的程式碼
    3. 回填資料（可選）
    4. 加 NOT NULL 約束（如需要）

  刪除欄位（需謹慎）：
    1. 部署不再使用該欄位的程式碼（但不刪除）
    2. 確認應用程式不再讀寫
    3. 刪除欄位

  重命名欄位（危險）：
    方案 A（安全但複雜）：
      1. 新增新欄位
      2. 同步寫入新舊欄位
      3. 遷移歷史資料到新欄位
      4. 切換讀取到新欄位
      5. 移除舊欄位

    方案 B（停機遷移）：
      1. 停機 maintenance
      2. 重命名 + 更新所有程式碼
      3. 重啟

大表 Migration 注意事項：
  - 加索引用 CONCURRENTLY（不鎖表）
    CREATE INDEX CONCURRENTLY idx_user_email ON users(email);
  - 分批更新，不要一次 UPDATE 所有記錄
  - 評估 migration 期間的服務降級需求
```

---

## Lazy Loading 陷阱

```
症狀：
  - 存取關聯屬性時觸發額外查詢
  - 在 serialization（JSON.stringify）時觸發查詢
  - 在迴圈中反覆觸發查詢

問題（Sequelize lazy loading）：
  const user = await User.findByPk(1);
  // 此時 user.orders 是 undefined

  const orders = await user.getOrders();  // 觸發查詢（OK，明確）

  // 但如果使用自動 getter（某些 ORM）：
  const data = JSON.stringify(user);
  // 可能觸發隱式查詢！

解決方案：
  // 1. 明確使用 include（eager loading）
  const user = await User.findByPk(1, {
    include: [Order],
  });

  // 2. 在 serialization 前確保關聯已載入
  await user.reload({ include: [Order] });

  // 3. 用 toJSON() 前確認關聯已解析
```

---

## Query 效能模式

```javascript
// 1. 只選需要的欄位（避免 SELECT *）
// 壞
const users = await prisma.user.findMany();
// 好
const users = await prisma.user.findMany({
  select: { id: true, name: true, email: true },
});

// 2. 分頁（避免一次載入所有資料）
const page = await prisma.post.findMany({
  skip: (pageNum - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' },
});

// 3. 索引覆蓋查詢（index-only scan）
// 確認 WHERE 和 ORDER BY 的欄位都有索引

// 4. Count 優化
// 壞（載入所有記錄再 count）
const total = (await prisma.post.findMany()).length;
// 好
const total = await prisma.post.count();
```
