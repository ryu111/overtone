# md-blog CLI — Markdown 靜態部落格生成器

`md-blog-acid-test`

## 需求背景（Why）

- **問題**：Overtone L3.6 Acid Test 需要一個非熟悉領域的真實開發任務，用以驗證系統端到端自我進化能力（static-site-generation 不在現有 skill 涵蓋範圍）
- **目標**：建立可用的 `md-blog` CLI 工具，把 Markdown 文章目錄轉成靜態 HTML 部落格；同時驗證 Overtone 能否自主完成陌生領域開發並達到可用標準
- **優先級**：Acid Test 是 L3.6 核心驗收場景，完成後才能宣告 L3 自我進化能力達標

## 使用者故事

```
身為開發者
我想要執行 md-blog build ./posts 指令
以便把我的 Markdown 文章目錄自動產出成可在瀏覽器開啟的靜態 HTML 部落格
```

```
身為部落格讀者
我想要在首頁看到所有文章清單，點進去閱讀個別文章
以便瀏覽和找到我感興趣的內容
```

## 範圍邊界

### 在範圍內（In Scope）

- `md-blog/` 獨立子目錄（Bun runtime，無外部 CLI framework 依賴）
- `md-blog build <input-dir>` 指令：掃描 `<input-dir>` 下所有 `.md` 檔案，輸出到 `./dist/`
- YAML Front Matter 解析（title、date 必填，使用 gray-matter）
- Markdown 轉 HTML（使用 marked）
- 每篇文章產出 `/posts/<slug>.html`
- 首頁 `index.html`：按日期排序的文章清單（含標題、日期連結）
- 文章頁面包含「返回首頁」連結
- 最小內嵌 CSS（無外部依賴，無 CDN）
- 程式碼區塊用 `<code class="language-xxx">` 標記（無 JS 高亮）
- 單元測試：parser + renderer 核心函式
- 整合測試：build 指令端到端，驗證輸出檔案存在 + 連結不 404 + Markdown 正確渲染

### 不在範圍內（Out of Scope）

- category / tag 分類功能（第一版 MVP）
- RSS Feed（第一版 MVP）
- 客製化主題 / 外部 CSS framework
- Watch mode / 開發伺服器
- 部署腳本（GitHub Pages / Netlify）
- 圖片優化 / asset pipeline
- SEO meta tags / sitemap
- 分頁功能

## 子任務清單

1. **專案骨架與依賴設定**
   - 負責 agent：developer
   - 相關檔案：`md-blog/package.json`、`md-blog/index.js`
   - 說明：建立 `md-blog/` 目錄結構（`src/`、`tests/`），初始化 `package.json`（Bun runtime），安裝 `gray-matter`（Front Matter 解析）和 `marked`（Markdown 轉 HTML）兩個依賴

2. **Front Matter 解析器**（可與 3 並行）
   - 負責 agent：developer
   - 相關檔案：`md-blog/src/parser.js`
   - 說明：封裝 gray-matter，export `parsePost(filePath)` 函式，回傳 `{ slug, title, date, content, html }`；slug 從檔名推導（去副檔名），date 支援 `YYYY-MM-DD` 格式，缺少必填欄位時拋出明確錯誤

3. **HTML 渲染器**（可與 2 並行）
   - 負責 agent：developer
   - 相關檔案：`md-blog/src/renderer.js`
   - 說明：使用 marked 把 Markdown content 轉 HTML；export `renderPost(post, posts)` 和 `renderIndex(posts)` 兩個函式；HTML 使用字串插值（無模板引擎）；CSS 直接內嵌在 `<style>` 標籤；文章頁面含返回首頁連結，首頁清單按 date 降冪排序

4. **CLI 入口與 build 指令**（依賴 2、3 完成）
   - 負責 agent：developer
   - 相關檔案：`md-blog/index.js`、`md-blog/src/builder.js`
   - 說明：解析 `process.argv`，支援 `md-blog build <inputDir> [--output <outputDir>]`；掃描 inputDir 下所有 `.md` 檔；呼叫 parser + renderer；寫出 `dist/index.html` 和 `dist/posts/<slug>.html`；遇到解析錯誤時 skip 並 console.warn，不中斷整體流程

5. **單元測試**（可與 4 並行）
   - 負責 agent：developer
   - 相關檔案：`md-blog/tests/unit/parser.test.js`、`md-blog/tests/unit/renderer.test.js`
   - 說明：測試 `parsePost()` 的 slug 推導、必填欄位驗證、日期格式；測試 `renderPost()` 和 `renderIndex()` 的輸出包含預期 HTML 片段；使用 Bun test runner（`bun test`）

6. **整合測試**（依賴 4 完成）
   - 負責 agent：developer
   - 相關檔案：`md-blog/tests/integration/build.test.js`、`md-blog/tests/fixtures/posts/`
   - 說明：建立 fixture Markdown 文章（至少 3 篇，含不同日期）；執行 `build` 指令；驗證 `dist/index.html` 存在、所有 `dist/posts/<slug>.html` 存在、首頁含所有文章連結、文章頁面含正確標題和 Markdown 內容

## MoSCoW 分類

| 優先級 | 項目 |
|--------|------|
| Must Have | Front Matter 解析（title/date）、Markdown 轉 HTML、build 指令、index.html 文章清單 |
| Should Have | 按日期排序、返回首頁連結、錯誤跳過不中斷、測試覆蓋 |
| Could Have | `--output` 自訂輸出目錄、code block 語言標記 |
| Won't Have | RSS、category、watch mode、部署腳本（本版本） |

## 開放問題

- **marked 版本相容性**：marked v4 和 v9 API 差異（`marked(content)` vs `marked.parse(content)`），architect 決定鎖定哪個版本
- **dist/ 輸出目錄行為**：每次 build 是否先清空 dist/，還是覆寫？architect 決定（建議先清空，避免殘留舊檔案）
- **測試隔離**：整合測試的 dist/ 輸出是用 temp 目錄還是測試用固定路徑？避免污染使用者的 dist/
