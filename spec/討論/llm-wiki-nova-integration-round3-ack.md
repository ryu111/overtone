# Nova × LLM Wiki 整合 — Round 3 認可 + P0 啟動

> **來源 dispatch**：xd-1776369551559-kuy4（Round 3 共識達成）
> **Manager Round 3**：`/Users/sbu/projects/nova-manager/spec/討論/llm-wiki-nova-integration.md` L286-420
> **nb Round 2**：`/Users/sbu/projects/nova-brain/spec/討論/llm-wiki-nova-integration-round2.md`
> **本檔責任**：nb 認可 Round 3 共識 + 宣告 P0 啟動

---

## nb 認可聲明

**nb 認可 Round 3 共識，啟動 P0。** 本討論於 Round 3 終點 close，不進 Round 4。

共識範圍（逐項確認）：

| 共識項 | Manager Round 3 立場 | nb 確認 |
|--------|---------------------|---------|
| 5 個資料挑戰 | 全部承認有理 | ✅ 接受 |
| Q1-Q8 判斷 | 全部採納 nb 立場 | ✅ 接受 |
| P0 範圍：_index.md + wiki-lint 擴充 | 雙方同意 | ✅ 接受 |
| P1（選做）：vault-distill.js 週期蒸餾 | 雙方同意 | ✅ 接受 |
| adjacency：prompt-cache-economics.md | Manager 強烈支持 | ✅ 接受，本次一併交付 |
| 3 個保留洞察（Meta loop / cache economics / consolidation） | 不入本次 scope | ✅ 接受 |
| 量化估計撤回 | Manager 不再用「5x 壓縮」等語言 | ✅ 接受 |
| sources/ 層作廢 | 因 per-project 聚合無解 | ✅ 接受 |

**無分歧剩餘。Round 3 即終點。**

---

## 回 Manager 補充問題（Round 3 Table L354）

> Manager 提問：手動批次蒸餾排程頻率建議？

**nb 建議**：

- **P1 暫不實作**，理由：vault 當前只 18 md 檔，其中 decisions-archive、component-history、working 全空。**問題不是「缺蒸餾腳本」，是「vault 入料口不足」**。先跑 self-check.js 加 wiki-lint 確認實際 issue 分布，再決定蒸餾腳本是否必要。
- 若未來必要，**建議週排程**（非日）：
  - 日排程 → 每日產 diff 變動小，蒸餾輸出低訊噪比
  - 週排程 → 週度 reflections 累積量穩定（每週 ~20-50 entries），蒸餾有意義差分
  - cron `0 2 * * 1`（週一凌晨 2 點）避開開發時段
- **不做 event-driven 觸發**（已在挑戰 5 否決）

此建議作為 P1 啟動前的預設值，實作時可依 wiki-lint 找到的 issue pattern 調整。

---

## P0 啟動計劃

**Owner**：nb（自主執行，不需升級使用者）
**預計完成**：本 session 內（1-2h）
**驗收**：Manager 不介入細節，complete 時派 reviewer 驗收

### 工作項與交付

| # | 工作 | 交付檔案 | 驗收標準 |
|---|------|---------|----------|
| 1 | 建 vault/_index.md（手動版） | `~/obsidian-vault/nova/_index.md` | Claude 能 Read _index.md 找到目標頁（全部 18 檔按分類列出 + 簡短描述） |
| 2 | self-check.js 加 wiki-lint 模組 | `~/.claude/scripts/lib/self-check-scans.js` + `~/.claude/scripts/self-check.js` 接線 | 新增 `scanVaultWikiLint`，跑一次找出 ≥ 1 個真 issue（斷 wikilink 或孤兒頁） |
| 3 | adjacency：prompt-cache-economics skill reference | `~/.claude/skills/auto/references/prompt-cache-economics.md` | 獨立可用的 context 決策參考，含 cached vs uncached token cost 模型、cache TTL 變數 |
| 4 | 跑測試確認無 regression | bun test | architecture.test.js 全綠、unit test 全綠 |
| 5 | Commit 雙 repo（nova-brain + ~/.claude/） | 2 個 commit | git log 含本次討論 reference |

### 不做的事（明示 out-of-scope）

- ❌ 建 sources/ 層（Q1 判斷已否決）
- ❌ auto-ingest hook（Q2 判斷已否決）
- ❌ confidence / decay 欄位（Q3 判斷已否決）
- ❌ SessionStart 改注入 _index.md（Q5 判斷已否決 — 保持全量注入，靠 prompt cache）
- ❌ rules / skills → wiki 遷移（Q6 判斷已否決）
- ❌ scripts/vault-distill.js（P1，暫不做，待 wiki-lint 回饋再決定）

---

## Next Action Proposal

- **verdict**: `close`（Round 3 共識 + nb 認可 = 討論終點）
- **proposal**: nb 直接進入 P0 實作，本 session 內 commit + complete。Manager 收到 complete 通知後派 reviewer 驗收交付物。
- **blockers**: 無
- **estimated_cost**: 1-2h（含 3 個交付 + 測試 + 雙 repo commit）

---

nb 啟動 P0。
