# Feature: md-blog CLI — BDD 行為規格

---

## Feature 1: Parser — Front Matter 解析

### Scenario 1-1: 正常解析含完整 Front Matter 的 .md 檔案
GIVEN 一個 .md 檔案，Front Matter 含 title、date（YYYY-MM-DD）及正文 Markdown 內容
WHEN 呼叫 `parsePost(filePath)`
THEN 回傳 PostData 物件，含 slug（由檔名推導）、title、date、content（原始 Markdown）、html（轉換後 HTML）

### Scenario 1-2: 缺少必填欄位 title 時拋出錯誤
GIVEN 一個 .md 檔案，Front Matter 缺少 title 欄位
WHEN 呼叫 `parsePost(filePath)`
THEN 拋出 Error，錯誤訊息說明缺少 title

### Scenario 1-3: 缺少必填欄位 date 時拋出錯誤
GIVEN 一個 .md 檔案，Front Matter 缺少 date 欄位
WHEN 呼叫 `parsePost(filePath)`
THEN 拋出 Error，錯誤訊息說明缺少 date

### Scenario 1-4: slug 從檔名正確推導
GIVEN 一個路徑為 `/posts/hello-world.md` 的檔案，含完整 Front Matter
WHEN 呼叫 `parsePost(filePath)`
THEN 回傳 PostData 的 slug 為 `hello-world`（不含 .md 副檔名，不含目錄路徑）

### Scenario 1-5: Markdown 內容正確轉換為 HTML
GIVEN 一個 .md 檔案，正文含 `# 標題` 和 `**粗體**` 語法
WHEN 呼叫 `parsePost(filePath)`
THEN html 欄位含對應的 `<h1>` 和 `<strong>` HTML 標籤

### Scenario 1-6: 程式碼區塊產生帶 language class 的標記
GIVEN 一個 .md 檔案，正文含 ` ```javascript ` 圍欄程式碼區塊
WHEN 呼叫 `parsePost(filePath)`
THEN html 欄位中對應的 `<code>` 標籤含 `class="language-javascript"` 屬性

---

## Feature 2: Renderer — HTML 頁面產生

### Scenario 2-1: renderPost 產出含完整結構的 HTML 頁面
GIVEN 一個有效的 PostData 物件（含 slug、title、date、html）
WHEN 呼叫 `renderPost(post, allPosts)`
THEN 回傳字串包含 `<!DOCTYPE html>`、`<html>`、`<head>`、`<body>` 結構
AND 包含 `<style>` 內嵌 CSS

### Scenario 2-2: renderPost 在頁面中顯示文章標題與日期
GIVEN 一個 PostData，title 為 "我的第一篇文章"，date 為 "2026-01-15"
WHEN 呼叫 `renderPost(post, allPosts)`
THEN 回傳 HTML 包含文章標題文字 "我的第一篇文章"
AND 包含日期 "2026-01-15"

### Scenario 2-3: renderPost 包含返回首頁連結
GIVEN 一個有效的 PostData 物件
WHEN 呼叫 `renderPost(post, allPosts)`
THEN 回傳 HTML 包含指向首頁的 `<a>` 連結（href 含 `../index.html` 或 `/`）

### Scenario 2-4: renderPost 嵌入文章 HTML 內容
GIVEN 一個 PostData，html 欄位為 `<h1>Hello</h1><p>World</p>`
WHEN 呼叫 `renderPost(post, allPosts)`
THEN 回傳 HTML 的 body 區段中包含該 HTML 內容

### Scenario 2-5: renderIndex 產出所有文章的清單頁
GIVEN 三篇已解析完成的 PostData 陣列（posts 已按 date 降冪排序）
WHEN 呼叫 `renderIndex(posts)`
THEN 回傳字串包含三個文章標題的連結
AND 每個連結的 href 指向對應的 `posts/{slug}.html` 路徑

### Scenario 2-6: renderIndex 在無文章時產出空清單頁
GIVEN 空陣列 `[]`
WHEN 呼叫 `renderIndex(posts)`
THEN 回傳合法的 HTML 字串（不拋出錯誤）
AND 不包含文章連結

---

## Feature 3: Builder — 端到端建置流程

### Scenario 3-1: build 正常執行後產出 index.html 與各文章頁
GIVEN inputDir 含兩個合法 .md 檔案
AND outputDir 指向一個臨時目錄
WHEN 呼叫 `build(inputDir, outputDir)`
THEN 回傳 BuildResult `{ success: true, skipped: 0, outputDir }`
AND outputDir 下存在 `index.html`
AND outputDir 下存在 `posts/{slug1}.html` 和 `posts/{slug2}.html`

### Scenario 3-2: build 執行前清空 outputDir
GIVEN outputDir 中已有舊的 `stale-file.html`
AND inputDir 含一個合法 .md 檔案
WHEN 呼叫 `build(inputDir, outputDir)`
THEN outputDir 中不再存在 `stale-file.html`

### Scenario 3-3: 解析失敗的檔案被 skip 且不中斷整體建置
GIVEN inputDir 含一個合法 .md 和一個缺少 title 的無效 .md
WHEN 呼叫 `build(inputDir, outputDir)`
THEN 回傳 BuildResult `{ success: true, skipped: 1, outputDir }`
AND 合法文章的 HTML 正常產出
AND 不拋出例外

### Scenario 3-4: inputDir 為空目錄時成功建置空首頁
GIVEN inputDir 為空目錄（不含任何 .md 檔案）
AND outputDir 為臨時目錄
WHEN 呼叫 `build(inputDir, outputDir)`
THEN 回傳 BuildResult `{ success: true, skipped: 0, outputDir }`
AND outputDir 下存在 `index.html`

### Scenario 3-5: 首頁文章連結按日期降冪排序
GIVEN inputDir 含三篇 .md，日期分別為 2026-01-01、2026-03-01、2026-02-01
WHEN 呼叫 `build(inputDir, outputDir)`
THEN 產出的 `index.html` 中，文章連結順序為 2026-03-01 → 2026-02-01 → 2026-01-01

### Scenario 3-6: 文章頁包含返回首頁連結
GIVEN inputDir 含一個合法 .md
WHEN 呼叫 `build(inputDir, outputDir)`
THEN 產出的 `posts/{slug}.html` 包含指向 `../index.html` 的連結

---

## Feature 4: CLI — 命令列介面

### Scenario 4-1: 正常執行 build 指令並指定 output 目錄
GIVEN inputDir 含合法 .md 檔案
WHEN 執行 `node index.js build <inputDir> --output <outputDir>`
THEN process 以 exit code 0 結束
AND outputDir 下產出 index.html 與文章頁

### Scenario 4-2: 不指定 --output 時使用預設輸出目錄
GIVEN inputDir 含合法 .md 檔案
WHEN 執行 `node index.js build <inputDir>`（不含 --output 參數）
THEN process 以 exit code 0 結束
AND 預設輸出目錄（如 `./dist`）下產出 index.html

### Scenario 4-3: 缺少 inputDir 參數時回報錯誤
GIVEN 不提供任何參數
WHEN 執行 `node index.js build`
THEN process 以非零 exit code 結束
AND stderr 輸出說明需要提供 inputDir 的錯誤訊息

### Scenario 4-4: inputDir 路徑不存在時回報錯誤
GIVEN 提供一個不存在的目錄路徑作為 inputDir
WHEN 執行 `node index.js build /non/existent/path`
THEN process 以非零 exit code 結束
AND stderr 輸出路徑不存在的錯誤訊息
