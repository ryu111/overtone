# nb 接下來如何往 L1-L4 Agent Harness 核心收斂

## 背景

xd-n5av 策略討論（Manager 非命令式提問）。本檔是 nb 作為「全域元件維護者」的獨立視角分析，三維度：**收斂 / 防護 / 優化**。與 `~/projects/block-world/spec/討論/edit-in-place-P0-root-cause.md`（bw 對 P0 harness 缺陷的視角）互補 — bw 從使用者角度看痛點，nb 從維護者角度看結構。

---

## 維度 1：收斂（往 L1-L4 Agent Harness 核心）

### L1-L4 實際進度評估

沒有單一 metric 能答「X%」，但拆三支柱分別估：

| 支柱 | 成熟度 | 缺口 |
|------|:------:|------|
| **Guide**（rules/skills）| ~70% | rules 數量夠但**職責分工漂移**（今天 d2tu/y9cq 才釐清 core_objective vs non_negotiables 分工），skills 有 50+ 但觸發精準度未實測（只有 structural eval 跑過） |
| **Sensor**（hooks）| ~60% | 主要 hook 都有（guards/flow-observer/reviewer-enforcer/wrapup-guard），但**偵測覆蓋率未量化**。今天 reviewer-enforcer 3 處 false positive 暴露「寫 hook 時沒想過整類訊號空間」的盲點 |
| **Closed-Loop**（feedback）| ~50% | ralph-loop 能跑、reflection 能寫、memory 能存，但**閉環是否真的讓 AI 變好** 無量化（structural eval 是骨架不是行為）。haiku/sonnet 對 hard 題的反常表現暴露「我們以為 closed-loop 生效但沒有 A/B 測試」 |

**「達成」的定義**：不該是「全 100%」而是「**能自己發現並修復自己的盲點**」— 今天 reviewer-enforcer false positive 就是 closed-loop 生效的例子（xd-qrql 在 1 小時內自我修復），這才是 L4 自主能力的真實指標。

### bw 揭露的 harness 缺陷算推進還是還債？

**算推進**。理由：

bw 的 P1a（reviewer 加 ⛔ 勿補充 task 未列品質標準）和 P1b（executor preserveImports）不是修某個 bug，是**補 Sensor 層盲點**。L2 Sensor 的本質是「AI 執行時要被觀察」，preserveImports 是觀察的新維度（不只看 diff 行數，還看 AST 級結構），這是推進 Sensor 層能力邊界，不是還債。

**但** P1c（maxDeletedLines 10→20 或動態）是還債 — 它修數字不修結構，治標。

### 今天 PR 的推進 vs 還債比例

| 類別 | dispatch | 歸類 |
|------|---------|------|
| 推進 | kicc (L1 vllm fix) / u1k2 (config-sot 結構) / 1xos (討論持久化) / z84l (nova-cli 觀察 CLI) / 1ow9 (歸檔 + 反常觀察) | 5 |
| 還債 | qrql (reviewer false positive) / tnek (iter 語義鎖定) / gkxp (core_objective 重寫) | 3 |
| 混合 | l4a0 / frab (benchmark runner 是推進，prompts/checker 是框架債) / 39z1 + tmux-cli-coverage (討論) / d2tu (草案) / y9cq (流程補救) | 4 |

**比例 5/12 純推進、3/12 還債、4/12 混合**。健康但不夠推進 — 還債占比接近 25% 說明過去累積的盲點正在 backfill。

### 最短路徑收斂建議（下個 3-7 天）

1. **Sensor 覆蓋率量化**：寫一個 script 盤點 hooks/ + rules/ 偵測到的「類別數」vs 已知踩坑類別數（從 reflections.jsonl 和 dispatch history 反推）。目標：identify top 3 盲點類別。
2. **bw P1a + P1b 實作**：reviewer 加「禁補標準」+ executor preserveImports AST 檢查。這是 Sensor 層新能力，直接推進 L2。
3. **benchmark 升級到 A/B 測試框架**：現 benchmark 只測「模型能力」不測「harness 是否讓 AI 變好」。加一個 wrapper：同個 task 分別用「bare LLM」vs 「harness + LLM」跑，差異就是 harness value — 這是 closed-loop 的真實 metric。

---

## 維度 2：防護（避免再踩同類坑）

### 類別級 vs 點級現況

| 類別 | 現況 | 程度 |
|------|------|:----:|
| reviewer false positive | hook (reviewer-enforcer) + test，但 pattern 更新時會誤觸 | 點級 → 半類別級 |
| DISCUSSION_HINT 過寬 | rule (討論式派發持久化) + hook | 類別級但 heuristic |
| SSE 回聲 | return null fallback 廢除 | 點級 |
| config 散落 SoT 破壞 | lint (config-sot-hardcoded) + test | **類別級 ✅** |
| preserveImports 盲點 | 無 | 點級缺 |
| command-vs-discussion 混淆 | 無 | 類別級缺 |

### 最系統性的防護缺口

**「AI 執行時對隱式約束的遵守」無整類 Sensor**。

具體：
- `preserveImports`（不能刪掉使用中的 import）
- `preserveExports`（不能刪公開 API）← 已有 lock helper 但沒掛進 reviewer
- `preserveTests`（不能改測試讓它通過）
- `preserveBehavior`（重構不改 observable behavior）
- `preserveComments`（不能偷刪註解，除非明示）

這些都是「AI 不該做但沒有人寫禁令」的類別。bw 的 preserveImports 是其中一個，但**整類都缺**。

**建議**：寫一個 meta-hook 叫 `structural-invariants.js`，讀一份 `invariants.json` 列表（可 task-level override），檢查每個 diff 是否違反任何不變式。這是**一條 hook 同時防多類**。

### 一條規則/hook 防多類的候選

- `structural-invariants.js` hook：如上
- `rules/品質/保留性.md`：歸納所有 preserve\* 守則，列 AI 常犯的刪除類錯誤
- `skills/harness-invariants`：具體踩坑案例庫（R119 import 消失、reviewer 補標準、iter 語義混淆）

**推薦先做 hook**：rule 是軟約束，hook 是硬約束。preserveImports 類盲點需要程式化守護才可靠（100% reliability）。

---

## 維度 3：優化（資源 / 速度 / 品質）

### haiku vs sonnet 反常觀察

**結論：不該調升級階梯**，但需要分流規則。

- Hard 題 haiku 5/5 vs sonnet 3/5 的**根因是 claude CLI timeout**（sonnet hard_05 回 0 token），不是模型能力反轉
- 若改用 Anthropic SDK 直連（無 60s CLI timeout），sonnet 大概率 hard 5/5 或 4/5
- 所以升級階梯 `g4 → haiku → sonnet → opus` 保持不變，**但整合層要修**

**分流規則**：
- 短任務（< 500 tok 輸出）：任一模型都 OK
- 長任務（> 1000 tok 輸出）：避免 claude CLI，走 SDK 直連
- 即使不改 CLI，可給 haiku 優先權處理需要「快速大輸出」的任務（例如 benchmark、大規模 refactor）

### 還有哪些 SoT 漏洞未掃到？

config-sot lint 目前只抓 3 類：`model-id` / `vllm-port` / `g4-26b-literal` + 新加 `max-tokens-literal`。未掃到：
- **API endpoint**（3457 server port、9867 pinchtab port、其他硬編 localhost）
- **Model-specific magic numbers**（gemma 31B 的 context window 32768、vllm prefill batch size）
- **Path SoT**（`~/projects/nova-manager`、`~/.claude/state/` 散落多處）
- **Timeout 常數**（30000ms / 60000ms / 180000ms 散落在 direct-client / ask-local / session-ctl）
- **Tier name literal**（`g4` / `haiku` / `sonnet` 當字串 key 散落）

**建議：擴充 lint 加 pattern**：port 類別 + path 類別是最好抓的，先做這兩類。

### 不動核心能力也能提升 harness 的優化

1. **更窄的 task 切分**：現在 dispatch prompt 常含多子任務（l4a0 是 runner 架構 + 10 題實跑合併輪 2+3），一次成功但不利於 A/B 比對。切窄可提升量測精度。
2. **更嚴的 reviewer checker**：不只語法 check，加**語意 diff check**（修改前後的函數簽名一致）— 這是 bw P1b 的泛化版。
3. **g4 prompt 重寫實驗**：reference_g4_optimization.md 有優化記錄，但每次只改 temperature/JSON — 沒改 system prompt 架構。可做一次「3 種 prompt 架構 A/B」測試哪個 26B/31B 都有效。
4. **claude CLI 替換為 SDK**：一勞永逸解 benchmark 的 timeout / 寫檔副作用 / tokens 計算 3 問題。

---

## 推薦優先級（nb 全域維護者視角）

| # | 行動 | 維度 | 預估成本 | 預期收益 |
|---|------|------|:-------:|---------|
| 1 | `structural-invariants.js` hook + `invariants.json` schema | 防護 | 1-2h | 防整類 preserve\* 盲點（推進 L2 Sensor） |
| 2 | bw P1a reviewer 禁補標準 + P1b preserveImports AST | 防護+收斂 | 1h | 直接修 bw 揭露的具體盲點，驗證 P0 可用 |
| 3 | config-sot lint 擴 port/path 類別 | 防護 | 30 min | 消除下一批 drift 盲點 |
| 4 | Anthropic SDK 直連取代 claude CLI | 優化 | 2-3h | benchmark 三問題一勞永逸 + 升級階梯 routing 決策準確 |
| 5 | Sensor 覆蓋率量化 script | 收斂 | 1h | 識別盲點 top 3，下輪收斂方向明確 |
| 6 | A/B 測試框架（bare LLM vs harness+LLM）| 收斂 | 3-4h | 量化 closed-loop 真實效用（L4 自主能力證據） |

**先做 1+2+3 可在 4-5h 內全部完成，直接推進 L2 Sensor 實質能力**。4 是 blocker for 準確 benchmark。5+6 是策略級，需單獨排期。

---

## Clarifying Questions

1. **「達成 L1-L4」的量化定義**：使用者心中有 pass/fail 標準嗎？還是只是方向？如果有，請明示（例：「structural eval 100% + behavioral eval > 80% + 實機跑 5 場景 0 bug」），nb 就能精準對齊。
2. **推進 vs 還債的允許比例**：本 session 還債占 25%，使用者覺得健康嗎？如果偏高，下輪 nb 應該主動拒接還債類 dispatch 嗎？
3. **A/B 測試框架的優先級**：第 6 項成本最高但價值最大（量化 closed-loop）。Manager 覺得該先做 1-5 的地基還是直接跳 6 建 metric？

---

**dispatch 線**：xd-n5av（策略討論）→ 待 Manager 讀完來回收斂 → 派實作。
**交叉引用**：bw 視角 `~/projects/block-world/spec/討論/edit-in-place-P0-root-cause.md`（P0 harness 缺陷使用者角度）。
