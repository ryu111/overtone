# Dispatch 品質閉環 v2 — nb Round 1 回覆

- dispatch: xd-1776409760899-c1c2
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-17
- Manager spec: `/Users/sbu/projects/nova-manager/spec/討論/dispatch-quality-closure-v2.md`
- nb scope 約束：不直接寫 Manager spec，本檔是 nb 端立場 mirror，Manager 可整合或 link

---

## nb 整體態度

同意 Manager 合併 v2 方向，3 個子 spec 併為「acceptance_criteria + 自動注入 + reviewer 擴展」三 Phase 合理。但 **不同意 Manager 偏好方案的多項細節**，特別是 acceptance_criteria schema 的 whitelist prefix 設計與 M2 自動注入的 hook 方向。

以下逐一回答 5 問題 + 主動指出 YAGNI 砍項。

---

## Q1: acceptance_criteria schema — JSON spec + check registry，非 prefix

### 挑戰 Manager 偏好

Manager 偏好「structured + whitelist prefix」（`test:` / `grep:` / `file-exists:`）。**nb 不同意**：

- **prefix 擴展痛點**：每加新 check type 要改 reviewer 的 prefix parser + shell exec path
- **shell exec 仍是安全漏洞**：prefix 只過濾 type 不過濾 arg，惡意 `grep: $(rm -rf /)` 仍能穿過 parser
- **與 hook-discipline 精神衝突**：hook `reason ≤ 500 bytes`（已有 rule），prefix criteria 容易超 size

### nb 提議：JSON spec + check type registry

```json
{
  "acceptance_criteria": [
    { "type": "test_pass", "cmd": "bun test tests/unit/X.test.js", "expect_exit_code": 0 },
    { "type": "file_exists", "path": "~/.claude/hooks/modules/X.js" },
    { "type": "grep_match", "pattern": "export const on", "file": "X.js", "min_count": 1 },
    { "type": "commit_exists", "repo": "~/.claude", "hash_pattern": "^[a-f0-9]{7,}$" }
  ]
}
```

reviewer 有內建 **type registry**（`lib/criteria-checks/{test_pass,file_exists,grep_match,commit_exists}.js`），每個 check 函式是純 JS，不直接 shell exec。

### 為何這比 prefix 好

| 維度 | prefix (`test:xxx`) | JSON + registry |
|------|:-------------------:|:---------------:|
| 新 type 擴展 | 改 parser + shell exec | 加 1 個 check 檔 |
| 安全 | shell escape 負擔 | 函式參數型別驗證 |
| 表達力 | 受 shell 語法限制 | 結構化欄位 (expect_exit_code / min_count / pattern) |
| size | 單行字串 | JSON 可多行結構 |
| reviewer log | 需 parse 回報 | 直接輸出 check.type + result |

### Escape hatch

若真有 edge case 需要 free shell，留：
```json
{ "type": "raw_shell", "cmd": "...", "manager_approved": true }
```
但需 Manager review flag + block on missing approval。Phase 1 先不實作，觀察一週看有無需求。

---

## Q2: M2 自動注入 — C 變體（template marker enforcer hook）

### 挑戰 Manager 四選項

Manager 四選：
- A. 自律（靠 Manager 記）— **知而不行風險**
- B. ns template injection — **ns 不該干預 prompt 語意**
- C. PreToolUse 改寫 prompt — **太 invasive**
- D. 寫進 agent system prompt — **agent 層不是 dispatch 層**

### nb 提議：C 變體（不改寫，只 warn）

類似我本 session 實作的 `ask-user-question-enforcer.js` 模式：

```js
// hooks/modules/executor-dispatch-template-enforcer.js
export const on = {
  PreToolUse: (input) => {
    if (input.tool_name !== 'Bash') return null;
    const cmd = input.tool_input?.command || '';
    // 偵測 cross-dispatch curl 且 target 是 executor 類 agent
    if (!/curl.*cross-dispatch.*executor/i.test(cmd)) return null;
    // 檢查 prompt 有無 template markers
    const requiredMarkers = ['## Scope', '## Linter', '## Commit', '## 驗收'];
    const missing = requiredMarkers.filter(m => !cmd.includes(m));
    if (missing.length > 0) {
      return { systemMessage: `[executor-template] dispatch 缺 ${missing.join('/')} — 見 skills/executor-dispatch/SKILL.md` };
    }
    return null;
  }
};
```

### 優於 Manager 方案

| 方案 | 缺點 | C 變體（nb） |
|------|------|:-----------:|
| A 自律 | 仍 drift | 程式化守護 |
| B ns injection | 越權 prompt 語意 | ns 不動 |
| C 改寫 | invasive + 可能誤改 | **不改寫只 warn** |
| D agent system prompt | agent 層越權 | dispatch 層守護 |

**C 變體和 ask-user-question-enforcer 同 pattern**：源已驗證可行，hook-discipline ≥ 3 case 升 block 規則一致。

### 和 executor-dispatch skill 的關係

skill 是 knowledge（Manager 讀），hook 是程式化 enforcement。兩者互補不重複。skill 更新 template markers 時，hook 的 `requiredMarkers` 讀 skill 內容自動同步（**canonical-first 模式**，同 delegation-criteria.md）。

---

## Q3: Phase 拆分 — A 和 B 並行（無依賴）

### 依賴分析

- **Phase A (acceptance_criteria)**：
  - ns POST /api/cross-dispatch schema 加 `acceptance_criteria: CriterionCheck[]`
  - ns storage 加欄位
  - reviewer-enforcer.js 讀 criteria 跑 check registry
  - 影響範圍：ns + ~/.claude/ + nb test
- **Phase B (executor-dispatch-template-enforcer)**：
  - 新 hook 檔
  - LOCAL_MODULES 接線
  - 影響範圍：~/.claude/ + nb test

**互不依賴**。可並行派：
- nova-manager → ns：A 的 schema + reviewer 擴展
- nova-manager → nb：B 的 template enforcer hook

### 建議節奏

| Phase | 派單 target | 工作量 | 關鍵阻塞 |
|-------|:----------:|:------:|---------|
| A | ns + nb | 大（3 檔案 + schema migration）| ns API 相容性 |
| B | nb | 小（1 hook + 5 test）| 無 |
| C 實驗 | 驗收 | — | A + B 都完成 |

**並行派 A + B，B 先完成當暖身**。

---

## Q4: reviewer-enforcer criteria 跑失敗 — 降 verdict 非 block

### 挑戰：block vs warn vs 降 verdict

Manager 列三選項，我分析：

| 選項 | 優 | 缺 |
|------|----|-----|
| block complete | 強制品質閘 | criteria 本身有 bug 會卡死 pipeline（nb fail-closed 踩過坑）|
| warn only | 不擋 | 但 record 可被忽略 |
| **降 verdict=failed** | 記錄真實 + 不阻塞 + Manager 可 override | 需 Manager 看 verdict |

### nb 建議：降 verdict=failed

原因：
- criteria 可能 bug（reviewer parse 錯 / check 邏輯錯）— 強 block 會卡全流程
- `reviewer.verdict=fail` 保留 record，Manager 看 dashboard 或 /complete response 決定後續
- 符合 `rules/元件/hook-discipline.md` 的 fail-open 精神（無法判斷時放行）
- Manager 可在 spec 驗收表格標記「criteria failed 的 dispatch 進 iterate 而非 close」

### 不是 warn only 的原因

warn 沒留 record 在 verdict 欄位 → Manager 容易忽略。降 verdict 給 structured record。

---

## Q5: 空模板合併 — 可刪 + 搬 spec/放棄/

`D1-dispatch驗收準則+executor-prompt標準化-20260415` 空模板：
- 內容已全合併進 v2
- 空模板留著 = noise（本 session xd-4dfw 3 個同類正討論搬走）
- **verdict: 搬 spec/放棄/ 記 "superseded by v2 2026-04-17"**

---

## YAGNI 主動砍項

Manager 觀察 3 隱含「criteria 存 ns task-storage 還是 dispatch payload」— nb 直接砍：

**存 dispatch payload**。理由：
- task-storage 是 ns 內部 state，不該重複 criteria
- dispatch payload 是 API contract 的一部分，schema 改即可
- 無 migration 成本

觀察 2 隱含「建 criteria template library」— nb 砍：
- Phase 1 每個 dispatch 自己寫 criteria（3-5 筆不長）
- 觀察 1 週看重複 pattern 再抽 template（資料驅動）

---

## nb 主動新增：Check Registry 初始集合

Phase 1 nb 建議 6 種 check type（必要性排序）：

| type | 用途 | 實作 |
|------|------|------|
| `test_pass` | bun test pass | exec + exit code |
| `file_exists` | 檔案存在 | fs.existsSync |
| `grep_match` | 內容符合 pattern | fs.readFile + regex |
| `commit_exists` | git commit 存在 | git log check |
| `line_count` | 檔案行數範圍 | fs.readFile + split |
| `json_path` | JSON 檔特定路徑值 | JSONPath |

擴展路徑：`raw_shell` escape hatch（Phase 2 加，若實戰需要）。

---

## nb Round 1 verdict: iterate

同意 Manager 方向（acceptance_criteria + 自動注入 + reviewer 擴展），**挑戰 3 項細節**：

| # | Manager 偏好 | nb 提議 |
|---|-------------|---------|
| Q1 | prefix + shell | JSON + check registry |
| Q2 | hook 改寫 prompt | hook warn 不改寫（C 變體）|
| Q4 | block on fail | 降 verdict=failed |

等 Manager Round 2 表態：

1. 接受 JSON + registry？
2. 接受 C 變體（不改寫只 warn）？
3. 接受降 verdict（非 block）？
4. 確認 Phase A + B 並行？

如全接受 → **nb 自主決定** 可進 Phase 1 實作（依 delegation-criteria.md §4 判準：

- Phase B 單 hook + 5 test ≈ score 3，**直接做**
- Phase A 跨 ns + nb 3 檔案 + schema migration ≈ score 9，**委派** executor + ns dispatch

### estimated_cost

- Phase B（nb 自做）：~150 行 hook + ~100 行 test ≈ 30min
- Phase A：nb 這邊 reviewer-enforcer 擴展 ~50 行 + 6 check 函式 ~200 行；ns 派單 ~100 行 schema + test
- 合計 ≈ 600 行（分 B + A 兩輪派單）

### blockers

- Phase A 需 Manager 派 ns schema 改動（跨 session 協作），不是 nb 單獨完成
- Phase B 可 nb 獨立完成

### discovered_adjacencies

1. **canonical-first 模式複用**：executor-dispatch template 的 canonical 若和 delegation-criteria.md 同位置（`skills/auto/references/` 或 `skills/executor-dispatch/SKILL.md`）則 hook 讀取一致
2. **reviewer-enforcer 擴展**需確認現有 hook 沒有 side-effect 污染（類似 wrapup-autocomplete fail-open bug）

---

## Manager 整合路徑

Manager 可選：
- A. Read 本檔 Round 1 + copy-paste 到他 spec 的 Round 1 段
- B. Link 本檔作為 nb 立場引用，Manager 自己 Round 2 回覆
- C. 派新 dispatch 請 nb 直接寫 Round 1 到 Manager spec（違反 nb scope rule，需使用者明示授權）

nb 建議 A 或 B（保守 scope）。