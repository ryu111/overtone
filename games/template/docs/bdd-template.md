# DISPLAY_NAME — BDD 驗收標準

> 基於 GIVEN / WHEN / THEN 格式的遊戲行為驗收規格。
> 執行方式：使用 GUT 框架（`godot --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://tests/ -gexit`）

---

## Feature: 核心循環

### Scenario: 玩家完成一個行動後獲得反饋
  Given 遊戲已啟動，玩家處於遊玩狀態
  When 玩家執行核心行動（待定義：跳躍 / 攻擊 / 點擊）
  Then 0.1 秒內出現視覺反饋（粒子效果 / 動畫 / 畫面震動）
  And 分數或資源數值立即更新
  And 音效正確播放

### Scenario: 玩家死亡觸發死亡畫面
  Given 玩家生命值降至 0 或觸發死亡條件
  When 死亡事件發生
  Then 2 秒內出現死亡畫面
  And 死亡畫面顯示本局分數
  And 提供「重新開始」選項
  And 廣告觸發信號發送（供廣告 SDK 接收）

### Scenario: 玩家重新開始時狀態完全重置
  Given 玩家在死亡畫面按下「重新開始」
  When 新的一局開始
  Then 分數重置為 0
  And 生命值恢復初始值
  And 場景中所有障礙物和道具重置

---

## Feature: 操控手感

### Scenario: 主角回應玩家輸入
  Given 遊戲處於遊玩狀態
  When 玩家按下方向鍵 / 點擊
  Then 主角在同一幀開始移動（0 lag）
  And 移動速度符合設計規格（待填寫：像素/秒）

### Scenario: 手機觸控操控正常運作
  Given 遊戲在行動裝置瀏覽器中執行
  When 玩家點擊螢幕
  Then 觸控事件正確對應滑鼠事件
  And 主角回應與桌機版一致

---

## Feature: 發佈前品質 Checklist

```
□ 所有 GUT 測試通過（0 fail）
□ HTML5 export 成功，在 Chrome/Firefox/Safari 各測一次
□ 遊戲視窗 800×600 正確顯示，拉伸後不變形
□ 音效在瀏覽器中正常播放（注意 autoplay policy）
□ 廣告 SDK 整合測試（dev mode）
□ 死亡畫面廣告觸發正常
□ itch.io 頁面設定完整（標題、描述、截圖、標籤）
□ iframe 嵌入尺寸正確（viewportDimensions 設定）
□ 遊戲在 itch.io 頁面可正常啟動
```
