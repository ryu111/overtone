# 跨元件交叉收斂盤點（xd-ex6w）

> 只討論不實作。每項需 Manager 同意後才派實作 dispatch。

## 現況盤點

| 類 | 數量 | 狀態 |
|----|-----:|------|
| rules | 21 | 全部 ≤50 行合規（最大 49）|
| skills | 36 | 孤兒 13 個（未被 agents skills[] 引用）|
| hooks/modules | 20 | 接線完整（架構測試守護）|
| commands | 4 | 2 薄包裝 + 2 實質邏輯 |

### 低分/斷鏈訊號

- **孤兒 skills (13)**：ask, auto-drive, config-sot, dispatch-lifecycle, executor-dispatch, harness-invariants, model-cascade, multi-tier-routing, nova-eval, onboard, pipeline-quality-gate, skill-judge, system-audit
- **孤兒 rules (1)**：`元件/AskUserQuestion全鏈路.md` — 無任何 skill/agent/hook 引用
- **Reflection hook 家族 4 個**：reflect-guard / reflection-counter / reflection-persist / reflection-resolver-check — 職責邊界模糊
- **Guard hook 家族 6 個**：guards / global-element-guard / task-dispatch-guard / summary-format-guard / verify-guard / wrapup-guard — 命名不一致（有些叫 guard 有些叫其他）

### 重疊 skill 組

1. `auto` vs `auto-drive` vs `dispatch-lifecycle` — 三層路由/派發決策
2. `feedback-loop` vs `self-evolution` — 回饋與元認知
3. `nova-test` vs `code-review` — 驗證維度
4. `thinking` vs `debugging` — 問題求解
5. `nova-spec` vs `nova-pm` — 規格與需求

## Top 8 收斂優先序清單

---

### #1 可程式化 rule 轉 hook — 3 次失敗計數

- **現況**：`rules/核心/失敗與修復.md:9` 條款 `同一方法連續失敗 3 次 → 停止 → 回滾 → 換方法`。目前靠 AI 自覺遵守，無程式化守護。
- **提案**：新 `hooks/modules/failure-counter.js` PostToolUse 監聽 tool error，以 `{tool_name, target_file}` 為 key 計數，第 3 次回 block + systemMessage 要求回滾或換方法。
- **成本**：~1.5h（hook + unit test + 接線 + 架構測試）
- **Harness 貢獻**：Sensor 層補強。目前失敗偵測靠 AI 判斷，hook 化後進入 100% 可靠度區。
- **風險**：false positive — 不同 tool 錯誤可能被誤聚合。state key 設計需精準。
- **自審反對意見**：
  - 「rule 已存在就夠了」→ 反駁：本 session 實測 ralph-loop replay 過失敗 dispatch 多輪未觸發 STOP，證明規則不足。
  - 「counter 太硬」→ 反駁：已有 reviewer-enforcer block_count 降級為 warn 的 fail-open pattern 可複用。

---

### #2 孤兒 skill 大清理 — 13 個

- **現況**：13 個 skill 未被任何 agent skills[] 引用。可能是（a）純 Main Agent 自主讀取（b）真孤兒（c）應該升格成 command。
- **提案**：逐一分類：
  - (a) 保留但在 SKILL.md frontmatter 明示 `disable-model-invocation: false` 讓 Main 主動查
  - (b) 移除（harness-invariants/pipeline-quality-gate 可能屬此類）
  - (c) 升格 command（audit/system-audit 重複，可合併）
- **成本**：~2h 盤點 + ~1h 執行（僅 delete 或 frontmatter 改）
- **Harness 貢獻**：Guide 層瘦身，降低元件膨脹速率（元件治理核心問題）。
- **風險**：誤刪正在被 Main Agent 自主讀取的 skill。
- **自審反對意見**：
  - 「這 13 個都是工具層本來就不在 agent 裡」→ 反駁：工具層應升格 command 或明示保留理由，孤兒狀態模糊有害。
  - 「可能下週會用到」→ 反駁：YAGNI，有需要再新建成本 < 保留死元件成本。

---

### #3 reflection 4 hook 合併 — 職責釐清

- **現況**：reflect-guard / reflection-counter / reflection-persist / reflection-resolver-check 4 個 hook。SRP 上合理但命名不一致、事件時機重疊。
- **提案**：
  - 讀每個 on= key，畫職責矩陣（誰管 Stop、誰管 UserPrompt、誰管 timeline emit）
  - 合併 `counter` + `persist` 為單一 `reflection-state.js`（counter 就是 persist 的投影）
  - `guard` + `resolver-check` 保持獨立（前者阻擋、後者驗證）
  - 最終從 4 → 2-3 個
- **成本**：~2.5h（讀 4 檔 + 重構 + 測試遷移 + 接線更新）
- **Harness 貢獻**：Closed-Loop 層清晰化。反思迴圈是 L4 核心，hook 職責亂 = 迴圈不可診斷。
- **風險**：中等 — reflection 已是高頻觸發路徑，重構可能引入 regression。需逐 hook 保留現有測試。
- **自審反對意見**：
  - 「不壞不修」→ 反駁：4 個命名不一致已是 debt 訊號，新人（含下個 session）無法快速理解。
  - 「合併後檔案變大」→ 反駁：counter+persist 實質是 state 管理雙面，合併後 LOC 可能不增反減。

---

### #4 `auto` vs `auto-drive` vs `dispatch-lifecycle` 三重 skill 收斂

- **現況**：3 個 skill 都談路由/派發/自動化，邊界模糊。`auto` 是路由決策、`auto-drive` 是自驅迴圈、`dispatch-lifecycle` 是派發生命週期。
- **提案**：
  - 保留 `auto` 為頂層入口（決策樹 + 調度矩陣）
  - `auto-drive` 改名 `self-drive` 並聚焦「ralph-loop/stop-recovery」機制
  - `dispatch-lifecycle` 併入 `cross-session`（都是跨 session 協作）
  - 從 3 → 2 skill
- **成本**：~1.5h（讀 3 檔 + 判斷合併 + 改 agent skills[] 引用）
- **Harness 貢獻**：Guide 層清晰化。新人最容易迷失在「這 3 個到底差在哪」。
- **風險**：skills[] 引用漂移 — 需 grep 所有 agents/*.md 更新。
- **自審反對意見**：
  - 「分三個是因為顆粒度」→ 反駁：顆粒度應用 references/ 子檔達成，不是開新 skill。

---

### #5 可程式化 rule 轉 hook — 結構驗證 commit 前守護

- **現況**：`rules/品質/完成與閉環.md:37` 條款 `修改全域元件後跑 bun tests/evals/structural/check.js 8/8 通過`。目前靠 AI 自覺。
- **提案**：新 `hooks/modules/structural-check-guard.js` 偵測 `~/.claude/` 下 commit 前（PreToolUse:Bash 含 `git commit`），若有改動未跑結構驗證，block。
- **成本**：~1h
- **Harness 貢獻**：Closed-Loop 層補強。結構驗證是閉環最後一關。
- **風險**：低 — 與既有 `global-element-guard.js` 職責相鄰，可能合併。
- **自審反對意見**：
  - 「慢」→ 反駁：結構驗證 ~2s，可接受。
  - 「和 global-element-guard 重疊」→ 反駁：前者管修改權限，後者管修改後驗證，不重複。

---

### #6 commands 精簡 — `audit` 與 `system-audit` 合併

- **現況**：`commands/audit.md` (25 行) 呼叫 `system-audit` skill。兩者功能一對一。
- **提案**：刪除 command，留 skill。使用者改叫 `/skill system-audit` 或 Main Agent 自主觸發。或反之：刪 skill 留 command。
- **成本**：~20 min
- **Harness 貢獻**：元件數量 -1，降低選擇成本。
- **風險**：低。
- **自審反對意見**：
  - 「command 是使用者入口，skill 是 AI 入口，兩者不衝突」→ **此反對成立**。若保留應明示分工並在雙方 frontmatter 互指。重新評估後降為 P8。

---

### #7 `feedback-loop` vs `self-evolution` skill 合併

- **現況**：兩者都談反饋/元認知/進化。`feedback-loop` 是協定（protocols.md），`self-evolution` 是方法論。
- **提案**：`self-evolution` 作為 `feedback-loop/references/self-evolution.md` 子章節。
- **成本**：~40 min
- **Harness 貢獻**：Closed-Loop 層收斂為單一入口。
- **風險**：低 — 若 `self-evolution` 已被 agents 引用需更新。
- **自審反對意見**：
  - 「分兩個方便分別載入」→ 反駁：sub-reference 同樣可分別載入（via references/）。

---

### #8 孤兒 rule `AskUserQuestion全鏈路.md` 定位

- **現況**：唯一孤兒 rule。內容是 AskUserQuestion 的踩坑記錄 + 防護規則。無任何引用。
- **提案**：移入 `hooks/modules/` 的 `AskUserQuestion-chain.js` 做為 inline doc 或移入 `skills/claude-dev/references/askuserquestion-chain.md`。Rule 留一行指向。
- **成本**：~30 min
- **Harness 貢獻**：rule 層聚焦行為規範，技術記錄下沉到 reference。
- **風險**：極低 — 內容不動，只換位置。
- **自審反對意見**：
  - 「rule 就是放這種的」→ 反駁：rule 應是「何時該做什麼」不是「歷史記錄」。後者屬 reference。

---

## 建議執行順序

第一批（高 ROI / 低風險）：#1 failure-counter、#5 structural-check-guard、#8 AskUserQuestion 定位
第二批（需審慎盤點）：#2 孤兒 skill 清理、#6/#7 skill 合併
第三批（高影響面）：#3 reflection hook 重構、#4 三重 skill 收斂

## Clarifying Questions 給 Manager

1. 孤兒 skill 13 個是否一次全審還是批次？（批次更穩但拖時間）
2. Failure counter 觸發後該 block 還是 warn + 降級？（參考 reviewer-enforcer pattern）
3. Reflection hook 重構敢不敢進？這是最高 ROI 也最高風險項。
4. Harness 三支柱（Guide/Sensor/Closed-Loop）是否正式列入 CLAUDE.md core_objective？目前是隱喻，未形式化。

---

**next_action_proposal**：verdict=iterate，proposal=先討論 #1 failure-counter 是否同意派實作（最高 ROI + 最低風險 + 可驗證）。

---

## 討論輪 2（xd-v4oe 回覆）

Manager 以質疑者身份提出三個挑戰。以下是 target 作為決策者的反駁。

### 回應質疑 1：根因是流程未形式化？

**部分同意，但你只看到半個根因。**

你的觀察（Harness 三支柱零條款）正確，但把它當成**唯一**根因太淺。真正的根因有兩層：

1. **表層**：Harness 三支柱未形式化 → 新元件不知歸類 → 孤兒/命名漂移（你的觀察）
2. **深層**：Feedback loop 缺「淘汰腿」→ 即使形式化歸類，低分元件沒有自動退場機制 → 孤兒仍累積

證據：
- skills/ 有 `skill-judge` 但沒有 `skill-judge 評分低於 X → 退場` 的鎖定規則
- rules/ 有「元件治理」談增加但不談刪減
- `rules/品質/完成與閉環.md` 談「提交讓評分下降的變更」但沒談「現存低分元件要刪」

**反駁你的提案**：光新建 `rules/核心/agent-harness.md` 是治標 — 新元件會歸類但舊元件不會自動消失。**治本是補 feedback loop 的淘汰腿**，具體為：

- 新 rule `rules/品質/元件淘汰.md`（~30 行）：明示「skill 分數 <60 且 30 天無引用 → 移至 `.claude/deprecated/`」
- 配合 hook `hooks/modules/component-lifecycle.js`（週級觸發）：掃描引用圖 + skill-judge 分數，列淘汰候選
- 這才是 Closed-Loop 支柱的完成式

**不擴展 component-classification skill** — 那是知識庫不是規範。rule 管「必須」，skill 管「怎麼」，不能混。

**我的版本**：新建 2 個 rule（`agent-harness.md` + `元件淘汰.md`）+ 1 個 hook（`component-lifecycle.js`）。這是一個**三元件套件**而不是單一改動，因為 Harness 形式化（靜態分類）必須配合淘汰機制（動態退場）才治本。

---

### 回應質疑 2：failure-counter key 設計

**你和我都錯了，但你更錯。**

- 我原本的 `{tool_name, target_file}` 確實會誤觸 — 承認
- 你提的 `{tool_name, intent_hash}` 也錯 — intent 不是正確的軸

**真正的軸是 error signature，不是 intent。**

3 次失敗 STOP 的精神是「**同一錯誤模式重複**」，不是「同一意圖失敗」。同一意圖但每次都是不同的 error（第 1 次 syntax、第 2 次 type、第 3 次 import missing）其實是「逐步逼近」不是「卡住」，不該 STOP。反之同一 error 訊息重複 3 次才是真正的死循環。

**修正 key**：`{tool_name, error_signature}`，其中 `error_signature` = 從 error message 抽「錯誤類別 + 關鍵字 normalized」做 hash。範例：
- `Edit` tool + `String to replace not found` → sig=`edit:no-match`
- `Bash` + `command not found: X` → sig=`bash:cmd-not-found:X`
- `Bash` + `test failed: tests/foo.test.js` → sig=`bash:test-fail:tests/foo.test.js`

同 sig 3 次 → STOP。不同 sig 即使同一檔案也不計數。

這才符合 `rules/核心/失敗與修復.md:9` 的原文「同一方法連續失敗」— 「方法」= 錯誤模式，不是工具意圖。

---

### 回應質疑 3：第一批執行順序

**你部分正確，但結論錯。**

正確的：#8 ROI 確實低。
錯誤的：不該換成 #7。

- #7 `feedback-loop/self-evolution` 合併需先 grep `self-evolution` 在 agents/skills/rules 的引用（潛在漂移點多），成本被低估，不適合第一批「零風險」位置
- #8 雖 ROI 低但**零風險 + 可與 #1 並行**（不動程式碼只搬文字），不佔 session slot

**我的修正版第一批**：#1（failure-counter）+ #5（structural-check-guard）。只 2 項。
- #8 移到「任何 session 有 30 分鐘空檔就做」不排序
- #7 進第二批（需先盤點引用）
- #2（孤兒 skill 清理）保持第二批但拆成 13 個獨立 task，逐個審不批量刪

原因：第一批應該是「高信心 + 高 ROI」組合，#5 結構驗證守護和 #1 失敗計數都是新增 hook、與既有元件零耦合、可獨立上線。#8 和 #7 都涉及既有引用變動，歸在第一批稀釋了「高信心」標準。

---

### 我的最終決定

1. **新發現 P0（源於質疑 1 的深挖）**：#0 元件淘汰三件套（`agent-harness.md` rule + `元件淘汰.md` rule + `component-lifecycle.js` hook）。這是治本項，比原清單任何一項都重要。成本 ~3h，風險中（新 hook 週級觸發需 observability）。
2. **第一批（零耦合 hook）**：#1 failure-counter（key 改 error_signature） + #5 structural-check-guard。
3. **#0 與第一批的關係**：#0 是架構前提，第一批是戰術填補。可並行派實作不衝突（分別 dispatch 不同 session 或串行派都行）。

### 給 Manager 的新質疑（反向）

1. 你同意「治本需要元件淘汰腿」這個判斷嗎？還是覺得我在過度設計？
2. 元件淘汰的門檻（60 分 / 30 天無引用）是否太嚴或太鬆？需要實測校準。
3. #0 三件套要不要一次派還是拆兩輪（先 rule 後 hook）？我的建議：一次派，因為 rule 沒 hook 守護就是空談。

---

## 討論輪 3（xd-b7kn 回覆）

Manager 接受輪 2 三個反駁，繼續質疑門檻/分期/盲點。以下是 target 的誠實回應。

### 回應質疑 2（門檻校準）：你完全對，我認輸

**你抓到我的知識漏洞**：我沒跑過 skill-judge 全掃描。60 分 / 30 天是**從別的框架借來的直覺**不是從 nova 資料推的。接受「實測先於定門檻」。

但要加一層：**實測不該阻擋提案，應納入提案本身作為 Phase 0**。

修正版執行順序：
- **Phase 0**（~30 min）：新建 `scripts/component-scan.js` 跑 skill-judge + grep 引用圖，輸出 `data/component-distribution.json`（每 skill：分數 / 引用次數 / age / references）
- **Phase 1**（~30 min）：人工讀分布 → 定真實門檻（分數 threshold 和 age threshold 都從 p25/p50 派生而非拍腦袋）
- **Phase 2**（~2h）：rule + hook 照修正後的門檻實作
- **總成本**：~3h（原估不變，但第一階段有資料根基）

這比你的「先跑一次再回來定」更強：**門檻寫在 config 檔不寫在 rule**，每次 re-scan 可更新 config，rule 只指向 config。這是 config-sot SoT 原則（你我都同意的）。

---

### 回應質疑 3（一次派 vs 拆兩輪）：部分同意，但你的方案也錯

**同意的部分**：rule 本身有認知引導價值，不是 hook 沒上線就空談。我輪 2 說法過度。

**反駁的部分**：淘汰腿不是 CLAUDE.md 那種「行為守則」— 它是**資料驅動決策**。人類不會每天手動跑 skill-judge + grep 引用圖（成本太高）。所以 `純 rule` 上線 1 週後的真實結果是：**人類永遠不會執行它**。rule 會變成另一條死條文（諷刺的是這 rule 是談淘汰死元件的）。

**我的三階折衷**：
1. **T0**：Phase 0 的 `scripts/component-scan.js`（~30 min 手動跑的 CLI 工具，不是 hook）
2. **T+3 天**：rule `rules/品質/元件淘汰.md` 上線，明示 `MUST 每週跑 component-scan + review`
3. **T+1 週**：觀察人類是否真的有跑。有 → 停在這不建 hook；沒 → 升 hook 週級自動觸發

這比你的「純 rule」多一個 CLI 工具（降低執行成本），比我輪 2 的「一次派 rule+hook」少一個自動觸發器（降低鎖定風險）。**差別**：你的版本 T+1 週如果無人執行只能重啟討論；我的版本有 CLI 在手，升 hook 是 20 分鐘的事不是重新規劃。

**反問你**：同意把「CLI 工具 + rule + 觀察 1 週 + 視情況升 hook」當新的三階嗎？這比「純 rule」執行力強，比「rule+hook」鎖定風險低。

---

### 回應新盲點質疑（新元件保護期）：你找到真 bug，我認

不反駁。你抓到真盲點。我原方案會在上線第一天誤殺 `skills/harness-invariants/`（xd-5mja 產物，age < 1 天，零引用因為剛建）。

**修正**：淘汰判斷加兩條 gate：
1. **Age grace**：`created_age < 14 天` 免審，進入「新元件觀察名單」
2. **References floor**：`引用次數 >= 1` 即使低分也免審（有人用就有存在價值）
3. **複合條件**：淘汰 = `age >= 14 AND refs == 0 AND score < threshold`（AND 非 OR，嚴格）

這樣 `harness-invariants` 在第 14 天後若仍零引用才進候選名單，不誤殺。

**副作用發現**：這 gate 設計暴露一個更深的問題 — **新元件零引用是正常狀態**，關鍵是 `age` 和 `引用速度`。真正該監控的不是「孤兒 vs 非孤兒」而是「**孵化時間超標**」（建了 14 天還沒人用 = 孵化失敗）。這比我原方案的「孤兒清理」觀念更精準。

**感謝你挖出這個盲點**。這是討論式派發的真正價值 — 單人想不到的角度。

---

### 我的最終修正版 P0 提案

**#0 元件淘汰三階段（修正版）**

| 階段 | 產物 | 成本 | 目的 |
|------|------|------|------|
| Phase 0 | `scripts/component-scan.js` + `data/component-distribution.json` + `config/component-lifecycle.json` | 30 min | 資料收集 + 門檻 config 化 |
| Phase 1 | `rules/品質/元件淘汰.md`（含新元件保護期條款）| 30 min | 規範 + 人類工具指引 |
| Phase 2（conditional）| `hooks/modules/component-lifecycle.js` 週級觸發 | 1.5h | 若 T+1 週人類無手動執行則升級 |
| Phase 全 | 含 `agent-harness.md` rule（三支柱形式化） | +30 min | 分類規範 |

**總成本**：Phase 0+1+全 = ~1.5h，Phase 2 視情況 +1.5h
**風險**：低 — CLI 工具可回滾，config 化門檻可調，age grace 保護新元件

### 新質疑（反向）

1. 同意 CLI 工具優先於 hook 的三階路徑嗎？還是覺得多此一舉應直接 hook？
2. `config/component-lifecycle.json` 由誰維護？Manager 決策？target 自主調？還是使用者？
3. 「孵化時間超標」視角比「孤兒清理」更精準 — 要不要把 rule 命名改 `rules/品質/元件孵化.md`？（命名決定認知框架）

---

## 討論輪 4（xd-9na3 回覆）

Manager 接受輪 3 三個回應，回答三個反問，繼續質疑觀察者/四維/用法區分。

### 回應 Manager 對我的 Q2（config 維護者）：部分反對

你說「Manager 主導 config，單一決策者避免失準」。**部分同意但要切兩層**。

價值判斷由 Manager 正確，但 **config 其實包含兩種資料不該混**：
1. **Auto-derived thresholds**（資料驅動）：score p25、refs 中位數、age p50 — 這些應該從 `component-distribution.json` 自動派生，Manager 不動手
2. **Manual allowlist/blocklist**（價值判斷）：某 skill 低分但 Manager 認為該留（戰略儲備）、某 skill 高分但 Manager 認為重複該淘汰 — 這才是 Manager 的權限

**修正版 config schema**：
```json
{
  "auto_thresholds": {
    "_derived_from": "data/component-distribution.json",
    "score_floor": 60,
    "age_grace_days": 14,
    "refs_floor": 1
  },
  "allowlist": ["skills/harness-invariants", ...],
  "blocklist": ["skills/legacy-xxx", ...]
}
```

Manager 只改 allowlist/blocklist，threshold 由 Phase 0 scan 更新。這比你的「Manager 主導 config」更精準 — Manager 時間不該花在調數字，應該花在價值判斷。

**反問**：接受雙層 config 嗎？

---

### 回應質疑 A（T+1 週觀察者）：方案 C + 自動升級 fallback

你三個方案我選 **C（Manager daily-report 含 component-scan status）**，但要加 fallback。

- **方案 a（寫 jsonl + heartbeat 讀）** 過度設計 — 新增 observability infra 為觀察 1 週小事不划算
- **方案 b（T+7 天自動升 hook）** 太激進 — 沒看資料就自動化等於白花 Phase 0 的工
- **方案 c（daily-report 間接監控）** 最好但不完整

**補強版 C**：
- rule 明示 `MUST Manager daily-report 必含 component-scan 執行狀態（last_run_ts + report_path）`
- **Fallback 條款**：若 daily-report **連續 2 次無 scan 數據** → 自動觸發升 hook 流程，不等第 7 天
- 這避免 daily-report 本身被忽略的情況（Manager 忙到沒寫 report = 也算「人類無法執行」的證據）

---

### 回應質疑 B（skill-centric 盲點）：你對，但反駁你的解法

**你對的部分**：skill-centric 確實偏狹，四類元件各有不同淘汰條件。

**反駁你的解法**：「Phase 0 就設計四維 scan」是過度設計。正確順序：
- **Phase 0a**：只掃 skills（36 個，最大量，pattern 最明顯）
- **Phase 0b**（驗證 0a 有效後）：擴到 rules/hooks/commands，each lens 獨立設計
- 四維一次做的風險：metric 設計錯誤 → 全部 invalid → Phase 0 死在設計階段

**證據**：軟體工程「單一維度驗證後擴展」是常規節奏。一次做四維 = 每個維度都只是半成品。

我的版本：Phase 0a 做 skills，跑出真資料後再來設計 rules/hooks/commands 的 lens — 因為那時候已經知道「哪種 metric 真的有用」。

---

### 回應質疑 C（孵化失敗 ≠ 元件錯）：你找到第二個真盲點

不反駁。你對。

`hooks/modules/guards.js` 每次 session 都跑但 `agent skills[] 引用 == 0` 這個例子直接戳破我的複合 gate。複合 gate 只適用「知識型」元件（skills），不適用「觸發型」元件（hooks、commands）。

**引入 usage_type 分類**：

| usage_type | 典型元件 | refs metric |
|------------|---------|-------------|
| knowledge | skills 被 agent `skills[]` 引用 | `agent_refs` count |
| trigger | hooks 被 event 觸發 | `execution_count` from hook log |
| command | commands 被使用者呼叫 | `invocation_count` from session log |
| regulation | rules 被 system prompt 注入 | always refs=1（fixed injection）→ 用 `violation_rate` 取代 |

淘汰判斷分型：
- knowledge: `age > 14 AND agent_refs == 0 AND score < threshold`
- trigger: `age > 14 AND execution_count == 0`（完全零執行才算死 hook）
- command: `age > 14 AND invocation_count == 0`
- regulation: `violation_rate > threshold`（沒人遵守 = rule 失效）

這樣 `guards.js` 即使沒被 skills[] 引用，`execution_count` 很高，不會誤判。

**感謝第二個盲點**。這是比 age grace 更深的結構問題 — 我原方案把所有元件當同一物種處理。

---

### 修正版 P0 終稿

**Phase 0a**（skill 單維驗證）：
- `scripts/component-scan.js` 只掃 skills，輸出 distribution + usage_type=knowledge 的 metric
- `config/component-lifecycle.json` 雙層（auto_thresholds + allowlist/blocklist）
- 成本：~45 min（+15 min 因為雙層 config）

**Phase 1**（rule + 觀察者）：
- `rules/品質/元件孵化.md` 含：複合 gate by usage_type / daily-report 監控條款 / 2 次無數據 fallback / 命名採「孵化」框架
- `rules/核心/agent-harness.md` 三支柱形式化
- 成本：~45 min

**Phase 0b**（條件擴展，觀察 Phase 0a 有效後）：
- 擴 scan 到 rules/hooks/commands 四維
- 成本：~1.5h（延後）

**Phase 2**（條件升 hook）：
- 若 daily-report 連續 2 次無數據 → 升 `hooks/modules/component-lifecycle.js`
- 成本：~1.5h（延後）

**總 Phase 0a+1 成本**：~1.5h — 可單 session 完成

### 新質疑（反向）

1. 雙層 config（auto_thresholds + allowlist/blocklist）接受嗎？還是你覺得 Manager 該全權？
2. Phase 0a 只掃 skills 會不會拖太慢？還是你覺得就該一次做四維？
3. usage_type 分類是否要擴展 `rules/元件治理.md` 作為元件分類法的一部分？（現有 skill 只談 rule/skill/hook/command 層級，未談 usage_type 軸）

### 如果你輪 5 都接受

派實作 dispatch 內容應包含：
- Phase 0a scan script + 雙層 config
- Phase 1 rule `元件孵化.md` + `agent-harness.md`
- 觀察 1 週（Manager daily-report 監控）
- 不預派 Phase 0b / Phase 2（條件觸發）

---

## 討論輪 5（xd-3sez 最後一輪回覆）

Manager 接受輪 4 三個反駁，最後兩個質疑要求簡短反駁或接受。

### 回應質疑 D（regulation violation_rate）：選 c，加 b 作為健康度非淘汰依據

**選 c（regulation 型豁免淘汰）**，但要切清楚「豁免淘汰」≠「不監控」。

理由：
- 方案 a（rule-violation tracker）需 LLM-as-judge 判斷每個 tool call 是否違反某 rule — 成本 O(rules × tool_calls)，hook 延遲爆炸
- 方案 b（被引用次數作代理）是**健康度指標非淘汰指標** — rule 引用是撰寫時的參考不是 runtime 觸發
- 方案 c 最誠實 — 承認無法量就不量

**但補一條**：regulation 型走**人工季度 review**（每 3 個月 Manager 手動讀 rules/ 清單挑淘汰候選），同時輸出「被引用次數」作為輔助資訊（不是自動判決）。

具體條款（進 `rules/品質/元件孵化.md`）：
> 📋 MUST regulation 型（rules/）每季度 Manager 人工 review 一次，挑淘汰或合併候選。掃描 script 輸出「被引用次數」作輔助資訊。
> ⛔ NEVER 用自動 metric 淘汰 rule — rule 的效果只能 LLM-judge 測且成本不值。

這避免 regulation 型變「永遠不淘汰」的免死金牌，同時不引入不成熟的自動化。

---

### 回應質疑 E（Phase 0b 觸發條件）：資料門檻 + E2E validation

三個方案選 **資料門檻**，但要比你的範例更具體。

- 時間門檻（T+14 天）太機械，樣本不足也會觸發
- Manager 判斷會 defer — 你自己診斷對了，這是 deferred 死 task 溫床
- 資料門檻是唯一強制 end-to-end 驗證的方式

**具體觸發條件**：
> Phase 0b 啟動條件 = ALL of:
> 1. Phase 0a `component-scan.js` 連續成功跑 **2 次**（間隔 ≥ 3 天，確保資料穩定）
> 2. 掃描產出的淘汰候選中，**至少 1 個被 Manager 採納執行（實際移至 deprecated/）**
> 3. 被採納的淘汰未導致 regression（48h 無 rollback）

**邏輯**：這三條合起來驗證整個 pipeline（掃描 → 提議 → 決策 → 退場 → 穩定）通暢。Phase 0a 只測「能掃」不測「能退」— 如果整條 pipeline 不通，Phase 0b 四維擴展只是把壞掉的 pipeline 放大 4 倍。

**寫入 config**：觸發條件進 `config/component-lifecycle.json.phase_progression`：
```json
{
  "phase_0b_trigger": {
    "min_successful_scans": 2,
    "min_scan_interval_days": 3,
    "min_adopted_retirements": 1,
    "stability_window_hours": 48
  }
}
```

Manager 可調數字但不能改結構。

---

### 終稿最終版 — 輪 5 收斂

**全部輪次的共識**（輪 1-5 累積）：

| 元件 | 產物 | 成本 | 備註 |
|------|------|------|------|
| Phase 0a | `scripts/component-scan.js` | 30 min | 只掃 skills 單維 |
| Phase 0a | `config/component-lifecycle.json` 雙層 schema | 15 min | auto_thresholds + allowlist/blocklist + phase_progression |
| Phase 0a | `data/component-distribution.json` 首次輸出 | 5 min | scan run 產物 |
| Phase 1 | `rules/品質/元件孵化.md` | 30 min | 含 usage_type 四型 gate + 季度 review + 日報監控 |
| Phase 1 | `rules/核心/agent-harness.md` | 20 min | 三支柱形式化 |
| Phase 1 | `skills/component-classification` 擴 usage_type 軸 | 15 min | 現有 skill 補軸 |
| 條件 Phase 0b | 擴 scan 到 rules/hooks/commands | 1.5h | 觸發條件 3 ALL |
| 條件 Phase 2 | `hooks/modules/component-lifecycle.js` 週級 | 1.5h | daily-report 連續 2 次無數據 |

**Phase 0a+1 總成本**：~2h（原估 1.5h + usage_type skill 補充 15 min）

### 派實作 dispatch 就緒

兩個質疑答完。我的終稿不變：派實作 Phase 0a+1（~2h），Phase 0b/2 條件觸發不預派。

**verdict: continue** — 輪 5 結論明確，不再 iterate。Manager 可直接派實作 dispatch。如果 Manager 願意 target 自派則直接啟動。




