# 操控層 — 技術設計

## 深度路由：D4
**理由**：4 個獨立腳本可完全並行（各自操作不同工具：System Events / cliclick / osascript / screenshot），適合多 executor。

---

## 技術摘要

- **方案**：4 個獨立 .js 檔案，與 R3.3 OS 腳本同一目錄（`~/.claude/scripts/os/`），統一模式
- **理由**：操控層和感知層共用同一目錄，統一的 `{ ok, error, message }` 回傳模式
- **取捨**：computer-use.js 依賴 screenshot.js 和 Claude 多模態，是唯一非純函式的腳本

## 方案比較

| 維度 | A：獨立腳本 + 統一模式（選擇） | B：Playwright-like 框架 |
|------|:---------------------------:|:--------------------:|
| 複雜度 | 低 | 高（需要完整框架設計） |
| 靈活度 | 高（單函式呼叫） | 中（框架約束） |
| 可測試性 | 高（DI） | 中 |
| 開發速度 | 快（並行開發） | 慢（框架先行） |
| **結論** | 選擇：Unix 哲學小工具 | 過度工程 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | keyboard.js | `~/.claude/scripts/os/` | ~80 | System Events 鍵盤操控 |
| 2 | mouse.js | `~/.claude/scripts/os/` | ~100 | cliclick 滑鼠操控 |
| 3 | applescript.js | `~/.claude/scripts/os/` | ~70 | AppleScript / JXA 執行引擎 |
| 4 | computer-use.js | `~/.claude/scripts/os/` | ~150 | 截圖→理解→操作→驗證迴圈 |

### 修改檔案

無。

### API 設計

```javascript
// keyboard.js
import { execSync } from 'child_process';

function platformGuard() { /* 同 R3.3 */ }

export function keystroke(text, _deps = { execSync }) {
  const guard = platformGuard();
  if (guard) return guard;
  if (!text) return { ok: false, error: 'INVALID_ARGUMENT', message: 'text is required' };

  try {
    // 轉義 AppleScript 特殊字元
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    _deps.execSync(
      `osascript -e 'tell application "System Events" to keystroke "${escaped}"'`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'COMMAND_FAILED', message: e.message };
  }
}

export function hotkey(modifier, key, _deps = { execSync }) {
  // modifier: 'command' | 'control' | 'option' | 'shift'
  // 支援組合：'command+shift'
  // 轉為 osascript key code + using 語法
}

// mouse.js
export function click(x, y, _deps = { execSync }) {
  const guard = platformGuard();
  if (guard) return guard;
  if (x < 0 || y < 0) return { ok: false, error: 'INVALID_ARGUMENT', message: 'coordinates must be non-negative' };

  try {
    _deps.execSync(`cliclick c:${x},${y}`, { encoding: 'utf-8', timeout: 5000 });
    return { ok: true };
  } catch (e) {
    if (e.message.includes('not found')) {
      return { ok: false, error: 'DEPENDENCY_MISSING', message: 'cliclick not found. Install: brew install cliclick' };
    }
    return { ok: false, error: 'COMMAND_FAILED', message: e.message };
  }
}

// applescript.js
export function run(script, _deps = { execSync }) {
  const guard = platformGuard();
  if (guard) return guard;
  if (!script) return { ok: false, error: 'INVALID_ARGUMENT', message: 'script is required' };

  try {
    // 使用 stdin 傳遞 script 避免 shell 注入
    const output = _deps.execSync('osascript', {
      input: script,
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { ok: true, output: output.trim() };
  } catch (e) {
    return { ok: false, error: 'SCRIPT_ERROR', message: e.message };
  }
}

// computer-use.js
import { captureFullScreen } from './screenshot.js';

export async function executeAction(goal, opts = {}, _deps = {}) {
  const maxRounds = opts.maxRounds || 10;
  const rounds = [];
  const screenshotFn = _deps.captureFullScreen || captureFullScreen;

  for (let i = 1; i <= maxRounds; i++) {
    // 1. 截圖
    const screenshot = screenshotFn({ outputPath: `/tmp/nova-brain-computer-use/round-${i}.png` });
    if (!screenshot.ok) return { ok: false, error: screenshot.error, message: screenshot.message };

    // 2. 分析（由呼叫者透過 _deps.analyzeFn 注入，或預設回傳 null）
    const analysis = _deps.analyzeFn ? await _deps.analyzeFn(screenshot.path, goal) : null;

    // 3. 決定操作（由分析結果決定）
    if (!analysis || analysis.goalAchieved) {
      return { ok: true, rounds, finalStatus: 'achieved' };
    }

    // 4. 執行操作
    const action = analysis.nextAction;
    // 呼叫對應的 keyboard/mouse/applescript 函式
    rounds.push({ round: i, screenshot: screenshot.path, analysis, action });
  }

  return { ok: false, rounds, finalStatus: 'exceeded', error: 'MAX_ROUNDS_EXCEEDED', message: `Exceeded ${maxRounds} rounds` };
}
```

## 資料模型

- computer-use 截圖：`/tmp/nova-brain-computer-use/round-{N}.png`
- 無持久化狀態
- 清理策略：每次 executeAction 開始時清空 /tmp/nova-brain-computer-use/

## 執行步驟

### Phase 1：獨立腳本（parallel）

| 步驟 | 檔案 | 說明 | Executor |
|------|------|------|---------|
| 1a | keyboard.js | keystroke + hotkey + typeText | Executor A |
| 1b | mouse.js | click + drag + scroll + checkCliclick | Executor B |
| 1c | applescript.js | run + runJXA + runFile | Executor C |

### Phase 2：Computer Use（sequential，依賴 Phase 1 + R3.3 screenshot.js）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2 | computer-use.js | 截圖→分析→操作→驗證迴圈 |

### Phase 3：測試（parallel，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | keyboard.test.js | keystroke/hotkey/typeText + DI |
| 3b | mouse.test.js | click/drag/scroll + cliclick 缺失 |
| 3c | applescript.test.js | run/runJXA/runFile + 錯誤處理 |
| 3d | computer-use.test.js | 迴圈邏輯 + maxRounds + mock 分析 |

## Pre-mortem

**假設操控層上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | cliclick 使用者未安裝 | 高 | 中 | checkCliclick() + 清楚的安裝指引 |
| 2 | Accessibility 權限未授予導致 keyboard/mouse 靜默失敗 | 高 | 高 | 操作前呼叫 checkAccessibility（from window.js） |
| 3 | computer-use 分析函式注入不正確 | 中 | 中 | 預設回傳 null → 安全退出 |
| 4 | AppleScript 使用者輸入導致 shell 注入 | 低 | 高 | 使用 stdin 傳遞 script，不做 shell 字串拼接 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| keyboard.test.js | osascript 指令格式正確 + 特殊字元轉義 |
| mouse.test.js | cliclick 指令格式正確 + 負座標拒絕 + 缺失檢測 |
| applescript.test.js | 執行成功 + 語法錯誤 + timeout |
| computer-use.test.js | 迴圈邏輯 + maxRounds + 第一輪截圖失敗退出 |

## 不做什麼

1. **不自動安裝 cliclick**：安全考慮，使用者自行 `brew install cliclick`
2. **不做圖像辨識**：依賴 Claude 多模態的 Read tool，不引入 OCR 庫
3. **不做 Linux/Windows 支援**：macOS only（`process.platform !== 'darwin'` guard）
