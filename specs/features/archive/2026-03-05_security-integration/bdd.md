# Feature: security-integration

## 概述

P3.6 安全整合：Guard 精鍊（14 → 19 條黑名單規則）、health-check 擴展（screencapture 偵測 + heartbeat daemon 狀態）、OS 腳本整合測試（7 個 smoke test）。

---

## Feature 1: pre-bash-guard 新規則 — 阻擋危險 OS 命令

### Scenario: 阻擋 sudo tee 寫入系統設定目錄

@smoke @security
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `sudo tee /etc/hosts`
THEN guard 回傳 permissionDecision: "deny"
AND permissionDecisionReason 包含 "寫入系統設定目錄"

### Scenario: 阻擋 osascript 執行刪除操作

@smoke @security
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `osascript -e 'tell application "Finder" to delete file "test"'`
THEN guard 回傳 permissionDecision: "deny"
AND permissionDecisionReason 包含 "AppleScript 刪除操作"

### Scenario: 阻擋 sudo chmod -R 777 非暫存目錄

@smoke @security
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `sudo chmod -R 777 /Applications`
THEN guard 回傳 permissionDecision: "deny"
AND permissionDecisionReason 包含 "遞迴開放非暫存目錄全權限"

### Scenario: 阻擋 launchctl unload 停用系統服務

@smoke @security
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `launchctl unload /Library/LaunchDaemons/com.apple.example.plist`
THEN guard 回傳 permissionDecision: "deny"
AND permissionDecisionReason 包含 "停用系統服務"

### Scenario: 阻擋 defaults delete 刪除系統偏好設定

@smoke @security
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `defaults delete com.apple.finder.plist`
THEN guard 回傳 permissionDecision: "deny"
AND permissionDecisionReason 包含 "刪除系統偏好設定"

---

## Feature 2: pre-bash-guard 防誤殺 — 允許合法命令

### Scenario: 允許 sudo tee 寫入暫存目錄（/tmp）

@security @edge-case
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `sudo tee /tmp/test.conf`
THEN guard 回傳 permissionDecision 不為 "deny"
AND 命令被放行

### Scenario: 允許 osascript 執行不含 delete 的鍵盤操作

@security @edge-case
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `osascript -e 'tell application "System Events" to key code 49'`
THEN guard 回傳 permissionDecision 不為 "deny"
AND 命令被放行

### Scenario: 允許 sudo chmod -R 777 暫存目錄（/tmp/build）

@security @edge-case
GIVEN pre-bash-guard 已載入 19 條黑名單規則
WHEN Claude 嘗試執行命令 `sudo chmod -R 777 /tmp/build`
THEN guard 回傳 permissionDecision 不為 "deny"
AND 命令被放行

---

## Feature 3: pre-bash-guard 既有規則不回歸

### Scenario: 既有 14 條規則仍正常阻擋（回歸驗證）

@regression @security
GIVEN pre-bash-guard 已載入 19 條黑名單規則（含既有 14 條）
WHEN Claude 嘗試執行以下任一命令：
  - `sudo rm -rf /`
  - `rm -rf /`
  - `mkfs /dev/sda`
  - `dd if=/dev/zero of=/dev/disk0`
  - `passwd root`
  - `chmod 777 /`
  - `visudo`
  - `iptables -F`
  - `ifconfig eth0 down`
  - `killall -9`
  - `kill -9 1`
  - `killall node`
  - `pkill node`
  - `kill -9 100 200`
THEN guard 回傳 permissionDecision: "deny"

---

## Feature 4: health-check checkOsTools — screencapture 偵測

### Scenario: macOS 環境中 screencapture 工具存在時不產生 finding

@smoke
GIVEN 系統為 macOS
AND screencapture 工具已安裝（which screencapture 成功）
WHEN 執行 checkOsTools()
THEN 回傳的 findings 中不含 check: "os-tools" + message 包含 "screencapture" 的項目
AND checkOsTools 整體通過（passed: true）

### Scenario: screencapture 工具不存在時產生 warning finding

@edge-case
GIVEN screencapture 工具不存在於系統 PATH 中
WHEN 執行 checkOsTools()
THEN 回傳的 findings 中含一個 `{ check: "os-tools", severity: "warning" }` 項目
AND message 包含 "screencapture"

### Scenario: screencapture finding 格式符合標準結構

@smoke
GIVEN 有任何 screencapture 相關的 finding 被產生
WHEN 取得該 finding 物件
THEN finding 具備欄位：check, severity, file, message
AND severity 值為 "info" 或 "warning"

---

## Feature 5: health-check checkOsTools — heartbeat daemon 狀態偵測

### Scenario: heartbeat daemon 未在執行時產生 info finding

@smoke
GIVEN heartbeat PID 檔案不存在（~/.overtone/heartbeat.pid 不存在）
WHEN 執行 checkOsTools()
THEN findings 中含一個項目，其中 `check: "os-tools"` 且 `severity: "info"`
AND message 包含 "heartbeat daemon 未在執行"
AND checkOsTools 整體仍通過（passed: true，info 不視為錯誤）

### Scenario: heartbeat daemon stale PID 時產生 warning finding

@edge-case @security
GIVEN heartbeat PID 檔案存在（~/.overtone/heartbeat.pid）
AND PID 檔案中記錄的 process 已不存在（process.kill(pid, 0) 拋出 ESRCH）
WHEN 執行 checkOsTools()
THEN findings 中含一個項目，其中 `check: "os-tools"` 且 `severity: "warning"`
AND message 包含 "stale PID"
AND detail 包含實際的 PID 數值

### Scenario: heartbeat daemon 正常執行時不產生 finding

@smoke
GIVEN heartbeat PID 檔案存在（~/.overtone/heartbeat.pid）
AND PID 檔案中記錄的 process 仍在執行（process.kill(pid, 0) 不拋出錯誤）
WHEN 執行 checkOsTools()
THEN findings 中不含 check: "os-tools" 且 message 包含 "heartbeat" 的 warning 或 error 項目

### Scenario: health-check 的 check 項目數量維持 16 項

@regression
GIVEN health-check.js 已完成 checkOsTools 擴展
WHEN 執行完整的 health-check
THEN checks 陣列長度仍為 16
AND 不新增額外的 check item（screencapture 和 heartbeat 屬於 checkOsTools 內部擴展）

---

## Feature 6: OS 腳本整合測試 — 7 個 smoke test（macOS only）

### Scenario: screenshot.js 截圖成功並產生檔案

@smoke @macos-only
GIVEN 系統為 macOS
AND screenshot.js 模組已載入
WHEN 呼叫 takeScreenshot({ type: 'full' })
THEN 回傳物件 ok === true
AND 回傳物件的 path 指向實際存在的截圖檔案
AND 測試結束後截圖檔案被清理

### Scenario: window.js 取得視窗清單成功

@smoke @macos-only
GIVEN 系統為 macOS
AND window.js 模組已載入
WHEN 呼叫 getWindowList()
THEN 回傳物件 ok === true
AND 回傳物件的 windows 為陣列型別

### Scenario: clipboard.js 寫入後可正確讀回

@smoke @macos-only
GIVEN 系統為 macOS
AND clipboard.js 模組已載入
WHEN 呼叫 writeClipboard('overtone-test-value')
THEN writeClipboard 回傳 ok === true
AND 隨後呼叫 readClipboard() 回傳 ok === true 且 text === 'overtone-test-value'

### Scenario: system-info.js 回傳平台資訊

@smoke @macos-only
GIVEN 系統為 macOS
AND system-info.js 模組已載入
WHEN 呼叫 getSystemInfo()
THEN 回傳物件 ok === true
AND 回傳物件的 platform === 'darwin'

### Scenario: notification.js 發送通知不拋錯

@smoke @macos-only
GIVEN 系統為 macOS
AND notification.js 模組已載入
WHEN 呼叫 sendNotification({ title: 'Overtone Test', message: 'smoke test' })
THEN 回傳物件 ok === true
AND 不拋出例外（macOS 可能彈出系統通知，屬預期行為）

### Scenario: fswatch.js 監控路徑後可正常關閉

@smoke @macos-only
GIVEN 系統為 macOS
AND fswatch.js 模組已載入
WHEN 呼叫 watchPath('/tmp')
THEN 回傳 watcher 物件（非 null、非 undefined）
AND 呼叫 watcher.close() 不拋出任何例外

### Scenario: websocket.js 連線到無效 URL 回傳錯誤而非拋錯

@smoke @macos-only @error-case
GIVEN 系統為 macOS
AND websocket.js 模組已載入
WHEN 呼叫連線到不存在的 URL（如 ws://127.0.0.1:19999/invalid）
THEN 回傳物件 ok === false
AND 回傳物件的 error 欄位為 'CONNECTION_FAILED' 或含錯誤描述字串
AND 不拋出未捕捉的例外

---

## Feature 7: 非 macOS 環境跳過 OS smoke test

### Scenario: 非 macOS 平台上 OS 整合測試自動跳過

@edge-case
GIVEN 系統平台不為 macOS（process.platform !== 'darwin'）
WHEN 執行 os-scripts.test.js 測試套件
THEN 所有 OS smoke test 被標記為 skip
AND 測試套件整體不回報失敗

---

## 覆蓋摘要

| Feature | Scenarios | 類型 |
|---------|-----------|------|
| 1. guard 新規則 deny | 5 | happy path |
| 2. guard 防誤殺 allow | 3 | edge case |
| 3. guard 既有規則回歸 | 1 | regression |
| 4. checkOsTools screencapture | 3 | happy + edge + format |
| 5. checkOsTools heartbeat | 4 | happy + edge + error + regression |
| 6. OS smoke test | 7 | smoke (macOS only) |
| 7. 非 macOS skip | 1 | edge case |
| **總計** | **24** | |
