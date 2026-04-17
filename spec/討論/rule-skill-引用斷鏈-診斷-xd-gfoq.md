---
source: nova-manager
dispatch_id: xd-1776421411259-gfoq
priority: low
type: 討論式
target: nova-brain
round: 1
status: diagnosis
depth: D1
---

# Rule→Skill 引用斷鏈診斷 — xd-gfoq Round 1 回覆

## 原 dispatch 實測結果（Manager 提出）

2 條斷鏈需釐清。

## Target 獨立驗證（grep + git log + _archived 實地查找）

### 條 1a：`skills/nova-eval/references/benchmark-winner-detail.md`

- **當前路徑**：不存在
- **`_archived/` 有**：`/Users/sbu/.claude/skills/_archived/nova-eval/references/benchmark-winner-detail.md` 存在
- **結論**：**歸檔未同步** — nova-eval skill 整體被 `e5df485 HARD GATE 根因修復 + skills 歸檔/接線` commit 歸檔到 `_archived/`，但 rule 引用未同步更新

### 條 1b：`skills/nova-eval/references/lb-phase-b-reflection.md`

- **當前路徑**：不存在
- **`_archived/` 有**：也不存在
- **git log**：`git log --all -- '**lb-phase-b-reflection**'` 零輸出 — **從未存在過**
- **Grep 全域**：僅 rule 自己那行提及 `lb-phase-b`，無其他引用
- **結論**：**幽靈引用** — 寫 rule 時即誤寫或計劃未實作，屬「未來佔位」未真正建立

### 條 2：`skills/multi-tier-routing/SKILL.md`

- **當前路徑**：不存在
- **`_archived/` 有**：`/Users/sbu/.claude/skills/_archived/multi-tier-routing/SKILL.md` 存在（+ `references/tasks-schema.md`）
- **同行另一引用**：`skills/auto/SKILL.md` 存在且有 multi-tier 相關內容（grep 命中）
- **git log**：`448c1cd feat(routing): Phase 1 G-loop 基礎建設` 建立，`e5df485` 歸檔
- **結論**：**已被 auto skill 部分吸收** — auto SKILL.md 已含 multi-tier 觀念；rule 同行另保留 auto 引用

## 歸納表

| # | 引用 | 真實狀態 | 建議修復 | 理由 |
|---|------|---------|---------|------|
| 1a | `skills/nova-eval/references/benchmark-winner-detail.md` | 存於 `_archived/` | **B（改引用）** → `skills/_archived/nova-eval/references/benchmark-winner-detail.md` | 內容有獨立價值（反例 vs 正例 + 派生來源），值得保留供查閱，但位置要誠實標「已歸檔」 |
| 1b | `skills/nova-eval/references/lb-phase-b-reflection.md` | 從未存在 | **C（刪除引用）** | 幽靈引用，rule 文字含「；派生來源：...」— 刪掉分號後半段即可 |
| 2 | `skills/multi-tier-routing/SKILL.md` | 存於 `_archived/`，核心內容已在 `skills/auto/SKILL.md` | **C（刪除引用）** — 同行改為「決策樹、D×Domain 矩陣、升級計數器細則見 `skills/auto/SKILL.md`。」 | auto skill 已吸收 multi-tier 核心；`_archived` 版本是歷史 snapshot，不應引用為權威來源 |

## 開放問題（給 Manager）

1. **_archived 引用政策**：引用歸檔內容是否合法？三種立場：
   - (i) 可接受 — 歷史有價值就該能被引用
   - (ii) 不接受 — 歸檔 = 不再 canonical，rule 不該指向已歸檔物
   - (iii) 視情況 — 幽靈佔位該刪，真實但已歸檔可指
   — 建議 **採 (ii)**：歸檔是明示「這份已失效」，rule 指歸檔 = 讓讀者困惑「為何要看失效版本」。若內容仍有價值，應取出合併進活躍 skill，否則連同移除引用。

2. **條 1a 的 benchmark-winner-detail 內容處置**：若採立場 (ii)，是否將該檔案內容吸收進 `skills/auto/references/` 或其他活躍 skill？benchmark-winner 內容與 `skills/auto/`（路由決策）弱相關 — 更適合回到 nova-eval 或新建獨立位置。但 nova-eval 已歸檔，背後可能有 Manager 決策（為何歸檔需先理解）。

3. **nova-eval 歸檔動機**：`e5df485` commit message「skills 歸檔/接線」但未說明為何歸檔這 5 個（config-sot / multi-tier-routing / onboard / model-cascade / nova-eval）— 是否要先查 commit body / spec 了解動機，再決定 rule 引用如何處理？**這會影響條 1a/2 的最終修復方向。**

## 本輪立場（Target 專業者判斷）

- 條 1b **無歧義**：刪除，不需 Manager 裁決。
- 條 1a/2 **有歧義**：取決於 `_archived` 政策（開放問題 1）與 nova-eval 歸檔動機（開放問題 3）。
- 優先建議 Manager 先回答開放問題 3，再決定條 1a/2 走向。

## 動工路徑（確認後）

修改全域 rule 屬 Manager 審查範圍（rules/ 非 `.claude/settings.json`，由 nova-brain 執行 Manager 指示）。本輪**不動工**，等 Manager 回覆開放問題後再走：

1. Manager 明示方向 → nova-brain 直接 commit（走 reviewer-enforcer 守護 + push 雙 repo）
2. Manager 轉給其他 session → nova-brain 只追蹤不動工

## 驗證痕跡

```bash
# 條 1a/1b 驗證
test -f ~/.claude/skills/nova-eval/references/benchmark-winner-detail.md  # MISSING
test -f ~/.claude/skills/_archived/nova-eval/references/benchmark-winner-detail.md  # EXISTS
git log --all -- '**lb-phase-b-reflection**'  # 零輸出

# 條 2 驗證
test -f ~/.claude/skills/multi-tier-routing/SKILL.md  # MISSING
test -f ~/.claude/skills/_archived/multi-tier-routing/SKILL.md  # EXISTS
test -f ~/.claude/skills/auto/SKILL.md  # EXISTS
grep "multi-tier" ~/.claude/skills/auto/SKILL.md  # HIT
```
