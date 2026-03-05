# P3.6 Security Integration — 技術設計

## 技術摘要（What & Why）

- **方案**：就地擴展現有模組（pre-bash-guard.js、health-check.js、SKILL.md），新建一個整合測試檔案
- **理由**：4 個工作項均為獨立的功能點擴充，無需引入新架構層；最簡單的實作是直接在既有函式內新增規則/項目
- **取捨**：checkOsTools 同時負責工具偵測和 daemon 狀態偵測，職責略寬，但符合現有「一個 check 函式 = 一個偵測主題」的 pattern，不另立新函式

---

## API 介面設計

### 1. pre-bash-guard.js — BLACKLIST 擴充（P3.1-P3.5 危險命令）

新增 5 條規則（現有 14 條 → 19 條）：

```javascript
// P3.6 新增：OS 腳本相關的危險使用模式
{ pattern: /\bsudo\s+tee\s+\/etc\//, label: '寫入系統設定目錄' },
{ pattern: /\bosascript\s+.*delete\b/i, label: 'AppleScript 刪除操作' },
{ pattern: /\bsudo\s+chmod\s+-R\s+777\s+\/(?!tmp|var\/tmp)/, label: '遞迴開放非暫存目錄全權限' },
{ pattern: /\blaunchctl\s+(unload|disable)\b/, label: '停用系統服務' },
{ pattern: /\bdefaults\s+delete\s+.*\.plist\b/i, label: '刪除系統偏好設定' },
```

**規則設計理由**：
- `sudo tee /etc/`：OS 腳本（websocket、notification）在設定錯誤時可能產生此命令，寫入 /etc/ 不可逆
- `osascript.*delete`：AppleScript 控制 Finder 刪除檔案，P3.4 預備規則，現在就加防護
- `sudo chmod -R 777 /（非 tmp）`：遞迴開放非暫存目錄，較原有的 `chmod 777 /（根目錄）` 更細緻
- `launchctl unload/disable`：停用 macOS 系統服務，可能造成服務中斷
- `defaults delete *.plist`：刪除系統偏好設定，影響 macOS 應用程式設定

**不加入的項目**（有意排除）：
- `screencapture` 本身安全，不需黑名單
- `cliclick` 等 P3.4 操控工具尚未完成，待 P3.4 時再評估

### 2. health-check.js — checkOsTools 擴展

```javascript
// 擴展後的 checkOsTools 函式簽名（不變）
// @returns {Finding[]}
function checkOsTools() {
  // 現有：pbcopy/pbpaste/osascript 工具偵測（不變）
  const tools = ['pbcopy', 'pbpaste', 'osascript', 'screencapture'];
  // 新增：screencapture（P3.1 截圖依賴）

  // 新增：heartbeat daemon 狀態偵測
  // 讀取 paths.HEARTBEAT_PID_FILE
  // 若 PID 檔存在 → 嘗試 process.kill(pid, 0) 確認存活
  // 回傳 info finding（daemon 未跑是正常狀態，不應是 warning）
}
```

**Finding 格式（新增的 heartbeat 項目）**：
```javascript
// daemon 未跑（PID 檔不存在）→ info（正常狀態）
{
  check: 'os-tools',
  severity: 'info',
  file: 'scripts/heartbeat.js',
  message: 'heartbeat daemon 未在執行（可選功能，需手動啟動）',
}

// daemon 有 PID 檔但 process 已死 → warning（stale PID）
{
  check: 'os-tools',
  severity: 'warning',
  file: '~/.overtone/heartbeat.pid',
  message: 'heartbeat PID 檔案存在但 process 已停止（stale PID），建議執行 bun scripts/heartbeat.js stop 清理',
  detail: `PID: ${pid}`,
}

// daemon 正常跑 → 不產生 finding（靜默通過）
```

**設計決策**：
- daemon 未跑不視為問題（只是 info），因為 heartbeat 是可選功能
- stale PID 才是需要注意的異常狀態（warning），代表上次 daemon 沒有正常結束
- daemon 正常跑時不輸出 finding，保持 check 的 passed=true

### 3. SKILL.md 更新（os-control）

需更新 Reference 索引的 `對應階段` 欄位：

| # | 說明 | 舊標記 | 新標記 |
|---|------|--------|--------|
| 2 | control.md | `P3.2` | `P3.4 (待建)` |
| 4 | realtime.md | `P3.4` | `P3.5 ✅` |

同時更新 OS 能力總覽章節，新增 P3.5 WebSocket 已完成說明。

**修改方式**：使用 `manage-component.js update skill os-control` + body 欄位（完整替換正文）

### 4. 整合測試（tests/integration/os-scripts.test.js）

**測試策略**：macOS only smoke test，呼叫真實 OS 能力，不 mock `execSync`

```javascript
// 每個測試的結構：
const { describe, test, expect, beforeAll } = require('bun:test');

// macOS guard（統一在 beforeAll 中 skip，而非每個 test 重複）
// 使用 platform check 而非 SKIP 環境變數

// Feature 1: screenshot.js smoke test
//   - takeScreenshot({ type: 'full' }) → ok=true, path 存在
//   - 測試後清理截圖檔案

// Feature 2: window.js smoke test
//   - getWindowList() → ok=true, windows 為陣列

// Feature 3: clipboard.js smoke test
//   - writeClipboard('test-value') → ok=true
//   - readClipboard() → ok=true, text='test-value'

// Feature 4: system-info.js smoke test
//   - getSystemInfo() → ok=true, platform='darwin'

// Feature 5: notification.js smoke test
//   - sendNotification({ title: 'Overtone Test' }) → ok=true
//   - （macOS 可能彈出通知，屬預期行為）

// Feature 6: fswatch.js smoke test
//   - watchPath('/tmp') → 回傳 watcher 物件，close() 不拋錯

// Feature 7: websocket.js smoke test
//   - 連線到不存在的 URL → ok=false, error='CONNECTION_FAILED'（驗證錯誤路徑正常）
```

**不測試的項目**：
- `process.js` — kill/spawn 操作對 CI 環境有副作用，只在 unit test 中 mock 測試
- 完整 E2E（截圖→理解→操作→驗證）— 依賴 P3.4 尚未完成

---

## 資料模型

無新增資料模型。

Finding 格式沿用現有 `{ check, severity, file, message, detail? }`，heartbeat 狀態 finding 的 `check` 值為 `'os-tools'`（與現有 checkOsTools findings 一致）。

---

## 檔案結構

```
修改的檔案：
  plugins/overtone/hooks/scripts/tool/pre-bash-guard.js
    -- 新增 5 條黑名單規則（14 → 19 條）
    -- 更新頂部規則清單說明

  plugins/overtone/scripts/health-check.js
    -- checkOsTools：tools 陣列加入 screencapture
    -- checkOsTools：新增 heartbeat daemon 狀態偵測邏輯
    -- 更新頂部函式說明（17 項偵測）[注意：check 數量不變，仍是 16 項，只是 os-tools 偵測能力擴展]

  plugins/overtone/skills/os-control/SKILL.md
    -- Reference 索引：control.md 改為 P3.4 (待建)，realtime.md 改為 P3.5 ✅
    -- OS 能力總覽：新增 P3.5 WebSocket 說明
    -- 必須透過 manage-component.js update skill os-control 修改

  tests/integration/pre-bash-guard.test.js
    -- 新增 5 個 deny 測試（對應新增的 5 條規則）
    -- 新增對應的 allow 測試（驗證不誤殺合法命令）

  tests/integration/health-check.test.js
    -- 更新 checkOsTools 相關測試（screencapture 偵測）
    -- 新增 heartbeat daemon 狀態 finding 格式驗證

新增的檔案：
  tests/integration/os-scripts.test.js
    -- 7 個 OS 腳本 smoke test（macOS only）
```

---

## 測試策略

### pre-bash-guard 測試更新（tests/integration/pre-bash-guard.test.js）

新增 deny 測試（5 條新規則）：
1. `sudo tee /etc/hosts` → deny（寫入系統設定目錄）
2. `osascript -e 'tell application "Finder" to delete file'` → deny（AppleScript 刪除操作）
3. `sudo chmod -R 777 /Applications` → deny（遞迴開放非暫存目錄全權限）
4. `launchctl unload /Library/LaunchDaemons/xxx.plist` → deny（停用系統服務）
5. `defaults delete com.apple.finder.plist` → deny（刪除系統偏好設定）

新增 allow 測試（防誤殺）：
1. `sudo tee /tmp/test.conf` → allow（/tmp 是暫存目錄，不應攔截）
2. `osascript -e 'tell application "System Events" to key code 49'` → allow（鍵盤操作，不含 delete）
3. `sudo chmod -R 777 /tmp/build` → allow（/tmp 開頭不攔截）

### health-check 測試（tests/integration/health-check.test.js）

現有測試用真實執行結果驗證，策略不變：
- screencapture 工具偵測：在 macOS 環境 `which screencapture` 應成功 → 不產生 finding
- heartbeat daemon finding 格式：若有 finding，必須符合 `{ check: 'os-tools', severity: 'info'|'warning', ... }` 格式
- check 數量仍為 16（不新增 check item）

### os-scripts 整合測試（tests/integration/os-scripts.test.js）

使用子進程模式（`Bun.spawnSync`）或直接 require 模組：
- **直接 require**：OS 腳本均為純 module（`module.exports`），可直接 require 後呼叫
- 非 macOS 平台 → `test.skip` 整個 describe block
- 每個 test 有自己的 cleanup 邏輯（截圖檔案刪除）

---

## 關鍵技術決策

### 決策 1：heartbeat daemon 偵測的 severity（回答 Open Question 1）

- **選擇**：daemon 未跑 = `info`，stale PID = `warning`，正常跑 = 無 finding
- **理由**：heartbeat 是可選功能（PM 規劃模式才需要），大多數工作階段不跑 daemon 是正常狀態，不應當 warning 警告。只有 stale PID 代表系統狀態不一致，才值得 warning。
- **heartbeat PID 路徑**：`paths.HEARTBEAT_PID_FILE`（`~/.overtone/heartbeat.pid`）— 已驗證於 heartbeat.js 和 paths.js

### 決策 2：os-scripts 整合測試的依賴注入策略（回答 Open Question 2）

- **選擇**：直接 require 模組，不注入 mock，直接呼叫真實系統能力
- **理由**：整合測試的目的是驗證「真實環境下能否正常運作」，mock 掉 execSync 就失去了 smoke test 的意義。macOS only guard 確保非 macOS CI 不跑這些測試。
- **風險管理**：screenshot test 產生的暫存截圖在 test cleanup 中刪除；notification test 可能彈出系統通知，屬預期行為

### 決策 3：pre-bash-guard 新規則範圍（回答 Open Question 3）

- **選擇**：只加 P3.1-P3.3 + P3.5 相關的危險模式；P3.4 的 cliclick 等操控工具不在此次範圍
- **理由**：P3.4 尚未完成，操控工具的危險使用模式尚未觀察到，過早加規則可能造成誤殺合法用途
- **pre-bash-guard 規則選擇原則**：只加「已知不可逆且 Agent 可能誤觸」的命令，不做預防性規則

### 決策 4：SKILL.md 更新方式

- **選擇**：使用 `manage-component.js update skill os-control` + body 欄位完整替換
- **理由**：SKILL.md 受 pre-edit guard 保護，直接 Edit 工具會被擋，必須走 manage-component.js。body 替換是唯一合法路徑。
- **注意**：developer 必須先 Read 現有正文，在正確位置修改後傳入完整 body

---

## 實作注意事項

1. **BLACKLIST 規則新增位置**：在 `// P3.3 新增` 區塊後新增 `// P3.6 新增：` 標記，保持版本追蹤可讀性
2. **checkOsTools 的 require 位置**：`paths.HEARTBEAT_PID_FILE` 需 require paths.js（已在 health-check.js 最頂層 require）— 確認再加入
3. **heartbeat process.kill(pid, 0) 的 try/catch**：沿用 heartbeat.js 中 `isProcessAlive` 的相同模式（permission denied 也算存活）
4. **os-scripts.test.js 檔案清理**：screenshot 測試用 `afterEach` 或 `afterAll` 刪除 `/tmp/overtone-screenshots/` 下產生的檔案
5. **health-check.test.js 數量測試**：現有測試驗證 `checks.length === 16`，此次不新增 check item，數量維持 16
