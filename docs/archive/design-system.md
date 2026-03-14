# 設計系統：Overtone Dashboard — Glassmorphism 重設計

> 生成方式：降級方案（手動產出，基於現有 main.css + registry.js 語義）
> 版本：1.0.0 | 日期：2026-02-27

---

## 風格定義

- **風格**：Glassmorphism（玻璃態）
- **氛圍**：深夜指揮中心 — 深空黑底 + 半透明玻璃表面 + 紫色強調光暈
- **密度**：平衡（Standard Dashboard，8px 基礎間距）
- **動畫程度**：豐富（confetti 慶祝 / Agent 脈衝燈號 / Stage 滑入 / 狀態閃光）

---

## 色彩方案

### 基底色盤

| 用途 | 色名 | Hex | 說明 |
|------|------|-----|------|
| Canvas Background | `--bg-canvas` | `#0a0a0f` | 全頁最底層，近純黑含藍紫微調 |
| Background Primary | `--bg-primary` | `#0d1117` | Body 背景（繼承現有） |
| Background Secondary | `--bg-secondary` | `#161b22` | Header / Tab bar 背景 |
| Background Tertiary | `--bg-tertiary` | `#21262d` | 卡片 / 輸入背景 |
| Background Hover | `--bg-hover` | `#292e36` | Hover 狀態背景 |
| Glass Surface | `--glass-surface` | `rgba(255,255,255,0.05)` | 玻璃態元件主表面 |
| Glass Surface Hover | `--glass-hover` | `rgba(255,255,255,0.08)` | 玻璃態 Hover 狀態 |
| Glass Border | `--glass-border` | `rgba(255,255,255,0.12)` | 玻璃態邊框 |
| Glass Border Active | `--glass-border-active` | `rgba(124,58,237,0.6)` | 玻璃態 Active 邊框（紫光） |

### 文字色盤

| 用途 | 色名 | Hex | 說明 |
|------|------|-----|------|
| Text Primary | `--text-primary` | `#e6edf3` | 主要文字（繼承現有） |
| Text Secondary | `--text-secondary` | `#8b949e` | 次要文字 / 輔助資訊 |
| Text Muted | `--text-muted` | `#484f58` | 低調文字 / Timestamp |
| Text Glow | `--text-glow` | `#c4b5fd` | 紫光文字（標題強調） |

### 強調色 / 品牌色

| 用途 | 色名 | Hex | 說明 |
|------|------|-----|------|
| Accent Primary | `--accent` | `#7c3aed` | 主強調色（Overtone 品牌紫） |
| Accent Glow | `--accent-glow` | `rgba(124,58,237,0.4)` | 光暈效果用透明度紫 |
| Accent Light | `--accent-light` | `#a78bfa` | 輕量強調（inactive tab 選中） |

### 狀態色

| 用途 | 色名 | Hex | 說明 |
|------|------|-----|------|
| Pass / Success | `--status-pass` | `#22c55e` | 完成 / 通過（綠） |
| Fail / Error | `--status-fail` | `#ef4444` | 失敗 / 錯誤（紅） |
| Reject | `--status-reject` | `#f97316` | 審查拒絕（橙） |
| Active / Running | `--status-active` | `#eab308` | 執行中（黃） |
| Pending | `--status-pending` | `#484f58` | 待機（灰） |

### Agent 語義色（對齊 registry.js — 不可修改）

| 色彩 | CSS 變數 | Hex | Agent 對應 |
|------|----------|-----|------------|
| Purple | `--color-purple` | `#a855f7` | planner, retrospective, doc-updater |
| Cyan | `--color-cyan` | `#22d3ee` | architect, designer |
| Yellow | `--color-yellow` | `#eab308` | developer, qa |
| Blue | `--color-blue` | `#3b82f6` | code-reviewer, refactor-cleaner |
| Red | `--color-red` | `#ef4444` | security-reviewer, database-reviewer |
| Orange | `--color-orange` | `#f97316` | debugger, build-error-resolver |
| Pink | `--color-pink` | `#ec4899` | tester |
| Green | `--color-green` | `#22c55e` | e2e-runner |

---

## 字型規格

### 字型堆疊

| 用途 | Font Family | 說明 |
|------|-------------|------|
| 介面主體 | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif` | 系統 UI 字型，高可讀性 |
| 等寬（Session ID / Timestamp / Code） | `'SF Mono', 'Fira Code', Consolas, 'Courier New', monospace` | 等寬字，技術資訊 |

### 字型尺度

| 等級 | CSS Size | Rem | 用途 |
|------|----------|-----|------|
| Display | `--text-display` | `1.5rem / 24px` | 頁面大標題、數字統計值 |
| Heading 1 | `--text-h1` | `1.25rem / 20px` | Section 標題 |
| Heading 2 | `--text-h2` | `1.1rem / 17.6px` | 子標題 |
| Body | `--text-body` | `0.875rem / 14px` | 主要內文 |
| Small | `--text-sm` | `0.8rem / 12.8px` | 輔助資訊、Label |
| Micro | `--text-xs` | `0.75rem / 12px` | Timestamp、Tag |

### 字重

| 用途 | Weight | 說明 |
|------|--------|------|
| 正常 | 400 | 內文、說明 |
| 中等 | 500 | 事件標籤、表頭 |
| 粗體 | 600 | 卡片標題、數值 |
| 超粗 | 700 | Logo、重要數字 |

---

## 間距系統（Spacing Tokens）

| Token | 值 | 說明 |
|-------|----|------|
| `--space-xs` | `4px` | 最小間距（圖示與文字） |
| `--space-sm` | `8px` | 緊湊間距（卡片內部） |
| `--space-md` | `16px` | 標準間距（預設 padding） |
| `--space-lg` | `24px` | 寬鬆間距（Section 間距） |
| `--space-xl` | `32px` | 大間距（頁面邊距） |
| `--space-2xl` | `48px` | 超大間距（區塊分隔） |

---

## Glassmorphism 參數

### 核心效果規格

| 屬性 | 值 | 說明 |
|------|----|------|
| `backdrop-filter` | `blur(12px) saturate(180%)` | 主要玻璃模糊 |
| `backdrop-filter` (輕量) | `blur(8px) saturate(150%)` | 小元件玻璃模糊 |
| `background` (表面) | `rgba(255,255,255,0.05)` | 玻璃表面底色 |
| `background` (hover) | `rgba(255,255,255,0.08)` | Hover 狀態加亮 |
| `border` | `1px solid rgba(255,255,255,0.12)` | 玻璃邊框 |
| `border` (active) | `1px solid rgba(124,58,237,0.6)` | Active 狀態紫光邊框 |
| `box-shadow` | `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)` | 外陰影 + 內高光 |
| `box-shadow` (accent) | `0 0 20px rgba(124,58,237,0.3)` | 強調光暈 |

### 圓角規格

| 用途 | 值 | CSS 變數 |
|------|----|----------|
| 小元件（Tag / Badge） | `4px` | `--radius-sm` |
| 標準元件（卡片） | `12px` | `--radius` |
| 大容器（Panel） | `16px` | `--radius-lg` |
| 圓形（燈號） | `50%` | `--radius-full` |

---

## 動畫規格

### 時間與緩動

| 類型 | Duration | Easing | 用途 |
|------|----------|--------|------|
| 快速 | `150ms` | `ease-out` | Hover 過渡、色彩切換 |
| 標準 | `300ms` | `ease-out` | 元件進場、狀態切換 |
| 緩慢 | `600ms` | `cubic-bezier(0.34,1.56,0.64,1)` | Stage 完成閃光（彈性） |
| 循環 | `1500ms–2000ms` | `ease-in-out` | Pulse 脈衝 |
| 滑入 | `400ms` | `cubic-bezier(0.16,1,0.3,1)` | Stage / Agent 進場 |

### Keyframes 規格

| 動畫名稱 | 效果 | 應用場景 |
|----------|------|----------|
| `stage-slide-in` | `translateX(-20px) opacity:0` → `translateX(0) opacity:1` | Stage 卡片進場 |
| `stage-activate-glow` | Box-shadow 從 0 擴展到 `0 0 0 8px rgba(234,179,8,0)` | Stage 轉為 Active |
| `stage-complete-flash` | Scale 1 → 1.04 + 綠色光暈 → Scale 1 | Stage 完成確認 |
| `agent-pulse` | `box-shadow: 0 0 0 0 colorRgba` → `0 0 0 6px transparent` | Agent 燈號脈衝 |
| `agent-enter` | `opacity:0 translateX(-12px)` → `opacity:1 translateX(0)` | Agent 卡片進場 |
| `dot-pulse` | 連線燈號半徑擴散 | 連線狀態指示 |
| `confetti-burst` | 多粒子放射 + 重力落下 | 工作流完成慶祝 |
| `spin` | `rotate(0deg)` → `rotate(360deg)` | 載入 Spinner |
| `timeline-slide` | `translateY(-8px) opacity:0` → `translateY(0) opacity:1` | 新 Timeline 事件進場 |
| `glass-shimmer` | 對角線光澤從左到右掃過 | 卡片 Hover 光暈 |

---

## 元件規格

### 1. Stage 卡片（Pipeline 視覺化）

**尺寸**：寬 `88px`，高 `auto`（最小 `80px`）
**佈局**：Flex 橫排，間距 `8px`，並行 Stage 以分支形式呈現

| 狀態 | 背景 | 邊框 | 文字 | 動畫 |
|------|------|------|------|------|
| `pending` | `rgba(255,255,255,0.03)` | `rgba(255,255,255,0.08)` | `--text-muted` | 無 |
| `active` | `rgba(234,179,8,0.08)` | `rgba(234,179,8,0.6)` | `--text-primary` | `stage-activate-glow` 2s loop |
| `completed` | `rgba(34,197,94,0.08)` | `rgba(34,197,94,0.4)` | `--text-primary` | `stage-complete-flash` 0.6s once |
| `failed` | `rgba(239,68,68,0.08)` | `rgba(239,68,68,0.5)` | `--text-primary` | 紅色靜態邊框 |

**內部結構**：
```
┌─────────────────┐
│   [emoji 1.5rem]│
│   [label 0.7rem]│
│   [status icon] │
└─────────────────┘
```

**並行 Stage 佈局**：
```
PLAN → ARCH → [REVIEW │ TEST] → RETRO
              ↑ 並行分支 ↑
```
並行分支外層包裹 `.parallel-group`，使用 flex-column + 共用連線線

### 2. Agent 狀態燈號

**形狀**：圓形 `12px × 12px`（清單模式）/ `16px × 16px`（詳細模式）
**顏色**：對應 agent 的語義色（8 色）
**狀態效果**：

| 狀態 | 效果 |
|------|------|
| `standby` | 色彩 opacity 40%，無動畫 |
| `active` | 100% opacity + `agent-pulse` 動畫（外圍光環擴散） |
| `completed` | 100% opacity，切換為 `--status-pass` 綠色，無動畫 |
| `failed` | 切換為 `--status-fail` 紅色，快速閃爍 2 次後靜止 |

**Agent 卡片佈局**：
```
┌──────────────────────────────────┐  ← glass surface
│ [●燈號] agent-name      [⚡model]│
│         stage · duration         │
└──────────────────────────────────┘
```
左側 `3px` 邊框使用 agent 語義色；執行中狀態加 Spinner（CSS ::after）

### 3. Timeline 事件項目

**佈局**：3 欄 Grid（`80px 120px 1fr`）
**左側色條**：`3px solid` + 對應類別顏色

| 類別 | 色條顏色 |
|------|----------|
| workflow | `--color-purple` |
| stage | `--color-cyan` |
| agent | `--color-blue` |
| loop | `--color-yellow` |
| handoff | `--color-green` |
| parallel | `--color-orange` |
| error | `--color-red` |
| session | `--text-muted` |
| grader | `--color-pink` |

**新事件進場**：`timeline-slide` 動畫 300ms ease-out
**時間格式**：`HH:MM:SS`（等寬字體）
**Hover 效果**：背景 `rgba(255,255,255,0.04)`

### 4. Tab Bar

**位置**：Header 下方，sticky
**樣式**：
- 背景：`rgba(13,17,23,0.8)` + `backdrop-filter: blur(8px)`
- 邊框底部：`1px solid rgba(255,255,255,0.08)`
- 每個 Tab：padding `12px 16px`，底部 2px 邊框線

**Tab 狀態**：

| 狀態 | 底線顏色 | 文字顏色 |
|------|----------|----------|
| inactive | 透明 | `--text-secondary` |
| hover | `rgba(124,58,237,0.4)` | `--text-primary` |
| active | `--accent` (`#7c3aed`) | `--text-primary` |

### 5. 整體 Layout

**結構**：
```
┌─────────────────────────────────────────┐
│ HEADER: Logo | Session ID | 連線燈號     │  sticky, blur
├─────────────────────────────────────────┤
│ TABS: 概覽 | 時間軸 | 歷史               │  sticky
├──────────────────┬──────────────────────┤
│                  │                      │
│  LEFT PANEL      │  RIGHT PANEL         │
│  Pipeline        │  Timeline / History  │
│  Stage Cards     │  SSE 事件流          │
│  Agent Status    │  可捲動              │
│                  │                      │
└──────────────────┴──────────────────────┘
```

**響應式斷點**：
- `≥ 1200px`：雙欄（Left 45% + Right 55%）
- `768px – 1199px`：單欄，Pipeline 水平捲動
- `< 768px`：單欄，Stage 卡片縮小為 60px

---

## 無障礙規範

- 所有文字對比度 ≥ 4.5:1（WCAG AA）
- 可點擊元素：`cursor: pointer`
- Focus 狀態：`outline: 2px solid rgba(124,58,237,0.8)` + `outline-offset: 2px`
- 所有動畫遵守 `prefers-reduced-motion: reduce`（關閉全部 animation）
- 顏色不作為唯一資訊傳達手段（加文字 label）

---

## htmx + Alpine.js 整合建議

### CSS 變數宣告（`:root`）

```css
:root {
  /* 在現有變數基礎上新增 */
  --bg-canvas: #0a0a0f;
  --glass-surface: rgba(255,255,255,0.05);
  --glass-hover: rgba(255,255,255,0.08);
  --glass-border: rgba(255,255,255,0.12);
  --glass-border-active: rgba(124,58,237,0.6);
  --accent: #7c3aed;
  --accent-glow: rgba(124,58,237,0.4);
  --accent-light: #a78bfa;
  --radius-lg: 16px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
}
```

### Alpine.js Data 結構建議

```javascript
// Session Overview 狀態
{
  tab: 'overview',          // 'overview' | 'timeline' | 'history'
  workflow: {},             // 工作流 JSON
  events: [],               // timeline 事件陣列
  connected: false,         // SSE 連線狀態
  confettiPlayed: false,    // 避免重複播放 confetti
  timelineFilter: '',       // 類別篩選
}

// Agent 燈號狀態計算
getAgentStatus(name) → 'standby' | 'active' | 'completed' | 'failed'
getAgentPulseClass(name) → '' | 'agent-pulse-purple' | 'agent-pulse-cyan' | ...
```

### SSE 事件整合

- `workflow:complete` 事件 → 觸發 confetti 動畫（只觸發一次，用 `confettiPlayed` flag 控制）
- `stage:start` 事件 → Stage 卡片加 `stage-slide-in` class
- `agent:delegate` 事件 → Agent 燈號切換為 `active` + pulse 動畫
- `timeline` SSE frame → `events.push()` + scroll to bottom

---

## Overtone 特定色彩語義（registry.js 對齊）

```
purple (#a855f7): planner, retrospective, doc-updater
cyan   (#22d3ee): architect, designer
yellow (#eab308): developer, qa
blue   (#3b82f6): code-reviewer, refactor-cleaner
red    (#ef4444): security-reviewer, database-reviewer
orange (#f97316): debugger, build-error-resolver
pink   (#ec4899): tester
green  (#22c55e): e2e-runner
```

**重要**：以上顏色對應與 `registry.js` 的 `stages[].color` 完全對齊，不可修改。

---

> 注意：ui-ux-pro-max 未安裝，本設計規範為手動產出。
> 安裝方式：`claude plugin install --from github:nextlevelbuilder/ui-ux-pro-max-skill`
