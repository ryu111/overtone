# 驗證策略決策樹

> 📋 **何時讀取**：verify 流程中決定驗證策略、處理驗證失敗、或選擇降級方案時。

## 驗證策略總覽

### 六階段依序執行

```
Build → Types → Lint → Tests → Security → Diff
  │        │       │       │        │        │
  ❌停止   ❌停止  ⚠️繼續  ❌停止   ⚠️繼續   📊資訊
```

### 策略決策樹

```
專案有 manifest？
  │
  ├─ 是 → 偵測語言和工具（參考 language-commands.md）
  │         │
  │         ├─ 所有工具都偵測到 → 全階段執行
  │         │
  │         └─ 部分工具缺失 → 有的執行，缺的標記 ⏭️ 跳過
  │
  └─ 否 → 僅執行 Diff 階段（無法自動驗證）
              └─ 提示使用者手動補充驗證命令
```

## 語言別驗證命令索引

### JavaScript / TypeScript

| 階段 | 主要命令 | 備選命令 | 偵測條件 |
|------|---------|---------|---------|
| Build | `{pm} run build` | — | `scripts.build` 存在 |
| Types | `npx tsc --noEmit` | `npx vue-tsc --noEmit` | `tsconfig.json` 存在 |
| Lint | `npx eslint .` | `npx biome check .` | `.eslintrc*` 或 `biome.json` |
| Tests | `{pm} test` | `bun test` | `scripts.test` 或 `*.test.{ts,js}` |
| Security | `{pm} audit --audit-level=high` | — | npm/pnpm/yarn 專案 |

### Python

| 階段 | 主要命令 | 備選命令 | 偵測條件 |
|------|---------|---------|---------|
| Build | （通常跳過） | `python -m build` | `pyproject.toml[build-system]` |
| Types | `mypy .` | `pyright` | `mypy.ini` 或 `pyrightconfig.json` |
| Lint | `ruff check .` | `flake8 .` | `ruff.toml` 或 `.flake8` |
| Tests | `pytest` | `python -m unittest discover` | `conftest.py` 或 `test_*.py` |
| Security | `pip audit` | `safety check` | pip-audit 或 safety 已安裝 |

### Go

| 階段 | 主要命令 | 備選命令 | 偵測條件 |
|------|---------|---------|---------|
| Build | `go build ./...` | — | `go.mod` 存在 |
| Types | `go vet ./...` | — | `go.mod` 存在 |
| Lint | `golangci-lint run` | `staticcheck ./...` | 工具已安裝 |
| Tests | `go test ./...` | `go test -race ./...` | `*_test.go` 存在 |
| Security | `govulncheck ./...` | — | govulncheck 已安裝 |

### Rust

| 階段 | 主要命令 | 備選命令 | 偵測條件 |
|------|---------|---------|---------|
| Build | `cargo build` | `cargo build --release` | `Cargo.toml` 存在 |
| Types | （含在 build 中） | — | — |
| Lint | `cargo clippy -- -D warnings` | `cargo clippy` | clippy 已安裝 |
| Tests | `cargo test` | `cargo nextest run` | `#[test]` 或 `tests/` |
| Security | `cargo audit` | — | cargo-audit 已安裝 |

## 驗證失敗時的降級策略

### 降級決策樹

```
階段執行失敗
  │
  ├─ Build 失敗
  │    ├─ 依賴未安裝？ → 自動執行 install（{pm} install）→ 重試
  │    ├─ 語法錯誤？ → ❌ 停止，回報錯誤位置
  │    └─ 環境問題？ → ⚠️ 標記 SKIP，記錄原因，繼續後續階段
  │
  ├─ Types 失敗
  │    ├─ 型別錯誤數 <= 3？ → ❌ 停止，列出所有錯誤供修復
  │    └─ 型別錯誤數 > 3？ → ❌ 停止，列出前 5 個 + 總數
  │
  ├─ Lint 失敗
  │    ├─ 只有 warnings？ → ⚠️ 繼續，記錄 warning 數
  │    ├─ 有 errors？ → ⚠️ 繼續，記錄 error 數 + 列出前 5 個
  │    └─ 工具本身崩潰？ → ⏭️ 跳過，標記工具異常
  │
  ├─ Tests 失敗
  │    ├─ 失敗數 <= 5？ → ❌ 停止，列出所有失敗的測試名稱
  │    ├─ 失敗數 > 5？ → ❌ 停止，列出前 5 個 + 總失敗數
  │    └─ 測試框架未安裝？ → ⏭️ 跳過，提示安裝
  │
  └─ Security 失敗
       ├─ 有 high/critical 漏洞？ → ⚠️ 繼續，高亮列出
       ├─ 僅 moderate/low？ → ⚠️ 繼續，摘要記錄
       └─ audit 工具未安裝？ → ⏭️ 跳過
```

### 降級層級定義

| 層級 | 符號 | 行為 | 適用場景 |
|:----:|:----:|------|---------|
| L0 正常 | ✅ | 階段通過，繼續 | 無錯誤 |
| L1 警告 | ⚠️ | 記錄問題，繼續執行 | Lint warnings、low-severity 漏洞 |
| L2 停止 | ❌ | 停止後續階段，回報錯誤 | Build/Types/Tests 失敗 |
| L3 跳過 | ⏭️ | 工具不可用，跳過此階段 | 工具未安裝、設定缺失 |

## 重試與三信號驗證

### 可重試 vs 不可重試

| 類型 | 範例 | 處置 |
|------|------|------|
| 可重試 | 依賴未安裝、lock file 衝突、暫時性網路錯誤 | 自動修復後重試（最多 1-2 次） |
| 不可重試 | 語法錯誤、測試邏輯失敗、安全漏洞、設定檔格式錯誤 | 立即回報 |

### 三信號完整驗證

```
完整驗證 = lint 0 error + test 0 fail + code-review PASS
```

| 優先 | 信號 | 類型 | 說明 |
|:----:|------|------|------|
| 1 | Tests 全通過 | 確定性 | 程式碼邏輯正確（機器判斷） |
| 2 | Lint 0 error | 確定性 | 程式碼風格合規（機器判斷） |
| 3 | Code Review PASS | 語意性 | 設計和可讀性合理（AI 判斷） |

**決策分配原則**：確定性信號（lint/test）優先於 AI 判斷（review）。

## 輸出格式範例

```markdown
| 階段 | 狀態 | 說明 |
|------|:----:|------|
| Build | ✅ | 建構成功（耗時 2.3s） |
| Types | ❌ | 2 errors — src/utils.ts:42, src/handler.ts:15 |
| Lint | ⚠️ | 3 warnings（無 errors） |
| Tests | ✅ | 47/47 passed |
| Security | ⏭️ | 跳過（無 audit 工具） |
| Diff | 📊 | 5 files changed, +120 -45 |
```

失敗時停止後續階段，列出錯誤詳情供修復。
