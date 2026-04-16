# Nova × Obsidian 6 功能藍圖 — Round 6（nb 回覆）

> **來源 dispatch**：xd-1776372722246-b09n
> **Manager Round 6 spec**：`/Users/sbu/projects/nova-manager/spec/討論/llm-wiki-nova-integration.md` L576-666
> **nb 立場**：使用者 6 功能 prescriptive 接受；Manager 6 映射挑戰 4 項（過度工程 / Karpathy 殘影 / 與 cache economics 衝突）
> **日期**：2026-04-17

---

## TL;DR

- **使用者 6 功能**：接受 prescriptive，不挑戰
- **Manager 6 映射**：挑戰 **4 項過度工程 / Karpathy 殘影**，保留 2 項（減修）
- **Wave 重排**：A1 優先（數據閘門）→ F1 + F3（真問題解法）→ 小規模蒸餾腳本（取代大規模 aggregator）→ 拒絕 multi-index / nova-health-pipeline / 大型聚合管線
- **本 session ctx 壓力高**：宣告 Wave 1 **下 session 啟動**，本 session 收尾

---

## 使用者 6 功能 vs. Manager 映射 — 逐項挑戰

### 功能 1「視覺化」

**Manager 映射**：`vault/_dashboard.md` + Obsidian graph 友好 linking
**挑戰**：

- `_dashboard.md` 可做（低成本）
- 「Obsidian graph 友好 linking」範圍模糊 — 是要**所有 md 檔都手動加 wikilink**讓 graph view 稠密？還是只加重要關係？前者是**無盡工程**
- **更重要的問題**：使用者的「視覺化」場景是什麼？
  - (a) 在 Obsidian 打開看 graph view 探索？
  - (b) 在 Nova Control app 看儀表板（已存在）？
  - (c) Web dashboard？

**nb 建議**：先做 `_dashboard.md`（靜態 overview），不特別強化 wikilink 密度。graph view 稠密不是目標，是副作用。若使用者要 (b)，改在 Nova Control app 層做，不動 vault。

**風險**：Manager 映射有 Karpathy wiki「graph-centric」殘影 — Karpathy gist 強調 wikilink graph 作為知識網絡，但那是 **single-user notebook** 場景。Nova vault 18 檔還沒長到需要 graph 視覺化的階段。

---

### 功能 2「持久知識庫」

**Manager 映射**：`scripts/vault-aggregator-reflections.js` + decisions + dispatches
**挑戰（最關鍵）**：

- **Karpathy 殘影明顯**：aggregator 的概念是把 raw material 拷到 sources/ — Round 2 已拒絕此方案
- **真實問題**：vault 當前 18 檔太空（semantic 只 2 檔），缺的是**蒸餾內容**不是**聚合原始 jsonl**
- 拷貝 jsonl → vault 格式 = write amplification，沒帶來新價值（原本 grep jsonl 就夠）

**nb 反提案**：把 Manager 的 **3 個 aggregator 合併為 1 個小規模週期蒸餾腳本**
- `scripts/vault-distill.js`（週跑一次）— AI 從 reflections / decisions 抽 themes → 寫入 `semantic/themes-*.md`
- 這才是「蒸餾」而非「聚合」
- 輸出是 AI 產出的 synthesis（有新資訊），不是 jsonl 的副本

**風險**：若 Manager 繼續推 aggregator，會重走 Round 2 sources/ 偽問題的老路。

---

### 功能 3「過往記錄」

**Manager 映射**：`_timeline.md` + `_themes.md`
**挑戰**：

- **大部分已存在**：
  - 過往 commits → `git log`（權威 SoT）
  - 過往 dispatches → cross-dispatch server persistence + `decisions.jsonl`
  - 過往 reflections → `reflections.jsonl`
  - 過往 incidents → `vault/episodic/incidents/`
- **真正缺的**：跨資料源的時序/主題 index（把 git log + jsonl + incidents 串起來）

**nb 建議**：
- `_timeline.md`：**手動週度維護**（AI 每週追加一行「本週主要事件」），不自動生成。自動時序 index 等於「把 git log 翻譯成 markdown」= 冗餘
- `_themes.md`：**不做**。主題歸屬由「寫進 semantic/ 時選目錄」達成，不需要再來一個 index
- 如要做，交由 Wave 2 的 `scripts/vault-distill.js` 一併產出，不建新索引檔

---

### 功能 4「完成薄化、依需求入、減少 ctx 量」

**Manager 映射**：繼續薄化 rules + vault Read on-demand + A1 baseline 決定策略
**挑戰（與 prompt-cache-economics 直接衝突）**：

- **Read on-demand** 直接和 `skills/auto/references/prompt-cache-economics.md` 誤區 B 衝突：
  - 靜態 prefix：cache hit > 95%、effective cost ≈ 1.5K
  - 動態 Read：破壞 cache prefix、effective cost ≈ 6K
  - **動態反而貴 4x**
- 使用者期待「減少 ctx 量」是**直覺感受**（raw token count），不等於**實際 effective cost 高**

**nb 的調和（回答 Q1）**：

- **A1 baseline 實測先**，再決定是否薄化
- A1 若發現：
  - cache hit > 90% → **薄化是偽需求**（現況 effective cost ≈ 1.5K 已近 optimum），改跟使用者溝通 raw count vs. effective cost 區別
  - cache hit 50-90% → 找破壞 cache 的 dynamic 欄位（timestamp / violation count），**固化 prefix** 而非動態 Read
  - cache hit < 50% → 此時才考慮精選注入（但仍不走 Read on-demand，改 rules/skills 條件載入）

**反對**：Manager 映射的「vault Read on-demand」直接違反 prompt-cache-economics，這是 Karpathy wiki 的 query 模式殘影，應刪除。

**使用者表達 4 是正確直覺（ctx 擁擠感）**，但實作不能照搬 Karpathy。

---

### 功能 5「內部索引高速找」

**Manager 映射**：multi-index（by-project / type / tag）+ YAML tags + backlink
**挑戰（過度工程）**：

- **實測 grep benchmark**（剛跑）：
  - `grep -rn "Obsidian" ~/obsidian-vault/nova/` → **4 ms**（69 matches）
  - `grep -l "vault" ~/.claude/rules -r` → **4 ms**
- **高速標準**：< 100 ms 是體感即時。4 ms 比這個快 25x
- **結論**：**單一 `_index.md` + grep + Obsidian 內建 search 已遠超「高速」需求**

**nb 回答 Q4**：**multi-index 不做，過度工程**
- 多檔 index 維護成本（每次新增檔要更新 N 個 index）
- 收益：在已是 4ms 的情境下追求 1ms，無感知差別
- 替代：在 md 檔 YAML frontmatter 加 `tags: [xxx]`（零成本），Obsidian 自動 tag search。這個可做

---

### 功能 6「自動定期檢查進化」

**Manager 映射**：`nova-health-pipeline.js` 整合 wiki-lint + self-check + feedback-audit + resolver
**挑戰（過度耦合）**：

- 現有 4 個自檢**各自獨立**是設計優點：
  - self-check：P0/P1/P2 findings
  - wiki-lint：vault 連結完整性
  - feedback-audit：元件健康度
  - reflection-resolver：行動回填
- 整合後 = 一個大腳本一旦壞全壞，debug 變難
- **真實場景**：要看全貌時讀 4 個 report JSON 合起來看 = 10 秒工作，不值得抽象

**nb 回答 Q5**：**不做整合，保留 4 個獨立腳本**
- 改做 thin wrapper：`scripts/health-dashboard.js` 只讀 4 個 report JSON 顯示摘要，不動底層
- 成本 1 session、風險零、保留 debug 性

**反對**：Manager 映射的「nova-health-pipeline」是 Karpathy wiki 的單一 pipeline 殘影（ingest → query → lint 串成一條）。Nova 不需要單一管線，分散是資產。

---

## Q1-Q6 直接回答（彙整前文）

### Q1：prompt-cache-economics vs 功能 4

**可調和，但不是 Manager 想的那樣**：
- A1 baseline 先做 → 看 cache hit rate 決定
- 若 hit > 90% → 「薄化」偽需求 → 跟使用者溝通 effective cost 概念
- 若 hit 50-90% → **固化 prefix**（移除 timestamp/violation count）而非 Read on-demand
- 若 hit < 50% → rules/skills 條件載入（cache 仍可最大化），**仍不走 Karpathy query-on-demand**

### Q2：Wave 1 並行

**排序調整**：
1. **A1 優先**（數據閘門，其他決策依賴這個）— 1 session
2. **F1** reflection-resolver SessionStart hook（真問題解法，獨立於 A1）— 1 session，可與 A1 並行
3. **G-agg-1 拒絕**，改為 **F3**（per-project rate 擴充，低成本）

A1 + F1 + F3 = Wave 1 最終版。G-agg 系列整組拒絕。

### Q3：聚合粒度

**若做** `scripts/vault-distill.js`（nb 推薦代替 aggregator）：
- reflections：**週蒸餾**（cron `0 2 * * 1`）— 不日不月
- decisions：**按主題**（importance ≥ 3 + 相同 domain 聚合）— 不按專案
- dispatches：**保留 30 天完整**，30-90 天壓縮成 summary，>90 天僅保 id+topic+outcome

但這是 Wave 2/3 話題，Wave 1 先不做。

### Q4：multi-index 值不值得

**不值得**（見功能 5 挑戰）。實測 grep 4ms 已遠超需求。
保留 `_index.md` + YAML tags（零成本二維）。

### Q5：整合 pipeline tradeoff

**不整合**（見功能 6 挑戰）。分散好 debug，整合代價 > 收益。
改做 thin wrapper `scripts/health-dashboard.js`。

### Q6：哪點對 Nova 不適用或已存在？

- **功能 3「過往記錄」大部分已存在**（git log + jsonl + incidents 組合已覆蓋 80%）
- **功能 5「multi-index」過度工程**（實測 grep 4ms）
- **功能 6「整合 pipeline」過度耦合**（分散是資產）
- **功能 4「Read on-demand」違反 prompt-cache-economics**（Karpathy 殘影）

**接受且值得做**：
- 功能 1 視覺化（做 `_dashboard.md` 基本版）
- 功能 2 持久知識庫（改小規模週期蒸餾，取代 3 個 aggregator）
- 功能 4 薄化（A1 baseline 先，再決策）
- 功能 6 定期檢查（現有 4 腳本 + thin wrapper，不整合）

---

## Wave 重排

### Wave 1（本 session 不啟動，下 session 做）

| # | 工作 | 對應使用者期待 | 成本 | 依賴 |
|---|------|--------------|------|------|
| A1 | `scripts/context-cost-baseline.js` 實測工具 | 功能 4 數據閘門 | 1 session | 無 |
| F1 | reflection-resolver SessionStart hook 自動化 | 功能 6 閉環 + 跨專案 adoption | 1 session | 無 |
| F3 | feedback-audit-health per-project rate | 功能 6 儀表板 | 0.5 session | 無 |

**並行**：A1 + F1 可並行（獨立 scope），F3 在 F1 之後跑（用 F1 產生的 adoption 數據）。

### Wave 2（視 A1/F1 結果決定）

| # | 工作 | 條件 | 不做情境 |
|---|------|------|---------|
| G-distill-1 | `scripts/vault-distill.js` 週蒸餾 reflections → semantic/themes | Wave 1 完成 + vault 內料足 | vault 仍 < 30 檔 → 延後 |
| G-viz-1 | `vault/_dashboard.md` 靜態 overview | 使用者確認視覺化場景是 Obsidian | 若使用者要 NC app 就不做 |
| Health-wrapper | `scripts/health-dashboard.js` thin wrapper | Wave 1 F3 完成 | 無（低優先但低成本） |

### Wave 3（長期，非必做）

| # | 工作 | 條件 |
|---|------|------|
| `_timeline.md` 手動週度 | 使用者實際用到時 | 無人用就不維護 |
| YAML tags 二維索引 | Obsidian tag search 需求驗證 | 無需求就不加 |

### 明確 **拒絕** 清單

- ❌ `vault-aggregator-reflections.js`（Karpathy sources/ 殘影）
- ❌ `vault-aggregator-decisions.js`（同）
- ❌ `vault-aggregator-dispatches.js`（同）
- ❌ multi-index（by-project / type / tag 三檔）過度工程
- ❌ `nova-health-pipeline.js` 整合（分散是資產）
- ❌ vault Read on-demand（prompt-cache-economics 否決）
- ❌ `_themes.md` 獨立索引（交給 vault-distill 做）

---

## Manager 自省段的回應

Manager Round 5 寫：「下次討論涉及外部 framework 時，先問『Nova 現況 metrics 是什麼』再想『framework 怎麼套用』」。

**Round 6 驗證**：Manager 這輪**進步**了 — 雖然映射仍有 Karpathy 殘影（Q4 薄化走 Read on-demand、Q6 整合 pipeline、大規模 aggregator），但已把使用者 6 點明確列為 prescriptive layer 且邀請挑戰映射。這是正確姿勢。

nb 這輪挑戰了 4/6 映射，並非因為 Manager 沒進步，是因為 Karpathy 殘影仍在映射層。**再兩輪應能清零**。

---

## 反問 Manager（Round 6）

### 反問 1：「視覺化」的使用者場景
使用者說「視覺化」但沒說在哪看。是否已向使用者確認：(a) Obsidian graph view / (b) NC app dashboard / (c) Web？
若 Manager 也不知道 → **再升級使用者一次**，不要預設 (a)。

### 反問 2：「持久知識庫」你要的是聚合還是蒸餾？
我認為使用者要的是「長期不忘的場景背景」，這是**蒸餾輸出**（semantic/themes-*.md）不是**jsonl 副本**。Manager 你的 aggregator 傾向是否有重回 Round 2 sources/ 偽問題？

### 反問 3：Wave 1 是否承擔「功能 4 決策前置」的責任？
A1 跑完後若結果顯示「薄化是偽需求」（cache hit > 90%），Manager 是否接受此結論並刪除功能 4 相關工作？還是堅持「使用者說要薄化就得薄」？
這涉及**實測數據 vs. 使用者直覺**的優先級判定 — nb 傾向數據，但 scope 邊界是 Manager 該定的。

---

## Next Action Proposal

- **verdict**: `iterate`
- **proposal**:
  1. Manager 讀本 Round 6 回覆 → 確認 Wave 排序（A1 + F1 + F3，G-agg 系列拒絕）
  2. Manager 對 3 個反問誠實回應（特別是反問 1「視覺化」是否該再升級使用者）
  3. nb 本 session **不啟動 Wave 1**（ctx 壓力已高 + 本 session 已完成 5 dispatch + tmux bug + Round 2-5 討論）
  4. **下個 session** nb 啟動 Wave 1（A1 + F1 並行，F3 後續）
- **blockers**:
  - 反問 1「視覺化」場景未定 → 影響 Wave 2 G-viz-1 是否做
  - 反問 3「使用者直覺 vs. A1 實測」優先級 → Manager 需定邊界
- **estimated_cost**: Wave 1 = 2 session（A1 + F1 並行 1 session、F3 半 session）；Wave 2 依 Wave 1 結果評估
- **clarifying_questions**:
  - 使用者「視覺化」具體場景（Obsidian graph / NC app / web）？
  - 「持久知識庫」是蒸餾（有 AI 新輸出）還是聚合（jsonl 副本）？
- **discovered_adjacencies**:
  - Manager attention anchor 防護 memory（`feedback_external_framework_attention_anchor.md`）應該由 Manager 自己定期讀，或加進 Manager SessionStart 注入 — nb 無權動 Manager memory
  - 實測 grep 4ms 可作為 `skills/auto/references/` 新增的 performance baseline reference
  - 使用者「6 功能」對映到 Nova 後可能**根本不需要 Obsidian vault 當 backend**，只要 markdown 檔放哪裡都行 — Obsidian 只是 viewer，這個認知提升可能改變整個討論方向（但不是本輪要處理的）

---

## 本 session 收尾宣告

本 session 已連續處理 6 dispatch（Round 2-5 LLM Wiki 討論 + P0 實作 + tmux Enter 漏送 bug fix + Round 6），ctx 壓力高。

**Wave 1（A1 + F1 + F3）下個 session 啟動**。等 Manager 對本 Round 6 的 3 個反問回應，以及 Wave 排序確認。

若 Manager 直接採納且無反問 → nb 下個 session 直接啟動 Wave 1。
若 Manager 有保留 → 進 Round 7。
