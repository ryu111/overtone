# Overtone 工作流

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：18 個 workflow 模板、選擇器邏輯、命令清單、錯誤處理
> 版本：v0.17.7

---

## 工作流啟動

### 觸發機制

| 方式 | 觸發 | 說明 |
|------|------|------|
| **自動** | UserPromptSubmit hook → systemMessage 指向 `/ot:auto` | 預設模式 |
| **手動** | 使用者輸入 `/ot:plan`、`/ot:tdd`、`/ot:review` 等 | 直接觸發特定工作流 |
| **覆寫** | `[workflow:xxx]` 語法在 prompt 中 | 跳過 /ot:auto 判斷 |

### /ot:auto 選擇器

Main Agent 讀取 `/ot:auto` Skill 內容後自行判斷最適合的工作流模板：
- **不需要 LLM classifier**
- **不需要使用者確認**，直接執行
- 沒有適合的預設模板時，Main Agent 自行編排 agent 序列

---

## 工作流模板（18 個）

### 基本模板（5 個）

| # | Key | 名稱 | Stages | 並行 |
|:-:|-----|------|--------|:----:|
| 1 | `single` | 單步修改 | DEV | - |
| 2 | `quick` | 快速開發 | DEV → [R+T] → RETRO | R+T |
| 3 | `standard` | 標準功能 | PLAN → ARCH → T:spec → DEV → [R+T:verify] → RETRO → DOCS | R+T |
| 4 | `full` | 完整功能 | PLAN → ARCH → DESIGN → T:spec → DEV → [R+T:verify] → [QA+E2E] → RETRO → DOCS | 兩組 |
| 5 | `secure` | 高風險 | PLAN → ARCH → T:spec → DEV → [R+T:verify+S] → RETRO → DOCS | R+T+S |

> **BDD 規則**：所有含 PLAN/ARCH 的 workflow 在 DEV 前加入 TEST:spec（寫 BDD 行為規格）

### 特化模板（7 個，來自 ECC）

| # | Key | 名稱 | Stages | 用途 |
|:-:|-----|------|--------|------|
| 6 | `tdd` | 測試驅動 | TEST:spec → DEV → TEST:verify | BDD 先行 |
| 7 | `debug` | 除錯 | DEBUG → DEV → TEST | 先診斷再修復 |
| 8 | `refactor` | 重構 | ARCH → TEST:spec → DEV → [R+T:verify] | 先設計再重構，R+T 並行 |
| 9 | `review-only` | 純審查 | REVIEW | 只審查不寫碼 |
| 10 | `security-only` | 安全掃描 | SECURITY | 只掃描不修復 |
| 11 | `build-fix` | 修構建 | BUILD-FIX | 最小修復構建錯誤 |
| 12 | `e2e-only` | E2E 測試 | E2E | 只跑端對端測試 |

### 獨立 Agent 模板（3 個）

| # | Key | 名稱 | Stages | 用途 |
|:-:|-----|------|--------|------|
| 13 | `diagnose` | 純診斷 | DEBUG | 只診斷不修復 |
| 14 | `clean` | 死碼清理 | REFACTOR | 清理未使用程式碼 |
| 15 | `db-review` | DB 審查 | DB-REVIEW | 資料庫專項審查 |

### 產品模板（3 個，PM Agent 驅動）

| # | Key | 名稱 | Stages | 用途 |
|:-:|-----|------|--------|------|
| 16 | `product` | 產品功能 | PM → PLAN → ARCH → T:spec → DEV → [R+T] → RETRO → DOCS | 含 PM 的標準流程 |
| 17 | `product-full` | 產品完整 | PM → PLAN → ARCH → DESIGN → T:spec → DEV → [R+T] → [QA+E2E] → RETRO → DOCS | 含 PM 的完整流程 |
| 18 | `discovery` | 產品探索 | PM | 純產品分析探索 |

### 自訂序列

無使用者語法。當 18 個模板都不適合時，Main Agent 自行判斷 agent 組合並依序委派。

---

## 命令清單

所有命令使用 `ot:` 前綴避免撞名。

| 命令 | 功能 | 觸發工作流 |
|------|------|:----------:|
| `/ot:auto` | 自動選擇工作流（核心） | Main Agent 選 |
| `/ot:plan` | 需求規劃 | - |
| `/ot:dev` | 開發實作 | single |
| `/ot:tdd` | TDD 流程 | tdd |
| `/ot:review` | 程式碼審查 | review-only |
| `/ot:security` | 安全掃描 | security-only |
| `/ot:e2e` | E2E 測試 | e2e-only |
| `/ot:build-fix` | 修構建錯誤 | build-fix |
| `/ot:debug` | 除錯診斷 | debug |
| `/ot:refactor` | 重構 | refactor |
| `/ot:verify` | 統一 6 階段驗證 | - |
| `/ot:stop` | 退出 Loop | - |
| `/ot:dashboard` | 開啟 Dashboard | - |
| `/ot:evolve` | 手動觸發知識進化 | - |
| `/ot:multi-review` | 多模型審查（V2） | - |

---

## 錯誤處理

### 失敗流程（wk 風格）

```
TESTER FAIL
    ↓
SubagentStop 偵測 FAIL → failCount += 1
    ↓
failCount < 3？
├─ 是 → 委派 DEBUGGER 分析根因 → 委派 DEVELOPER 修復 → 委派 TESTER 再測
└─ 否 → 暫停，提示使用者介入
```

### REVIEWER REJECT

```
SubagentStop 偵測 REJECT → rejectCount += 1
    ↓
rejectCount < 3？
├─ 是 → 委派 DEVELOPER 修復（帶 reject 原因）→ 委派 REVIEWER 再審
└─ 否 → 暫停，提示使用者介入
```

### 雙重失敗協調（D3 修復）

REVIEW REJECT + TEST FAIL 同時發生時，優先順序明確為 **TEST FAIL > REVIEW REJECT**。

**理由**：測試失敗表示代碼根本有問題；審查拒絕只是品質問題。

**協調行為**：
1. 先分析 TEST FAIL 的根因（DEBUGGER）
2. DEVELOPER 修復根本問題
3. TESTER 再驗證
4. 若 REVIEW 仍需要修改，帶上本輪修正一起重審

這樣避免進入「REVIEW 修了但 TEST 沒修，反覆 REJECT」的無限迴圈。

### 重試上限

統一 3 次重試上限，不分風險等級。不做風險升級。
