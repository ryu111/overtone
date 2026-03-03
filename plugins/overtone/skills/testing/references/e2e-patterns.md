# E2E 測試核心模式

## Page Object Model（POM）

```javascript
// 把頁面操作封裝成物件，不在測試中寫 selector
// 壞：selector 散落在測試中
test('login', async () => {
  await page.click('#email-input');
  await page.fill('#email-input', 'test@example.com');
  await page.click('[data-testid="submit-btn"]');
  await expect(page.locator('.dashboard-title')).toBeVisible();
});

// 好：Page Object 封裝
class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput = page.locator('#email-input');
    this.submitBtn = page.locator('[data-testid="submit-btn"]');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.page.locator('#password-input').fill(password);
    await this.submitBtn.click();
  }
}

class DashboardPage {
  constructor(page) {
    this.title = page.locator('.dashboard-title');
  }

  async isVisible() {
    return this.title.isVisible();
  }
}

// 測試更清晰
test('login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);

  await loginPage.login('test@example.com', 'password');
  await expect(dashboardPage.title).toBeVisible();
});
```

---

## Fixtures（測試夾具）

```javascript
// Playwright fixtures
import { test as base } from '@playwright/test';

// 自訂 fixture：已登入的 page
export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    // Setup：每個測試前自動登入
    await page.goto('/login');
    await page.fill('#email', 'admin@test.com');
    await page.fill('#password', 'testpass');
    await page.click('#submit');
    await page.waitForURL('/dashboard');

    await use(page);  // 執行測試

    // Teardown：測試後清理
    await page.evaluate(() => localStorage.clear());
  },
});

// 使用 fixture
test('dashboard loads', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  await expect(authenticatedPage.locator('.welcome')).toBeVisible();
});
```

---

## Locator 策略優先序

```
優先順序（高→低）：

1. role locator（最推薦）
   page.getByRole('button', { name: '送出' })
   ✅ 反映無障礙語意、不隨 UI 變動

2. testid（推薦）
   page.getByTestId('submit-btn')
   ✅ 穩定、不受樣式影響
   data-testid="submit-btn"  ← HTML 中加此屬性

3. text（適中）
   page.getByText('送出')
   ⚠️ 文字改變會斷掉測試

4. label（表單適用）
   page.getByLabel('電子郵件')
   ✅ 與 input 的 label 關聯

5. placeholder
   page.getByPlaceholder('輸入 Email')
   ⚠️ placeholder 改變會斷掉

6. CSS selector（盡量避免）
   page.locator('.submit-button')
   ❌ 樣式重構會斷掉

7. XPath（最後手段）
   page.locator('//button[@type="submit"]')
   ❌ 脆弱，難讀
```

---

## Anti-Flakiness 技巧

```javascript
// 1. 等待狀態，不等時間
// 壞
await page.click('#load-data');
await page.waitForTimeout(2000);  // 硬等，時間不夠就 fail

// 好
await page.click('#load-data');
await page.waitForSelector('.data-loaded');
// 或
await expect(page.locator('.spinner')).not.toBeVisible();

// 2. 等待 network idle
await page.goto('/dashboard', { waitUntil: 'networkidle' });

// 3. retry 機制（Playwright 內建）
// playwright.config.ts
export default {
  retries: 2,  // 失敗時自動重試 2 次
  use: {
    actionTimeout: 10000,  // 操作逾時 10s
  }
};

// 4. 避免 race condition（等待元素可互動）
await page.locator('#button').waitFor({ state: 'visible' });
await page.locator('#button').click();
// 或直接用 Playwright 的自動等待
await page.click('#button');  // Playwright 自動等待可點擊

// 5. Isolate tests（測試間不共用狀態）
test.beforeEach(async ({ page }) => {
  // 清理狀態
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});
```

---

## AAA 結構（Arrange/Act/Assert）

```javascript
test('使用者可以送出表單', async ({ page }) => {
  // Arrange（準備）
  await page.goto('/contact');
  const form = new ContactForm(page);

  // Act（執行）
  await form.fill({
    name: '測試使用者',
    email: 'test@example.com',
    message: '測試訊息',
  });
  await form.submit();

  // Assert（驗證）
  await expect(page.getByText('已成功送出')).toBeVisible();
  await expect(page.locator('.error')).not.toBeVisible();
});
```

---

## E2E 測試範圍設計

```
什麼值得 E2E 測試：
  ✅ 核心使用者流程（login → 使用功能 → logout）
  ✅ 跨頁面的流程（搜尋 → 點擊 → 詳細頁）
  ✅ 表單送出與驗證
  ✅ 錯誤狀態的顯示

什麼不適合 E2E：
  ❌ 純 UI 細節（顏色、字型大小）→ Visual regression test
  ❌ 業務邏輯計算 → Unit test
  ❌ API 回應格式 → Integration test
  ❌ 所有 edge case → 太慢且脆弱

E2E 測試數量建議：
  單元測試：70%
  整合測試：20%
  E2E 測試：10%  ← E2E 維護成本高，精選核心流程
```

---

## 常用 Playwright 斷言

```javascript
// 可見性
await expect(locator).toBeVisible();
await expect(locator).not.toBeVisible();
await expect(locator).toBeHidden();

// 文字
await expect(locator).toHaveText('Expected Text');
await expect(locator).toContainText('partial text');

// 屬性
await expect(locator).toHaveAttribute('href', '/home');
await expect(locator).toBeEnabled();
await expect(locator).toBeDisabled();
await expect(locator).toBeChecked();

// 計數
await expect(locator).toHaveCount(3);

// URL
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveURL(/dashboard/);
```
