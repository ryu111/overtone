# 設計品味指南（Design Taste）

> 適用對象：developer / designer agent 在實作 UI 或前端元件時使用
> 核心哲學：**少即是多，但每個細節都值得講究**
> 參考來源：Material Design、Vercel Web Interface Guidelines、Linear Design System、Josh W. Comeau、Smashing Magazine

---

## 1. 視覺層次原則

好的視覺層次讓使用者不用思考就知道「先看哪裡」。核心原則是**邏輯性的內容流向**（Linear Design 哲學）：遵循自然閱讀方向（上到下、左到右），減少認知負擔。

### Typography 比例系統

使用 modular type scale（建議 1.25 或 1.333 比例），搭配 CSS `clamp()` 實現流體排版：

```
標題（H1）    — font-size: clamp(1.75rem, 2.5vw, 2.25rem)，font-weight: 700，letter-spacing: -0.02em
副標題（H2）  — font-size: 1.25rem，font-weight: 600
正文（body）  — font-size: 1rem，font-weight: 400，line-height: 1.6
輔助文字      — font-size: 0.875rem，font-weight: 400，opacity: 0.6
標籤 / badge  — font-size: 0.75rem，font-weight: 500，letter-spacing: 0.04em，text-transform: uppercase
```

三個層次就夠，超過三層通常是設計失控的徵兆。

**排版細節**（Vercel Guidelines）：
- 使用彎引號（" "）而非直引號
- 數字用數字型態：「8 次部署」而非「八次部署」
- 數字比較場景使用 `font-variant-numeric: tabular-nums`
- 套用 `text-wrap: pretty` 改善斷行品質
- 行動裝置輸入框字體 ≥ 16px（防止 iOS Safari 自動縮放）

### 留白系統（Spacing Scale）

只使用以下數值，拒絕 magic numbers。使用 `rem` 單位讓間距跟隨使用者偏好縮放：

```
4px / 8px / 12px / 16px / 24px / 32px / 48px / 64px / 96px
(0.25rem / 0.5rem / 0.75rem / 1rem / 1.5rem / 2rem / 3rem / 4rem / 6rem)
```

- **相關元素間距**：4–8px（組內緊密）
- **元件內邊距**：12–16px
- **區塊間距**：24–48px（組間留白）
- **頁面邊距**：32–64px
- **觸控目標**：視覺 <24px 的元素，點擊區域擴展至 ≥ 24px（行動裝置 ≥ 44px）

### 對比度與焦點

- 主要行動元素（CTA）必須在視覺上脫穎而出，不能和其他元素「同等重要」
- WCAG AA 標準：正文對比度 ≥ 4.5:1；大字/圖示 ≥ 3:1（AAA 標準 ≥ 7:1）
- 進階：考慮使用 APCA（Accessible Perceptual Contrast Algorithm）取代 WCAG 2，更符合人眼感知
- 每個頁面只允許一個「最重要的元素」（hero / primary action）
- 互動狀態（:hover, :active, :focus）需要比靜態更高的對比度

---

## 2. 配色品味

### 安全策略：單色系 + accent

```
主色（Primary）    — 品牌色，只用在最重要的行動
中性色（Neutral）  — 灰色系，用於背景/邊框/次要文字（佔頁面 80%）
強調色（Accent）   — 與主色有足夠對比，用於高亮/狀態/徽章
語意色            — 成功(green) / 警告(amber) / 錯誤(red)，嚴格限用
```

**反模式**：用四種以上不同顏色的按鈕 → 沒有焦點，使用者不知道先按哪個。

### 暗色主題常見陷阱

| 陷阱 | 問題 | 修復 |
|------|------|------|
| 純黑背景（#000000）| 對比過強，眼睛疲勞 | 改用 #0a0a0a / #121212 / #141414（Material Design 推薦 #121212）|
| 白字直接放黑底 | 對比爆表，刺眼 | 高重點文字 87% 白、中重點 60%、停用 38%（Google 建議）|
| 高飽和色直接用 | 暗底上過於刺眼 | 降低飽和度，或使用 LCH 色彩空間確保感知均勻性（Linear 做法）|
| 暗色中的陰影 | 看不到，白費 | 改用亮色光暈（box-shadow: 0 0 0 1px rgba(255,255,255,0.08)）|
| 所有元素同色 | 無層次感 | 建立 3 層背景色：base / elevated / overlay |

### 暗色背景層次範例

```css
--bg-base:     #0f0f0f;   /* 頁面底層 */
--bg-elevated: #1a1a1a;   /* 卡片/面板 */
--bg-overlay:  #242424;   /* 下拉/Tooltip */
--border:      rgba(255, 255, 255, 0.08);  /* 邊框 */

/* 設定 color-scheme 讓捲軸等原生元件也跟著暗色 */
html { color-scheme: dark; }

/* meta tag 讓瀏覽器 UI 對齊 */
/* <meta name="theme-color" content="#0f0f0f"> */
```

### 暗色文字透明度系統（Material Design）

```css
--text-high:     rgba(255, 255, 255, 0.87);  /* 標題、重要文字 */
--text-medium:   rgba(255, 255, 255, 0.60);  /* 正文、次要資訊 */
--text-disabled: rgba(255, 255, 255, 0.38);  /* 停用、提示文字 */
```

### 漸層使用指南

- **Subtle > Bold**：漸層用於增加深度，不是製造衝突
- 背景漸層：角度 135°，起點終點色差在 15% 內
- 文字漸層：謹慎使用，確保可讀性
- **不要用**：彩虹漸層 / 多色漸層 / 高飽和漸層（除非品牌刻意風格）

```css
/* 好的漸層 — 細微有深度 */
background: linear-gradient(135deg, #1a1a1a 0%, #0f0f12 100%);

/* 壞的漸層 — 搶眼但廉價 */
background: linear-gradient(135deg, #ff0080 0%, #7928ca 100%);
```

---

## 3. 動效節奏

### 微動效的價值

微動效不是裝飾，是溝通：
- **Hover**：告訴使用者「這個可以點」
- **Focus**：告訴使用者「鍵盤現在在這裡」
- **Transition**：告訴使用者「狀態已經改變」
- **Loading**：告訴使用者「系統正在處理」（spinner/skeleton 延遲 150-300ms 後才顯示，避免閃爍）

### 時間函數選擇

| 場景 | 推薦 | 避免 |
|------|------|------|
| 元素進入 | `ease-out`（快進慢停，自然） | `linear`（機械感） |
| 元素離開 | `ease-in`（慢起快走） | `bounce`（輕浮感） |
| 互動回饋 | `ease-in-out` | `elastic`（遊戲感，工具不適合）|
| 微互動 | `cubic-bezier(0.4, 0, 0.2, 1)` — Material 標準 | 自訂過頭 |

**進階技巧**（Josh Collinsworth）：
- 避免使用瀏覽器預設的 `ease`、`ease-out` 關鍵字，自訂 `cubic-bezier()` 更精確
- 進入動效用 ease-out、離開動效用 ease-in（方向性 easing）
- 不同屬性可以用不同 easing：`transition: opacity linear 0.2s, transform cubic-bezier(0.5, 0, 0.5, 1) 0.3s`
- 連續元素用 staggered delay 製造流暢感（每個元素延遲 50-100ms）

### 持續時間甜蜜區

```
50-100ms   — 即時回饋（hover, active state）
150-200ms  — 標準轉場（顏色, 邊框, 透明度）
200-300ms  — 位置/大小移動
300-500ms  — 面板展開/收折（loading spinner 最短顯示時間也在此範圍）
500ms+     — 只用於頁面級切換，謹慎
```

**黃金法則**：讓使用者感受不到動效的存在，但移除後感覺「少了什麼」。最大的新手錯誤是動效持續太久。

### 效能與無障礙

```css
/* 只動畫 GPU 加速屬性 — 避免 width/height/top/left/margin/padding */
/* 好：transform, opacity */
/* 避免：直接動畫 width, height, left, right */

/* 永遠不要用 transition: all — 逐一指定屬性 */
transition: opacity 0.2s ease-out, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

/* 尊重使用者偏好 — reduced-motion ≠ 零動效，保留淡入淡出 */
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* 卡頓時才用 will-change，不要預設加 */
.problematic-element { will-change: transform; }
```

```css
/* 標準 token */
--duration-instant:  100ms;
--duration-fast:     200ms;
--duration-normal:   300ms;
--easing-standard:   cubic-bezier(0.4, 0, 0.2, 1);
--easing-decelerate: cubic-bezier(0, 0, 0.2, 1);  /* ease-out */
--easing-accelerate: cubic-bezier(0.4, 0, 1, 1);  /* ease-in */
```

### 微動效清單（常見遺漏）

- **透明度變化**：hover 時 opacity 從 0.7 → 1（而非直接切換顏色）
- **位移距離**：slide 效果保持在 5-40px 範圍內（太大會分散注意力）
- **淡入起點**：從 `opacity: 0.4` 開始而非 `0`（更自然、更快感知到）
- **陰影過渡**：hover 時加深陰影表達「浮起」感

---

## 4. 反模式（常見「平淡」原因）

### 反模式 1：缺乏視覺層次

**徵兆**：標題和正文幾乎一樣大，所有按鈕高度相似，頁面看起來「一片平」。

**修復**：強化標題尺寸差距（至少 1.5x 比例），降低次要元素的視覺重量（opacity / smaller / lighter weight）。

### 反模式 2：間距不一致

**徵兆**：元素間距是 13px、17px、22px 這類奇怪數值（magic numbers）。

**修復**：建立 spacing scale token，所有間距只從 4/8/12/16/24/32/48 選取。

### 反模式 3：沒有焦點元素

**徵兆**：頁面打開後不知道該先看哪裡，每個元素「同等重要」。

**修復**：指定一個 hero element — 最大的文字、最亮的按鈕、最顯眼的圖片。其他元素讓路。

### 反模式 4：過度裝飾

**徵兆**：大量陰影、多層邊框、複雜漸層、圓角 + 陰影 + 發光效果全部疊加。

**修復**：移除 2/3 的裝飾效果後重新評估。裝飾應服務於內容，而非成為主角。

### 反模式 5：狀態缺失

**徵兆**：按鈕沒有 hover / active / disabled 樣式，輸入框 focus 沒有高亮，選中項看不出選中。

**修復**：每個互動元素必須有完整的狀態系統（default / hover / active / focus / disabled）。

### 反模式 6：對齊混亂

**徵兆**：文字對齊不一致（有些左對齊有些置中），圖示和文字基線不對齊。

**修復**：選定一個主軸（通常左對齊），只在特定場合（標題/數字卡片）用置中。

---

## 5. 靈感範例（Developer Tool 領域）

### Linear — 暗色極簡典範

- **深色主題**：#0f0f0f 底 + #1a1a1a 面板，不是純黑。2025 年更新進一步減少色彩，從「暗藍色單色調」轉向「純黑白 + 極少量強調色」
- **主題系統**：只需 3 個變數（底色、強調色、對比度）就能生成完整主題，使用 LCH 色彩空間確保感知均勻性
- **微妙漸層**：幾乎察覺不到，只是增加深度。搭配 noise overlay 增加質感
- **極簡圖標**：線條圖標，統一粗細（1.5px stroke）
- **學習點**：留白比內容更重要；每個功能有自己的視覺領地；「可擴展性和標準化優先於差異化」

### Raycast — 功能美學典範

- **毛玻璃**：backdrop-filter: blur(20px)，背景不完全透明
- **圓角**：大圓角（12-16px）配合 Apple 設計語言
- **鍵盤優先**：快捷鍵 badge 是 UI 的一等公民，不是事後加的
- **學習點**：UI 語言和使用場景要一致；鍵盤用戶是一等公民

### Arc Browser — 大膽創新典範

- **品牌配色**：不怕用鮮豔色，但嚴格控制使用範圍
- **Space 概念**：容器本身就是 UI 的一部分
- **流暢動效**：每個切換都有明確的動效，傳遞空間感
- **學習點**：大膽嘗試需要有清晰的設計哲學支撐，不能只是「好看」

### Vercel Dashboard — 數據可視化典範

- **Geist 字體系統**：自研 Geist Sans + Geist Mono，typography class 預設 font-size / line-height / letter-spacing / font-weight 組合
- **極簡底色**：幾乎全用白/淺灰，讓數據本身說話
- **數據可視化**：圖表是一等公民，有足夠空間和清晰的 label
- **一致的 spacing**：4px grid system 貫穿全站
- **Web Interface Guidelines**：公開的設計指南涵蓋排版、互動、無障礙、效能等 50+ 條具體規則
- **學習點**：工具的美來自清晰的資訊架構，不是視覺特效；文案用主動語態和行動導向語言

### 共通設計趨勢（2025-2026）

- **極簡但有個性**：乾淨佈局 + 大膽排版 + 細微動效的組合
- **微一致性**：連最小的細節（圓角半徑、陰影層數、icon 粗細）都跨全站標準化
- **效能即體驗**：CSS 純碼實現視覺效果（漸層、glassmorphism），減少圖片依賴
- **Design Token 化**：所有設計值（色彩、間距、圓角、陰影）編碼為 CSS custom properties，支援主題切換

---

## 6. 快速 Checklist（5 秒掃描）

在提交任何 UI 實作前，先過這份 checklist：

### 視覺層次
- [ ] 有明確的視覺層次嗎？標題 > 正文 > 輔助文字，大小差距足夠
- [ ] 頁面有一個「最重要的元素」嗎？使用者眼睛知道先看哪裡

### 間距
- [ ] 所有間距都在 spacing scale 內？（4/8/12/16/24/32/48px）
- [ ] 相關元素靠近，無關元素保持距離

### 互動狀態
- [ ] 所有互動元素有 hover 狀態嗎？
- [ ] 有 focus 狀態嗎？（鍵盤使用者需要）
- [ ] 有 disabled / loading 狀態嗎？

### 配色
- [ ] 配色有主色 + 中性色 + accent 嗎？沒有超過三種主色
- [ ] 暗色主題的背景色不是純黑（#000）嗎？
- [ ] 文字對比度符合 WCAG AA 標準嗎？

### 細節
- [ ] 有至少一個讓人注意的細節嗎？（精緻的 hover 效果、巧妙的圖示選擇等）
- [ ] 動效時間在 150-300ms 範圍內嗎？
- [ ] 沒有不必要的裝飾（陰影/漸層/邊框疊太多）嗎？

---

## 快速判斷：「夠好」vs「有品味」

| 維度 | 夠好 | 有品味 |
|------|------|--------|
| 顏色 | 功能性配色，不難看 | 單色系 + accent，有呼吸感，LCH 感知均勻 |
| 間距 | 大概一致 | spacing scale + rem 單位，精確且可存取 |
| 動效 | 有 transition 就好 | 每個動效都有理由，節奏統一，尊重 prefers-reduced-motion |
| 文字 | 看得清楚 | 字重/大小/間距構成層次系統，tabular-nums，text-wrap: pretty |
| 狀態 | default / hover | 完整五態 + :focus-visible（不干擾滑鼠用戶）|
| 細節 | 沒有明顯錯誤 | 有一個讓人驚喜的小細節 |
| 效能 | 能跑就好 | 只動畫 transform/opacity，永不 transition: all |

---

## 參考資源

- [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) — 50+ 條具體的 Web UI 規則
- [Linear Design 趨勢分析](https://blog.logrocket.com/ux-design/linear-design/) — Linear 風格的設計哲學和實踐
- [Josh Collinsworth: Ten Tips for Better Transitions](https://joshcollinsworth.com/blog/great-transitions) — CSS 動效最佳實踐
- [Josh W. Comeau: CSS Transitions Guide](https://www.joshwcomeau.com/animation/css-transitions/) — 互動式 CSS 轉場教學
- [Smashing Magazine: Inclusive Dark Mode](https://www.smashingmagazine.com/2025/04/inclusive-dark-mode-designing-accessible-dark-themes/) — 無障礙暗色主題設計
- [Material Design Dark Theme](https://m3.material.io/styles/color/dark-theme) — Google 暗色主題規範
- [MDN: CSS Transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Transitions/Using) — 官方 CSS 轉場文件
