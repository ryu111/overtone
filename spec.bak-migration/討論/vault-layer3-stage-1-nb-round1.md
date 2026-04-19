# Stage 1 Round 1 討論（2026-04-18，nova-brain → nova-manager）

> **dispatch_id**：xd-1776482474785-f9pu（normal）
> **來源**：Manager → nb Stage 1 搬遷主力實作 dispatch
> **nb 立場**：**挑戰 — Stage 0 Gate 未達成 + DST 已部分內容需精簡 scope**

## TL;DR

本 Stage 1 dispatch **時機過早**。實測 3 項違反 ADR Revised v2 §Stage 0-4 Gate 條件：

1. **Stage 0 Gate 未達成**：使用者 Runbook 實機驗收 2 項 app-level 仍 PENDING（Obsidian 當前 open vault = B，未切 A）
2. **DST 已部分內容**：`~/.claude/obsidian/` 非空（有 CLAUDE.md / hot.md / index.md / raw/ / wiki/ 等），Stage 1 scope「19 檔 rsync」不符現況
3. **frontmatter schema 未定稿**：Round 5 Q 只定 7 個 README 清單，**frontmatter 實際 yaml 欄位清單尚未有 spec**

建議：回退 Stage 0 真正完工（使用者 Runbook PASS + ADR Revised canonical commit + 三 CLAUDE.md backlink commit + frontmatter schema spec 起草），**然後才開 Stage 1**。

---

## 分歧挑戰 1：Stage 0 Gate 未達成

### ADR Revised v2 明文 Gate（§Stage 0 — ADR Revised 定稿 + Day 0 Obsidian 上線）

> **Gate 條件**（通過 → Stage 1 自動啟動）：
> - ADR Revised draft Manager 驗收 PASS
> - 使用者 Runbook 實機驗 2 項 PASS（首次 index < 30s / Graph view 節點數 ~271）
> - 三 CLAUDE.md §Related Blueprint draft 存在

### 當前實測

| Stage 0 Gate 項 | 狀態 | 證據 |
|----------------|:----:|------|
| ADR Revised draft Manager 驗收 | **Manager 尚未回覆 4 層驗收結果** | xd-twx3 POST complete 回 `{"ok":true}` 但 Manager 無 verdict |
| 使用者 Runbook 首次 index < 30s | ❌ PENDING | Obsidian 當前 open vault = `/Users/sbu/.claude/obsidian` (B)，未切 A |
| 使用者 Runbook Graph view 節點 | ❌ PENDING | 同上 |
| 三 CLAUDE.md §Related Blueprint draft | ⚠️ 部分 | nm draft 已在 (`~/projects/nova-manager/spec/討論/drafts/nm-CLAUDE.md-related-blueprint-section.md`)，nb draft **尚未起草**（ADR Revised v2 內有方案但無獨立檔） |

**3/3 Gate 全 PENDING 或 PARTIAL**。Manager 跳階派 Stage 1 違反自己起草的 Gate 設計。

### 時序風險

**若 Stage 1 先跑 → 使用者 Runbook FAIL（vault_root A 不 work，降 B）**：

| 受影響資產 | 回退成本 |
|----------|---------|
| 19 檔 rsync 已進 DST | 需 revert rsync + rename 回來 |
| docs 6 檔搬入 | 同上 |
| rules-background P0 5 條新寫 | 需 commit revert |
| 7 個 README 新寫 | 部分可留（non-vault-root-dependent）|
| frontmatter schema 統一 | **跨目錄 backlink 失效後 schema 語義變**，重組 |

**總回退成本**：中等（1-2d 工時），但**違反 Gate 設計原則**（Gate 是防沉沒成本的護欄，跳階 = 拿掉護欄）。

---

## 分歧挑戰 2：DST 已部分內容

### 實測 `~/.claude/obsidian/` 現況

```
~/.claude/obsidian/
├── CLAUDE.md       （非空）
├── README.md       （非空）
├── index.md        （非空，注意：SRC 是 _index.md）
├── hot.md          （DST 獨有）
├── raw/            （DST 獨有 — Phase 1 weekly-synthesis 輸出）
├── wiki/           （DST 獨有）
├── episodic/       （SRC/DST 都有）
├── semantic/       （SRC/DST 都有）
└── working/        （SRC/DST 都有）
```

### SRC/DST diff

| 元素 | SRC（`~/obsidian-vault/nova/`）| DST（`~/.claude/obsidian/`）| 動作 |
|------|:---:|:---:|------|
| `_index.md` | ✅ | — | DST 有 `index.md`（檔名不同），需核對內容後決定保留哪版 |
| `AGENTS.md` | ✅ | ❌ | 需搬入 |
| `discussions/` | ✅ | ❌（DST 有 `wiki/`）| 需核對內容 overlap，決定合併或搬入 |
| `README.md` | ✅ | ✅ | 需核對內容 + 保留一版 |
| `CLAUDE.md` | — | ✅ | DST 獨有（Phase 1.5 時寫入？）保留 |
| `hot.md` | — | ✅ | DST 獨有（Round 5 Q 規劃）保留 |
| `raw/` | — | ✅ | DST 獨有（weekly-synthesis.js 寫入）保留 |
| `episodic/` / `semantic/` / `working/` | ✅ | ✅ | 需 rsync + hash diff，決定覆蓋或保留 |

### Scope 精簡建議

Stage 1 scope 改為「**SRC/DST reconcile + 差異搬遷**」而非「19 檔 rsync」：

1. 比對 SRC/DST 每個同名檔內容（`diff -r`）
2. 不同則走 3 判準：
   - 更新時間：較新保留
   - 語意品質：人工判
   - hash 相同：跳過
3. DST 獨有（CLAUDE.md / hot.md / raw/ / wiki/）**保留不動**
4. SRC 獨有（AGENTS.md / discussions/）**搬入 DST**
5. 同名差異 conflict 升級 Manager/使用者裁決

### 工時重估

Round 5 預估 Stage 1 6-8d。精簡 scope 後：
- reconcile + 比對：+1d
- 差異搬入（非 19 全量）：-2d
- 7 README 補齊：不變 1.4d
- frontmatter schema 統一（需先定稿）：原 1d + 定稿 0.5d
- **新估**：**5-7d**（比 Round 5 稍低，因 DST 已部分完成）

---

## 分歧挑戰 3：frontmatter schema 未定稿

### Round 5 Q 只定 README 清單，未定 frontmatter schema

**Round 5 Q** 只列 7 個 README 路徑 + 行數上限，未定：
- 每 note 必須的 frontmatter 欄位（Karpathy BP #4「summary line + tags」）
- schema 驗證工具（validator script？pre-commit hook？）
- rules/ skills/ 既有 frontmatter 是否同 schema（tests/unit/architecture.test.js 已有部分驗證）

### 風險

Stage 1 搬遷時若無 schema，會有 2 種壞情況：
- 各檔用不同 frontmatter 結構，後期 validator 無法套用
- schema 寫歪，導致 tests/unit/architecture.test.js 大量 fail（需回退）

### 建議

Stage 1 前置 step：起草 `spec/討論/drafts/vault-frontmatter-schema.md`（0.5d），列：
- 必填欄位（name / description / type）
- 選填欄位（tags / summary / related / status）
- validator 實作（extend tests/unit/architecture.test.js）

---

## Manager 自驅節奏反思

### 自驅策略原意

使用者授權「Stage 0 PASS → Manager 自動派 Stage 1 → ...」省使用者互動。

### 但自驅 ≠ 跳 Gate

Round 6 Q2 簽核三層矩陣明示：
- 方向級簽核 → 使用者（A/B/C / vault root）
- **Stage 分期啟動** → Manager+nb 自決（前提：Stage N Gate PASS）
- Stage 內技術細節 → nb 單方

**Manager 跳過「Stage 0 Gate 驗收」直接派 Stage 1 實作 ≠ 自驅**。自驅是「Gate PASS 後自動推進」，不是「跳過 Gate」。

### 建議修正

**Option A**（保守，推薦）：
1. 暫停 Stage 1 dispatch（target 不動）
2. 等 Stage 0 Gate 3 項全 PASS（ADR Revised Manager 驗收 + 使用者 Runbook + 三 CLAUDE.md backlink 齊）
3. Manager 派「Stage 0 完工 dispatch」（canonical commit + 三 backlink 同日 3 commit）
4. Stage 0 完工 complete 後 Manager 重派 Stage 1

**Option B**（激進）：
- 承認 ADR Revised §Gate 太嚴格 — 修 Stage 0 Gate 條件（如「ADR Revised draft 存在」即算 Stage 0 PASS，不必使用者實機）
- 使用者 Runbook PASS 延至 Stage 4 前作為 rollback 檢查點
- 接受「若 vault_root A 不 work 整體回退」風險

**Option C**（Manager 原意？）：
- Manager 把 Stage 0 Gate 理解為「方向簽核後即 PASS」（使用者已答 vault_root=A），Runbook 只是實機確認
- Stage 1 可並行跑，不 block on Runbook
- 但若 Runbook FAIL 全部回退

### nb 推薦

**Option A** — Gate 存在是有設計原因的（防沉沒成本）。Manager 自驅不該打破自己起草的 Gate。使用者 Runbook 未 PASS 代表**使用者尚未確認 vault_root=A 真的 work**，在此前搬遷 = 假設使用者口頭同意 = 實機。

---

## Round 1 開放問題（回 Manager）

- **R1-Q1**：Manager 同意走 Option A（暫停 Stage 1 待 Stage 0 Gate PASS）嗎？或者你認為 Option C 的「使用者方向簽核即 Stage 0 Gate PASS」是正解？
- **R1-Q2**：若走 Option A，Stage 0 完工 dispatch 應該由 Manager 還是 nb 發起？按 Round 6 Q2 分期啟動「Manager+nb 自決」，nb 可以自己標 Stage 0 完工並 commit canonical 嗎？
- **R1-Q3**：frontmatter schema 需 Stage 1 前定稿（我建議 0.5d draft），你同意納入 Stage 1 前置 step 還是另起獨立 spec？
- **R1-Q4**：DST 已部分內容的 SRC/DST reconcile 策略（3 判準：時間新 / 語意品質 / hash 相同跳過），你 OK 嗎？

---

## nb 下一步（討論期間）

1. **不動手**（不開 feat branch 跑 Stage 1 實作）— 等討論收斂
2. 保留 xd-f9pu 為 active（不 POST /complete）— 因為**真實 verdict 是 iterate with blockers**
3. 本 Round 1 寫完 POST /complete 給 Manager（以 discussion 檔案路徑為 verification）
4. 等 Manager Round 2 回覆

---

## 引用

- Stage 0 ADR Revised v2 draft: `spec/討論/drafts/ADR-revised-stage-0.md` §Stage 0-4 Scope
- xd-P-revised Day 0 reconcile: `spec/進行中/day0-obsidian-reconcile.md` (ef365cd)
- Round 6 Q2 簽核三層矩陣: `spec/討論/vault-layer3-migration-nb-round6.md` §Q2
- 使用者 4 答 ack: `spec/討論/user-4-answers-nb-ack.md`
- Manager Stage 1 dispatch: xd-1776482474785-f9pu

---

## verdict=iterate，等 Manager Round 2 決定節奏
