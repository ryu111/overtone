# Nova Control App — macOS Menu Bar 控制中心

## 動機（Why）

- **問題**：Nova 系統的管理操作散落在多個 CLI 指令和 Dashboard 網頁中。檢查進程狀態需 `curl /health`、查看待做需開 spec/、觸發任務需進入 Claude session。缺乏統一的常駐介面，使用者無法快速掌握全系統狀態或執行常用操作
- **目標**：提供 macOS Menu Bar 常駐 app，一眼看到全系統狀態，一鍵執行常用操作，將「查看 + 控制」的路徑從 5-10 步縮短到 1-2 步
- **不做的代價**：每次需要檢查 nova 狀態或觸發操作，都要開 Terminal 或瀏覽器。隨著專案和進程增多，管理成本線性增長

## 範圍

### In-scope

- macOS Menu Bar 常駐圖示 + 點擊展開 popover
- 全域開關：nova-server / 本地 LLM / 自驅模式 的 on/off toggle
- 多專案待做列表：從 nova-server API 拉取各專案 spec/待做/ 的任務，可執行/刪除
- 活躍 session 監控：顯示目前執行中的 Claude session（專案名 + 描述）
- 進程監控：顯示 nova-server 管理的進程狀態（nova-server、nova-llm、heartbeat）
- 快速指令按鈕：/ask、閉環、迭代、健檢
- 輸入框：自由文字指令送入活躍 session
- API 使用量顯示：5H / 7D 進度條
- 最近完成列表：顯示近期完成的任務
- Phase 0：nova-server API 補齊（/api/tasks、/api/spawn 等）

### Out-of-scope

- iOS / iPadOS 版本（Phase 2）
- Dashboard 完整功能搬遷（事件流、架構圖等仍留在 web Dashboard）
- 自定義主題 / 外觀設定
- App Store 發布（本地開發用，Xcode build 即可）
- 通知中心整合（Phase 2）
- 鍵盤快捷鍵全域綁定（Phase 2）

## 使用者故事

身為 Nova 使用者，我想要在 Menu Bar 一眼看到 nova-server 是否在跑、LLM 是否在線、有幾個活躍 session，以便隨時掌握系統狀態而不需切換到 Terminal。

身為 Nova 使用者，我想要點擊待做任務的「執行」按鈕就能觸發 Claude session 去做那件事，以便不需手動進入 Terminal 下指令。

身為 Nova 使用者，我想要一鍵開關自驅模式或本地 LLM，以便在需要時快速調整系統行為。

身為 Nova 使用者，我想要看到多專案的待做任務列表（overtone、kuji、novaplay 等），以便跨專案管理工作優先序。

## 行為規格

### 正常路徑

1. App 啟動 → Menu Bar 出現 Nova 圖示（lobster icon）
2. 點擊圖示 → 展開 popover（380px 寬，深色主題）
3. Popover 頂部顯示：NOVA 標題 + 運行狀態指示燈 + 模型標籤
4. 控制區：三行 toggle（nova-server / 本地 LLM / 自驅），各自 ON/OFF 狀態
5. 使用量區：5H USAGE + 7D USAGE 進度條
6. Session 區：列出各專案活躍 session（專案名 + 描述 + 狀態燈）
7. 待做區：水平可滾動的專案 chip tabs + 待做任務列表
8. 每個待做項有執行按鈕（觸發 /api/spawn）和刪除按鈕
9. 快速指令區：/ask、閉環、迭代、健檢 四個按鈕
10. 最近完成區：最近完成的任務 + 完成時間
11. 底部輸入框：自由文字指令

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| nova-server 未啟動 | Menu Bar 圖示變灰，popover 顯示「nova-server 離線」提示，toggle 全部 disabled |
| HTTP 請求逾時（3s） | 顯示上次成功的資料 + 「連線中斷」badge |
| API 回傳錯誤 | 對應區塊顯示錯誤訊息，其他區塊正常 |
| spawn session 失敗 | 按鈕回復可點擊狀態 + 顯示 error toast |
| LLM 不在線 | LLM toggle 顯示 OFF + 灰色指示燈 |

### 邊界條件

- 零待做任務 → 待做區顯示「無待做任務」placeholder
- 零活躍 session → session 區顯示各專案為灰色「無活躍 session」
- 超過 10 個待做任務 → 列表可垂直滾動，預設顯示 3 個
- 超過 5 個專案 → chip tabs 可水平滾動
- 快速連續點擊 toggle → debounce 500ms，防止重複請求

## 資料模型

### 輸入（來自 nova-server API）

| API | 回傳型別 | 說明 |
|-----|---------|------|
| GET /health | HealthResponse | 進程狀態、記憶體、模組清單 |
| GET /api/tasks | TasksResponse | 各專案待做/進行中/完成任務 |
| GET /api/sessions | SessionsResponse | 活躍 session 列表 |
| GET /api/llm | LLMStatus | 本地 LLM 狀態 |
| GET /processes | ProcessList | 進程列表（heartbeat 等） |
| GET /events | SSE stream | 即時事件流 |

### 輸出（操作請求）

| API | 方法 | 說明 |
|-----|------|------|
| POST /api/spawn | POST | 觸發 Claude session（帶專案名 + 任務描述） |
| POST /processes/:name/start | POST | 啟動進程 |
| POST /processes/:name/stop | POST | 停止進程 |
| POST /api/llm/toggle | POST | LLM 開關 |

### 本地儲存

- 格式：UserDefaults（SwiftUI 原生）
- 內容：popover 大小偏好、上次選取的專案 tab、window position
- 清理：隨 app 生命週期

## 介面契約

### 需補齊的 nova-server API

| 路徑 | 方法 | Request Body | Response | 說明 |
|------|------|-------------|----------|------|
| /api/tasks | GET | — | `{ projects: [{ name, cwd, tasks: [{ title, type, depth, created }] }] }` | 各專案待做任務 |
| /api/spawn | POST | `{ project, task, prompt }` | `{ ok, sessionId?, error? }` | 觸發 Claude session |
| /api/llm/toggle | POST | `{ enabled: boolean }` | `{ ok, status }` | LLM 開關 |

### 已有可直接使用的 API

- GET /health — 含 title 驗證、heartbeat 狀態、記憶體
- GET /processes — 進程列表
- POST /processes/:name/start|stop — 啟動/停止進程
- GET /api/sessions — session 列表
- GET /api/llm — LLM 健康狀態
- GET /events — SSE 事件流
- GET /api/tasks-todo — 簡化版待做（count + top）

## 非功能需求

| 維度 | 要求 |
|------|------|
| 啟動時間 | App 冷啟動 < 1s |
| 資料刷新 | 健康檢查每 5s 輪詢，待做任務每 30s 刷新，session 狀態用 SSE 即時 |
| 記憶體 | idle 時 < 50MB RSS |
| 系統要求 | macOS 14+ (Sonoma)，Apple Silicon + Intel |
| 安全 | 僅本機 HTTP（127.0.0.1），不暴露外部網路 |
| 字型 | JetBrains Mono（monospace 數值/標籤）+ Inter（一般文字） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | nova-server (port 3457) | 所有資料來源 + 操作端點 |
| 上游 | nova-llm (port 8000) | LLM 狀態透過 /api/llm 間接取得 |
| 上游 | spec-tasks.js | 任務列表的原始資料來源 |
| 下游 | 無 | App 是終端消費者，無下游依賴 |

## 驗收標準

- [ ] App 在 Menu Bar 顯示常駐圖示，點擊展開 popover
- [ ] popover UI 與 Pencil 設計稿 Version D 一致（配色、字型、佈局）
- [ ] nova-server ON/OFF toggle 可正確啟停進程
- [ ] 本地 LLM toggle 可正確啟停 LLM 服務
- [ ] 自驅模式 toggle 可正確啟停 heartbeat
- [ ] 待做任務列表正確顯示各專案任務，可水平切換專案
- [ ] 點擊任務「執行」按鈕成功觸發 Claude session
- [ ] 活躍 session 區正確顯示/隱藏 session
- [ ] SSE 連線正常，狀態即時更新
- [ ] nova-server 離線時 UI 優雅降級（灰色圖示、disabled controls）
- [ ] App 冷啟動 < 1s
- [ ] idle 記憶體 < 50MB

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| nova-server API 不穩定導致 App 卡頓 | 中 | 中 | 所有 HTTP 請求加 3s timeout + retry 1 次，失敗顯示 cache 資料 |
| SSE 連線中斷未重連 | 中 | 中 | 自動重連機制：斷線後 1s/2s/4s 指數退避重連 |
| SwiftUI Menu Bar app 的 popover 尺寸限制 | 低 | 中 | 測試實際 popover 最大高度，超過用 ScrollView |
| 字型 JetBrains Mono 未安裝 | 低 | 低 | App bundle 內嵌字型，不依賴系統安裝 |
| spawn session 被濫用 | 低 | 高 | debounce + 確認 dialog（「確定要執行？」） |
| macOS Sonoma 限制 Menu Bar 行為 | 低 | 中 | 使用 MenuBarExtra API（macOS 13+ 原生） |
