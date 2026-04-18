---
status: discussion-round-1
dispatch_id: xd-kwh2
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm peer discussion)
topic: nb 全記憶盤點 + 升級候選判斷（rules / skills / memory / duplicate）
judgment_basis: skills/component-classification/SKILL.md 決策樹
---

# nb Memory Audit — 升級候選盤點（Round 1）

## Context

使用者 2026-04-18 指示：「nb 檢查自身全記憶，那些應該是要歸類為全域 rule 跟 skill」

Manager dispatch xd-kwh2 要求盤點 nb 全部 memory，判斷哪些該升級到全域 rules/ 或 skills/。本檔為 Round 1 盤點 + 升級候選清單，判準依 `skills/component-classification/SKILL.md` 決策樹：

- 跨 session 通用 MUST/NEVER 行為規範 → **rules/**（L2，≤50 行）
- 領域知識 / 決策框架 / 操作手冊 → **skills/**（L3，不限）
- 純事實 / 個人偏好 / 單次事件 → **保留 memory**
- 已被現有 rule/skill 覆蓋 → **刪除 duplicate**

## Section A：Memory 總盤點（2026-04-18 實測）

### A-1. Auto-memory（`~/.claude/projects/-Users-sbu-projects-nova-brain/memory/`）— 7 檔

| # | 檔名 | Type | 大小 | 建立/修改 | 判斷分類 |
|---|------|------|------|-----------|---------|
| 1 | MEMORY.md | index | 62/80 行 | 2026-04-18 | 保留（升 MOC）|
| 2 | feedback_dispatch-commit-timing.md | feedback | 1.9 KB | 2026-04-17 | **升 rules/** |
| 3 | feedback_grep-followthrough.md | feedback | 1.8 KB | 2026-04-17 | **升 rules/ or skills/** |
| 4 | feedback_askuser-sparingly.md | feedback | 2.9 KB | 2026-04-18 | **升 rules/ 修訂** |
| 5 | project_L5願景.md | project | 849 B | 2026-03-28（21 天舊）| 評估升 skills/ |
| 6 | project_目標場景.md | project | 1.1 KB | 2026-03-28（21 天舊）| 合併 docs/目標場景.md |
| 7 | reference_pencil-dev.md | reference | 343 B | 2026-03-28 | **保留 memory** |

### A-2. Reflections（`~/projects/nova-brain/data/reflections.jsonl`）— 88 entries

分佈：83 autonomous / 5 correction（使用者糾正型寶貴）。5 條 correction 主題：

| # | ts | 主題 | 已升級？ |
|---|-----|------|---------|
| R1 | 2026-04-17 | ctx 歸 0 修 bug scope 不全（窮舉 consumer/source）| ❌ 未升級 |
| R2 | 2026-04-17 | HARD GATE 內化不足 + Domain 分類漏寫 | ✅ hook 守護 + rule 存在 |
| R3 | 2026-04-18 | AskUserQuestion 機械套用（Round 3 feedback）| ❌ feedback memory 已存但 rule 未修 |
| R4 | 2026-04-18 | scope owner 自決原則 + SessionStart trigger reject | ❌ 未升級 |
| R5 | 2026-04-18 | Stage 1.0-H Blueprint 外移（本 session） | ✅ 已 commit aa74334 |

### A-3. Decisions.jsonl — 不存在

`~/projects/nova-brain/data/decisions.jsonl` 不存在。若要啟用需先建立，但目前 decisions 經由 reflections.jsonl 的「行動」欄位承載，功能重疊。建議**不建 decisions.jsonl**（YAGNI），保持單一流水線。

### A-4. CLAUDE.md / docs/ 內 inline memory 片段

- `~/projects/nova-brain/CLAUDE.md` L121-L194 §Blueprint yaml — agent identity，討論見 `spec/討論/nb-to-nova-migration-prep.md`（xd-wksw），本檔不重複
- `~/projects/nova-brain/docs/目標場景.md` — 5 場景基準線 canonical（memory 第 6 條內容的 authoritative source）

### A-5. Manager Memory（參考引用）

`~/.claude/projects/-Users-sbu-projects-nova-manager/memory/` 有 30+ feedback_*.md，其中 `feedback_nb_naming_upgrade_to_n_nova.md` 是 nb 層級議題（naming 遷移討論）— 不在 nb 本次 audit scope，但遷移 spec（xd-wksw）會提。

## Section B：升級 rules/ 候選（3 條）

### B-1. dispatch-commit-timing → rules/協作/跨專案協作.md 補條款

**來源**：`feedback_dispatch-commit-timing.md`（xd-twsr 事件 2026-04-17）

**核心條款**（擬）：
```markdown
📋 MUST cross-dispatch complete 前先 git commit（含本次改動的檔案），summary 必含 commit hash 作為驗收錨點。
⛔ NEVER heredoc 寫檔後直接 POST /api/cross-dispatch/complete — 驗收方從 git HEAD 獨立驗跑會看不到 working tree uncommitted 改動，導致誤判虛報。
```

**理由**：
- 原檔明示「跨專案通用，建議 Manager 審查後升級到 rules/協作/跨專案協作.md 或獨立 rule 檔」
- 已有實際事故（xd-twsr）— ≥1 次真實 case，滿足 rule 升級門檻
- rules/協作/跨專案協作.md 已含 dispatch 協作條款，補 2 條 commit timing 條款自然

**預期行數增加**：rules/協作/跨專案協作.md 當前 24 行 → 26 行（仍遠 ≤50）

### B-2. grep-followthrough → rules/核心/失敗與修復.md 補條款 或 新 skill

**來源**：`feedback_grep-followthrough.md`（xd-fegd 事件 2026-04-17）

**選項 A（rule 補條款）**：rules/核心/失敗與修復.md 已有「動手前確認完整數據流」條款，補一條：
```markdown
📋 MUST 調查 writer/reader 對、斷鏈追蹤、bug 根因時，Grep 命中的每個檔案都要 Read；不得基於「檔名不像」跳讀。
⚠️ SHOULD Grep 命中 > 5 檔 → 用更精準 pattern 縮小（`writeFileSync.*X` 而非 `X`），不用「只看前幾個」掩飾跳讀。
```

**選項 B（新 skill）**：知識量足以撐起一個 `skills/investigation/SKILL.md`（grep / 調查方法論 / 反模式清單）。但目前只有 1 個反模式，YAGNI 應選 A。

**nb 意見**：**A（rule 補條款）**。未來若累積 3+ 反模式再升 skill。

### B-3. askuser-sparingly → rules/環境/總結格式.md 修訂 + CLAUDE.md §詢問紀律補例外

**來源**：`feedback_askuser-sparingly.md`（xd-y9rj Round 3 feedback 2026-04-18）+ reflection R3 + R4

**根因**：rules/環境/總結格式.md「/ask 流程」+ CLAUDE.md §詢問紀律「需要使用者選擇時用 AskUserQuestion」被組合解讀為「收尾必跑 /ask 必用 AskUserQuestion」，但「使用者選擇」本意是 user-facing 產品/不可逆決策。

**擬修訂**（兩處同步）：

rules/環境/總結格式.md 新增條款：
```markdown
📋 MUST 收尾「接下來的建議」分場景呈現：
  - 產品方向 / non-negotiable 變更 / 不可逆動作 → AskUserQuestion
  - 技術/流程/review 時機 → 直接列表格 + 推薦標記（⭐ 推薦 / ⚠️ 等條件），使用者有意見會直接說
⛔ NEVER 機械把所有「列選項」都走 AskUserQuestion — scope owner 該自決或 cross-dispatch Manager 討論的不拉使用者進 loop。
```

CLAUDE.md §詢問紀律 現有「⚠️ SHOULD『使用者選擇』指 user-facing UI 互動」已有例外意識（xd-00v5），但可強化為 📋 MUST 級 + 補「技術/流程 → scope owner 自決」明示例外。

**優先級**：**最高**。使用者已在 Round 3 feedback 明示，本 session reflection R3+R4 再次觸發（近期重複型反模式）。升級必要性 > 其他候選。

## Section C：升級 skills/ 候選（1 條 + 1 擱置）

### C-1. project_L5願景 → 評估是否升 skills/craft/SKILL.md 或新 skill

**來源**：`project_L5願景.md`（21 天舊 memory）

**內容**：L5 客製化產品的運作模式 — 專案隔離、PM 多輪詢問、自主建構、技能不污染全域。

**判斷**：
- ✅ 是領域知識（L5 產品架構原則）
- ✅ 跨 session 通用（任何 L5 產品啟動都適用）
- ⚠️ 但「21 天舊」+ Nova 目前在 L1-L4 階段（L5 未開始），急迫性低
- ❌ 不屬於 `skills/craft/SKILL.md`（craft 是設計品味，非 L5 架構）

**nb 意見**：**Round 2 討論後再定**。可能方向：
- A. 留 memory，等 L5 真正啟動時一次升 `skills/l5-architecture/SKILL.md`
- B. 立即升 `docs/L5-architecture.md`（nova-brain repo）作過渡階段 canonical
- C. 棄（22 天未更新，內容可能已偏）

**nb 傾向 A**（YAGNI — 等真需要時再升）

### C-2. ctx 歸 0 修 bug scope 不全（reflections R1）→ 擱置

**來源**：reflections.jsonl R1（2026-04-17）

**內容**：修 bug 要窮舉所有 consumer/source。

**判斷**：原則正確，但 rules/核心/失敗與修復.md 已有「修復前先診斷」「動手前確認完整數據流」條款覆蓋此精神。具體「窮舉 consumer」可補 1 行但現有條款精神相同。

**nb 意見**：**擱置**。若未來再犯第 2 次同錯，再補條款（依 rules/核心/失敗與修復.md「同錯犯第二次 → 升級防護」原則）。

## Section D：保留 memory 清單（2 條）

| # | 檔名 | 保留理由 |
|---|------|---------|
| D-1 | reference_pencil-dev.md | 純 reference（帳密），不可升級（不可硬編到 rules/skills） |
| D-2 | MEMORY.md | 索引本身，保留但升級為 MOC 形式（xd-wksw P3） |

## Section E：刪除 duplicate 清單（1 條）

### E-1. project_目標場景.md → 刪除（與 docs/目標場景.md 重疊）

**判斷**：
- `~/projects/nova-brain/docs/目標場景.md` 是 authoritative source（5 場景原始定義）
- memory `project_目標場景.md` 只是摘要
- MEMORY.md L55 已有 pointer `- [目標場景基準線](./project_目標場景.md) — 5 個端到端場景 + 棘觮原則`

**動作**：
1. 改 MEMORY.md pointer 指向 `~/projects/nova-brain/docs/目標場景.md`（canonical source）
2. 刪除 memory `project_目標場景.md`

**風險**：MEMORY.md 規則「上限 80 行」可能影響。目前 MEMORY.md 62/80 行，刪 1 pointer 後 61 行，OK。

## Section F：執行順序建議（Round 2 實作時）

依「影響最大 + 已有共識」優先，分 4 批：

### Batch 1（高優先，使用者已明示）

1. **B-3 askuser-sparingly**（rules/環境/總結格式.md + CLAUDE.md 修訂）
   - 使用者 Round 3 feedback 已明示
   - reflection R3+R4 近期重複觸發
   - 預估工時：30 分鐘

### Batch 2（通用，事故驅動）

2. **B-1 dispatch-commit-timing**（rules/協作/跨專案協作.md 補條款）
   - xd-twsr 事故已發生，rule 升級可直接執行
   - 預估工時：15 分鐘

3. **B-2 grep-followthrough**（rules/核心/失敗與修復.md 補條款）
   - xd-fegd 事故已發生
   - 預估工時：15 分鐘

### Batch 3（清理）

4. **E-1 project_目標場景 刪除 duplicate**
   - MEMORY.md pointer 更新 + memory 檔刪除
   - 預估工時：5 分鐘

### Batch 4（擱置觀察）

5. **C-1 L5願景** — 等 L5 真正啟動再升 skill
6. **C-2 ctx 窮舉** — 等第 2 次同錯再升條款
7. **MEMORY.md 升 MOC**（xd-wksw P3）— 遷移準備階段做

### 批次大小建議

- Batch 1 單獨 commit（使用者明示議題，變更明確）
- Batch 2 合 1 commit（2 條 rule 補條款，dispatch 事故驅動相關）
- Batch 3 單獨 commit（純清理，避免與 rule 改動混）

每 Batch 後跑 `bun test tests/unit/architecture.test.js`（rules 檔存在性測試）+ `bun tests/evals/eval-runner.js behavioral`（behavioral eval 驗 rule 執行）。

## Round 2 請求

### 給 nm 的問題（共 4 項）

1. **B-3 優先級**：同意 Batch 1 優先處理 askuser-sparingly 升級嗎？
2. **B-2 選型**：grep-followthrough 選 rule 補條款（A）還是新 skill（B）？nb 傾向 A（YAGNI）
3. **C-1 L5願景**：擱置 A / 過渡 B / 棄 C 三案，nm 意見？
4. **E-1 duplicate 刪除**：同意改 MEMORY.md pointer 指 docs/目標場景.md + 刪 memory 檔嗎？

### 給使用者的問題（Round 2 nm 無法決定時才問）

無。上述 4 項都是 scope owner / Manager 可決定的技術判斷，不需使用者介入。

## Referenced

- skills/component-classification/SKILL.md — 四層分類決策樹（判準依據）
- rules/核心/失敗與修復.md — 「同錯犯第二次 → 升級防護」原則
- rules/品質/元件孵化.md — age_grace_days 14 天保護期（新 rule 觀察期）
- nb memory MEMORY.md L41-L52 — Feedback 索引（本 audit 的起點）
- reflections.jsonl — 88 entries（5 correction + 83 autonomous）
- Manager memory feedback_nb_naming_upgrade_to_n_nova.md — 遷移議題（xd-wksw scope）
- spec/討論/nb-to-nova-migration-prep.md — xd-wksw Round 1（memory 搬遷策略）

## 討論持久化記錄

本檔由 nb 於 2026-04-18T11:30Z 起草，作為 xd-kwh2 Round 1 回覆。依 rules/協作/討論式派發持久化.md：Round 2+ 由 nm 新 cross-dispatch 發起，不用 complete summary 承載。
