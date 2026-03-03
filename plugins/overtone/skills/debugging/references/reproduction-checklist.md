# Bug 重現步驟清單

## 重現前置作業

```
□ 確認錯誤訊息的完整文字（包含 stack trace）
□ 記錄錯誤第一次出現的時間
□ 確認是否可穩定重現（100%? 偶發?）
□ 確認影響範圍（所有使用者? 特定條件?）
```

## 環境資訊收集

```
□ OS 版本：
□ Runtime 版本（Node/Bun/Deno）：
□ 相關套件版本（package.json）：
□ 配置檔案（.env、config）：
□ 最近的 git commit：git log --oneline -10
□ 是否有未提交的變更：git status
```

## 最小化重現案例（MRE）

逐步縮小範圍：

```
Step 1: 確認在 main branch 也能重現
  git stash && git checkout main && [重現步驟]

Step 2: 找到引入問題的 commit
  git bisect start
  git bisect bad HEAD
  git bisect good [known-good-commit]
  # 重複 good/bad 直到找到 commit

Step 3: 建立最小重現案例
  - 移除與問題無關的程式碼
  - 用 hardcode 替換複雜的外部依賴
  - 目標：< 50 行能重現問題的程式碼

Step 4: 確認 MRE 可獨立執行
  bun run [minimal-repro.js]
```

## Log 收集框架

```javascript
// 除錯時加入的 logging 模板
const DEBUG = process.env.DEBUG === '1';

function debugLog(label, data) {
  if (!DEBUG) return;
  console.log(`[DEBUG:${label}]`, JSON.stringify(data, null, 2));
}

// 在懷疑的點加入
debugLog('input', { args, state });
debugLog('result', { output, error });
debugLog('state-before', getState());
// ... 操作 ...
debugLog('state-after', getState());
```

執行：`DEBUG=1 bun run [script]`

## Stack Trace 解讀

```
Error: Cannot read property 'name' of undefined
    at processUser (/app/users.js:45:23)    ← 你的程式碼（從這裡找起）
    at Array.map (<anonymous>)              ← 內建函式
    at getUsers (/app/users.js:30:15)       ← 你的程式碼
    at /app/server.js:120:5                 ← 呼叫者
    at Layer.handle [as handle_request]     ← 框架層（通常忽略）

解讀順序：
1. 看錯誤訊息本身
2. 找第一個 "at your-code.js" 行
3. 往下看呼叫鏈（誰呼叫了誰）
4. 找到真正的觸發點
```

## 環境差異排查

```
本地可以、CI 失敗
  □ 依賴版本是否 lock（lockfile 提交了嗎？）
  □ 環境變數是否設置（.env vs CI secrets）
  □ 檔案系統大小寫敏感（macOS 不敏感，Linux 敏感）
  □ 路徑分隔符（Windows `\` vs Unix `/`）

昨天可以、今天失敗
  □ git log 看昨天到今天的 commit
  □ 依賴是否有更新（package-lock.json diff）
  □ 外部 API 是否有異動
  □ 資料庫 schema 是否有遷移

A 機器可以、B 機器失敗
  □ node/bun 版本（node -v 或 bun -v）
  □ 全域安裝的套件版本
  □ 環境變數（printenv | grep RELEVANT）
  □ 檔案權限（ls -la）
```

## 常用診斷指令

```bash
# 找記憶體洩漏
node --inspect script.js  # Chrome DevTools 連接

# 找效能瓶頸
node --prof script.js     # 生成 v8 profile

# 確認 require 路徑
node -e "require.resolve('module-name')"

# 確認環境變數
printenv | grep APP_

# 確認 port 佔用
lsof -i :PORT

# 確認檔案存在
ls -la /path/to/file

# 確認 bun 版本
bun --version
bun -e "console.log(process.versions)"
```
