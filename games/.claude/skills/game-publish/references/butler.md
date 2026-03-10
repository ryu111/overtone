# Butler CLI — itch.io 推送工具

> butler 是 itch.io 官方 CLI 工具，用於推送遊戲 build 至 itch.io channel

---

## 安裝

### macOS（arm64 / Apple Silicon）
```bash
curl -L -o butler.zip \
  https://broth.itch.ovh/butler/darwin-arm64/LATEST/archive/default
unzip butler.zip
chmod +x butler
sudo mv butler /usr/local/bin/
```

### macOS（amd64 / Intel）
```bash
curl -L -o butler.zip \
  https://broth.itch.ovh/butler/darwin-amd64/LATEST/archive/default
unzip butler.zip
chmod +x butler
sudo mv butler /usr/local/bin/
```

### Linux（amd64）
```bash
curl -L -o butler.zip \
  https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default
unzip butler.zip
chmod +x butler
sudo mv butler /usr/local/bin/
```

驗證安裝：
```bash
butler --version
```

---

## 認證設定

### 方式一：環境變數（CI/CD 推薦）

```bash
export BUTLER_API_KEY="your_api_key_here"
butler push builds/html5/ ryu111/my-game:html5
```

API Key 取得方式：
1. 登入 itch.io
2. 前往 https://itch.io/user/settings/api-keys
3. 點擊「Generate new API key」
4. 複製並儲存至 CI/CD secret（如 GitHub Actions Secrets）

### 方式二：互動式登入（本機開發）

```bash
butler login
# 瀏覽器開啟授權頁面 → 允許 → 本機儲存 credentials
```

credentials 儲存於：
- macOS：`~/Library/Application Support/itch/butler_creds`
- Linux：`~/.config/itch/butler_creds`

---

## push 指令格式

```bash
butler push <source_dir> <user>/<game>:<channel> [options]
```

### 參數說明

| 參數 | 說明 | 範例 |
|------|------|------|
| `<source_dir>` | 要上傳的目錄路徑 | `./builds/html5/` |
| `<user>` | itch.io 使用者名稱 | `ryu111` |
| `<game>` | itch.io 遊戲 slug | `pixel-dungeon` |
| `<channel>` | channel 名稱 | `html5` |

### Channel 命名規則

itch.io 根據 channel 名稱自動標記平台 tag：

| Channel 名稱 | 自動 tag |
|-------------|---------|
| `html5` | HTML5（browser play） |
| `win` 或 `windows` | Windows |
| `linux` | Linux |
| `mac` 或 `osx` | macOS |
| 其他自訂名稱 | 無自動 tag |

### 常用選項

```bash
# 指定版本號（顯示於 itch.io build history）
butler push builds/html5/ ryu111/my-game:html5 \
  --userversion "1.0.0"

# 指定版本（從 git tag）
butler push builds/html5/ ryu111/my-game:html5 \
  --userversion "$(git describe --tags --always)"

# 固定版本號（CI run 號碼）
butler push builds/html5/ ryu111/my-game:html5 \
  --userversion "build-${CI_RUN_NUMBER}"
```

---

## 斷點續傳

butler 內建斷點續傳機制（基於 bsdiff + wharf protocol）：

- 只上傳與上次 build 的 **差異**（delta），大幅減少上傳時間
- 上傳中斷後重新執行相同指令，自動從斷點繼續
- 首次上傳無差異可比較，上傳完整檔案
- 差異計算在本機進行，不依賴伺服器狀態

---

## Exit Code 解讀

| Exit Code | 意義 | 處理方式 |
|-----------|------|---------|
| `0` | 成功 | 繼續後續步驟（如寫入 publish-log） |
| `1` | 認證失敗 / 一般錯誤 | 檢查 BUTLER_API_KEY 或網路連線 |
| `其他非 0` | 上傳失敗 | 查看 stderr 輸出，重試或檢查 build 內容 |

**在 script 中判斷：**
```bash
butler push builds/html5/ ryu111/my-game:html5
BUTLER_EXIT=$?

if [ $BUTLER_EXIT -ne 0 ]; then
  echo "❌ butler push 失敗（exit code: ${BUTLER_EXIT}）"
  exit $BUTLER_EXIT
fi

echo "✅ 發佈成功"
```

---

## 版本管理

- butler push 每次執行都建立新的 build（自動遞增版本序號）
- itch.io 保留完整 build history，可回退至任一版本
- `--userversion` 只是顯示用的標籤，不影響 itch.io 內部版本序號
- 同一 channel 的新 build 上線後，舊版本仍可從 build history 手動啟用

---

## 完整發佈腳本範例

```bash
#!/bin/bash
set -euo pipefail

GAME="$1"           # pixel-dungeon
VERSION="$2"        # 1.0.0
CHANNEL="${3:-html5}"

BUILDS_DIR="games/${GAME}/builds/${CHANNEL}"
ITCH_USER="ryu111"

# 驗證 build 存在
if [ ! -d "${BUILDS_DIR}" ] || [ -z "$(ls -A "${BUILDS_DIR}" 2>/dev/null)" ]; then
  echo "❌ build not found: ${BUILDS_DIR}" >&2
  exit 1
fi

# 驗證 BUTLER_API_KEY
if [ -z "${BUTLER_API_KEY:-}" ]; then
  echo "❌ BUTLER_API_KEY 未設定" >&2
  exit 1
fi

# 執行推送
butler push "${BUILDS_DIR}/" \
  "${ITCH_USER}/${GAME}:${CHANNEL}" \
  --userversion "${VERSION}"

echo "✅ 發佈完成：${ITCH_USER}/${GAME}:${CHANNEL} v${VERSION}"
```
