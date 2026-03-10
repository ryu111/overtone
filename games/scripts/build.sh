#!/bin/bash
# 用法：bash build.sh --game <name> --platform <html5|linux|macos|windows> [--dry-run]
# 功能：執行 Godot headless export

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAMES_DIR="$(dirname "$SCRIPT_DIR")"

# 顯示 usage
usage() {
  echo "用法：bash build.sh --game <name> --platform <html5|linux|macos|windows> [--dry-run]" >&2
  echo "" >&2
  echo "參數：" >&2
  echo "  --game      遊戲名稱 [必填]" >&2
  echo "  --platform  目標平台：html5 | linux | macos | windows [必填]" >&2
  echo "  --dry-run   只印指令，不實際執行 [可選]" >&2
  exit 1
}

# 解析參數
GAME_NAME=""
PLATFORM=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --game)
      GAME_NAME="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "未知參數：$1" >&2
      usage
      ;;
  esac
done

# 驗證必填參數
if [[ -z "$GAME_NAME" || -z "$PLATFORM" ]]; then
  usage
fi

GAME_DIR="$GAMES_DIR/$GAME_NAME"

# 檢查遊戲目錄是否存在
if [[ ! -d "$GAME_DIR" ]]; then
  echo "錯誤：game not found: $GAME_NAME ($GAME_DIR)" >&2
  exit 1
fi

# platform → Godot preset 名稱與輸出路徑映射
case "$PLATFORM" in
  html5)
    PRESET_NAME="Web"
    OUTPUT_DIR="$GAME_DIR/builds/html5"
    OUTPUT_FILE="$OUTPUT_DIR/index.html"
    ;;
  linux)
    PRESET_NAME="Linux/X11"
    OUTPUT_DIR="$GAME_DIR/builds/linux"
    OUTPUT_FILE="$OUTPUT_DIR/game.x86_64"
    ;;
  macos)
    PRESET_NAME="macOS"
    OUTPUT_DIR="$GAME_DIR/builds/macos"
    OUTPUT_FILE="$OUTPUT_DIR/game.app"
    ;;
  windows)
    PRESET_NAME="Windows Desktop"
    OUTPUT_DIR="$GAME_DIR/builds/windows"
    OUTPUT_FILE="$OUTPUT_DIR/game.exe"
    ;;
  *)
    echo "錯誤：不支援的平台 '$PLATFORM'，支援：html5 | linux | macos | windows" >&2
    exit 1
    ;;
esac

# 尋找 Godot 執行檔
find_godot() {
  if command -v godot >/dev/null 2>&1; then
    echo "godot"
    return
  fi
  local GODOT_APP="/Applications/Godot.app/Contents/MacOS/Godot"
  if [[ -x "$GODOT_APP" ]]; then
    echo "$GODOT_APP"
    return
  fi
  echo ""
}

GODOT_BIN="$(find_godot)"
if [[ -z "$GODOT_BIN" ]]; then
  echo "錯誤：找不到 Godot 執行檔，請確認已安裝 Godot 4.x 或設定 godot alias" >&2
  exit 1
fi

# Fail-fast：檢查 export templates（不依賴 Godot 靜默失敗）
# macOS 路徑
EXPORT_TEMPLATES_DIR_LEGACY="$HOME/Library/Application Support/Godot/export_templates"
# 標準 Linux/macOS 路徑（Godot 4.x）
EXPORT_TEMPLATES_DIR_NEW="$HOME/.local/share/godot/export_templates"

TEMPLATES_FOUND=false
if [[ -d "$EXPORT_TEMPLATES_DIR_LEGACY" && -n "$(ls -A "$EXPORT_TEMPLATES_DIR_LEGACY" 2>/dev/null)" ]]; then
  TEMPLATES_FOUND=true
fi
if [[ -d "$EXPORT_TEMPLATES_DIR_NEW" && -n "$(ls -A "$EXPORT_TEMPLATES_DIR_NEW" 2>/dev/null)" ]]; then
  TEMPLATES_FOUND=true
fi

if [[ "$TEMPLATES_FOUND" == "false" && "$DRY_RUN" == "false" ]]; then
  echo "錯誤：export templates not installed" >&2
  echo "請透過 Godot Editor → Editor → Manage Export Templates 下載，" >&2
  echo "或手動下載 .tpz 並解壓縮至 ~/.local/share/godot/export_templates/" >&2
  exit 1
fi

# 建立輸出目錄
IMPORT_CMD="$GODOT_BIN --headless --path \"$GAME_DIR\" --import"
EXPORT_CMD="$GODOT_BIN --headless --path \"$GAME_DIR\" --export-release \"$PRESET_NAME\" \"$OUTPUT_FILE\""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] 將建立輸出目錄：$OUTPUT_DIR"
  echo "[dry-run] 匯入資源：$IMPORT_CMD"
  echo "[dry-run] 執行 export：$EXPORT_CMD"
  exit 0
fi

echo "建置遊戲：$GAME_NAME → $PLATFORM"
echo "使用 Godot：$GODOT_BIN"

# 建立輸出目錄
mkdir -p "$OUTPUT_DIR"

# 步驟 1：匯入資源（確保資源索引是最新的）
echo "匯入資源..."
eval "$IMPORT_CMD"

# 步驟 2：執行 export
echo "執行 export（preset: $PRESET_NAME）..."
eval "$EXPORT_CMD"

echo "建置完成：$OUTPUT_DIR"
