# 技術棧偵測策略

> 📋 **何時讀取**：onboard 流程中偵測專案技術棧、推斷框架、產生 CLAUDE.md 區段時。

## Manifest 偵測優先順序

依序檢查以下檔案，**有則讀取，無則跳過**。多個 manifest 共存時全部解析（monorepo 場景）。

| 優先 | Manifest 檔案 | 語言/生態系 | 解析重點欄位 |
|:----:|---------------|------------|-------------|
| 1 | `package.json` | JavaScript / TypeScript | `name`, `scripts`, `dependencies`, `devDependencies`, `engines` |
| 2 | `pyproject.toml` | Python | `[project].name`, `[project.dependencies]`, `[tool.*]` |
| 3 | `requirements.txt` | Python（舊式） | 套件列表（逐行解析） |
| 4 | `Cargo.toml` | Rust | `[package].name`, `[package].edition`, `[dependencies]` |
| 5 | `go.mod` | Go | `module`, `go` version, `require` 區塊 |
| 6 | `Gemfile` | Ruby | `source`, `gem` 宣告 |
| 7 | `pom.xml` | Java（Maven） | `groupId`, `artifactId`, `<dependencies>` |
| 8 | `build.gradle` / `build.gradle.kts` | Java / Kotlin（Gradle） | `plugins`, `dependencies` |
| 9 | `*.csproj` | .NET (C#) | `<PropertyGroup>`, `<PackageReference>` |
| 10 | `mix.exs` | Elixir | `project/0`, `deps/0` |
| 11 | `pubspec.yaml` | Dart / Flutter | `name`, `dependencies`, `dev_dependencies` |

## 輔助線索偵測

Manifest 之外，以下檔案提供額外信號：

| 檔案 / 目錄 | 推斷資訊 |
|-------------|---------|
| `.gitignore` 含 `node_modules/` | Node.js 環境確認 |
| `.gitignore` 含 `__pycache__/` | Python 環境確認 |
| `.gitignore` 含 `target/` | Rust 或 Java 環境確認 |
| `.gitignore` 含 `.venv/` | Python 虛擬環境確認 |
| `tsconfig.json` | TypeScript 專案 |
| `Dockerfile` | 容器化部署 |
| `docker-compose.yml` | 多服務架構 |
| `.github/workflows/` | GitHub Actions CI |
| `.gitlab-ci.yml` | GitLab CI |
| `Makefile` / `Justfile` | 自訂命令來源 |
| `.editorconfig` | 編輯器規範 |
| `.nvmrc` / `.node-version` | Node.js 版本鎖定 |
| `.python-version` | Python 版本鎖定 |
| `rust-toolchain.toml` | Rust toolchain 版本 |

## 框架識別模式

### 前端框架（從 `dependencies` 偵測）

| 套件名稱 | 框架 | 備註 |
|----------|------|------|
| `react`, `react-dom` | React | 檢查是否有 `next`（Next.js）或 `gatsby` |
| `vue` | Vue.js | 檢查是否有 `nuxt`（Nuxt） |
| `@angular/core` | Angular | 版本從 `@angular/core` 取得 |
| `svelte` | Svelte | 檢查是否有 `@sveltejs/kit`（SvelteKit） |
| `solid-js` | Solid.js | — |
| `astro` | Astro | — |

### 後端框架

| 套件名稱 / 關鍵字 | 框架 | 語言 |
|-------------------|------|------|
| `express` | Express | Node.js |
| `fastify` | Fastify | Node.js |
| `hono` | Hono | Node.js / Bun |
| `koa` | Koa | Node.js |
| `fastapi` | FastAPI | Python |
| `django` | Django | Python |
| `flask` | Flask | Python |
| `gin-gonic/gin` | Gin | Go |
| `actix-web` | Actix Web | Rust |
| `axum` | Axum | Rust |
| `rails` | Ruby on Rails | Ruby |
| `phoenix` | Phoenix | Elixir |
| `spring-boot` | Spring Boot | Java |

### 測試 / Build / Lint 工具

| 套件名稱 | 工具 | 類型 | 語言 |
|----------|------|------|------|
| `jest`, `vitest`, `mocha` | Jest / Vitest / Mocha | Test | JS/TS |
| `playwright`, `cypress` | Playwright / Cypress | E2E | JS/TS |
| `pytest` | pytest | Test | Python |
| `rspec` | RSpec | Test | Ruby |
| `eslint`, `@biomejs/biome` | ESLint / Biome | Lint | JS/TS |
| `ruff` | Ruff | Lint | Python |
| `clippy` | Clippy | Lint | Rust |
| `vite`, `webpack`, `esbuild` | Vite / Webpack / esbuild | Build | JS/TS |
| `turbo` | Turborepo | Monorepo | JS/TS |

## CLAUDE.md 區段自動生成規則

### 技術棧區段

```markdown
| 模組 | 技術 |
|------|------|
| Runtime | {偵測到的 runtime + 版本} |
| 框架 | {偵測到的框架，前端 + 後端分列} |
| 測試 | {偵測到的測試工具} |
| Build | {偵測到的 build 工具} |
| Lint | {偵測到的 lint 工具} |
```

**生成規則**：
- 每列只列偵測到的內容，無法偵測的標記 `<!-- TODO -->`
- 版本號從 manifest 取得（`engines` > `dependencies` 版本）
- 多個同類工具全部列出（例如 ESLint + Prettier）

### 常用指令區段

**命令來源優先順序**：

```
1. manifest scripts（package.json scripts / pyproject.toml scripts）
2. Makefile / Justfile targets
3. CI 設定檔推斷
4. 語言慣例預設（cargo build / go build / pytest）
```

**必要命令清單**（依序嘗試偵測）：

| 用途 | 嘗試偵測的 key | 未偵測到時 |
|------|---------------|-----------|
| 開發 | `dev`, `start`, `serve` | 標記 `<!-- TODO -->` |
| 建構 | `build`, `compile` | 使用語言預設（若有） |
| 測試 | `test`, `test:unit`, `test:e2e` | 使用語言預設（若有） |
| Lint | `lint`, `check`, `format` | 標記 `<!-- TODO -->` |
| 部署 | `deploy`, `release` | 省略此項 |

### 目錄結構區段

**排除規則**（不列入結構描述）：

```
node_modules/  .venv/  target/  dist/  build/  .git/
__pycache__/  .next/  .nuxt/  .svelte-kit/  coverage/
```

**深度規則**：
- 預設深度 2（頂層 + 一層子目錄）
- 目錄 > 20 個項目時只列前 15 個 + `...（更多）`
- 關鍵目錄（`src/`, `tests/`, `docs/`）可展開至深度 3

### 缺失區段處理

| 情況 | 處置 |
|------|------|
| 某區段完全無法偵測 | 保留區段標題 + `<!-- TODO: 補充 -->` |
| 某欄位部分偵測到 | 填入已知欄位，未知標記 `<!-- TODO -->` |
| 補充模式下區段已存在 | 跳過，不重複生成 |
| 補充模式下區段存在但不完整 | 列出缺少的欄位作為建議，不直接修改 |
