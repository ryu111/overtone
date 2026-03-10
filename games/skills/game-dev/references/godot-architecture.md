# Godot 架構設計原則

> 節點組織、場景設計與 AutoLoad 最佳實踐。

---

## 場景繼承（Scene Inheritance）

### 何時使用場景繼承

場景繼承適合「是一種（is-a）」關係 — 子場景是父場景的特化版本。

```
BaseEnemy.tscn
├── Sprite2D
├── CollisionShape2D
├── HealthComponent
└── NavigationAgent2D

FastEnemy.tscn（繼承自 BaseEnemy.tscn）
└── 只覆寫 speed 屬性和 Sprite2D 的貼圖
```

**使用場景繼承的時機：**
- 多種敵人共享相同節點結構，只有數值不同
- 多種武器共享相同機制，只有動畫和傷害不同
- 需要 Inspector 調整父場景的共用屬性

**建立方式（Godot 編輯器）：**
1. 新建場景 → 選擇「從現有場景繼承」
2. 子場景只能覆寫（override）父場景的屬性，不能刪除節點
3. 父場景修改後，所有子場景自動繼承變更

### 場景繼承的限制

```
⛔ 不可刪除父場景的節點（只能隱藏或新增）
⛔ 不可更改父場景的節點名稱（會導致引用失效）
⛔ 繼承層次不超過 3 層（維護複雜度指數增長）
```

---

## 節點組合（Composition over Inheritance）

### 組合優於繼承的核心理念

與其用繼承建立「FlyingShootingEnemy」，不如用可組合的組件：

```
Enemy（CharacterBody2D）
├── HealthComponent（血量管理）
├── MoveComponent（移動邏輯）
├── ShootComponent（射擊邏輯）
├── FlyComponent（飛行邏輯）
└── DropComponent（掉落物品）
```

**優點：**
- 組件可獨立測試
- 玩家也可使用相同的 HealthComponent、ShootComponent
- 新增能力不需要修改既有程式碼

### 組合模式實作

```gdscript
# move_component.gd
class_name MoveComponent
extends Node

@export var speed: float = 200.0
@export var acceleration: float = 800.0

var _body: CharacterBody2D

func _ready() -> void:
    _body = get_parent() as CharacterBody2D
    assert(_body != null, "MoveComponent must be a child of CharacterBody2D")

func move_toward_target(target_pos: Vector2, delta: float) -> void:
    var direction = (_body.global_position.direction_to(target_pos))
    _body.velocity = _body.velocity.move_toward(
        direction * speed, acceleration * delta
    )
    _body.move_and_slide()
```

### 節點樹組織原則

```
World（Node2D）
├── GameManager（Node）        ← 遊戲流程邏輯
├── Environment（Node2D）      ← 地形、背景、裝飾
│   ├── TileMap
│   └── Background
├── Entities（Node2D）         ← 動態物件
│   ├── Player
│   ├── Enemies（Node2D）      ← 敵人的父容器
│   └── Projectiles（Node2D） ← 子彈的父容器
└── UI（CanvasLayer）          ← UI 層（固定在鏡頭上）
    ├── HUD
    └── PauseMenu
```

**原則：**
| 原則 | 說明 |
|------|------|
| 職責分組 | 同類型節點放在同一個父容器下 |
| UI 用 CanvasLayer | 確保 UI 不受鏡頭縮放影響 |
| Z-Index 管理 | 用 CanvasLayer 的層級控制渲染順序 |
| 動態物件集中 | 動態生成的節點放在固定的父節點下，方便管理 |

---

## AutoLoad（Singleton）設計

### AutoLoad 的適用情境

AutoLoad 是全局可存取的單例節點，適合以下用途：

| 情境 | 範例 | 理由 |
|------|------|------|
| 全域事件系統 | `EventBus` | 解耦不相關系統的通訊 |
| 遊戲狀態管理 | `GameState` | 跨場景持久化（分數、關卡、設定） |
| 音效管理器 | `AudioManager` | 跨場景播放背景音樂 |
| 存檔系統 | `SaveSystem` | 讀寫持久化資料 |
| 設定管理 | `Settings` | 解析度、音量、語言設定 |

### AutoLoad 設定方式（Godot 編輯器）

1. 專案 → 專案設定 → AutoLoad
2. 新增腳本路徑和名稱（如 `res://scripts/event_bus.gd`，名稱 `EventBus`）
3. 在任意腳本中直接用名稱存取：`EventBus.score_changed.emit(100)`

### AutoLoad 實作範例

```gdscript
# game_state.gd（AutoLoad 名稱：GameState）
extends Node

signal score_changed(new_score: int)
signal lives_changed(new_lives: int)

var score: int = 0 :
    set(value):
        score = value
        score_changed.emit(score)

var lives: int = 3 :
    set(value):
        lives = value
        lives_changed.emit(lives)

var current_level: int = 1
var high_score: int = 0

func reset() -> void:
    score = 0
    lives = 3

func add_score(points: int) -> void:
    score += points
    if score > high_score:
        high_score = score
```

### AutoLoad 反模式

```
⛔ 把遊戲邏輯塞進 AutoLoad
   AutoLoad 應該是「資料持有者」和「事件匯流排」，不是業務邏輯的集中地。

⛔ AutoLoad 過多（超過 5-7 個）
   過多的 AutoLoad 表示遊戲邏輯沒有被適當分層。
   考慮將相關 AutoLoad 合併。

⛔ AutoLoad 相互依賴
   EventBus.game_over.connect(GameState.reset)  ← 循環依賴風險
   改用：讓某個協調者（如 GameManager）負責連接 EventBus 和 GameState。

⛔ 在 AutoLoad 中存 PackedScene 或 Texture
   這些資源應該用 Resource 系統管理，不應常駐記憶體。
```

### AutoLoad vs 普通單例的比較

| 特性 | AutoLoad | 普通節點單例 |
|------|----------|-------------|
| 跨場景存活 | 自動（不會被清除） | 需手動設定 `DontDestroyOnLoad` 等效方式 |
| 可訪問性 | 全域直接存取 | 需透過 `get_tree()` 或 `get_parent()` |
| 生命週期 | 遊戲啟動到結束 | 依附於場景 |
| 適合用途 | 全域服務、事件總線 | 場景級別的管理器 |

---

## 節點命名規範

```gdscript
# 節點名稱（英文，PascalCase）
Player, EnemySpawner, HealthComponent, BackgroundMusic

# 腳本中的變數（snake_case）
@onready var health_component: HealthComponent = $HealthComponent
@onready var sprite: Sprite2D = $Sprite2D

# 信號（snake_case，過去式）
signal health_changed(old_value: int, new_value: int)
signal enemy_defeated

# 常數（SCREAMING_SNAKE_CASE）
const MAX_ENEMIES: int = 50
const SPAWN_INTERVAL: float = 2.0
```

---

## 場景結構快速決策樹

```
新功能需要新節點？
│
├─ 這個功能是否在多個不同實體中複用？
│   ├─ 是 → 建立 Component（如 HealthComponent）
│   └─ 否 → 直接寫在當前節點的腳本中
│
├─ 這個場景是否有多個「稍微不同」的版本？
│   ├─ 只差在資料 → 用 Resource(.tres) 儲存變體資料
│   ├─ 差在節點結構 → 考慮場景繼承
│   └─ 完全不同 → 各自獨立場景
│
└─ 這個資訊是否需要跨場景存活？
    ├─ 是 → AutoLoad 或 Resource 存檔
    └─ 否 → 在場景內管理，不要污染全域狀態
```
