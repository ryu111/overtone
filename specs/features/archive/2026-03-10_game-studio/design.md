# 自主遊戲工作室 — 技術設計

> 建立時間：2026-03-10
> Feature: game-studio

---

## 技術摘要（What & Why）

### 整合策略決策：方案 B（移植 skill 內容至 Overtone）

三方案比較：

| 方案 | 描述 | 優點 | 缺點 |
|------|------|------|------|
| A — 直接安裝為獨立 plugin | clone `Randroids-Dojo/Godot-Claude-Skills` 至 `~/.claude-plugins/` | 零移植成本、可獨立更新 | Claude Code 不支援多 plugin 並存；plugin 格式不完全相容 Overtone skill 格式 |
| B — 移植 skill 內容至 Overtone | 擷取 SKILL.md 知識，重組為 `~/.claude/skills/game-dev/` | 完全整合 Overtone 元件閉環；skill-score 可評估；無外部依賴 | 一次性移植工作量；需要人工篩選相關內容 |
| C — fork 後客製化 | fork repo，定期 sync upstream | 保留上游更新能力 | 維護成本高；Godot-Claude-Skills 已標記 DEPRECATED，上游不再更新 |

**決策：選方案 B**

理由：
- Randroids-Dojo plugin 已標記 DEPRECATED，upstream 不再更新，方案 C 的「保留更新能力」優點消失
- Overtone 架構是「單一 SoT」(`~/.claude/`)，方案 A 引入外部 plugin 位置打破此原則
- 方案 B 移植後知識融入 Overtone skill 體系，可透過 `skill-score.js` 品質評估，符合 Overtone 設計哲學

取捨：初始需要人工篩選 Randroids-Dojo 的內容；但其 `deployment.md` 和 GdUnit4/PlayGodot 知識可直接作為 references 素材。

### publish 步驟設計：手動觸發

publish 不加入 `game-studio` workflow stages（不在 DEV→TEST→RETRO→DOCS 之間），而是設計為獨立的 `/game-publish` command，原因：
- 發佈需要人工確認（版本號、changelog、截圖）
- 商業化場景不允許全自動發佈（誤觸風險高）
- 符合 Overtone 設計原則：確定性事務給程式碼，語意決策給 AI + 人

---

## API 介面設計

### 遊戲專案初始化腳本

```bash
# 建立新遊戲專案
bash ~/projects/overtone/games/scripts/new-game.sh --name <game-name>

# 輸出：~/projects/overtone/games/<game-name>/ 完整目錄結構
# 副作用：寫入 games/registry.json 新增遊戲記錄
```

### 建置腳本

```bash
# 執行 Godot headless export
bash ~/projects/overtone/games/scripts/build.sh \
  --game <name> \
  --platform <html5|linux|macos|windows> \
  [--dry-run]

# 輸出：builds/<platform>/ 目錄下的 export 產物
```

### 發佈腳本

```bash
# 推送至 itch.io
bash ~/projects/overtone/games/scripts/publish.sh \
  --game <name> \
  --version <semver> \
  --channel <html5|linux|mac|win|universal> \
  [--dry-run]

# 環境變數：BUTLER_API_KEY（自動化場景）
# 副作用：寫入 games/<game>/publish-log.jsonl
```

### 測試命令

```bash
# GUT 單元測試（Godot headless）
godot --headless --path ~/projects/overtone/games/<game-name> \
  -s addons/gut/gut_cmdln.gd \
  -gdir=res://tests/ -gexit

# 回傳碼：0=pass, 1=fail
```

### 腳本 API 型別

```javascript
// new-game.sh 寫入 games/registry.json 的格式
interface GameRegistryEntry {
  name: string;           // slug 格式，如 "pixel-dungeon"
  displayName: string;    // 顯示名稱
  createdAt: string;      // ISO 8601
  status: 'concept' | 'dev' | 'published';
  itchSlug?: string;      // itch.io 專案 slug（發佈後填入）
}

// publish.sh 寫入 publish-log.jsonl 的格式
interface PublishRecord {
  version: string;        // semver，如 "1.0.0"
  channel: string;        // itch.io channel
  publishedAt: string;    // ISO 8601
  itchUrl?: string;       // 發佈後的 itch.io 連結
  dry: boolean;           // 是否為 dry-run
}
```

---

## 資料模型

### 遊戲 Registry

```json
// 儲存位置：~/projects/overtone/games/registry.json
// 格式：JSON（單檔）
// SoT：記錄所有遊戲專案元資料
{
  "games": [
    {
      "name": "pixel-dungeon",
      "displayName": "Pixel Dungeon",
      "createdAt": "2026-03-10T00:00:00Z",
      "status": "concept",
      "itchSlug": null
    }
  ]
}
```

### 發佈記錄

```json
// 儲存位置：~/projects/overtone/games/{game-name}/publish-log.jsonl
// 格式：JSONL（append-only，每行一筆）
// 範例：
{"version":"1.0.0","channel":"html5","publishedAt":"2026-03-10T12:00:00Z","itchUrl":"https://ryu.itch.io/pixel-dungeon","dry":false}
```

### 遊戲專案 Metadata

```json
// 儲存位置：~/projects/overtone/games/{game-name}/game.json
// 用途：單一遊戲的設定（不依賴 project.godot 格式）
{
  "name": "pixel-dungeon",
  "displayName": "Pixel Dungeon",
  "version": "1.0.0",
  "itchChannel": {
    "html5": "html5",
    "linux": "linux",
    "macos": "mac"
  },
  "godotExportPresets": ["HTML5", "Linux/X11", "macOS"]
}
```

---

## 檔案結構

### `~/projects/overtone/games/`（此次 in-scope）

```
games/
├── registry.json                    ← 新增：所有遊戲的全域 registry
├── scripts/
│   ├── new-game.sh                  ← 新增：初始化遊戲專案
│   ├── build.sh                     ← 新增：Godot headless export
│   └── publish.sh                   ← 新增：butler push 至 itch.io
├── template/                        ← 新增：遊戲專案模板
│   ├── project.godot                ← 新增：Godot 專案設定模板
│   ├── export_presets.cfg           ← 新增：預設 export 設定（HTML5+Linux+macOS）
│   ├── src/
│   │   ├── scenes/                  ← 新增（空目錄，含 .gitkeep）
│   │   ├── scripts/                 ← 新增（空目錄，含 .gitkeep）
│   │   └── resources/               ← 新增（空目錄，含 .gitkeep）
│   ├── tests/                       ← 新增（空目錄，含 .gitkeep）
│   ├── builds/                      ← 新增（空目錄，.gitignore 排除內容）
│   ├── addons/gut/                  ← 新增：GUT 測試框架（複製自官方）
│   └── docs/
│       ├── GDD.md                   ← 新增：遊戲設計文件模板
│       ├── devlog.md                ← 新增：開發日誌模板
│       └── bdd-template.md          ← 新增：BDD 驗收標準模板
└── tasks.md                         ← 現有（Planner 已建立）
```

### `~/.claude/`（plugin 元件，此次 in-scope）

```
~/.claude/
├── skills/
│   ├── game-dev/                    ← 新增：遊戲開發知識 skill
│   │   ├── SKILL.md                 ← 新增：skill 入口 + 速查
│   │   └── references/
│   │       ├── gdscript-patterns.md ← 新增：GDScript 設計模式（移植自 Randroids-Dojo）
│   │       ├── godot-architecture.md← 新增：節點/場景架構原則
│   │       ├── game-loop.md         ← 新增：遊戲迴圈設計 + 效能考量
│   │       └── testing.md           ← 新增：GUT 框架 + headless 測試方式
│   └── game-publish/                ← 新增：遊戲發佈知識 skill
│       ├── SKILL.md                 ← 新增：skill 入口 + 速查
│       └── references/
│           ├── godot-export.md      ← 新增：headless export 指令 + export templates
│           ├── butler.md            ← 新增：butler CLI + BUTLER_API_KEY 自動化
│           └── itchio-metadata.md   ← 新增：itch.io 頁面 metadata 最佳實踐
└── scripts/lib/registry.js          ← 修改：新增 game-studio workflow 條目
```

（`registry-data.json` 不修改；`game-studio` 只新增 workflow 定義，不新增 stage）

---

## Workflow 設計

### `game-studio` workflow stages

```javascript
// 加入 registry.js 的定義
'game-studio': {
  label: '遊戲工作室',
  stages: ['PM', 'PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'],
  parallelGroups: ['quality', 'postdev']
}
```

**理由**：與 `product` workflow 相同的 stages，不引入新 stage。遊戲開發本質上就是「有 PM 發想遊戲概念 → 標準軟體開發流程」，不需要特殊 stage。

**publish 不在 stages 中**：以後可以在 DOCS 階段的 doc-updater agent 產出「發佈 checklist」，人工確認後執行 `publish.sh`。

### specsConfig 新增

```javascript
// registry.js specsConfig 新增
'game-studio': ['tasks', 'bdd'],
```

### 與現有 workflow 差異

| 面向 | standard | game-studio |
|------|----------|-------------|
| stages | PLAN → ARCH → ... | PM → PLAN → ARCH → ...（多 PM 概念發想） |
| skills（DEV） | 通用開發 skills | + game-dev skill |
| publish | 無 | 獨立 `publish.sh` 腳本，DOCS 階段產出 checklist |
| 測試工具 | Bun test | GUT（Godot headless）+ BDD template |

---

## 環境安裝策略

### Godot 4.x（brew cask）

```bash
brew install --cask godot

# CLI alias（加入 ~/.zshrc）
alias godot="/Applications/Godot.app/Contents/MacOS/Godot"

# 額外需要：export templates（headless export 必須）
# Godot 4.x 設定路徑：~/.local/share/godot/export_templates/
# 透過 Godot Editor → Editor → Manage Export Templates 下載
# 或：手動下載 .tpz 檔案後解壓縮
```

**關鍵風險**：Godot headless export 需要 export templates 已安裝，T1.1 必須包含此步驟。

### butler CLI（itch.io deploy）

```bash
# 下載至 ~/bin/butler
curl -L -o ~/bin/butler https://broth.itch.ovh/butler/darwin-amd64/LATEST/archive/default
chmod +x ~/bin/butler
# 確認 ~/.zshrc 包含 export PATH="$HOME/bin:$PATH"

# 認證：互動式（本機開發）
butler login

# 認證：CI/自動化（環境變數）
export BUTLER_API_KEY="<api-key>"
```

### GUT（Godot Unit Testing framework）

```bash
# GUT 4.x 安裝至遊戲模板
# 從 https://github.com/bitwes/Gut 下載，放至 template/addons/gut/
# 不使用 git submodule（避免複雜性）
```

### PlayGodot（可選，此次 out of scope）

PlayGodot 需要自定義 Godot fork + Python venv，複雜度高，延至後續迭代。此次 out of scope。

---

## 狀態同步策略

此功能不涉及跨頁面/跨元件即時狀態同步。

遊戲發佈狀態追蹤方式：
- `games/registry.json`：全域遊戲清單（人工或腳本讀取）
- `games/{game}/publish-log.jsonl`：發佈歷史（append-only，無競態問題）
- Overtone 現有 workflow state（`~/.overtone/sessions/`）記錄 game-studio workflow 執行狀態

---

## 邊界條件（Edge Cases to Handle）

1. **Godot export templates 未安裝** — 資料邊界：`godot --headless --export-release` 會產生無意義的空 build 而非報錯，需要在 build.sh 中先檢查 export template 是否存在
2. **butler push 網路中斷後重試** — 並行競爭：butler 有內建斷點續傳，但 publish-log.jsonl 可能寫入不完整記錄；需要 publish.sh 在 butler 成功後才 append 記錄
3. **game-studio workflow 與現有 skills 不匹配** — 狀態組合：developer agent 目前 skills 陣列無 game-dev，若直接用 game-studio workflow 而 agent 未更新，知識注入會缺失；需同步更新 developer agent 的 skills 或建立獨立的 game-developer agent
4. **registry.json 並發寫入** — 並行競爭：多個遊戲同時初始化時（罕見但可能），registry.json 寫入無 CAS 保護；new-game.sh 需要用 tmp+rename 原子操作

---

## 待決定事項

1. **developer agent 是否新增 game-dev skill**：若新增，所有 DEV stage 都會載入 game-dev 知識（與非遊戲任務無關）。替代方案：建立獨立的 `game-developer.md` agent，只在 game-studio workflow 中使用。建議由 developer 在實作 T4.1 時決定。

2. **GUT 版本鎖定**：template/addons/gut/ 要複製哪個版本？建議 GUT 4.3.x（配合 Godot 4.x）。

3. **itch.io 帳號 slug**：publish.sh 需要 `{username}/{game-slug}` 格式的 target。應設計為環境變數（`ITCH_USERNAME`）還是寫在 game.json 裡？建議寫在 game.json（每個遊戲不同 slug）。
