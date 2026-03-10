#!/bin/bash
# 用法：bash publish.sh --game <name> --version <semver> --channel <html5|linux|mac|win|universal> [--dry-run]
# 功能：使用 butler CLI 推送至 itch.io，並記錄發佈歷史

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GAMES_DIR="$(dirname "$SCRIPT_DIR")"

# 顯示 usage
usage() {
  echo "用法：bash publish.sh --game <name> --version <semver> --channel <html5|linux|mac|win|universal> [--dry-run]" >&2
  echo "" >&2
  echo "參數：" >&2
  echo "  --game     遊戲名稱 [必填]" >&2
  echo "  --version  版本號（semver，如 1.0.0）[必填]" >&2
  echo "  --channel  itch.io channel：html5 | linux | mac | win | universal [必填]" >&2
  echo "  --dry-run  只印指令，不實際推送 [可選]" >&2
  echo "" >&2
  echo "環境變數：" >&2
  echo "  BUTLER_API_KEY  butler 認證金鑰（自動化場景）" >&2
  echo "  ITCH_USERNAME   itch.io 帳號名稱（可由 game.json 覆蓋）" >&2
  exit 1
}

# 解析參數
GAME_NAME=""
VERSION=""
CHANNEL=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --game)
      GAME_NAME="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --channel)
      CHANNEL="$2"
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
if [[ -z "$GAME_NAME" || -z "$VERSION" || -z "$CHANNEL" ]]; then
  usage
fi

GAME_DIR="$GAMES_DIR/$GAME_NAME"
GAME_JSON="$GAME_DIR/game.json"
BUILD_DIR="$GAME_DIR/builds/$CHANNEL"
PUBLISH_LOG="$GAME_DIR/publish-log.jsonl"

# 檢查遊戲目錄是否存在
if [[ ! -d "$GAME_DIR" ]]; then
  echo "錯誤：game not found: $GAME_NAME ($GAME_DIR)" >&2
  exit 1
fi

# Fail-fast：檢查 build 產物是否存在且非空
if [[ ! -d "$BUILD_DIR" ]] || [[ -z "$(ls -A "$BUILD_DIR" 2>/dev/null)" ]]; then
  echo "錯誤：build not found or empty: $BUILD_DIR" >&2
  echo "請先執行 build.sh --game $GAME_NAME --platform $CHANNEL" >&2
  exit 1
fi

# 讀取 game.json（用 temp JS 檔案解析，避免 bun -e inline shell ! 跳脫問題）
PARSE_JS="$(mktemp /tmp/publish-parse-XXXXXX.js)"
cat > "$PARSE_JS" << 'JSEOF'
const fs = require('fs');
const gameJson = process.env.GAME_JSON;
const gameName = process.env.GAME_NAME;
try {
  const data = JSON.parse(fs.readFileSync(gameJson, 'utf8'));
  const username = data.itchUsername || '';
  const slug = data.itchSlug || data.name || gameName;
  console.log(username + '\n' + slug);
} catch (e) {
  console.log('\n' + gameName);
}
JSEOF

ITCH_USERNAME_FROM_JSON=""
ITCH_SLUG="$GAME_NAME"

if [[ -f "$GAME_JSON" ]]; then
  JSON_OUTPUT="$(GAME_JSON="$GAME_JSON" GAME_NAME="$GAME_NAME" bun "$PARSE_JS")"
  ITCH_USERNAME_FROM_JSON="$(echo "$JSON_OUTPUT" | head -1)"
  ITCH_SLUG="$(echo "$JSON_OUTPUT" | tail -1)"
fi
rm -f "$PARSE_JS"

# 決定 itch.io 帳號名稱（優先順序：game.json > 環境變數）
ITCH_USERNAME="${ITCH_USERNAME_FROM_JSON:-${ITCH_USERNAME:-}}"

if [[ -z "$ITCH_USERNAME" ]]; then
  echo "錯誤：ITCH_USERNAME 未設定，請設定環境變數或在 game.json 中加入 itchUsername 欄位" >&2
  exit 1
fi

if [[ -z "$ITCH_SLUG" ]]; then
  ITCH_SLUG="$GAME_NAME"
fi

# 組合 butler push 指令
BUTLER_TARGET="${ITCH_USERNAME}/${ITCH_SLUG}:${CHANNEL}"
BUTLER_CMD="butler push \"$BUILD_DIR\" \"$BUTLER_TARGET\""

# 寫入 publish-log.jsonl（temp JS 檔案方式）
write_log() {
  local dry_val="$1"
  local published_at
  published_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local log_js
  log_js="$(mktemp /tmp/publish-log-XXXXXX.js)"
  cat > "$log_js" << 'JSEOF'
const fs = require('fs');
const entry = {
  version: process.env.VERSION,
  channel: process.env.CHANNEL,
  publishedAt: process.env.PUBLISHED_AT,
  dry: process.env.DRY === 'true'
};
fs.appendFileSync(process.env.PUBLISH_LOG, JSON.stringify(entry) + '\n', 'utf8');
JSEOF
  VERSION="$VERSION" CHANNEL="$CHANNEL" PUBLISHED_AT="$published_at" \
    DRY="$dry_val" PUBLISH_LOG="$PUBLISH_LOG" bun "$log_js"
  rm -f "$log_js"
}

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] 將執行：$BUTLER_CMD"
  write_log "true"
  echo "[dry-run] 已寫入 publish-log.jsonl（dry: true）"
  exit 0
fi

# 確認 butler CLI 可用（dry-run 不需要）
if ! command -v butler >/dev/null 2>&1; then
  echo "錯誤：butler CLI 未安裝或不在 PATH 中" >&2
  echo "請下載 butler：curl -L -o ~/bin/butler https://broth.itch.ovh/butler/darwin-amd64/LATEST/archive/default" >&2
  exit 1
fi

# 實際執行 butler push
echo "推送至 itch.io：$BUTLER_TARGET"
echo "版本：$VERSION，channel：$CHANNEL"

set +e
eval "$BUTLER_CMD"
BUTLER_EXIT=$?
set -e

if [[ $BUTLER_EXIT -ne 0 ]]; then
  echo "錯誤：butler push 失敗（exit code $BUTLER_EXIT）" >&2
  if [[ -z "${BUTLER_API_KEY:-}" ]]; then
    echo "提示：BUTLER_API_KEY 環境變數未設定，可能是認證失敗" >&2
    echo "請執行 'butler login' 進行互動式認證，或設定 BUTLER_API_KEY 環境變數" >&2
  fi
  exit 1
fi

# 成功後寫入 publish-log.jsonl
write_log "false"

echo "發佈完成！"
echo "記錄已寫入：$PUBLISH_LOG"
