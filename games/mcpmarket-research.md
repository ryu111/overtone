# Randroids-Dojo/Godot-Claude-Skills 研究報告

> 研究日期：2026-03-10
> 目標：為 game-studio feature 移植 Godot skill 內容

---

## SKILL.md 分析

### 知識範疇摘要

原 repo 的 `skills/godot/SKILL.md` 涵蓋：
1. **GdUnit4**（GDScript 單元測試框架）— 在 Godot 內部執行，語言：GDScript
2. **PlayGodot**（遊戲自動化框架）— 類似 Playwright，語言：Python，需要客製 Godot fork
3. **Web Export**（HTML5/WebAssembly 建置）— headless export 流程
4. **CI/CD**（GitHub Actions 整合）— 測試 + 建置 + 部署
5. **部署目標**：Vercel、GitHub Pages、itch.io、Netlify

### 可直接移植的內容

| 項目 | 內容 | 目標位置 |
|------|------|---------|
| GdUnit4 快速指令 | `godot --headless --run-tests` 完整格式 | `game-dev/references/testing.md` |
| GdUnit4 斷言 API | 完整的 `assert_that().is_*` 方法清單 | `game-dev/references/testing.md` |
| GdUnit4 場景測試模式 | `scene_runner` + input simulation | `game-dev/references/testing.md` |
| Web Export 流程 | headless export + export_presets.cfg 格式 | `game-publish/references/godot-export.md` |
| Vercel 部署 | CORS headers + vercel.json 設定 | `game-publish/references/godot-export.md` |
| itch.io / butler | `butler push` 格式、BUTLER_API_KEY | `game-publish/references/butler.md` |
| CI/CD YAML | GitHub Actions 完整範例 | `game-publish/references/godot-export.md` |
| project.godot 結構 | Godot 4.x config 格式（config_version=5） | `games/template/project.godot` |

### 需要修改/擴展的內容

| 項目 | 問題 | 修改方向 |
|------|------|---------|
| GdUnit4 vs GUT | BDD spec 要求 GUT（Godot Unit Test），原 repo 用 GdUnit4 | 改寫為 GUT 語法（`extends GutTest`、`assert_eq`） |
| PlayGodot | BDD spec 未要求，且需要客製 Godot fork | **不移植**（out of scope） |
| skill 描述語言 | 原 repo 英文 | 改寫為繁體中文（符合專案規範） |
| 遊戲設計理論 | 原 repo 沒有 | **需新增**（見下方「需要新增的內容」） |
| 廣告整合 | 原 repo 沒有 | **需新增**（見下方） |

---

## References 分析

### gdunit4-quickstart.md（高移植價值）

- 內容：安裝方式（Asset Library / git clone / submodule）、測試生命週期、memory management、parameterized tests、mocking
- 移植價值：測試生命週期（before/after/before_test/after_test）和 `auto_free()` 模式可直接轉為 GUT 對應語法
- 注意：GUT 語法差異：extends `GutTest`（非 `GdUnitTestSuite`）、`assert_eq`（非 `assert_that().is_equal()`）

### assertions.md（高移植價值）

- 內容：完整 GdUnit4 斷言 API — 值、數字、字串、陣列、字典、物件、信號、Vector、檔案
- 移植價值：概念完全可移植，需翻譯為 GUT 對應方法
- GUT 對應：`assert_eq` / `assert_true` / `assert_called` / `watch_signals` + `assert_signal_emitted`

### scene-runner.md（部分移植價值）

- 內容：場景 runner 的滑鼠/鍵盤/touch 輸入模擬 API
- 移植價值：概念可用，但 GUT 的場景整合測試方式不同（用 `add_child` + `queue_free`）
- 結論：提取「輸入模擬原則」概念，不直接移植 API

### ci-integration.md（高移植價值）

- 內容：GitHub Actions YAML（GdUnit4 + PlayGodot）、GitLab CI、caching、matrix testing
- 移植價值：GitHub Actions setup-godot action 和 headless 執行方式完全適用
- 結論：直接移植到 `game-publish/references/godot-export.md` 的 CI/CD 區塊

### deployment.md（高移植價值）

- 內容：Web Export 設定、Vercel（含 CORS headers）、GitHub Pages、itch.io（butler）、Netlify
- 移植價值：全部適用，特別是 Vercel `vercel.json` 的 CORS headers 設定是關鍵知識
- SharedArrayBuffer 限制說明（GitHub Pages 不支援自訂 headers）是重要的 risk 說明

### playgodot.md（不移植）

- 原因：需要客製 Godot fork，在 BDD spec 中未要求，屬於 out of scope
- 可保留的概念：parallel test 的 port 衝突問題（可作為 future reference 筆記）

### gdunit4-quickstart.md → GUT 對應表

| GdUnit4 | GUT 對應 |
|---------|---------|
| `extends GdUnitTestSuite` | `extends GutTest` |
| `func before_test()` | `func before_each()` |
| `func after_test()` | `func after_each()` |
| `assert_that(v).is_equal(e)` | `assert_eq(v, e)` |
| `assert_that(v).is_true()` | `assert_true(v)` |
| `assert_that(v).is_not_null()` | `assert_not_null(v)` |
| `assert_that(arr).has_size(n)` | `assert_eq(arr.size(), n)` |
| `auto_free(obj)` | 手動 `add_child(obj)` + `after_each` 清理 |
| signal 斷言 | `watch_signals(obj)` + `assert_signal_emitted(obj, "sig")` |
| `skip("reason")` | `pending("reason")` |

---

## Scripts 分析

### run_tests.py（參考用，不移植）

- 功能：尋找 Godot 可執行檔 → 驗證專案 → 執行 GdUnit4 headless → 回傳 exit code
- 是否移植：BDD spec 要求 bash scripts，且目標是 GUT 而非 GdUnit4
- 可參考：find_godot() 邏輯（GODOT/GODOT4 env var 優先，fallback 到 PATH）

### export_build.py（高參考價值，轉為 build.sh）

- 功能：驗證 project 存在 → 檢查 export templates → 讀取 presets → 執行 godot export
- 關鍵邏輯可轉為 bash：
  - template 路徑：`~/.local/share/godot/export_templates/` 和 macOS `~/Library/Application Support/Godot/export_templates/`
  - dry-run 模式：只輸出指令不執行
  - fail-fast：templates 缺失時立即報錯，不執行空 build
- 轉換為：`games/scripts/build.sh`

### parse_results.py（參考用，不移植）

- 功能：解析 JUnit XML → 輸出 summary/json/markdown 格式
- GUT 輸出 JUnit XML 格式，概念相容
- 決定：不移植（BDD spec 未要求 CI result parsing）

### validate_project.py（高參考價值）

- 功能：檢查 project.godot 存在 → import → 驗證 GDScript 語法
- 關鍵點：`godot --headless --import` 是建置前必要步驟
- 轉換為 build.sh 的前置步驟

---

## 範例專案分析

### project.godot 結構

```ini
config_version=5          ← Godot 4.x 必要欄位

[application]
config/name="GAME_NAME"   ← 用於模板時改為佔位符
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.3", "Forward Plus")
config/icon="res://icon.svg"

[display]
window/size/viewport_width=600
window/size/viewport_height=700

[rendering]
renderer/rendering_method="gl_compatibility"   ← Web/行動裝置相容性
```

- `gl_compatibility` 渲染器是 HTML5 export 的最佳選擇（Vulkan 在 Web 不支援）
- `config/features` 要與實際 Godot 版本對應

### 目錄結構（模板參考）

```
example-project/
├── addons/              ← GUT addon 放這裡
├── export_presets.cfg   ← Web export 設定
├── icon.svg
├── project.godot
├── scenes/              ← 對應 BDD spec 的 src/scenes/
├── scripts/             ← 對應 BDD spec 的 src/scripts/
├── test/                ← GdUnit4 測試目錄
├── tests/               ← PlayGodot 測試目錄（不需要）
└── vercel.json          ← CORS headers（關鍵！）
```

### vercel.json（可直接使用）

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

這是 Godot Web export 正常運行的必要條件（SharedArrayBuffer threading 需要這兩個 header）。

---

## 移植建議

### 直接移植的內容清單

| 來源 | 目標 | 備注 |
|------|------|------|
| `deployment.md` → Web Export + Vercel + itch.io 區塊 | `game-publish/references/godot-export.md` | 合併 CI 流程 |
| `ci-integration.md` → GitHub Actions YAML | `game-publish/references/godot-export.md` | 追加到 export.md |
| `deployment.md` → butler 區塊 | `game-publish/references/butler.md` | 含 BUTLER_API_KEY 說明 |
| `export_build.py` 的 template 路徑檢查邏輯 | `games/scripts/build.sh` | 轉為 bash |
| `example-project/vercel.json` | `games/template/vercel.json` | 原樣複製 |
| `example-project/project.godot` 結構 | `games/template/project.godot` | 改 config/name 為佔位符 |
| `export_presets.cfg` 格式 | `games/template/export_presets.cfg` | platform 用 "Web" |

### 需要新增的內容（原 repo 沒有但 BDD spec 要求的）

#### 1. 遊戲設計理論（`game-dev/references/game-loop.md`）

需新增：
- **核心循環（Core Loop）定義**：行動 → 反饋 → 決策 的循環結構
- **Mihaly Csikszentmihalyi 心流理論**：挑戰/技能比例圖、Flow Channel 概念
- **獎勵機制類型**：固定間隔（Fixed Ratio）、可變間隔（Variable Ratio）、成就系統設計
- **難度曲線**：frustration zone vs boredom zone、動態難度調整（DDA）原則
- **遊戲類型設計重點**：
  - Arcade：短局制（≤3 分鐘）、高節奏、漸進難度（每30秒加速）
  - Puzzle：「啊哈！」時刻、漸進提示系統（不直接給答案）
  - Platformer：手感調校（土狼時間、跳躍緩衝）、關卡漸進（教學第一關）
- **廣告嵌入友善特徵**：高重玩性、明確局間轉場（death screen/level complete）

#### 2. GUT 測試框架（`game-dev/references/testing.md`）

需新增（原 repo 用 GdUnit4，BDD spec 要求 GUT）：
- GUT headless 執行指令
- GUT 測試腳本結構（`extends GutTest`）
- GUT 斷言方法速查（`assert_eq`、`assert_true`、`watch_signals`）
- GUT 安裝方式（addons 目錄 + plugin 啟用）

#### 3. 廣告整合策略（`game-publish/references/itchio-metadata.md`）

需新增：
- HTML5 遊戲廣告 SDK：CrazyGames API、Poki SDK、AdSense 限制說明
- 廣告觸發時機：`game_over` 信號後、level complete 後、主選單返回時
- itch.io 技術限制：iframe 沙盒環境、第三方 JS SDK 注意事項
- itch.io 頁面 metadata：截圖規格（640×480 或 1280×720）、HTML5 viewportDimensions 設定

#### 4. GDScript patterns（`game-dev/references/gdscript-patterns.md`）

需完全新增（原 repo 沒有此主題）：
- Signal/emit 使用模式
- Resource 繼承設計模式
- Node 生命週期最佳實踐
- 至少 5 個可複用 GDScript 模式

#### 5. Godot 架構原則（`game-dev/references/godot-architecture.md`）

需完全新增：
- 場景繼承（Scene Inheritance）vs 節點組合
- AutoLoad/Singleton 適用情境與反模式
- 節點組合（Composition over Inheritance）原則

### 不移植的內容

| 項目 | 原因 |
|------|------|
| PlayGodot 整合測試框架 | 需要客製 Godot fork，複雜度過高，BDD spec 未要求 |
| `playgodot.md` | 同上 |
| Python scripts（run_tests.py、parse_results.py、validate_project.py） | BDD spec 要求 bash scripts；GUT 取代 GdUnit4 |
| PlayGodot conftest.py 平行測試邏輯 | out of scope |
| GitLab CI 設定 | BDD spec 未要求 |
| Desktop/Mobile export 流程 | BDD spec 只要求 HTML5 |

---

## 實作順序建議

基於 BDD spec 的 scenario 覆蓋率，建議按以下順序建立：

1. **game-dev skill**（4 個 reference 文件）
   - `gdscript-patterns.md`
   - `godot-architecture.md`
   - `game-loop.md`（含遊戲設計理論 + 廣告友善特徵）
   - `testing.md`（GUT 框架）
   - `SKILL.md`（整合索引）

2. **game-publish skill**（3 個 reference 文件）
   - `godot-export.md`（export + CI/CD 合併）
   - `butler.md`（butler CLI）
   - `itchio-metadata.md`（metadata + 廣告整合）
   - `SKILL.md`

3. **games/template/**（Godot 專案模板）
   - `project.godot`
   - `export_presets.cfg`
   - `vercel.json`
   - `src/scenes/.gitkeep`、`src/scripts/.gitkeep`、`src/resources/.gitkeep`
   - `tests/.gitkeep`
   - `builds/.gitignore`
   - `docs/GDD.md`
   - `addons/gut/`（GUT addon）

4. **games/scripts/**（bash 腳本）
   - `new-game.sh`
   - `build.sh`
   - `publish.sh`

5. **registry.js**（game-studio workflow 定義）
