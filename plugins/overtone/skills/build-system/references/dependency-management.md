# 依賴管理指南（npm/yarn/bun）

## Semver 語意速查

```
版本格式：MAJOR.MINOR.PATCH
  MAJOR：不相容的 API 變更（breaking change）
  MINOR：向下相容的新功能
  PATCH：向下相容的錯誤修復

範圍符號：
  ^1.2.3  → >=1.2.3 <2.0.0  （允許 minor + patch 更新）
  ~1.2.3  → >=1.2.3 <1.3.0  （只允許 patch 更新）
  1.2.3   → 精確版本
  *       → 任何版本（危險）
  >=1.0   → 大於等於
  1.x     → 等同 ^1.0.0
```

---

## Peer Dependency 衝突解決

```
症狀：
  npm WARN ERESOLVE overriding peer dependency
  或
  npm ERR! ERESOLVE could not resolve

原因：
  A 套件需要 React ^16，B 套件需要 React ^18，但你用 React ^17

診斷流程：
  npm ls react           # 看依賴樹中所有 react 版本
  npm why [package]      # 看誰引入了這個套件
  npm outdated           # 看哪些套件有更新

解決方案（依優先順序）：
  1. 升級衝突套件到支援相同版本的新版
  2. 升級/降級你的直接依賴到相容版本
  3. 使用 overrides（package.json）強制版本：
     "overrides": { "react": "^18" }
  4. 最後手段：npm install --legacy-peer-deps
     （掩蓋問題，可能引入 runtime 錯誤）
```

---

## Lockfile 管理

```
為什麼需要 lockfile：
  - 確保所有人安裝相同版本
  - 防止 semver 範圍內的意外更新
  - 提供可重現的構建

規則：
  □ lockfile（package-lock.json / yarn.lock / bun.lockb）必須提交到 git
  □ 不要手動編輯 lockfile
  □ 合併衝突：刪除 lockfile + 重新 install

更新依賴（有意識地）：
  # 更新單一套件
  npm update [package]
  bun update [package]

  # 看過時的套件
  npm outdated
  bun outdated

  # 互動式更新（需 npm-check-updates）
  npx ncu -i
```

---

## 常見依賴問題

### 1. 依賴安裝後找不到模組

```bash
# 確認模組確實安裝
ls node_modules/[package-name]

# 確認 package.json 有記錄
cat package.json | grep [package]

# 確認 require 路徑正確
node -e "require.resolve('[package]')"

# 常見原因：
# - 安裝到全域而非本地
# - node_modules 損壞 → rm -rf node_modules && npm install
# - monorepo 中安裝位置錯誤
```

### 2. 同一套件多個版本

```bash
# 找出有多個版本的套件
npm ls [package] 2>/dev/null

# 強制去重（npm dedup）
npm dedupe

# Bun 查看重複
bun pm ls | grep [package]
```

### 3. 開發依賴 vs 生產依賴

```bash
# 安裝到 devDependencies（測試工具、build 工具）
npm install --save-dev [package]
bun add --dev [package]

# 安裝到 dependencies（runtime 需要）
npm install [package]
bun add [package]

# 錯誤：把 devDependency 加到 dependencies
# 後果：生產 bundle 增大，部署多裝不必要套件
```

### 4. 安裝腳本安全性

```bash
# 查看套件的 install scripts
npm show [package] scripts

# 禁用 install scripts（CI 環境建議）
npm install --ignore-scripts

# Bun 的安全模式
bun install --no-save  # 不修改 package.json
```

---

## Bun 特有行為

```bash
# Bun lockfile 是二進位格式
bun.lockb  ← 二進位，不可讀
# 如需人類可讀格式
bun pm hash-print  # 輸出 lockb 的文字版

# Bun workspace（monorepo）
# package.json
"workspaces": ["packages/*"]

# 安裝特定 workspace 的依賴
bun add [package] --cwd packages/[workspace]

# 執行所有 workspace 的 script
bun run --filter '*' build
```

---

## 依賴審查清單

```
新增依賴前確認：
  □ 套件最後更新日期（> 2 年未更新要小心）
  □ 週下載量（< 1000 次/週要評估風險）
  □ 開放 issues 數量
  □ 依賴樹大小（npm install [pkg] --dry-run）
  □ 是否有已知安全漏洞（npm audit）
  □ License 相容性（MIT/Apache 2.0 通常安全）

安全掃描：
  npm audit                    # 找已知漏洞
  npm audit fix                # 自動修復（謹慎）
  npm audit fix --force        # 允許 breaking change（危險）
  bun audit                    # Bun 版本
```
