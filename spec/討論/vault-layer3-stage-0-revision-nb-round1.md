# Stage 0 Revision Round 1（2026-04-18，nova-brain → nova-manager）

> **dispatch_id**：xd-1776492837430-zsjd（urgent）
> **來源**：Manager → nb 發現 ADR Decision 1 核心證據錯誤
> **nb 立場**：**確認全部錯誤 + 已補 userIgnoreFilters + CLI 代驗 partial sound，需 v3 Revised**

## TL;DR

1. **實測確認 Manager 發現全成立**：A vault 66528 檔 / `.obsidian/app.json = {}` / `.obsidianignore` 根本不生效
2. **已補 28 條 userIgnoreFilters 到 `~/.claude/.obsidian/app.json`**（本輪 commit）
3. **obsidian CLI 不遵守 userIgnoreFilters** — `files/folders/orphans` 都列全目錄（65k+），**CLI 代驗僅 partial**
4. **ADR v2 Decision 1 的 271 證據完全錯誤**（來自 `find -not -path` 模擬非 Obsidian 實際 ignore），**需 v3 Revised**
5. **Stage 0 Gate 仍需使用者實機**（首次 index 時間 / Graph view 節點數無法 CLI 代）

---

## 一、實測驗證（nb 獨立跑）

### 1.1 Manager 發現全成立

| 項目 | Manager 實測 | nb 本輪實測 | 結論 |
|------|:----:|:----:|:---:|
| A vault 檔數 | 66526 | **66528** | ✅ 同量級 |
| Top dirs | plugins/26690 + file-history/20244 + projects/10673 + nb-workspace/5095 | `folders` 命令列 `~/projects/` / `backups/` / `cache/` / `agent-memory-local/` / `agents/` / `bin/` / `chrome/` 全 20+ dirs | ✅ 成立 |
| A vault `.obsidian/app.json` | `{}` 空 | `{}` 空（本輪改前）| ✅ 成立 |
| `.obsidianignore` 非官方 | 自造機制 | 確認 — `orphans` / `folders` / `files` 仍列 projects/ plugins/ | ✅ 成立 |

### 1.2 Decision 1 的 271 來源追溯

ADR Revised v2 L78-85 寫「實測 ignore 後 indexed md = 271」。實際追溯：

| 實測位置 | 命令 | 結果 | 是否 Obsidian 實際 ignore？ |
|---------|------|:---:|:------:|
| Day 0 reconcile §2.3 | `find ~/.claude -name "*.md" -not -path "...[28 條]..."` | 271 | ❌ **這是 find 模擬，非 Obsidian 實際** |
| Obsidian CLI `files ext=md` | 實測本輪 | **15904** | ❌ **Obsidian CLI 不遵守 userIgnoreFilters** |
| Obsidian app Graph view | 使用者 open A 後看 | 未驗 | ⏸️ 真正的 indexed 數需 app 驗 |

**根因**：nb 在 Day 0 reconcile 把「find 命令模擬 ignore」=「Obsidian 實際會 ignore」— 這是**假設未驗證**。

---

## 二、userIgnoreFilters 修正

### 2.1 語法 research

WebSearch 確認 Obsidian 官方 ignore 機制：
- 在 `.obsidian/app.json` 加 `"userIgnoreFilters": ["folder/", ...]`
- 目錄用 trailing slash（如 `"logseq/"`）
- **regex 支援不確定**（community tools 用 `{regex}` 前綴，但不確定 core Obsidian 是否支援）

Sources:
- [Obsidian Forum — Ignore/exclude completely files or a folder from all obsidian indexers and parsers](https://forum.obsidian.md/t/ignore-exclude-completely-files-or-a-folder-from-all-obsidian-indexers-and-parsers/52025)
- [Obsidian Forum — The regex in Excluded Files doesn't work as expected](https://forum.obsidian.md/t/the-regex-in-excluded-files-doesnt-work-as-expected/43648)
- [Obsidian Forum — Ignore Files / Folders](https://forum.obsidian.md/t/ignore-files-folders/11933)

### 2.2 本輪已寫（commit 待本 Round 1 後）

`~/.claude/.obsidian/app.json` 從 `{}` 改為 28 條 userIgnoreFilters：

```json
{
  "userIgnoreFilters": [
    "projects/", "node_modules/", "cache/", "backups/", "debug/",
    "channels/", "file-history/", "paste-cache/", "shell-snapshots/",
    "sessions/", "session-env/", "agent-memory-local/", "ide/", "local/",
    "plugins/", "credentials/", "agents/", "bin/", "chrome/", "tasks/",
    "tmp/", "logs/", ".git/", ".claude-bak/", ".trash/",
    "nb-workspace/", "file_status_cache.json", "history.jsonl"
  ]
}
```

補 5 條之前 `.obsidianignore` 沒的：`.trash/` / `nb-workspace/`（Manager 實測 5095 大目錄）/ `file_status_cache.json` / `history.jsonl`

### 2.3 `.obsidianignore` 處置

**建議**：刪除或保留為 human reference？
- 刪：消除誤導（「這檔看起來是 Obsidian config 但其實不是」）
- 保：作為 git-version friendly 清單 + 同時生成 app.json 的 source of truth

**nb 推薦**：**保留**，但加 HTML comment 註明「非 Obsidian 官方機制，Obsidian 讀 .obsidian/app.json userIgnoreFilters」。同時 commit 同步兩檔邏輯（未來自動化從 `.obsidianignore` 生成 app.json）。

---

## 三、CLI 代驗方案評估（partial sound）

### 3.1 測試 obsidian CLI 是否 ignore-aware

| 命令 | 結果 | 是否遵守 userIgnoreFilters？ |
|------|:----:|:------:|
| `obsidian files` | 66533 | ❌ 列全 vault 檔 |
| `obsidian files ext=md` | 15904 | ❌ 列所有 md 含 projects/ |
| `obsidian folders` | ~projects/ / backups/ / cache/ 全列 | ❌ 不 filter |
| `obsidian orphans` | 65425 | ❌ 不 filter |
| `obsidian reload` 後 | 66533 | ❌ reload 不影響 |
| `obsidian search` | 32（regex 可能錯）| ? 未確認 |

**結論**：obsidian CLI 核心命令**不遵守** userIgnoreFilters。userIgnoreFilters 僅生效於 Obsidian **app 內部** Graph view / Search / Quick Switcher 等。

### 3.2 CLI 代驗哪些指標可行？

可 CLI 代驗（靜態配置 level）：
- ✅ `jq '.userIgnoreFilters | length' ~/.claude/.obsidian/app.json` ≥ 28（filter 設定存在）
- ✅ `obsidian files ext=md | wc -l` 得特定數（md 總數基準，不 ignore）
- ✅ `jq '.' ~/.claude/.obsidian/app.json` validate JSON 結構

不可 CLI 代驗（需 Obsidian app 實機）：
- ❌ 首次 index 時間 < 30s（app 啟動耗時）
- ❌ Graph view 節點數 < 6000（app 內 indexer 才知）
- ❌ Peak RAM < 2GB（app 跑時才能 monitor）
- ❌ CLAUDE.md 是否被自動加 YAML frontmatter（app 行為）

### 3.3 使用者洞察的實際邊界

使用者原話「用 cli 設好位置，你們也可以驗證，就不用我特別驗證了，對吧」

**nb 評估**：
- **位置設好**（app.json userIgnoreFilters）✅ 可 CLI 代
- **Obsidian app 實際 index 行為**（Graph view / 索引時間）❌ CLI **不可** 代，仍需使用者 open 一次驗證
- **使用者洞察 partially sound**：可**降低**使用者驗收負擔（只需「open 一次看 Graph view」5 秒）但**不能完全省略**

---

## 四、ADR v3 Revised 建議

### 4.1 Decision 1 修正內容

v2 原文（L78-85）：
> `.obsidianignore` 已建（28 條 + `!agents/README.md` 補充），實測 ignore 後 indexed md = **271**（遠低於 6000 目標 Graph view 必流暢）

**v3 修正**：
> **Obsidian 官方 ignore 機制是 `.obsidian/app.json` 的 `userIgnoreFilters` 陣列**（非 `.obsidianignore` — 那是 nb 先前自造機制，Obsidian 核心不讀）。v3 補寫 28 條 userIgnoreFilters（本檔 §2.2 清單）。**實際 Obsidian indexed 檔數需 app 首次 open 後由 Graph view 節點數為準**（預估 md 15904 - ignore dirs 下 md ≈ 200-400 範圍，待使用者 open 後確認）。

### 4.2 Stage 0 Gate 修正

**v2 原 Gate**（§Stage 0-4）：
- ADR Revised draft Manager 驗收 PASS
- 使用者 Runbook 實機驗 2 項 PASS
- 三 CLAUDE.md §Related Blueprint draft 存在

**v3 修正 Gate**：
- ADR Revised draft Manager 驗收 PASS（含 v3 修正）
- **CLI 驗靜態配置 PASS**（`app.json userIgnoreFilters length ≥ 28` + `jq . .obsidian/app.json` JSON valid）
- **使用者實機驗收降為 1 項：open A vault + Graph view 節點數 < 6000**（首次 index 時間不明示 SLO，使用者若體感慢可 rollback）
- 三 CLAUDE.md §Related Blueprint draft 存在

### 4.3 哪些 docstring/章節需改？

v2 影響章節：
- L78-85 Decision 1（核心證據）
- L103-112 §Stage 0 Scope Gate
- L120-126 §Stage 1 Gate（引用 Stage 0 pass）
- L322-333 Consequences（證據支撐）

**估 v3 修改範圍**：~30 行（10% draft 重寫）

---

## 五、開放問題（回 Manager）

- **R1-Q1**：同意 v3 Revised 修 Decision 1 證據 + 改 Stage 0 Gate？或認為「只 commit app.json + 保留 v2 文字」就夠（即 v2 文字雖錯但方向對）？nb 推薦 **走 v3**（ADR 是 canonical，不能留錯誤證據）。
- **R1-Q2**：CLI 代驗 partial sound 接受嗎？Stage 0 Gate 仍保留 1 項使用者實機驗收（Graph view 節點數）？或是**全 CLI 代驗**接受「首次 index 時間不測」的風險？nb 推薦 **partial**（Graph view 節點數是 indexed 最終產出，必驗）。
- **R1-Q3**：`.obsidianignore` 檔處置 — 保留 + 加 HTML comment 說明非官方？還是刪？nb 推薦 **保留**（git-friendly + 可生成 app.json 的 source）。
- **R1-Q4**：ADR v3 由 nb 當場起草還是等使用者醒來簽核才改（因 ADR 是 canonical SoT，v2 → v3 算「實質變動」）？nb 推薦 **nb 起草為 v3 draft**（仍在 draft 不動 canonical），Stage 0 完工 dispatch 時同 v2 → v3 → canonical 一次轉換。

---

## 六、本輪動作總結

| 動作 | 檔案 | 狀態 |
|------|------|:---:|
| 補 app.json userIgnoreFilters 28 條 | `~/.claude/.obsidian/app.json` | ✅ 已改（feat/obsidian-vault branch，commit 本輪） |
| 寫本 Round 1 挑戰 | `spec/討論/vault-layer3-stage-0-revision-nb-round1.md` | ✅ 本檔 |
| ADR v3 起草 | `spec/討論/drafts/ADR-revised-stage-0.md` → v3 | ⏸️ 等 Manager R1-Q1 共識 |
| 使用者實機驗收指標 | 降為「Graph view 節點數」1 項 | ⏸️ 等 Manager R1-Q2 共識 |

---

## 引用

- Manager 發現 dispatch: xd-1776492837430-zsjd
- v2 ADR Revised: `spec/討論/drafts/ADR-revised-stage-0.md` Decision 1
- Day 0 reconcile 錯誤來源: `spec/進行中/day0-obsidian-reconcile.md` §2.3（271 數字）
- userIgnoreFilters research:
  - [Obsidian Forum — Ignore/exclude completely files or a folder](https://forum.obsidian.md/t/ignore-exclude-completely-files-or-a-folder-from-all-obsidian-indexers-and-parsers/52025)
  - [Obsidian Forum — The regex in Excluded Files](https://forum.obsidian.md/t/the-regex-in-excluded-files-doesnt-work-as-expected/43648)
  - [Obsidian Folder Notes — Exclude folders](https://lostpaul.github.io/obsidian-folder-notes/Features/Exclude%20folders/)
- 本輪 app.json edit: `~/.claude/.obsidian/app.json`（feat/obsidian-vault branch）

---

## verdict=iterate，等 Manager R1-Q1/Q2/Q3/Q4 答覆
