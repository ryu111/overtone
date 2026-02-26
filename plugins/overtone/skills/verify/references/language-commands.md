# 語言×階段命令矩陣

> 📋 **何時讀取**：verify 流程中需要偵測專案語言或確認命令時。

## 偵測優先順序

依序檢查以下檔案判斷專案語言：

| 優先 | 檔案 | 語言 |
|:----:|------|------|
| 1 | `package.json` | Node.js (JS/TS) |
| 2 | `go.mod` | Go |
| 3 | `Cargo.toml` | Rust |
| 4 | `pyproject.toml` / `requirements.txt` | Python |
| 5 | `Gemfile` | Ruby |

### 套件管理器偵測

Node.js 專案進一步偵測套件管理器：

| 檔案 | 管理器 | 執行前綴 |
|------|--------|----------|
| `bun.lockb` / `bun.lock` | Bun | `bun` |
| `pnpm-lock.yaml` | pnpm | `pnpm` |
| `yarn.lock` | Yarn | `yarn` |
| `package-lock.json` | npm | `npm` |

## 命令矩陣

### Node.js / TypeScript

| 階段 | 命令 | 條件 |
|------|------|------|
| Build | `{pm} run build` | package.json 有 `scripts.build` |
| Types | `npx tsc --noEmit` | 有 `tsconfig.json` |
| Lint | `npx eslint .` | 有 `.eslintrc*` 或 `eslint.config.*` |
| Lint | `npx biome check .` | 有 `biome.json` |
| Tests | `{pm} test` | package.json 有 `scripts.test` |
| Tests | `bun test` | Bun 專案且有 `*.test.ts` 檔案 |
| Security | `npm audit --audit-level=high` | npm 專案 |
| Security | `pnpm audit --audit-level=high` | pnpm 專案 |

### Go

| 階段 | 命令 | 條件 |
|------|------|------|
| Build | `go build ./...` | 有 `go.mod` |
| Types | `go vet ./...` | 有 `go.mod` |
| Lint | `golangci-lint run` | 有 `.golangci.yml` 或已安裝 |
| Tests | `go test ./...` | 有 `*_test.go` 檔案 |
| Security | `govulncheck ./...` | 已安裝 govulncheck |

### Rust

| 階段 | 命令 | 條件 |
|------|------|------|
| Build | `cargo build` | 有 `Cargo.toml` |
| Types | （含在 build 中） | — |
| Lint | `cargo clippy` | clippy 已安裝 |
| Tests | `cargo test` | 有 `#[test]` 或 `tests/` 目錄 |
| Security | `cargo audit` | cargo-audit 已安裝 |

### Python

| 階段 | 命令 | 條件 |
|------|------|------|
| Build | （通常無 build 步驟） | 跳過 |
| Types | `mypy .` | 有 `mypy.ini` 或 `pyproject.toml[tool.mypy]` |
| Types | `pyright` | 有 `pyrightconfig.json` |
| Lint | `ruff check .` | 有 `ruff.toml` 或 `pyproject.toml[tool.ruff]` |
| Lint | `flake8 .` | 有 `.flake8` 或 `setup.cfg[flake8]` |
| Tests | `pytest` | 有 `pytest.ini` 或 `conftest.py` 或 `test_*.py` |
| Security | `pip audit` | pip-audit 已安裝 |

## 階段行為

| 階段 | 失敗時 | 說明 |
|------|--------|------|
| Build | 📋 **停止** | 建置失敗則後續階段無意義 |
| Types | 📋 **停止** | 型別錯誤需修復 |
| Lint | 📋 **繼續** | 記錄警告數，不阻擋 |
| Tests | 📋 **停止** | 測試失敗需修復 |
| Security | 📋 **繼續** | 記錄漏洞數，僅報告 |
| Diff | 📊 **資訊** | 僅供參考 |

## 無工具時處理

- 對應工具/設定不存在 → 標記 ⏭️ 跳過
- 不報錯，在結果表格中顯示「跳過（無 [工具名]）」
