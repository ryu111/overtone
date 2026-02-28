# Overtone

> 裝上 Claude Code，就像有了一個開發團隊。

---

## 3 分鐘上手

### 步驟一：安裝

```bash
git clone <repo-url> ~/.claude/plugins/overtone
```

重啟 Claude Code，plugin 自動載入。

### 步驟二：第一次使用

開啟 Claude Code，直接輸入你的需求：

```
幫我加一個登入功能
```

系統自動判斷 workflow，依序委派專職 agent 完成規劃、設計、實作、測試、審查。

### 步驟三：看到結果

Dashboard 在 SessionStart 自動啟動（`http://localhost:7777`），即時顯示每個 agent 的執行狀態與結果。

---

## 日常 Workflow

| Workflow | 適合場景 | 階段 |
|----------|---------|------|
| `single` | 一行改動、文件修正 | DEV |
| `quick` | 小功能、bug 修復 | DEV → [REVIEW + TEST] → RETRO |
| `standard` | 新功能開發 | PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → RETRO → DOCS |

還有 15 個特化 workflow（tdd、debug、secure、refactor、e2e-only 等）→ 完整清單見 [docs/spec/overtone-工作流.md](docs/spec/overtone-工作流.md)

---

## 運作原理

```
你說需求
   ↓
/ot:auto 自動選擇 workflow
   ↓
依序委派 17 個專職 agent
   ↓
三信號品質把關，完成交付
```

**17 個專職 agent，各司其職：**

- **planner** — 拆解需求，制定任務計劃
- **architect** — 技術選型，系統設計
- **designer** — UI/UX 設計
- **developer** — 實作程式碼
- **tester** — 撰寫 BDD spec 與測試
- **code-reviewer** — 程式碼審查（信心 >80% 才 PASS）
- **security-reviewer** — 安全漏洞掃描
- **debugger** — 根因診斷（不寫碼）
- **qa**、**e2e-runner** — 行為驗證、End-to-end 測試
- **retrospective**、**doc-updater** 等後置 agent — 回顧與文件同步

**三信號品質把關：**

lint 0 error + test 0 fail + review PASS → 才算完成

---

## Dashboard

即時監控面板（Bun HTTP + htmx + Alpine.js），SessionStart 自動啟動於 `http://localhost:7777`。

三個功能區：
- **Overview** — 當前 session 的 workflow 進度與 agent 狀態
- **Timeline** — 每個 agent 的執行時序與 handoff 記錄
- **History** — 歷史 session 一覽

<!-- TODO: Dashboard 截圖 -->

---

## 技術資訊

| 項目 | 內容 |
|------|------|
| Plugin 版本 | 0.20.0 |
| Agent 數量 | 17（含 grader） |
| Workflow 模板 | 18 |
| Hook 數量 | 9 |
| Skill 數量 | 38 |
| 測試覆蓋 | 991 pass（52 個測試檔） |
| Runtime | Bun |
| 前端 | htmx + Alpine.js（SSE 即時推送） |
| 遠端控制 | EventBus + Adapter（Dashboard + Telegram） |
| 狀態儲存 | `workflow.json` + `timeline.jsonl`（JSONL append-only） |
| 外部依賴 | 僅 gray-matter（frontmatter 解析） |

---

## 文件索引

| 文件 | 說明 |
|------|------|
| [docs/spec/overtone.md](docs/spec/overtone.md) | 完整規格索引（55 個設計決策） |
| [docs/spec/overtone-工作流.md](docs/spec/overtone-工作流.md) | 18 個 workflow 模板詳解 |
| [docs/spec/overtone-agents.md](docs/spec/overtone-agents.md) | 17 個 agent 職責與設定 |
| [docs/status.md](docs/status.md) | 現況快讀（版本、指標、近期變更） |
| [docs/product-roadmap.md](docs/product-roadmap.md) | 產品路線圖 |
| [CLAUDE.md](CLAUDE.md) | 開發規範與設計原則 |

---

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `OVERTONE_PORT` | Dashboard 埠號 | `7777` |
| `OVERTONE_NO_DASHBOARD` | 設為 `1` 禁止自動啟動 Dashboard | — |
| `OT_CORS_ORIGIN` | CORS 允許來源 | `http://localhost:7777` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token | — |
| `TELEGRAM_CHAT_ID` | 白名單 chat ID | — |
