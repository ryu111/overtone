# JavaScript/TypeScript 安全模式

## Prototype Pollution（原型污染）

**CWE-1321**

```
風險：攻擊者修改 Object.prototype，影響所有物件

觸發路徑：
  - 使用 merge/extend/deepCopy 函式處理不信任的輸入
  - 不安全的物件賦值如 obj[key] = value（key 可控）
  - 反序列化 JSON 後直接合併到物件

範例攻擊：
  // 攻擊者傳入：{"__proto__": {"isAdmin": true}}
  function merge(target, source) {
    for (const key in source) {
      target[key] = source[key];  // 危險！key 可以是 __proto__
    }
  }
  merge({}, maliciousInput);
  // 現在所有物件都有 isAdmin: true

修復方式：
  // 1. 用 Object.create(null)（無 prototype 的物件）
  const target = Object.create(null);

  // 2. 用 hasOwnProperty 過濾
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        target[key] = source[key];
      }
    }
  }

  // 3. 用安全的 merge 函式（如 lodash 新版本）
  // 4. 改用 structuredClone()（Node 17+）
  const safe = structuredClone(untrustedInput);
```

---

## ReDoS（Regex Denial of Service）

**CWE-1333**

```
風險：精心構造的輸入讓 regex 花費指數時間

危險的 regex 模式（nested quantifiers）：
  /(a+)+b/           ← 輸入 "aaaaaaaaaaaaaaac" 會 hang
  /(.*a){x}/         ← 大量重複
  /([a-zA-Z]+)*/     ← 分組後再加 *

測試方式：
  node -e "/(a+)+/.test('aaaaaaaaaaaaaaac')"
  # 如果這行不立即返回，就是 ReDoS 漏洞

修復方式：
  // 1. 簡化 regex，避免 nested quantifiers
  // 壞
  const emailRegex = /^([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)*$/;
  // 好
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 2. 設定輸入長度限制
  if (input.length > 100) throw new Error('Input too long');

  // 3. 使用 safe-regex 套件驗證
```

---

## Unsafe Deserialization

**CWE-502**

```
風險：反序列化不受信任的資料時執行任意程式碼

Node.js 的危險模式：
  // serialize-javascript / node-serialize 的反序列化
  const obj = nodeSerialize.unserialize(untrustedData);
  // untrustedData 可以包含 IIFE 並在反序列化時執行

  // eval-based JSON parsing（過時但仍存在）
  const data = eval('(' + jsonString + ')');

安全的替代方案：
  // 1. 只用 JSON.parse（不執行程式碼）
  const data = JSON.parse(untrustedInput);

  // 2. 加入 Schema 驗證
  const parsed = JSON.parse(untrustedInput);
  const validated = schema.parse(parsed);  // zod/joi/ajv

  // 3. 確認反序列化函式的安全性
  // 避免 eval、Function()、new Function()
```

---

## 依賴注入風險（Supply Chain Attack）

```
風險：惡意套件在 install/postinstall 時執行程式碼

常見攻擊手法：
  - typosquatting（包名相似）
  - 劫持廢棄套件（maintainer 換手）
  - postinstall script 做惡意操作

防護措施：
  // package.json
  "scripts": {
    // 禁止 install scripts（CI 用）
  }

  // npm 設定
  npm set ignore-scripts true  // 全局禁用 scripts
  npm install --ignore-scripts  // 單次禁用

  // 套件審查
  □ 確認套件有 npm 2FA
  □ 確認 maintainer 可信
  □ 審查 postinstall scripts
  □ 使用 npm audit 定期掃描

  // 鎖定版本
  // 使用精確版本而非範圍
  "dependencies": {
    "lodash": "4.17.21"  // 精確版，不用 ^4
  }
```

---

## Path Traversal（路徑穿越）

**CWE-22**

```
風險：攻擊者使用 ../ 讀取任意檔案

危險模式：
  const filePath = req.params.filename;
  const content = fs.readFileSync('./uploads/' + filePath);
  // 攻擊：filePath = "../../etc/passwd"

修復方式：
  const path = require('path');

  function safeReadFile(basePath, userInput) {
    // 1. 解析絕對路徑
    const fullPath = path.resolve(basePath, userInput);

    // 2. 確認路徑在允許的目錄內
    if (!fullPath.startsWith(path.resolve(basePath))) {
      throw new Error('Path traversal detected');
    }

    return fs.readFileSync(fullPath);
  }
```

---

## Command Injection

**CWE-78**

```
風險：使用者輸入被傳入 shell 指令

危險模式：
  const { exec } = require('child_process');
  exec(`ls -la ${userInput}`);
  // 攻擊：userInput = "; rm -rf /"

修復方式：
  const { execFile } = require('child_process');

  // 1. 用 execFile/spawn 傳陣列參數（不通過 shell）
  execFile('ls', ['-la', userInput], callback);  // 安全

  // 2. 嚴格驗證輸入
  if (!/^[a-zA-Z0-9_-]+$/.test(userInput)) {
    throw new Error('Invalid input');
  }

  // 3. 避免使用 exec（通過 shell 執行）
  // 改用 execFile / spawn
```

---

## Security Header Checklist

```javascript
// Express 安全 headers（使用 helmet）
const helmet = require('helmet');
app.use(helmet());

// 手動設定關鍵 headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
```
