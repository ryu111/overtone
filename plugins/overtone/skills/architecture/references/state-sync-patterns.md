# 跨元件/頁面狀態同步模式

> 來源：Overtone Architect Knowledge Domain

## 決策樹：選擇哪種同步模式？

```
資料需要跨元件/頁面共享嗎？
  │
  ├── 否（只有當前元件用）→ 本地 Component State（不需要同步）
  │
  └── 是
        │
        ├── 資料來源是伺服器（後端 API）？
        │     ├── 是，需要即時推送 → SSE / WebSocket（Server State Push）
        │     ├── 是，輪詢可接受 → API Polling（Server State Pull）
        │     └── 是，只需一次性載入 → 前端 Store 快取（全域 Store + fetch）
        │
        └── 資料來源是前端操作（不需要後端）？
              ├── 只有 2-3 個關聯元件 → Props / Context 傳遞
              ├── 跨多個頁面或深度巢狀 → 全域 Store
              └── 需要解耦（元件互不知道彼此）→ Event Bus
```

## 四種模式詳解

### 1. 本地狀態（Component State / Props Drilling）

**適用場景**：
- 狀態只在父子元件之間共享
- 元件樹深度 <= 3 層
- 不需要跨頁面保持狀態

**Tradeoff**：
- 優點：最簡單，無額外依賴，易於追蹤
- 缺點：超過 3 層後 props drilling 維護成本高
- 缺點：頁面切換後狀態丟失

**反模式警告**：
- 用 props drilling 傳遞超過 4 層 — 改用全域 Store
- 在 localStorage 模擬全域狀態 — 用正式的 Store

**Architect 設計時**：
- 繪製元件樹時標注哪些資料需要跨層傳遞
- 超過 2 層即評估是否改用 Store

---

### 2. 全域 Store（Vuex / Pinia / Redux / Zustand）

**適用場景**：
- 狀態需要在多個頁面間保持
- 多個不相關元件需要讀/寫同一資料
- 需要時間旅行 debug 或嚴格的狀態追蹤

**Tradeoff**：
- 優點：單一資料來源（Single Source of Truth）
- 優點：任何元件都能訂閱，解耦
- 缺點：引入框架依賴，增加程式碼量
- 缺點：過度使用導致所有狀態都全域化（反模式）

**反模式警告**：
- 把所有狀態都放 Store — 只放需要跨元件共享的
- Store 中放 UI 狀態（如 modal 開關）— 保留在本地 Component State

**Architect 設計時**：
- 在 design.md 的資料模型章節列出「Store 中的 state shape」
- 說明哪些操作會 mutate Store，影響哪些頁面

---

### 3. Event Bus（自訂事件匯流排）

**適用場景**：
- 元件之間需要傳遞訊息，但不想直接依賴
- 一對多通知（一個操作觸發多個元件更新）
- 解耦兩個不相關模組

**Tradeoff**：
- 優點：完全解耦，發送方不需要知道接收方
- 缺點：事件流難以追蹤（隱性依賴）
- 缺點：未移除的 listener 造成記憶體洩漏
- 缺點：沒有型別安全

**反模式警告**：
- 用 Event Bus 替代 Store 管理業務狀態 — 業務狀態放 Store
- 不移除 listener — 元件銷毀時 MUST 呼叫 `off`

**Architect 設計時**：
- 若使用 Event Bus，在 design.md 列出所有事件名稱和 payload 格式
- Overtone 的 remote/event-bus 可作為後端事件匯流排的參考

---

### 4. Server State（API Polling / SSE / WebSocket）

**適用場景**：
- 狀態由後端維護（資料庫、Session）
- 多個使用者/視窗需要看到同步狀態
- 需要即時推送（如通知、進度更新）

**子模式選擇**：

| 子模式 | 適用 | 延遲 | 複雜度 |
|--------|------|------|--------|
| API Polling | 允許 1-5 秒延遲 | 中 | 低 |
| SSE（伺服器推送）| 一對一，單向推送 | 低 | 中 |
| WebSocket | 雙向即時通訊 | 極低 | 高 |

**Tradeoff**：
- 優點：狀態以後端為主，前端只是顯示層
- 優點：多視窗自動同步
- 缺點：依賴網路，需要處理連線失敗
- 缺點：增加後端複雜度（連線管理）

**反模式警告**：
- 用 WebSocket 替代所有 HTTP API — 只用於需要即時雙向的場景
- Polling interval 太短（< 1 秒）— 用 SSE 替代

**Architect 設計時**：
- 在 design.md 明確指定後端資料更新 → 前端感知的路徑
- Overtone Dashboard 的 SSE 實作可作為參考（`scripts/lib/dashboard/`）

---

## 後端跨模組狀態傳播

後端架構同樣面臨狀態同步問題（不局限於前端）：

| 場景 | 推薦模式 |
|------|----------|
| Service A 更新資料，Service B 需要感知 | Event 發布/訂閱（EventBus） |
| 快取資料失效 | Cache-Aside + TTL，或 Write-Through |
| 分散式事務 | Saga Pattern（補償事務） |
| 狀態機轉換通知 | Domain Event + 訂閱者 |

---

## Architect 設計整合

在 design.md 中明確狀態同步策略：

```
## 狀態同步策略

資料流：{操作描述} → {Store/API/Event} → {影響的元件/頁面}

選擇依據：{為何選此模式}
```

**Checklist（設計 review 時確認）**：
- [ ] 列出所有跨元件共享的狀態
- [ ] 確認每個狀態的 owner（哪個元件/API 是 source of truth）
- [ ] 定義更新傳播路徑（操作 → 狀態更新 → UI 反映）
- [ ] 考慮離線/網路失敗情況下的狀態一致性
