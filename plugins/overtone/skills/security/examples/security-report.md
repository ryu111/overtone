# 安全掃描報告範例

> 📋 **何時讀取**：首次撰寫安全報告或需要格式參考時。

## 完整報告範例

```markdown
## 安全掃描報告

### 摘要
- 掃描範圍：src/routes/auth.ts, src/middleware/auth.ts, src/controllers/user.ts
- 掃描時間：2026-02-25 14:30
- 判定：**REJECT**（1 Critical + 1 High 需修復）

### 發現（按嚴重程度排序）

#### 🔴 Critical — SQL Injection in User Search

**位置**：`src/controllers/user.ts:45`

**問題**：
使用者搜尋 API 直接拼接使用者輸入到 SQL 查詢中，可被利用進行 SQL injection 攻擊。

**程式碼**：
​```typescript
// ❌ 當前程式碼
const users = await db.query(
  `SELECT * FROM users WHERE name LIKE '%${req.query.search}%'`
);
​```

**攻擊場景**：
攻擊者可輸入 `'; DROP TABLE users; --` 刪除整個 users 表。

**修復建議**：
​```typescript
// ✅ 使用 parameterized query
const users = await db.query(
  'SELECT * FROM users WHERE name LIKE $1',
  [`%${req.query.search}%`]
);
​```

**OWASP 分類**：A03 Injection

---

#### 🟠 High — JWT Secret Hardcoded

**位置**：`src/middleware/auth.ts:12`

**問題**：
JWT 簽名密鑰硬編碼在原始碼中，任何有程式碼存取權限的人都能偽造 token。

**程式碼**：
​```typescript
// ❌ 當前程式碼
const secret = 'my-super-secret-key-123';
const decoded = jwt.verify(token, secret);
​```

**修復建議**：
​```typescript
// ✅ 使用環境變數
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET not configured');
const decoded = jwt.verify(token, secret);
​```

**OWASP 分類**：A02 Cryptographic Failures

---

#### 🟡 Medium — Missing Rate Limiting on Login

**位置**：`src/routes/auth.ts:23`

**問題**：
登入 endpoint 沒有 rate limiting，可被暴力破解。

**修復建議**：
加入 rate limiter middleware，建議每 IP 每分鐘最多 10 次登入嘗試。

​```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts' },
});

router.post('/login', loginLimiter, loginHandler);
​```

**OWASP 分類**：A07 Identification and Authentication Failures

---

#### 🔵 Low — Verbose Error Messages in Development Mode

**位置**：`src/middleware/error.ts:8`

**問題**：
錯誤處理 middleware 在非 production 環境下回傳完整 stack trace。雖然目前 production 環境有保護，但建議統一處理避免意外洩露。

**修復建議**：
確認 `NODE_ENV` 在 production 中正確設定，並考慮移除 stack trace 回傳邏輯。

**OWASP 分類**：A05 Security Misconfiguration
```
