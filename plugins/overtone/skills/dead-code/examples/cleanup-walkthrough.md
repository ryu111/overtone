# 死碼清理範例：移除 grader.js

## 背景

`scripts/lib/grader.js` 原本負責評分邏輯，後來功能整合到 `registry.js`。懷疑 `grader.js` 已無使用者。

---

## Step 1: 搜尋使用者

```bash
# 在整個 codebase 搜尋 grader 引用
grep -rn "grader" . --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=.git

# 結果：
# tests/unit/grader.test.js:1:  const grader = require('../../scripts/lib/grader');
# tests/unit/grader.test.js:15: grader.grade(...)
# ← 只有測試在引用！沒有生產程式碼使用
```

---

## Step 2: 確認無動態引用

```bash
# 找可能的動態 require
grep -rn "require(\`.*grader\|require(.*+ 'grader'" . \
  --include="*.js" --exclude-dir=node_modules

# 結果：無
# 確認沒有動態載入 grader
```

---

## Step 3: 確認測試是否也該刪除

```
grader.test.js 只測試 grader.js 的 API
如果 grader.js 要刪，grader.test.js 也應該刪
（測試一個不存在的模組沒意義）
```

---

## Step 4: 執行刪除

```bash
# 刪除主檔
rm plugins/overtone/scripts/lib/grader.js

# 刪除對應測試
rm tests/unit/grader.test.js

# 確認測試仍通過（不能有其他測試因為 grader 而失敗）
bun test
```

---

## Step 5: 確認測試結果

```
測試輸出：
  1917 tests passed, 0 failed
  （原本 1917，刪除 grader.test.js 的測試後仍 1917，因為 grader.test.js 的測試計入其中）
  ← 系統正常，無意外的依賴斷裂
```

---

## Step 6: Commit

```bash
git add -p  # 逐塊確認要 stage 的更改

git commit -m "chore: 移除確認未使用的 grader.js [刪除未使用]

grader.js 的評分邏輯已整合到 registry.js（ADR-005）。
全域搜尋確認無生產程式碼引用，僅測試引用。
一併刪除 grader.test.js（測試已無意義）。"
```

---

## 關鍵學習

1. **搜尋確認優先**：刪除前一定要搜尋，不能靠記憶
2. **測試也是依賴**：刪除模組時一起評估測試是否還有意義
3. **commit 標記**：`[刪除未使用]` 讓 git log 可搜尋清理記錄
4. **驗證測試通過**：刪除後跑完整測試，確認沒有隱藏依賴
