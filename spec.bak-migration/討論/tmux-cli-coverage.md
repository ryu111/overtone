# tmux 直用 vs nova-cli 統一入口的 CLI 覆蓋缺口

## 背景

xd-39z1 (2026-04-14) Manager 觀察：想「peek nova-brain session 當下輸出」，直覺用 `nova session send nova-brain /dev/null`，結果誤派 `/dev/null` dispatch 到 target queue（xd-m5jh，已 noop close）。根因是 nova-cli 沒 peek 子命令，Manager 腦補 send 能當 peek。討論：要不要把 tmux 操作全包進 nova-cli？

## (a) 盤點：直接使用 tmux 的位置

| # | 呼叫者 | tmux 命令 | 為什麼沒走 nova-cli |
|---|--------|-----------|--------------------|
| 1 | `hooks/modules/guards.js:171` | `tmux capture-pane` 加白名單 | guard 的 query whitelist，不是執行 — 合理直用 |
| 2 | `hooks/modules/guards.js:319-330` | 偵測 `tmux send-keys` 跨 pane 警告 | 偵測器，不是執行 — 合理直用 |
| 3 | `skills/dispatch-lifecycle/SKILL.md:38` | 教學文字 `tmux list-sessions` | 文件例子，不算真用 |
| 4 | `scripts/wake-sessions.js:61` | `tmux list-windows` 查 window 名稱 | 內部 script，無 nova-cli 對應 |
| 5 | `scripts/wake-sessions.js:78-89` | `tmux new-window` 開視窗 | 內部 script，`nova session start` 走自己的路徑不涵蓋 new-window 細節 |
| 6 | `scripts/wake-sessions.js:102` | `tmux send-keys 'claude -c' Enter` | 冷啟動必要動作，無 nova-cli 對應 |
| 7 | `scripts/session-rename.js:35` | `tmux list-panes -a -F ...` 取 pane 資訊 | 內部 script |
| 8 | `scripts/os/tmux.js:27` | `tmux list-sessions` | OS 層 helper，本身就是 nova-cli 底層實作 |
| 9 | `scripts/os/tmux.js:77` | `tmux new-session` | helper 底層 |
| 10 | `scripts/os/tmux.js:106` | `tmux send-keys Enter` | helper 底層 |
| 11 | `scripts/os/tmux.js:122,141` | `tmux capture-pane -p -S -<lines>` | helper 底層 `capturePane()` — **已有但未掛 CLI** |
| 12 | `scripts/os/tmux.js:188` | `tmux kill-session` | helper 底層（`nova session stop` 有走這） |
| 13 | `scripts/nova-start.sh:43-55` | `tmux new-session` / `send-keys` / `attach` | bootstrap shell script |
| 14 | `skills/auto-drive/SKILL.md:22,46` | 故障排查表 `tmux list-sessions` 建議 | 教學文件 |

**關鍵觀察**：
- 真正 **執行層** 的直 tmux 都集中在 `scripts/os/tmux.js`（helper）+ `scripts/wake-sessions.js` + `scripts/nova-start.sh`（bootstrap）— 這些屬於 CLI 底層實作，本身就是 nova-cli 的 provider
- **缺口真正痛點**：`capturePane()` 已存在於 `os/tmux.js:122` 但 **未掛 nova-cli 子命令**。manager/target session 想 peek 沒有 `nova session peek <name>` 可用 → 直覺腦補 send 當 peek 就踩雷
- `send-keys` 單鍵操作（enter/y/n）沒 CLI 對應（`session send` 只走 dispatch API 不走 tmux）
- `follow`（tail pane）完全沒有
- `screenshot`（存檔供 agent 分析）完全沒有

## (b) 根因分析

三層根因：

1. **CLI 設計時只想到「操作 session 生命週期」不包含「觀察 session 狀態」**。list/start/stop/restart 覆蓋生命週期，但 peek/follow/screenshot 屬於觀察類動作，不是改變狀態。CLI 作者（Manager 過去的某次設計）可能認為觀察屬於使用者直接 tmux attach 就好，沒想到 agent 也需要 peek。

2. **Agent 需要「程式化觀察」但沒想到 tooling**。Manager agent 跨 session 協調時，需要知道 target 現在在 prompt 等待？還是跑 bash？還是卡住？這個需求 human 用 attach 解決、agent 必須透過 capture-pane → 但這條路徑無官方包裝 → 每次 agent 想這麼做就得用 Bash raw tmux。

3. **`send` 語義衝突**。`nova session send` 目前走 dispatch API（寫 /api/cross-dispatch），而非 tmux send-keys。名字相同、語義不同，Manager 記憶混淆自然腦補。治標改名，治本加 peek。

## (c) 方案

### 方案 A：全包（tmux 全部操作都有 nova-cli 對應）

**改動**：把 `os/tmux.js` 所有 exported helper 全開 CLI 對應子命令：`peek / follow / send-keys / new-window / select-window / kill-session / attach-helper / capture-all`

**成本**：高。8+ 個子命令 + 每個要 help 文件 + test。

**覆蓋面**：最高，學習成本最低（只要記 nova-cli），誤操作最少（統一入口）。

**Tradeoff**：
- (+) 純 agent-facing CLI，Manager 不再需要記 tmux flag
- (-) 實作量大，每次 tmux 新功能要再包
- (-) 包裝後反而 debug 困難（tmux 原生錯誤被吞）
- (-) 彈性降低（例如 `tmux list-panes -a -F <format>` 有複雜 format spec，CLI 無法全包）

### 方案 B：補關鍵缺口（推薦）

**改動**：只補 **3 個高頻觀察類** 子命令：
1. `nova session peek <name> [--lines N]` → 背後呼 `os/tmux.js::capturePane()`（helper 已存在，只補 CLI 接線）
2. `nova session follow <name>` → tail mode，pipe capture-pane 每 1s
3. `nova session press <name> <key>` → `tmux send-keys -t <pane> <key>`（單鍵 enter/y/n），避開 send 語義衝突

其他（new-window, select-pane, screenshot）留原生 tmux，agent 透過 Bash 直接跑即可。

**成本**：低。capturePane 已有 helper，peek 只要接 CLI 2-3 行；follow 加 interval loop；press 寫一個薄 wrapper。總計 ~40 行 + 3 個 test。

**覆蓋面**：中高。精準對準 Manager 今天踩雷的位置 + agent 最高頻需求，其他保留原生彈性。

**Tradeoff**：
- (+) YAGNI 友善，只加痛點真的證實的 3 個
- (+) 保留 tmux 原生彈性（select-pane/format 複雜 flag 走 Bash）
- (-) 仍有「哪些包了哪些沒包」的認知切換成本
- (-) 未來新痛點還會再補

### 方案 C：教學文件路線

**改動**：不改 CLI，寫 skill 或 rule：
- `rules/環境/tmux-用法清單.md`：「禁用命令清單」+「對應 nova-cli 等價」+「允許直用 tmux 的例外」
- 加入 `rules/環境/工具選擇.md` 現有文件作為子段

**成本**：最低。只寫文件。

**覆蓋面**：低。依賴 agent 記住 rule，無程式化守護。Manager 今天犯的錯是 brain fart（rule 即使存在也可能忘），文件無法防止。

**Tradeoff**：
- (+) 零實作成本
- (-) 無強制力，反模式會復發
- (-) 只能描述現狀不能改善體驗

### 方案 D：混合（B + hook 守護）

**改動**：方案 B 的 3 個 CLI 補上，**加上** `guards.js` 偵測 Bash `tmux capture-pane` 直用 → systemMessage 提示「建議用 `nova session peek`」。

**成本**：B 的成本 + ~20 行 guards.js patch + 1 test。

**覆蓋面**：高。有 CLI 可用，同時有 nudge 守護（fail-open warn，不 block）。

**Tradeoff**：
- (+) 雙層保護：CLI 存在 + guard 提醒
- (-) guard 判斷 false positive 風險（對 `tmux capture-pane` 在 query whitelist 已存在的 agent 造成 noise）
- (-) 複雜度上升

## 推薦

**方案 B**。

理由：
- Manager 今天的錯是具體的 peek 缺口，補 3 個高頻子命令即可精準解決
- 方案 A 的全包量太大，對 agent 新增認知成本（記一堆 CLI）勝過直接 tmux 的老知識
- 方案 C 無程式化守護，反模式會復發（Manager 今天就是 rule 存在也忘）
- 方案 D 的 guard 增加 guards.js 複雜度與 false positive 風險，收益邊際

若實作，建議順序：
1. `peek`（capturePane 已有，最容易）
2. `press`（薄 wrapper，1-rule 定 key 白名單：enter/y/n/q/esc/空白）
3. `follow`（interval loop，較複雜留最後）

## (d) 規則歸屬

**推薦**：**不建新 skill/rule，改而加進 `skills/cross-session/SKILL.md`**（或若無則 `skills/nova-cli/`）。

判準：
- 這是「**工具路由**」類知識（什麼情境用哪個工具），不是「行為紀律」
- `rules/環境/工具選擇.md` 已經存在 — 但它是全域規則 + 50 行上限，加新 3-4 個子命令的說明會超
- `skills/cross-session/SKILL.md` 本來就講跨 session 協調（Manager 觀察 target 的主要場景）— peek 屬於這類
- 規則本身（「禁用 `tmux capture-pane` 除非 nova-cli 無對應」）可以寫在 `rules/環境/工具選擇.md` 簡短一行，指向 skill 展開細節

具體落點建議：
- `rules/環境/工具選擇.md` 加一段（3-5 行）：`📋 MUST 觀察 session 用 nova session peek/follow/press，禁用直接 tmux capture-pane/send-keys（例外：guards.js 偵測、bootstrap shell、helper 底層）`
- `skills/cross-session/SKILL.md` 或 `skills/nova-cli/SKILL.md` 加 peek/follow/press 使用章節 + 對應 tmux 命令對照表

## (e) Clarifying Questions

1. **Manager 有沒有想過把 `nova session send` 改名**？（例如改 `nova session dispatch`）以避免與「真正的 tmux send-keys」語義衝突 — 今天踩雷就是這個混淆引起。改名的成本是一次性 grep+replace，但所有現存 dispatch 文件會 drift。
2. **Agent 想 peek 時真的需要 tail 模式（follow）嗎**？如果 99% 場景是一次性 peek（看一下就走），follow 可以先不做，把成本從方案 B 縮到 2 個子命令（peek + press）。
3. **`press` 的 key 白名單要放多嚴**？enter/y/n 肯定要；tab/arrow/ctrl-c 要不要？太寬鬆 = 變回 raw send-keys 喪失守護意義，太嚴苛 = 真的要按 ctrl-c 中斷時無對應。

---
**來源**：xd-39z1 討論 dispatch，完整討論主體按 `rules/協作/討論式派發持久化.md` 持久化到本檔。
