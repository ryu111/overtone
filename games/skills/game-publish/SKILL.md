---
name: game-publish
description: Godot 遊戲發佈流程知識。涵蓋 headless export、butler CLI 推送至 itch.io、頁面 metadata 最佳實踐、廣告整合策略。
user-invocable: false
---

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 建置 Godot 遊戲、推送至 itch.io、設定廣告整合 |

## 發佈流程決策樹

在開始發佈前，先依序確認：
1. export templates 已安裝？ → NO → 先安裝（Godot Editor → Editor → Manage Export Templates）
2. export_presets.cfg 的 name 與 export 指令參數完全一致？ → NO → 對齊命名
3. BUTLER_API_KEY 已設定？ → NO → 先設定環境變數
4. builds/ 目錄有產物？ → NO → 先執行 build.sh

## 發佈流程快速參考

```bash
# 1. 驗證 export templates（macOS）
ls ~/Library/Application\ Support/Godot/export_templates/

# 2. 前置 import（必做，否則資源索引過期）
godot --headless --import --path .

# 3. headless export
godot --headless --export-release "Web" ./builds/html5/index.html

# 4. 驗證產物
ls builds/html5/

# 5. 推送至 itch.io
export BUTLER_API_KEY=xxx
butler push builds/html5/ {user}/{game}:html5 --userversion "1.0.0"
```

## 關鍵知識（非直覺）

- **templates 靜默失敗**：export 指令不報錯，但 build 為空 → MUST 前置驗證
- **--import 必須先跑**：跳過會導致資源索引過期，export 漏掉新增資源
- **channel 命名決定平台 tag**：`html5` 自動標為 browser play，錯誤命名影響分類
- **butler 只上傳 diff**：首次全量較慢，之後只傳差異，斷點續傳自動處理
- **itch.io 廣告限制**：iframe sandbox 阻擋第三方 Cookie → CrazyGames/Poki SDK 才正確，AdSense 在 itch.io 不可靠

## 部署目標選擇

| 目標 | COOP/COEP headers | 廣告整合 | 推薦場景 |
|------|:-----------------:|---------|---------|
| Vercel | 支援 vercel.json | 完整支援 | 主要部署目標 |
| GitHub Pages | 不支援 | 受限 | 靜態展示，不需 threading |
| itch.io | iframe 限制 | CrazyGames/Poki SDK | 廣告變現主平台 |

## Reference 索引

| 文件 | 何時讀取 |
|------|---------|
| ./references/godot-export.md | 執行 Godot headless export、設定 export_presets.cfg、部署至 Vercel/GitHub Pages、設定 CI/CD 時 |
| ./references/butler.md | 使用 butler CLI 推送至 itch.io、設定 BUTLER_API_KEY、解讀 exit code 時 |
| ./references/itchio-metadata.md | 撰寫遊戲頁面 metadata、設定截圖、整合廣告 SDK（CrazyGames/Poki）、設定 viewportDimensions 時 |

## NEVER

- NEVER 在未驗證 export templates 的情況下直接執行 export，because templates 缺失時 godot 靜默失敗，產出空 build 且沒有錯誤訊息
- NEVER 將 BUTLER_API_KEY 硬編碼在腳本中，because API key 洩漏到 git 歷史後無法撤銷
- NEVER 在 itch.io HTML5 遊戲中直接嵌入 Google AdSense，because itch.io iframe sandbox 阻擋第三方 Cookie，廣告無法載入
- NEVER 跳過 `godot --headless --import` 前置步驟，because 資源索引過期會導致 export 漏掉新增資源
- NEVER 使用 GitHub Pages 部署需要 SharedArrayBuffer 的 Godot Web export，because GitHub Pages 不支援自訂 headers，COOP/COEP 無法設定
