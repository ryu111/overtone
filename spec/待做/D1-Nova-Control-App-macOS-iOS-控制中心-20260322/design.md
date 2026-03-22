# Nova Control App — 技術設計

## 深度路由：D4
**理由**：全新 SwiftUI 專案 + nova-server API 補齊 + SSE 即時通訊 + 多模組 UI，設計決策密度極高（技術棧選擇、架構模式、狀態管理、API 設計），且 Phase 0 和 Phase 1 的子任務可大量並行。非 D3 因為不存在安全敏感操作但需要多 executor 並行。

---

## 技術摘要

- **方案**：原生 macOS SwiftUI Menu Bar App + nova-server REST API + SSE
- **理由**：SwiftUI 的 MenuBarExtra 是 macOS 13+ 原生組件，零額外依賴，啟動速度最快，記憶體最少。與 nova-server 透過 HTTP/SSE 溝通，保持鬆耦合
- **取捨**：僅支援 macOS（不跨平台），但 Phase 1 目標就是 macOS，跨平台是 Phase 2 考量

## 方案比較

| 維度 | A：原生 SwiftUI（選擇） | B：Electron + React | C：Tauri + Svelte |
|------|:--------------------:|:------------------:|:----------------:|
| 啟動速度 | <1s | 2-3s（Chromium 載入） | 1-2s |
| 記憶體 | ~30MB | ~200MB+ | ~80MB |
| Menu Bar 支援 | MenuBarExtra（原生） | Tray（需 hack） | System Tray（需額外設定） |
| UI 精緻度 | 高（原生動畫/blur） | 高（CSS 自由度） | 中 |
| 開發效率 | 中（Swift 學習曲線） | 高（熟悉 web stack） | 中 |
| 安裝包 | ~5MB | ~150MB | ~15MB |
| macOS 整合 | 原生（Keychain/通知/快捷鍵） | 差（Electron API 有限） | 中 |
| **結論** | 選擇：效能最優、原生整合最深、Menu Bar 支援最好 | 太重：記憶體和啟動速度不符預期 | 可行但 Menu Bar 整合弱於原生 |

## 模組介面

### 專案結構（~/projects/nova-control/）

| # | 檔案/目錄 | 行數 | 用途 |
|---|----------|------|------|
| 1 | NovaControl/App/NovaControlApp.swift | ~30 | App 入口 + MenuBarExtra 宣告 |
| 2 | NovaControl/Views/MenuBarView.swift | ~200 | Popover 主視圖容器 |
| 3 | NovaControl/Views/ControlSection.swift | ~80 | 三個 toggle 控制區 |
| 4 | NovaControl/Views/UsageSection.swift | ~50 | 5H/7D 使用量進度條 |
| 5 | NovaControl/Views/SessionSection.swift | ~80 | 活躍 session 列表 |
| 6 | NovaControl/Views/TaskSection.swift | ~120 | 專案 chip tabs + 待做列表 |
| 7 | NovaControl/Views/QuickActions.swift | ~60 | 快速指令按鈕列 |
| 8 | NovaControl/Views/InputSection.swift | ~50 | 底部輸入框 + 最近完成 |
| 9 | NovaControl/ViewModels/NovaViewModel.swift | ~200 | 主 ViewModel：狀態聚合 + API 呼叫 |
| 10 | NovaControl/Services/NovaAPIClient.swift | ~150 | HTTP REST client（URLSession） |
| 11 | NovaControl/Services/SSEClient.swift | ~100 | SSE 連線 + 自動重連 |
| 12 | NovaControl/Models/NovaModels.swift | ~100 | API response 型別定義（Codable） |
| 13 | NovaControl/Theme/NovaTheme.swift | ~60 | 配色/字型/間距常數 |
| 14 | NovaControl/Resources/Fonts/ | — | JetBrains Mono 字型檔（bundle 內嵌） |

### 修改檔案（nova-server 端）

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | ~/.claude/hooks/server.js | 新增 /api/tasks 路由（委派至 api-router.js） |
| 2 | ~/.claude/scripts/flow/api-router.js | 新增 /api/tasks、/api/spawn、/api/llm/toggle handler |
| 3 | ~/.claude/scripts/spec-tasks.js | 匯出 listTasks 已存在，新增 listAllProjectTasks() |

### API 設計

#### GET /api/tasks

```json
// Response
{
  "projects": [
    {
      "name": "overtone",
      "cwd": "/Users/sbu/projects/overtone",
      "tasks": [
        {
          "title": "D1-Learner-behaviors-噪音根因修復",
          "type": "修復",
          "depth": "D1",
          "created": "2026-03-22"
        }
      ]
    }
  ]
}
```

掃描策略：讀取 `~/.claude/projects/` 下所有專案設定，對每個有 spec/待做/ 的專案呼叫 `listTasks('待做')`。

#### POST /api/spawn

```json
// Request
{ "project": "overtone", "task": "D1-xxx", "prompt": "執行此任務" }

// Response
{ "ok": true, "pid": 12345 }
```

底層執行：`Bun.spawn(['claude', '-p', prompt], { cwd: projectDir, detached: true, env: { DISABLE_HOOKS: '1' } })`

#### POST /api/llm/toggle

```json
// Request
{ "enabled": true }

// Response
{ "ok": true, "status": "online" }
```

底層：enabled=true → `bash ~/.claude/scripts/start-local-models.sh start`；enabled=false → `bash ~/.claude/scripts/start-local-models.sh stop`

## 架構模式

```
┌─────────────────────────────────┐
│  macOS Menu Bar (SwiftUI)       │
│  ┌──────────┐  ┌──────────────┐ │
│  │ Views    │──│ NovaViewModel│ │
│  └──────────┘  └──────┬───────┘ │
│                       │         │
│  ┌────────────────────┴───────┐ │
│  │  NovaAPIClient  SSEClient │ │
│  └────────────┬───────────────┘ │
└───────────────┼─────────────────┘
                │ HTTP/SSE (127.0.0.1:3457)
┌───────────────┼─────────────────┐
│  nova-server  │                 │
│  ┌────────────┴───────────────┐ │
│  │  server.js + api-router.js │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

狀態管理：單一 `@Observable NovaViewModel`，Views 透過 `@Environment` 注入。不使用 Combine/RxSwift，用 Swift Concurrency（async/await + Task）管理非同步。

## 資料流

| 資料 | 取得方式 | 刷新頻率 | 快取策略 |
|------|---------|---------|---------|
| 健康狀態 | GET /health | 5s Timer | 快取上次成功結果 |
| 待做任務 | GET /api/tasks | 30s Timer | 快取上次成功結果 |
| Session 列表 | GET /api/sessions | 10s Timer + SSE 觸發 | 快取 |
| LLM 狀態 | GET /api/llm | 30s Timer | 快取 |
| 即時事件 | SSE /events | 持續連線 | 無快取 |

## UI 設計規格（來自 Pencil 設計稿 Version A/D）

| 元素 | 值 |
|------|------|
| Popover 寬度 | 380px |
| 背景色 | #0A0F1C |
| 強調色 | #22D3EE（cyan） |
| 警告色 | #C9A962（amber） |
| 分隔線 | #1E293B |
| 標題字型 | JetBrains Mono 14pt Bold, letter-spacing 3 |
| 標籤字型 | JetBrains Mono 12pt Medium |
| Section 標題 | JetBrains Mono 10pt SemiBold, letter-spacing 2, #64748B |
| 內文字型 | Inter 12-13pt |
| 狀態文字 | #94A3B8（muted）/ #475569（disabled） |
| 卡片背景 | #1E293B, cornerRadius 6 |
| 間距 | padding 20px 水平, 10-16px 垂直 |

## 執行步驟

### Phase 0：API 補齊（parallel，3 個子任務獨立）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 0a | api-router.js | /api/tasks：掃描所有專案的 spec/待做/ |
| 0b | api-router.js | /api/spawn：觸發 claude -p session |
| 0c | api-router.js | /api/llm/toggle：呼叫 start-local-models.sh |

注意：0a/0b/0c 都修改 api-router.js，但各自新增獨立的 if block，無互相依賴。建議同一個 executor 依序完成以避免 merge conflict。

### Phase 1：Xcode 專案骨架（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | NovaControlApp.swift | 建立 Xcode 專案 + MenuBarExtra 入口 |
| 1b | NovaTheme.swift | 配色/字型常數（從 Pencil 設計稿提取） |
| 1c | NovaModels.swift | API response Codable 型別定義 |

### Phase 2：網路層（parallel，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | NovaAPIClient.swift | URLSession HTTP client + timeout + retry |
| 2b | SSEClient.swift | SSE 連線 + 自動重連（指數退避） |

### Phase 3：ViewModel（sequential，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | NovaViewModel.swift | 狀態聚合 + Timer + SSE 訂閱 + API 呼叫封裝 |

### Phase 4：UI Views（parallel，依賴 Phase 3）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4a | MenuBarView.swift | Popover 主容器 + ScrollView |
| 4b | ControlSection.swift | Toggle 控制區 |
| 4c | UsageSection.swift | 使用量進度條 |
| 4d | SessionSection.swift | Session 列表 |
| 4e | TaskSection.swift | 專案 tabs + 待做列表 |
| 4f | QuickActions.swift | 快速指令按鈕 |
| 4g | InputSection.swift | 輸入框 + 最近完成 |

### Phase 5：整合測試 + 打磨（sequential，依賴 Phase 4）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 5a | 全部 | Xcode build + 實際測試所有功能 |
| 5b | 全部 | UI 微調對齊 Pencil 設計稿 |
| 5c | 字型 | bundle 內嵌 JetBrains Mono |

## Pre-mortem

**假設 Nova Control App 上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | SSE 連線頻繁斷開，UI 狀態延遲 | 中 | 中 | 指數退避重連（1s/2s/4s/8s），斷線時顯示 cache + badge |
| 2 | MenuBarExtra popover 高度超過螢幕 | 中 | 高 | 使用 ScrollView 包裹，設定最大高度 600px，內容超出可滾動 |
| 3 | spawn session 無法正確啟動 Claude | 中 | 高 | 先用 /health 確認 nova-server 在線，spawn 後 poll pid 確認存活 |
| 4 | 多專案任務掃描太慢 | 低 | 中 | 快取 + 30s 刷新，首次載入用 loading placeholder |
| 5 | JetBrains Mono 字型 bundle 失敗 | 低 | 低 | Info.plist 正確設定 ATSApplicationFontsPath，fallback 到系統 monospace |
| 6 | nova-server 重啟後 App 無法恢復 | 中 | 中 | 健康檢查 5s 輪詢自動偵測恢復，無需手動重連 |

## 測試策略

| 測試層級 | 驗收條件 |
|---------|---------|
| API 單元測試（Bun） | /api/tasks、/api/spawn、/api/llm/toggle 正確回應 |
| SwiftUI Preview | 每個 View 有 PreviewProvider，可在 Xcode Canvas 預覽 |
| 手動驗收 | Build + Run，驗證所有功能路徑 |
| 離線降級測試 | 停止 nova-server 後確認 UI 優雅降級 |

## 不做什麼

1. **不做複雜狀態管理框架**：單一 `@Observable` ViewModel 夠用，不引入 TCA/Redux
2. **不做離線模式**：App 完全依賴 nova-server，離線只顯示 cache + 離線提示
3. **不做 WebSocket 取代 SSE**：nova-server 已有 SSE 基礎設施，不需額外建 WebSocket
4. **不做自動更新機制**：本地開發用，Xcode rebuild 即可
5. **不做多 window**：只有一個 popover，不需 window management
