#!/bin/bash
# 用法：bash new-game.sh --name <game-name> [--display "Display Name"]
# 功能：建立新遊戲專案目錄並寫入 registry.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAMES_DIR="$(dirname "$SCRIPT_DIR")"

# 顯示 usage
usage() {
  echo "用法：bash new-game.sh --name <game-name> [--display \"Display Name\"]" >&2
  echo "" >&2
  echo "參數：" >&2
  echo "  --name     遊戲名稱（slug 格式，如 pixel-dungeon）[必填]" >&2
  echo "  --display  顯示名稱（預設：name 首字母大寫）[可選]" >&2
  exit 1
}

# 解析參數
GAME_NAME=""
DISPLAY_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      GAME_NAME="$2"
      shift 2
      ;;
    --display)
      DISPLAY_NAME="$2"
      shift 2
      ;;
    *)
      echo "未知參數：$1" >&2
      usage
      ;;
  esac
done

# 驗證必填參數
if [[ -z "$GAME_NAME" ]]; then
  usage
fi

# 預設 displayName = name 首字母大寫
if [[ -z "$DISPLAY_NAME" ]]; then
  DISPLAY_NAME="$(echo "${GAME_NAME:0:1}" | tr '[:lower:]' '[:upper:]')${GAME_NAME:1}"
fi

GAME_DIR="$GAMES_DIR/$GAME_NAME"
TEMPLATE_DIR="$GAMES_DIR/template"
REGISTRY_FILE="$GAMES_DIR/registry.json"

# 檢查遊戲目錄是否已存在
if [[ -d "$GAME_DIR" ]]; then
  echo "錯誤：遊戲目錄 '$GAME_NAME' already exists: $GAME_DIR" >&2
  exit 1
fi

# 檢查 template 目錄是否存在
if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "錯誤：template 目錄不存在：$TEMPLATE_DIR" >&2
  exit 1
fi

echo "建立遊戲專案：$GAME_NAME ($DISPLAY_NAME)"

# 從 template 複製到新目錄
cp -r "$TEMPLATE_DIR" "$GAME_DIR"

# 替換模板中的 GAME_NAME 佔位符（用 temp JS 檔案避免 bun -e inline 字串的 shell ! 跳脫問題）
REPLACE_JS="$(mktemp /tmp/new-game-replace-XXXXXX.js)"
cat > "$REPLACE_JS" << 'JSEOF'
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, from, to) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const replaced = content.split(from).join(to);
    if (content !== replaced) {
      fs.writeFileSync(filePath, replaced, 'utf8');
    }
  } catch (e) {
    // 二進位檔或無法讀取的檔案，跳過
  }
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.isFile()) {
      replaceInFile(fullPath, 'GAME_NAME', process.env.GAME_NAME);
      replaceInFile(fullPath, 'DISPLAY_NAME', process.env.DISPLAY_NAME);
    }
  }
}

walkDir(process.env.GAME_DIR);
JSEOF

GAME_NAME="$GAME_NAME" DISPLAY_NAME="$DISPLAY_NAME" GAME_DIR="$GAME_DIR" bun "$REPLACE_JS"
rm -f "$REPLACE_JS"

# 建立 game.json
CREATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "$GAME_DIR/game.json" << EOF
{
  "name": "$GAME_NAME",
  "displayName": "$DISPLAY_NAME",
  "version": "1.0.0",
  "itchChannel": {
    "html5": "html5",
    "linux": "linux",
    "macos": "mac"
  },
  "godotExportPresets": ["Web", "Linux/X11", "macOS"]
}
EOF

# 更新 registry.json（原子寫入 — temp JS 檔案方式）
REGISTRY_TMP="${REGISTRY_FILE}.tmp.$$"
REGISTRY_JS="$(mktemp /tmp/new-game-registry-XXXXXX.js)"
cat > "$REGISTRY_JS" << 'JSEOF'
const fs = require('fs');
const registryFile = process.env.REGISTRY_FILE;
const tmpFile = process.env.REGISTRY_TMP;

let registry = { games: [] };
if (fs.existsSync(registryFile)) {
  try {
    registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  } catch (e) {
    // registry.json 損毀時重新初始化
    registry = { games: [] };
  }
}

if (Array.isArray(registry.games) === false) {
  registry.games = [];
}

registry.games.push({
  name: process.env.GAME_NAME,
  displayName: process.env.DISPLAY_NAME,
  createdAt: process.env.CREATED_AT,
  status: 'concept',
  itchSlug: null
});

fs.writeFileSync(tmpFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');
JSEOF

REGISTRY_FILE="$REGISTRY_FILE" REGISTRY_TMP="$REGISTRY_TMP" \
  GAME_NAME="$GAME_NAME" DISPLAY_NAME="$DISPLAY_NAME" CREATED_AT="$CREATED_AT" \
  bun "$REGISTRY_JS"
rm -f "$REGISTRY_JS"

# 原子移動（mv 在同一檔案系統上是原子操作）
mv "$REGISTRY_TMP" "$REGISTRY_FILE"

echo "遊戲專案建立完成：$GAME_DIR"
echo "Registry 已更新：$REGISTRY_FILE"
