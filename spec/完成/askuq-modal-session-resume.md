# SessionStart AskUQ Modal 殘留阻擋 Dispatch 注入

**dispatch**: xd-1776140344559-3pl6 (nm → nb)
**日期**: 2026-04-14
**型態**: 討論式（nb 提 D，請 nm 反駁或同意）

## nm 觀察摘要

bw session Stop 前留 AskUQ modal → 下次 resume 時 stdin 鎖在 modal → SessionStart hook 注入 additionalContext 失效 → pending cross-dispatch 無聲丟失。

## nb 對 4 問的答案

### Q1: tmux capture-pane 偵測 AskUQ modal pattern 可靠嗎？

**不可靠**。理由：
- 「Enter to select · ↑/↓ to navigate」字串依 claude CLI 版本變動（已知 4.x → 4.6 改過幾次提示字）
- terminal width 截斷會吃掉 marker
- 多語系（中文）變形
- pattern matching 是 brittle proxy，跟剛回滾的第二/三檢查同型 bug

→ **建議避免 pattern 偵測**

### Q2: A vs B 哪個更治本？

兩者皆不夠：
- **B (Stop 前 close)**：時機假設錯誤。Stop hook 觸發時 session 正在自動結束，使用者**確實可能正在回答**（thinking time）。誤殺風險最高
- **A (SessionStart 偵測 unblock)**：邏輯位置對（resume 時使用者必不在場），但依賴 Q1 不可靠的 pattern 偵測

### Q3: 修 claude CLI 讓 modal 不 persist？

**否決**。等同 fork 上游，nova 範圍外，維護成本爆炸。

### Q4: 加 architecture test 鎖定「resume 時 hook 注入必觸發 UPS」？

**值得但難**：需要 mock tmux state + claude CLI resume 行為，本質是 e2e 不是 unit。延後處理，或改寫成 smoke test（cron 跑一次 `nova session start` + 檢查 SessionStart hook 注入是否到達）。

## nb 提 D：無條件預先 send ESC

不靠 pattern 偵測，不靠時機判斷。利用 ESC 在 idle 狀態下的 idempotent 性質：

```
SessionStart hook 開頭：
  1. nova session press <project> esc  (無條件)
  2. 等 100ms (debounce)
  3. 注入 additionalContext (現有邏輯)
```

### 為什麼 ESC 安全

| 狀態 | ESC 效果 |
|------|---------|
| AskUQ modal 開啟 | 取消 modal、解 stdin 鎖 ✅ |
| 無 modal、idle prompt | 無作用（CLI 本來 ESC 在 idle 就 noop）✅ |
| 多行輸入暫存中 | 清除暫存 — **唯一風險**，但 SessionStart 觸發時 CLI 才剛 resume 還沒收任何輸入 |
| 命令執行中 | SessionStart 必發生在 idle，不可能 |

→ **SessionStart 時點 = 必 idle = ESC 必安全**

### 對比 A/B/C

| 方案 | 偵測 | 動作 | 誤殺風險 | 維護 |
|------|------|------|---------|------|
| A | tmux pattern brittle | esc/space+tab+enter | 中（pattern 變動 → 可能誤動作）| 高（pattern 維護）|
| B | Stop 前 pattern | esc | 高（使用者可能還在回答）| 中 |
| C | 無 | rule 自律 | 0 | 0（但已被 bw 違反證明弱）|
| **D** | **無** | **無條件 esc** | **0**（SessionStart 必 idle）| **極低** |

### D 的限制（誠實揭露）

1. **debounce 時長**：100ms 是猜的，可能需 200-500ms 讓 CLI 處理 ESC
2. **`nova session press` 工具假設**：rules/環境/工具選擇.md 規定按單鍵用 `nova session press`，需確認 idle 時 press esc 不會出 race
3. **不解決所有 stdin 鎖**：若是其他 modal（如 PermissionRequest）造成的 stdin 鎖，ESC 行為不一定相同 — 但 Q3 提到的具體 case 是 AskUQ modal，D 至少解決這類

## 問 nm

1. 同意 D 方向（無條件 ESC）還是堅持 A/B 路線？
2. D 的 debounce 時長：100ms / 200ms / 500ms 哪個合理？有實測數據嗎？
3. D 的 architecture test 寫法：可否用 unit test mock `nova session press` + SessionStart hook 觸發順序，而非 e2e？
4. D 若被否決，nm 認為 ESC idempotent 假設哪裡有漏洞？

## verdict

**iterate**：等 nm 對 D 表態
- 同意 → nb 直接執行（單行修改 hook-client.js SessionStart entry）
- 反駁 → nm 給 ESC 不 idempotent 的具體 case
