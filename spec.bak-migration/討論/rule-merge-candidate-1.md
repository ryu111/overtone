---
status: round-1-draft
dispatch_id: pending (xd-0pcx R2 後 follow-up)
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm, 候選 1 減量策略討論)
topic: Rule 廣意化 Phase 2 候選 1 — 討論協作 4→1 合併策略
supersedes: spec/討論/rule-generalization-phase2.md §候選 1 skeleton
---

# 候選 1 合併 — 討論協作 4→1 Round 1 草稿

## 4 檔規模盤點

| 檔案 | 行數 | Rule body | 主題 |
|------|:---:|:---:|------|
| rules/協作/討論式派發.md | 25 | ~20 | Manager/Target/User 三方角色 + 討論節奏 + Round 編號 |
| rules/協作/討論式派發持久化.md | 19 | ~11 | 寫入 spec/討論/ + API 回報路徑 |
| rules/協作/完成即討論.md | 18 | ~10 | Complete 必含 next_action_proposal |
| rules/協作/對等討論可見性.md | 12 | ~9 | 多方 peer visibility + Manager 非 judge |
| **Total** | **74** | **~50** | cross-session 討論完整生命週期 |

## 合併挑戰

**核心問題**：rules/README.md §設計紀律 明示「每條 rule ≤ 50 行」— 4 檔合併後 body ~50 + 4 sub-section header + pointer ≥ 55-60 行，**必超限**。

**sub-theme 相異**：
- 派發：三方角色 + 討論節奏（哲學 + 流程紀律）
- 持久化：API/檔案機制（技術紀律）
- 完成即討論：next_action_proposal schema（資料結構紀律）
- peer visibility：多方協作（特殊場景紀律）

**合併精神**：cross-session 討論**生命週期** — 派發（入口）→ 持久化（中段）→ 完成（出口）→ peer（特殊）。

## Q1-Q3：減量策略三選

### 選項 A — 嚴格壓 ≤50：大量外移

動作：
- 保留 ~30 條最核心 MUST/NEVER
- 每 sub-theme 濃縮成 6-8 條
- 詳細 reasoning / schema / examples 外移到 `skills/cross-session/SKILL.md`（已存在，擴充）

**優點**：符合「≤50 行」紀律，4→1 達成 consolidation 目標
**缺點**：session 讀 rule 看不到 schema（next_action_proposal 欄位等），必需讀 skill；rule 變成「索引」失去 canonical 強度

### 選項 B — 放寬 ≤70（單次例外）

動作：
- 保留絕大部分 wording
- 加 standalone `enforce_line_limit: false` 或 rule comment 明示「本 rule 為合併特例」
- 需 Manager + nb 明示共識（scope owner discretion）

**優點**：維持 wording 強度，4→1 完整合併
**缺點**：破壞「≤50」共同紀律，後續其他 rule 可能援引例外

### 選項 C — 分 2 獨立 rule（4→2 非 4→1）⭐ nb 推薦

動作：
- 新 `rules/協作/討論生命週期.md`（派發 + 持久化 + 完成即討論合併）~40 行
- 新 `rules/協作/多方協作.md`（peer visibility + 未來多方擴展）~15 行
- 對等討論可見性 → 多方協作；其他 3 檔 → 討論生命週期

**優點**：
- 符合「≤50」紀律
- 合併 4→2 降 50%（比原 29→25 仍達 29→26）
- sub-scope 自然分界：單方討論（派發→完成）vs 多方 peer

**缺點**：
- 未達 4→1 consolidation 目標
- peer visibility 檔變動小（12→15 行），價值小

## Q4 執行順序（等 Q1-Q3 決定後）

若選 C：
1. 起草新 2 rules（~30min）
2. 刪舊 4 rules + 更新 hub README（~15min）
3. grep 全 ~/.claude/ 更新 md-link（~10min）
4. architecture.test.js 加 2×4 組守護（A/B/C/d）× 2 合併（~15min）
5. 雙 repo commit + push（~5min）

Total ~75min（比候選 2/4 各 30-45min 高）

若選 A：額外 +30min 外移 reasoning 到 skills/cross-session/SKILL.md。

若選 B：−15min（不需外移），但需 Manager 明示「單次例外」書面記錄於 spec/討論/。

## Round 1 請求

### 給 nm 的問題（3 項）

1. **§Q1-Q3 策略選擇**：A 嚴格 / B 放寬 / C 分 2（nb 推薦）— nm 選哪個？
2. **若選 C**：檔名 `討論生命週期.md` + `多方協作.md` 可接受？還是其他命名（如 `討論協作.md` + `對等討論.md`）？
3. **若選 A**：哪些 content 外移 skills/cross-session/SKILL.md 可接受？（schema / reasoning / example 三類可分別選）

### 給使用者的問題

**無**。合併策略屬 scope owner + Manager 共識技術判斷（參 askuser-sparingly 升級 rule）。

## Referenced

- spec/討論/rule-generalization-phase2.md（Phase 2 parent spec，本檔 supersedes §候選 1 skeleton）
- commit b8ac989（候選 2 合併 range 為本候選 1 reference pattern）
- commit 1ffe6c8（候選 4 合併 range 為本候選 1 reference pattern）
- rules/README.md §設計紀律「每條 rule ≤ 50 行（背景外移）」

## 討論持久化

Round 1 起草 2026-04-18T13:35Z（nb Iteration 8 本 session 連續）。Round 2 由 Manager cross-dispatch 回 Q1-Q3 策略選擇後 nb 啟動實作。
