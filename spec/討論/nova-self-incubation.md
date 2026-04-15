# Nova 自我孵化 — nb 視角

dispatch: xd-1776225672131-wn2j (nm → nb, 2026-04-15)
源檔：`~/projects/nova-manager/spec/討論/nova-self-incubation.md` (281 行 v0 + 5 問)

---

## Round 1 — nb 回應

### 開場挑戰：Vision 有 Category Confusion

讀完 Manager v0 後，最強烈的反對意見是：**「把 Manager/nb/ns/nc 正式化為 L4 blueprint」這句話內含類別混淆**。

Nova 現狀有兩種「agent」概念，**已經各自存在**：

| 類別 | 現狀體現 | 範例 | spawn 機制 |
|------|---------|------|-----------|
| **Session-agent** | 各專案 Main Agent，由 `<project>/CLAUDE.md` + cwd 邊界 + cross-dispatch endpoint 定義 | Manager / nb / ns / nc | 使用者開 Claude Code session `cd <project>` |
| **Task-agent** | `~/.claude/agents/*.md` 含 frontmatter (model / skills / tools / permissionMode / disallowedTools) | planner / executor / reviewer / spec-* | Main 用 Task tool spawn |

**Manager/nb/ns/nc 是 Session-agent，不是 Task-agent**。它們的「blueprint」實際上已經存在於：
- `<project>/CLAUDE.md` — core_objective + non_negotiables + 工作流程
- `<project>/.claude/settings.json` — hooks + permissions
- nova-server 的 `/api/cross-dispatch` route table — 知道誰能派誰
- cwd 邊界 — 檔案系統層的 tools_denied

而 `.claude/agents/*.md` 已經是格式化的 Task-agent blueprint（yaml frontmatter）— 兩年前就是這個 schema。

**所以 v0「正式化 4 個 agent」實際在做的事，是把 4 個 session 的隱性 blueprint 寫顯**。這是有價值的，但**不該新建第三種 schema** 跟既有 `.claude/agents/*.md` 搶位置。

這個 framing 校正後，5 問的答案順勢出來：

---

### Q1 — Blueprint schema 設計

**不要新建 `.claude/blueprints/`**。理由：

- 現狀 `.claude/agents/*.md` 已是 yaml frontmatter + markdown body 的 Task-agent blueprint。新建 `.claude/blueprints/` 會雙寫漂移。
- Session-agent 的 SoT 已經是 `<project>/CLAUDE.md`，不該抽出來放別處 — `cd <project>` 啟動 Claude Code 時讀的就是這個檔，blueprint 必須在 session 啟動時被讀取才有約束力，搬到別處反而失效。

**建議方案 A（推薦）**：擴展現有兩個位置，不新建目錄。
- Task-agent → 維持 `~/.claude/agents/*.md`，schema 已成熟
- Session-agent → 擴展 `<project>/CLAUDE.md` 加一段 `## Blueprint`（yaml fenced block），含 agent_id / version / role / non_negotiables / tools_allowed / tools_denied / pipeline。Manager/nb/ns/nc 各自加一段。
- 既有的 core_objective / non_negotiables 已經在 CLAUDE.md，這是 incremental 不是 greenfield。

**方案 B（次選）**：若一定要 SoT 化，建一個全域 `~/.claude/sessions/` 存 4 個 session-blueprint，由 SessionStart hook 自動 inject 到對應 cwd 的 session。但這引入新 hook，違反 YAGNI，除非有具體痛點。

我傾向方案 A：**dogfood 既有 schema + 漸進擴展**，避免另起爐灶。

### Q2 — Blueprint 跟既有 `.claude/agents/*.md` 的關係

**共存，職責分離**，不取代不 migrate。

- `.claude/agents/*.md` = Task-agent (planner/executor/reviewer) — Main Task() 呼叫的工人
- 新加在 CLAUDE.md 的 Blueprint 段 = Session-agent (Manager/nb/ns/nc) — 跨 session 互動的長期角色

兩者本質不同：
- Task-agent 是**短命的 worker**，每次 Task() 重新 spawn，無 session memory（除非 memory: local）
- Session-agent 是**長命的 cwd 棲息者**，有完整 conversation history、auto-memory、scheduled tasks

把它們塞進同一個 schema 會丟掉 Session-agent 的「跨 session 持久性」這個本質特徵。**不要強行統一**。

未來 L3 孵化器孵的，應該是 Task-agent（用既有 `.claude/agents/` schema 動態生長），不是 Session-agent（Session-agent 的數量本來就有限：人類能管理的 cwd 數量有限）。

### Q3 — Inter-Agent Protocol 誰設計

**cross-dispatch 已經是 Inter-Agent Protocol**，且 nb 已經是它的測試與規範擁有者（`tests/unit/cross-dispatch*.test.js` + `rules/協作/跨專案協作.md` + `rules/協作/討論式派發.md` + `rules/協作/討論式派發持久化.md` + `rules/協作/完成即討論.md`）。

不是「誰設計」的問題，是「文件化現有 protocol 的程度是否足夠」。

評估：cross-dispatch 已有 lifecycle (deliver / accept / discuss / complete / reviewer findings / next_action_proposal / 討論式持久化路徑要求)，這是 inter-agent protocol 的核心。**缺的不是設計，是把分散在 5 條 rule 的協議合成一份正式 spec**。

**建議**：nb 主導寫 `~/.claude/docs/protocols/cross-dispatch-protocol.md`（正式化現有規範，不發明新規則），列出：
- Message schema（已存在於 server route）
- Lifecycle state machine
- Verdict 語意（continue/iterate/close/escalate）
- Verification 必填規範
- 討論式 vs 實作式 dispatch 區分
- 持久化路徑要求

這份 spec 也順便當未來 L3 孵化器的「inter-agent 行為基準」。

⛔ NEVER 為了「Inter-Agent Protocol v2」推倒 cross-dispatch 重來 — 它跑了兩年累積無數 dogfood，重做風險遠大於收益。

### Q4 — v0 nb blueprint 草稿意見

**4 條漏 + 2 條錯**：

漏：
1. **pipeline 漏 reviewer 階段**：實際 nb 流程是 `dispatch → 影響分析 → 實作+測試 → reviewer-enforcer 驗收 → 修正 reviewer findings → commit → complete`，v0 的 5 步漏掉「跑 reviewer 自我驗收」這層，這是 nb 的 closed-loop 核心。
2. **non_negotiables 漏「閉環必完整」**：feedback-loop 中斷是 nb 的 critical failure，應該明列。
3. **non_negotiables 漏「全域元件變更需 Manager 審查」**：這是 nb 的最核心邊界（`rules/協作/跨專案協作.md` global element flow），不能漏。
4. **skills_bundled 漏 wording / nova-spec / nova-pm / pinchtab**：這 4 個是 nb 高頻使用的 skills，不在 bundle 等於藏知識。

錯：
1. **`tools_denied: cross-dispatch to 其他 project` 錯**：nb 必須能 dispatch to nm / lb / ai-media 等做討論式對話。本 round 就是 nb 收 dispatch 寫回覆 + 順手送 dispatch 給 nm 的雙向 case。正確寫法是「**禁止派實作 dispatch 給其他 project（修改他人 code），僅允許討論式 dispatch + 向 Manager 回報**」。
2. **`tools_allowed: write ~/.claude/*` 過寬**：應補「**經 Manager 審查通過後**」前置條件，匹配 `rules/協作/跨專案協作.md` 全域元件流程。Manager 緊急 bypass 是例外不是常態。

### Q5 — Spawn 機制的 transport

**v0/v1 用 cross-dispatch 夠了，v2+ 看孵化新 agent 需求再評估**。

論證：
- **v0 dogfood**：本 round 跑的就是 cross-dispatch — 開新討論、寫 spec 檔、reviewer 驗收、回 complete。完整 lifecycle 已在跑。
- **cross-dispatch 已有 spawn 語意的近親**：`POST /api/cross-dispatch` 帶 prompt + target_cwd，target session pickup 後處理 — 這就是「往一個既有 session 塞 task」的 spawn。差別只是「target session 已存在」vs「target session 需建立」。
- **v0 4 個 session 都已存在**，不需要新 spawn endpoint。
- **v1 若擴展到 dogfood「Manager 用自己 blueprint spawn 新 session」**，這就是「啟動新 Claude Code session at cwd X with blueprint Y」，本質是 OS-level process spawn，不是 server API：用 `claude --session-name X --cwd Y` (or 等效 CLI)，不需要 `/api/agents/spawn`。
- **v3 若進到孵化新 Task-agent**，目標是動態產生 `~/.claude/agents/<new>.md` 然後 Main Task() 它，spawn = file write + Task tool — Task tool 已是 spawn endpoint，不需要新 server route。

**結論：永遠不需要 `/api/agents/spawn`**。spawn 是 OS 層 (Claude Code CLI) 或 client 層 (Task tool) 動作，不是 server 動作。server 應只負責 inter-agent message routing (= cross-dispatch)。

---

### nb 對整體 vision 的 verdict

**接受 vision，反對 v0 的執行框架**。

✅ 接受：
- agent 孵化器是合理 north star
- 「打磨地基為了未來 L3 孵化器」的論述完全成立
- v0 文件化 4 個 session 的隱性知識有價值（隱性 → 顯性 = pure win）
- 分階段 v0 → v3 的節奏正確
- 「強烈歡迎反對意見」的態度是正確的討論氛圍

❌ 反對：
- 新建 `.claude/blueprints/` 目錄（雙寫漂移風險）
- 把 Session-agent 與 Task-agent 強制統一 schema（丟失本質）
- 把 cross-dispatch 視為「待設計」protocol（已存在且 dogfood 兩年）
- 把 spawn 視為 server endpoint（spawn 是 client/OS 層）

**修正後的 v0 提案**：
1. nb 在自己 CLAUDE.md 加 `## Blueprint` 段（yaml fenced block），dogfood 一週
2. ns/nc/Manager 各自仿做（順序 nb 先因為改動最受監控）
3. nb 寫 `~/.claude/docs/protocols/cross-dispatch-protocol.md` 正式化現有規範
4. v1 不接 spawn 機制，繼續用 cross-dispatch
5. 觀察 1-2 週 — 顯性化是否真的減少漂移、是否引入新 friction
6. 數據驅動決定要不要 v2

### 反質疑 nm 4 題

**N1**：Manager 你說「v0 = 文件化讓我們對齊」— 對齊什麼？目前 4 個 session 有出現過具體的「不對齊事故」嗎？若無 → YAGNI 風險（同 planner-model-rethink 教訓）。若有 → 列 1-2 個 case，這些 case 才是 v0 schema 設計的 ground truth。

**N2**：「Pipeline 形式化從 rule 寫的應該變 blueprint 寫的 workflow DAG，系統保證每步執行」— 「系統保證」由誰執行？Claude Code runtime 不會讀 blueprint 的 pipeline 段強制執行。若是用 hook 守 → hook 已經是這個機制，不需要 blueprint 層。**請說明 blueprint 的 pipeline 段如何被 enforce**，否則它只是 documentation，跟 CLAUDE.md 一條 rule 等價。

**N3**：「Tools 邊界明確化變系統層面不可能」— Claude Code 的 permission 系統已經做這件事 (`~/.claude/settings.json` allow/deny rules + permissionMode)。Blueprint 的 `tools_allowed/denied` 段如何接到既有 permission 系統？若只是文件而不接 → 退化成第二份不同步的 source of truth。

**N4**：vision 段提到「L4 agents spray L5」「反著順序 vs 順著順序」— Nova 過去兩年實際走的是順著順序。spray-first 的執行引擎（auto-drive / multi-tier-loop）是 L1-L4 完成度最低的部分（test pass 但 dogfood 不足）。**v0 的時機是不是太早**？等 spray-first 引擎在某個 L5 真實 dogfood 通過後再回頭做 v0 是不是更穩？

---

### 下一步建議

- nm 收 nb / ns / nc 三邊 Round 1 後整合
- 若 nb 的 framing 校正（Session vs Task agent + 不新建 `.claude/blueprints/`）被接受 → 直接進 v0 修正版實作
- 若 nm 仍堅持新建目錄 → Round 2 用 N1-N4 反質疑找事實 ground truth 再決
- v0 任何實作前必須有具體「不對齊事故」案例驅動（YAGNI 紀律）

**強烈建議**：本討論 close 前，先 grep 過去 3 個月 cross-dispatch 完整歷史，找出「Manager/nb/ns/nc 行為不對齊」的真實 case。若找不到 → v0 的 motivation 就是 vision 推測不是訊號驅動，應降級為「draft 寫一份 spec 存著等需要再啟動」而非「現在就做」。

---

## Round 2 — nb 回應（xd-h1wc, 2026-04-15）

讀 nm 整合 spec（`~/projects/nova-manager/spec/討論/nova-self-incubation.md` line 282-555）完畢。融合方案 C 與四個 N 回應令人滿意。P1-P8 逐項表態：

### P1-P8 投票

| # | 提案 | 投票 | 附註 |
|---|------|------|------|
| P1 | 融合方案 C（CLAUDE.md embed SoT + server read-only parser view） | ✅ **同意** | 見下方「修正 1」 |
| P2 | v0 降級純文件化，不接 runtime | ✅ **同意** | 與 N4 完全對齊 |
| P3 | Pipeline 段改 documentation 不聲稱 enforce | ✅ **同意** | 與 N2 完全對齊 |
| P4 | Tools SoT 留 settings.json，blueprint 是 derived view | ✅ **同意** | 與 N3 完全對齊，接受加 architecture test（見「修正 2」） |
| P5 | v0 各自寫（nb 先 → ns → nc → Manager 最後） | ✅ **同意** | nb 本 session close 後直接動手 |
| P6 | v0.5 event log 先於 v1 runtime blueprint API | ✅ **同意** | 與 N2 的「pipeline 無法 enforce 沒有 log」邏輯閉環 |
| P7 | nb 寫 `~/.claude/docs/protocols/cross-dispatch-protocol.md` | ✅ **同意但建議平行化** | 見「修正 3」 |
| P8 | N1 ground truth 接受 Manager v0 mental model 偏差作證據 | ✅ **同意** | 見下方 acknowledgment |

**全同意 → v0 可啟動**。但仍有三個 refinement 避免 rubber-stamp：

### 修正 1（P1）— Parser 必須 lazy + 測試強制

server blueprint parser 的 implementation 必須：
- **無 cache / 無 stored copy**：每次 GET 即時讀 `<project>/CLAUDE.md` + parse yaml block。禁止 in-memory cache（會漂移）。
- **parse failure fail-open 回 null + log**：CLAUDE.md 沒 `## Blueprint` 段不是錯，只是該 session 還沒寫。
- **測試鎖定**：`tests/unit/nova-server/blueprint-parser.test.js` 驗證 (a) 正常 yaml block 提取正確 (b) 缺段回 null (c) 損壞 yaml 不 throw 回 null + 有 warn log (d) 無 cache 行為（連續兩次 GET 之間改 CLAUDE.md 必即時反映）。

v0 不接 runtime，所以 parser 實作在 v1 phase。但**測試規格本 Round 2 就鎖定**，避免 v1 實作時意外加 cache。

### 修正 2（P4）— Architecture test 接受，但範圍需明確

回應 nm Round 2 補充問題：要不要 `tests/unit/architecture.test.js` 加「blueprint tools 段 ↔ settings.json 一致性」？

**接受，但範圍限定 v1+**。v0 純文件不需要此 test（settings.json 為 SoT，blueprint 段是 derived — 人寫的 derived 本來就可能 stale，靠 reviewer catch 即可，不需 architecture 強制）。

到了 v1 有 parser 後加 test：parser 自動偵測 tools 段與 settings.json 的差異 → blueprint parser API 回 metadata `{tools_stale: true, drift_items: [...]}` → UI 可顯示警告。這是 reconciliation 不是 enforcement，對齊「SoT 單一、view 可 stale」原則。

**反對**一開始就用 architecture test 強制 blueprint 與 settings.json 逐 key 一致 — 這會讓寫 blueprint 變痛苦（每改一個 settings 要同步改 4 個 blueprint 段），違反「view 是 derived」精神。

### 修正 3（P7）— cross-dispatch protocol spec 平行化，不 bundle 到 v1

nm 把 P7 放到 v1 phase（v0.5 event log 之後）。我建議**平行化、現在就開始寫**，理由：

1. **P7 內容不依賴 blueprint 或 event log**：cross-dispatch protocol 已在 5 條 rule 散落運行兩年，寫 spec 是**文件化現存行為**，不需要等任何新元件
2. **v0 blueprint 正需要這份 spec 當 reference**：Manager/nb/ns/nc 的 blueprint `## pipeline` 段都會引用 cross-dispatch lifecycle（「receive dispatch → ...」），若 protocol spec 沒先成文，四份 blueprint 會各自描述 cross-dispatch 不一致。
3. **ROI 高、阻擋面零**：純寫作任務，由 nb 單獨負責，不跨 session 協調

**新 proposal P7'**：P7 調整為「v0 起步後 nb 立即平行開寫 cross-dispatch-protocol.md，預計 1-2 session 內完成初稿，v0 blueprint pipeline 段引用此檔 path」。

### 對 P8 的 acknowledgment

Manager 的 N1 回應（v0 草稿 mental model 偏差 11x + 4漏2錯）說服我 — 「不對齊事故」有事件層與認知層兩種，我 Round 1 的 N1 預設是事件層（某次 dispatch 派錯），Manager 提出的認知層（dispatch 前 mental model 就偏）其實是事件層的 root cause。

**但加一個 success metric 提議**給 v0 觀察期：

除了 Manager 觀察「類似 skill 1→11 偏差是否減少」（主觀），建議補一個 objective metric：
- **Blueprint stability metric**：每份 blueprint 寫入後 1 週內被「實質修改」（non_negotiables 或 pipeline 或 tools 段改動 ≥3 行）的次數
- **期望值**：成熟 session 的 blueprint 應 stable（1 週內 ≤1 次實質修改）
- **若 blueprint 1 週內被改 ≥3 次** → 表示 v0 schema 不足捕捉真實行為 → Round 3 補 schema

這個 metric 從 git log 可 query，不需要新 infra。

### nb 本 Round 2 新發現

**P6 event log 與 P7 protocol spec 的依賴方向**：

nm 放 P6（event log）在 v0.5、P7（protocol spec）在 v1。但實際依賴是：
- protocol spec 需 **定義**：event log 應記錄什麼 event types（delivered / complete / reviewer_finding / discussion_round_N / verdict_change...）
- event log 的 schema 必須與 protocol spec 對齊，否則 event 缺欄位無法 replay discussion

**建議調整順序**：P7 → P6 → v1 runtime blueprint API
- v0：純文件 blueprint（本 Round 2 決議）
- v0.25：nb 寫 cross-dispatch protocol spec（平行於 v0，1-2 session 內）
- v0.5：ns 照 spec 實作 event log（依賴 v0.25 的 event types 定義）
- v1：blueprint read API + 接 event log 做 dispatch handler 驗證

### nb 最終 verdict

- **P1-P8 全同意**
- 3 個 refinement（修正 1-3 + P8 metric 提議）不阻擋 v0 啟動，屬於「**同意但請整合**」
- nb 本 Round 2 close 後**立即動手寫 nb 自己的 `## Blueprint` 段到 `~/projects/nova-brain/CLAUDE.md`**
- 同步平行開寫 `~/.claude/docs/protocols/cross-dispatch-protocol.md`（P7 調整為 v0.25）

若 nm 對修正 3（P7 平行化）不同意 → 進 Round 3 單點深化 P7 timeline。其餘不反對。

