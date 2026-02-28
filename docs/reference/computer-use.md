# Claude Computer Use 完整參考

> 最後更新：2026-02-28 | 基於 Anthropic 官方文件

## 概述

Computer Use 是 Anthropic API 的獨立功能，讓 Claude 透過螢幕截圖 + 座標操控來操作電腦。
**注意**：這不是 Claude Code 的原生功能，需直接呼叫 Anthropic API（加 beta header）。

### 與 Claude Code 的關係

| 層面 | Computer Use | Claude Code |
|------|-------------|-------------|
| 本質 | API 功能（beta） | CLI 產品 |
| 操控方式 | 截圖 → 像素座標 → 點擊 | Tool 系統（Read/Write/Bash） |
| 瀏覽器 | 視覺辨識（pixel-based） | agent-browser CLI（DOM-based） |
| 整合方式 | 需 `anthropic-beta` header | 內建或 MCP |
| 安全模型 | 需 VM/Container 隔離 | 沙盒 + 權限系統 |

---

## 一、支援模型與版本

### Beta Header

| Header | 適用模型 |
|--------|---------|
| `computer-use-2025-11-24` | Opus 4.6, Sonnet 4.6, Opus 4.5 |
| `computer-use-2025-01-24` | Sonnet 4.5, Haiku 4.5, Opus 4.1, Sonnet 4, Opus 4, Sonnet 3.7 |

### 模型對應工具版本

| 模型 | Computer Tool | Text Editor Tool | Bash Tool | 狀態 |
|------|:------------:|:----------------:|:---------:|:----:|
| Opus 4.6 | `computer_20251124` | `text_editor_20250728` | `bash_20250124` | 最新 |
| Sonnet 4.6 | `computer_20251124` | `text_editor_20250728` | `bash_20250124` | 最新 |
| Opus 4.5 | `computer_20251124` | `text_editor_20250728` | `bash_20250124` | — |
| Sonnet 4.5 | `computer_20250124` | `text_editor_20250124` | `bash_20250124` | — |
| Haiku 4.5 | `computer_20250124` | `text_editor_20250124` | `bash_20250124` | — |

> ⚠️ 舊工具版本不保證與新模型向後相容，必須使用對應版本。

---

## 二、Computer Tool（螢幕操控）

### Tool 定義

```json
{
  "type": "computer_20251124",
  "name": "computer",
  "display_width_px": 1024,
  "display_height_px": 768,
  "display_number": 1,
  "enable_zoom": true
}
```

### 參數

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|:----:|------|------|
| `type` | string | ✅ | — | 工具版本（`computer_20251124` 或 `computer_20250124`） |
| `name` | string | ✅ | — | 必須為 `"computer"` |
| `display_width_px` | number | ✅ | — | 顯示寬度（像素） |
| `display_height_px` | number | ✅ | — | 顯示高度（像素） |
| `display_number` | number | | 無 | X11 顯示號碼 |
| `enable_zoom` | boolean | | false | 啟用 zoom（僅 `computer_20251124`） |

### 建議解析度

| 場景 | 解析度 | 說明 |
|------|--------|------|
| 通用桌面 | 1024×768（XGA） | 預設建議 |
| 網頁應用 | 1280×800 | 較寬螢幕 |
| 避免超過 | 1920×1080 | 效能下降 |

API 限制：最長邊 1568 像素，約 1.15M 像素。超過時需縮放。

### Action 完整列表

#### 基礎動作（所有版本）

| Action | 參數 | 說明 |
|--------|------|------|
| `screenshot` | — | 擷取當前螢幕 |
| `left_click` | `coordinate: [x, y]` | 左鍵點擊 |
| `right_click` | `coordinate: [x, y]` | 右鍵點擊 |
| `middle_click` | `coordinate: [x, y]` | 中鍵點擊 |
| `double_click` | `coordinate: [x, y]` | 雙擊 |
| `triple_click` | `coordinate: [x, y]` | 三擊（選取整行） |
| `type` | `text: "string"` | 輸入文字 |
| `key` | `text: "ctrl+s"` | 按鍵組合 |
| `mouse_move` | `coordinate: [x, y]` | 移動滑鼠 |
| `scroll` | `coordinate, scroll_direction, scroll_amount` | 滾動 |
| `left_click_drag` | `start_coordinate, coordinate` | 拖曳 |
| `wait` | `duration: N` | 暫停 N 秒 |

#### 增強動作（`computer_20250124`+）

| Action | 參數 | 說明 |
|--------|------|------|
| `left_mouse_down` | `coordinate: [x, y]` | 按住左鍵 |
| `left_mouse_up` | — | 放開左鍵 |
| `hold_key` | `text: "shift", duration: N` | 按住按鍵 N 秒 |

#### 新增動作（`computer_20251124` 限定）

| Action | 參數 | 說明 |
|--------|------|------|
| `zoom` | `region: [x1, y1, x2, y2]` | 放大檢查特定區域（需 `enable_zoom: true`） |

#### 修飾鍵支援

```json
// Shift+click
{ "action": "left_click", "coordinate": [500, 300], "text": "shift" }

// Ctrl+click
{ "action": "left_click", "coordinate": [500, 300], "text": "ctrl" }

// Cmd/Super+click（macOS）
{ "action": "left_click", "coordinate": [500, 300], "text": "super" }

// Shift+scroll
{ "action": "scroll", "coordinate": [500, 400], "scroll_direction": "down", "scroll_amount": 3, "text": "shift" }
```

#### Scroll 方向

| `scroll_direction` | 說明 |
|:------------------:|------|
| `up` | 向上滾動 |
| `down` | 向下滾動 |
| `left` | 向左滾動 |
| `right` | 向右滾動 |

---

## 三、Text Editor Tool（檔案編輯）

### Tool 定義

```json
{
  "type": "text_editor_20250728",
  "name": "str_replace_based_edit_tool",
  "max_characters": 10000
}
```

### 參數

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|:----:|------|------|
| `type` | string | ✅ | — | `text_editor_20250728` 或 `text_editor_20250124` |
| `name` | string | ✅ | — | 必須為 `"str_replace_based_edit_tool"` |
| `max_characters` | number | | 無 | 檔案截斷長度（僅 `20250728`） |

### 支援命令

| 命令 | 參數 | 說明 |
|------|------|------|
| `view` | `path`, `view_range: [start, end]` | 檢視檔案（-1 表示末尾） |
| `str_replace` | `path`, `old_str`, `new_str` | 替換文字（必須完全匹配） |
| `create` | `path`, `file_text` | 建立新檔案 |
| `insert` | `path`, `insert_line`, `insert_text` | 在指定行後插入 |
| `undo_edit` | `path` | 復原（僅 Sonnet 3.7 版本） |

### 版本差異

| 特性 | `text_editor_20250728` | `text_editor_20250124` |
|------|:---------------------:|:---------------------:|
| 適用模型 | Claude 4 系列 | Sonnet 3.7（已棄用） |
| `undo_edit` | ❌ | ✅ |
| `max_characters` | ✅ | ❌ |

---

## 四、Bash Tool（命令執行）

### Tool 定義

```json
{
  "type": "bash_20250124",
  "name": "bash"
}
```

### 參數

| 參數 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| `command` | string | 條件 | 執行的命令（`restart` 為 true 時不需要） |
| `restart` | boolean | | 重啟 bash 會話 |

### 特性

- **持久化會話**：環境變數和工作目錄跨命令保持
- **狀態保留**：建立的檔案在後續命令可存取
- **多行命令**：支援管道、重定向、指令鏈

---

## 五、API 請求與回應

### 請求範例（Python）

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=2000,
    tools=[
        {
            "type": "computer_20251124",
            "name": "computer",
            "display_width_px": 1024,
            "display_height_px": 768,
            "enable_zoom": True,
        },
        {
            "type": "text_editor_20250728",
            "name": "str_replace_based_edit_tool",
        },
        {
            "type": "bash_20250124",
            "name": "bash",
        },
    ],
    messages=[{"role": "user", "content": "在桌面建立一個文字檔"}],
    betas=["computer-use-2025-11-24"],
)
```

### 請求範例（cURL）

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: computer-use-2025-11-24" \
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 2000,
    "tools": [
      {
        "type": "computer_20251124",
        "name": "computer",
        "display_width_px": 1024,
        "display_height_px": 768,
        "enable_zoom": true
      }
    ],
    "messages": [
      {"role": "user", "content": "截取目前螢幕畫面"}
    ]
  }'
```

### 回應格式

**Tool Use（Claude 的動作請求）**：
```json
{
  "type": "tool_use",
  "id": "toolu_01A09q90qw90lq917835lq9",
  "name": "computer",
  "input": {
    "action": "left_click",
    "coordinate": [500, 300]
  }
}
```

**Tool Result（回傳給 Claude）**：
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/png",
        "data": "base64_encoded_screenshot..."
      }
    }
  ]
}
```

**錯誤回應**：
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
  "content": "Error: Coordinates (1200, 900) are outside display bounds (1024x768).",
  "is_error": true
}
```

---

## 六、Token 消耗

### 固定開銷

| 項目 | Token 數 |
|------|:--------:|
| 系統提示（Computer Use Beta） | 466-499 |
| Computer Tool 定義 | 735 |
| Text Editor Tool 定義 | 700 |
| Bash Tool 定義 | 245 |

### 變動消耗

| 項目 | 估計 |
|------|------|
| 每張截圖 | 依解析度，遵循 Vision 定價 |
| 命令輸出 | 依 stdout/stderr 長度 |
| 檔案內容 | 依檔案大小 |

### 座標縮放計算

API 限制圖片最長邊 1568 像素、約 1.15M 像素。超過時需縮放：

```python
import math

def get_scale_factor(width, height):
    long_edge = max(width, height)
    total_pixels = width * height
    long_edge_scale = 1568 / long_edge
    total_pixels_scale = math.sqrt(1_150_000 / total_pixels)
    return min(1.0, long_edge_scale, total_pixels_scale)

# 範例：1920×1080 → scale ~0.64 → 實際傳送 1228×691
scale = get_scale_factor(1920, 1080)
```

### 成本估算範例

一個 5 步驟 GUI 任務（Sonnet 4.6）：

| 項目 | Token | 成本 |
|------|------:|-----:|
| 初始化（系統 + Tool 定義） | ~1,900 | — |
| 5 次截圖 + 動作迴圈 | ~1,500 | — |
| **總計** | ~3,400 | ~$0.05 |

對比 agent-browser：同等任務 ~$0.01（自託管免費）。成本差 3-5x。

---

## 七、性能基準

### Sonnet 4.6 Computer Use 表現

| Benchmark | 分數 | 說明 |
|-----------|:----:|------|
| OSWorld-Verified | 72.5% | 接近人類基準 |
| WebVoyager（Computer Use） | ~56% | 網頁導航 |

### 與 agent-browser 對比

| 維度 | Computer Use | agent-browser |
|------|:-----------:|:------------:|
| WebVoyager | 56% | 89.1% |
| 操控方式 | pixel-based | DOM-based |
| 穩定性 | 中（UI 變化敏感） | 高（結構穩定） |
| 速度 | 慢（每步需截圖分析） | 快（直接 DOM 操作） |
| 成本 | 高（截圖 token） | 低（文字 token） |
| 適用範圍 | 桌面+瀏覽器+終端 | 僅瀏覽器 |

**結論**：Web 自動化選 agent-browser；桌面應用選 Computer Use。

---

## 八、安全風險與最佳實踐

### 核心風險

| 風險 | 嚴重度 | 說明 |
|------|:------:|------|
| Prompt Injection | 🔴 | 網頁內容可能覆蓋使用者指令 |
| 認證暴露 | 🔴 | 操作過程可能擷取到密碼/Token |
| 意外操作 | 🟡 | 座標偏差可能點錯按鈕 |
| 資料洩漏 | 🟡 | 截圖可能包含機密資訊 |
| ZDR 不適用 | 🟡 | Beta 功能不受 Zero Data Retention 保護 |

### Anthropic 官方安全建議

1. **隔離環境**：使用 VM 或 Container，最小權限執行
2. **限制存取**：避免敏感帳戶（銀行、密碼管理器）
3. **網路白名單**：限制可存取的網域
4. **人工確認**：關鍵操作（財務、發送訊息）需人工審核
5. **自動防護**：Anthropic 分類器檢測可能的 prompt injection

### 最佳實踐

```python
# 1. 明確的任務指令
prompt = """
訪問 example.com，找到定價頁面，列出所有產品價格。
每一步後截圖確認結果。如果不正確，重試。
"""

# 2. 座標縮放處理
screenshot_input = resize_screenshot(screen, scale)
response = send_to_claude(screenshot_input)
actual_x = response.coordinate[0] / scale
actual_y = response.coordinate[1] / scale

# 3. Git checkpoint 保護
# 執行前 commit baseline
# 每個成功步驟建立 checkpoint
# 失敗時 revert 到上一個 checkpoint
```

---

## 九、Claude Code 中使用 Computer Use 的方式

### 方式 1：MCP Server（社群方案）

```bash
# 安裝 computer-use-mcp
claude mcp add --scope user --transport stdio computer-use -- npx -y computer-use-mcp
```

⚠️ 社群方案，非官方支援。安全風險高 — 將完整桌面存取權交給 Claude。

### 方式 2：Bash + Anthropic SDK（自建橋接）

在 Claude Code 中透過 Bash 工具呼叫外部腳本，腳本內部使用 Anthropic SDK：

```bash
# Claude Code 內執行
python scripts/computer-use-task.py "截取瀏覽器畫面並找到登入按鈕"
```

```python
# scripts/computer-use-task.py
import anthropic
import sys

client = anthropic.Anthropic()
task = sys.argv[1]

# 建立 Computer Use 會話
response = client.beta.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    tools=[{
        "type": "computer_20251124",
        "name": "computer",
        "display_width_px": 1024,
        "display_height_px": 768,
    }],
    messages=[{"role": "user", "content": task}],
    betas=["computer-use-2025-11-24"],
)

# 處理回應並執行 action loop...
```

### 方式 3：不使用（推薦）

對於 Web 自動化場景，agent-browser 在 Claude Code 生態中更成熟、更穩定、更便宜。

---

## 十、Overtone 適用性評估

### 現有 E2E/QA 方案

| 元件 | 用途 | 技術 |
|------|------|------|
| e2e-runner agent | E2E 自動化測試 | agent-browser CLI |
| qa agent | 行為驗證 | agent-browser CLI |
| debugger agent | 診斷（可截圖） | agent-browser CLI |
| on-start.js | 檢查 agent-browser 安裝 | `which agent-browser` |

### Computer Use 對 Overtone 的價值

| 場景 | 適用性 | 理由 |
|------|:------:|------|
| Dashboard E2E | ❌ 低 | agent-browser 已覆蓋，更穩定 |
| QA 視覺驗證 | ❌ 低 | agent-browser snapshot/screenshot 已足夠 |
| 桌面應用測試 | ⚪ N/A | Overtone 無桌面 UI |
| 非瀏覽器 GUI 測試 | ⚡ 潛在 | 未來如果需要測試桌面應用 |
| 跨應用工作流 | ⚡ 潛在 | 如：IDE → Terminal → Browser 串聯 |

### 整合建議

| 時間範圍 | 建議 |
|----------|------|
| 短期（v0.19-0.20） | 文件化記錄（本文件），不整合 |
| 中期（v1.0） | 評估是否需要桌面測試能力 |
| 長期 | 視 Anthropic 穩定度和 Claude Code 原生整合進度決定 |

**不建議直接整合的原因**：
1. **安全邊界模糊** — Hook 層無法完全隔離桌面存取
2. **成本不可控** — 並行 agent 使用 Computer Use 時成本爆炸
3. **複雜度增加** — 17 個 agent 已足夠複雜
4. **Beta 狀態** — 包含社群 MCP 方案都不穩定

---

## 參考資源

| 資源 | URL |
|------|-----|
| Computer Use Tool 官方文件 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool |
| Text Editor Tool 官方文件 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool |
| Bash Tool 官方文件 | https://platform.claude.com/docs/en/agents-and-tools/tool-use/bash-tool |
| Reference Implementation | https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo |
| computer-use-mcp（社群） | https://github.com/domdomegg/computer-use-mcp |
