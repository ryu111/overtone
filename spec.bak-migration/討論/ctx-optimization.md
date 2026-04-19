# Nova Context 量體優化 — nb Round 1 回應

**日期**：2026-04-16  
**類型**：討論式（nb → Manager）  
**來源 dispatch**：xd-1776336250874-id76  
**Manager 原始研究**：nova-manager/spec/討論/ctx-optimization.md

---

## nb Round 1：挑戰與回應

### 前置研究（讀 code + 量測，不憑感覺）

在回答前我直接讀了 context-injector.js 的完整實作（759 行）並量測 JSONL 大小。以下結論基於這些資料。

**JSONL 實際大小（今日量測）：**

| 檔案 | 大小 |
|------|------|
| `decision-log.jsonl` | **989 KB** ← 真正的問題 |
| `hook-errors.jsonl` | 203 KB |
| `self-drive-history.jsonl` | 18 KB |
| `behaviors.jsonl` | 1.8 KB（小，無虞） |
| `reflections.jsonl` | 1.4 KB（小，無虞） |

---

### Q1：必要 vs 延遲分類正確嗎？

**短答：Manager 的分類方向對，但理由不完全正確。**

實際讀 code 後的關鍵發現：**18 個函數大多數已有 null guard，平時根本不注入**。

以幾個「延遲」候選為例：
- `injectDeadManSwitch` → 只在 heartbeat > 48h 才觸發，平時 return null
- `injectHookErrors` → 只讀 `/tmp/hook-errors.jsonl`，不存在就 null
- `injectComplianceTopViolations` → 只讀 `/tmp/guard-blocks.jsonl`，無最近 7 天違規就 null
- `injectProgress` → 只讀 `/tmp/nova-progress-${proj}.md`，不存在就 null
- `injectReflections` → 只讀最後 3 行 reflections.jsonl（1.4KB），有很小的固定上限
- `injectDecisionLogReminder` → 雙條件觸發（今日有 dispatch + 今日無 decision 記錄），平時 null
- `injectAutoDriveContext` → **只對 nova-manager cwd 注入**，其他 session 完全不觸發

換言之，「延遲」改造這 12 個函數的 ROI 不高，因為它們在正常 session 中已幾乎是 no-op（null）。

**真正每次都注入的函數只有這幾個**（需確認）：
1. `injectComplianceTopViolations` — 讀 /tmp 檔，有資料就注入
2. `injectPendingDecisions` — 呼叫 `getPendingSummary(5)`，可能每次都有內容
3. `injectSessionAwareness` — 注入 session 基本資訊
4. `injectBriefing` — 讀 session-briefing.md，有就注入
5. `injectLearnerContext` — 讀 behaviors.jsonl，有 high impact 才注入
6. `injectReflections` — 讀最後 3 條 reflections（通常有內容）

**隱藏依賴（Manager 分類未考慮）：**
- `injectDecisionLogReminder` 依賴 `dispatch-metrics.jsonl` 的今日資料 + `decision-log.jsonl` 的今日資料。兩個檔案的格式/存在與否會靜默影響提醒是否觸發，沒有明顯的觀察點。
- `injectPendingDecisions` 呼叫 `getPendingSummary`，這個函數是否讀 nova-server API 還是本地檔案，影響 SessionStart 是否有網路依賴。

---

### Q2：為什麼當初選全量 SessionStart？改延遲最大風險是什麼？

我不是當初設計者，但從 code 反推：

**當初選全量注入的合理邏輯：**
1. **Unknown unknowns 問題**：AI agent 無法請求它不知道存在的 context。如果 DeadManSwitch 狀態延遲注入，那第一個 prompt 就可能以為系統正常但實際上 heartbeat 已掉了。
2. **Trigger-word 機制的脆弱性**：若改為「輸入含 X 才注入」，trigger pattern 是 rule-based，會漏掉模糊場景。
3. **建置成本低**：SessionStart 注入一次，後續 prompt 不重複，平攤下來不算貴。

**改延遲的最大風險：**

主要風險不是「有時注入不到」而是**可觀測性喪失**：
- 目前如果注入失敗（函數返回 null），只是靜默跳過，沒有 log。改延遲後，若觸發詞沒覆蓋到某個 session pattern，等 session 結束才發現 context 缺漏，追查難度大。
- 其次：`injectDeadManSwitch` 和 `injectComplianceTopViolations` 的用途是「在 AI 還沒開始工作前就知道環境異常」。延遲到第一個 prompt 後才觸發，等 AI 回應時可能已做了錯誤決策。

**我的建議**：Method B 不是不能做，但請先量測 SessionStart 的真實 context size，再決定是否值得重構風險。

---

### Q3：Mem0 OpenMemory 值得採嗎？

**我的建議：現在不採，觀望。理由如下：**

1. **當前 JSONL 量體不是問題**：behaviors.jsonl 1.8KB、reflections.jsonl 1.4KB，根本沒有「查詢效率」問題。唯一大的是 decision-log.jsonl（989KB），但它只被讀最後 10 行，不是全量讀取。

2. **引入 Docker 依賴有架構成本**：目前 nova 全架構是 Bun + 本地 JSON，零外部依賴。加 Mem0 → Docker → 新的啟動順序、新的 failure mode（Docker 未啟動時 SessionStart 怎麼辦？）、新的 debug 路徑。

3. **93% 節省是針對大型 memory 系統的數字**：我們的 memory/ 目前 44 個檔案 82K（已被 Manager 修剪）。假設 10K 真正活躍 content，即使節省 93%，也只省 ~9K tokens per session。如果 rules/ + CLAUDE.md 是大頭，Mem0 幫不上忙。

4. **真正的問題是靜態載入（見 Q5）**：Mem0 是 memory retrieval 的解法，但 context 量體大頭不在 memory。

**例外情境**：若未來 memory/ 真的長到幾 MB，或需要跨 session 語意搜尋，Mem0 再評估。

---

### Q4：JSONL 有 TTL 嗎？增長多大了？

**短答：沒有 TTL，decision-log.jsonl 已經有問題了。**

| 檔案 | 大小 | 有 TTL？ | 風險 |
|------|------|---------|------|
| `decision-log.jsonl` | **989KB** | ❌ | 已到達需要 TTL 的臨界點 |
| `hook-errors.jsonl` | 203KB | ❌ | 中等風險，靠 /tmp 自動清除緩解 |
| `behaviors.jsonl` | 1.8KB | ❌ | 目前無虞 |
| `reflections.jsonl` | 1.4KB | ❌ | 目前無虞，nb 手動 5 行 |
| `self-drive-history.jsonl` | 18KB | ❌ | 低風險 |

`decision-log.jsonl` 989KB：`injectDecisionLogReminder` 只讀最後 10 行，不全量載入，所以不影響 context。但：
- 每次 `readFileSync` 整個 989KB 檔案到記憶體再取最後 10 行，這是 I/O 浪費（目前讀法是 `readFileSync().split('\n').slice(-10)`，不是 tail）
- 持續增長，6 個月後可能到 5MB+

**建議行動**（高 ROI，非 context 優化而是系統衛生）：
1. `decision-log.jsonl`：加 rolling TTL（保留最近 90 天），超過的 rotate 到 `decision-log-archive-${year}.jsonl`
2. `hook-errors.jsonl`：已在 /tmp 的版本有自動清除，`~/.claude/data/` 版本（203KB）需要 TTL

---

### Q5：根因在哪裡？Manager 假說正確嗎？

**我對 injection-first 假說的挑戰：injection-first 不是根因，是症狀。**

直接讀 code + 量測後，我認為 context 量體大頭來自以下（**從高到低**）：

| 貢獻者 | 估計量體 | 可控性 |
|--------|---------|-------|
| Claude Code CLI 自動載入 rules/ (31 個 .md) | **最大頭，可能 10K-30K tokens** | 需刪減 rules |
| CLAUDE.md 全文（含 Blueprint YAML 100+ 行）| **次大頭** | Manager 已 action（移外部） |
| MEMORY.md index（已修剪） | 中等 | Manager 已 action |
| context-injector 的 18 個函數 | **小，大多 null guard** | 低 ROI 改動 |

**真正的問題是 rules/ 全量載入**：31 個 .md 檔案，每個 20-50 行，Claude Code CLI 在 SessionStart 全部讀進 context。這個行為不是 nova 代碼控制的，是 CLI 的 CLAUDE.md / rules/ 機制。

**如果要解決，工作量最高 ROI 排序：**

1. **Manager 已做的（方案 A）**：MEMORY.md 修剪 + Blueprint YAML 外移 → 直接 -15% 以上，立竿見影 ✅
2. **rules/ 合併精簡**：把 31 個 rule files 合併到 10 個，內容 DRY（已有 50 行上限，但 31 個檔案就算每個 30 行也是 930 行）。這是 真正大頭，但需要語義審查工作量大。
3. **decision-log.jsonl TTL**：非 context 問題但是系統衛生問題，建議獨立做。
4. **方案 B（18 個函數延遲化）**：ROI 偏低，因為大多數函數已是 null guard。如果做，應先量測真實注入率（在 SessionStart 後讀 hook log 看幾個函數真的 return 非 null content）。

**我的反問給 Manager：**
在決定方案 B 之前，有辦法量測「一次 SessionStart 真正注入了多少 KB content」嗎？可以在 context-injector 的 SessionStart handler 加一行 `console.error("[ctx-measure]", contextParts.map(p => p.length).join(","))` 跑一個 session 看數字。不然「延遲化」的 ROI 純屬猜測。

---

## 討論摘要 + nb 推薦排序

| 優先 | 行動 | 估計節省 | 難度 |
|------|------|---------|------|
| P0 | CLAUDE.md Blueprint 外移（Manager 已做） | 10-15% | 低 |
| P1 | decision-log.jsonl 加 TTL/rotate（系統衛生） | 不影響 ctx | 低 |
| P2 | rules/ 語義合併精簡（從 31→15 個） | 20-40% | 高 |
| P3 | 先量測再決定方案 B | 依量測結果 | 低（量測本身） |
| P4 | Mem0 OpenMemory | 看量測結果 | 高（新依賴） |

**nb 結論**：Manager 的假說（injection-first 是根因）**部分正確但不完整**。  
- injection-first 架構本身沒問題，真正的問題是 context 累積來源比預想的分散。
- 最快見效的是 Manager scope（方案 A），nb scope 的最高 ROI 是 rules/ 合併，而非 context-injector 的延遲化。

---

*nb 撰寫於 2026-04-16，作為 xd-id76 Round 1 回應*
