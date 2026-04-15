# 知而不行 Phase 2 歷史頻率摘要

- 掃描時間: 2026-04-15T11:03:03.545Z
- 輸入: Phase 1 y 類 55 條
- 語料來源: nb/data + nova-manager/data + /tmp/hook-errors.jsonl (存在則掃)
- 方法: keyword substring match（純 regex, 無 LLM）

⚠️ **局限 1**: keyword 含高頻通用詞（如 "hook", "commit", "test"）會膨脹 count，此數字是**相對比較**而非絕對違規次數。真實違規需人工抽樣驗證。
⚠️ **局限 2**: MUST 行內若未含「✓ guard」標記但 rule 檔案其他行有 → filter 漏抓。例如 `模組架構#6` / `總結格式#10` 已有 hook/test 守護但 filter 未濾。Manager 審閱時請對 top-10 逐條查 rule 全文確認。
⚠️ **局限 3**: 中文斷詞純 split-by-delimiter，"Phase"/"Step"/"session" 等英文詞被當 keyword 造成分數膨脹。需人工過濾。

## Top 10 高頻 keyword 命中（候選 hard guard）

| # | must_id | text (摘) | keywords | 總命中 |
|---|---|---|---|---:|
| 1 | `模組架構#6` | 新建 `hooks/modules/*.js` 有 `export const on = { key... | 新建, `hooks, modules | 92791 |
| 2 | `自壓縮#3` | compact 後 ctx 仍 > 40% → 自動開新 session（self-compact.... | compact, ctx, 自動開新 | 46356 |
| 3 | `失敗與修復#9` | `~/.claude/` 下用 Bash（sed/tee），不用 Edit tool。... | claude, 下用, Bash | 46205 |
| 4 | `工具選擇#4` | 觀察 target session 當下輸出用 `nova session peek <proj>`... | 觀察, target, session | 46199 |
| 5 | `元件孵化#9` | Phase 0b（擴 rules/hooks/commands 四維 scan）啟動需 ALL：... | Phase, 0b, rules | 4571 |
| 6 | `深度路由#1` | 動手前依序完成路由步驟：Step 1 深度分類 → Step 1b Domain 分類 → Step... | 動手前依序完成路由步驟, Step, 深度分類 | 4468 |
| 7 | `回饋與進化#8` | 三問完成後必須產出：結論（1-3 條）+ 具體行動（rule/skill/hook/code 修改，... | 三問完成後必須產出, 結論, 具體行動 | 523 |
| 8 | `自驅反思#5` | 每條反思至少 1 個可驗證行動（commit hash / file path / rule nam... | 每條反思至少, 個可驗證行動, commit | 484 |
| 9 | `失敗與修復#5` | 優先自動化防護（hook/lint/test）> 規則（rule）> 記憶（memory）。... | 優先自動化防護, hook, lint | 474 |
| 10 | `agent-harness#1` | 新建 rule/skill/hook 前先決定歸屬支柱，在 frontmatter 註明 `harn... | 新建, rule, skill | 388 |

## Phase 3 推薦 Top 5（優先升 hook）

### 1. `模組架構#6` (命中 92791)

- **條款**: 新建 `hooks/modules/*.js` 有 `export const on = { key: handler }` 時，必須**同步更新** `hooks/hook-client.js` 的 `LOCAL_MODULES` 加入該 module path，否則 runtime 零執行次數（寫好的 hook 形同虛設）。
- **rule path**: `~/.claude/rules/元件/模組架構.md`
- **偵測 hint**: tool-routing / regex/syscall/file-check
- **升 hook 建議**: 視 hint 類型 (git-ops → pre-bash-guard / tool-use → tool-validator / file-path → pre-edit-guard 等)

### 2. `自壓縮#3` (命中 46356)

- **條款**: compact 後 ctx 仍 > 40% → 自動開新 session（self-compact.js 執行）。
- **rule path**: `~/.claude/rules/環境/自壓縮.md`
- **偵測 hint**: file-path / regex/syscall/file-check
- **升 hook 建議**: 視 hint 類型 (git-ops → pre-bash-guard / tool-use → tool-validator / file-path → pre-edit-guard 等)

### 3. `失敗與修復#9` (命中 46205)

- **條款**: `~/.claude/` 下用 Bash（sed/tee），不用 Edit tool。
- **rule path**: `~/.claude/rules/核心/失敗與修復.md`
- **偵測 hint**: tool-routing / regex/syscall/file-check
- **升 hook 建議**: 視 hint 類型 (git-ops → pre-bash-guard / tool-use → tool-validator / file-path → pre-edit-guard 等)

### 4. `工具選擇#4` (命中 46199)

- **條款**: 觀察 target session 當下輸出用 `nova session peek <proj>`，禁用直接 `tmux capture-pane`（例外：`guards.js` 偵測、bootstrap shell、`os/tmux.js` helper 底層）。
- **rule path**: `~/.claude/rules/環境/工具選擇.md`
- **偵測 hint**: file-path / regex/syscall/file-check
- **升 hook 建議**: 視 hint 類型 (git-ops → pre-bash-guard / tool-use → tool-validator / file-path → pre-edit-guard 等)

### 5. `元件孵化#9` (命中 4571)

- **條款**: Phase 0b（擴 rules/hooks/commands 四維 scan）啟動需 ALL：
- **rule path**: `~/.claude/rules/品質/元件孵化.md`
- **偵測 hint**: tool-routing / regex/syscall/file-check
- **升 hook 建議**: 視 hint 類型 (git-ops → pre-bash-guard / tool-use → tool-validator / file-path → pre-edit-guard 等)


## Phase 3 scope 預估

- 每條 hook 實作 + unit test: ~30-60 min
- Top 5 全做: ~3-5h，建議拆 2-3 子 dispatch (Top 3 先、剩餘後)
- 或 Manager 抽樣 Top 10 取最有 ROI 前 3 條先做
