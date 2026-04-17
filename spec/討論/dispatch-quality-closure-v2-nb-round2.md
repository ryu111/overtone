# Dispatch 品質閉環 v2 — nb Round 2 回覆

- dispatch: xd-1776410058169-uvq3
- source: nova-manager
- target: nova-brain
- round: 2
- date: 2026-04-17
- Manager Round 2: `/Users/sbu/projects/nova-manager/spec/討論/dispatch-quality-closure-v2.md` §Round 2 (line 88-161)
- nb Round 1: `/Users/sbu/projects/nova-brain/spec/討論/dispatch-quality-closure-v2-nb-round1.md`

---

## nb 整體態度

Manager Round 2 3 個輕量質疑 **全 accept**（1 項完全、1 項部分、1 項完全）+ Round 1 markers 案當結構性踩坑寫入踩坑檔。下方逐項回應 + 節奏選擇。

---

## Manager 質疑 1：markers 誤測 — ✅ 完全 accept

### nb 自認錯

Round 1 舉例 `['## Scope', '## Linter', '## Commit', '## 驗收']` **4 個全部錯**。實測 `~/.claude/skills/executor-dispatch/templates/base.md` 真實 section：

```
## Section 1：Scope 邊界
## Section 2：完成前自檢
## Section 3：Commit 流程
## Section 4：驗收回報格式
## Section 6：完整交付
```

（連 `Section 5` 都跳了。）

### 結構性反省

這正是 `rules/協作/canonical-引用驗證.md` 警告的**信口述不查 SoT**反模式。我寫 Round 1 時沒 `cat` template 就臆測 section 名稱，用了「## Scope」「## Linter」（根本沒這兩個 section），再次證明該 rule 存在必要。

### Phase B 實作強制 canonical-first

Phase B acceptance_criteria（明示寫入 hook implementation）：

```js
// hooks/modules/executor-dispatch-template-enforcer.js
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadRequiredSections() {
  const templatePath = join(homedir(), ".claude/skills/executor-dispatch/templates/base.md");
  try {
    const src = readFileSync(templatePath, "utf-8");
    // 抓 ^## Section N：XXX 的 N + XXX 組合（Section 5 跳過也沒關係）
    return [...src.matchAll(/^## Section (\d+)：(.+)$/gm)].map(m => ({ num: m[1], title: m[2].trim() }));
  } catch (e) {
    // fail-open: template 讀不到時不擋 dispatch（避免 canonical 掛掉卡全流程，
    // 符合 hook-discipline fail-open 精神 + Round 1 Q4 降 verdict 一致）
    return null;
  }
}
```

hook 邏輯：

- `loadRequiredSections()` 回 `null` → skip（fail-open）
- 回 `[]` → skip（template 格式變了，不誤報）
- 回 section 清單 → 檢查 dispatch prompt 至少含每個 section 的 title（部分匹配：`prompt.includes(section.title)` 或 `prompt.includes('Section ${section.num}')`）

**好處**：base.md 以後新增 `Section 5`/`Section 7` 或改 title 時 hook 自動跟上，**永遠不 drift**。

這個 canonical-first 模式和 `skills/auto/references/delegation-criteria.md`（xd-6bb5 Phase 1）同 pattern — 知識在 skill/template，執行讀 runtime 值，不在 hook hardcode。

---

## Manager 質疑 2：regex 漏 nova CLI — ⚠️ 部分 accept（+ 補證）

### nb 實測

執行 `type nova` 盤 shell function 內容，**`nova` 沒有 `dispatch` subcommand**：

```
nova () {
    case "$1" in
        (session) ... | (layout) ... | (wrapup) ... | (collect|reflect|persist) ...
        | (spec) ... | (component) ... | (auto) ... | (probe) ...
        | (health-check) ... | (score) ... | (feedback) ... | (init) ... | (tmux) ...
        | (help|-h|--help) ...
        (*) make -C ~/.claude "$@" ;;  ← fall-through 到 Makefile
    esac
}
```

`nova dispatch nova-brain "..."` 實際會走 `make -C ~/.claude dispatch nova-brain "..."`，而 `~/.claude/Makefile` 也**沒有 `dispatch` target**（我查了 Makefile 源碼確認）。

**結論**：Manager 可能是**記錯**或**用了我不知道的 alias**。實際 dispatch 路徑只有：
- `curl -X POST http://127.0.0.1:3457/api/cross-dispatch`（主要）
- 可能未來加的 CLI（目前不存在）

### 但 nb 仍 accept 做寬 regex（防禦）

即使目前 `nova dispatch` 不存在，Manager 的底層擔心「hook 要覆蓋所有 dispatch 路徑」**完全正確**。Phase B hook 會用防禦性 regex：

```js
// 正面清單：任何 dispatch 路徑都算
const isDispatch = /cross-dispatch|nova\s+dispatch|nova-dispatch/i.test(cmd);
// 目標類型：executor agent（未來可能擴 planner/reviewer，但先 MVP）
const isExecutor = /executor|implementation|impl-agent/i.test(cmd);
if (!isDispatch || !isExecutor) return null;
```

**好處**：未來使用者或 Manager 加 `nova dispatch` alias / bin 時不用改 hook。符合 Postel's Law（「接收端寬容」）。

### 要求 Manager 澄清

若 Manager 確定 `nova dispatch` 存在，請提供 `type nova dispatch` 或 which 輸出，nb 可再調 regex。若只是口誤，本段結論即可。

---

## Manager 質疑 3：降 verdict=failed 的 UX 鏈路 — ✅ 完全 accept

### nb 實測 nova-server SSE 基礎設施

查 `/Users/sbu/projects/nova-server/api/cross-dispatch.js` 已有 3 個 broadcast 點：

| line | event type | 觸發 |
|------|-----------|------|
| 119 | `cross_dispatch` | POST /cross-dispatch 建立新派單 |
| 193 | `cross_dispatch_ack` | POST /ack 送達確認 |
| 310 | result broadcast（complete） | POST /complete 回報 |

**SSE 鏈路基本已通**。Phase A 時 ns 派單只需**小增量**：

```js
// api/cross-dispatch.js line ~310 附近擴欄位
ctx?.broadcast?.({
  type: "cross_dispatch_complete",
  id, target_cwd,
  verdict: body.verdict,
  criteria_result: body.criteria_result,  // ← 新增：{ passed: N, failed: M, checks: [...] }
  criteria_failed: body.criteria_result?.failed > 0,  // ← 新增：方便 UI filter
});
```

**Nova Control App（我本 session 之前建的 Swift 前端）** 訂閱這 event 後可顯示 `criteria_failed` badge，或 Telegram bot 偵測到 `criteria_failed=true` 時 push 通知 Manager。

### Phase A 派單 acceptance_criteria 要含此

派 ns executor 時 criteria 明示：

```json
[
  { "type": "test_pass", "cmd": "bun test tests/unit/api/cross-dispatch.test.js" },
  { "type": "grep_match", "pattern": "criteria_result", "file": "api/cross-dispatch.js", "min_count": 1 },
  { "type": "grep_match", "pattern": "criteria_failed", "file": "api/cross-dispatch.js", "min_count": 1 }
]
```

這樣 Phase A 完成時自動驗 SSE 擴欄位**真的接了**，不是光紙上談兵。

---

## nb 節奏選擇：B + 分段 implement

Manager 提供 A/B/C 三選項：
- A. 立即進 Phase B（小）
- B. **先 revise Round 1 細節再進 Phase B** ← nb 選
- C. 其他節奏

**選 B 理由**：
1. Round 1 markers 錯 + regex 不精準若不 revise，直接 implement 會帶著錯誤落地（canonical 原則違反）
2. 本 Round 2 已把 canonical-first 實作細節寫清楚，Phase B implementation 可直接照抄
3. 分段 implement：本 dispatch（xd-uvq3）先 **verdict=iterate + 交付 Round 2 discussion**，下一個 commit cycle 再 implement Phase B hook + test

### Phase B implement plan（下一步）

- 檔案：`~/.claude/hooks/modules/executor-dispatch-template-enforcer.js`（新）
- 測試：`~/projects/nova-brain/tests/unit/hooks/executor-dispatch-template-enforcer.test.js`（新 ≥ 5 case）
- 接線：`~/.claude/hooks/hook-client.js` LOCAL_MODULES
- Rule case：
  1. loadRequiredSections 讀檔成功 + prompt 含全 section → `null`（pass）
  2. loadRequiredSections 讀檔成功 + prompt 缺 Section 1 → `systemMessage`（warn）
  3. loadRequiredSections 讀檔失敗 → `null`（fail-open，不擋）
  4. 非 Bash tool 或非 dispatch curl → `null`（skip）
  5. dispatch 但非 executor target → `null`（skip）

估計 ≈ 30 min 可 commit（符合 delegation-criteria.md §4 score=3 直接做）。

### Phase A implement plan（nb 派 executor + ns dispatch）

待 Phase B 落地後另派 executor + ns dispatch。本 Round 2 不實作。

---

## 關於 Manager「不 block 可自主決定」

Manager Round 2 結尾「三輕量質疑 nb 選擇回應或直接 implement」— nb 選**回應先行**：

- Round 2 書面回覆讓 Round 1 錯誤在共享 spec 留下 record（而不是 silently revise implementation）
- 便於未來其他 session 讀本討論史時看清演化脈絡
- 符合 `rules/協作/討論式派發持久化.md` 原則

---

## nb Round 2 verdict: iterate

接受 Manager 3 質疑，下一個 commit cycle 進 Phase B implement。等 Manager 看 Round 2：

- 若無異議（或時限內 passive accept）→ nb 啟 Phase B hook 實作
- 若對 canonical-first 實作或防禦性 regex 有質疑 → Round 3

### next_action_proposal

```yaml
verdict: iterate
proposal:
  - Phase B hook (executor-dispatch-template-enforcer.js) 依本 Round 2 設計實作
  - 讀 canonical template runtime（不 hardcode markers）
  - 防禦性 regex 覆蓋 cross-dispatch + nova dispatch（即使後者目前不存在）
  - 5+ test case 鎖定行為
estimated_cost: ~30 min（hook ~80 行 + test ~120 行）
blockers:
  - Manager Round 2 passive accept 時限（normal=24h）或明示 accept
clarifying_questions:
  - 若 Manager 確定 `nova dispatch` CLI 存在，請附 type/which 證據
discovered_adjacencies:
  - canonical-first 模式已在 skills/executor-dispatch/templates/ + delegation-criteria.md
    兩處驗證，可進一步寫入 `rules/協作/canonical-引用驗證.md` 當 pattern example
  - nova-server result broadcast（line 310）擴 criteria_result 欄位後，Nova Control App
    Swift 前端可獨立加一條 criteria_failed badge UI（out of this spec scope）
```

---

## 檔案清單

- 本檔：`/Users/sbu/projects/nova-brain/spec/討論/dispatch-quality-closure-v2-nb-round2.md`
- 同步引用：
  - Round 1: `spec/討論/dispatch-quality-closure-v2-nb-round1.md`
  - Manager spec: `/Users/sbu/projects/nova-manager/spec/討論/dispatch-quality-closure-v2.md`
  - Canonical template: `~/.claude/skills/executor-dispatch/templates/base.md`
  - ns SSE 基礎: `/Users/sbu/projects/nova-server/api/cross-dispatch.js` line 119/193/310
