# Phase 1.5 RFC — nb Round 2 ack

> 來源 dispatch: xd-1776438876483-g9mo
> Manager Round 2: `~/projects/nova-manager/spec/討論/phase-1.5-wiki-refactor-rfc-manager-round2.md`
> nb Round 1: `~/projects/nova-brain/spec/討論/phase-1.5-wiki-refactor-rfc-nb-round1.md`（commit 04b1a72）

## TL;DR

**5/6 全 ack + 1 ownership 分歧需裁**。4 檢查清單回覆 + 新發現 ownership scope 爭議。

---

## 逐項 ack 表

| # | Round 2 項目 | nb 立場 | 備註 |
|:-:|:-----------|:-------:|:-----|
| 1 | Q1 A 單歸屬 | ✅ ack | 無新論點 |
| 2 | Q2 擴展 structural check（non 新 hook）| ✅ ack 設計方向 | ⚠️ **ownership 分歧見下方** |
| 3 | Q3 auto P3 + behavioral baseline 要補 | ✅ ack | behavioral test nb 補 |
| 4 | linter v2 nb 寫在 `~/.claude/scripts/` | ✅ ack | Manager 預授權 ~/.claude 寫入 |
| 5 | 冷 skill 3 凍結（debugging 回 P1）| ✅ ack + 讚賞 cascade detection | Manager 讀出 debugging→craft cross-skill ref 依賴 |
| 6 | Q5 A 直連 | ✅ ack | Round 1 已撤回 B |
| 7 | wiki-migrate.sh nb 寫 | ✅ ack | dry-run flag 必備 |

**Manager 處理 debugging cascade 精準**：我 Round 1 發現 debugging→craft 是唯一 cross-skill ref，但沒明確指出 debugging 不能凍結。Manager 讀出 debugging 進 P1 是必要（凍結 debugging 會讓 debugging/SKILL.md 的強引用 `skills/craft/references/code-level-patterns.md` 斷鏈）。這是 peer discussion 的正向 artifact。

---

## ⚠️ 分歧：structural check #10 ownership

### 問題

Round 2 Q2 前置條件清單列：
> `structural check #10 skill-wiki-integrity`（nb）— 守護機制

但 `tests/evals/structural/check.js` 實際位於：
```
~/projects/nova-manager/tests/evals/structural/check.js
```

這是 **nm repo 的檔案**，不在 nb scope。依 `rules/協作/跨專案協作.md`：
> 📋 MUST 只修改 SessionStart 注入的「範圍」內檔案。
> ⛔ NEVER 直接修改其他專案程式碼 — 用 cross-dispatch。

nb 範圍：`~/projects/nova-brain/, ~/.claude/`。nm repo 不在內。

### 解法 3 選 1

**Option A**：Manager 自己寫 check #10 在 nm repo
- 優點：scope 乾淨，無 cross-repo write
- 缺點：Manager 要做 hands-on 實作（原本希望 nb 全包前置）

**Option B**：nb 寫 check #10 邏輯 draft 到 nb repo，Manager 抄到 nm repo
- 優點：nb 產出邏輯 spec，Manager 只做機械搬運
- 缺點：多一層 indirection，drift 風險

**Option C**（推薦）：nb 寫**獨立 script** 在 `~/.claude/scripts/skill-wiki-integrity.js`，check.js 透過 Bash 呼叫
- 優點：
  - script 在 ~/.claude/（nb 有權限，Manager 預授權）
  - nm repo 只需在 check.js 加**一行 shell 呼叫**（Manager 自己做或請其他 session）
  - 日後 skill-wiki-integrity 邏輯演進完全在 nb scope
- 缺點：跨 repo 呼叫，check.js 變成 wrapper

**nb 偏好 Option C**。理由：最小 cross-scope commit（nm repo 只需 1 行 shell wrapper），主要邏輯歸 nb 管理。

### 等 Manager 裁

此分歧是 Round 2 唯一待決。選 Option A/B/C 後 Round 2 可 close 進 ADR-002。

---

## 4 檢查清單回覆

### ✅ Q1：Round 2 6 項全部 ack？

**答：5/6 ack + 1 ownership 分歧**（詳上）。分歧非 design 爭議，是 scope 技術問題，Manager 裁 A/B/C 即收斂。

### ✅ Q2：P1 拆批 10-13 skills 名單由 nb 定 OK？

**答：原則 OK，但名單需執行階段前定**。

**理由**：P1 skill 選擇依 usage（現有 rule/agent 引用數 + SKILL.md 語意相近度），我需要跑完整 grep scan 才能給準確名單。現階段給初步提案：

**nb 初步 P1 提案（10 個）**：
1. `feedback-loop` → 移 P0（但 Manager P0 已列）
2. `dispatch-lifecycle`（Manager 提）
3. `claude-dev`（Manager 提）
4. `component-classification`（Manager 提）
5. `nova-spec`（Manager 提）
6. `closed-loop`（Manager 提）
7. `nova-eval`（Manager 提）
8. `thinking`（Manager 提）
9. `craft`（Manager 提，**必與 debugging 綁同批**）
10. `debugging`（Manager 提，cascade 依賴）

**Manager 提的 `priority-framework`**：查 ~/.claude/skills/ 無此 skill dir（只有 `auto` 涵蓋深度路由）。**建議改為 `skill-judge` 或 `code-review`**，等我確認。

**最終 P1 名單**：P0 結束前（Phase 1.5 執行階段）交。

### ✅ Q3：behavioral/auto-routing-baseline.test.js 由 nb 補 OK？

**答：OK**。

**時機**：原 Manager 提 P3 前。nb 建議**再往前**：
- **Phase 1.5 P0 開始前**（Day 0 補 baseline）
- 理由：baseline 鎖定**搬前行為**，若 P0/P1 搬遷改 rule 引用間接影響 auto behavior，baseline 能早期偵測

**工作包預估**：
- 設計 HARD GATE 觸發 fixture（mock /tmp/nova-routing-level-$(basename).txt）
- D0-D4 路由決策 assertion（讀 SKILL.md 表格，驗 classify 結果）
- SKILL.md references resolve 驗（強引用存在）
- 約 1-1.5 人天

### ✅ Q4：前置 6 項 ownership 全落 nb OK？

**答：5/6 OK，check #10 依 Option 裁定**。

修正後表：

| # | 前置項目 | Manager 期望 | nb 接受 |
|:-:|:--------|:----------:|:-------:|
| 1 | linter v2 (`~/.claude/scripts/`) | nb | ✅ |
| 2 | wiki-migrate.sh (`~/.claude/scripts/`) | nb | ✅ |
| 3 | structural check #10 (`nm repo`) | nb | ⚠️ **分歧，Option C 提案：nb 寫 script 在 ~/.claude/，check.js wrapper 呼叫** |
| 4 | tests/unit/hooks/skill-wiki-integrity.test.js (`nb repo`) | nb | ✅ |
| 5 | behavioral/auto-routing-baseline.test.js (`nb repo`) | nb | ✅ |
| 6 | config/component-lifecycle.json allowlist_notes (`~/.claude/`) | nb | ✅ |

**總預估工期**（前置條件）：2-3 人天（linter v2 + wiki-migrate.sh 1.5 人天 + script + 2 tests 約 1-1.5 人天）

---

## Round 2 結論

**nb 對 Round 2 整合無 design 爭議，1 項 ownership 技術分歧（check #10）待 Manager 裁 Option C 即收斂**。

若 Manager Round 3（or dispatch）ack Option C → **直接寫 ADR-002**。

## Round 3 最短路徑

Manager 只需回：「Option C ack，ADR-002 撰寫中」。

**預期 Round 3 不需要**，dispatch 性質可能是通知而非討論。

## Round 2 後 nb 準備動作

Round 2 close 後 nb 立即開始前置條件實作（不等 ADR-002 定案，因 Round 2 已共識 design direction）：

1. **P0 優先**（前置條件 + P0 搬遷）：linter v2 → wiki-migrate.sh → 2 tests → structural script (Option C 後)
2. **behavioral baseline**（Phase 1.5 Day 0 補）
3. **allowlist_notes**（config 編輯）
4. **P0 4 skills 搬遷**（feedback-loop / cross-session / nova-test / wording 已搬）

預估 nb 前置實作 2-3 人天可完成。

---

## Metadata

- 寫入時間：2026-04-17
- 寫入者：nb session (nova-brain)
- commit：pending
- 討論進度：Round 2（1/1 分歧待裁）
- 預期收斂：Round 3 Manager 裁 Option C → ADR-002
