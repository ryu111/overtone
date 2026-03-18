# Dashboard 後續優化計畫

> PM Discovery 2026-03-18 — 使用者確認 A+B 組合方案

## 迭代 1：Quick Win（workflow: quick）

### T1. 停用 3500 Dashboard
- 停止 port 3500 的 server（不再啟動）
- `~/projects/overtone/dashboard/` 保留但不再維護

### T2. 星空 Canvas disable 選項
- localStorage `nova-starfield` = 'off' 時不啟動 Canvas
- 在系統 Tab 或 Header menu 加開關

### T3. Tab 記憶（localStorage）
- `localStorage.setItem('nova-tab', tabId)` 記住上次 Tab
- 下次載入時自動切換到上次的 Tab

### T4. loop.js polling 優化
- **根因**：`init()` 啟動 3 秒 polling，即使沒切到自主循環 Tab 也每 3 秒打 3 個 API
- **修正**：只在 Tab active 時 polling，離開時暫停

### T5. system.js renderServices 並行化
- **根因**：llm + daemons 串行 await，最差等 9 秒
- **修正**：`Promise.all([fetchLlm(), fetchDaemons()])` 並行

### T6. events 上限提升
- 目前 MAX_EVENTS = 100，DOM 限制 20 筆
- 提升 DOM 限制到 50 筆

---

## 迭代 2：中期增強（workflow: standard）

### T7. SSE 事件總線重構
- **根因**：main.js `handleEvent()` 只分發到 Graph/Metro/Events，其他 4 個 Tab 不接收即時事件
- **修正**：品質/監控/自主循環/日誌 Tab 註冊 SSE callback，收到相關事件時觸發局部更新

### T8. Tab 分組
- 3 組：操控（架構圖/事件流/事件記錄）| 分析（品質/監控/日誌）| 自動（系統/自主循環）
- CSS 分隔線或 Tab group label

### T9. 品質 Tab 即時更新
- SSE 收到 session_end 事件時，自動 re-fetch scores（因為 judge 會在 session 結束後評分）

### T10. 日報摘要版本
- generateMeetingNotes 產出太長，加一個「摘要模式」只顯示 KPI + 異常

### T11. CSS 審計清理
- 檢查 client.css 中未使用的 selector
- 合併重複的 panel/card 樣式
