# Godot Export 流程

> Godot 4.6.1 Web (HTML5) headless export、部署設定、CI/CD 整合

---

## 前置條件

### export templates 安裝驗證

**macOS 路徑**：
```
~/Library/Application Support/Godot/export_templates/{版本號}/
```

**Linux 路徑**：
```
~/.local/share/godot/export_templates/{版本號}/
```

**驗證指令**：
```bash
# macOS
ls ~/Library/Application\ Support/Godot/export_templates/

# Linux
ls ~/.local/share/godot/export_templates/
```

⚠️ **靜默失敗風險**：templates 未安裝時，`godot --headless --export-release` 不會報錯，但產出的 build 為空或不完整。必須在 export 前驗證。

**fail-fast 解決方案**（在 build script 前置步驟）：
```bash
# macOS / Linux 通用
TEMPLATE_BASE="${HOME}/Library/Application Support/Godot/export_templates"
if [ ! -d "${TEMPLATE_BASE}" ] || [ -z "$(ls -A "${TEMPLATE_BASE}" 2>/dev/null)" ]; then
  echo "❌ export templates not installed"
  echo "   下載：Godot Editor → Editor → Manage Export Templates"
  exit 1
fi
```

---

## export_presets.cfg 格式

export 指令的 `"Web"` 參數必須與 `export_presets.cfg` 中的 `name` 完全對應：

```ini
[preset.0]

name="Web"
platform="Web"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter="*.png, *.wav, *.ogg"
exclude_filter=""
export_path="builds/html5/index.html"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.0.options]

custom_template/debug=""
custom_template/release=""
variant/extensions_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
```

---

## Export 指令

### 前置步驟（必要）

```bash
# 1. import（初始化資源索引）
godot --headless --import --path /path/to/project

# 2. export release
godot --headless --export-release "Web" ./builds/html5/index.html --path /path/to/project
```

### 完整 build 流程

```bash
#!/bin/bash
set -euo pipefail

PROJECT_DIR="$1"
OUTPUT_DIR="${PROJECT_DIR}/builds/html5"

# 驗證 templates
TEMPLATE_BASE="${HOME}/Library/Application Support/Godot/export_templates"
if [ ! -d "${TEMPLATE_BASE}" ] || [ -z "$(ls -A "${TEMPLATE_BASE}" 2>/dev/null)" ]; then
  echo "❌ export templates not installed" >&2
  exit 1
fi

# 建立輸出目錄
mkdir -p "${OUTPUT_DIR}"

# 前置 import
godot --headless --import --path "${PROJECT_DIR}" 2>&1

# 執行 export
godot --headless --export-release "Web" \
  "${OUTPUT_DIR}/index.html" \
  --path "${PROJECT_DIR}" 2>&1

echo "✅ Build 完成：${OUTPUT_DIR}"
```

---

## 部署目標

### Vercel（推薦）

Godot Web export 需要 `SharedArrayBuffer`，必須設定 COOP/COEP headers：

**vercel.json**：
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

部署指令：
```bash
cd builds/html5/
vercel --prod
```

### GitHub Pages

⚠️ **限制**：GitHub Pages 不支援自訂 HTTP headers，無法設定 COOP/COEP，導致 `SharedArrayBuffer` 不可用（threading 功能無法使用）。

解決方式：使用 [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) polyfill（在 HTML 中加入 service worker）。

### itch.io

透過 butler 推送（見 `butler.md`）。itch.io 嵌入 iframe 也有 SharedArrayBuffer 限制。

---

## GitHub Actions CI/CD

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Godot
        uses: chickensoft-games/setup-godot@v1
        with:
          version: 4.6.1
          use-dotnet: false
          include-templates: true

      - name: Import project
        run: godot --headless --import --path .

      - name: Verify export templates
        run: |
          if [ ! -d "${HOME}/.local/share/godot/export_templates" ]; then
            echo "❌ export templates not installed"
            exit 1
          fi

      - name: Build HTML5
        run: |
          mkdir -p builds/html5
          godot --headless --export-release "Web" \
            ./builds/html5/index.html --path .

      - name: Deploy to itch.io
        env:
          BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}
        run: |
          curl -L -o butler.zip \
            https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default
          unzip butler.zip
          chmod +x butler
          ./butler push builds/html5/ ${{ vars.ITCH_USER }}/${{ vars.ITCH_GAME }}:html5 \
            --userversion "${{ github.run_number }}"
```

---

## 常見問題

| 問題 | 原因 | 解法 |
|------|------|------|
| export 後 .html 為空 | templates 未安裝 | 安裝對應版本 templates |
| 遊戲黑屏 | COOP/COEP headers 缺失 | 加入 vercel.json 設定 |
| Audio 無聲 | 瀏覽器需使用者互動才能啟用 AudioContext | 加入 click-to-start 畫面 |
| `godot: not found` | PATH 未設定 | `export PATH=$PATH:/path/to/godot` |
