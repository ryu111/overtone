# Design: md-blog CLI

## 技術摘要（What & Why）

- **方案**：建立獨立子目錄 `md-blog/`，Bun runtime，三個核心模組（parser、renderer、builder）+ CLI 入口。依賴 `gray-matter`（Front Matter 解析）和 `marked@9`（Markdown 轉 HTML）。
- **理由**：
  1. 獨立子目錄確保與 Overtone 主專案隔離，有自己的 `package.json` 和 `bun.lockb`。
  2. marked v9 使用 `marked.parse(content)` 同步 API，比 v4 更穩定，且 Bun 環境相容性良好。
  3. HTML 字串插值（無模板引擎）符合 MVP 精神，避免引入額外依賴。
  4. build 前先清空 `dist/`，避免殘留舊檔案造成 404 幽靈連結。
  5. 整合測試使用 `os.tmpdir()` 隔離輸出，避免污染使用者的 `dist/`。

- **取捨**：
  - 無 watch mode / dev server（超出 MVP 範圍）
  - 無程式碼高亮 JS（只加 CSS class，由使用者自行決定是否引入 highlight.js）
  - 錯誤時 skip + warn，不中斷整體 build 流程

## Open Questions 回答

| 問題 | 決定 | 理由 |
|------|------|------|
| marked 版本 | **marked@9**（`marked.parse(content)`） | v9 API 更現代，同步呼叫簡潔，Bun 相容 |
| dist/ 清空策略 | **build 前先清空** | 避免舊檔案殘留，`fs.rmSync(dist, { recursive: true, force: true })` |
| 整合測試隔離 | **`os.tmpdir()` temp 目錄** | 每次測試後清理，不污染 working directory |

## API 介面設計

### `src/parser.js`

```typescript
// parsePost(filePath: string): PostData
interface PostData {
  slug: string      // 從檔名推導（去副檔名），e.g. "hello-world"
  title: string     // Front Matter title（必填，缺少時 throw）
  date: string      // Front Matter date（必填，YYYY-MM-DD 格式，缺少時 throw）
  content: string   // Markdown 正文（Front Matter 之後的內容）
  html: string      // marked.parse(content) 的結果
}

// 錯誤處理：缺少 title 或 date 時 throw Error，message 含檔名和缺少的欄位名稱
```

### `src/renderer.js`

```typescript
// renderPost(post: PostData, allPosts: PostData[]): string
// 回傳完整 HTML 頁面字串，包含 <!DOCTYPE html>、<head>（內嵌 CSS）、<body>
// 包含文章標題、日期、HTML 內文、「返回首頁」連結

// renderIndex(posts: PostData[]): string
// 回傳首頁 HTML 字串
// posts 已按 date 降冪排序（由 builder 負責排序後傳入）
// 包含文章清單：每筆含 <a href="/posts/{slug}.html">{title}</a> + 日期
```

### `src/builder.js`

```typescript
// build(inputDir: string, outputDir: string): BuildResult
interface BuildResult {
  success: number   // 成功處理的文章數
  skipped: number   // 因錯誤跳過的文章數
  outputDir: string // 輸出目錄的絕對路徑
}

// 執行流程：
// 1. 清空 outputDir（rmSync recursive）
// 2. 建立 outputDir/posts/ 目錄
// 3. 掃描 inputDir 下所有 .md 檔案（非遞迴，只看第一層）
// 4. 對每個 .md 呼叫 parsePost()，失敗則 console.warn + skip
// 5. 按 date 降冪排序所有成功解析的 posts
// 6. 對每個 post 呼叫 renderPost() + 寫出 outputDir/posts/{slug}.html
// 7. 呼叫 renderIndex() + 寫出 outputDir/index.html
// 8. 回傳 BuildResult
```

### `index.js`（CLI 入口）

```
用法：md-blog build <inputDir> [--output <outputDir>]

預設輸出：./dist/
支援 --output 或 -o 自訂輸出目錄
inputDir 不存在時 exit(1) 並顯示錯誤訊息
```

## 資料模型

### Front Matter 格式（YAML）

```yaml
---
title: "文章標題"   # 必填，字串
date: "2026-03-06"  # 必填，YYYY-MM-DD 格式
---
```

選填欄位（解析但不強制驗證）：
- `description`：文章摘要（未來用途）
- `draft: true`：草稿（builder 跳過不輸出）

### 輸出目錄結構

```
dist/                    # 預設輸出目錄（可用 --output 覆蓋）
├── index.html           # 首頁（文章清單，按日期降冪排序）
└── posts/
    ├── hello-world.html # 文章頁面（slug 從檔名推導）
    └── another-post.html
```

## 檔案結構

```
新增的檔案：
  md-blog/
  ├── package.json         # Bun 專案設定，依賴 gray-matter + marked@9
  ├── index.js             # CLI 入口，解析 process.argv，呼叫 builder.build()
  ├── src/
  │   ├── parser.js        # parsePost(filePath) — Front Matter 解析 + marked 轉 HTML
  │   ├── renderer.js      # renderPost(post, posts) + renderIndex(posts) — HTML 字串插值
  │   └── builder.js       # build(inputDir, outputDir) — 掃描 + 協調 + 寫出檔案
  └── tests/
      ├── unit/
      │   ├── parser.test.js      # parsePost() 單元測試
      │   └── renderer.test.js    # renderPost() + renderIndex() 單元測試
      ├── integration/
      │   └── build.test.js       # build 指令端到端測試（temp 目錄隔離）
      └── fixtures/
          └── posts/              # 測試用 Markdown 文章（至少 3 篇，不同日期）
              ├── first-post.md
              ├── second-post.md
              └── third-post.md
```

## 關鍵技術決策

### 決策 1：marked v9（而非 v4）

- **選項 A**（選擇）：`marked@9`，使用 `marked.parse(content)` 同步 API
  - 優點：API 穩定現代，不需 await，同步呼叫符合 builder 的線性流程
  - Bun 環境測試相容
- **選項 B**（未選）：`marked@4`，使用 `marked(content)` 呼叫方式
  - 原因：v4 已停止維護，API 較舊，且 Bun 環境中有部分警告

### 決策 2：build 前清空 dist/

- **選項 A**（選擇）：`fs.rmSync(outputDir, { recursive: true, force: true })` 清空後重建
  - 優點：確保輸出一致，不留殘留舊檔案（避免刪除文章後舊 HTML 仍存在）
  - `force: true` 確保目錄不存在時不報錯
- **選項 B**（未選）：直接覆寫（不清空）
  - 原因：舊檔案殘留會造成幽靈連結，首頁不列出但實際 URL 仍可訪問

### 決策 3：整合測試用 temp 目錄

- **選項 A**（選擇）：`fs.mkdtempSync(path.join(os.tmpdir(), 'md-blog-test-'))` 產生唯一 temp 目錄
  - 優點：完全隔離，測試後清理 (`afterAll` rmSync)，不影響使用者工作目錄
  - 優點：並行測試安全（每個 test suite 有獨立目錄）
- **選項 B**（未選）：固定路徑 `tests/dist/`
  - 原因：多次測試累積殘留，且需 gitignore，清理邏輯複雜

### 決策 4：HTML 字串插值（無模板引擎）

- **選項 A**（選擇）：JavaScript template literals 直接組裝 HTML 字串
  - 優點：零依賴、簡單直接、renderer.js 就是完整的 HTML 定義
  - 符合 MVP 精神，未來如需擴展再引入模板引擎
- **選項 B**（未選）：引入 handlebars / ejs 等模板引擎
  - 原因：需要額外依賴，且當前需求不需要這層抽象

### 決策 5：slug 推導策略

- 從檔名推導：`path.basename(filePath, '.md')`
- 不做額外轉換（檔名本身就是 slug，使用者負責用合法的 URL 字元命名）
- 範例：`hello-world.md` → slug `hello-world` → 輸出 `posts/hello-world.html`

## 實作注意事項

給 developer 的提醒：

1. **package.json scripts**：加入 `"test": "bun test"` 和 `"build": "bun index.js build"`，方便在 md-blog/ 目錄下執行。

2. **marked.parse() 用法（v9）**：
   ```javascript
   import { marked } from 'marked'
   const html = marked.parse(content)  // 回傳字串，非 Promise
   ```

3. **日期排序**：`posts.sort((a, b) => new Date(b.date) - new Date(a.date))`，降冪排列（新文章在前）。

4. **錯誤處理格式**：
   ```javascript
   throw new Error(`[parser] ${filePath}: 缺少必填欄位 "title"`)
   ```
   builder 捕捉後 `console.warn(err.message)` + skip。

5. **最小 CSS 範疇**：內嵌 `<style>` 只包含基本可讀性設定（max-width、font、line-height、code block 背景色）。不用外部 CDN，不用 class framework。

6. **整合測試驗證項目**：
   - `dist/index.html` 存在
   - `dist/posts/{slug}.html` 各自存在
   - `index.html` 內含所有文章的 `href="/posts/{slug}.html"`
   - 文章頁面內含正確 `<title>` 和 Markdown 轉換後的 HTML 片段（e.g. `<h1>`、`<p>`）
   - 文章按日期降冪排序（首頁清單中最新文章在前）
