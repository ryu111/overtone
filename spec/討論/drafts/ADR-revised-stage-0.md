# ADR-001 Revised (v3) — Vault-Layer3 升級 + 清點 + Stage 0-4 全包（含 Obsidian 官方 ignore 修正）

**狀態**：Draft (proposed v3 — Revised after xd-zsjd Decision 1 證據修正)

```yaml
adr_number: 001
title: Vault-Layer3 Upgrade (Revised v3 — Obsidian 官方 ignore + sync script)
schema_version: 3
supersedes: ADR-001 v1 (2026-04-17 Accepted, Round 1-5) + v2 intermediate draft
status: proposed (draft)
date: 2026-04-18
authors: nova-brain (scope owner)
reviewers: [nova-manager, user]
related_adrs: [003, 004, 005, 006]
related_discussions:
  - spec/討論/vault-layer3-migration.md (Round 1-5 + P/Q, 2072 lines)
  - spec/討論/vault-layer3-migration-nb-round6.md
  - spec/討論/vault-layer3-migration-nb-round7.md
  - spec/討論/stage-0-inputs-nb-ack.md
  - spec/討論/user-4-answers-nb-ack.md
  - ~/projects/nova-manager/spec/討論/vault-layer3-migration-manager-round6.md
  - ~/projects/nova-manager/spec/討論/vault-layer3-migration-manager-round7.md
  - ~/projects/nova-manager/spec/討論/external-research-karpathy-wiki-2026-04.md
driver: user (唯一簽核權人)
facilitator: nova-manager
implementer: nova-brain
```

---

## Context

### Round 1-7 收斂歷程

vault-layer3 討論經歷 7 Round 收斂：

| Round | 日期 | 關鍵結論 | 狀態 |
|:-----:|------|---------|:---:|
| Round 1 | 2026-04-17 | 提 Plan A/B/C 三方案，實測 3 事實反證 procedural ≠ semantic | closed |
| Round 2 | 2026-04-17 | Plan C 聚焦版收斂 + F2 套路 3 次低估實證 | closed |
| Round 3 | 2026-04-17 | Plan C 使用者簽核 + F1 七天凍結條款 | accepted |
| Round 4 | 2026-04-17 | ADR Revised 架構 pivot + feat branch 策略 | accepted |
| Round 5 | 2026-04-17 | 清點 L1-L3 方法論 + P Day 0 Obsidian + Q README 補齊 | closed |
| Round 6 | 2026-04-18 | 分期啟動 4 問收斂 + Phase→Stage rename 4 項共識 | closed |
| Round 7 | 2026-04-18 | Manager ack + 使用者 4 答 + 自驅策略 | closed |

**v1 ADR-001 只整合 Round 1-5**，v2 Revised 補 Round 6-7 共識 + 使用者 4 答 + Karpathy 2026 對齊。

### 使用者 4 答（Round 7 後確定）

| # | 決定 | 意義 |
|:-:|------|------|
| 1 | vault_root = A (`~/.claude/`) | 跨目錄 backlink，對齊 Karpathy 2026 |
| 2 | 清點納入 A（含清點 27-38d 全範圍）| Stage 3 含 L1-L3 rule/skill 廣意化+清點 + Stage 4 semantic-distill |
| 3 | feat → main 覆蓋式同步策略 | nb 在 feat/obsidian-vault 自由開發，main frozen 至 Stage 4 驗收後 |
| 4 | 覆蓋觸發 = Stage 4 全完工 + 使用者實機驗收 Obsidian 可用 | A 選項，不按 Stage 漸進 sync |

### Karpathy LLM Wiki 2026-04 業界共識對齊

Manager 外部研究（external-research-karpathy-wiki-2026-04.md）盤點 6 項 2026 best practices：

| # | Best Practice | Nova 現況 | 對齊 Stage |
|:-:|--------------|----------|:----------:|
| 1 | raw/ 目錄 dump 所有 upstream | ✅ `~/.claude/obsidian/raw/` 已存 + weekly-synthesis 寫入（Phase 1）| 0 |
| 2 | Obsidian Web Clipper 抓網頁成 md | ❌ 無 | 2（延後，視使用者需求） |
| 3 | LLM 自動 linting scan | ✅ chain-integrity.js + session-start-health.js | 3（補 new connections 偵測）|
| 4 | 每 note frontmatter summary + tags | ⚠️ rules/skills 部分有，vault/ 尚未全面 | 1（搬遷時統一 schema）|
| 5 | Contamination Mitigation（clean vs messy vault）| ✅ 已有 working/ vs semantic/ 分離 | 1（實作 promotion gate）|
| 6 | Markdown-first portability | ✅ Nova 全 md + `.obsidianignore` | 0 |

**對齊度**：3/6 已對齊，3/6 有 gap 分散至 Stage 1-3 消化。

---

## Decision

### 1. vault_root = A (~/.claude/)

**決策**：Obsidian vault root 設為 `~/.claude/` 整根，以 **Obsidian 官方 `.obsidian/app.json` 的 `userIgnoreFilters` 陣列**排雜訊（28+ 目錄/檔案）。

**理由**：
- rules/ ↔ skills/ ↔ obsidian/ 跨目錄 backlink 能被 Obsidian 索引
- 對齊 Karpathy 2026 markdown-first 模式
- **Obsidian 官方 ignore 機制**：`.obsidian/app.json` 的 `userIgnoreFilters: [...]` array（sources: [Obsidian Forum](https://forum.obsidian.md/t/ignore-exclude-completely-files-or-a-folder-from-all-obsidian-indexers-and-parsers/52025)）
- `.obsidianignore` 保留為 human-friendly SoT（git-friendly），由 `scripts/sync-obsidian-ignore.js` sync 到 app.json 避免兩處 drift

**v2 錯誤修正**（v2 曾宣稱「實測 ignore 後 indexed md = 271」）：
- 271 數字來自 nb Round 6 Q1 的 `find -not -path` 命令模擬，**非** Obsidian 實際 ignore
- Obsidian 根本不讀 `.obsidianignore`（自造機制），需用 `app.json userIgnoreFilters` 才生效
- obsidian CLI `files/folders/orphans` 命令**也不遵守** userIgnoreFilters（列全 vault 66k+ 檔）
- 實際 Obsidian indexed 檔數需 app 首次 open 後由 Graph view 節點數為準（預估 200-400 範圍）

### 2. 清點納入 = A（含 27-38d 全範圍）

**決策**：Stage 3 含 L1-L3 rule/skill 廣意化 + 清點全範圍，**不走** Plan C 聚焦版。

**理由**：
- 使用者醒來明示「最優方式」授權
- 清點 L1-L3 方法論 Round 5 已定稿（自動化 + LLM 輔助 + 人工審）
- 不清點會留長期技術債（rule 29 → 22 降 24% 收益可觀）

### 3. 覆蓋式同步策略（feat → main）

**決策**：
- `~/.claude/` 實作走 `feat/obsidian-vault` branch
- 允許 rebase / squash / force push **feat**
- **main frozen 不動**直至 Stage 4 完工 + 使用者實機驗收 Obsidian 可用
- 最終一次覆蓋式 force sync main to feat（不按 Stage 漸進）

**理由**：
- 使用者原話「merge 完全不重要，先用支線」
- 減少 Stage 間 rebase 成本 + 保留實驗空間
- main 是最終產品 snapshot，不是開發流程的記錄

### 4. Phase → Stage Rename（Round 6+ 生效不追溯）

**決策**：
- vault-layer3 內部用 Stage 0-4（避免與 ADR-003 Phase 1/2 衝突）
- ADR-003 內部仍用 Phase 1/2（不動）
- Round 1-5 歷史版本**不追溯** rename（保留歷史）

### 5. heartbeat 自動蒸餾 SRP 分層（Round 6 Q3 共識）

**決策**：三層分工，不混合 concern：

| 層 | 職責 | 元件 | Stage |
|---|------|------|:-----:|
| raw | 原始切片 | weekly-synthesis.js（擴展 trigger）| 2 |
| episodic | incident 記錄 | incident-capture.js（新）| 2 |
| semantic | LLM compile 摘要 | vault-semantic-distill.js（新，opus）| 4 |

**不動**：reflection-resolver.js 職責只標 resolved，不擴展寫 vault markdown。

---

## §對齊 2026 業界共識

本 vault-layer3 架構採 Karpathy LLM Wiki markdown-first 模式，參考：

- [Karpathy LLM Knowledge Base - VentureBeat](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an)
- [obsidian-wiki framework - Ar9av GitHub](https://github.com/Ar9av/obsidian-wiki)
- [Inside Karpathy's LLM Knowledge Base - techbuddies.io](https://www.techbuddies.io/2026/04/04/inside-karpathys-llm-knowledge-base-a-markdown-first-alternative-to-rag-for-autonomous-archives/)

### 6 Best Practices 對照 + Nova Gap

| # | Best Practice | Nova 對齊 | Gap 消化位置 |
|:-:|--------------|:---------:|-------------|
| 1 | raw/ dump upstream | ✅ | — |
| 2 | Web Clipper | ❌ | Stage 2（延後評估）|
| 3 | LLM linting scan | ✅ 部分 | Stage 3（補 new connections 偵測）|
| 4 | frontmatter summary + tags | ⚠️ 部分 | Stage 1（搬遷時統一）|
| 5 | Contamination Mitigation | ✅ 分層 | Stage 1（promotion gate 實作）|
| 6 | Markdown-first | ✅ | — |

### Nova vs 共識差異正當性

- **不做 Web Clipper**：Nova 不是個人知識管理，是 AI 元件 SoT。使用者需求未至即不做（YAGNI）。
- **不做 RAG**：使用者 no-DB 硬偏好（ADR-004 已 lock）。LLM compile 模式正合。
- **不自動改 CLAUDE.md / canonical rule**：LLM 幻覺風險高，保守人審 gate（ADR-004 rebuild 範圍限制）。

---

## §Contamination Promotion Gate（Stage 3 新 rule）

### Clean vs Messy Vault 分離

對齊 Obsidian co-creator 2026 共識：

> separate a clean personal vault from a "messy vault" used by agents, only promoting distilled insights into the trusted archive

Nova 實作映射：

| 層次 | 路徑 | 寫入權 | 可靠度 |
|------|------|:------:|:------:|
| messy | `~/.claude/obsidian/raw/` | AI 自動（weekly-synthesis / incident-capture） | 低（原料） |
| messy | `~/.claude/obsidian/working/` | AI + 使用者 | 中（工作區）|
| clean | `~/.claude/obsidian/semantic/` | **僅 promotion gate 通過才能寫** | 高（trusted archive）|

### Promotion Gate 實作（Stage 3 新元件）

**元件**：`scripts/vault-semantic-distill.js`（opus，月度 cron 或事件觸發）

**邏輯**：
1. 讀 raw/reflections/ + episodic/incidents/ 某主題 ≥ N 則
2. opus compile 成 semantic note 草稿
3. **不自動 commit semantic/**，寫到 `spec/討論/drafts/semantic-promotion-<topic>-<ts>.md`
4. Manager + nb peer review → 使用者簽核 → 才 promote 到 semantic/
5. 被 promote 的 raw/episodic 條目在 semantic note 留 backlink（可溯源）

**Gate 條件**（硬規則）：
- LLM 幻覺檢測：semantic 草稿所有陳述必可追溯回 raw/episodic 原料
- 使用者 non-negotiables 守門：semantic 不可含「修改使用者 product direction」建議
- 內容密度：semantic note 每段至少壓縮 3:1 來源

**風險**：
- opus API 成本（Stage 4 實作時評估）
- Manager review 負擔（預估每月 3-5 個 promotion candidates）

---

## §Stage 0-4 Scope 明細 + Gate 條件

### Stage 0（1 週）— ADR Revised 定稿 + Day 0 Obsidian 上線

**Scope**：
- ADR Revised draft → canonical（本檔）
- `scripts/sync-obsidian-ignore.js` 實作 + 跑一次同步（`.obsidianignore` → `app.json userIgnoreFilters`）
- 使用者 Runbook 切 vault B→A + 實機驗 **1 項**（Graph view 節點數）
- 三 CLAUDE.md §Related Blueprint 起草 + Stage 0 完工同日 3 commit
- frontmatter schema spec draft 完成

**Gate 條件**（通過 → Stage 1 自動啟動）：
- ADR Revised v3 draft Manager 驗收 PASS
- **CLI 代驗**（靜態配置）：
  - `jq '.userIgnoreFilters | length' ~/.claude/.obsidian/app.json` ≥ 28
  - `jq . ~/.claude/.obsidian/app.json` JSON valid
  - `bun ~/.claude/scripts/sync-obsidian-ignore.js` 跑一次無錯 + 輸出跟 app.json 一致
- **使用者實機驗 1 項**：open A vault 後 Graph view 節點數 < 6000（首次 index 時間不明示 SLO，體感慢可 rollback）
- 三 CLAUDE.md §Related Blueprint draft 存在 + 同日 3 commit 計畫

**Fail 路徑**：使用者 Graph view 節點數 ≥ 6000 → Round N 降 B 或補 userIgnoreFilters 再驗

### Stage 1（2-3 週）— 搬遷主力 + frontmatter 統一

**Scope**：
- 19 檔 rsync（`~/obsidian-vault/nova/` → `~/.claude/obsidian/`）
- docs 6 檔 搬入
- rules-background P0 5 條 寫入 `obsidian/semantic/rules-background/`
- Q 全域 README 補齊（7 個 README，Round 5 Q 定義）
- frontmatter schema 統一（Karpathy best practice #4）
- 三 CLAUDE.md §Related Blueprint commit canonical（Stage 0 draft 基礎）

**Gate 條件**：
- hash 驗證 SRC/DST 一致
- `~/obsidian-vault/nova/` rename 為 `nova.archived-YYYYMMDD/`
- bun test tests/unit/architecture.test.js 全綠
- 新 frontmatter schema 驗通過（新加 tests）

### Stage 2（2-3 週）— ref-link + heartbeat raw/episodic

**Scope**：
- `scripts/ref-link-linter.js` 新建（掃 markdown link 驗存在）
- `hooks/modules/vault-broken-link-warner.js` 新建（PreToolUse warn）
- `hooks/modules/incident-capture.js` 新建（PostToolUse 抓 error pattern 寫 episodic/）
- `weekly-synthesis.js` 擴展（加 2 trigger：reflections ≥ 20 / incident 標記）
- `hot.md` v0（主題熱度追蹤，未來蒸餾輸入）

**Gate 條件**：
- ref-link-linter 跑全 vault 0 broken（已 pre-fix）
- broken-link-warner 單元測試 pass
- incident-capture.js 能抓至少 1 真實 incident（dogfood）
- weekly-synthesis 新 trigger 至少觸發 1 次

### Stage 3（4-6 週）— 清點 L1-L3 + rule 廣意化

**Scope**：
- L1 自動化：embedding similarity + TF-IDF + 引用圖 hub 偵測（~2.5d）
- L2 LLM 判斷：g4-26b 批次產候選組（~3d）
- L3 人工 review：合併 4 組候選 29→22 rules（~6d，含 conflict 升級使用者）
- rule 廣意化執行 + architecture.test.js 擴展
- semantic-distill promotion gate rule 寫入 canonical

**Gate 條件**：
- rules 29→22 實際合併完成
- 所有合併後 rule 檔 ≤ 50 行
- 引用 rule 舊名的 skill/doc 全部同步更新（ref-link-linter 0 broken）
- architecture.test.js 新增「廣意 rule → 細節 reference 對應檔存在」驗證

### Stage 4（2-3 週）— Semantic Distill + 使用者驗收

**Scope**：
- `scripts/vault-semantic-distill.js` 新建（opus compile raw + episodic → semantic）
- 第一次 semantic promotion cycle（跑 3-5 個主題）
- Manager peer review promotion drafts
- 使用者實機驗收 Obsidian 可用（Graph view / backlink / 搜尋 / 跨目錄引用全部順）
- **Main sync**：`~/.claude/` feat/obsidian-vault force sync main（覆蓋式）

**Gate 條件**（最後一 Stage）：
- semantic-distill 至少 1 個 promotion 通過 Manager+nb peer review + 使用者簽核
- 使用者親自打開 Obsidian → 滿意 Graph view / backlink / 搜尋體驗
- 使用者下令 main sync
- force push main 成功 + 無 CI 斷鏈

**Post-Stage 4**：
- `~/obsidian-vault/` legacy 觀察 2 週後刪除（若無異常）
- ADR-001 v2 status = Accepted（正式 supersede v1）

### Stage 時程總表

| Stage | 工時 | Calendar |
|:-----:|:---:|:--------:|
| 0 | 1-2d | 1 週 |
| 1 | 6-8d | 2-3 週 |
| 2 | 5-7d | 2-3 週 |
| 3 | 9-13d | 4-6 週 |
| 4 | 5-8d | 2-3 週 |
| **合計** | **26-38d**（同 Round 5 選 A 27-38d 範圍）| **11-16 週** |

---

## §三 CLAUDE.md §Related Blueprint 整合方案

### 策略（xd-uszd ack）

- (a) Stage 0 ADR Revised 收進一併處理 — 本 ADR §Related Blueprint 列為 Stage 0 實作項
- (b) 各自起草（nm / nb 自己段，全域由 nb 維護）
- (c) small change 直接 commit，不升 ADR-007

### 三向引用 Schema

**全域 `~/.claude/CLAUDE.md` §Nova Blueprint**（已存，L49-76）新增 3 行：

```markdown
### Related Blueprint
- `~/projects/nova-manager/CLAUDE.md` §Related Blueprint（Manager scope self-description）
- `~/projects/nova-brain/CLAUDE.md` §Related Blueprint（nb scope self-description）
- Blueprint 變更須 cross-dispatch 其他兩方 ack 後才 commit
```

**nm `~/projects/nova-manager/CLAUDE.md` §Related Blueprint**（Manager 起草，draft 已存 `spec/討論/drafts/nm-CLAUDE.md-related-blueprint-section.md`）：

引用全域 Nova Blueprint + nb Blueprint 位置 + 自己 scope 限制。

**nb `~/projects/nova-brain/CLAUDE.md` §Related Blueprint**（nb 自起草，Stage 0 實作）：

引用全域 Nova Blueprint + nm Blueprint 位置 + 自己 L1-L4 開發 scope。

### Commit 順序（Stage 1）

- 同日同批 commit：nm commit nm/CLAUDE.md + nb commit nb/CLAUDE.md + nb commit 全域 CLAUDE.md
- 三 commit message 相互引用 commit hash（git log 可 trace 雙向）
- 不升 ADR-007（cross-reference 增補非架構決策）

---

## Cross-ADR 依賴圖（更新）

```
ADR-001 Revised v2 (本)
├── 依賴: ADR-003 (四能力閉環，Phase 1 已完成)
├── 依賴: ADR-005 (L1-L4 framework)
├── 依賴: ADR-006 (feedback loop Gap 1/2/3，Phase 2)
├── 依賴: ADR-004 (obs rebuild 限定範圍，與 Stage 4 semantic-distill 不衝突)
└── Stage 3 新增 rule: semantic-distill promotion gate
    └── 新 ADR-007? 否（只是 rule 補充，non-structural）

ADR-002 (wiki skill refactor)
└── 依賴: ADR-001 Revised v2 （vault_root + 分層確定後才能 refactor wiki skill）

ADR-obsidian-cli (未編號 ADR)
└── 依賴: ADR-001 Revised v2 vault_root 決策
```

### 舊 ADR-001 v1 supersede 語義

- v1 2026-04-17 Accepted（Plan C 聚焦 15-21d）— 保留歷史但標示 superseded
- v2 2026-04-18 Proposed（本 draft）→ 使用者 Runbook PASS + Manager 驗收 → Accepted canonical

---

## Consequences

### Positive

- 完整對齊 2026 業界共識（Karpathy LLM Wiki + Obsidian 分層）
- 清點納入避免長期技術債（rule 29→22）
- Stage 週期自驅減使用者互動次數（只在 Stage 4 驗收）
- Contamination promotion gate 硬規則防 LLM 幻覺污染 canonical
- feat → main 覆蓋式同步讓 nb 開發自由（rebase/squash 無顧慮）

### Negative / Trade-offs

- 26-38d 總工時 + 11-16 週 calendar（使用者接受「出門期間自驅」）
- Manager + nb 雙 session 工作負擔重（自驅策略減少使用者 overhead 轉嫁 session 協作）
- Stage 4 main sync 有風險（若覆蓋後發現嚴重問題難回退，需使用者親驗 sign-off）
- opus API 成本（Stage 4 semantic-distill，量視 promotion 頻率）

### Mitigation

- Stage 間 Gate 條件明確（fail 不 merge，降級另起 Round）
- feat branch 保留歷史 commits（即使 rebase 後 reflog 可回）
- `~/obsidian-vault/` legacy 觀察 2 週才刪（rollback 窗口）

---

## Alternatives Considered

### Alt 1 — 走 Plan C 聚焦 15-21d 不做清點

**拒絕**：使用者明示「最優方式」，清點避免長期技術債收益可觀（rule 29→22）。

### Alt 2 — 按 Stage 漸進 sync main（每 Stage 完 PR + merge）

**拒絕**：使用者明示「merge 完全不重要，先用支線」。Stage 間 rebase 成本高，覆蓋式最簡。

### Alt 3 — 引入 embedding 做 semantic distill

**拒絕**：使用者 no-DB 硬偏好（ADR-004 已 lock）。opus compile markdown-first 正合 Karpathy 模式。

### Alt 4 — 升 ADR-007 for 三 CLAUDE.md Blueprint 三向引用

**拒絕**：cross-reference 增補非架構決策（nb Round 6 §xd-t9on 立場 c），small change 直接 commit 即可。

### Alt 5 — Stage 4 main sync 後才跑 semantic-distill

**拒絕**：promotion gate 是 Stage 4 實作內容，先跑才能驗證 canonical 品質。main sync 是 Stage 4 最後一步，不是 prerequisite。

---

## 驗收條件（Stage 0 本 ADR Revised Draft）

- [ ] 本檔 8 必含段完整（Context / Decision / §對齊 2026 / §promotion gate / §Stage 0-4 scope / §三 CLAUDE.md / Cross-ADR / Consequences + Alternatives）
- [ ] Round 1-7 收斂 + 使用者 4 答全部引用
- [ ] Karpathy 研究 + Stage 0 inputs ack 引用
- [ ] 不 commit 至 canonical（`~/.claude/obsidian/semantic/architecture-decisions/`）
- [ ] 等 Stage 0 完工 dispatch（使用者 Runbook PASS 後）才搬 canonical + supersede v1

---

## 下一步（Stage 0 完工 trigger）

| 觸發 | 動作 | 負責 |
|-----|------|------|
| 使用者實機切 vault B→A + 驗 2 項 PASS | Manager dispatch Stage 0 完工 給 nb（canonical commit + v1 標 superseded）| Manager→nb |
| Stage 0 完工 PASS | Manager 自動派 Stage 1（搬遷主力 + Q README）| Manager→nb |
| Stage 4 完工 | Manager 發日報 → 使用者實機驗 → 下令 main sync | Manager→使用者 |

---

## Change Log

- 2026-04-17 v1 accepted by user (Round 3 簽核, xd-vhw3) — Plan C 聚焦 15-21d, 不含清點
- 2026-04-18 v2 proposed (intermediate draft) — Round 6-7 共識 + 使用者 4 答 + Karpathy 對齊
- 2026-04-18 v3 proposed (本 draft, xd-zsjd Round 2 after Manager 發現 Decision 1 證據錯誤) — 修正:
  - Decision 1 `.obsidianignore` 改 `app.json userIgnoreFilters`（Obsidian 官方機制）
  - 271 indexed md 數字刪除（find 模擬非 Obsidian 實際）
  - Stage 0 Gate 降 1 項使用者實機（CLI 代驗靜態配置 + Graph view 節點數 1 項）
  - 新增 `scripts/sync-obsidian-ignore.js` 為 Stage 0 scope + Gate 驗收項
- Pending: Stage 0 完工 dispatch 後 v3 accepted by user + v1/v2 標 superseded
