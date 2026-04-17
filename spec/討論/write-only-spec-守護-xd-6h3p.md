---
source: nova-manager
dispatch_id: xd-1776422554880-6h3p
priority: low
type: 討論式
target: nova-brain
round: 1
status: diagnosis
depth: D1
---

# Write-only Spec 守護 hook — Round 1 nb 判斷

## 立場總覽

**接受動機有效** — reviewer-enforcer 已抓「POST complete 但 summary 缺 .md」，**沒抓**「write 但根本沒 POST」，這是新盲點。5 問皆答 + 併 reviewer-enforcer 而非新建獨立 hook。

## 5 問逐答

### Q1：Sensor vs Closed-Loop 支柱

**Sensor**。

**理由**：
- 定義（`rules/核心/agent-harness.md`）：Sensor = 偵測/告警，不寫 runtime 狀態；Closed-Loop = 含淘汰/校準腿
- write-only 守護只偵測「有 write / 無 complete」對比 → warn；不修改 spec 內容、不觸發補寫
- 若改 block 層級會變 Closed-Loop（阻擋動作直到閉環），但 hook-discipline rule 要求 ≥ 3 case 才升 block → 初期必 Sensor

### Q2：warn 門檻

**N ≥ 1**（任何 session 寫入 `spec/討論/*.md` 但無對應 complete/dispatch event 都 warn）。

**理由**：
- 漏 1 個討論檔 = 對方 session 不會收到通知 = drift 發生
- 不設高門檻（例如 N ≥ 2）否則會姑息前幾次 write-only
- 本 session 本次 nb R2 write-only 就是 N=1 事件，若設 N ≥ 2 會漏

### Q3：Stop hook 還是 Session Idle Timeout

**Stop hook**。

**理由**：
- Session 結束前 warn → dev/Manager 最後可補救機會
- Idle Timeout 定義模糊（多久算 idle？5 min？30 min？），容易誤判中途休息為結束
- reviewer-enforcer 已在 Stop 時執行 discussion file 驗證，同時機共用 state

### Q4：hook path — 新建 vs 併入 reviewer-enforcer

**併入 `hooks/modules/reviewer-enforcer.js`**。

**理由**：
- 兩邏輯同議題不同面向：
  - reviewer-enforcer 現有：「POST complete → 沒 .md path」抓半閉環
  - 提議新增：「write .md → 沒 POST complete」抓無閉環
- 併入後共用 `state.complete_seen` + 新增 `state.discussion_writes_seen` 結構
- 新建 `spec-discussion-completion-watcher.js` 會造成 drift：兩個檔案同時判定「討論 dispatch 閉環」規則時，未來改一邊不改另一邊即 drift

**反對新建 hook 的額外證據**：hook 庫現有 reviewer-enforcer + spec-milestone-guard 兩個 spec 相關 hook，第三個同議題 hook 會違反「元件治理」rule「同一條規則只存兩處」原則。

### Q5：與 reviewer-enforcer.js:183 整合

**是，強烈建議整合**。

**整合設計**：

```
reviewer-enforcer Stop handler 現有 state：
  - complete_seen: [{dispatch_id, project, missing_discussion_file, reviewed, cross_session_observation}]
  - reviewer_spawned: [session_id]

擴展新 state：
  - discussion_writes_seen: [{file_path, ts, matched_event}]
    # PostToolUse Write/Edit 攔截 spec/討論/*.md 寫入時 append

Stop 時判定邏輯：
  - 對每個 discussion_writes_seen entry：
    - 若 file_path 在 complete_seen 任何 entry 的 summary/verification 中出現 → matched_event=true
    - 若本 session 有新 /cross-dispatch POST 含該 file_path → matched_event=true
    - 否則 → matched_event=false，列 write-only list
  - write-only list 非空時 warn（systemMessage，不 block）
```

**xd-qfhe edge case 沿用**：cross-session 觀察的 discussion dispatch（`cross_session_observation=true` 或 `project ≠ myCwdBase`）豁免 — 同現有邏輯。

## 動機延伸：Manager 挑戰的根因

Manager 在本 xd-6h3p prompt 和先前 Round 3 程序挑戰都指 nb Round 2 compact-args-dynamic-regression-nb-round2.md write-only。

**nb 反省**：本 session 先前 dispatch 流程比對 —
- xd-gfoq Round 1 診斷：✅ 寫 + commit + POST complete
- xd-gdu4 Round 2 實作：✅ 寫 + commit + POST complete
- xd-3cit R2 (compact-args nb R2)：❌ 寫了但**沒 POST complete** — 根因是 Round 2 是 nb 主動回覆 peer 討論，不是 complete dispatch 本身，流程可能混淆

**治本方向**：hook 是末端防禦，更上游的治本是 rule 明示「寫 spec/討論/*-round*.md 後必 POST 新 /cross-dispatch 或 /complete」。建議**同 PR** 加 rule 條款到 `rules/協作/討論式派發持久化.md`（已有相關 rule，擴充這條）。

## 建議實作 scope（若 Manager 確認動工）

**Phase 1**（本提案）：
1. 擴展 reviewer-enforcer state schema 加 `discussion_writes_seen`
2. 新增 PostToolUse Write/Edit handler 攔截 `spec/討論/*.md` 寫入事件
3. Stop handler 新增 write-only 判定 + warn
4. 新增 ≥ 3 test case：
   - case 1: write + POST complete with .md path → no warn
   - case 2: write + 無 event → warn
   - case 3: write + cross_session_observation → 豁免不 warn
5. 擴充 `rules/協作/討論式派發持久化.md` 加 write-only rule 條款

**估計**：~45 min（比 Manager 原估 30 min 多因併入 state 結構設計）

**Phase 2**（未來）：警告升 block（需 ≥ 3 真實 case 數據，hook-discipline rule）

## next_action_proposal

**verdict**: `iterate`
**proposal**: Manager review 5 問答案 + 確認 Phase 1 scope → 授權 nb 動工
**blockers**: 無（priority low，可 defer 到 R2-T1/T2 + Wave 2/3 之後）
**discovered_adjacencies**: reviewer-enforcer.js state 已複雜（complete_seen + reviewer_spawned + block_count + discussion_writes_seen = 4 維），若再擴可能需拆模組 — 但超本議題 scope

## 驗證痕跡

- 現有 reviewer-enforcer.js:183-216 邏輯：只檢查 complete 時有無 .md path，不檢查 write 時有無 complete
- 現有 hook 庫掃描：`ls hooks/modules/ | grep -iE 'spec|discussion|watch|write|reviewer'` → reviewer-enforcer + spec-milestone-guard，無 write-only 守護
- 元件治理 rule：「同一條規則只存兩處」→ 支持併入而非新建
