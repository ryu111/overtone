# Feature: P3.1 感知層（Perception Layer）

P3.1 提供 macOS 環境下的感知能力，包含截圖擷取（screenshot.js）和視窗/進程管理（window.js），
以及 os-control skill 的 perception.md reference 文件，讓 agent 能夠「看見」螢幕狀態。

---

## Feature: 全螢幕截圖（captureFullScreen）

### Scenario: 在 macOS 上成功截取全螢幕
  Given 執行平台為 macOS（darwin）
  And Screen Recording 權限已授予
  When 呼叫 `captureFullScreen()` 不傳入 outputPath
  Then 回傳 `{ ok: true, path, type, timestamp }`
  And `type` 為 `"full"`
  And `path` 符合格式 `/tmp/overtone-screenshots/screenshot-full-YYYYMMDD-HHmmss-SSS.png`
  And `timestamp` 為 ISO 8601 格式字串

### Scenario: 使用自訂 outputPath 截取全螢幕
  Given 執行平台為 macOS（darwin）
  And Screen Recording 權限已授予
  When 呼叫 `captureFullScreen({ outputPath: '/tmp/test.png' })`
  Then 回傳 `{ ok: true, path: '/tmp/test.png', type: 'full', timestamp }`

### Scenario: Screen Recording 權限未授予時 captureFullScreen 回傳 PERMISSION_DENIED
  Given 執行平台為 macOS（darwin）
  And Screen Recording 權限未授予（screencapture 指令失敗）
  When 呼叫 `captureFullScreen()`
  Then 回傳 `{ ok: false, error: 'PERMISSION_DENIED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 captureFullScreen 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin（如 linux 或 win32）
  When 呼叫 `captureFullScreen()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不呼叫任何系統指令
  And 不拋出例外

---

## Feature: 區域截圖（captureRegion）

### Scenario: 指定有效區域座標成功截圖
  Given 執行平台為 macOS（darwin）
  And Screen Recording 權限已授予
  When 呼叫 `captureRegion({ x: 100, y: 200, width: 800, height: 600 })`
  Then 回傳 `{ ok: true, path, type: 'region', timestamp }`
  And screencapture 指令包含 `-R 100,200,800,600` 參數

### Scenario: region 缺少必要欄位時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `captureRegion({ x: 100, y: 200 })`（缺少 width 和 height）
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何截圖指令

### Scenario: screencapture 指令執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And Screen Recording 權限已授予
  And 注入的 execSync 會拋出例外
  When 呼叫 `captureRegion({ x: 0, y: 0, width: 100, height: 100 })`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

---

## Feature: 視窗截圖（captureWindow）

### Scenario: 使用有效 windowId 成功截圖
  Given 執行平台為 macOS（darwin）
  And Screen Recording 權限已授予
  When 呼叫 `captureWindow(12345)`
  Then 回傳 `{ ok: true, path, type: 'window', timestamp }`
  And screencapture 指令包含 `-l 12345` 參數

### Scenario: windowId 為 null 或 undefined 時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `captureWindow(null)` 或 `captureWindow(undefined)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何截圖指令

---

## Feature: Screen Recording 權限偵測（checkPermission）

### Scenario: Screen Recording 已授予時回傳 hasPermission true
  Given 執行平台為 macOS（darwin）
  And screencapture 指令可正常執行
  When 呼叫 `checkPermission()`
  Then 回傳 `{ ok: true, hasPermission: true }`

### Scenario: Screen Recording 未授予時回傳 hasPermission false
  Given 執行平台為 macOS（darwin）
  And screencapture 指令執行失敗或輸出大小為 0
  When 呼叫 `checkPermission()`
  Then 回傳 `{ ok: true, hasPermission: false }`
  And 不回傳 PERMISSION_DENIED 錯誤（checkPermission 本身不需要此錯誤）

### Scenario: 非 macOS 平台時 checkPermission 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `checkPermission()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`

---

## Feature: 進程列表（listProcesses）

### Scenario: 成功列出運行中的進程
  Given 執行平台為 macOS（darwin）
  And osascript 可正常執行並回傳進程資訊
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: true, processes: [...] }`
  And `processes` 為陣列，每個元素包含 `pid`（number）、`name`（string）

### Scenario: 非 macOS 平台時 listProcesses 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不呼叫任何系統指令

### Scenario: osascript 回傳格式異常時回傳 OSASCRIPT_PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳無法解析的輸出（如空字串或亂碼）
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: false, error: 'OSASCRIPT_PARSE_ERROR', message: <非空字串> }`

---

## Feature: 視窗列表（listWindows）

### Scenario: 成功列出指定 app 的視窗
  Given 執行平台為 macOS（darwin）
  And Accessibility 權限已授予
  And Safari 有 2 個視窗開啟
  When 呼叫 `listWindows('Safari')`
  Then 回傳 `{ ok: true, windows: [...] }`
  And `windows` 為陣列，長度為 2
  And 每個元素包含 `title`（string）、`app`（string）

### Scenario: Accessibility 未授予時 listWindows 回傳 PERMISSION_DENIED
  Given 執行平台為 macOS（darwin）
  And Accessibility 權限未授予
  When 呼叫 `listWindows('Safari')`
  Then 回傳 `{ ok: false, error: 'PERMISSION_DENIED', message: <非空字串> }`
  And 不拋出例外

### Scenario: osascript 輸出格式異常時回傳 OSASCRIPT_PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And Accessibility 權限已授予
  And 注入的 execSync 回傳無法解析的視窗資訊格式
  When 呼叫 `listWindows('Safari')`
  Then 回傳 `{ ok: false, error: 'OSASCRIPT_PARSE_ERROR', message: <非空字串> }`

---

## Feature: 聚焦應用程式（focusApp）

### Scenario: 成功將指定 app 帶到前景
  Given 執行平台為 macOS（darwin）
  And Safari 已在執行中
  And osascript 可正常執行 activate 指令
  When 呼叫 `focusApp('Safari')`
  Then 回傳 `{ ok: true }`

### Scenario: osascript 執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `focusApp('NonExistentApp')`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

---

## Feature: 取得前景 App（getFrontApp）

### Scenario: 成功取得當前前景應用程式
  Given 執行平台為 macOS（darwin）
  And Safari 正在前景
  And osascript 可正常執行
  When 呼叫 `getFrontApp()`
  Then 回傳 `{ ok: true, app: 'Safari', window: <字串或 null> }`

### Scenario: osascript 回傳格式異常時回傳 OSASCRIPT_PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳空字串
  When 呼叫 `getFrontApp()`
  Then 回傳 `{ ok: false, error: 'OSASCRIPT_PARSE_ERROR', message: <非空字串> }`

---

## Feature: Accessibility 權限偵測（checkAccessibility）

### Scenario: Accessibility 已授予時回傳 hasPermission true
  Given 執行平台為 macOS（darwin）
  And Accessibility 權限已授予（osascript 偵測成功）
  When 呼叫 `checkAccessibility()`
  Then 回傳 `{ ok: true, hasPermission: true }`

### Scenario: Accessibility 未授予時回傳 hasPermission false
  Given 執行平台為 macOS（darwin）
  And Accessibility 權限未授予（osascript 偵測失敗）
  When 呼叫 `checkAccessibility()`
  Then 回傳 `{ ok: true, hasPermission: false }`

### Scenario: 非 macOS 平台時 checkAccessibility 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `checkAccessibility()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`

---

## Feature: os-control perception.md Reference 文件

### Scenario: perception.md 包含截圖 API 完整說明
  Given `plugins/overtone/skills/os-control/references/perception.md` 已填充（非佔位符）
  When 讀取該文件
  Then 文件包含 `captureFullScreen`、`captureRegion`、`captureWindow`、`checkPermission` 的說明
  And 說明包含各函式的參數格式與回傳值格式

### Scenario: perception.md 包含視窗 API 完整說明
  Given `plugins/overtone/skills/os-control/references/perception.md` 已填充
  When 讀取該文件
  Then 文件包含 `listProcesses`、`listWindows`、`focusApp`、`getFrontApp`、`checkAccessibility` 的說明

### Scenario: perception.md 包含視覺分析結構化模板
  Given `plugins/overtone/skills/os-control/references/perception.md` 已填充
  When 讀取該文件
  Then 文件包含供 agent 使用的視覺分析模板（如「截圖後分析步驟」或「結構化輸出格式」）

### Scenario: os-control SKILL.md 的 Reference 索引包含 perception.md 路徑
  Given `plugins/overtone/skills/os-control/SKILL.md` 已更新
  When 讀取該文件的 Reference 索引表格
  Then 表格中包含指向 `perception.md` 的項目
  And 該項目不是佔位符狀態（不含「將在 P3.1 階段填充」文字）
