# Nova Control App — 任務拆分

## 依賴分析

```
Phase 0（API 補齊）    Phase 1（Xcode 骨架）
    ↓                      ↓
    └──────── Phase 2（網路層）← 依賴 Phase 0 API 介面 + Phase 1 型別定義
                   ↓
             Phase 3（ViewModel）
                   ↓
             Phase 4（UI Views）
                   ↓
             Phase 5（整合測試）
```

Phase 0 和 Phase 1 **可並行**（各自獨立：API 是 Bun/JS，骨架是 Swift）。
Phase 2 依賴 Phase 0（需知道 API response 格式）+ Phase 1（需要 Models 型別）。

---

## Phase 0：nova-server API 補齊（parallel with Phase 1）

### T0.1 — GET /api/tasks：多專案待做任務（sequential）
- **檔案**：`~/.claude/scripts/flow/api-router.js`、`~/.claude/scripts/spec-tasks.js`
- **內容**：
  1. 在 spec-tasks.js 新增 `listAllProjectTasks()` — 掃描 `~/.claude/projects/` 下所有專案設定，找到各專案的 spec 目錄，呼叫 `listTasks('待做')`
  2. 在 api-router.js 新增 `/api/tasks` handler — 呼叫 `listAllProjectTasks()` 回傳 JSON
  3. 回傳格式：`{ projects: [{ name, cwd, tasks: [{ title, type, depth, created }] }] }`
- **驗收**：`curl http://localhost:3457/api/tasks` 回傳正確的多專案任務列表
- **執行者**：executor

### T0.2 — POST /api/spawn：觸發 Claude session（sequential）
- **檔案**：`~/.claude/scripts/flow/api-router.js`
- **內容**：
  1. 接收 `{ project, task, prompt }` body
  2. 從 project 名解析 cwd（透過 `~/.claude/projects/` 設定）
  3. `Bun.spawn(['claude', '-p', prompt], { cwd, detached: true, env: { ...process.env, DISABLE_HOOKS: '1' } })`
  4. 回傳 `{ ok: true, pid }`
  5. 安全防護：debounce 5s（同一 project 不可連續 spawn）
- **驗收**：`curl -X POST -d '{"project":"overtone","task":"test","prompt":"echo hello"}' http://localhost:3457/api/spawn` 成功觸發
- **執行者**：executor

### T0.3 — POST /api/llm/toggle：LLM 開關（sequential）
- **檔案**：`~/.claude/scripts/flow/api-router.js`
- **內容**：
  1. 接收 `{ enabled: boolean }` body
  2. enabled=true → `Bun.spawn(['bash', startScript, 'start'])`
  3. enabled=false → `Bun.spawn(['bash', startScript, 'stop'])`
  4. 等待完成後回傳 `{ ok, status }`
- **驗收**：toggle 後 `/api/llm` 狀態正確反映
- **執行者**：executor

> T0.1/T0.2/T0.3 都修改 api-router.js。雖然新增獨立 if block，為避免 merge conflict，建議同一 executor 依序完成。

### T0.4 — API 單元測試（依賴 T0.1-T0.3）
- **檔案**：`~/projects/overtone/tests/unit/api-tasks.test.js`
- **內容**：測試 /api/tasks 回傳格式、/api/spawn 參數驗證、/api/llm/toggle 狀態切換
- **驗收**：`bun test tests/unit/api-tasks.test.js` 通過
- **執行者**：executor

---

## Phase 1：Xcode 專案骨架（parallel with Phase 0）

### T1.1 — 建立 Xcode 專案 + MenuBarExtra 入口（sequential）
- **檔案**：`~/projects/nova-control/` 整個專案目錄
- **內容**：
  1. 建立 Swift Package 或 Xcode project（macOS App，SwiftUI lifecycle）
  2. `NovaControlApp.swift`：使用 `MenuBarExtra` API
  3. 設定 `LSUIElement = YES`（無 Dock icon）
  4. 設定 deployment target macOS 14.0
  5. 空的 `MenuBarView` placeholder
- **驗收**：Xcode Build 成功，Menu Bar 出現圖示，點擊展開空白 popover
- **執行者**：executor

### T1.2 — Theme 常數 + 字型（依賴 T1.1）
- **檔案**：`NovaTheme.swift`、`Resources/Fonts/`
- **內容**：
  1. 從 Pencil 設計稿提取所有色碼定義為 SwiftUI `Color` 常數
  2. 定義字型常數（JetBrains Mono 各種 weight + Inter）
  3. 下載 JetBrains Mono 字型檔放入 Resources/Fonts/
  4. Info.plist 設定 `ATSApplicationFontsPath`
- **驗收**：Preview 中可使用自定義字型和配色
- **執行者**：executor

### T1.3 — API Models 型別定義（parallel with T1.2）
- **檔案**：`NovaModels.swift`
- **內容**：
  1. `HealthResponse`：status, pid, title, uptime, modules, memory, heartbeat, activeAgents
  2. `TasksResponse`：projects 陣列（name, cwd, tasks）
  3. `SessionInfo`：name, status, detail, startedAt
  4. `LLMStatus`：status, model
  5. `SpawnRequest/Response`
  6. 全部 Codable
- **驗收**：可 decode nova-server 實際回傳的 JSON
- **執行者**：executor

---

## Phase 2：網路層（parallel，依賴 Phase 0 + Phase 1）

### T2.1 — NovaAPIClient（sequential）
- **檔案**：`NovaAPIClient.swift`
- **內容**：
  1. base URL: `http://127.0.0.1:3457`
  2. GET 方法：generic `fetch<T: Decodable>(path:) async throws -> T`
  3. POST 方法：generic `post<T: Codable, R: Decodable>(path:body:) async throws -> R`
  4. timeout: 3 秒
  5. retry: 1 次（間隔 500ms）
  6. 錯誤型別：`NovaAPIError`（connectionFailed, timeout, serverError, decodingFailed）
- **驗收**：可成功呼叫 /health 並 decode 為 HealthResponse
- **執行者**：executor

### T2.2 — SSEClient（parallel with T2.1）
- **檔案**：`SSEClient.swift`
- **內容**：
  1. 連線 `http://127.0.0.1:3457/events`
  2. 解析 SSE `data:` 行為 JSON event
  3. 自動重連：斷線後指數退避（1s/2s/4s/8s，上限 30s）
  4. 透過 AsyncStream 或 callback 傳遞事件給 ViewModel
  5. 連線狀態 enum：connecting, connected, disconnected, reconnecting
- **驗收**：連線 nova-server SSE，收到事件並正確解析
- **執行者**：executor

---

## Phase 3：ViewModel（sequential，依賴 Phase 2）

### T3.1 — NovaViewModel（sequential）
- **檔案**：`NovaViewModel.swift`
- **內容**：
  1. `@Observable class NovaViewModel`
  2. 狀態屬性：health, tasks, sessions, llmStatus, isConnected, selectedProject
  3. Timer 管理：健康 5s、任務 30s、session 10s
  4. SSE 訂閱：收到事件時觸發對應刷新
  5. 操作方法：toggleServer(), toggleLLM(), toggleSelfDrive(), spawnTask(), deleteTask()
  6. 離線處理：請求失敗時保留 cache，標記 isConnected = false
  7. debounce：toggle 操作 500ms debounce
- **驗收**：ViewModel 正確管理狀態，API 呼叫成功觸發 UI 更新
- **執行者**：executor

---

## Phase 4：UI Views（parallel，依賴 Phase 3）

### T4.1 — MenuBarView 主容器
- **檔案**：`MenuBarView.swift`
- **內容**：ScrollView 容器 + 各 Section 排列 + 分隔線 + 離線 overlay
- **驗收**：popover 380px 寬，深色背景，sections 正確排列
- **執行者**：executor

### T4.2 — ControlSection（toggle 控制區）
- **檔案**：`ControlSection.swift`
- **內容**：三行 toggle（nova-server / 本地 LLM / 自驅），ON/OFF 指示燈 + 標籤
- **驗收**：toggle 操作觸發 API 呼叫，狀態即時反映
- **執行者**：executor

### T4.3 — UsageSection（使用量區）
- **檔案**：`UsageSection.swift`
- **內容**：5H USAGE + 7D USAGE 兩個進度條（RoundedRectangle + overlay）
- **驗收**：進度條比例正確，顏色（cyan/amber）正確
- **執行者**：executor

### T4.4 — SessionSection（session 區）
- **檔案**：`SessionSection.swift`
- **內容**：各專案活躍 session 列表（dot + name + description）
- **驗收**：活躍/非活躍用不同顏色區分，SSE 事件觸發即時更新
- **執行者**：executor

### T4.5 — TaskSection（待做區）
- **檔案**：`TaskSection.swift`
- **內容**：水平 ScrollView 專案 chip tabs + 垂直待做列表（checkbox + 名稱 + 執行/刪除按鈕）
- **驗收**：切換 tab 更新列表，執行按鈕觸發 spawn，預設顯示 3 個可滾動
- **執行者**：executor

### T4.6 — QuickActions + InputSection
- **檔案**：`QuickActions.swift`、`InputSection.swift`
- **內容**：四個快速指令按鈕（/ask、閉環、迭代、健檢）+ 底部 TextField + 最近完成列表
- **驗收**：按鈕點擊觸發對應操作，TextField 送出指令
- **執行者**：executor

> T4.1-T4.6 修改不同檔案且僅依賴 NovaViewModel 介面，可由多個 executor 並行完成。但考慮到 SwiftUI Preview 需要整體編譯，建議 2-3 個 executor 分組。

---

## Phase 5：整合測試 + 打磨（sequential，依賴 Phase 4）

### T5.1 — 全功能手動驗收
- 所有 toggle 正確操作
- 待做任務 CRUD
- SSE 即時更新
- 離線降級
- 記憶體 < 50MB
- 啟動 < 1s

### T5.2 — UI 對齊設計稿
- 逐元素比對 Pencil 設計稿配色、字型、間距
- 調整不一致的地方

---

## 並行策略摘要

```
時間軸 →

Phase 0 (JS/Bun)     ▓▓▓▓▓▓▓▓▓▓
Phase 1 (Swift/Xcode) ▓▓▓▓▓▓▓▓▓▓
                              ↓
Phase 2 (Network)       ▓▓▓▓▓▓▓
                              ↓
Phase 3 (ViewModel)       ▓▓▓▓
                              ↓
Phase 4 (UI Views)        ▓▓▓▓▓▓▓▓
                                ↓
Phase 5 (Polish)            ▓▓▓▓
```

Phase 0 + Phase 1 完全並行（不同語言/專案）
Phase 2 的兩個子任務（APIClient + SSEClient）並行
Phase 4 的 6 個 View 可 2-3 組並行

## 預估

| Phase | 子任務數 | 預估時間 |
|-------|:-------:|:--------:|
| Phase 0 | 4 | 20 分鐘 |
| Phase 1 | 3 | 20 分鐘 |
| Phase 2 | 2 | 15 分鐘 |
| Phase 3 | 1 | 15 分鐘 |
| Phase 4 | 6 | 30 分鐘 |
| Phase 5 | 2 | 15 分鐘 |
| **合計** | **18** | **~2 小時**（含並行優化） |
