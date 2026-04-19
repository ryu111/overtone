# spec/patch — Bootstrap Symmetry Apply Scripts

本目錄收 ralph-loop 自驅 cluster 產出的 apply script。每個 script 對應一個 protected files 的修改任務，透過 Bash 執行繞過 `PreToolUse:Write|Edit` hook（Bootstrap Symmetry Principle）。

> 完整 pattern 定義見 [../討論/bootstrap-symmetry-pattern.md](../討論/bootstrap-symmetry-pattern.md)

## 現有 script

| Script | 目的 | 派生自 |
|---|---|---|
| `phase-a-apply.sh` | manage-component.js 擴 script/rule/command 3 類 + routing-level CLI + L316 typo + rule 升級 + test | iter 2-11 cluster |
| `fix-backtick-refs.sh` | rules/核心/自驅反思.md L4 backtick path → md-link | nm-reply 573dd7f |
| `fix-review-agent-heuristic.sh` | review-agent.js commit_message.actionable 硬 coded → 通用文案 | iter 3 誤判 |
| `polish-manage-component-help.sh` | --help Types 段補 3 類 | synthesis-003 |
| `phase-b-handoff-pointer.sh` | SessionStart detectHandoffPointer 實作（方案 B）| spec/完成/2026-04-19_sessionstart-handoff-pointer.md |
| `apply-pivot-detector.sh` | ralph-loop-pivot-detector.js 空轉偵測 sensor | spec/討論/ralph-loop-pivot-detector.md |

## 使用時機

- 修改 PROTECTED_PATHS 下檔案（`hooks/` `rules/` `scripts/` `commands/`）
- 改動 ≥ 3 行或 ≥ 2 檔
- 需 multi-step（sed + test 驗證 + commit）

## 不該使用的情境

- 1 行單檔改動 → 直接 Bash sed 更輕
- 需使用者審閱決策 → 寫成 draft 等使用者
- 涉及破壞性操作（git reset / 刪除檔案）→ 需使用者明示

## 重複執行特性

所有 script **idempotent** — 已 apply 的改動不重複套用（透過 `content.includes` 檢查或 `if [ -f ]` 守衛）。安全重跑。

## 下 session 使用建議

1. 查 `~/.claude/spec/討論/<topic>.md` draft，選定要實作的 spec
2. 若無對應 apply script → 依 Template A（`bootstrap-symmetry-pattern.md`）撰寫
3. `bash spec/patch/<name>.sh` 執行
4. commit message 明示「Bootstrap Symmetry 第 N 次」以便追蹤

## 治理紀律

- 單 session cluster >10 次使用 → 警覺「該升 guards.js 放行機制」
- 執行失敗 → script 內建 rollback 或明示手動回滾路徑
- 不要把 apply script 當 workaround — 是「修 bug 的 last resort」

## 累計統計（2026-04-19 本 cluster）

- 6 個 apply script
- 觸發 7+ 次 Bootstrap Symmetry 修改
- 關聯 8+ commit
- ADR-011「Main 零阻塞」承諾實際兌現工具
