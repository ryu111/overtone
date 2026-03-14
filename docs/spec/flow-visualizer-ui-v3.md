# Flow Visualizer UI v3 — 改善規格

## 優先級

P0 = 必須做（影響可用性）、P1 = 應該做（提升體驗）、P2 = 可以做（錦上添花）

---

## 1. Flow Tab 改善

### 1.1 「正在思考」動態指示 [P0]

Main Agent 站點後面加一個脈動的「...」指示器，表示正在處理中。
收到新事件時指示器消失，新站點出現。

**實作**：在 renderMetroMap 最後一個站點下方加一個 `<g class="thinking-indicator">`，
包含 3 個小圓點做呼吸動畫。收到新事件 re-render 時自動消失。

### 1.2 Sidebar 可收合 [P1]

- 左側 sidebar 加收合按鈕（`«` / `»`）
- 收合後只顯示 8px 寬的 hover 區域
- 主區域自動擴展使用全寬

### 1.3 Legend 改為 hover tooltip [P1]

- Legend 預設隱藏
- 右下角放一個 `?` 圓形按鈕
- hover 時浮出 Legend 內容
- 減少常態佔用面積

### 1.4 Prompt 站自適應寬度 [P1]

- 圓角矩形寬度根據文字長度自適應
- 最大不超過 `flowWidth * 0.5`
- 超出部分 ellipsis

### 1.5 站點間距動態調整 [P1]

- 站點少時（<5）間距加大（100px），利用空間
- 站點多時（>10）間距縮小（50px），fit 畫面
- `stepY = Math.max(50, Math.min(100, (flowHeight - 160) / stationCount))`

### 1.6 當前站點 pulse 動畫 [P0]

- 最後一個站點（current）的外圈持續 pulse 呼吸
- `@keyframes currentPulse { 0%,100% { stroke-opacity:1; } 50% { stroke-opacity:0.4; } }`
- 搭配 glow filter

### 1.7 蜿蜒佈局優化 [P1]

- Agent dispatch 不只向右偏移，改為交替左右（奇數右、偶數左）
- 避免超出畫布右邊界
- Skill 分支改為弧形排列（已實作但需要調參）

---

## 2. Graph Tab 改善

### 2.1 分群背景區域 [P1]

- 用半透明矩形標示 Agent/Skill/Hook/Rule 四個區域
- 每個區域有淡色標題
- 類似 Figma 的 section 概念

### 2.2 Orphan skills 收合 [P1]

- 未被任何 agent 引用的 skills 收合為一個「Orphan Skills (19)」節點
- 點擊展開顯示全部
- 減少視覺雜訊

### 2.3 節點大小層級 [P1]

- Agent: r=20（最大，核心元件）
- 被引用的 Skill: r=14
- Hook: r=12
- Rule: r=10
- Orphan/Event: r=6（最小）

---

## 3. 全局改善

### 3.1 Header 資訊豐富化 [P1]

```
⬡ Overtone Flow Visualizer    [Session: opus | 04:34 | 36 events]    ● 已連線
```

顯示當前 session 的 model、開始時間、事件數。

### 3.2 科技感一致性 [P2]

- Flow tab 加入 Graph 同款的 neon glow filter
- 站點 hover 時加 glow 放大效果
- 主線加微弱的發光（`filter: drop-shadow(0 0 2px rgba(96,165,250,0.3))`）

### 3.3 鍵盤快捷鍵 [P2]

- `1/2/3` 切換 Graph/Flow/Events tab
- `Space` 在 Flow tab 暫停/恢復 LIVE 模式
- `←/→` 在 Scrubber 上步進

---

## 4. 分批執行計劃

### Batch A（P0 — 必做）
- 1.1 思考指示器
- 1.6 當前站點 pulse

### Batch B（P1 — 體驗提升）
- 1.2 Sidebar 收合
- 1.3 Legend hover
- 1.4 Prompt 自適應
- 1.5 動態間距
- 1.7 蜿蜒優化

### Batch C（P1 — Graph 改善）
- 2.1 分群背景
- 2.2 Orphan 收合
- 2.3 節點大小

### Batch D（P1-P2 — 全局）
- 3.1 Header 資訊
- 3.2 科技感
- 3.3 鍵盤快捷鍵

---

> 實作計劃見 `docs/superpowers/plans/2026-03-14-flow-visualizer.md`。
