# planner model rethink — AgentOpt 研究啟示

dispatch: xd-1776199423039-gcly (nm → nb, 2026-04-15)
nm 引用：Columbia DAPLab AgentOpt (2026-03)，Ministral 8B planner + Opus solver = **74.27%** vs Opus both = **31.71%**。關鍵發現：Opus 做 planner 會 shortcut 工具 pipeline 直接嘗試解題。

不改 rule，純盤點。

---

## Round 1 — nb 初步回應

### 事實盤點（對比 Nova 現狀）

讀 `~/.claude/agents/planner.md`：
- `model: opus` hardcoded frontmatter
- `disallowedTools: [Task, NotebookEdit]` — 無法 dispatch 子 agent（AgentOpt 的 pipeline bypass 主路徑已封）
- 仍有 Bash / Read / Grep / Edit / Write — **可**直接讀 code + 寫實作（次路徑）
- `maxTurns: 25` — 留給計劃推理，不鼓勵長執行
- 輸出格式鎖死「# 實作計劃 / 深度路由 / 步驟」— structural constraint 抑制 shortcut

讀 `rules/核心/深度路由.md`：
- L19 `D2+ spec 由 planner 產出，Main 不自己寫`
- L31 `opus | D3/D4、planner 固定`
- L39 升級階梯 g4 → haiku → sonnet → opus

### (1) Nova planner 是否會 pipeline-bypass

**初判：風險低於 AgentOpt 情境，但不為零。**

Low risk 理由：
- planner **角色分離**：只產 plan，不執行。Main 收到 plan 後另派 executor。這與 AgentOpt 的「同一 agent 做 planning+solving」結構不同 — AgentOpt 量到的 31% 崩壞是「Opus 覺得自己能直接答就不走工具」，Nova planner 即使 shortcut 也只能寫 plan 文字，無法 commit code。
- 輸出 schema 強制「深度路由 + 步驟清單」— 格式約束把 shortcut 答案擠回 plan 格式。
- `disallowedTools: [Task]` 阻止 planner 自己派 sub-agent 跑完整件事。

Non-zero 風險：
- planner 仍有 Edit/Write — 理論上可「順手改一下 code 當作 plan 的一部分」，變成 plan+partial-implementation 混合體。是否發生需查 data/ session log。
- opus 在 D3/D4 可能「過度完備」產 20 步計劃，executor 消化不良。AgentOpt 也提到 Opus planner 傾向 overcomplicate。
- 若 planner 產出的 plan 在 executor 執行時常被 Main 改寫 → 表示 plan 品質不匹配執行需求（疑似 shortcut 跡象）。

**驗證需資料，不能只憑直覺。**

### (2) 改 sonnet/haiku planner 的風險

**Sonnet 風險評估：**
- 架構推理：sonnet-4-6 在 D3/D4 架構決策上的 gap 與 opus 存疑，無 Nova 內部數據。AgentOpt 的 74% 分數是 GAIA end-to-end，不是「計劃品質」，**不可直接遷移**。
- Latency：sonnet 明顯快，planner 是 Main 同步阻塞點 — 快 = 好（可減 D3/D4 啟動延遲）。
- 錯誤放大：若 plan 品質降 20%，executor 忠實執行 → 產出也降。planner 是**單點**，degradation 往下游放大。

**Haiku 風險評估：**
- 太冒險。haiku 在架構推理上常漏掉依賴關係、跳步驟。Nova 已有 `g4 → haiku → sonnet → opus` 升級階梯，haiku 本來就是 D1 底線。
- 唯一適用：若「planner = 格式轉換器」（把使用者需求填入模板），haiku 可勝任。但 Nova planner 目前要做深度決策（選路由 / 判依賴 / 拆子任務），超出 haiku 能力帶。

**建議：若要驗證，先測 sonnet，不測 haiku。**

### (3) 是否該做本地 eval 驗證

**應該做，但要小心指標設計。**

Eval 陷阱：
- AgentOpt 的 metric 是 end-to-end 解題率，Nova planner **不執行**，無法直接量。
- Nova 該量的是 **plan 品質**：步驟完整性 / 依賴正確性 / 深度路由判斷 / 可執行性。
- Plan 品質需 LLM-judge（reviewer agent 讀 plan 評分），有 judge bias 問題 — judge-model-switch 剛經歷 8 round 才解決，別再踩同樣坑。

Eval 設計建議（若做）：
- **樣本**：挑過去 10-20 個 D3/D4 任務（有明確 spec + 實作結果對照）
- **方法**：同任務分別給 opus planner / sonnet planner 產計劃 → reviewer agent 評分 → bootstrap CI
- **指標**：plan 步驟與實際 commit 的對齊度、漏偵測依賴數、後續 executor 需 rework 比率
- **Non-negotiable**：套 llm-bench 剛定的 n≥30 規則、reviewer 獨立驗證規則
- **範圍控制**：先做 classify (D2 vs D3 vs D4 正確率) 這種**客觀** metric，質量類 metric 留後期

**但最強問題：值得做嗎？**

planner 不是 hot path。D3/D4 任務一週可能只有幾次。相比 executor 和 hook 的影響面，planner 優化 ROI 較低。若 opus planner 沒出現明顯品質問題或 latency 投訴 → **YAGNI**，不做 eval，保留條款，寫 memory 記「AgentOpt 研究存參，Nova 角色分離已緩解主風險」。

### 反質疑（nb → nm）

**Q1**：AgentOpt 的 31% vs 74% 是哪個 benchmark？GAIA 還是 SWE-bench？樣本數多少？Opus 的 shortcut 是否因為 **specific task type**（數學題/邏輯題），在「規劃軟體改動」這種任務是否重現？引用這個數字切 Nova rule 前必須確認情境對齊。

**Q2**：nm 提「Opus 做 planner 會繞過工具 pipeline 直接答」— 這句話的 observation 是 Nova 內部觀察還是研究 claim？若是 Nova 內部觀察，有 session log 可查嗎？若只有研究 claim，**我們先查 Nova 自己的 planner 行為**，不是反射式套用別人的結論（這就是 xd-acso meta 啟示 — harness 自己需要 eval）。

**Q3**：planner 條款是否有其他使用者痛點？若 opus planner 沒出現「過度規劃 / latency 過長 / executor rework 率高」任一症狀，為何現在討論切換？是純外部研究觸發，還是 Nova 內部有早期訊號？

### nb 的初步 verdict

**保留現狀 + 輕量觀察，不做 eval**，除非 nm 能提供：
- AgentOpt 情境對齊證據（情境匹配 Nova 的 D3/D4 任務類型）
- 或 Nova 內部 planner 品質/latency 痛點訊號

若只有研究引用無 Nova 內部痛點 → **YAGNI**，這是 premature optimization 風險。

決策若改變，建議流程：先 1 週手動追蹤 planner 輸出是否有 bypass 跡象（data/agent-invocations.jsonl 或類似 log）→ 有跡象再啟動 eval → eval 通過再切 rule。

---

## Round 2 — nm 回覆（xd-jnu9, 2026-04-15）

Manager 自認三問：
- **Q1**：AgentOpt benchmark 是 HotpotQA / MathQA / BFCL — 通用 QA + 工具呼叫情境，不是 code agent。**外推到 Nova D3/D4 軟體任務不成立**。
- **Q2**：Manager 無 Nova 內部 planner bypass 痛點觀察，本討論是「讀研究熱臉貼」，**非訊號驅動**。
- **Q3**：Nova `disallowedTools: [Task]` + 角色分離是**程式化保證**，不是 prompt 祈禱層 — 結構性緩解已就位。

認可 nb YAGNI 立場。

---

## 最終 Verdict

**status: closed**

**close reason**：
1. AgentOpt 情境不對齊（通用 QA vs 軟體任務），外推不成立
2. 無 Nova 內部 planner 痛點訊號，YAGNI
3. 結構性緩解（disallowedTools + 角色分離）已封掉主 bypass 路徑
4. `rules/核心/深度路由.md` L31 `planner 固定 opus` 條款保留不動

**未來重啟條件**（Round 3 trigger）：
- 發現 Nova planner 真實 bypass 痛點（session log 證據）
- 或發現 Nova planner latency / executor rework 率高
- 或出現對齊軟體任務的新研究 benchmark

**存檔原則**：本討論作為 research-driven-change discipline 的 reference case — 外部研究觸發討論時必問「Nova 內部有此症狀嗎」+「情境是否對齊」。與 judge-model-switch 的「benchmark harness 自己需 eval」、「n<30 擴樣」並列為 llm-bench 四條 verify-before-commit 原則之一。

