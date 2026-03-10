# itch.io 頁面 Metadata 與廣告整合

> 遊戲上架最佳實踐、HTML5 嵌入設定、廣告整合策略

---

## 遊戲頁面 Metadata

### 標題（Title）

- 長度：1–100 字元
- 建議：簡潔有力，包含核心玩法關鍵字
- 範例：`Pixel Dungeon`、`Space Shooter Chaos`

### 短描述（Tagline）

- 長度：≤ 160 字元（顯示於搜尋結果和預覽卡片）
- 建議：一句話說明核心樂趣
- 範例：`A fast-paced roguelike dungeon crawler with pixel art aesthetics`

### 長描述（Description）

支援 Markdown 格式：

```markdown
## 關於遊戲

[核心玩法說明，2–3 句]

## 特色

- ✨ [特色 1]
- 🎮 [特色 2]
- 🏆 [特色 3]

## 操作方式

| 鍵位 | 動作 |
|------|------|
| WASD / 方向鍵 | 移動 |
| Space | 跳躍 |
| Z / X | 攻擊 |

## 開發工具

Godot 4.x · GDScript · Web Export
```

### 標籤（Tags）

建議 5–10 個標籤，組合遊戲類型 + 技術 + 風格：

| 類型 | 建議標籤 |
|------|---------|
| 遊戲類型 | `arcade`、`puzzle`、`platformer`、`roguelike`、`action` |
| 技術 | `html5`、`godot`、`browser-game`、`webgl` |
| 風格 | `pixel-art`、`casual`、`one-button` |
| 受眾 | `singleplayer`、`family-friendly` |

---

## 截圖規格

### 尺寸建議

| 用途 | 解析度 | 備注 |
|------|--------|------|
| 標準截圖 | 1280×720 | 推薦，16:9 比例 |
| 備用截圖 | 640×480 | 4:3 比例遊戲適用 |
| Cover image | 630×500 | itch.io 遊戲卡片封面 |

### 張數與內容

- **最少 3 張**（itch.io 建議 3–8 張）
- 第 1 張：最具吸引力的遊玩畫面（作為主要展示）
- 第 2 張：不同場景或特色功能
- 第 3 張：UI / HUD 展示或多樣性展示
- 可加入 GIF 展示遊玩動態（最大 3MB）

---

## HTML5 遊戲嵌入設定

在 itch.io 後台的「Edit game」→「Uploads」→ HTML5 設定：

### viewportDimensions

```
寬度 × 高度（像素）
```

應與 `project.godot` 的 viewport 設定一致：

```ini
# project.godot
[display]
window/size/viewport_width=800
window/size/viewport_height=600
```

對應 itch.io 設定：
- Viewport dimensions：`800 × 600`

### Fullscreen 設定

勾選 `Enable fullscreen button`（讓玩家可切換全螢幕）。

---

## 廣告整合策略

短期以廣告營收為主，以下整合方案由適合到不適合排序：

### 方案一：CrazyGames API（推薦）

**適用**：在 CrazyGames 平台上架的 HTML5 遊戲

```html
<!-- 在 HTML5 export shell 的 <head> 加入 -->
<script src="//sdk.crazygames.com/crazygames-sdk-v3.js"></script>
```

```javascript
// 初始化 SDK
await CrazyGames.SDK.init();

// 廣告觸發時機（遊戲結束後）
async function showAdAfterGameOver() {
  try {
    await CrazyGames.SDK.ad.requestAd("midgame");
    // 廣告播放完成，繼續遊戲
    resumeGame();
  } catch (e) {
    // 廣告不可用，靜默繼續
    resumeGame();
  }
}
```

廣告觸發時機（GDScript 發送信號）：
```gdscript
# game_manager.gd
signal game_over
signal level_complete

func _on_player_died():
    emit_signal("game_over")
    # JavaScript bridge（Godot 4.x）
    JavaScriptBridge.eval("showAdAfterGameOver()")
```

### 方案二：Poki SDK

**適用**：在 Poki 平台上架的 HTML5 遊戲

```html
<script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
```

```javascript
// 遊戲載入完成通知
PokiSDK.gameLoadingFinished();

// 觸發廣告（死亡畫面後）
async function showInterstitialAd() {
  await PokiSDK.commercialBreak();
  // 廣告結束，繼續遊戲
}

// 告知 SDK 遊戲開始播放
PokiSDK.gameplayStart();
PokiSDK.gameplayStop();  // 進入 menu 時呼叫
```

### 方案三：Google AdSense / Ad Manager

**注意事項**：
- AdSense 對 HTML5 遊戲的自動廣告支援有限
- 適合在自有域名（Vercel / Netlify）部署，而非 itch.io 嵌入
- 需要申請審核（新域名通常需 6 個月流量）

### itch.io 廣告嵌入技術限制

itch.io 以 `<iframe>` 方式嵌入遊戲，存在以下限制：

| 限制 | 說明 |
|------|------|
| `sandbox` 屬性 | iframe 可能有 `allow-scripts allow-same-origin`，限制第三方 Cookie |
| 第三方 SDK | 部分廣告 SDK 需要存取上層 window，在 iframe 中無法正常運作 |
| SharedArrayBuffer | itch.io iframe 不保證設定 COOP/COEP headers |
| GDPR / 隱私 | 廣告 SDK 在 EU 需要 Cookie Consent，itch.io 不提供此機制 |

**建議**：
- 若要在 **itch.io** 嵌入廣告：使用 CrazyGames 或 Poki 等原生整合 HTML5 遊戲廣告的平台
- 若要完整廣告控制：部署至自有域名（Vercel），直接使用 AdSense 或 Ad Manager

---

## 廣告觸發時機設計

適合插入廣告的時機（不打斷遊戲體驗）：

```
觸發時機          實作方式
─────────────────────────────────
遊戲結束後        player.died signal → 死亡畫面 → 廣告 → 重試按鈕
關卡完成後        level.completed signal → 結算畫面 → 廣告 → 下一關
返回主選單後      scene 切換到 main_menu → 廣告（最多每 3 分鐘一次）
```

**間隔控制（避免廣告疲勞）**：
```gdscript
# ad_manager.gd（AutoLoad）
var _last_ad_time: float = -180.0
const AD_COOLDOWN_SECONDS = 180.0  # 最少 3 分鐘間隔

func can_show_ad() -> bool:
    return Time.get_ticks_msec() / 1000.0 - _last_ad_time >= AD_COOLDOWN_SECONDS

func show_interstitial():
    if not can_show_ad():
        return
    _last_ad_time = Time.get_ticks_msec() / 1000.0
    JavaScriptBridge.eval("showInterstitialAd()")
```

---

## 商業模式考量

| 模式 | 適用場景 | 預期收益 |
|------|---------|---------|
| 免費 + 廣告（CrazyGames/Poki）| 高流量平台遊戲 | $1–5 CPM |
| 免費 + 自願付費（itch.io Pay What You Want）| 有忠實玩家社群 | 低但穩定 |
| 付費下載（$1–5）| 有明確完成度的獨立遊戲 | 最高單次收益 |
| 免費 + 廣告 + 付費去廣告版 | 中等規模遊戲 | 平衡覆蓋率與收益 |

**短期廣告營收優化重點**：
1. 上架至 CrazyGames / Poki（流量大、廣告整合成熟）
2. 確保遊戲有明確的「局間轉場」（death / level complete）供廣告植入
3. 遊戲時長控制在 3–5 分鐘內（高重玩性 = 更多廣告機會）
