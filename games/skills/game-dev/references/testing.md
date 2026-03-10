# GUT 測試框架使用指南

> GUT（Godot Unit Test）是 Godot 原生的 GDScript 單元測試框架。

---

## GUT 安裝方式

### 方式 1：Godot Asset Library（推薦）

1. 在 Godot 編輯器中開啟 AssetLib（頂部標籤）
2. 搜尋 "GUT - Godot Unit Testing"
3. 點擊下載並安裝到 `addons/gut/`
4. 專案設定 → Plugins → 啟用 "GUT - Godot Unit Testing"

### 方式 2：git submodule（CI/CD 推薦）

```bash
# 新增 GUT 為 submodule
git submodule add https://github.com/bitwes/Gut.git addons/gut

# 克隆時初始化 submodule
git clone --recurse-submodules <repo_url>
```

### 目錄結構確認

```
project/
├── addons/
│   └── gut/
│       ├── plugin.cfg      ← GUT addon 設定
│       ├── gut.gd          ← GUT 核心腳本
│       ├── gut_cmdln.gd    ← Headless 執行入口
│       └── ...
├── tests/
│   ├── unit/
│   │   └── test_player.gd
│   └── integration/
│       └── test_game_flow.gd
└── project.godot
```

---

## Headless 執行指令

### 基本執行

```bash
# 執行所有測試（指定測試目錄）
godot --headless --path . -s addons/gut/gut_cmdln.gd \
  -gdir=res://tests/ \
  -gexit

# 執行特定目錄
godot --headless --path . -s addons/gut/gut_cmdln.gd \
  -gdir=res://tests/unit/ \
  -gexit

# 執行特定測試檔
godot --headless --path . -s addons/gut/gut_cmdln.gd \
  -gtest=res://tests/unit/test_player.gd \
  -gexit
```

### 常用參數

| 參數 | 說明 | 範例 |
|------|------|------|
| `-gdir` | 測試目錄路徑（遞迴掃描） | `-gdir=res://tests/` |
| `-gtest` | 指定單一測試檔 | `-gtest=res://tests/test_foo.gd` |
| `-gexit` | 測試完成後退出 Godot | `-gexit` |
| `-glog` | log 詳細程度（0-5） | `-glog=2` |
| `-gjunit_xml_file` | 輸出 JUnit XML 報告 | `-gjunit_xml_file=results.xml` |
| `-gprefix` | 測試函式前綴（預設 "test_"） | `-gprefix=test_` |

### CI/CD 整合（GitHub Actions）

```yaml
# .github/workflows/tests.yml
name: Godot Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive  # 載入 GUT submodule

      - name: Setup Godot
        uses: chickensoft-games/setup-godot@v1
        with:
          version: 4.3.0

      - name: Import project
        run: godot --headless --import --quit

      - name: Run GUT tests
        run: |
          godot --headless --path . \
            -s addons/gut/gut_cmdln.gd \
            -gdir=res://tests/ \
            -gexit \
            -gjunit_xml_file=test_results.xml

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test_results.xml
```

---

## 測試腳本結構

### 基本測試檔案

```gdscript
# tests/unit/test_player.gd
extends GutTest

# === 測試生命週期 ===

func before_all() -> void:
    # 整個測試檔案開始前執行一次（初始化資源等）
    pass

func after_all() -> void:
    # 整個測試檔案結束後執行一次（清理資源）
    pass

func before_each() -> void:
    # 每個 test_ 函式執行前呼叫
    pass

func after_each() -> void:
    # 每個 test_ 函式執行後呼叫（清理場景節點）
    pass

# === 測試函式（必須以 test_ 開頭）===

func test_player_starts_with_full_health() -> void:
    # Arrange
    var player = preload("res://src/scenes/player.tscn").instantiate()
    add_child(player)  # 加入場景樹

    # Act（不需要，只是檢查初始狀態）

    # Assert
    assert_eq(player.health, player.max_health, "玩家初始血量應等於最大血量")

    # Cleanup（after_each 也可以做）
    player.queue_free()

func test_player_takes_damage() -> void:
    var player = preload("res://src/scenes/player.tscn").instantiate()
    add_child(player)

    player.take_damage(30)

    assert_eq(player.health, player.max_health - 30, "受傷後血量應減少")
    player.queue_free()

func test_player_dies_at_zero_health() -> void:
    var player = preload("res://src/scenes/player.tscn").instantiate()
    add_child(player)
    watch_signals(player)  # 開始監聽 signal

    player.take_damage(player.max_health)

    assert_signal_emitted(player, "died", "血量歸零時應發送 died signal")
    player.queue_free()
```

### 場景測試（Integration Test）

```gdscript
# tests/integration/test_combat.gd
extends GutTest

var _player: Player
var _enemy: Enemy

func before_each() -> void:
    # 實例化需要的場景節點
    _player = preload("res://src/scenes/player.tscn").instantiate()
    _enemy = preload("res://src/scenes/enemy.tscn").instantiate()
    add_child(_player)
    add_child(_enemy)

func after_each() -> void:
    # 測試後清理（必須！否則節點堆積導致記憶體洩漏）
    _player.queue_free()
    _enemy.queue_free()
    _player = null
    _enemy = null

func test_attack_reduces_enemy_health() -> void:
    var initial_health = _enemy.health
    _player.attack(_enemy)
    assert_lt(_enemy.health, initial_health, "攻擊後敵人血量應減少")

func test_killing_enemy_increments_score() -> void:
    watch_signals(EventBus)
    _enemy.health = 1
    _player.attack(_enemy)
    assert_signal_emitted(EventBus, "score_changed", "擊敗敵人應觸發分數更新")
```

### 測試純函式（Unit Test）

```gdscript
# tests/unit/test_loot_table.gd
extends GutTest

func test_loot_table_never_drops_more_than_max() -> void:
    var loot_table = LootTable.new()
    loot_table.max_drops = 3

    # 多次執行確認邊界條件
    for i in 100:
        var drops = loot_table.roll_drops()
        assert_lte(drops.size(), 3, "掉落數量不應超過最大值")

func test_empty_loot_table_returns_empty_array() -> void:
    var loot_table = LootTable.new()
    # loot_table.drops 預設為空陣列

    var drops = loot_table.roll_drops()

    assert_eq(drops, [], "空掉落表應回傳空陣列")
    assert_eq(drops.size(), 0)
```

---

## 斷言方法速查

### 基本值斷言

```gdscript
assert_eq(actual, expected, "訊息")       # 相等
assert_ne(actual, unexpected, "訊息")     # 不相等
assert_true(condition, "訊息")            # 為 true
assert_false(condition, "訊息")           # 為 false
assert_null(value, "訊息")               # 為 null
assert_not_null(value, "訊息")           # 不為 null
```

### 數值比較

```gdscript
assert_gt(value, threshold, "訊息")      # 大於
assert_gte(value, threshold, "訊息")     # 大於等於
assert_lt(value, threshold, "訊息")      # 小於
assert_lte(value, threshold, "訊息")     # 小於等於

# 浮點數近似比較（避免精度問題）
assert_almost_eq(actual, expected, 0.01, "訊息")
assert_almost_ne(actual, unexpected, 0.01, "訊息")
```

### 字串斷言

```gdscript
# GUT 沒有內建字串特定斷言，用組合
assert_true(text.contains("expected"), "字串應包含...")
assert_true(text.begins_with("prefix"), "字串應以...開頭")
assert_eq(text.length(), 10, "字串長度應為 10")
```

### 陣列 / 字典斷言

```gdscript
assert_eq(arr.size(), 3, "陣列長度")
assert_true(arr.has("item"), "陣列應包含元素")
assert_eq(arr, ["a", "b", "c"], "陣列內容應相等")

assert_true(dict.has("key"), "字典應包含鍵")
assert_eq(dict["key"], "value", "字典值")
```

### Signal 斷言

```gdscript
# 1. 先呼叫 watch_signals（必須在觸發前呼叫）
watch_signals(my_node)

# 2. 執行觸發 signal 的動作
my_node.do_something()

# 3. 斷言 signal 是否發送
assert_signal_emitted(my_node, "signal_name", "signal 應被發送")
assert_signal_not_emitted(my_node, "signal_name", "signal 不應被發送")

# 4. 帶參數的 signal 驗證
assert_signal_emitted_with_parameters(
    my_node,
    "health_changed",
    [100, 70],    # 預期的參數值 [old, new]
    "health_changed signal 參數不正確"
)
```

### 待定測試（Pending）

```gdscript
func test_not_yet_implemented() -> void:
    pending("這個功能尚未實作")
    # pending() 後面的程式碼不會執行
    # 測試會標記為 pending（黃色），不算失敗
```

---

## 常見場景測試技巧

### 測試節點加入場景樹

```gdscript
# 需要 _ready() 執行時，必須 add_child
func test_node_ready_logic() -> void:
    var node = MyNode.new()
    add_child(node)  # 這會觸發 _ready()

    # 現在可以測試 _ready() 設定的狀態
    assert_not_null(node.some_reference)

    node.queue_free()  # 清理
```

### 測試 Timer / 異步行為

```gdscript
func test_timer_fires_signal() -> void:
    var timer = Timer.new()
    timer.wait_time = 0.1
    add_child(timer)
    watch_signals(timer)

    timer.start()
    await timer.timeout  # 等待 timer 觸發（GUT 支援 await）

    assert_signal_emitted(timer, "timeout")
    timer.queue_free()
```

### Mock / Stub（使用 GUT 內建）

```gdscript
func test_with_doubled_dependency() -> void:
    # double() 建立一個可追蹤呼叫的替代物件
    var mock_audio = double(AudioManager)
    stub(mock_audio, "play_sound").to_do_nothing()

    var player = Player.new()
    player.audio_manager = mock_audio
    add_child(player)

    player.jump()

    # 驗證 play_sound 被呼叫
    assert_called(mock_audio, "play_sound")
    assert_call_count(mock_audio, "play_sound", 1)

    player.queue_free()
```

---

## GdUnit4 → GUT 快速對照

| GdUnit4（舊） | GUT（新） |
|--------------|-----------|
| `extends GdUnitTestSuite` | `extends GutTest` |
| `func before_test()` | `func before_each()` |
| `func after_test()` | `func after_each()` |
| `assert_that(v).is_equal(e)` | `assert_eq(v, e)` |
| `assert_that(v).is_true()` | `assert_true(v)` |
| `assert_that(v).is_not_null()` | `assert_not_null(v)` |
| `assert_that(arr).has_size(n)` | `assert_eq(arr.size(), n)` |
| `auto_free(obj)` | `add_child(obj)` + `after_each` 手動 `queue_free` |
| signal 監聽 | `watch_signals(obj)` + `assert_signal_emitted` |
| `skip("reason")` | `pending("reason")` |
