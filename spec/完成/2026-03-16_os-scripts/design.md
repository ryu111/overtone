# OS 操控腳本 — 技術設計

## 深度路由：D4
**理由**：6 個獨立腳本可完全並行開發（各自操作不同 macOS 指令，檔案無重疊），適合多 executor 並行。

---

## 技術摘要

- **方案**：6 個獨立 .js 檔案，統一模式（平台守衛 + 依賴注入 + 不 throw）
- **理由**：os-control skill 的 reference 已完整定義 API 規格，按規格重建即可
- **取捨**：不建 OS 腳本共用基礎類別（YAGNI），每個腳本自包含平台守衛

## 方案比較

| 維度 | A：獨立檔案 + 統一模式（選擇） | B：OsModule 基礎類別繼承 |
|------|:---------------------------:|:---------------------:|
| 複雜度 | 低（每檔自包含） | 中（需設計繼承結構） |
| 可並行開發 | 高（零耦合） | 低（基類先完成） |
| 可測試性 | 高（獨立 import） | 中（需 mock 基類） |
| 重複程式碼 | 少許（平台守衛 ~5 行） | 無 |
| **結論** | 選擇：並行 + 簡單 | 過度設計 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | screenshot.js | `~/.claude/scripts/os/` | ~100 | screencapture 封裝 |
| 2 | window.js | `~/.claude/scripts/os/` | ~120 | osascript 視窗/進程管理 |
| 3 | process.js | `~/.claude/scripts/os/` | ~90 | ps + spawn + kill |
| 4 | clipboard.js | `~/.claude/scripts/os/` | ~40 | pbcopy + pbpaste |
| 5 | system-info.js | `~/.claude/scripts/os/` | ~130 | top/vm_stat/df/ifconfig 解析 |
| 6 | tts.js | `~/.claude/scripts/os/` | ~60 | say 指令封裝 |

### 修改檔案

無。OS 腳本是獨立新增，不修改現有檔案。

### 統一模式

```javascript
// 每個腳本的固定結構
import { execSync } from 'child_process';

function platformGuard() {
  if (process.platform !== 'darwin') {
    return { ok: false, error: 'UNSUPPORTED_PLATFORM', message: 'macOS only' };
  }
  return null;
}

export function someFunction(arg, _deps = { execSync }) {
  const guard = platformGuard();
  if (guard) return guard;

  try {
    const output = _deps.execSync('...', { encoding: 'utf-8', timeout: 10000 });
    // 解析 output
    return { ok: true, /* structured data */ };
  } catch (e) {
    return { ok: false, error: 'COMMAND_FAILED', message: e.message };
  }
}
```

## 資料模型

- 截圖輸出目錄：`/tmp/nova-brain-screenshots/`（自動建立）
- 無持久化狀態

## 執行步驟

### Phase 1：全部並行（parallel）

| 步驟 | 檔案 | 說明 | Executor |
|------|------|------|---------|
| 1a | screenshot.js | screencapture 封裝 | Executor A |
| 1b | window.js | osascript 視窗管理 | Executor B |
| 1c | process.js | ps + spawn + kill | Executor C |
| 1d | clipboard.js | pbcopy + pbpaste | Executor D |
| 1e | system-info.js | 系統資訊解析 | Executor E |
| 1f | tts.js | say 封裝 | Executor F |

### Phase 2：測試（parallel，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | screenshot.test.js | 全螢幕/區域/視窗截圖 + 權限檢查 |
| 2b | window.test.js | 視窗列表/聚焦/前景 + 權限檢查 |
| 2c | process.test.js | 列出/啟動/終止 + 安全邊界 |
| 2d | clipboard.test.js | 讀/寫剪貼簿 |
| 2e | system-info.test.js | CPU/記憶體/磁碟/網路 |
| 2f | tts.test.js | speak/stop/listVoices |

## Pre-mortem

**假設 OS 腳本上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | osascript 輸出格式在新 macOS 版本變化 | 中 | 中 | 容錯解析 + PARSE_ERROR fallback |
| 2 | Screen Recording / Accessibility 權限未授予 | 高 | 中 | checkPermission / checkAccessibility 前置函式 |
| 3 | timeout 不足導致大螢幕截圖失敗 | 低 | 低 | screencapture timeout 10s（足夠 4K） |
| 4 | system-info 解析 vm_stat 頁面大小假設錯誤 | 低 | 低 | 動態讀取 pagesize 而非硬編碼 4096 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| screenshot.test.js | _deps mock 驗證指令正確 + 錯誤處理 |
| window.test.js | osascript 輸出解析 + 空結果處理 |
| process.test.js | PID 安全邊界 + signal 白名單 |
| clipboard.test.js | 讀寫 round-trip + 空內容 |
| system-info.test.js | 各指令輸出解析 + 邊界值 |
| tts.test.js | speak/stop/listVoices + 空字串拒絕 |

## 不做什麼

1. **不建共用基礎類別**：每個腳本自包含平台守衛（5 行重複 < 抽象成本）
2. **不做 notification.js**：已存在於 hooks/modules/notification.js
3. **不做 fswatch.js**：v1 用 Bun 原生 watch
4. **不做 websocket.js**：非核心 OS 能力
