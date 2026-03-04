# PM Discovery 完整執行範例

> 以 Overtone 的「Hook Observability」feature 為範例，展示 product-manager agent 從需求探索到執行佇列產出的完整流程。

## 背景

使用者：「我想知道每個 Hook 跑多久，方便找出效能瓶頸。」
PM 使用五層追問法進行 Discovery。

---

## 五層追問（Discovery）

### L1: 表面需求

```json
{
  "question": "你希望追蹤 Hook 效能的目的是什麼？",
  "options": [
    { "label": "偵錯用途", "description": "Hook 變慢時有數據回溯根因" },
    { "label": "持續監控", "description": "每次 session 自動記錄，長期追蹤趨勢" },
    { "label": "效能最佳化", "description": "找出最慢的 Hook 然後加速" }
  ]
}
```

**使用者選擇**：「持續監控」 — 需要長期觀測能力，不是一次性診斷。

### L2: 使用情境

```json
{
  "question": "你通常在什麼時機查看 Hook 效能資料？",
  "options": [
    { "label": "Session 結束時自動看摘要", "description": "terminal 顯示 Hook 耗時排行" },
    { "label": "有問題時手動查詢", "description": "CLI 指令查詢特定 session 的計時資料" },
    { "label": "Dashboard 即時顯示", "description": "Dashboard 上看即時耗時" }
  ]
}
```

**使用者選擇**：「有問題時手動查詢」 — 場景：系統變慢時用 CLI 查詢，頻率不高但需持久化。

### L3: 現有方案

```json
{
  "question": "目前你怎麼診斷 Hook 效能問題？",
  "options": [
    { "label": "手動加 console.log 計時", "description": "懷疑的 Hook 手動加 Date.now()" },
    { "label": "看 timeline 事件間隔", "description": "從 timeline 時間戳反推耗時" },
    { "label": "沒有方法，靠感覺", "description": "感覺變慢但無法量化" }
  ]
}
```

**使用者選擇**：「看 timeline 事件間隔」 — 間接推算不精確，只有 stage 層級事件。

### L4: 痛點量化

```json
{
  "question": "Hook 效能問題對開發體驗影響有多大？",
  "options": [
    { "label": "每天遇到，嚴重影響", "description": "幾乎每個 session 都感覺 Hook 拖慢工作流" },
    { "label": "偶爾遇到，中等影響", "description": "每週 2-3 次，花 5-10 分鐘排查" },
    { "label": "很少但很痛", "description": "每月 1-2 次，每次 30 分鐘以上" }
  ]
}
```

**使用者選擇**：「偶爾遇到，中等影響」 — 每週 2-3 次，週成本約 15-30 分鐘。

### L5: 成功定義

```json
{
  "question": "這個功能的成功指標是什麼？",
  "options": [
    { "label": "CLI 查到 Hook 平均耗時", "description": "一行指令看排行榜，無需手動計算" },
    { "label": "自動偵測異常慢的 Hook", "description": "超閾值自動通知" },
    { "label": "完整效能儀表板", "description": "Dashboard 圖表 + 歷史趨勢" }
  ]
}
```

**使用者選擇**：「CLI 查到 Hook 平均耗時」 — 不需要即時警告或圖表。

---

## 方案比較

| 維度 | A: Timeline Emit | B: 獨立 Log 檔 | C: Dashboard 即時 |
|------|-----------------|----------------|------------------|
| 概述 | Hook 內 emit `hook:timing` 到 timeline | 寫入獨立 hook-timing.jsonl | SSE 即時推送耗時 |
| 優點 | 複用 timeline 基礎設施 | 獨立儲存不污染 timeline | 即時可見 |
| 缺點 | timeline 事件量增加 | 新增維運成本 | 依賴 Dashboard |
| 工作量 | 2 天 | 3 天 | 5 天 |

### RICE 評分

| 方案 | Reach | Impact | Confidence | Effort | RICE |
|------|:-----:|:------:|:----------:|:------:|:----:|
| A | 8 | 2 | 90% | 2 | 7.20 |
| B | 8 | 2 | 80% | 3 | 4.27 |
| C | 6 | 1.5 | 60% | 5 | 1.08 |

**推薦**：方案 A（Timeline Emit），RICE 最高，複用既有基礎設施。

---

## MVP 範圍（MoSCoW）

**Must**（核心）：
- [ ] 6 個主要 Hook 加入 `hook:timing` 計時 emit
- [ ] registry.js 新增 `hook:timing` 事件定義
- [ ] data.js 支援 `analyze hook-overhead` 查詢

**Should**（重要但非必要）：
- [ ] 計時 emit 以 try/catch 包裹，不影響主流程
- [ ] 測試覆蓋：registry 定義 + 計時 + 事件結構

**Could**（錦上添花）：
- [ ] Dashboard Hook 耗時統計
- [ ] 超閾值自動 `system:warning`

**Won't**：完整效能儀表板、Hook 自動最佳化

---

## 驗收標準（BDD）

```gherkin
Feature: Hook Observability

  Scenario: 正常路徑計時
    Given Hook 腳本正常執行
    When Hook 執行完畢
    Then timeline.jsonl 包含 hook:timing 事件
    And 事件包含 hook、event、durationMs 欄位

  Scenario: 計時失敗不影響主流程
    Given timeline.emit 拋出例外
    When Hook 腳本執行
    Then Hook 主功能正常完成

  Scenario: CLI 查詢
    Given 已有多筆 hook:timing 事件
    When 執行 bun scripts/data.js analyze hook-overhead
    Then 輸出各 Hook 平均耗時排行
```

---

## Product Brief 產出

```markdown
## HANDOFF: product-manager → planner

### Context
完成 Hook Observability Discovery，選定 Timeline Emit 方案（RICE 7.20）。

### Findings
問題：Hook 效能問題每週 2-3 次，每次 5-10 分鐘排查。
方案：6 個 Hook emit hook:timing，複用 timeline + data.js 查詢。
MVP：Must 3 項 / Should 2 項 / Could 2 項

### Files Modified
（無修改 — 唯讀分析）

### Open Questions
1. 哪 6 個 Hook 是「主要」的？（需 planner/architect 確認）
2. durationMs 精度需求？（performance.now() vs Date.now()）
```

---

## 多次迭代佇列範例

若需求拆為多次迭代，PM 產出佇列格式供 Main Agent 寫入：

| # | 名稱 | Workflow | 說明 |
|:-:|------|---------|------|
| 1 | hook-observability-cli | standard | 計時 emit + CLI 查詢 |
| 2 | hook-observability-dashboard | quick | Dashboard 統計面板 |
| 3 | hook-observability-alerting | quick | 超閾值自動警告 |

```bash
bun plugins/overtone/scripts/queue.js add \
  hook-observability-cli standard \
  hook-observability-dashboard quick \
  hook-observability-alerting quick \
  --source pm
```

---

## 過程中的反模式偵測

**Solution-First**：使用者 L1 說「想知道 Hook 跑多久」是方案描述而非問題描述。PM 追問 L2-L5 確認真正問題是「缺少診斷數據」，使用者方案恰好正確但需確認範圍。

**Gold Plating 預防**：痛點量化（週 15-30 分鐘）不支持 5 天投入。RICE 評分客觀引導至最高效方案，排除 Dashboard 儀表板。

---

## Discovery 品質指標

| 指標 | 值 |
|------|-----|
| 追問層數 | 5/5（完整 L1-L5） |
| AskUserQuestion 次數 | 5 |
| 方案數量 | 3（含高成本對比方案） |
| RICE 差異 | 7.20 vs 1.08 |
| Must 占比 | 3/7（43%） |
| BDD Scenario | 3 條 |
