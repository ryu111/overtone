# Tester Agent 操作規範（Testing Conventions）

> 版本：v1.0（2026-02-27）
> 適用對象：tester agent（spec 模式 + verify 模式）

---

## 1. 測試目錄結構

```
tests/
├── unit/              # 純函式測試（無 I/O）
├── integration/       # 含真實 I/O 或跨模組測試
├── e2e/               # 端對端測試（佔位，暫無）
│   └── .gitkeep
└── helpers/
    └── paths.js       # 路徑常數 Helper
```

**規則**：
- 無 I/O 的純函式測試 → `tests/unit/`
- 有真實檔案系統、網路、或子程序 → `tests/integration/`
- e2e（Claude Code 環境驗證）→ `tests/e2e/`（目前不寫）

---

## 2. 使用 tests/helpers/paths.js

所有測試檔**必須**透過 paths.js 取得路徑，不可硬編碼：

```javascript
// 正確做法
const path = require('path');
const { SCRIPTS_LIB, HOOKS_DIR, SCRIPTS_DIR } = require('../helpers/paths.js');

// 載入 lib 模組
const registry = require(path.join(SCRIPTS_LIB, 'registry.js'));
const state = require(path.join(SCRIPTS_LIB, 'state.js'));

// 載入 hook 腳本
const onStart = require(path.join(HOOKS_DIR, 'on-start.js'));
```

### 可用常數

| 常數 | 解析路徑 |
|------|----------|
| `PROJECT_ROOT` | `overtone/`（專案根目錄） |
| `PLUGIN_ROOT` | `plugins/overtone/` |
| `SCRIPTS_LIB` | `plugins/overtone/scripts/lib/` |
| `SCRIPTS_DIR` | `plugins/overtone/scripts/` |
| `HOOKS_DIR` | `plugins/overtone/hooks/scripts/` |

### 相對路徑說明

- 從 `tests/unit/` require：`require('../helpers/paths.js')`
- 從 `tests/integration/` require：`require('../helpers/paths.js')`
- 路徑常數使用 `__dirname` 計算，結果與呼叫位置無關

---

## 3. Spec 模式（spec）

在 developer 開始實作前，依 BDD spec 撰寫測試骨架：

1. 閱讀 `specs/features/in-progress/{featureName}/bdd.md`
2. 依 GIVEN/WHEN/THEN 建立 `describe` + `it` 骨架
3. 測試目前應該 **fail**（紅燈）— 這是預期行為
4. 將測試檔放到正確目錄（unit/integration）
5. 在 Handoff 說明哪些是新建的骨架測試

---

## 4. Verify 模式（verify）

developer 實作完成後，補全測試並執行：

### 4a. 讀取 developer Handoff

從 Handoff 取得：
- 實作了哪些功能（對應 BDD scenarios）
- 是否有「待清理測試」清單

### 4b. 補全測試實作

將骨架測試補充為完整的 assertions，確保覆蓋 BDD scenarios。

### 4c. 處理「待清理測試」

如果 developer Handoff 中有「待清理測試」清單：

```
### 待清理測試
- tests/unit/old-feature.test.js（功能已刪除）
- tests/integration/legacy.test.js 中的 describe("舊行為")
```

執行步驟：
1. 依清單刪除指定的測試檔或測試案例
2. 執行完整測試套件確認無殘留參照錯誤
3. 在 Handoff 中說明已刪除的項目

**重要**：只刪除 Handoff 明確標記的測試，不可自行判斷刪除其他測試。

### 4d. 執行測試

```bash
# 在專案根目錄執行
cd /Users/sbu/projects/overtone
bun test
```

### 4e. 預期輸出格式

```
bun test v1.x.x

tests/unit/registry.test.js:
✓ 包含所有 15 個 agent 定義 (2ms)

tests/integration/specs.test.js:
✓ initFeatureDir 建立正確目錄結構 (12ms)

 63 tests passed
 0 tests failed
Ran 63 tests across 13 files. [...]
```

---

## 5. 測試命名規範

- **檔案名**：英文 kebab-case，如 `registry.test.js`
- **describe 文字**：可中文，技術術語英文，如 `'registry.js'`、`'specs.js — initFeatureDir'`
- **it 文字**：可中文描述行為，如 `'應回傳正確的 agent model'`

---

## 6. 禁止事項

- 不可在測試中硬編碼絕對路徑（使用 paths.js）
- 不可修改 `tests/helpers/paths.js`（除非 Handoff 明確要求）
- 不可刪除 Handoff 未標記的測試
- 不可跳過 verify 模式中的「待清理測試」處理步驟
- verify 模式不寫新的 BDD 骨架（那是 spec 模式的工作）

---

## 7. 測試隔離（並行安全）

本專案測試以 10 workers 並行執行（`bun scripts/test-parallel.js`）。每個測試檔必須**完全隔離**，不可依賴執行順序或共享可變狀態。

### 7a. 檔案系統隔離

需要寫入檔案的測試 📋 MUST 使用獨立臨時目錄：

```javascript
const { mkdtempSync, rmSync } = require('fs');
const os = require('os');
const path = require('path');

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'overtone-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
```

⛔ **NEVER** 寫入共享路徑（如 `~/.overtone/`、專案目錄內的非 tmp 路徑）。

### 7b. 環境變數隔離

修改 `process.env` 的測試 📋 MUST 在 afterEach 還原：

```javascript
let savedEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
});

afterEach(() => {
  process.env = savedEnv;
});
```

### 7c. 模組狀態隔離

- 若受測模組有全域狀態（singleton、cache），測試間 📋 MUST 重置
- 避免依賴 `require()` 快取 — 需要乾淨狀態時使用 `jest.resetModules()` 或重新建構實例

### 7d. 隔離檢查清單

寫測試時自問：
1. 這個測試寫入檔案系統嗎？→ 用 `mkdtempSync` + `afterEach` 清理
2. 這個測試修改 `process.env` 嗎？→ `beforeEach` 存 / `afterEach` 還原
3. 這個測試依賴其他測試的執行結果嗎？→ 重構為獨立
4. 兩個 worker 同時跑這個測試會衝突嗎？→ 確保路徑/資源唯一
