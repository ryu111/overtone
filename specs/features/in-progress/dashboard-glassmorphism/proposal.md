# Proposal: Dashboard Glassmorphism 重設計

`dashboard-glassmorphism`

## 需求背景（Why）

- **問題**：現有 Dashboard 使用基本 Dark Theme（`#0d1117` 平面背景、無玻璃態效果、pipeline 為簡單橫排無並行分支顯示、無 confetti 慶祝、無 Agent 語義色燈號）
- **目標**：全面升級為 Glassmorphism 風格，提供 Pipeline 並行分支視覺化、Agent 燈號脈衝、Timeline 動畫進場、History Tab 改版、workflow:complete confetti 慶祝
- **優先級**：設計已完成（`docs/design-system.md` + `docs/design-mockup.html` 已確認），直接進入實作

## 使用者故事

```
身為 Overtone 使用者
我想要看到美觀且資訊豐富的 Dashboard
以便即時監控工作流進度、Agent 執行狀態、並在完成時獲得視覺回饋
```

## 範圍邊界

### 在範圍內（In Scope）

- CSS 完整替換（`main.css` → Glassmorphism 風格）
- Session 頁面（`session.html`）HTML 結構重寫（Header、Tab Bar、Pipeline 並行分支、Agent 燈號、Timeline、Stats）
- 首頁（`index.html`）HTML 結構更新（Header、History 卡片樣式）
- Pipeline 並行分支視覺化（從 `/api/registry` 讀取 `parallelGroupDefs` + workflow `parallelGroups`）
- Agent 語義色燈號（8 色 × 4 狀態）
- Timeline 事件進場動畫 + 分類色條
- Confetti 慶祝動畫（workflow:complete SSE 事件觸發）
- 後端 API 擴充：`/api/registry` 增加 `parallelGroupDefs` + workflow `parallelGroups` 欄位
- 響應式設計（3 個斷點）
- 無障礙（`prefers-reduced-motion`、對比度 >= 4.5:1、focus 狀態）
- 既有測試更新 + 新增前端行為相關 API 測試

### 不在範圍內（Out of Scope）

- 引入 React/Vue/build step 框架（維持 htmx + Alpine.js）
- 新增後端功能端點（只擴充現有 `/api/registry`）
- 新增 Telegram 通知（現有功能不變）
- 重構後端架構（server.js / dashboard-adapter.js / sessions.js 核心邏輯不變）
- 行動裝置原生 App

## 子任務清單

### Phase 1: 基礎層（CSS + 後端 API）

1. **CSS 設計系統替換**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/styles/main.css`
   - 說明：完整替換現有 CSS，包含 CSS 變數（design tokens）、Glassmorphism 基礎效果、所有 Keyframes 動畫、元件樣式、響應式斷點、無障礙保護（`prefers-reduced-motion`）。參考 `docs/design-system.md` 和 `docs/design-mockup.html`

2. **後端 API 擴充：/api/registry 增加並行群組資料**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/server.js`
   - 說明：在 `/api/registry` response 中增加 `parallelGroupDefs`（全域並行群組成員定義）和在 `workflows` 各條目中增加 `parallelGroups` 欄位，讓前端能靜態知道哪些 stage 屬於並行群組

### Phase 2: 前端頁面重寫（可與 Phase 1 的 API 並行，CSS 完成後開始）

3. **Session 頁面重寫 — Header + Tab Bar + Stats**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/session.html`
   - 說明：重寫 Header（Logo icon + session badge + workflow badge + 連線燈號）、Tab Bar（sticky blur、active 底線紫色）、Stats 卡片（glass surface 風格）

4. **Session 頁面重寫 — Pipeline 並行分支**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/session.html`
   - 說明：Pipeline 從簡單 `x-for` 橫排改為識別並行群組並以 `.parallel-group` 垂直分支呈現。從 `/api/registry` 獲取並行群組定義，渲染時動態判斷哪些 stage 屬於同一個並行群組。Stage 卡片 4 狀態樣式對齊設計系統

5. **Session 頁面重寫 — Agent 燈號系統**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/session.html`
   - 說明：Agent 區塊改為包含語義色燈號（`.agent-dot`）的卡片，4 種狀態（standby/active/completed/failed），active 帶對應色脈衝動畫。左側 3px 色條。顯示 agent model badge

6. **Session 頁面重寫 — Timeline 事件流**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/session.html`
   - 說明：Timeline 包裹在 `.timeline-container` 玻璃容器中，事件新增 `timeline-slide` 進場動畫，9 種分類色條（含 grader），filter bar 使用 `.filter-chip` 風格

7. **Session 頁面重寫 — Confetti 慶祝動畫**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/session.html`
   - 說明：SSE 收到 `workflow:complete` 事件時，以 JavaScript 動態生成 confetti 粒子（8 色、CSS animation、`confettiPlayed` flag 防重複）。使用 `prefers-reduced-motion` 檢查

8. **首頁重寫 — History 卡片 + Header**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/web/index.html`、`plugins/overtone/scripts/server.js`（`renderSessionCards` 函式）
   - 說明：首頁 Header 升級為 Glassmorphism 風格。Session 卡片改為 `.history-card` 設計（hover 上浮、status pill、glass surface）。`renderSessionCards()` 需同步更新 HTML 結構

### Phase 3: 測試

9. **更新既有 server.test.js 測試 + 新增 API 測試**
   - 負責 agent：developer
   - 相關檔案：`tests/integration/server.test.js`
   - 說明：更新 `/api/registry` 測試確認新增的 `parallelGroupDefs` 和 `workflows[].parallelGroups` 欄位。確認既有 API 測試全部通過

10. **跑完整測試套件驗證無 regression**
    - 負責 agent：developer
    - 說明：`bun test` 全部通過，確認 CSS/HTML 變更沒有破壞既有功能

## 開放問題

- **並行群組 Pipeline 渲染邏輯**：前端如何判斷連續的 stage 屬於同一並行群組？建議 architect 設計資料結構和渲染演算法（workflow stages 序列 + parallelGroupDefs 映射 → 分段渲染）
- **Alpine.js state 結構擴充**：新增的 `confettiPlayed`、`parallelGroupDefs`、`getAgentStatus()`、`getAgentPulseClass()` 等 computed/method 如何組織？需要 architect 確認是否需拆分模組
- **CSS 檔案大小**：mockup 的 CSS 約 1000+ 行，main.css 從 ~674 行大幅增加。是否需要拆分為多個 CSS 檔案（如 `variables.css` + `animations.css` + `components.css`）？
