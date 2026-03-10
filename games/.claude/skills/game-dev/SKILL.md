---
name: game-dev
description: Godot 4.x 遊戲開發知識域。涵蓋 GDScript 技術 patterns、Godot 節點架構、遊戲設計理論（核心循環/心流/獎勵機制）、多遊戲類型設計重點、GUT 測試框架。Use when building Godot games, designing game mechanics, implementing GDScript patterns, or writing GUT tests.
disable-model-invocation: true
user-invocable: false
---

# Game Dev 知識領域

> 打造有趣 Godot 遊戲所需的技術知識與設計理論。

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 實作 GDScript patterns、Godot 架構設計、GUT 測試撰寫 |
| architect | 設計遊戲系統架構、選擇節點組織方式、評估 AutoLoad 使用時機 |
| tester | 撰寫 GUT 測試規格、設定 headless 執行環境 |

## Reference 索引

| 檔案 | 說明 | 何時讀取 |
|------|------|----------|
| 💡 `./references/gdscript-patterns.md` | Signal/emit、Resource 繼承、Node 生命週期、5 個可複用 patterns（狀態機/物件池/觀察者/命令/組件） | 實作 GDScript 功能、選擇設計模式時 |
| 💡 `./references/godot-architecture.md` | 場景繼承 vs 節點組合、AutoLoad 適用情境與反模式、節點樹組織原則 | 設計新場景架構、決定是否用 AutoLoad、組織節點層次時 |
| 💡 `./references/game-loop.md` | 核心循環定義、心流理論（Csikszentmihalyi）、獎勵機制（固定/隨機/成就）、難度曲線、遊戲類型設計（arcade/puzzle/platformer/card）、廣告友善特徵 | 設計遊戲核心玩法、獎勵系統、調整難度曲線、評估廣告整合時 |
| 💡 `./references/testing.md` | GUT 安裝方式、headless 執行指令、測試腳本結構（extends GutTest）、斷言速查、場景測試技巧、GdUnit4→GUT 對照表 | 撰寫 Godot 單元測試、設定 CI 測試環境、遷移舊測試時 |

## 快速參考

### GUT Headless 執行

```bash
godot --headless --path . -s addons/gut/gut_cmdln.gd \
  -gdir=res://tests/ -gexit
```

### Signal 基本模式

```gdscript
signal health_changed(old_value: int, new_value: int)

func take_damage(amount: int) -> void:
    var old = health
    health -= amount
    health_changed.emit(old, health)
```

### 狀態機骨架

```gdscript
enum State { IDLE, MOVE, ATTACK, DEAD }
var current_state: State = State.IDLE

func set_state(new_state: State) -> void:
    if current_state == new_state: return
    _exit_state(current_state)
    current_state = new_state
    _enter_state(new_state)
```

### GUT 測試骨架

```gdscript
extends GutTest

func before_each() -> void:
    pass  # 每個測試前的初始化

func after_each() -> void:
    pass  # 清理節點（queue_free）

func test_example() -> void:
    assert_eq(1 + 1, 2, "基本算術")
```

### 核心循環設計原則

```
行動 → 反饋（0.1秒內）→ 決策 → 下一輪行動
心流：挑戰 ≈ 技能（太難→焦慮，太簡單→無聊）
廣告插入點：死亡畫面、關卡完成畫面
```

## NEVER

- NEVER 在 `_ready()` 中存取兄弟節點（可能尚未就緒），改用 `call_deferred` 或等待 `_ready` 完成
- NEVER 在 `_process` 中執行物理計算（用 `_physics_process`）
- NEVER 建立超過 5-7 個 AutoLoad（職責集中會讓維護困難）
- NEVER 跳過 GUT 測試的 `after_each` 清理（未清理的節點累積會導致測試間互相干擾）
- NEVER 把遊戲設計理論（心流、獎勵機制）的決策硬編碼（應由 Resource 或設定檔管理）