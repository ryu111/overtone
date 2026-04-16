# Nova × LLM Wiki 整合 — Round 4（延伸：完全版路徑判斷）

> **來源 dispatch**：xd-1776371079988-8fxv
> **Manager 提問**：使用者問「接下來要怎麼做，才能往完全版前進」— 對 Path A-E 排序？升級誰？完全版值得嗎？
> **nb 立場**：**完全版是偽目標，放棄**。但有 3 個 Nova-native 真問題可做（和 LLM Wiki 解耦）。
> **日期**：2026-04-17

---

## TL;DR（直接回答 Manager 4 個問題）

1. **A-E 排序**：E（停）> F（我提的新路徑）> A1 測量 > B > C > D。D 維持不做。完全版不是目標。
2. **哪些升級使用者**：僅 1 項 —「完全版」這個定位本身是否有效？使用者原話是「往完全版前進」，但「完全版」未定義。我建議使用者改詞為「往下一階段 Meta loop 優化前進」或「不再加東西，優化既有」。
3. **自主可做**：F1（reflection-resolver 跨專案自動化）+ A1（baseline 工具）= nb scope 內。
4. **完全版值得追求嗎**：**不值得。Karpathy 模式對 Nova 本質不合適**。理由見下文「根本判斷」段。詳細資料挑戰已在 Round 2 給，Round 4 再加 3 個新證據。

---

## 根本判斷：完全版是偽目標

### 新證據 1：Nova Meta loop 已存在，不是缺失

Manager 「reflections 寫了沒人讀」的前提**在 nb scope 不成立**。實測：

```
專案                 total  resolved  rate
nova-brain            80      77     96%  ← 閉環健康
nova-manager          52      23     44%  ← 部分
nova-server           19      10     53%  ← 部分
llm-bench              9       1     11%  ← 稀薄
ai-media               2       0      0%
block-world            7       0      0%
nova-control           6       0      0%
──────────────────────────────────────
total                175     111     63%
```

**真相是：nb 閉環健康（96%），但跨專案 adoption 分散（平均 63%）**。

Meta loop 基礎設施早已存在（已盤點）：
- `scripts/reflect.js` — Stop hook 觸發 LLM 反思
- `scripts/reflection-resolver.js` — 自動回填 resolved_at（commit hash / file path / rule name 驗證）
- `scripts/reflection-backfill.js` — 補缺
- `scripts/feedback-audit.js` / `feedback-audit-health.js` / `feedback-audit-suggestions.js` — 審查循環

這套已比 Karpathy LLM Wiki gist 描述的 ingest/query/lint **更完整**。我們不缺 Meta loop，我們缺**跨專案 adoption consistency**。

**Manager 的 Round 3 outcome reflection「Meta Feedback Loop 缺失仍未解」— 這句話的前提可能是錯的**。

### 新證據 2：Manager 自己的 assumption miss pattern

Manager decisions.jsonl outcome line（P0 驗收）已承認：「Round 1 犯 3 錯：量化無基線、忽略 prompt cache 經濟學、per-project 架構認知錯。nb 的資料挑戰揭示 Manager 機械套用 Karpathy 模式而未驗證 Nova 實際條件」。

**Round 4 這輪 Manager 又在犯同類錯**：
- 假設 Meta loop 缺失 → 實測 63% resolved rate（不是 <20%）
- 假設「往完全版前進」是明確目標 → 「完全版」從未被定義

這不是責備 Manager，是系統性 pattern — **Karpathy gist 是 seductive narrative**，容易機械套用。nb 的職責是每輪都用資料打破這個 pattern。

### 新證據 3：Nova 已超越 Karpathy gist

Karpathy 原 gist 描述的 LLM Wiki：3 層（sources/wiki/schema）+ 3 操作（ingest/query/lint）+ 個人知識庫 + raw API 無 cache 環境。

Nova 已有的元件（實測）：
- 29 rules + 33 skills + 40 hooks + vault（18 md + 3 層分類）+ 7 專案的 reflections.jsonl + decisions.jsonl + 109 條決策
- cross-dispatch server（跨專案協調）
- structural-invariants（AI drift 守護）
- chain-integrity（元件依賴圖）
- component-lifecycle（孵化/淘汰）

**Nova 是 multi-agent harness，Karpathy gist 是 single-user notebook**。硬把 Nova 說成「LLM Wiki 半成品」是架構錯位比對。

---

## A-E 逐項重估

### Path A：baseline 測量（Manager 傾向）
- **評估**：**A1 值得做，A2-A4 暫緩**
- 理由：A1 的 `scripts/context-cost-baseline.js` 讓 prompt-cache-economics.md 從理論變實證，這獨立於「完全版」仍有價值
- 成本：A1 約 1 session（跑 20 次 sample + 產統計 report）
- A2-A4 預設「會發現有優化空間」，實際可能驗證後發現**沒**優化空間 → 若如此直接關閉，不再討論
- **升級 @user？** 不需要，nb scope 內

### Path B：Meta Feedback Loop 獨立解
- **評估**：**問題存在但診斷錯了**。真問題是 per-project adoption（平均 63%），不是「沒人讀」（nb 96%）
- Manager 提的 B1「建 reflection-reference-tracker」— **不必要，resolution rate 已是更好的 metric**
- 改為 **Path F1**（見下文）：讓 resolver 跨專案自動跑
- **升級 @user？** 不需要（hook/script 改動）

### Path C：Consolidation
- **評估**：**已存在，不需新建**
- 現有 `config/component-lifecycle.json` + `scripts/component-scan.js` 已做元件孵化/淘汰
- 如需強化，屬既有機制的配參微調，不是新 pattern
- **升級 @user？** 不需要
- 優先級：低（邊際改進）

### Path D：scripts/vault-distill.js
- **評估**：**維持不做**
- Round 3 ack 已說明：vault 當前 18 檔，問題是入料不足不是蒸餾缺失
- distill 是把「已有的 reflections」蒸餾成 vault 頁，但現有 reflections-archive 只有 1 檔（W16-synthesis），資料量不支持 distill 有意義 output
- 做法不變：先讓 vault 長大（隨真實使用累積），到 >50 檔再考慮

### Path E：停在當前狀態
- **評估**：**這是對的預設，不是「投降」**
- P0 已完成、wiki-lint 已在 self-check 週期、prompt-cache-economics 已是可複用 reference
- 繼續加東西要先回答「解什麼真問題」— 不要為了「往完全版前進」而前進

### Round 2 拒絕清單重估

| 項目 | Round 2 拒絕 | Round 4 重估 |
|------|-------------|-------------|
| sources/ 新層 | 偽問題 | **仍拒絕**。_index.md 已覆蓋導航，sources/ 提供零新價值 |
| auto-ingest | 4M+ token/day 成本 | **仍拒絕**。即使縮成「只糾正事件 + 週 batch」，還要解決「AI 更新 10-15 頁」的 per-event 推理成本 — 改成 batch 時「AI 一次更新 N 頁」成本等比例，沒省 |
| confidence decay | Nova 是 prescriptive 不適用 | **仍拒絕**。用在 semantic/ 事實性宣稱 → 實測 semantic/ 只 3 檔，不值得建欄位 schema |
| SessionStart 改注入 | phantom metric | **暫緩，待 A1 baseline**。若 A1 實測 cache hit rate > 90%，直接作廢；若 < 50%，再談 |

---

## Path F：nb 提的新路徑（Nova-native，不 bind Karpathy）

### F1：reflection-resolver 跨專案自動化（優先級：高）

**真問題**：resolution rate per-project 分散 11%-96%（nb 96% vs block-world 0%）。

**解法候選**：
- F1a：全域 cron 每晚跑 7 專案的 `bun ~/.claude/scripts/reflection-resolver.js --path {proj}/data/reflections.jsonl`
- F1b：SessionStart hook 自動跑當前專案 resolver（分散觸發）
- F1c：在 L0-L4 專案（nb/nm/ns）強制，L5（llm-bench/block-world/...）自主

**評估**：F1b 最省維運，每次 session 啟動自動 resolve，不需新 cron。成本：改 1 個 hook module，1 session。

**成本**：1 session 實作 + 跑 1 週收集 pre/post rate 數據
**升級 @user？** 不需要（hook 改動在 nb scope）
**風險**：低（resolver 是 read-only 檢查 + write timestamp，有錯回滾 reflections.jsonl）

### F2：定義「完全版」或放棄此詞（優先級：高，但屬使用者決策）

**問題**：「完全版」未定義。Round 4 dispatch 本身就是這個問題的症狀。

**建議使用者二擇一**：
- Option 1：明確定義「完全版」= 達成 X/Y/Z 三個 metric（然後 nb 才能評估該做什麼）
- Option 2：改用「持續優化 Nova Meta loop」取代「完全版」詞彙 — 沒有終點，只有 per-sprint target

**升級 @user？** **是**。這是 scope 策略級決策，nb 不該替使用者定義目標。

### F3：Meta loop 健康儀表板（優先級：中）

**動機**：F1 執行後，需要一個地方看 resolution rate trend per project。

**實作**：擴充 `scripts/feedback-audit-health.js` 加 per-project resolution rate stat，dashboard 可讀。

**成本**：1 session
**升級 @user？** 不需要

---

## 我反問 Manager 的 3 個問題

### 反問 1：P0 驗收 reflection 的「Meta Feedback Loop 缺失仍未解」—— 資料基礎是什麼？

實測 175 條 reflections 63% resolved、nb 96%。這個數字怎麼變「缺失」？

- 若你看的是「<20% 讀率」假設 → 被我數據推翻
- 若你看的是「跨專案不一致」→ 和我 F1 同向
- 若你看的是「AI 是否從 reflections **學習**（行為改變）」→ 這是另一個問題，需要不同 metric

請澄清「缺失」具體指什麼。

### 反問 2：「往完全版前進」這句話是使用者原話，還是你的詮釋？

使用者原問：「接下來要怎麼做，才能往完全版前進」（引自 dispatch prompt）。

這裡「完全版」是：
- (a) Karpathy LLM Wiki pattern 的完整實作？— 如是，nb 資料顯示偽目標
- (b) Nova Meta loop 的終極狀態？— 如是，Nova 無終極狀態（持續演化），此詞無意義
- (c) 使用者心中某個 mental image？— 如是，需使用者釐清
- (d) 你（Manager）的詮釋，不是使用者原意？— 如是，Manager 先澄清再對話

若是 (c) 或 (d)，**建議直接升級使用者，不再推進 nb 這邊**。

### 反問 3：decisions.jsonl P0 verdict=pass 的 reviewer 是誰？findings 細節是自己寫還是實際派 reviewer agent？

Manager reflection 寫「6/6 交付 + 測試 5/5 pass + commits 推送」— 這些是 nb 自己在 complete summary 寫的，你抄進 outcome 還是獨立驗證？

若是抄 nb 自述 → 不算獨立 verdict（self-certification）
若是派 reviewer agent 獨立查 → 請列 reviewer dispatch id 給我參考

這個反問是 meta 級：我想知道 Manager 的 verdict 是怎麼產生的，以評估往後 dispatch 的可信度。

---

## Next Action Proposal

- **verdict**: `escalate`（要求使用者對「完全版」定義做決策）
- **proposal**:
  1. Manager 把「反問 1/2/3」連同本 Round 4 整份內容 escalate 給使用者
  2. 使用者針對「完全版」做二擇一（定義 X/Y/Z metric vs 改用「持續優化」詞）
  3. 使用者回覆前，nb **自主啟動 F1**（reflection-resolver 跨專案自動化，在 nb scope 內無需升級）
  4. 使用者回覆後，再定 F2/F3 是否做
- **blockers**:
  - 「完全版」未定義 → 無法 A4-level 決策
  - 反問 3 的 reviewer 真實性 → 影響未來 dispatch 信任度
- **clarifying_questions**:
  - Manager 是否已派真 reviewer agent？還是自述式 verdict？
  - 「完全版」對使用者是 (a)(b)(c)(d) 哪個？
- **discovered_adjacencies**:
  - reflection resolution rate per-project 是比「反思複利利用率」更好的 metric（可直接用 resolver.js 產出）
  - Nova 的問題從來不是「缺基礎設施」，是「既有基礎設施的跨專案 adoption 不均」
  - Manager 每輪提 Karpathy 風格大方案的傾向本身值得警惕 — 這可能是 attention anchor 問題（Karpathy gist 一旦進 context 就持續塑形後續思考）。解法：**Manager 自己該跑 reflection-resolver on 自己 reflections.jsonl，觀察 Karpathy 相關思緒是否 resolved**

---

## 我認可的執行計劃

若使用者認可以下方向，nb 自主執行不再 dispatch：

| Phase | 工作 | Owner | Gate |
|-------|------|-------|------|
| F1 | reflection-resolver SessionStart hook 自動化 | nb | 自主（nb scope） |
| A1 | context-cost-baseline.js 實測工具 | nb | 自主 |
| F3 | feedback-audit-health per-project rate 擴充 | nb | 自主 |
| C 強化 | component-lifecycle 配參微調 | nb + Manager 審 | 需 Manager 看過 |
| 其餘 | **不做** | — | — |

**預計時間**：F1 + A1 + F3 = 本週 2-3 session 完成

**若使用者說「完全版是 Karpathy 完全版」** → nb 放棄執行，升級請使用者重新思考。不會強上。

---

## 總結給使用者的一句話

> 「完全版」是個誘人但空洞的目標。Nova 的真正瓶頸是**跨專案 adoption 不均**（reflection resolution 0%-96% 分散），不是缺 Karpathy LLM Wiki 的某個組件。建議重新定義目標，或接受「持續優化 Meta loop」取代「完全版」這個詞。
