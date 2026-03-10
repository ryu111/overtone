# CLAUDE.md — Game Studio

## 定位

自主遊戲工作室：構思 → 開發 → 測試 → 發佈 HTML5 遊戲至 itch.io。
工作流：`/game-studio`（publish 是獨立階段，不自動串接 develop）

## 技術棧

- **Godot 4.x**：`/Applications/Godot.app/Contents/MacOS/Godot`
- **Export**：HTML5，renderer 必須選 `gl_compatibility`（非預設）
- **測試**：GUT，位於 `addons/gut/`
- **廣告**：CrazyGames SDK / Poki SDK，觸發點在 Game Over 畫面（局間轉場）

## 腳本

```bash
bash games/scripts/new-game.sh --name <slug>           # 建立專案 + 寫入 registry.json
bash games/scripts/build.sh --game <slug> --platform html5
bash games/scripts/publish.sh --game <slug> --version 1.0.0 --channel html5
# 發佈需要 BUTLER_CREDENTIALS 環境變數
```

## Godot CLI

```bash
GODOT="/Applications/Godot.app/Contents/MacOS/Godot"
# headless export
$GODOT --headless --path games/{slug} --export-release "Web" builds/html5/index.html
# GUT 測試
$GODOT --headless --path games/{slug} -s addons/gut/gut_cmdln.gd -gdir=res://tests/
```

## 隔離原則

⛔ **禁止修改全域 `~/.claude/`**：game skills 只在 `games/.claude/skills/` 內，不可建立 symlink 或複製到全域。
⛔ **禁止修改 `~/.claude/scripts/lib/registry.js`**：game-studio workflow 已定義完成，後續遊戲開發不需要動全域。
⛔ **禁止新增全域 agent/hook/skill**：遊戲相關知識全部放在 `games/.claude/` 下。

知識來源：`games/.claude/skills/game-dev/` + `games/.claude/skills/game-publish/`

## 遊戲設計約束

- 單局 ≤ 3 分鐘（廣告模型的前提）
- 所有操作支援觸控（行動裝置佔主流）
- 核心循環一句話說清楚，才能繼續下去
