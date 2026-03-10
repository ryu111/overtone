# 遊戲設計理論：核心循環、心流與獎勵機制

> 打造有趣遊戲的核心設計知識。

---

## 核心循環（Core Loop）

### 定義

**核心循環**是玩家反覆執行的最小行動單元，決定遊戲的根本體驗。

```
行動（Action）→ 反饋（Feedback）→ 決策（Decision）→ 下一輪行動
```

**範例（手機射擊遊戲）：**
```
瞄準開槍 → 敵人死亡動畫 + 分數跳動 → 選擇下一個目標 → 瞄準開槍...
```

### 核心循環設計步驟

1. **定義核心動作**：玩家最常做的一件事是什麼？（射擊、跳躍、配對、建造）
2. **設計即時反饋**：動作執行後 0.1 秒內要有明確回饋（音效、視覺、數字）
3. **建立決策空間**：每次循環都要給玩家「選擇」，避免自動化
4. **設計進展感**：每次循環後玩家要感受到些許變化（更強、更多、更遠）

### 循環層次

```
核心循環（Core Loop）     ← 30秒到5分鐘，最基本的重複動作
    ├─ 中循環（Mid Loop）  ← 5-30分鐘，目標達成（過關、解鎖）
    └─ 外循環（Meta Loop） ← 跨 session，長期進展（角色成長、故事推進）
```

---

## 心流理論（Flow Theory）

### Csikszentmihalyi 心流模型

**Mihaly Csikszentmihalyi** 定義的心流（Flow）是最佳體驗狀態——完全沉浸、時間感消失、毫不費力。

```
高挑戰
  │          ╱
  │  焦慮區  ╱  心流通道
  │（Anxiety）╱（Flow Channel）
  │          ╱
  │         ╱
  │    心流通道
  │         ╲
  │          ╲  無聊區
  │           ╲（Boredom）
  └────────────────────── 高技能
低技能
```

**心流的三個條件：**
| 條件 | 設計對應 |
|------|----------|
| 挑戰與技能平衡 | 難度隨玩家能力自動調整 |
| 明確目標 | 每個場景都有清晰的勝利條件 |
| 即時反饋 | 每個動作立即有回應（不超過 0.1 秒） |

### 遊戲設計中的心流應用

```gdscript
# 難度感知範例：根據玩家表現動態調整
class_name DifficultyManager
extends Node

var _recent_deaths: Array[float] = []  # 最近的死亡時間戳

func player_died() -> void:
    _recent_deaths.append(Time.get_unix_time_from_system())
    _cleanup_old_records()
    adjust_difficulty()

func get_death_rate() -> float:
    # 計算過去 5 分鐘的死亡頻率
    var five_min_ago = Time.get_unix_time_from_system() - 300
    var recent = _recent_deaths.filter(func(t): return t > five_min_ago)
    return recent.size() / 5.0  # 每分鐘死亡次數

func adjust_difficulty() -> void:
    var rate = get_death_rate()
    if rate > 2.0:     # 太難：每分鐘死超過 2 次
        reduce_difficulty()
    elif rate < 0.2:   # 太簡單：5 分鐘死不到 1 次
        increase_difficulty()
```

---

## 獎勵機制設計

### 三種獎勵類型

#### 1. 固定獎勵（Fixed Ratio Reward）

```
特性：完成特定行動必定獲得獎勵
優點：可預期，玩家知道努力方向
缺點：獎勵之後行動頻率下降（「完成後休息效應」）
範例：打倒 Boss → 必定掉落特定裝備
```

```gdscript
# 固定獎勵：擊敗Boss時固定獲得鑰匙
func on_boss_defeated() -> void:
    inventory.add_item("boss_key", 1)  # 固定掉落
    show_reward_popup("取得 Boss 鑰匙！")
```

#### 2. 隨機獎勵（Variable Ratio Reward）

```
特性：行動後隨機獲得獎勵（機率性）
優點：最強的行為強化機制（老虎機效應）
缺點：可能令人沮喪，需謹慎設計
範例：擊敗一般敵人有 10% 機率掉落稀有道具
```

```gdscript
# 隨機獎勵：可變比率掉落系統
class_name LootTable
extends Resource

@export var drops: Array[LootEntry] = []

func roll_drops() -> Array[String]:
    var results = []
    for entry in drops:
        if randf() < entry.chance:
            results.append(entry.item_id)
    return results

# 設計原則：
# - 稀有物品：1-5%（驚喜感）
# - 普通物品：20-40%（持續回饋）
# - 垃圾物品：50-70%（填充感）
```

#### 3. 成就系統（Achievement System）

```
特性：完成特定挑戰解鎖永久徽章/稱號
優點：記錄玩家成就，提供長期目標
缺點：需要設計階層讓玩家持續有進展
範例：「無傷通關」、「收集所有寶石」
```

```gdscript
# 成就系統
class_name AchievementSystem
extends Node

signal achievement_unlocked(achievement_id: String)

var _unlocked: Dictionary = {}

func check_achievement(id: String, condition: bool) -> void:
    if condition and not _unlocked.get(id, false):
        _unlocked[id] = true
        achievement_unlocked.emit(id)
        SaveSystem.save_achievement(id)

# 使用範例
func _on_level_completed(level: int, deaths: int) -> void:
    check_achievement("first_clear", level >= 1)
    check_achievement("perfect_run", deaths == 0)
    check_achievement("speedrun", Time.get_ticks_msec() < 60000)
```

### 獎勵設計原則

| 原則 | 說明 |
|------|------|
| 即時性 | 獎勵要在行動後 0.5 秒內出現 |
| 層次感 | 小獎勵（金幣）→ 中獎勵（裝備）→ 大獎勵（成就）|
| 意外驚喜 | 10% 的時候給超出預期的獎勵（streak bonus）|
| 視覺化 | 數字飄動、光效、音效加強獎勵感 |

---

## 難度曲線設計

### Frustration / Boredom 模型

```
玩家感受
  │
  │  ← 挫折區（Frustration Zone）
  │     太難：連續失敗 > 3 次，開始考慮放棄
  │
  │  ← 最佳挑戰區（Sweet Spot）
  │     勝率 60-80%，每次失敗都感覺「差一點」
  │
  │  ← 無聊區（Boredom Zone）
  │     太簡單：自動化操作，無需思考
  │
  └──────────────── 遊戲進程
```

### 關卡難度設計模板

```
關卡結構（推薦的難度節奏）：
 高 ─┐
     │  ╭─╮
     │╭─╯  ╰─╮
 中 ─┤         ╰─╮  ╭─╮
     │            ╰──╯  ╰─
 低 ─┴──────────────────── 時間
      教學  緩和  高峰  緩和 高峰
```

**實作建議：**
1. 每 3-5 關難度高峰後給一個「放鬆關」
2. 新機制引入後立刻給簡單場景練習
3. 最終 Boss 前給一個提示所有機制的關卡

### 動態難度調整（DDA）

```gdscript
# 動態難度調整範例
class_name DDAController
extends Node

@export var target_success_rate: float = 0.7  # 目標勝率 70%

var _session_attempts: int = 0
var _session_wins: int = 0

func record_attempt(won: bool) -> void:
    _session_attempts += 1
    if won:
        _session_wins += 1
    _adjust_if_needed()

func get_current_success_rate() -> float:
    if _session_attempts == 0:
        return target_success_rate
    return float(_session_wins) / _session_attempts

func _adjust_if_needed() -> void:
    if _session_attempts < 5:  # 樣本太少不調整
        return

    var current = get_current_success_rate()
    var diff = current - target_success_rate

    if diff < -0.15:  # 玩家勝率 < 55%，降低難度
        _apply_difficulty_modifier(-0.1)
    elif diff > 0.15:  # 玩家勝率 > 85%，提高難度
        _apply_difficulty_modifier(0.1)

func _apply_difficulty_modifier(delta: float) -> void:
    # 調整敵人速度、血量、攻擊頻率等
    EnemySpawner.difficulty_multiplier = clamp(
        EnemySpawner.difficulty_multiplier + delta, 0.5, 2.0
    )
```

---

## 遊戲類型設計重點

### Arcade（街機）類型

**核心設計目標：** 簡單上手、難以精通、每局短暫、獎勵勇氣

```
局制設計：
- 單局時長：30秒 ~ 3分鐘（手機用戶 1-2 分鐘最佳）
- 死亡感：快速死亡 + 立即重來（不超過 3 秒的死亡動畫）
- 節奏：每 30 秒提速或增加新挑戰元素

漸進難度範例（時間型）：
  0-30s  ： 基礎敵人，教學節奏
  30-60s ： 增加敵人速度 20%
  60-90s ： 新增第二種敵人
  90s+   ： 隨時間加速，直到死亡
```

```gdscript
# Arcade 漸進難度
class_name ArcadeDifficultyTimer
extends Node

var elapsed_time: float = 0.0

const DIFFICULTY_STEPS = [
    {"time": 30,  "speed_mult": 1.2, "spawn_rate": 1.0},
    {"time": 60,  "speed_mult": 1.4, "spawn_rate": 1.5},
    {"time": 90,  "speed_mult": 1.6, "spawn_rate": 2.0},
    {"time": 120, "speed_mult": 2.0, "spawn_rate": 3.0},
]

func _process(delta: float) -> void:
    elapsed_time += delta
    _apply_difficulty_for_time(elapsed_time)
```

**廣告友善特徵：**
- 明確的「遊戲結束」畫面（廣告插入點）
- 局間轉場清晰（完成一局 → 分數顯示 → 廣告 → 再玩）
- 玩家主動選擇「看廣告換續命」（激勵影片廣告最有效時機）

---

### Puzzle（益智）類型

**核心設計目標：** 「啊哈！」時刻、邏輯滿足感、無壓力探索

```
「啊哈！」時刻設計：
1. 玩家看到謎題時 → 感覺困難（建立期待）
2. 嘗試各種方法 → 開始看到規律（探索期）
3. 突然想通 → 驗證並成功（啊哈！）
4. 回顧之前嘗試 → 「原來如此」（後驗滿足）
```

**提示系統設計（漸進式）：**

```gdscript
# 漸進提示系統 — 不直接給答案
class_name HintSystem
extends Node

var _hint_level: int = 0
var _hints: Array[String] = []  # 從模糊到具體

func request_hint() -> String:
    if _hint_level >= _hints.size():
        return "試試看從另一個角度思考..."
    var hint = _hints[_hint_level]
    _hint_level += 1
    return hint

# 設計原則：
# 第1個提示：方向性（「注意顏色」）
# 第2個提示：機制性（「相同顏色的方塊會一起移動」）
# 第3個提示：幾乎直接（「試試先移動右邊的藍色方塊」）
```

---

### Platformer（平台跳躍）類型

**核心設計目標：** 操控手感、空間感、節奏感

**手感調校關鍵參數：**

```gdscript
# 平台跳躍手感設定
class_name PlatformerController
extends CharacterBody2D

# 基礎物理
@export var move_speed: float = 250.0
@export var jump_velocity: float = -400.0
@export var gravity: float = 980.0

# 手感增強（讓跳躍感覺更好）
@export var coyote_time: float = 0.15     # 土狼時間：離開平台後還可跳躍的時間
@export var jump_buffer_time: float = 0.1 # 跳躍緩衝：提前按跳躍鍵的容忍時間
@export var fall_gravity_mult: float = 1.8 # 下落加速（下落比上升快，更俐落）
@export var jump_cut_mult: float = 0.5    # 短按跳躍時的高度縮減

var _coyote_timer: float = 0.0
var _jump_buffer_timer: float = 0.0
var _is_jumping: bool = false

func _physics_process(delta: float) -> void:
    _handle_coyote_time(delta)
    _handle_jump_buffer(delta)
    _apply_gravity(delta)
    _handle_movement()
    _handle_jump()
    move_and_slide()

func _apply_gravity(delta: float) -> void:
    if not is_on_floor():
        var grav_mult = fall_gravity_mult if velocity.y > 0 else 1.0
        velocity.y += gravity * grav_mult * delta
```

**關卡漸進設計（第一關教學原則）：**
```
第1-2關：只介紹基礎跑跳
第3關：引入新障礙（如移動平台）
第4-5關：組合已學技能
第6關：挑戰性應用（快速節奏）
```

---

### Card / Strategy（卡牌 / 策略）類型

**核心設計目標：** 深度決策、meta-game 循環、收集樂趣

```
決策深度設計：
- 每回合都有 2-4 個有意義的選擇（不能太少也不能太多）
- 短期收益 vs 長期策略的取捨
- 信息不完整性（不知道對手手牌/下一張牌）增加策略深度

Meta-game 循環（卡牌遊戲）：
  局內  ：構築牌組 → 對戰 → 獲得獎勵
  局間  ：選擇卡牌 → 升級 → 解鎖新策略
  長期  ：收集系列牌 → 解鎖成就 → 社群比較
```

---

## 廣告嵌入友善特徵

### 什麼樣的遊戲適合廣告盈利

```
高重玩性（High Replayability）
- 每局都不一樣（隨機元素）
- 明確的最高分排行榜（玩家自我挑戰）
- 短局設計（5 分鐘以內，降低廣告中斷的痛苦感）

明確的局間轉場（Clear Session Breaks）
- 死亡畫面（Game Over Screen）
- 關卡完成畫面（Level Complete Screen）
- 主選單返回（Back to Menu）
這些都是廣告插入的自然時機。
```

### 廣告類型與最佳時機

| 廣告類型 | 最佳插入時機 | 設計注意事項 |
|----------|-------------|-------------|
| 插頁廣告（Interstitial） | 關卡完成後、死亡後 | 每 3-5 局出現一次，不要過頻 |
| 激勵影片（Rewarded Video） | 玩家主動選擇「繼續遊戲」 | 最有效、玩家接受度最高 |
| Banner 廣告 | 主選單、道具選擇畫面 | 不要放在遊戲進行中 |

```gdscript
# 激勵廣告整合點（死亡後提供復活選項）
func show_death_screen() -> void:
    death_screen.visible = true
    if AdManager.can_show_rewarded_ad():
        revive_button.visible = true
        revive_button.text = "看廣告繼續"
    else:
        revive_button.visible = false

func on_revive_button_pressed() -> void:
    AdManager.show_rewarded_ad(func(success: bool):
        if success:
            revive_player()
        else:
            show_game_over()
    )
```

### 遊戲類型廣告友善評分

| 類型 | 廣告友善度 | 理由 |
|------|-----------|------|
| Arcade | ⭐⭐⭐⭐⭐ | 短局制、頻繁死亡、自然轉場 |
| Puzzle | ⭐⭐⭐⭐ | 關卡完成是天然廣告點 |
| Platformer | ⭐⭐⭐ | 局較長，死亡後廣告接受度中等 |
| RPG / Strategy | ⭐⭐ | 長局制，廣告中斷破壞沉浸感 |
