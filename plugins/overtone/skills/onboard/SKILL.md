---
name: onboard
description: 掃描專案結構，產生 CLAUDE.md 骨架。偵測技術棧、常用命令、目錄結構，輸出到對話供使用者自行寫入。
disable-model-invocation: false
---

# /ot:onboard — CLAUDE.md 骨架產生器

掃描當前專案的技術棧、目錄結構與常用命令，產生 CLAUDE.md 骨架，輸出到對話供使用者確認後自行寫入。

## 執行步驟

### Step 1：偵測現有 CLAUDE.md

用 Glob 工具在專案根目錄查找 `CLAUDE.md`：

- **存在** → 讀取內容，進入「補充模式」（只產生現有 CLAUDE.md 缺少的區塊）
- **不存在** → 進入「建立模式」（產生完整骨架）

記錄模式供後續步驟使用。

### Step 2：並行掃描 manifest 和結構

同時執行以下所有掃描，不依序執行：

**掃描各類 manifest（有哪個讀哪個）**：

| Manifest | 解析欄位 |
|----------|---------|
| `package.json` | `name`, `scripts`, `dependencies`, `devDependencies`, `engines` |
| `pyproject.toml` | `[project].name`, `[project.dependencies]`, `[tool.*.scripts]` |
| `Cargo.toml` | `[package].name`, `[package].edition`, `[dependencies]` |
| `go.mod` | `module`, `go` version, `require` 區塊 |
| `pom.xml` | `groupId`, `artifactId`, `<dependencies>` |
| `*.csproj` | `<PropertyGroup>`, `<PackageReference>` |

**同時掃描其他線索**：

```bash
# 專案根目錄結構（深度 2）
ls -la
find . -maxdepth 2 -not -path './.git/*' -not -path './node_modules/*' -not -path './.venv/*' -not -path './target/*' 2>/dev/null | sort

# 推斷框架的 gitignore 線索
cat .gitignore 2>/dev/null || echo ""

# 常用命令來源
cat Makefile 2>/dev/null || echo ""
cat Justfile 2>/dev/null || echo ""
```

- 若有 `.github/workflows/` 目錄，讀取 CI 設定檔推斷 CI 命令。

### Step 3：解析技術棧和常用命令

根據 Step 2 的掃描結果推斷：

**技術棧推斷規則**：

| 線索 | 推斷結果 |
|------|---------|
| `package.json` 存在 | Runtime: Node.js / Bun（看 `engines` 欄位） |
| `pyproject.toml` 存在 | Runtime: Python |
| `Cargo.toml` 存在 | Runtime: Rust |
| `go.mod` 存在 | Runtime: Go |
| `pom.xml` 存在 | Runtime: Java（Maven） |
| `*.csproj` 存在 | Runtime: .NET |
| `.gitignore` 含 `node_modules/` | Node.js 環境確認 |
| `.gitignore` 含 `target/` | Rust 或 Java 環境確認 |
| `.gitignore` 含 `__pycache__/` | Python 環境確認 |

**框架偵測**（從 `dependencies` 推斷）：

- React / Vue / Angular / Svelte → 前端框架
- Express / Fastify / Koa / Hono / FastAPI / Django / Flask / Gin / Axum → 後端框架
- Jest / Vitest / Mocha / pytest / cargo test / go test → 測試工具
- ESLint / Ruff / Clippy / golangci-lint → Lint 工具
- Webpack / Vite / esbuild / tsc → Build 工具

**常用命令推斷**（優先順序：manifest scripts > Makefile targets > 慣例命令）：

從 `scripts` 欄位取出 `dev`、`build`、`test`、`lint`、`start` 等常見 key；若有 Makefile，掃描其 target 名稱。

### Step 4：讀取骨架模板並組裝

讀取模板：

```
${CLAUDE_PLUGIN_ROOT}/skills/onboard/references/claudemd-skeleton.md
```

根據 Step 1 的模式組裝輸出：

**建立模式**：填充所有 7 個區塊，產生完整 CLAUDE.md。
- 能偵測到的欄位 → 填入實際值
- 無法偵測的欄位 → 保留 `<!-- TODO: 補充說明 -->` 提示

**補充模式**：對照現有 CLAUDE.md 與 7 個區塊的清單，找出缺少的區塊，只產生缺少的部分。
- 輸出格式：列出「現有區塊」和「補充建議」兩個段落

### Step 5：輸出到對話

以 markdown code block 輸出結果：

````
```markdown
（完整 CLAUDE.md 內容）
```
````

輸出後附上說明：

```
以上是依據專案掃描結果產生的 CLAUDE.md 骨架。

偵測到的技術棧：{簡要列出}
偵測到的常用命令：{簡要列出}

請確認內容後，自行決定是否寫入 CLAUDE.md。
若需要修改特定區塊，告訴我即可。
```

**不自動寫入 CLAUDE.md。**

## 完成條件

- CLAUDE.md 骨架（或補充區塊）已輸出到對話
- 輸出附上偵測摘要，方便使用者確認準確性
- 已提示使用者自行決定是否寫入
