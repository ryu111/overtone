---
feature: md-blog-acid-test
status: in-progress
workflow: standard
created: 2026-03-06T00:00:00.000Z
---
## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [ ] DOCS

## Tasks

- [ ] parser.js：parsePost() 回傳 { slug, title, date, content, html }，缺少必填欄位 throw Error
- [ ] renderer.js：renderPost() 產出含 <style> 內嵌 CSS 的完整 HTML 頁面，renderIndex() 產出首頁清單
- [ ] builder.js：build() 清空 dist/ 後寫出 index.html + posts/{slug}.html，解析失敗 skip + warn
- [ ] index.js：CLI 解析 process.argv，支援 md-blog build <inputDir> [--output <outputDir>]
- [ ] 單元測試：parser + renderer 核心函式，Bun test runner
- [ ] 整合測試：temp 目錄隔離，驗證輸出檔案存在 + 連結正確 + 日期排序

## Dev Phases

### Phase 1: 專案骨架（sequential）
- [ ] 建立 md-blog/ 目錄結構 + 安裝依賴（gray-matter、marked） | files: md-blog/package.json, md-blog/index.js

### Phase 2: 核心模組（parallel）
- [ ] 實作 parser.js — parsePost() Front Matter 解析 + slug 推導 | files: md-blog/src/parser.js
- [ ] 實作 renderer.js — renderPost() + renderIndex() HTML 字串插值 + 內嵌 CSS | files: md-blog/src/renderer.js

### Phase 3: CLI 整合（sequential，依賴 Phase 2）
- [ ] 實作 builder.js + index.js — build 指令，掃描 .md + 呼叫 parser/renderer + 寫出 dist/ | files: md-blog/src/builder.js, md-blog/index.js

### Phase 4: 測試（parallel，可與 Phase 3 部分並行）
- [ ] 單元測試：parser.test.js + renderer.test.js | files: md-blog/tests/unit/parser.test.js, md-blog/tests/unit/renderer.test.js
- [ ] 整合測試：build.test.js + fixture posts | files: md-blog/tests/integration/build.test.js, md-blog/tests/fixtures/posts/
