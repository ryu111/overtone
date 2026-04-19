---
title: 知而不行 Phase 3 真違規候選盤點
date: 2026-04-15
status: in_progress
scope: global
owner: nb
round: 2                        # 目前 Round 2 iterate 中（handoff 序列任務顯示）
authorization:
  - xd-0sej                     # 觸發來源
---

# 知而不行 Phase 3 真違規候選（xd-0sej, 2026-04-15）

## 輸入

- `data/reflections.jsonl` 14d trigger_type=correction: **4 筆**（nb 1 / nova-manager 3）
- `/tmp/hook-errors.jsonl`: **46,150 筆**（但 100% 是 `event=SessionEnd error=wrapup_missed`，單一 pattern 主導）

## 盤點

### Corrections 14d（真違規 = 使用者親自糾正）

| # | ts | trigger | 涉及 rule | 已有防護 |
|---|---|---|---|---|
| C1 | 2026-04-13 | 使用者：spec 一次做完不切 M1/M2/M3 | `品質/完成與閉環.md` 執行 spec 條款 | rule（6317c9b）+ executor-dispatch Section 6，**無 hook 守護** |
| C2 | 2026-04-13 晚 | 同 C1（第 2 次踩） | 同 C1 | 同 C1 |
| C3 | 2026-04-13 | 使用者：你要更新一下自己的行為跟核心嗎 | `協作/討論式派發.md` core_objective 條款 | rule 存在但 agent 未主動維護 |
| C4 | 2026-04-15 | session-ctl pane name bug | N/A（tool bug 非 rule 違規） | 已修 + test |

### Hook-errors 14d

| 違規 | 次數 | 既有 hook | 判斷 |
|---|---:|---|---|
| `wrapup_missed` | 46,150 | wrapup-guard.js（warn 級） | **實際是 session auto-end 無人可 wrapup 的誤報**，非「AI 知而不行」|

## Phase 3 真候選（反覆違規 ≥ 2 次）

### 候選 1: Spec 切割防護（C1+C2，2 次）✅ 高 ROI

- **條款**: `品質/完成與閉環.md` 「執行 spec 時一次做完所有 milestone（M1+M2+M3），不切段交付。需拆分時執行前明示量化理由並等 Manager 或使用者認可」
- **為何真違規**: 使用者 2026-04-13 同天糾正 2 次同 pattern，rule 加完後仍容易踩
- **hook 位置**: **Stop hook**（session 結束前）或 **PreToolUse on dispatch-complete**（回報 complete 前）
- **偵測邏輯**:
  ```
  IF dispatch 含 M1/M2/M3 字樣 AND complete summary 只含單一 milestone 文字
  THEN block + require 明示拆分理由（>1500 行 / 需多 session 實機驗證 / LLM run >2h）
  ```
- **Unit test 思路**:
  - prompt 含「M1 M2 M3」+ complete summary 只提 M1 → block
  - prompt 含「M1 M2 M3」+ complete summary 提三者 OR 含「量化理由：LLM run 2.5h」→ pass
  - prompt 無 milestone 字樣 → 不觸發 hook
- **風險**: 可能 false positive（有些 spec 真的只有 M1），需 reviewer escape hatch

### 候選 2: core_objective self-maintenance（C3，1 次）⚠️ 中 ROI

- **條款**: `協作/討論式派發.md` 「各專案 CLAUDE.md 宣告 core_objective」
- **為何候選**: 單次糾正但結構性（新 project 都會忘）
- **hook 位置**: **SessionStart hook**（首次進 project）
- **偵測邏輯**: grep `core_objective:` on CLAUDE.md → 缺 → systemMessage 提醒
- **Unit test**: project 無 CLAUDE.md / 有但缺 `core_objective:` / 齊全三 case
- **風險**: 低，純 reminder 不 block

### 候選 3: wrapup_missed 根因（46k 次但非 AI 違規）❌ 不適合升 hook

- **觀察**: 46,150 筆全是 `SessionEnd: wrapup_missed`，phase=safety-net
- **判斷**: 這是 session auto-terminate 時的 fallback 標記，不是 AI 有意跳過 wrapup
- **結論**: 不升 hook，改調查 `safety-net` phase 邏輯是否過度觸發（follow-up dispatch 建議）

## Phase 3 推薦清單（Top 3）

| 優先 | 候選 | 次數 | 升 hook 預估 | ROI |
|:---:|---|:---:|:---:|:---:|
| P1 | Spec 切割防護 | 2 | 2-3h（Stop/PreToolUse + test 5 case） | 高 |
| P2 | core_objective self-maintenance | 1 | 30 min（SessionStart 純 reminder） | 中 |
| P3 | hook-errors.jsonl `wrapup_missed` 根因調查 | N/A | 1h（非 hook 升級，是 safety-net 邏輯檢） | 中低 |

## 結論與反思

1. **Manager 人工審駁回 keyword-count Top 5 是對的** — 真違規只有 4 筆且 3 項已有結構性解，Phase 2 噪音嚴重
2. **真 ROI 在 Spec 切割防護**（踩 2 次 + rule 存在但未 hook）— 是 Phase 3 唯一值得動手的候選
3. **反思**: 本 repo 14d correction 只 4 筆代表整體治理成熟，Phase 3 不該追求量化多條升 hook，挑 P1 一條精做即可
4. **後續建議**: Manager 派單一 dispatch 做 P1 候選 + P2 順便（total 3h），P3 另案調查

## 附錄：資料局限

- correction 反思 14d 僅 4 筆，統計基數小，可能漏真實但未反思的違規
- `/tmp/hook-errors.jsonl` 訊號單一化（wrapup_missed 佔 100%）暗示既有 hook diversity 不足，其他 hook 違規可能根本沒 log
- 未來 hook 生效時應擴寫 structured log schema（hook_name / rule_ref / violation_type）便於 Phase N 持續 mining
