# 手動清理死碼決策樹

## 清理決策樹

```
發現潛在死碼
  │
  ├── 是否有測試直接測試這段程式碼？
  │     ├── Yes → 確認測試是否也需刪除
  │     └── No  → 繼續判斷
  │
  ├── 是否是 Public API / Exported？
  │     ├── Yes → 是否有外部使用者？（其他 repo、文件、CLI）
  │     │           ├── Yes → 保留，加 deprecation notice
  │     │           └── No  → 可刪除
  │     └── No  → 繼續判斷
  │
  ├── 是否可能是動態呼叫？
  │     ├── require(variableName)
  │     ├── obj[dynamicKey]()
  │     ├── eval() 或 Function()
  │     └── 反射（Reflect.apply）
  │           → 可能 false positive，需人工確認
  │
  └── 確認無使用 → 安全刪除
```

---

## Grep 搜尋模式

### 找函式/方法使用

```bash
# 找函式被呼叫的地方
grep -rn "functionName\b" . --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules

# 找帶模組前綴的呼叫
grep -rn "module\.functionName\|exports\.functionName" . \
  --include="*.js"

# 找 require/import
grep -rn "require.*['\"].*moduleName" . --include="*.js"
grep -rn "import.*from.*['\"].*moduleName" . --include="*.ts"

# 找間接引用（物件解構）
grep -rn "{ functionName }" . --include="*.js" --include="*.ts"
```

### 找 class/constructor 使用

```bash
# 找 new ClassName
grep -rn "new ClassName\b" . --include="*.js" --include="*.ts"

# 找 extends ClassName
grep -rn "extends ClassName\b" . --include="*.js" --include="*.ts"

# 找 instanceof ClassName
grep -rn "instanceof ClassName\b" . --include="*.js" --include="*.ts"
```

### 找 CSS class 使用（前端）

```bash
# 找 className 或 class 屬性
grep -rn "\"class-name\"\|'class-name'\|class-name" . \
  --include="*.html" --include="*.jsx" --include="*.tsx"
```

---

## Dynamic Import 偵測

```javascript
// 這些模式 static analysis 抓不到：

// 1. 變數 require
const moduleName = getModuleName();
const mod = require(moduleName);  // 無法靜態分析

// 2. 條件 import
if (process.env.PLUGIN) {
  const plugin = require(`./plugins/${process.env.PLUGIN}`);
}

// 3. 動態方法呼叫
const handlers = { save, delete, update };
handlers[action]();  // 哪個方法被呼叫取決於 action

// 4. eval（極少數情況）
eval(`${funcName}()`);
```

偵測方法：
```bash
# 找動態 require
grep -rn "require(\`\|require(var\|require(get" . --include="*.js"

# 找字串插值模組名
grep -rn 'require(`\.' . --include="*.js"

# 找動態屬性存取（可能是動態方法呼叫）
grep -rn '\[.*\]()' . --include="*.js" --include="*.ts"
```

---

## False Positive 判斷規則

| 情境 | 判斷 | 原因 |
|------|------|------|
| 函式名在字串中（如 log 訊息）| False positive | 不是呼叫 |
| 函式名在 comment 中 | False positive | 不是使用 |
| 函式作為物件屬性值 `{ fn: myFunc }` | 真實使用 | 被引用 |
| 函式在陣列中 `[fn1, fn2]` | 真實使用 | 被引用 |
| 測試檔中的 mock `jest.mock('./module')` | 真實依賴 | 測試依賴 |
| 設定檔中字串引用 `"handler": "myFunc"` | 需確認 | 可能動態載入 |
| 函式名和其他 function 相同 | 需確認 | 可能是其他函式 |

---

## 清理流程（安全步驟）

```
Step 1: 備份
  git stash  # 或確保在 feature branch 上

Step 2: 標記（不直接刪除）
  // DEAD_CODE: 2024-01-15 — 確認無使用後刪除
  function suspectedDeadFunction() { ... }

Step 3: 驗證
  bun test  # 確認測試仍通過
  bun run build  # 確認可編譯

Step 4: 刪除 + 再次驗證
  # 刪除標記的程式碼
  bun test && bun run build  # 確認仍然正常

Step 5: Commit
  git add -p  # 逐塊確認
  git commit -m "chore: 移除確認未使用的 X 函式 [刪除未使用]"
```

---

## 常見高風險場景

```
⚠️ 謹慎刪除的場景：
  1. CLI 工具的子指令（可能被外部 script 呼叫）
  2. API endpoint handlers（可能有文件未記載的使用者）
  3. 錯誤處理的 fallback（平時不走，但關鍵時需要）
  4. 效能優化路徑（A/B testing 的非主路徑）
  5. 向後相容的 adapter（有舊客戶端）
  6. 框架期望存在的 lifecycle hooks
     （如 beforeDestroy、onError、fallback component）
```
