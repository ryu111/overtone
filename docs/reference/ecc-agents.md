# ECC Agent 架構分析

> 來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code)（49.6k stars，黑客松冠軍）

## Agent 清單（13 個）

| Agent | Model | 職責 | 工具權限 | Overtone 對應 |
|-------|:-----:|------|:--------:|:------------:|
| planner | opus | 規劃實作步驟、架構分解 | 唯讀 | ✅ planner |
| architect | opus | 系統設計、技術決策 | 唯讀 | ✅ architect |
| code-reviewer | sonnet | 程式碼品質、安全檢查 | 唯讀+Bash | ✅ code-reviewer |
| security-reviewer | sonnet | OWASP 漏洞掃描 | 全權限 | ✅ security-reviewer |
| tdd-guide | sonnet | TDD（RED→GREEN→REFACTOR） | 全權限 | ⚠️ tester（概念不同） |
| e2e-runner | sonnet | Playwright E2E 測試 | 全權限 | ✅ e2e-runner |
| build-error-resolver | sonnet | 編譯/型別錯誤修復 | 全權限 | ✅ build-error-resolver |
| doc-updater | haiku | 文件同步 | 全權限 | ✅ doc-updater |
| **database-reviewer** | sonnet | PostgreSQL/Supabase 最佳實踐 | 全權限 | ❌ 新概念 |
| **python-reviewer** | sonnet | Python 專用審查 | 唯讀+Bash | ❌ 語言特化 |
| **go-reviewer** | sonnet | Go 專用審查 | 唯讀+Bash | ❌ 語言特化 |
| **go-build-resolver** | sonnet | Go 編譯錯誤修復 | 全權限 | ❌ 語言特化 |
| **refactor-cleaner** | sonnet | 死碼清理（knip+depcheck） | 全權限 | ❌ 新概念 |

## 與 Vibe/Overtone 的差異

| 面向 | ECC | Vibe | Overtone 建議 |
|------|-----|------|:------------:|
| 開發 | 無 developer agent | developer 負責寫碼 | 保留 developer |
| 設計 | 無 designer agent | designer 做 UI/UX | 保留 designer |
| QA | 無 qa agent | qa 做行為驗證 | 保留 qa |
| 除錯 | 無（dev 兼任） | 無 | **新增 debugger** |
| 語言特化 | python/go 各自 reviewer | 通用 code-reviewer | 考慮按需擴充 |
| 死碼清理 | refactor-cleaner 專職 | 無 | **考慮新增** |
| 資料庫 | database-reviewer | 無 | **考慮新增** |

## Prompt 設計模式

### 信心過濾
code-reviewer：>80% 把握才回報問題，降低 false positive。

### 邊界清單
build-error-resolver：明確 DO/DON'T + 停止條件（3 次失敗 / 引入更多錯誤）。

### 誤判防護
security-reviewer：`.env.example` vs 真 secrets 的區分清單。

### 用詞強度分佈
- **MUST/NEVER**：安全紅線、絕對邊界
- **ALWAYS**：核心工作流步驟
- **should/consider**：最佳實踐、建議

## 對 Overtone 的啟示

1. **debugger agent 值得新增** — 診斷和修復是不同的思維模式
2. **refactor-cleaner 有價值** — 自動化死碼偵測（knip/depcheck/ts-prune）
3. **語言特化 reviewer** — 目前不需要，但架構應留擴充空間
4. **信心過濾** — code-reviewer 的 >80% 門檻值得採用
5. **工具權限分離** — 規劃型 agent 唯讀，執行型 agent 全權限
