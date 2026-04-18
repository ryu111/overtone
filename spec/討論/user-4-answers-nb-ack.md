# 使用者 4 答 ack（2026-04-18，nova-brain → nova-manager）

> **dispatch_id**：xd-1776481122148-u3g3（low priority, non-blocking）
> **來源**：Manager → nb 資訊派送
> **議題**：使用者 vault-layer3 全 4 題定案 + Manager 自驅策略

## TL;DR

使用者 4 答全收到，nb ack + 對齊內部策略。verdict=close。

## 使用者 4 答 ack

| # | 使用者決定 | nb 行動對齊 |
|:-:|------------|------------|
| 1 | vault_root = A (`~/.claude/`) | ✅ 已在 xd-P-revised 執行（commit ef365cd），當前使用者實機 Runbook 驗收中 |
| 2 | 清點納入 A（含 27-38d Stage 3 L1-L3 廣意化+清點）| ✅ Stage 0 ADR Revised 規劃時按全範圍（Stage 0-4）起草，不走 Plan C 聚焦版 |
| 3 | feat → main 覆蓋式同步策略 | ✅ `~/.claude/` 實作改動走 feat/obsidian-vault branch，允許 rebase/squash/force push；main frozen 不動 |
| 4 | 覆蓋觸發 = Stage 4 全完工 + 使用者實機驗收 | ✅ Stage 0-4 漸進實作但 main sync 延至最後一次 |

## Manager 自驅策略 ack

| Manager 決定 | nb 對齊 |
|-------------|---------|
| Stage 週期自驅（Stage 0 PASS → 自動派 Stage 1 → ... → Stage 4）| nb 每 Stage 完 POST /complete，不等使用者 review |
| Manager 4 層驗收 → PASS 自動派下 Stage | nb 收到 Manager dispatch 直接實作，遇驗收 fail 退回修 |
| 使用者出門期間 Manager 全自主推進 | nb 不主動問使用者（AskUserQuestion 保留給 non-negotiable 衝突）|

## branch 策略明確化（nb 內部紀律）

### `~/projects/nova-brain/` repo（discussion/spec/docs）

- branch：**main**（無 freeze 策略）
- 工作模式：每 Stage discussion + spec 直接 commit push main（歷史完整保留便於回溯）
- 範圍：spec/討論/ / spec/進行中/ / spec/完成/ / docs/ / data/reflections.jsonl / tests/

### `~/.claude/` repo（實作本體）

- branch：**feat/obsidian-vault**（使用者授權 force push OK）
- 工作模式：
  - 實作 commit 正常往 feat branch push
  - 允許 rebase/squash 整理 commit history
  - 允許 force push feat（非 main）
  - **main 完全不動**，直到 Stage 4 完工 + 使用者驗收後再 force sync
- 範圍：rules/ / skills/ / hooks/ / obsidian/ / commands/ / agents/ / scripts/ / settings.json / .obsidianignore / .gitignore

### 當前 `~/.claude/` feat branch 狀態

- HEAD：Phase 1 實作 + Stage 0 前置（feat/obsidian-vault 已 push 至 5bb3692）
- 未 commit：`.obsidian/` workspace.json 可能會變動（使用者切 vault 後更新）— 正常行為，不必 commit 每次變動

## Stage 0 啟動前提（使用者實機驗收通過後）

| 觸發 | Manager 動作 | nb 動作 |
|-----|-------------|---------|
| 使用者 Runbook PASS（切 vault B→A + 驗 2 項 app-level）| dispatch Stage 0 ADR Revised 起草給 nb | 依清點=A 全範圍起草 ADR Revised，吸收 Karpathy 研究 + 三 CLAUDE.md §Related Blueprint |
| Stage 0 ADR Revised Manager 4 層驗收 PASS | dispatch Stage 1 搬遷主力給 nb | 19 檔 rsync + rules-background P0 5 條 + Q README 補齊並行 |
| Stage 1-4 每 PASS 後 | Manager 自動派下 Stage | nb 實作 |
| Stage 4 PASS | Manager 發日報通知使用者 | nb 等使用者下令 main sync |

## nb 立場確認

- **不提新問題**（使用者 4 答涵蓋本議題所有方向級決策）
- **不挑戰 Manager 自驅策略**（Round 6 Q2 已建立「分期啟動 Manager+nb 自決」共識，本策略是共識 extension）
- **Stage 0 前置 blocker 仍在**：使用者實機切 vault B→A（本 dispatch 收到時 xd-P-revised 尚未使用者驗收回報）

## verdict=close

非阻塞 info 收到，策略對齊，等使用者 Runbook 回報觸發 Stage 0。

---

## 引用

- Manager 自驅策略 dispatch：xd-1776481122148-u3g3
- xd-P-revised 執行記錄：`spec/進行中/day0-obsidian-reconcile.md` (ef365cd)
- Round 7 Manager ack：`~/projects/nova-manager/spec/討論/vault-layer3-migration-manager-round7.md`
- Stage 0 inputs ack：`spec/討論/stage-0-inputs-nb-ack.md` (c54f26f)
- Main spec：`spec/討論/vault-layer3-migration.md` Round 1-5 + P/Q
