# md-blog

Markdown 靜態部落格生成器 — 將 Markdown 文章目錄轉換為靜態 HTML 部落格。

## 功能

- **Front Matter 解析**：支援 YAML Front Matter（標題、日期必填）
- **Markdown 轉 HTML**：使用 marked v9 進行轉換
- **靜態網站生成**：產出獨立 HTML 檔案
- **首頁與文章清單**：自動產出 index.html（按日期降冪排序）
- **內嵌 CSS 樣式**：無外部依賴，最小化設計
- **錯誤容錯**：解析失敗時 skip 並繼續處理其他檔案

## 安裝

```bash
cd md-blog
bun install
```

## 使用

### CLI 指令

```bash
# 基本用法
node index.js build <inputDir>

# 自訂輸出目錄
node index.js build <inputDir> --output <outputDir>
node index.js build <inputDir> -o <outputDir>
```

### 示例

```bash
# 從 posts 目錄生成部落格到 dist
node index.js build ./posts

# 輸出到自訂目錄
node index.js build ./posts -o ./output
```

## 檔案結構

```
md-blog/
├── index.js                     # CLI 入口
├── package.json                 # 依賴定義
├── src/
│   ├── parser.js               # Front Matter + Markdown 解析
│   ├── renderer.js             # HTML 渲染（文章 + 首頁）
│   └── builder.js              # 主建置邏輯
└── tests/
    ├── unit/                   # 單元測試
    │   ├── parser.test.js
    │   └── renderer.test.js
    └── integration/            # 整合測試
        └── build.test.js
```

## Front Matter 格式

```markdown
---
title: 文章標題
date: 2026-03-06
---

# 文章內容
```

**必填欄位**：
- `title`：文章標題（string）
- `date`：發布日期（YYYY-MM-DD 格式）

## 輸出結構

```
dist/
├── index.html              # 首頁（文章清單）
└── posts/
    ├── first-post.html     # 文章 1
    ├── second-post.html    # 文章 2
    └── ...
```

## 開發與測試

```bash
# 執行所有測試（unit + integration）
bun test

# 執行單位測試
bun test tests/unit

# 執行整合測試
bun test tests/integration
```

## 核心模組

### parser.js

```javascript
parsePost(filePath)  // => { slug, title, date, content, html }
```

解析單一 Markdown 文章，提取 Front Matter 資料與轉換後的 HTML。

### renderer.js

```javascript
renderPost(post, posts)    // 渲染單篇文章頁面
renderIndex(posts)         // 渲染首頁清單
```

使用內嵌 CSS 生成 HTML 頁面。

### builder.js

```javascript
build(inputDir, outputDir)  // 執行完整建置流程
```

掃描輸入目錄、解析所有 Markdown 文件、渲染 HTML、寫出檔案。

## 設計原則

- **三層分離**：Parser（資料萃取）→ Renderer（HTML 生成）→ Builder（編排流程）
- **錯誤隔離**：單個檔案解析失敗不中斷整體流程
- **最小依賴**：僅使用 gray-matter（Front Matter 解析）與 marked（Markdown 轉 HTML）
- **無配置**：開箱即用，無需外部設定檔

## 完成度

- 22 個 BDD 測試場景全部通過
- 單元測試 + 整合測試覆蓋核心邏輯
- 首頁 + 文章頁面 + 連結驗證完整
- Catppuccin Mocha 響應式配色

## 後續擴展

目前不包含的功能（可在後續版本中新增）：
- RSS Feed 產生
- 分類 / 標籤系統
- 客製化主題 / 外部 CSS framework
- Watch mode 開發伺服器
- 部署腳本（GitHub Pages / Netlify）
