# 自主遊戲工作室 — 任務清單

> 建立時間：2026-03-10
> 目標：建立基礎設施，讓 Claude 成為自主遊戲工作室

## 範圍說明

**In Scope（此次迭代）**：
- 環境安裝（Godot + butler CLI）
- mcpmarket `godot-gdscript-patterns-1` skill 研究與整合
- Overtone plugin 元件：`game-dev` skill + `game-publish` skill + `game-studio` workflow
- 遊戲專案模板（標準目錄結構）
- 遊戲 BDD 驗收標準模板
- itch.io 自動部署腳本

**Out of Scope（後續迭代）**：
- 實際開發第一款遊戲
- GDD 自動生成模板
- devlog 自動生成
- 作品集網站
- 遊戲品質自動測試框架（待 Godot headless testing 研究後評估）

---

## 執行階段

### Phase 1：環境準備（sequential，必須先完成）

**T1.1** — Godot Engine 安裝與 CLI 驗證
- 輸入：無（乾淨環境）
- 產出：`godot` 可執行檔在 PATH，`--version` 可正確回應
- 步驟：
  1. `brew install --cask godot`
  2. 建立 CLI 別名（Godot.app 的二進位路徑為 `/Applications/Godot.app/Contents/MacOS/Godot`）
  3. 驗證 headless export 支援：`godot --headless --version`
- 驗收：`godot --headless --version` 印出版本號無錯誤
- agent：developer
- 影響檔案：`~/.zshrc` 或 shell config（alias 設定）

**T1.2** — butler CLI 安裝與認證設定
- 輸入：itch.io 帳號（需人工介入）
- 產出：`butler` 可執行，`butler login` 完成認證
- 步驟：
  1. 從 `https://itchio.itch.io/butler` 下載 macOS 版
  2. 解壓縮至 `~/bin/butler`
  3. `chmod +x ~/bin/butler`
  4. 確認 PATH 包含 `~/bin`
  5. `butler login`（瀏覽器認證，需人工操作）
- 驗收：`butler version` 回傳版本，`butler status` 顯示已登入
- agent：developer
- 影響檔案：`~/bin/butler`，`~/.zshrc`
- 風險：`butler login` 需要瀏覽器互動，CI/自動化環境需改用 `BUTLER_API_KEY` 環境變數

**T1.3** — mcpmarket godot-gdscript-patterns-1 skill 研究
- 輸入：mcpmarket.com 網站
- 產出：skill 安裝方式確認、內容摘要文件
- 步驟：
  1. 研究 mcpmarket skill 安裝格式（是否為 Claude Code skill 格式）
  2. 確認 `godot-gdscript-patterns-1` skill 的內容範疇
  3. 決定整合策略：直接安裝 or 內容移植至 `game-dev` skill references
- 驗收：有明確的整合決策和依據
- agent：developer（研究型）
- 影響檔案：研究結果記錄至 `/Users/sbu/projects/overtone/games/mcpmarket-research.md`
- 風險：mcpmarket skill 格式可能與 Overtone skill 格式不相容，需轉換

---

### Phase 2：Overtone Plugin 元件（T1.3 完成後，T2.1/T2.2 可 parallel）

**T2.1** — 建立 `game-dev` skill (parallel)
- 輸入：T1.3 的研究結果、Godot 文件
- 產出：`~/.claude/skills/game-dev/SKILL.md` + `references/` 目錄
- 內容：
  - GDScript 設計模式（整合 mcpmarket 知識）
  - Godot 節點/場景架構原則
  - 小遊戲常見 pattern（狀態機、事件系統、資源管理）
  - headless 測試方式（GUT framework 或內建 assert）
  - 遊戲迴圈設計、效能考量
- 驗收：`bun ~/.claude/scripts/skill-score.js --name game-dev` 通過品質門檻
- agent：developer
- 影響檔案：`~/.claude/skills/game-dev/SKILL.md`，`~/.claude/skills/game-dev/references/*.md`

**T2.2** — 建立 `game-publish` skill (parallel)
- 輸入：butler 文件研究（T1.2 期間收集）
- 產出：`~/.claude/skills/game-publish/SKILL.md` + `references/` 目錄
- 內容：
  - Godot headless export 指令格式（`godot --headless --export-release "Linux/X11" path`）
  - butler push 指令格式與 channel 命名規則
  - itch.io 頁面 metadata 最佳實踐（標題、tag、描述、截圖）
  - 發佈前 checklist（export template 確認、平台設定）
  - `BUTLER_API_KEY` 環境變數自動化認證
- 驗收：skill 包含完整的 publish workflow 步驟
- agent：developer
- 影響檔案：`~/.claude/skills/game-publish/SKILL.md`，`~/.claude/skills/game-publish/references/*.md`

---

### Phase 3：腳本與模板（T2.1/T2.2 完成後，T3.1/T3.2/T3.3 可 parallel）

**T3.1** — 遊戲專案目錄模板 (parallel)
- 輸入：Godot 最佳實踐、Overtone 專案慣例
- 產出：`/Users/sbu/projects/overtone/games/template/` 目錄樹
- 結構：
  ```
  games/{game-name}/
  ├── project.godot          # Godot 專案設定
  ├── export_presets.cfg     # 預設 export 設定（HTML5 + Linux + macOS）
  ├── src/
  │   ├── scenes/            # 場景 .tscn 檔案
  │   ├── scripts/           # GDScript .gd 檔案
  │   └── resources/         # 圖片、音效等資源
  ├── tests/                 # GUT 測試腳本
  ├── builds/                # Export 輸出（.gitignore）
  └── docs/
      ├── GDD.md             # 遊戲設計文件
      └── devlog.md          # 開發日誌
  ```
- 驗收：模板目錄結構存在，含 README 說明使用方式
- agent：developer
- 影響檔案：`/Users/sbu/projects/overtone/games/template/`

**T3.2** — itch.io 自動部署腳本 (parallel)
- 輸入：butler 文件（T1.2）、`game-publish` skill（T2.2）
- 產出：`/Users/sbu/projects/overtone/games/scripts/publish.sh`
- 功能：
  - 接受參數：`--game <name>` `--version <ver>` `--channel <ch>`
  - 執行 Godot headless export
  - 執行 butler push
  - 支援 `BUTLER_API_KEY` 環境變數
  - 乾跑模式（`--dry-run`）
- 驗收：`bash publish.sh --help` 顯示使用說明；`--dry-run` 不實際推送
- agent：developer
- 影響檔案：`/Users/sbu/projects/overtone/games/scripts/publish.sh`

**T3.3** — 遊戲 BDD 驗收標準模板 (parallel)
- 輸入：遊戲開發慣例、Overtone BDD 格式
- 產出：`/Users/sbu/projects/overtone/games/template/docs/bdd-template.md`
- 內容：
  - 遊戲核心循環驗收（GIVEN/WHEN/THEN 格式）
  - 操控手感測試格式
  - 發佈前品質驗收 checklist（功能完整性、效能、相容性）
  - 範例：以一個 Flappy Bird 類型遊戲為例的完整 BDD 規格
- 驗收：模板格式符合 Overtone BDD 慣例，可直接複製使用
- agent：developer
- 影響檔案：`/Users/sbu/projects/overtone/games/template/docs/bdd-template.md`

---

### Phase 4：Workflow 整合（Phase 3 完成後）

**T4.1** — `game-studio` workflow 加入 registry.js (sequential)
- 輸入：registry.js 現有 workflow 定義格式
- 產出：`game-studio` workflow 定義寫入 `~/.claude/scripts/lib/registry.js`
- Workflow 設計：
  ```
  concept → dev → test → publish
  stages: ['PM', 'PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']
  ```
  加上 game-studio 特有步驟（publish 由 DOCS 後手動觸發）
- 驗收：`registry.js` 中新增 `game-studio` 條目；現有 workflow 測試不 regression
- agent：developer
- 影響檔案：`~/.claude/scripts/lib/registry.js`，`~/.claude/plugin.json`（版本 bump）

---

## 風險清單

| 風險 | 可能性 | 影響 | 緩解方式 |
|------|--------|------|----------|
| Godot brew install 失敗或版本不符 | 低 | 中 | 備案：手動下載 .dmg 安裝 |
| Godot CLI 路徑問題（.app bundle） | 中 | 中 | 明確使用 `/Applications/Godot.app/Contents/MacOS/Godot` 完整路徑 |
| butler login 無法自動化 | 高 | 低 | 使用 `BUTLER_API_KEY` 環境變數替代互動式登入 |
| mcpmarket skill 格式不相容 | 中 | 中 | 改為手動整合：擷取 skill 知識內容移植至 game-dev references |
| Godot headless export 需要 export templates | 高 | 高 | T1.1 中需額外步驟下載並安裝 export templates |
| export_presets.cfg 未設定時 headless export 失敗 | 高 | 中 | 模板中預先包含 export_presets.cfg |

---

## 依賴關係圖

```
T1.1 (Godot 安裝)
T1.2 (butler 安裝)
T1.3 (mcpmarket 研究)
     ↓
     全部完成後
     ↓
T2.1 (game-dev skill) ←─── T1.3
T2.2 (game-publish skill) ←─ T1.2
     ↓（T2.1 + T2.2 完成後）
T3.1 (專案模板) ──────── parallel
T3.2 (publish 腳本) ───── parallel ←── T2.2
T3.3 (BDD 模板) ─────── parallel
     ↓（Phase 3 完成後）
T4.1 (registry.js workflow)
```

## 並行執行計劃

- **Phase 1**：T1.1 + T1.2 + T1.3 可同時進行（互相獨立）
- **Phase 2**：T2.1 + T2.2 可同時進行（輸入不重疊）
- **Phase 3**：T3.1 + T3.2 + T3.3 可同時進行
- **Phase 4**：T4.1 單一任務

## 預估工作量

| 階段 | 任務數 | 預估工作量 |
|------|--------|------------|
| Phase 1 | 3 | 小（安裝 + 研究）|
| Phase 2 | 2 | 中（知識整理 + skill 撰寫）|
| Phase 3 | 3 | 中（腳本 + 模板）|
| Phase 4 | 1 | 小（registry 修改）|

---

## Dev Phases

### Phase 1: 環境準備 (parallel)

- [ ] Godot Engine 安裝 + export templates + CLI alias 設定 | files: `~/.zshrc`
- [ ] butler CLI 安裝 + PATH 設定（butler login 需人工） | files: `~/bin/butler`, `~/.zshrc`
- [ ] Randroids-Dojo/Godot-Claude-Skills 內容研究 + 整合決策 | files: `~/projects/overtone/games/mcpmarket-research.md`

### Phase 2: Overtone Skill 建立 (parallel，Phase 1 完成後)

- [ ] 建立 `game-dev` skill（移植 Randroids-Dojo 知識 + GDScript patterns） | files: `~/.claude/skills/game-dev/SKILL.md`, `~/.claude/skills/game-dev/references/*.md`
- [ ] 建立 `game-publish` skill（butler + headless export + itch.io metadata） | files: `~/.claude/skills/game-publish/SKILL.md`, `~/.claude/skills/game-publish/references/*.md`

### Phase 3: 腳本與模板 (parallel，Phase 2 完成後)

- [ ] 遊戲專案目錄模板（含 export_presets.cfg + GUT addons） | files: `~/projects/overtone/games/template/`
- [ ] 三支 shell 腳本（new-game.sh / build.sh / publish.sh） | files: `~/projects/overtone/games/scripts/`
- [ ] BDD 驗收標準模板 | files: `~/projects/overtone/games/template/docs/bdd-template.md`

### Phase 4: Workflow 整合 (sequential，Phase 3 完成後)

- [ ] `game-studio` workflow 加入 registry.js + specsConfig + 版本 bump | files: `~/.claude/scripts/lib/registry.js`, `~/.claude/plugin.json`
- [ ] `games/registry.json` 初始化（空遊戲清單） | files: `~/projects/overtone/games/registry.json`
