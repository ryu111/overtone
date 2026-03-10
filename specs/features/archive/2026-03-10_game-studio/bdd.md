# 自主遊戲工作室 BDD 規格

> Feature: game-studio
> 建立時間：2026-03-10

---

## Feature: game-dev skill 知識完整性

game-dev skill 儲存於 `~/.claude/skills/game-dev/SKILL.md` 及 `references/` 子目錄，
提供遊戲開發所需的技術知識與遊戲設計理論。

### Scenario: skill 包含 GDScript 技術 patterns
  Given `~/.claude/skills/game-dev/references/gdscript-patterns.md` 已建立
  When 讀取該文件
  Then 文件包含 signal/emit 使用模式的說明
  And 文件包含 Resource 繼承的設計模式
  And 文件包含 Node 生命週期（_ready / _process / _physics_process）的最佳實踐
  And 文件包含至少 5 個可複用的 GDScript 模式

### Scenario: skill 包含 Godot 節點與場景架構原則
  Given `~/.claude/skills/game-dev/references/godot-architecture.md` 已建立
  When 讀取該文件
  Then 文件包含場景繼承（Scene Inheritance）的使用時機說明
  And 文件包含節點組合（Composition over Inheritance）原則
  And 文件包含 AutoLoad（Singleton）的適用情境與反模式

### Scenario: skill 包含遊戲設計理論（核心循環與獎勵機制）
  Given `~/.claude/skills/game-dev/references/game-loop.md` 已建立
  When 讀取該文件
  Then 文件包含「核心循環（Core Loop）」的定義與設計方法
  And 文件包含 Mihaly Csikszentmihalyi 心流理論（Flow Theory）在遊戲設計的應用
  And 文件包含獎勵機制類型：固定獎勵、隨機獎勵、成就系統的設計差異
  And 文件包含難度曲線設計原則（避免 frustration / boredom 區間）

### Scenario: skill 包含多種遊戲類型的設計知識
  Given `~/.claude/skills/game-dev/references/game-loop.md` 或其他 reference 已建立
  When 讀取遊戲設計相關 reference
  Then 文件涵蓋 arcade（街機）類型的設計重點：短局制、高節奏、漸進難度
  And 文件涵蓋 puzzle（益智）類型的設計重點：「啊哈！」時刻設計、提示系統
  And 文件涵蓋 platformer（平台）類型的設計重點：手感調校、關卡漸進
  And 文件包含「適合廣告嵌入」的遊戲特徵描述（高重玩性、明確的局間轉場）

### Scenario: skill 包含 GUT 測試框架使用方式
  Given `~/.claude/skills/game-dev/references/testing.md` 已建立
  When 讀取該文件
  Then 文件包含 GUT headless 執行指令
  And 文件包含 GUT 測試腳本結構（extends GutTest / func test_xxx()）
  And 文件包含斷言方法速查（assert_eq、assert_true、assert_called 等）

### Scenario: game-dev SKILL.md 包含完整 Reference 索引
  Given `~/.claude/skills/game-dev/SKILL.md` 已建立
  When 讀取該文件
  Then 文件包含 consumers 表格（列出消費此 skill 的 agents）
  And 文件包含指向 gdscript-patterns.md、godot-architecture.md、game-loop.md、testing.md 的索引
  And 每個索引項目說明「何時讀取」

### Scenario: game-dev skill 通過 skill-score 品質門檻
  Given `~/.claude/skills/game-dev/SKILL.md` 已建立
  And `~/.claude/skills/game-dev/references/` 下至少 4 個文件已建立
  When 執行 `bun ~/.claude/scripts/skill-score.js game-dev`
  Then 總分 >= 80 分（滿分 120）
  And 結構維度（D5/D6：references 索引 + consumers 表格）得分 >= 8/10

---

## Feature: game-publish skill 知識完整性

game-publish skill 儲存於 `~/.claude/skills/game-publish/`，
提供遊戲發佈流程所需的技術知識，包含 Godot export、butler CLI 和 itch.io 上架。

### Scenario: skill 包含 Godot headless export 流程
  Given `~/.claude/skills/game-publish/references/godot-export.md` 已建立
  When 讀取該文件
  Then 文件包含 `godot --headless --export-release` 完整指令格式
  And 文件包含 export templates 安裝驗證方式（路徑：`~/.local/share/godot/export_templates/`）
  And 文件包含 export_presets.cfg 格式說明（preset name 需與指令參數對應）
  And 文件包含「templates 未安裝時靜默失敗」的風險說明與 fail-fast 解決方案

### Scenario: skill 包含 butler CLI 操作
  Given `~/.claude/skills/game-publish/references/butler.md` 已建立
  When 讀取該文件
  Then 文件包含 `butler push` 指令格式（target 格式：`{user}/{game}:{channel}`）
  And 文件包含 `BUTLER_API_KEY` 環境變數設定方式
  And 文件包含斷點續傳行為說明（butler 內建機制）
  And 文件包含 butler 回傳碼解讀（0=成功）

### Scenario: skill 包含 itch.io metadata 最佳實踐
  Given `~/.claude/skills/game-publish/references/itchio-metadata.md` 已建立
  When 讀取該文件
  Then 文件包含遊戲頁面 metadata 清單：標題、短描述、長描述、標籤的建議格式
  And 文件包含截圖規格建議（解析度、張數、示意內容）
  And 文件包含 HTML5 遊戲嵌入設定（viewportDimensions、fullscreen 設定）

### Scenario: skill 包含廣告整合策略
  Given `~/.claude/skills/game-publish/references/itchio-metadata.md` 已建立
  When 讀取遊戲發佈相關 reference
  Then 文件包含 HTML5 遊戲廣告 SDK 整合方式（如 AdSense 或 CrazyGames API）
  And 文件說明廣告適合插入的時機點（局間轉場、死亡畫面）
  And 文件說明廣告嵌入對 itch.io HTML5 遊戲的技術限制

### Scenario: game-publish SKILL.md 包含完整 Reference 索引
  Given `~/.claude/skills/game-publish/SKILL.md` 已建立
  When 讀取該文件
  Then 文件包含 consumers 表格
  And 文件包含指向 godot-export.md、butler.md、itchio-metadata.md 的索引
  And 每個索引項目說明「何時讀取」

---

## Feature: 遊戲專案初始化（new-game.sh）

`~/projects/overtone/games/scripts/new-game.sh` 負責建立新遊戲的完整目錄結構，
並將記錄寫入全域 registry.json。

### Scenario: 成功建立遊戲專案目錄
  Given `games/template/` 目錄存在且包含完整模板結構
  And `games/registry.json` 存在（或不存在，腳本可自動初始化）
  When 執行 `bash new-game.sh --name pixel-dungeon --display "Pixel Dungeon"`
  Then 建立 `games/pixel-dungeon/` 目錄
  And `games/pixel-dungeon/` 包含從模板複製的完整結構（src/、tests/、builds/、addons/gut/、docs/）
  And 建立 `games/pixel-dungeon/game.json`，包含 name、displayName、version("1.0.0")
  And 腳本以 exit code 0 結束

### Scenario: 重複名稱時拒絕建立
  Given `games/pixel-dungeon/` 目錄已存在
  When 執行 `bash new-game.sh --name pixel-dungeon`
  Then 腳本輸出包含「already exists」或類似的錯誤訊息
  And 腳本以非 0 exit code 結束
  And `games/pixel-dungeon/` 目錄內容不被修改
  And `games/registry.json` 不新增重複記錄

### Scenario: 寫入 registry.json
  Given `games/registry.json` 初始狀態為 `{ "games": [] }` 或不存在
  When 執行 `bash new-game.sh --name space-shooter --display "Space Shooter"`
  Then `games/registry.json` 的 `games` 陣列包含新遊戲記錄
  And 記錄包含 `name: "space-shooter"`、`displayName: "Space Shooter"`
  And 記錄包含 `createdAt`（ISO 8601 格式）
  And 記錄包含 `status: "concept"`
  And 記錄的 `itchSlug` 為 null

### Scenario: 並發初始化時 registry.json 不損毀
  Given `games/registry.json` 已存在，包含 1 個遊戲
  When 同時執行兩次 `bash new-game.sh`，分別建立不同名稱的遊戲
  Then `games/registry.json` 仍為合法 JSON
  And `games` 陣列包含 3 個記錄（原有 1 個 + 新增 2 個）
  And 不存在資料遺失或 JSON 損毀

### Scenario: 缺少必要參數時顯示 usage
  Given 腳本正常存在
  When 執行 `bash new-game.sh` 不提供任何參數
  Then 腳本輸出 usage 說明（含 --name 參數描述）
  And 腳本以非 0 exit code 結束

---

## Feature: 遊戲建置（build.sh）

`~/projects/overtone/games/scripts/build.sh` 執行 Godot headless export，
產出 builds/{platform}/ 目錄下的 export 產物。

### Scenario: 成功建置 HTML5 平台
  Given `games/pixel-dungeon/` 目錄存在且結構完整
  And Godot 4.x 已安裝（`godot` CLI 可執行）
  And HTML5 export templates 已安裝
  And `games/pixel-dungeon/export_presets.cfg` 包含 "HTML5" preset
  When 執行 `bash build.sh --game pixel-dungeon --platform html5`
  Then Godot headless export 成功執行
  And `games/pixel-dungeon/builds/html5/` 目錄包含 .html 和 .wasm 或 .pck 檔案
  And 腳本以 exit code 0 結束

### Scenario: export templates 未安裝時 fail-fast
  Given `games/pixel-dungeon/` 目錄存在
  And Godot 4.x 已安裝
  And `~/.local/share/godot/export_templates/` 目錄不存在或為空
  When 執行 `bash build.sh --game pixel-dungeon --platform html5`
  Then 腳本在執行 Godot export 之前偵測到 templates 缺失
  And 腳本輸出包含「export templates not installed」或類似錯誤訊息
  And 腳本以非 0 exit code 結束（不執行空 build）

### Scenario: dry-run 模式輸出預期執行指令但不實際 export
  Given `games/pixel-dungeon/` 目錄存在
  When 執行 `bash build.sh --game pixel-dungeon --platform html5 --dry-run`
  Then 腳本輸出將要執行的 Godot 指令（含完整參數）
  And 腳本不實際呼叫 Godot
  And `games/pixel-dungeon/builds/html5/` 目錄不被建立或修改
  And 腳本以 exit code 0 結束

### Scenario: 遊戲專案不存在時報錯
  Given `games/nonexistent-game/` 目錄不存在
  When 執行 `bash build.sh --game nonexistent-game --platform html5`
  Then 腳本輸出包含「game not found」或類似錯誤訊息
  And 腳本以非 0 exit code 結束

---

## Feature: 遊戲發佈（publish.sh）

`~/projects/overtone/games/scripts/publish.sh` 使用 butler CLI 推送至 itch.io，
並將發佈記錄 append 到 `games/{game}/publish-log.jsonl`。

### Scenario: 成功推送至 itch.io
  Given `games/pixel-dungeon/builds/html5/` 目錄包含 build 產物
  And `games/pixel-dungeon/game.json` 存在，包含有效的 itchChannel 設定
  And `BUTLER_API_KEY` 環境變數已設定且有效
  And butler CLI 可執行
  When 執行 `bash publish.sh --game pixel-dungeon --version 1.0.0 --channel html5`
  Then butler push 成功執行
  And 腳本以 exit code 0 結束

### Scenario: 成功發佈後寫入 publish-log.jsonl
  Given publish.sh 執行成功（butler push 回傳 exit code 0）
  When 執行 `bash publish.sh --game pixel-dungeon --version 1.0.0 --channel html5`
  Then `games/pixel-dungeon/publish-log.jsonl` 新增一行記錄
  And 記錄包含 `version: "1.0.0"`、`channel: "html5"`
  And 記錄包含 `publishedAt`（ISO 8601 格式）
  And 記錄包含 `dry: false`
  And 記錄為合法 JSON（可解析）

### Scenario: dry-run 模式不推送也不寫入正式記錄
  Given butler CLI 可執行
  When 執行 `bash publish.sh --game pixel-dungeon --version 1.0.0 --channel html5 --dry-run`
  Then 腳本輸出將要執行的 butler push 指令
  And butler 不實際執行推送
  And 若寫入 publish-log.jsonl，記錄的 `dry: true`
  And 腳本以 exit code 0 結束

### Scenario: butler 認證失敗時報錯並中止
  Given `BUTLER_API_KEY` 環境變數未設定或無效
  When 執行 `bash publish.sh --game pixel-dungeon --version 1.0.0 --channel html5`
  Then 腳本在 butler push 失敗後輸出認證錯誤訊息
  And 腳本以非 0 exit code 結束
  And `publish-log.jsonl` 不寫入失敗的發佈記錄

### Scenario: build 產物不存在時 fail-fast
  Given `games/pixel-dungeon/builds/html5/` 目錄不存在或為空
  When 執行 `bash publish.sh --game pixel-dungeon --version 1.0.0 --channel html5`
  Then 腳本在執行 butler push 之前偵測到 build 缺失
  And 腳本輸出包含「build not found」或類似錯誤訊息
  And 腳本以非 0 exit code 結束

---

## Feature: game-studio workflow 定義

`~/.claude/scripts/lib/registry.js` 包含 game-studio workflow 定義，
讓 `/game-studio` 或 `product` workflow 可使用此流程。

### Scenario: registry.js 包含 game-studio workflow 定義
  Given `~/.claude/scripts/lib/registry.js` 已修改
  When 讀取該檔案的 WORKFLOWS 或等效定義物件
  Then 包含 `'game-studio'` 鍵
  And 對應值包含 `label` 欄位，值為非空字串（如「遊戲工作室」）
  And 對應值包含 `stages` 陣列

### Scenario: game-studio workflow stages 正確
  Given registry.js 中 game-studio workflow 已定義
  When 讀取 `game-studio.stages` 陣列
  Then stages 包含 `'PM'`、`'PLAN'`、`'ARCH'`、`'TEST'`、`'DEV'`、`'REVIEW'`、`'RETRO'`、`'DOCS'`
  And stages 順序與 product workflow 一致（PM 在最前）
  And stages 不包含不存在於 registry 的自訂 stage

### Scenario: registry.js specsConfig 包含 game-studio
  Given registry.js 的 specsConfig 物件已修改
  When 讀取 `specsConfig['game-studio']`
  Then 值為包含 `'tasks'` 和 `'bdd'` 的陣列

### Scenario: registry.js 修改後 require 不拋出例外
  Given registry.js 已修改
  When 執行 `require('~/.claude/scripts/lib/registry.js')`
  Then 模組載入成功，不拋出 SyntaxError 或 ReferenceError
  And 匯出物件包含 WORKFLOWS、specsConfig 等既有欄位

---

## Feature: 遊戲專案模板（games/template/）

`~/projects/overtone/games/template/` 是遊戲專案模板目錄，
由 new-game.sh 複製到新遊戲目錄。

### Scenario: 模板包含完整 Godot 專案結構
  Given `games/template/` 目錄已建立
  When 列出目錄內容
  Then 包含 `project.godot`（Godot 專案設定檔）
  And 包含 `src/scenes/`、`src/scripts/`、`src/resources/` 子目錄（含 .gitkeep）
  And 包含 `tests/` 目錄（含 .gitkeep）
  And 包含 `builds/` 目錄（含 .gitignore 排除 build 產物）
  And 包含 `docs/GDD.md`（遊戲設計文件模板，非空）

### Scenario: GUT addon 已包含於模板
  Given `games/template/` 目錄已建立
  When 讀取 `games/template/addons/gut/` 目錄
  Then 目錄存在且非空
  And 包含 `plugin.cfg`（GUT addon 設定）
  And 包含 GUT 核心腳本（如 `gut.gd` 或等效入口）

### Scenario: export_presets.cfg 預設 HTML5
  Given `games/template/export_presets.cfg` 已建立
  When 讀取該檔案
  Then 檔案包含 `[preset.0]` 或類似的 HTML5 preset 定義
  And preset 的 `platform` 為 `"HTML5"` 或 `"Web"`
  And 檔案格式合法（可由 Godot 4.x 解析）

### Scenario: project.godot 為有效的 Godot 4.x 格式
  Given `games/template/project.godot` 已建立
  When 讀取該檔案
  Then 第一行包含 `; Engine configuration file`
  And 包含 `config_version=5`（Godot 4.x 格式）
  And 包含 `[application]` 區段，`config/name` 設定為佔位符（如 "GAME_NAME"）

### Scenario: docs 模板包含 GDD 和 devlog 骨架
  Given `games/template/docs/` 目錄已建立
  When 讀取 `games/template/docs/GDD.md`
  Then 文件包含「核心循環」、「玩家目標」、「遊戲機制」等章節標題
  And 文件不為空（不只有標題，包含說明用的佔位文字）
