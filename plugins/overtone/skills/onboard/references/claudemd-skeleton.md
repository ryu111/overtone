# CLAUDE.md 骨架模板

## 使用方式

根據掃描結果，依照以下區塊結構組裝 CLAUDE.md。
每個區塊的 `<!-- 指引 -->` 說明內容要求，組裝時替換為實際內容。

---

### 1. 專案概述

<!-- 從 manifest 的 name 欄位取得專案名稱，一段話描述專案功能和目標使用者。不超過 3 行。 -->
<!-- 若無法從 manifest 推斷，保留 TODO 提示讓使用者補充 -->

<!-- TODO: 補充專案定位說明 -->

---

### 2. 技術棧

<!-- 表格格式，從 manifest 偵測填入，無法偵測的欄位標記 TODO -->

| 模組 | 技術 |
|------|------|
| Runtime | <!-- 從 manifest engines 或慣例偵測，例如 Node.js 20、Python 3.11、Rust 1.75 --> |
| 框架 | <!-- 從 dependencies 偵測，例如 React 18、FastAPI、Gin --> |
| 測試 | <!-- 從 devDependencies 或慣例偵測，例如 Jest、pytest、cargo test --> |
| Build | <!-- 從 scripts 或工具偵測，例如 Vite、tsc、cargo build --> |
| Lint | <!-- 從 devDependencies 偵測，例如 ESLint、Ruff、Clippy --> |

---

### 3. 目錄結構

<!-- tree 格式，深度 2，每行加 # 註解說明用途 -->
<!-- 排除 node_modules、.venv、target、.git 等產生目錄 -->
<!-- 根據實際掃描結果列出頂層目錄和關鍵子目錄 -->

```
<!-- 範例格式：
project-root/
├── src/              # 主要原始碼
├── tests/            # 測試目錄
├── docs/             # 文件
└── package.json      # 專案設定
-->
```

---

### 4. 常用指令

<!-- bash code block，從 manifest scripts 和 Makefile 推導 -->
<!-- 依序列出 dev、build、test、lint 等常用命令 -->

```bash
# 開發
<!-- 從 scripts 的 dev/start 欄位推導，例如 npm run dev / cargo run / python -m uvicorn -->

# 建構
<!-- 從 scripts 的 build 欄位推導，例如 npm run build / cargo build --release -->

# 測試
<!-- 從 scripts 的 test 欄位推導，例如 npm test / pytest / cargo test -->

# Lint
<!-- 從 scripts 的 lint 欄位推導，例如 npm run lint / ruff check . / cargo clippy -->
```

---

### 5. 架構概覽（可選）

<!-- 若專案有明顯架構 pattern（MVC、微服務、monorepo、三層架構），簡述核心設計 -->
<!-- 若無法從目錄結構或文件推斷，省略此區塊 -->

<!-- TODO: 若有明確架構 pattern，在此描述。否則刪除此區塊 -->

---

### 6. 開發規範

<!-- bullet list，從 lint 設定、CI 流程、.editorconfig 推斷 -->
<!-- 無法推斷的規範留 TODO 讓使用者補充 -->

- <!-- TODO: 補充 coding style 規範（縮排、命名慣例等） -->
- <!-- TODO: 補充 PR / commit message 規範 -->
- <!-- TODO: 補充測試覆蓋率要求 -->
- 不確定時詢問，不猜測
- 發現問題立即修復

---

### 7. 關鍵文件

<!-- 表格，列出 5-10 個最重要的檔案，從目錄結構和 manifest 推斷 -->

| 文件 | 用途 |
|------|------|
| <!-- 入口檔案路徑，例如 src/index.ts、main.py --> | <!-- 主程式入口 --> |
| <!-- 設定檔路徑，例如 package.json、pyproject.toml --> | <!-- 專案設定 --> |
| <!-- 主要模組路徑 --> | <!-- 核心商業邏輯 --> |
| <!-- 測試目錄路徑 --> | <!-- 單元與整合測試 --> |
| <!-- TODO: 補充其他重要檔案 --> | |
