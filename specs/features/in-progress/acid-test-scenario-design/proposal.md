# L3.6 Acid Test 場景設計提案

> 版本：1.0 | 建立：2026-03-06
> 目標：設計可執行的真實端到端驗證場景，驗證 Layer 3 自我進化能力全鏈路正確運作

---

## 場景描述

### 名稱
**CLI 工具 — Markdown 部落格生成器（`md-blog`）**

### 高層目標（給系統的初始輸入）

> 「我想建立一個 CLI 工具，把 Markdown 文件轉成靜態 HTML 部落格。用法是 `md-blog build ./posts`，產出 `./dist/` 目錄，每篇文章變成獨立 HTML 頁面，首頁有文章清單，文章間可以互連。」

### 為何選擇這個場景

| 條件 | 滿足方式 |
|------|----------|
| 非熟悉領域 | Overtone 的 skills 集中在 plugin/workflow/testing，無 static-site-generation 或 html-templating |
| 需要建立新 skill | `static-site-generation`（HTML 生成）和 `cli-tooling`（Node/Bun CLI 設計）均不存在 |
| 需要 PM 訪談 | 模板系統（Handlebars vs 字串插值）、CSS 框架、路由結構、Front Matter 格式均有歧義 |
| 規模適中 | 核心功能（parse + render + output）可在 1-2 小時完成，不涉及 server 或資料庫 |
| 產出可驗證 | 生成的 HTML 可在瀏覽器開啟，連結可點擊，程式碼塊有高亮 |

---

## 預期觸發的系統能力

### 1. PM 深度訪談（L3.4 deep-pm）

系統在開始開發前，應主動使用 `interview.js` 釐清以下歧義：

| 面向 | 待釐清問題 |
|------|-----------|
| 功能邊界 | 要不要支援 category/tag 分類？要不要 RSS feed？ |
| 模板設計 | 用內建 HTML 字串插值還是支援自訂 Handlebars 模板？ |
| CSS 框架 | 裸 HTML（無 CSS）、最小 CSS、還是整合 Tailwind？ |
| Front Matter | 支援 YAML Front Matter？強制 title/date 欄位嗎？ |
| 路由結構 | `/posts/slug.html` 還是 `/slug/index.html`？ |
| 驗收標準 | 最終用什麼衡量「完成」？瀏覽器開啟？連結不 404？ |

預期產出：包含 ≥ 10 個 BDD 驗收場景的 Project Spec。

### 2. Skill Forge（L3.3 skill-forge）

系統偵測到能力缺口後，應自主觸發 forge：

| Skill | 觸發原因 |
|-------|---------|
| `static-site-generation` | 需要了解 Markdown → HTML pipeline、前置詞解析、模板引擎 |
| `cli-tooling` | 需要了解 Bun CLI 設計、argv parsing、exit code 慣例 |

預期行為：`evolution.js forge static-site-generation --execute` 和 `evolution.js forge cli-tooling --execute` 自動執行，生成有效的 SKILL.md 和至少 2 個 references。

### 3. Project Orchestrator（L3.5 orchestrator）

訪談結束後，系統應自主：
1. 從 Project Spec 提取 feature 清單
2. 偵測缺少的 skill（static-site-generation、cli-tooling）
3. 將 skill forge 和各 feature 開發排入 execution-queue
4. 啟用自動執行模式

預期佇列結構（依序）：
```
1. forge:static-site-generation  (chore)
2. forge:cli-tooling             (chore)
3. md-blog:core-parser           (feature)
4. md-blog:html-renderer         (feature)
5. md-blog:cli-interface         (feature)
6. md-blog:index-page            (feature)
```

### 4. 無限迭代（L3 execution loop）

系統應透過 heartbeat daemon + execution-queue 自動推進，不需要人工每步觸發。

---

## 驗證標準（BDD 格式）

### Scenario A：PM 訪談啟動

```
GIVEN 系統收到高層目標「建立 md-blog CLI 工具」
WHEN product-manager agent 被委派
THEN PM 主動發出至少 5 個結構化問題（涵蓋功能/操作流程/邊界條件）
AND 訪談持續直到獲得完整 Project Spec
AND Project Spec 包含 ≥ 10 個 GIVEN/WHEN/THEN 驗收場景
```

### Scenario B：Skill Forge 觸發

```
GIVEN Project Spec 產出後，系統識別能力需求
WHEN knowledge-gap-detector 掃描現有 skills
THEN 偵測到 static-site-generation 和 cli-tooling 兩個缺口
AND 自動觸發 evolution.js forge --execute 建立對應 SKILL.md
AND 每個新 skill 包含 ≥ 2 個 references 文件
AND bun scripts/validate-agents.js 通過（元件結構正確）
```

### Scenario C：Project Orchestrator 排程

```
GIVEN 兩個新 skill 建立完成
WHEN evolution.js orchestrate <spec-path> --execute 執行
THEN execution-queue 中出現 ≥ 4 個 pending 項目
AND forge 任務排在開發任務之前
AND queue 進入自動執行模式（enable-auto = true）
```

### Scenario D：核心 CLI 功能可用

```
GIVEN md-blog 開發完成（所有 feature 在佇列中標記 completed）
WHEN 執行 md-blog build ./test-posts
THEN 在 ./dist/ 目錄生成 HTML 文件
AND index.html 包含所有文章的連結清單
AND 每篇文章的 HTML 包含正確渲染的 Markdown 內容
AND 程式碼塊有語法高亮（class 標記）
AND 文章間的內部連結不 404
```

### Scenario E：驗收通過

```
GIVEN dist/ 目錄的所有 HTML 文件生成完成
WHEN 用瀏覽器開啟 dist/index.html
THEN 頁面正常顯示（無 JS 錯誤、無 404 資源）
AND 點擊任意文章連結正確導航到對應頁面
AND 頁面回到首頁的連結正常運作
```

### Scenario F：經驗內化（L3.7）

```
GIVEN md-blog 專案完成並通過驗收
WHEN evolution.js internalize --execute 執行
THEN static-site-generation 和 cli-tooling skills 評分 ≥ 0.7
AND 這兩個 skills 被標記為 internalized（永久能力）
AND experience-index 記錄「md-blog 類型專案需要 static-site-generation + cli-tooling」
AND 下次遇到類似專案，系統能直接使用這些 skills 不需重新 forge
```

---

## 執行計劃（Step by Step）

### Step 0：環境準備（手動，一次性）

```bash
# 確認 Layer 3 所有核心模組正常
bun scripts/health-check.js
bun scripts/validate-agents.js

# 確認 evolution.js 各子命令正常
bun scripts/evolution.js --help
bun scripts/evolution.js status
```

預期：所有檢查通過，evolution.js 顯示正確說明。

### Step 1：觸發 PM 訪談

給系統以下 prompt（在 Claude Code 對話中直接輸入）：

```
我想建立一個 CLI 工具，把 Markdown 文件轉成靜態 HTML 部落格。
用法是 `md-blog build ./posts`，產出 `./dist/` 目錄，
每篇文章變成獨立 HTML 頁面，首頁有文章清單，文章間可以互連。
請幫我把這個想法做成產品。
```

預期：系統自動走 workflow（含 deep-pm）→ PM agent 開始多輪訪談。

### Step 2：回答 PM 訪談問題

根據 PM 問的問題，以下是預設答案：

| 問題類別 | 預設答案 |
|---------|---------|
| 模板系統 | 內建 HTML 字串插值，不需要外部模板引擎 |
| CSS 框架 | 最小 CSS（內嵌在 HTML，無外部依賴） |
| Front Matter | 支援 YAML Front Matter，title 和 date 為必填 |
| 路由結構 | `/posts/slug.html` 格式 |
| 分類功能 | 第一版不需要 category/tag |
| RSS Feed | 第一版不需要 |
| 程式碼高亮 | 用 `<code class="language-xxx">` 標記即可（不需要 JS） |
| 驗收標準 | 瀏覽器能開啟，連結不 404，Markdown 正確渲染 |

### Step 3：確認 Project Spec 產出

驗證 PM 訪談結果：
- Project Spec 文件存在且包含完整需求
- BDD 場景數量 ≥ 10
- 功能邊界清晰

### Step 4：觀察自動化流程（無需介入）

系統應自動執行：
1. Skill Forge（建立 static-site-generation、cli-tooling）
2. Project Orchestrator（建立並排程 feature 佇列）
3. Heartbeat Daemon 驅動迭代開發

預期時間：30-90 分鐘（含 WebFetch 研究時間）

### Step 5：驗收測試

```bash
# 進入生成的 md-blog 專案目錄（由系統自行決定路徑）
cd <md-blog-project-dir>

# 建立測試文章
mkdir -p test-posts
# （建立 2-3 篇測試 Markdown 文章）

# 執行 CLI 工具
node md-blog.js build ./test-posts
# 或 bun md-blog.js build ./test-posts

# 驗證輸出
ls dist/
# 應看到 index.html 和各文章的 HTML 文件

# 用瀏覽器開啟
open dist/index.html
```

### Step 6：內化

```bash
bun scripts/evolution.js internalize --execute
```

驗證兩個新 skill 被標記為 internalized。

---

## 風險和限制

### 技術風險

| 風險 | 機率 | 影響 | 緩解方式 |
|------|:----:|:----:|---------|
| Skill Forge 生成的 SKILL.md 品質不足，agent 無法有效使用 | 中 | 高 | 手動補充 references，或調低品質門檻後觀察行為 |
| PM 訪談問題過於籠統，Project Spec 不夠詳細 | 低 | 中 | 準備預設答案（如上表），確保訪談能收斂 |
| WebFetch 研究失敗（網路問題或內容太多） | 低 | 低 | Skill Forge 有本地 fallback，從 codebase 萃取 |
| Heartbeat Daemon 在開發過程中崩潰 | 低 | 中 | 手動 `bun scripts/heartbeat.js start` 重啟 |
| 生成的 md-blog CLI 有 bug，驗收失敗 | 中 | 中 | 這是可接受的失敗（系統會自動進入修復迭代） |

### 範圍限制

- **不驗證 L2.5（動得了）**：UI 操控能力不在此次測試範圍
- **不驗證多專案並行**：L4 能力，此次只做單一專案
- **md-blog 的完整性不是目標**：重點是驗證 L3 全鏈路，md-blog 是媒介不是終點
- **人工介入點**：Step 2（回答 PM 訪談）是唯一預期的人工介入點

### 成功定義

| 等級 | 條件 |
|:----:|------|
| 完全成功 | Scenario A-F 全部通過，全程無非預期人工介入 |
| 部分成功 | Scenario A-D 通過，E-F 需少量人工協助 |
| 基本通過 | PM 訪談完成 + Skill Forge 成功 + 至少一個 feature 開發完成 |
| 失敗 | PM 訪談未完成，或 Skill Forge 完全失敗，或無法啟動自動迭代 |

---

## 後續行動

Acid Test 完成後（無論成功或失敗），應記錄：

1. **系統行為觀察**：哪些步驟自動完成？哪些需要人工介入？
2. **Skill 品質評估**：forge 生成的 SKILL.md 是否真正有效提升 agent 能力？
3. **PM 訪談品質**：問題是否覆蓋了所有設計決策點？
4. **改進點**：記錄在 `docs/learnings/acid-test-1.md`（待建立）

這些觀察將直接回饋到 L4 通用代理人的設計。
