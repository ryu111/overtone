# GDScript 技術 Patterns

> 提供可複用的 GDScript 設計模式與最佳實踐。

---

## Signal / Emit 使用模式

### 基本 Signal 宣告與發送

```gdscript
# 宣告 signal（Godot 4.x 語法）
signal health_changed(old_value: int, new_value: int)
signal player_died
signal item_collected(item_name: String, quantity: int)

# 發送 signal
func take_damage(amount: int) -> void:
    var old_health = health
    health -= amount
    health_changed.emit(old_health, health)  # Godot 4.x 用 .emit()
    if health <= 0:
        player_died.emit()
```

### Signal 連接方式

```gdscript
# 方式 1：程式碼連接（推薦）
func _ready() -> void:
    health_component.health_changed.connect(_on_health_changed)
    health_component.player_died.connect(_on_player_died)

# 方式 2：Lambda 連接（Godot 4.x）
func _ready() -> void:
    button.pressed.connect(func(): print("clicked"))

# 方式 3：斷開連接（避免記憶體洩漏）
func _exit_tree() -> void:
    if health_component.health_changed.is_connected(_on_health_changed):
        health_component.health_changed.disconnect(_on_health_changed)
```

### Signal 最佳實踐

| 原則 | 說明 |
|------|------|
| 親子溝通用函式呼叫 | Parent 呼叫 Child 的方法（Parent 知道 Child） |
| 子父溝通用 signal | Child 發送 signal，Parent 監聽（Child 不知道 Parent） |
| 跨節點通訊用 signal 或 EventBus | 避免直接存取不相關節點 |
| signal 命名用過去式 | `health_changed`、`enemy_defeated`（描述已發生的事） |

---

## Resource 繼承設計模式

### 基本 Resource 定義

```gdscript
# item_data.gd — 基底 Resource
class_name ItemData
extends Resource

@export var item_name: String = ""
@export var description: String = ""
@export var icon: Texture2D
@export var stack_size: int = 1

func get_display_name() -> String:
    return item_name
```

### 繼承 Resource 建立子類型

```gdscript
# weapon_data.gd — 繼承自 ItemData
class_name WeaponData
extends ItemData

@export var damage: int = 10
@export var attack_speed: float = 1.0
@export var weapon_type: WeaponType = WeaponType.SWORD

enum WeaponType { SWORD, BOW, STAFF }

func get_dps() -> float:
    return damage * attack_speed
```

### Resource 在 Inspector 中的使用

```gdscript
# enemy_stats.gd — 在節點中使用 Resource
class_name EnemyStats
extends Node

@export var stats: EnemyData  # 在 Inspector 指定 .tres 檔案

func _ready() -> void:
    if stats:
        apply_stats(stats)

func apply_stats(data: EnemyData) -> void:
    health = data.max_health
    speed = data.move_speed
```

**優點：** 資料與邏輯分離，.tres 檔案可在多個場景複用，設計師可在 Inspector 調整數值。

---

## Node 生命週期最佳實踐

### 生命週期函式執行順序

```
1. _init()          ← 物件建構（不建議放遊戲邏輯）
2. _enter_tree()    ← 加入場景樹（節點可存取）
3. _ready()         ← 本節點和所有子節點都已就緒
4. _process(delta)  ← 每幀執行（綁定 FPS）
5. _physics_process(delta)  ← 固定時間步（預設 60Hz）
6. _exit_tree()     ← 從場景樹移除（清理資源）
```

### _ready() 最佳實踐

```gdscript
func _ready() -> void:
    # ✅ 初始化節點引用
    sprite = $Sprite2D
    animation_player = $AnimationPlayer

    # ✅ 連接 signals
    health_component.health_changed.connect(_on_health_changed)

    # ✅ 初始化狀態
    set_state(State.IDLE)

    # ❌ 不要在 _ready() 中存取兄弟節點（可能尚未就緒）
    # 改用 call_deferred("_init_references") 延遲執行
```

### _process vs _physics_process 選擇

| 函式 | 用途 | 特性 |
|------|------|------|
| `_process(delta)` | 視覺更新、UI、動畫控制 | 與 FPS 綁定，不穩定 |
| `_physics_process(delta)` | 移動、碰撞偵測、物理計算 | 固定時間步（穩定） |

```gdscript
func _physics_process(delta: float) -> void:
    # ✅ 移動邏輯放在 physics_process
    velocity = move_and_slide(velocity)

func _process(delta: float) -> void:
    # ✅ 動畫更新放在 process
    update_animation()
```

### _exit_tree() 清理

```gdscript
func _exit_tree() -> void:
    # ✅ 斷開外部 signals
    if EventBus.level_complete.is_connected(_on_level_complete):
        EventBus.level_complete.disconnect(_on_level_complete)

    # ✅ 釋放手動建立的資源
    if audio_stream_player and is_instance_valid(audio_stream_player):
        audio_stream_player.queue_free()
```

---

## 5 個可複用 GDScript 模式

### 模式 1：狀態機（State Machine）

```gdscript
# enemy_controller.gd
class_name EnemyController
extends CharacterBody2D

enum State { IDLE, PATROL, CHASE, ATTACK, DEAD }

var current_state: State = State.IDLE

func _physics_process(delta: float) -> void:
    match current_state:
        State.IDLE:    _state_idle(delta)
        State.PATROL:  _state_patrol(delta)
        State.CHASE:   _state_chase(delta)
        State.ATTACK:  _state_attack(delta)
        State.DEAD:    pass

func set_state(new_state: State) -> void:
    if current_state == new_state:
        return
    _exit_state(current_state)
    current_state = new_state
    _enter_state(new_state)

func _enter_state(state: State) -> void:
    match state:
        State.CHASE:
            animation_player.play("run")
        State.ATTACK:
            animation_player.play("attack")

func _exit_state(state: State) -> void:
    pass  # 退出狀態時的清理邏輯
```

**適用場景：** 敵人 AI、玩家角色、遊戲流程管理。

### 模式 2：物件池（Object Pool）

```gdscript
# bullet_pool.gd
class_name BulletPool
extends Node

@export var bullet_scene: PackedScene
@export var pool_size: int = 20

var _pool: Array[Bullet] = []

func _ready() -> void:
    for i in pool_size:
        var bullet = bullet_scene.instantiate() as Bullet
        bullet.visible = false
        bullet.set_process(false)
        add_child(bullet)
        _pool.append(bullet)

func get_bullet() -> Bullet:
    for bullet in _pool:
        if not bullet.visible:
            bullet.visible = true
            bullet.set_process(true)
            return bullet
    # Pool 耗盡時擴展
    var new_bullet = bullet_scene.instantiate() as Bullet
    add_child(new_bullet)
    _pool.append(new_bullet)
    return new_bullet

func return_bullet(bullet: Bullet) -> void:
    bullet.visible = false
    bullet.set_process(false)
    bullet.global_position = Vector2.ZERO
```

**適用場景：** 子彈、粒子效果、敵人生成。

### 模式 3：觀察者模式（EventBus / AutoLoad）

```gdscript
# event_bus.gd（AutoLoad 單例）
extends Node

signal score_changed(new_score: int)
signal game_over
signal level_completed(level_id: int)
signal achievement_unlocked(achievement_id: String)
```

```gdscript
# score_manager.gd — 發送事件
func add_score(points: int) -> void:
    current_score += points
    EventBus.score_changed.emit(current_score)

# ui_score_display.gd — 監聽事件
func _ready() -> void:
    EventBus.score_changed.connect(_on_score_changed)

func _on_score_changed(new_score: int) -> void:
    label.text = str(new_score)
```

**適用場景：** 跨系統通訊（UI 更新、成就、音效觸發）。

### 模式 4：命令模式（Command Pattern）

```gdscript
# base_command.gd
class_name BaseCommand
extends RefCounted

func execute() -> void:
    pass

func undo() -> void:
    pass
```

```gdscript
# move_command.gd
class_name MoveCommand
extends BaseCommand

var _unit: Unit
var _from: Vector2i
var _to: Vector2i

func _init(unit: Unit, to: Vector2i) -> void:
    _unit = unit
    _from = unit.grid_position
    _to = to

func execute() -> void:
    _unit.move_to(_to)

func undo() -> void:
    _unit.move_to(_from)
```

```gdscript
# command_manager.gd
class_name CommandManager
extends Node

var _history: Array[BaseCommand] = []

func execute(command: BaseCommand) -> void:
    command.execute()
    _history.append(command)

func undo() -> void:
    if _history.is_empty():
        return
    var last = _history.pop_back()
    last.undo()
```

**適用場景：** 回合制遊戲、Undo/Redo、Replay 系統。

### 模式 5：組件系統（Component System）

```gdscript
# health_component.gd — 獨立的血量組件
class_name HealthComponent
extends Node

signal health_changed(old_value: int, new_value: int)
signal died

@export var max_health: int = 100
var current_health: int

func _ready() -> void:
    current_health = max_health

func take_damage(amount: int) -> void:
    var old = current_health
    current_health = max(0, current_health - amount)
    health_changed.emit(old, current_health)
    if current_health == 0:
        died.emit()

func heal(amount: int) -> void:
    var old = current_health
    current_health = min(max_health, current_health + amount)
    health_changed.emit(old, current_health)
```

```gdscript
# player.gd — 透過組件獲得血量功能
extends CharacterBody2D

@onready var health: HealthComponent = $HealthComponent

func _ready() -> void:
    health.died.connect(_on_died)

func _on_died() -> void:
    EventBus.game_over.emit()
```

**適用場景：** 血量/護盾/速度等通用能力，可被多種角色複用（玩家、敵人、障礙物）。

---

## 常見錯誤與修正

| 錯誤 | 原因 | 修正 |
|------|------|------|
| `get_node()` 找不到節點 | 節點路徑錯誤或時機過早 | 用 `@onready var` 或在 `_ready()` 中獲取 |
| Signal 連接重複 | `_ready()` 被多次呼叫 | 先檢查 `is_connected()` 再連接 |
| `null` 引用崩潰 | 節點已被 `queue_free` | 用 `is_instance_valid(node)` 檢查 |
| delta 不一致 | 在 `_ready()` 中計算時間 | 時間邏輯只放在 `_process/_physics_process` |
