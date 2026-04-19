# Dogfooding Hook 設計討論（xd-72ql）

> P0 補洞第 1 輪。Manager 5 質疑 + target 反駁 + 設計版本。

## 1. 反駁 Manager 5 質疑

### Q1：偵測時機

**反駁選項 b（PreCommit block）**。組合 **a + c**。

理由：
- ❌ **PreCommit block** 錯：commit 是 atomic 保存進度的操作，不該綁 dogfood。設計階段往往需要 iterative commit（試 → 改 → 試），block commit 會強迫 AI 把多次嘗試擠進一次 commit，破壞 git 歷史品質。**commit ≠ ship**。
- ✅ **PostToolUse Edit/Write systemMessage**（a）：當下警告，靠 AI 看到後決定是否立即 dogfood。不 block 因為設計階段需要先寫完才能 dogfood。
- ✅ **PostCompact / SessionStart 跨 session 提醒**（c）：長尾防護。下次接續 session 時若仍無 dogfood 證據，注入 reminder。

**組合方案**：a 即時警告 + c 跨 session 持續提醒。兩者都不 block。

### Q2：哪些路徑該觸發

**反駁 Manager「設計類 vs 工具類」分法**。我的判準：**「會改變 runtime 行為」**。

| 路徑 | 觸發？ | 理由 |
|------|:----:|------|
| `rules/品質/*.md` | ✅ | 規範新行為，需驗證 |
| `rules/核心/*.md` | ✅ | 包含 agent-harness.md 這類新概念 |
| `scripts/component-*.js` | ✅ | 被 component-scan/lifecycle 呼叫 |
| `scripts/self-compact.js`, `scripts/lib/*.js` | ✅ | 被 hook/CLI 呼叫，runtime 路徑 |
| `hooks/modules/*.js` | ✅ | **直接改 runtime**（xd-5mja META BLIND SPOT 是反例 — 應該走 dogfooding） |
| `skills/*/SKILL.md` | ⚠️ 條件 | 純知識被讀時生效，不改 runtime → 不觸發。但若 skill 配 `references/*.md` 含可執行 script 或新 metric → 觸發 |
| `scripts/*.js`（非 component-/lib/）| ⚠️ 條件 | 工具腳本（如 audit-scan.sh）觸發；one-off 修復腳本不觸發 |
| `commands/*.md` | ⚠️ 條件 | 若呼叫新 script 則觸發；純文字包裝不 |

**反駁 Manager「skills 新建算不算」**：純 SKILL.md 不算，因為 skill 在被讀的當下就已驗證有效（讀不到 = 立即發現），不需要額外 dogfood。但若 skill 含 references 子檔（如 protocols.md, schema.json）含可執行內容則算。

### Q3：dogfooding 證據怎麼界定

**反駁「含 dogfooding 字樣」太弱（同意 Manager）**。但**也反駁「commit message 含 dogfood(xxx)」太機械**（AI 可造假）。

我的判準：**runtime trace 為主，spec 文字為輔**。

驗證鏈三選一（OR）：
1. **Runtime artifact 變更**：`data/*.json` 新建或修改（如 scan 結果）OR `reflections.jsonl` 含新 entry
2. **Hook execution log**：新建 hook 的 log 顯示 24h（或下 5 commits）內被觸發 ≥ 1 次
3. **Spec 執行結果段**：`spec/討論/*.md` 含明確「執行結果」段 + 至少 1 個數字（如「修正前 13/36 → 修正後 5/36」）

**為什麼 OR 而非 AND**：不同類型元件 dogfood 證據不同。data 派生（scan）走 1，hook 派生走 2，討論派生走 3。AND 會排除合理情境。

**反駁 commit message 標記**：commit msg 是 AI 寫的字串，hook 無法判斷是否屬實。Runtime trace 才是物證。

### Q4：時窗合理嗎

**反駁 24h 絕對時間 + 反駁 session-end gate**。

- ❌ 24h 絕對時間：不適合 ralph-loop。本 session 例 xd-ycmm Phase 0a → xd-m61x dogfood 跨 3 輪 session，跨日完成
- ❌ Session-end gate：太晚，session 結束才檢查 = 該 ship 的已 ship 出去
- ❌ 純 N commits：N 太小 (3) 太緊，N 太大 (10) 失效

**我的版本**：**雙條件 OR**
1. **時間**：跨 SessionStart 偵測（任何下次 session start 時 hook 檢查未 dogfood 元件）
2. **commit count**：本 session 後續 commits 計數 ≥ 5 仍無 dogfood → 升級 systemMessage

雙條件解決：
- 跨 session 模式（ralph-loop）靠條件 1 持續提醒
- 單 session 高頻 commit 靠條件 2 catch

兩者**都不 block**，只 systemMessage 警告（避免破壞 commit/session 流）。

### Q5：假陽性成本 + bypass

**接受 Manager 質疑**。需要 bypass 機制 + hook 疲勞防護。

**Bypass**：
- `git commit` message 含 `[no-dogfood: <rationale>]` 標記，且 rationale 字串長度 ≥ 30 字符（強制 AI 思考為何不 dogfood）
- 反駁「短密碼短語」：太短會被當魔法字串濫用，30 字符強制具體理由

**Hook 疲勞防護**：
- 相同元件路徑 24h 內只警告 1 次（hook state cache key = file path）
- 連續 3 次提醒未 dogfood → 自動降級 warn-only（fail-open，不 block 不繼續刷屏）
- 參考 reviewer-enforcer 的 `block_count > 2 → fail-open` pattern

---

## 2. 我的設計版本（精簡）

### Hook 元數據

| 項 | 值 |
|----|----|
| Module | `hooks/modules/dogfooding-tracker.js` |
| Events | `PostToolUse:Edit`, `PostToolUse:Write`, `SessionStart`, `Stop` |
| State | `~/.claude/state/dogfooding-pending-{session_id}.json` |
| 影響 | systemMessage only，不 block |

### State Schema

```json
{
  "pending": [
    {
      "path": "rules/品質/元件孵化.md",
      "created_at": "2026-04-14T00:30:00Z",
      "commits_since": 0,
      "warning_count": 0,
      "category": "rule",
      "bypass_reason": null
    }
  ]
}
```

### 觸發邏輯

```
PostToolUse:Edit/Write
  → 偵測新建/修改 path 是否符合「會改變 runtime 行為」清單（Q2）
  → 是 → 加入 pending（若未存在）
  → systemMessage: "⚠️ 新元件 X 需 dogfooding 驗證（runtime trace / hook log / spec 執行結果三選一）"

SessionStart
  → 讀 pending list
  → 對每項檢查 dogfooding 證據（Q3 三選一）
  → 通過 → 從 pending 移除
  → 未通過 → systemMessage 提醒（per warning_count 升級）

Stop
  → 增加 commits_since
  → 若 commits_since >= 5 且未 dogfood → systemMessage 升級
  → warning_count >= 3 → fail-open warn-only

git commit msg 含 [no-dogfood: <30+ char rationale>]
  → 寫入 bypass_reason 從 pending 移除
```

### 證據驗證 helpers

```js
// 1. Runtime artifact (data/ or reflections.jsonl 在元件 created_at 之後有變更)
function hasRuntimeArtifact(path, sinceTs) { ... }

// 2. Hook execution log (僅對 hooks/modules/*.js)
function hasHookExecutionLog(modulePath, sinceTs) { ... }

// 3. Spec 執行結果段 (search spec/討論/*.md 含元件名 + 「執行結果」段 + 數字)
function hasSpecExecutionSection(componentName) { ... }

// 任一成立即算 dogfood 通過
function isDogfooded(item) {
  return hasRuntimeArtifact(item.path, item.created_at) ||
         hasHookExecutionLog(item.path, item.created_at) ||
         hasSpecExecutionSection(item.path);
}
```

### 觸發路徑判斷

```js
const RUNTIME_AFFECTING = [
  /^rules\/(品質|核心)\/.+\.md$/,
  /^scripts\/(component-|self-|lib\/).+\.js$/,
  /^hooks\/modules\/.+\.js$/,
  /^commands\/.+\.md$/, // 條件：grep script 呼叫
];

function shouldTrack(filePath) {
  return RUNTIME_AFFECTING.some(re => re.test(filePath));
}
```

---

## 3. 反問 Manager（輪 2）

1. 雙條件時窗（SessionStart + 5 commits）vs 單一時窗，你接受哪個？
2. 證據三選一 OR 邏輯是否太鬆？要不要至少加「runtime artifact 必須其中之一」強制？
3. Bypass rationale 30 字符夠強嗎？要不要加 commit log review（偶爾人工抽查）？
4. 純 SKILL.md 不觸發我的判斷正確嗎？（你 Q2 隱含 SKILL.md 應該觸發）
5. fail-open 降級閾值 3 次 vs 5 次？參考 reviewer-enforcer 是 2 次

---

**verdict**：iterate — 設計版本提出但 5 個關鍵決策需 Manager 質疑收斂。

---

## 4. 討論輪 2 回覆（xd-rnhk）

Manager 接受輪 1 五反駁，提 3 個實質盲點。我的回應：

### Q_A：Bypass rationale 30 字符可被濫用 — 你對，但反駁解法

**承認**：30 字符底線不夠，「[no-dogfood: 這只是小修改不需要測試]」剛好 30 字看起來合理但空洞。

**反駁 grep 關鍵字方案**：脆弱。AI 會學會湊關鍵字（「不影響 runtime / pure refactor / typo fix」），變成新的魔法字串問題。

**我的修正版（trace + budget 雙管）**：

1. **Hook log 記每次 bypass 全文**：寫入 `~/.claude/state/dogfooding-bypasses.jsonl`，含 `{ts, repo, file, rationale, commit_hash}`。事後 Manager/使用者可週期抽查（不影響 hot path）。
2. **行為配額（rolling budget）**：每個 repo 在 30 天內 bypass 次數 ≤ 3。超過 → 第 4 次自動 block 一次強制 dogfood（不是降級而是強制 escalation）。
3. **可選的彈性**：使用者明示（commit msg 含 `[bypass-budget-override: <reason>]`）可重置 budget，但同樣 log 進 jsonl。

理由：字串檢查是脆弱的（任何 length / keyword / regex 都會被學會繞過），但「次數限制 + 事後可追蹤」是結構性防護 — AI 無法繞過配額。

### Q_B：State scope session_id 錯 — 完全認輸

**你完全對**。session_id scoped 會在 session 替換/compact 後丟 pending。本 session 例 xd-ycmm → xd-m61x 跨 session 就是真實踩雷案例。

**反駁 cwd_hash**：cwd 同 repo 內變化（subdir）會不一致 — 從 `~/projects/nova-brain/spec/` 切換到 `~/projects/nova-brain/` 會被當不同 cwd。

**反駁 repo-internal `<repo>/.claude/state/`**：兩個問題：
1. 若 repo 是 `~/.claude/` 本身會遞迴成 `~/.claude/.claude/state/`
2. state 進 git 會污染 commit history（每次 hook 觸發都 dirty）

**我的版本**：**repo-name scoped 但放 ~/.claude/state/**：
- 路徑：`~/.claude/state/dogfooding-pending-{repo-name}.json`
- repo-name 派生：`git rev-parse --show-toplevel | xargs basename` 或 fallback `basename $(pwd)`
- 跨 session ✓ 跨 subdir ✓ 不污染 git ✓ 避免遞迴 ✓
- 缺點：跨 machine 不同步（state 不在 git 內）— 但 dogfooding tracking 本來就是 local 行為，跨 machine 不必同步

### Q_C：Stop ≠ commit 計時機錯 — 認輸 + 修正

**你對。是我的 bug**。Stop hook 在 session 每次 stop 都觸發（可能數十次），但 commit 可能只有 1 次。`commits_since` 用 Stop hook 增量是錯誤的計數。

**修正**：`PostToolUse:Bash` 偵測 command 含 `git commit`（且 exit=0 表示成功）→ 增量 `commits_since`。

具體判斷：
```js
function onPostBash(input) {
  const cmd = input?.tool_input?.command || "";
  if (!/\bgit\s+commit\b/.test(cmd)) return;
  if (input?.tool_response?.exitCode !== 0) return;
  // 增量所有 pending 元件的 commits_since
  const state = loadState(repoName);
  for (const item of state.pending) item.commits_since += 1;
  saveState(repoName, state);
}
```

**反駁 PreCompact 跑 git log 實算**：可行但比較重（每次 PreCompact spawn git）。PostToolUse 細粒度增量更輕量，且 commit 是離散事件本來就該 hook 偵測。

---

### 修正版設計（彙整輪 1+輪 2）

| 項 | 輪 1 | 輪 2 修正 |
|----|------|----------|
| State 路徑 | `~/.claude/state/dogfooding-pending-{session_id}.json` | `~/.claude/state/dogfooding-pending-{repo-name}.json` |
| commits_since 觸發 | Stop hook | PostToolUse:Bash + `git commit` + exit=0 |
| Bypass 機制 | `[no-dogfood: 30+ char]` | + `~/.claude/state/dogfooding-bypasses.jsonl` 全文 log + 30-day rolling budget ≤ 3 + 第 4 次強制 escalation |
| Hook events | PostToolUse:Edit/Write + SessionStart + Stop | PostToolUse:Edit/Write + PostToolUse:Bash + SessionStart |

Stop hook **移除**（commits_since 不靠它），保留 PostToolUse:Bash 取代。

### 反問 Manager（輪 3）

1. repo-name scoped state（跨 session/subdir 一致 + 不入 git）vs 你的 cwd_hash/repo-internal — 接受嗎？
2. Bypass budget 30 天 ≤ 3 vs 7 天 ≤ 1 vs 30 天 ≤ 5 — 哪個基線合理？
3. PostToolUse:Bash + git commit 偵測接受嗎？還是有更精準觸發點？
4. 還有沒有第 4 個盲點？若無 → 我準備派實作 ~3h

---

## 5. 討論輪 3 — Q_D 冷啟動 + 收斂授權

### Q_D：冷啟動問題 — 真盲點接受

承認真盲點。如果元件在 session 最後 3 分鐘建立，下次 SessionStart 立即警告會疲勞誤觸。

**反駁 Manager 的 5 min 絕對時間**：5 min 武斷，不適合 ralph-loop 跨 session 模式。

**我的修正 — 雙條件 grace**：
```
warning 條件 = commits_since >= 1 OR session_count >= 2
冷啟動 = NOT (commits_since >= 1 OR session_count >= 2)
       = commits_since == 0 AND session_count == 1
```

語意：
- 同 session 內元件未 commit（仍在開發階段）→ skip warning（commits_since==0 且 session_count==1）
- 同 session 內已 commit 1 次（開發完成）→ 開始警告
- 跨 session（session_count >= 2）→ 開始警告（已給夠時間）

state schema 加 `session_count` 欄位，每次 SessionStart 對所有 pending 增量。

### 最終彙整版（輪 1+2+3 收斂）

| 設計點 | 最終決定 |
|--------|---------|
| Hook 名 | `hooks/modules/dogfooding-tracker.js` |
| Events | `PostToolUse:Edit/Write/Bash`, `SessionStart` |
| State 路徑 | `~/.claude/state/dogfooding-pending-{repo-name}.json` |
| Bypass log | `~/.claude/state/dogfooding-bypasses.jsonl` |
| Budget | 30 天 ≤ 3 次（config 化放 component-lifecycle.json） |
| commits_since 觸發 | PostToolUse:Bash + `git commit` + exit=0 |
| Cold-start grace | `commits_since == 0 AND session_count == 1` skip warning |
| Warning 升級 | warning_count >= 3 systemMessage 加重；>= 5 fail-open warn-only |
| Bypass 機制 | commit msg `[no-dogfood: <30+ char>]` + budget 配額 |
| 證據驗證 | runtime artifact OR hook log OR spec execution section |
| 觸發路徑 regex | RUNTIME_AFFECTING（rules/品質\|核心、scripts/component-\|self-\|lib/、hooks/modules/、commands/）|
| 執行模式 | systemMessage only，不 block 任何操作 |

config 加區段：
```json
"dogfooding_budget": {
  "_rule": "30 天 rolling 內 bypass 次數上限",
  "max_bypasses": 3,
  "window_days": 30
}
```

### 收斂授權執行

Manager 已授權自主執行。下方執行區段記錄實作步驟與驗證：

**實作步驟**：
1. ✅ 寫輪 3 spec 段（本段）
2. → 實作 hooks/modules/dogfooding-tracker.js
3. → config/component-lifecycle.json 加 dogfooding_budget
4. → LOCAL_MODULES 註冊
5. → tests/unit/dogfooding-tracker.test.js ≥ 8 cases
6. → 架構測試確認接線
7. → commit
8. → complete dispatch

verdict 將改為 **continue** 表示實作後待 P1 開場。



**成本估算**（若收斂後派實作）：
- hook module + 3 helper: ~1.5h
- state schema + cache: ~30 min
- LOCAL_MODULES 註冊 + 架構測試: ~15 min
- unit test (≥ 8 case): ~45 min
- **總**: ~3h（比原估 1h 更實際，因為要跨 session state + 三種證據驗證）
