# Dashboard 資訊架構重組 — Product Brief

## 問題摘要

Nova Dashboard 現有 8 個 Tab，存在 3 個資訊架構問題：

1. **跨 Tab 資訊重複**（RICE 140）：同一資料出現在多個 Tab，使用者不知道該看哪個
2. **8 Tab 過多**（RICE 84）：認知負荷高，Tab Bar 擁擠
3. **系統 Tab 9 Card 無優先順序**（RICE 80）：高頻操作和低頻資訊混雜

## 限制

- 不改視覺風格（G3 星空、顏色、動畫保持不變）
- 只重組資訊結構和 Tab 佈局

---

## 一、Tab 精簡方案：8 → 5

### 現狀（8 Tab）

```
架構圖 │ 事件流 │ 事件記錄 ││ 品質 │ 監控 │ 日誌 ││ 系統 │ 自主循環
```

### 目標（5 Tab）

```
架構圖 │ 事件流 │ 事件記錄 ││ 營運 │ 系統
```

### 合併邏輯

| 動作 | 原 Tab | 新歸屬 | 理由 |
|------|--------|--------|------|
| 保留 | 架構圖 | 架構圖（Tab 1） | 獨立視覺化，無重複 |
| 保留 | 事件流 | 事件流（Tab 2） | 獨立視覺化，無重複 |
| 保留 | 事件記錄 | 事件記錄（Tab 3） | 獨立功能，無重複 |
| **合併** | 品質 + 監控 + 日誌 | **營運**（Tab 4） | 三者都是「分析過去發生了什麼」，共用 `/api/hook-errors`、`/api/sessions-summary`、`/api/git` |
| **合併** | 系統 + 自主循環 | **系統**（Tab 5） | 兩者都是「系統當前狀態」，Heartbeat 資料重複 |

### 營運 Tab 內部結構

使用 Sub-Tab（頁籤式切換），不疊加所有內容：

```
[品質] [監控] [日誌]
───────────────────
（對應內容區域）
```

- 預設顯示「監控」（最高頻使用：錯誤 + Session + Git）
- 切換時只渲染當前 Sub-Tab，其他暫停（沿用既有 lazy-render 模式）

### 系統 Tab 內部結構

使用區塊分組（非 Sub-Tab），因為總資訊量適合一頁展示：

```
[即時狀態]        ← 頂部：心跳 + 服務狀態 + 循環流程
[資源監控]        ← 中部：Memory 趨勢 + Server 資訊 + 模組
[自驅成果]        ← 下部：最近成果 + 統計 + Notion 待做
[管理工具]        ← 底部（預設折疊）：Lock 管理 + 操作按鈕 + Anomalies
```

---

## 二、資訊去重規則

### 重複矩陣與解決方案

| 資訊 | 保留位置 | 移除位置 | 處理方式 |
|------|---------|---------|---------|
| **Hook Errors** | 營運 > 監控（錯誤聚類 + sparkline） | 系統 Tab（原 Hook Errors Card） | 系統 Tab 改為「最近 1 條摘要 + 連結」跳轉營運 Tab |
| **Hook Errors 計算** | 營運 > 品質（健康度 KPI 計算用） | — | 品質 Sub-Tab 繼續 fetch `/api/hook-errors` 做 KPI 計算，不額外渲染列表 |
| **Heartbeat 狀態** | 系統 Tab > 即時狀態區（完整） | Header（保留指示燈） | Header 的 `⚡` 按鈕和 active 狀態保留，不重複顯示數據 |
| **Heartbeat 統計** | 系統 Tab > 即時狀態區 | 原自主循環（已合併） | 合併後自然消除 |
| **Git Commits** | 營運 > 監控（Git 活動 Card） | 營運 > 日誌（Git Commits 區段） | 日誌 Sub-Tab 的 Git Commits 區段改為「今日 N 筆 commit」摘要行 + 「查看完整」跳轉監控 Sub-Tab |
| **Session 記錄** | 營運 > 監控（Session 記錄 Card） | 原自主循環的 session 列表 | 合併後，系統 Tab 的「自驅成果」只顯示 heartbeat session，不重複顯示全部 session |
| **Session 摘要** | 營運 > 日誌（Session 摘要區段） | 營運 > 監控（保留完整列表） | 日誌顯示當日摘要，監控顯示最近 N 筆——用途不同，不算重複 |

### 去重原則

1. **每項資訊有且只有一個「完整展示」位置**
2. 其他位置可用「摘要 + 跳轉連結」引用，點擊後切換到對應 Tab/Sub-Tab
3. 跳轉用 `data-nav="tab:subtab"` 屬性實現，避免硬編碼 Tab 名稱

---

## 三、系統 Tab Card 重排

### 現狀（9 Card 平鋪，無優先順序）

```
Memory 趨勢(wide) │ Heartbeat │ 模組
Anomalies │ Server 資訊
Hook Errors(wide)
服務狀態(wide)
Lock 管理 │ 操作
```

### 目標（4 區塊，按使用頻率分層）

#### 區塊 A：即時狀態（每次都看）

| Card | 來源 | 說明 |
|------|------|------|
| 心跳狀態 | 原 Heartbeat + 原自主循環「心跳狀態」 | 合併：運行/停止 + 模式 + 間隔 + 下次 Tick 倒數 + sessions/成功/失敗 |
| 服務狀態 | 原服務狀態 | Nova Server + Local LLM + Maintainer/Judge/Learner |
| 循環流程 | 原自主循環「循環流程」 | 4 步驟指示器（Poll → Execute → Done → Analyze） |

#### 區塊 B：資源監控（定期查看）

| Card | 來源 | 說明 |
|------|------|------|
| Memory 趨勢 | 原 Memory 趨勢(wide) | 保持不變 |
| Server 資訊 | 原 Server 資訊 | Uptime + SSE 連線 + 版本 |
| 模組 | 原模組 | Handler Keys + 模組列表 |

#### 區塊 C：自驅成果（查看歷史）

| Card | 來源 | 說明 |
|------|------|------|
| 最近自驅成果 | 原自主循環「最近自驅成果」 | 最近 10 筆 heartbeat session（成功/失敗 + 任務名 + 時間） |
| 統計 | 原自主循環「統計」 | 自驅 Session 數 + 成功率 + 趨勢 |
| Notion 待做 | 原自主循環「Notion 任務」 | 佇列數量 + 最上面任務名 |

#### 區塊 D：管理工具（偶爾使用，預設折疊）

| Card | 來源 | 說明 |
|------|------|------|
| Hook Errors 摘要 | 原 Hook Errors（精簡） | 最近 1 條 + 「查看全部 →」跳轉營運 > 監控 |
| Lock 管理 | 原 Lock 管理 | 保持不變 |
| Anomalies | 原 Anomalies | 保持不變 |
| 操作 | 原操作 | 重載 Hook 模組 + 觸發 Maintainer + 清除過期 Lock |

**折疊行為**：區塊 D 預設收合，顯示「管理工具 ▼」標題列。有活躍 Lock 或 Anomalies 時自動展開並在標題列顯示徽章數。

---

## 四、BDD 驗收標準

### Feature: Dashboard 資訊架構重組

```gherkin
Scenario: Tab 數量精簡
  Given Dashboard 載入完成
  Then Tab Bar 顯示 5 個 Tab：架構圖、事件流、事件記錄、營運、系統
  And 每個 Tab 可用鍵盤快捷鍵 1-5 切換

Scenario: 營運 Tab Sub-Tab 切換
  Given 使用者點擊「營運」Tab
  Then 預設顯示「監控」Sub-Tab
  When 使用者點擊「品質」Sub-Tab
  Then 顯示品質 KPI Ring + 分布圖 + 改善建議 + 排行表
  And 「監控」和「日誌」Sub-Tab 內容不渲染（lazy render）

Scenario: 系統 Tab 區塊分層
  Given 使用者點擊「系統」Tab
  Then 頂部顯示「即時狀態」區塊（心跳 + 服務 + 循環流程）
  And 中部顯示「資源監控」區塊（Memory + Server + 模組）
  And 下部顯示「自驅成果」區塊（成果 + 統計 + Notion）
  And 底部顯示「管理工具」區塊（預設折疊）

Scenario: 管理工具自動展開
  Given 系統 Tab 處於開啟狀態
  When 存在活躍 Lock 或 Anomalies
  Then 「管理工具」區塊自動展開
  And 標題列顯示活躍項目數量徽章

Scenario: Hook Errors 去重
  Given 使用者在系統 Tab
  Then Hook Errors 只顯示最近 1 條摘要
  When 使用者點擊「查看全部 →」
  Then 自動跳轉到「營運 > 監控」Sub-Tab 的錯誤聚類區域

Scenario: Git Commits 去重
  Given 使用者在「營運 > 日誌」Sub-Tab
  Then Git 區段只顯示「今日 N 筆 commit」摘要行
  When 使用者點擊「查看完整」
  Then 自動跳轉到「營運 > 監控」Sub-Tab 的 Git 活動區域

Scenario: 3 秒資訊定位（核心 KPI）
  Given 使用者需要查找任一資訊
  Then 從任意 Tab 開始，最多 1 次 Tab 切換 + 1 次 Sub-Tab 切換即可到達目標
  And 總耗時不超過 3 秒（基於 Tab 記憶 + 快捷鍵）

Scenario: 快捷鍵更新
  Given Dashboard 載入完成
  When 使用者按下數字鍵 1-5
  Then 對應切換到 5 個 Tab
  And Command Palette（Cmd+K）列出所有 Tab 和 Sub-Tab

Scenario: Tab 記憶保持
  Given 使用者在「營運 > 品質」Sub-Tab
  When 使用者切換到其他 Tab 再切回「營運」
  Then 自動恢復到「品質」Sub-Tab

Scenario: Header 指標保持
  Given Header 顯示 MEM / UP / MOD / SSE 四項指標
  Then 合併後 Header 指標不變
  And Heartbeat ⚡ 按鈕保持原有功能
```

---

## 五、影響範圍

### 需要修改的檔案

| 檔案 | 修改類型 | 說明 |
|------|---------|------|
| `client.html` | 重構 | Tab Bar 8→5 + Panel 結構重組 |
| `main.js` | 重構 | Tab 切換邏輯 + 快捷鍵 1-8→1-5 + Command Palette |
| `system.js` | 重構 | 吸收 loop.js 內容 + 4 區塊分層 + 折疊邏輯 |
| `monitor.js` | 小改 | 成為營運 Tab 的 Sub-Tab module（介面不變） |
| `quality.js` | 小改 | 成為營運 Tab 的 Sub-Tab module（介面不變） |
| `logs.js` | 小改 | 成為營運 Tab 的 Sub-Tab module + Git 摘要化 |
| `loop.js` | 刪除 | 內容合併到 system.js |
| `client.css` | 小改 | Sub-Tab 樣式 + 折疊區塊樣式 |

### 不需要修改的檔案

| 檔案 | 原因 |
|------|------|
| `graph.js` | 架構圖 Tab 保持不變 |
| `metro.js` | 事件流 Tab 保持不變 |
| `events.js` | 事件記錄 Tab 保持不變 |
| `utils.js` | 共用函式不變 |
| `starfield.js` | 視覺效果不變 |
| `api-router.js` | 後端 API 不變（只改前端呈現） |

### 不變的後端 API

所有 `/api/*` endpoint 保持不變，只改前端的 fetch 和渲染邏輯。

---

## 六、建議 Workflow

**深度：D2（planner → executor）**

理由：
- 跨 6 個前端模組修改，但邏輯明確（搬移 + 合併，無新功能）
- 不涉及後端 API 變更
- 視覺風格不變，降低了不確定性

### 執行計劃

```
Phase 1（並行）：
  - Executor A：client.html 骨架重構（5 Tab + 營運 Sub-Tab + 系統 4 區塊）
  - Executor B：client.css Sub-Tab 和折疊樣式

Phase 2（並行，依賴 Phase 1）：
  - Executor C：main.js Tab 切換邏輯 + 快捷鍵 + Command Palette
  - Executor D：system.js 吸收 loop.js + 4 區塊分層

Phase 3（並行，依賴 Phase 1）：
  - Executor E：營運 Sub-Tab 整合（monitor.js + quality.js + logs.js 接入）
  - Executor F：去重邏輯（Hook Errors 摘要 + Git 摘要 + 跳轉連結）

Phase 4（串行，依賴 Phase 2+3）：
  - 刪除 loop.js + 清理 import
  - 測試：Tab 切換、Sub-Tab 切換、快捷鍵、跳轉連結、折疊展開
```

### 預估工作量

- HTML/CSS 結構：1 個 executor session
- JS 邏輯重組：2 個 executor session
- 測試驗收：1 個 session
- **總計：約 4 個 session**
