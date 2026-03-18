# Dashboard 資訊架構重組 — 任務分解

## 依賴分析

```
Phase 1（並行）: T1 + T2（HTML/CSS 骨架，操作不同檔案，無依賴）
Phase 2（並行）: T3 + T4（JS 邏輯，操作不同檔案，依賴 Phase 1 的 DOM 結構）
Phase 3（並行）: T5 + T6 + T7（去重+清理，操作不同檔案，依賴 Phase 2）
Phase 4（串行）: T8（驗收，依賴全部完成）
```

---

## Phase 1：HTML + CSS 骨架（並行）

### T1：client.html Tab 重組

**檔案**：`~/.claude/scripts/flow/client.html`
**執行者**：executor

變更內容：
1. Tab Bar 從 8 Tab 改為 5 Tab
   - 移除 `data-tab="quality"`、`data-tab="monitor"`、`data-tab="logs"`、`data-tab="loop"` 四個 Tab
   - 新增 `data-tab="ops"` Tab（標題「營運」）
   - 保留 `data-tab="graph"`、`data-tab="flow"`、`data-tab="events"`、`data-tab="system"`
   - 移除第二個 `<span class="tab-sep">`（品質和系統之間），保留第一個（事件記錄和營運之間）
   - Tab title 更新快捷鍵提示為 1-5

2. 新增營運 Panel（`ops-panel`）
   - 包含 `.sub-tabs` 列：品質 / 監控（active） / 日誌
   - 包含三個 `.sub-panel`：
     - `sub-quality`：搬入原 `quality-panel` 的所有子元素（保留所有 ID）
     - `sub-monitor`（active）：搬入原 `monitor-panel` 的所有子元素（保留所有 ID）
     - `sub-logs`：搬入原 `logs-panel` 的所有子元素（保留所有 ID）

3. 重組系統 Panel（`system-panel`）
   - 外層包一個 `.sys-sections` 容器
   - 4 個 `<section>` 區塊（見 design.md HTML 結構設計）
   - 區塊 A「即時狀態」：心跳狀態 + 服務狀態 + 循環流程
   - 區塊 B「資源監控」：Memory 趨勢 + Server 資訊 + 模組
   - 區塊 C「自驅成果」：最近自驅成果 + 統計 + Notion 待做
   - 區塊 D「管理工具」：用 `<details>` 包裝，含 Hook Errors 摘要 + Lock 管理 + Anomalies + 操作
   - 新 ID：`sys-loop-steps`、`sys-loop-log`、`sys-loop-stats`、`sys-loop-notion`、`sys-admin-badge`

4. 刪除原獨立 Panel
   - 刪除 `quality-panel`（已搬入 ops-panel > sub-quality）
   - 刪除 `monitor-panel`（已搬入 ops-panel > sub-monitor）
   - 刪除 `logs-panel`（已搬入 ops-panel > sub-logs）
   - 刪除 `loop-panel`

**驗收**：HTML 結構正確，無語法錯誤

---

### T2：client.css 新增樣式

**檔案**：`~/.claude/scripts/flow/client.css`
**執行者**：executor

變更內容：
1. 新增 Sub-Tab 樣式（`.sub-tabs`、`.sub-tab`、`.sub-panel`）
   - Sub-Tab 列：背景透明、底部 border、字體比主 Tab 小 1px
   - Active Sub-Tab：使用 `--accent` 色

2. 新增系統區塊樣式（`.sys-sections`、`.sys-section`、`.sys-section-title`）
   - 區塊分隔：每區塊 24px margin-bottom
   - 區塊標題：大寫、letter-spacing、漸層分隔線

3. 新增折疊區塊樣式（`.sys-section-collapsible`、`<details>` 相關）
   - 折疊箭頭：`::before` 偽元素，展開時旋轉 90 度
   - 隱藏預設 `<details>` marker

4. 新增管理工具徽章樣式（`.sys-admin-badge`）
   - 預設 `display:none`，`.visible` 時顯示
   - 黃色警告風格

5. 新增跳轉連結樣式（`.sys-nav-link`、`.logs-nav-link`）
   - 小字、accent 色、hover 底線

6. 新增 `#ops-panel` 佈局樣式
   - `flex-direction: column`，子元素 overflow hidden

7. 更新 `#system-panel`：移除原 `.sys-grid` 直接套用，改為區塊內各自有 `.sys-grid`

**驗收**：CSS 語法正確，不影響現有 graph/flow/events 樣式

---

## Phase 2：JS 邏輯重組（並行，依賴 Phase 1）

### T3：main.js Tab/Sub-Tab 邏輯

**檔案**：`~/.claude/scripts/flow/main.js`
**執行者**：executor

變更內容：
1. 移除 `import * as Loop from './loop.js'`
2. Tab 切換邏輯更新：
   - 移除 `prevTab === 'loop'` 相關的 `Loop.destroy()` 呼叫
   - 新增 `prevTab === 'system'` 時呼叫 `System.destroyTick()`
   - 移除 `tab.dataset.tab === 'quality'`、`'monitor'`、`'logs'`、`'loop'` 的個別處理
   - 新增 `tab.dataset.tab === 'ops'` 時呼叫 `triggerActiveSubTab()`
3. Sub-Tab 切換邏輯：
   - `activeSubTab` 變數（預設 `'monitor'`）
   - 綁定 `.sub-tab` 的 click 事件
   - `triggerActiveSubTab()` 函式呼叫 Quality/Monitor/Logs 的 update
   - Sub-Tab 記憶（localStorage `nova-subtab`）
4. 快捷鍵 1-5：
   - `'1'` → graph、`'2'` → flow、`'3'` → events、`'4'` → ops、`'5'` → system
   - 移除 `'6'`、`'7'`、`'8'`
5. CMD_ACTIONS 更新：
   - 8 Tab → 5 Tab + 3 Sub-Tab 捷徑
6. 跳轉連結全域 handler：
   - `document.addEventListener('click', ...)` 監聽 `[data-nav]`
7. SSE 事件分發更新：
   - `session_end` / `hook_trigger` 時，判斷 `activeTab === 'ops'` 再按 `activeSubTab` 分發
8. `pollHealth` 中移除 Loop 相關呼叫
9. Init 區塊：
   - 移除 `Loop.init()`
   - 新增 Sub-Tab 初始化和記憶恢復
   - Tab 記憶恢復加 fallback（舊 tab name 不存在時預設 graph）

**驗收**：Tab 切換正常、Sub-Tab 切換正常、快捷鍵 1-5 正常、CMD_ACTIONS 列出 10 項

---

### T4：system.js 吸收 loop.js

**檔案**：`~/.claude/scripts/flow/system.js`
**執行者**：executor

變更內容：
1. 新增模組內部狀態（從 loop.js 搬入）：
   - `pollTs`、`interval`、`executing`、`running`、`mode`、`todo`、`todoTop`、`sessions`
   - `fetchIntervalId`、`tickIntervalId`

2. 新增渲染函式（從 loop.js 搬入並改 ID）：
   - `renderLoopHeartbeat()` → 渲染到 `#sys-heartbeat-content`（合併原 renderHeartbeatStats + loop 心跳卡片）
   - `renderLoopSteps()` → 渲染到 `#sys-loop-steps`
   - `renderLoopNotion()` → 渲染到 `#sys-loop-notion`
   - `renderLoopLog()` → 渲染到 `#sys-loop-log`
   - `renderLoopStats()` → 渲染到 `#sys-loop-stats`

3. 新增 `fetchLoopData()`：
   - 並行 fetch `/processes`、`/api/notion-todo`、`/api/sessions-summary`
   - 更新模組內部狀態
   - 呼叫上述渲染函式

4. 新增 `tick()`：
   - 倒數邏輯（從 loop.js 搬入）
   - 渲染到心跳卡片中的「下次 Tick」欄位

5. 修改 `renderHookErrors()`：
   - 只顯示最近 1 條 + 跳轉連結 `data-nav="ops:monitor"`

6. 新增 `updateAdminBadge()`：
   - 計算活躍 Lock 數 + Anomalies 數
   - 更新 `#sys-admin-badge` 文字和可見性
   - 有活躍項目時自動展開 `<details>`

7. 修改 `update(health)`：
   - 新增呼叫 `fetchLoopData()`
   - 新增呼叫 `updateAdminBadge()`
   - Tab active 時啟動 fetchLoopData polling（3s）和 tick interval（1s）

8. 新增 `destroyTick()` export：
   - 清除 `fetchIntervalId` 和 `tickIntervalId`
   - 由 main.js 在離開 system Tab 時呼叫

**驗收**：系統 Tab 4 區塊正確渲染、心跳倒數正常、折疊/展開正常、Hook Errors 只顯示 1 條摘要

---

## Phase 3：去重 + 清理（並行，依賴 Phase 2）

### T5：logs.js Git Commits 摘要化

**檔案**：`~/.claude/scripts/flow/logs.js`
**執行者**：executor

變更內容：
1. `renderDayView()` 中的 Git Commits 區段：
   - 原本：完整列出每條 commit（repo + hash + message）
   - 改為：摘要行「今日 N 筆 commit」+ 跳轉連結 `data-nav="ops:monitor"`
2. 新增 `.logs-commit-summary` 和 `.logs-nav-link` CSS class 使用

**驗收**：日誌 Sub-Tab 的 Git 區段只顯示摘要

---

### T6：server.js 白名單更新

**檔案**：`~/.claude/hooks/server.js`
**執行者**：executor

變更內容：
1. 第 173 行 `FLOW_FILES` Set 中移除 `'loop.js'`

**驗收**：server.js 不再 serve loop.js

---

### T7：刪除 loop.js

**檔案**：`~/.claude/scripts/flow/loop.js`
**執行者**：executor

變更內容：
1. `rm ~/.claude/scripts/flow/loop.js`
2. 確認無其他檔案 import loop.js（main.js 已在 T3 移除 import）

**驗收**：`grep -r "loop.js" ~/.claude/scripts/flow/` 無結果

---

## Phase 4：驗收（串行，依賴 Phase 3）

### T8：全量測試 + 驗收

**執行者**：Main

驗收項目：
1. `bun test` — 1256 tests 全量通過
2. PinchTab acceptance：
   - `pinchtab nav http://localhost:3457`
   - `pinchtab text` — 確認 Tab Bar 只有 5 Tab
   - `pinchtab click '[data-tab="ops"]'` — 確認切換到營運 Tab
   - `pinchtab snap -i -c` — 確認 Sub-Tab 存在（品質/監控/日誌）
   - `pinchtab click '[data-subtab="quality"]'` — 確認品質 Sub-Tab 切換
   - `pinchtab click '[data-tab="system"]'` — 確認系統 Tab 4 區塊
   - 確認管理工具區塊預設折疊
3. 快捷鍵 1-5 測試
4. Command Palette 列出所有 Tab + Sub-Tab
