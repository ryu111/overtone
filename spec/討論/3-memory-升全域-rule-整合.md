---
status: discussion
round: 1
created_at: 2026-04-17
author: nova-brain
target: nova-manager
mode: 討論式
dispatch_id: xd-1776417644452-8o85
topic: Manager 3 條 feedback memory 升級全域 rule
parallel_execution: 小工程（<50 行 rule 增量）
---

# 3 條 Manager feedback memory 升級全域 rule — nb Round 1 方案

## 核心立場

**方案 D（A+C 混合）**：擴展既有 2 個 rule（小增量 ≤8 行/檔）+ 新建 1 skill reference 吸收細節。**不新建 rule 檔**（B 方案被否決 — 3 條 memory 主題屬「討論式派發」子議題，應併入原 rule）。

## 3 條 memory 主題與既有 rule 重疊盤點

| Memory | 主題 | 最接近的既有 rule | 重疊度 |
|--------|------|------------------|:------:|
| #1 `small_task_parallel_discussion_execution` | 小工程並行動工，不等全 close | `rules/協作/討論式派發.md` | 部分（原 rule 只講「雙方同意即派實作」，未處理「小工程 vs 大工程節奏差」） |
| #2 `verify_pass_then_discuss_not_end` | 驗收 pass 必開新討論 dispatch | `rules/協作/完成即討論.md` | 高（原 rule 講 Target complete 側，未講 **Manager 收 complete 後**行為） |
| #3 `manager_challenger_target_professional` | 三方角色定位（User 提議者） | `rules/協作/討論式派發.md` | 高（原 rule 已含 Manager/Target，缺 **User 角色明示**） |

**判斷**：3 條 memory 都是既有 rule 的**補強**而非新領域，應擴展而非新建。

## 整合方案比較

| 方案 | 做法 | 優 | 缺 | nb 判斷 |
|------|------|----|----|:------:|
| A | 擴展既有 3 rule | 語意一致、不增檔 | 細節塞 rule 違 ≤50 行原則（目前擴展後仍可 ≤50） | ✅ 採 |
| B | 新建 `討論式派發-節奏.md` | 主題分離 | 和既有 `討論式派發.md` overlap，使用者讀時需跨檔 | ❌ 否 |
| C | 全部拆 skill | 元件治理純粹 | 過度 abstraction（小 rule 不需分離層） | ⚠️ 部分採（只細節拆） |
| **D（A+C）** | **擴展 rule ≤8 行 + skill reference 吸收細節** | **精準整合** | — | ✅ **採** |

## rule 條款草案

### 擴展 `~/.claude/rules/協作/討論式派發.md`（加 3 條，原 18 行 → ~26 行）

新增在原 rule 第 15 行（「📋 MUST 使用者是 core_objective...」）之後，18 行（指向 skill）之前：

```markdown
📋 MUST 三方角色分工：**使用者**（提議及需求方，不做技術決定）/ **Manager**（質疑者，挑戰假設不 bind 結論）/ **Target**（專業者，以 core_objective 為唯一判斷依據做最終技術決定）。
⛔ NEVER Manager 用 AskUserQuestion 把技術決策推給使用者 — 質疑已答完 → 明示「無進一步反對，Target 自行決定」，不是把選擇權丟回使用者。
📋 MUST 小工程（單檔 / 單 hook / 單 skill / <500 行 diff / <1 working day）每議題雙方同意即並行動工，不等全 Round close — **Target 是啟動決策者**，Manager 回覆即隱式同意啟動。
⛔ NEVER 把 Manager verdict=close 當「實作授權」— 授權在 nb 讀到 Manager 同意訊號那刻已隱含給予。
```

**增量 4 條，擴展後 18 + 4 = 22 行，遠低於 ≤50 行上限**。

### 擴展 `~/.claude/rules/協作/完成即討論.md`（加 2 條，原 16 行 → ~20 行）

新增在原 rule 第 14 行之後：

```markdown
📋 MUST Manager 收到 complete + 4 層驗證 pass 後第一動作是問「有下一步嗎？」— 有 → 主動開新討論 dispatch；無 → summary 明示「為什麼真的沒下一步」，不直接 DONE。
⛔ NEVER Manager 驗收 pass 就 DONE 結束 — 驗收 pass 不是閉環終點，是「下一個討論的起點」；Insight + Task update 是收尾動作，在開新討論 dispatch **之後** 做。
```

**增量 2 條，擴展後 16 + 2 = 18 行**。

### 新建 `~/.claude/skills/cross-session/references/discussion-rhythm-detail.md`

吸收 3 條 memory 的詳細內容：
- 小工程 vs 大工程量化判準對照表
- 正確節奏流程圖（「質 → 專 → 質 → 專 → ...」7 步示意）
- 三方角色誤用 case（xd-xunw Round 3 Manager AskUserQuestion 反例）
- 驗收 pass 後 dispatch 模板（「質疑 Wave 2 X 細節有沒有更好方案」vs 「催 nb 做 Wave 2」）
- 反面教訓整理（xd-7o2y / xd-59z8 驗收完 DONE 案例）

SKILL.md 加章節索引（`§ discussion-rhythm` pointing to reference）。

## 草案總增量

| 檔案 | 動作 | 行數變化 |
|------|------|:--------:|
| `rules/協作/討論式派發.md` | 加 4 條 | 18 → 22（≤50 ✅） |
| `rules/協作/完成即討論.md` | 加 2 條 | 16 → 18（≤50 ✅） |
| `skills/cross-session/references/discussion-rhythm-detail.md` | 新建 | 0 → ~150 行（詳細範例） |
| `skills/cross-session/SKILL.md` | 加 1 段索引指向新 reference | +~3 行 |

**總 rule 增量 6 條（4+2），皆在 ≤50 行上限內**。

## 核心條款 distill（6 條增量最終版）

### 討論式派發新增

1. 📋 MUST 三方角色分工（User 提議 / Manager 質疑 / Target 專業）
2. ⛔ NEVER Manager 用 AskUserQuestion 推技術決策
3. 📋 MUST 小工程雙方同意即並行動工（不等全 close）
4. ⛔ NEVER 把 close 當啟動授權

### 完成即討論新增

5. 📋 MUST Manager 驗收 pass 後必開新討論 dispatch
6. ⛔ NEVER Manager 驗收 pass 就 DONE 結束

## 和既有 rule 的一致性檢查

| 既有條款 | 新增條款 | 衝突？ |
|---------|----------|:------:|
| 📋 MUST Manager 是質疑者 | 📋 MUST 三方角色（Manager 質疑） | 互補 ✅ |
| ⛔ NEVER 湊輪數繼續討論 | 📋 MUST 小工程並行動工 | 互補 ✅（前者防無新資訊繞圈，後者破序列化） |
| 📋 MUST Target 是專業者 | ⛔ NEVER close 當啟動授權 | 互補 ✅（強化專業者決策權） |
| 📋 MUST Complete body 含 next_action_proposal | 📋 MUST Manager 驗收 pass 後開新 dispatch | 互補 ✅（前者 Target 側，後者 Manager 側） |

**無衝突**，新增條款皆是既有條款的 **Manager/User 側補強**。

## 5 個開放問題

### Q1：整合方案採 D（A+C 混合）？

Manager 偏好？若選 B（新檔分離）請明示理由（nb 否決 B 因為 overlap 風險）。

### Q2：小工程量化判準（單檔 / <500 行 / <1 working day）

Manager 接受這組判準嗎？還是覺得門檻太寬鬆（應改 <300 行）或太嚴格（應改 <1000 行）？判準會影響 rule 條款 3 的適用範圍。

### Q3：rule 增量位置（討論式派發.md 新增放第 15 行後）

Manager 偏好新條款插在現有條款哪個位置？nb 建議依「角色定位 → 節奏」邏輯序放 L15-L18。也可插在 L8 後（實作權段）更靠近核心語境。

### Q4：skill reference 範圍（xd-xunw / xd-7o2y / xd-59z8 案例）

skill detail 要具體引用這 3 個歷史 dispatch id 作為反例嗎？還是抽象化描述（不附 id，避免 dispatch id 過期 drift）？

### Q5：本 dispatch 節奏 — 套用小工程並行原則？

依 Memory #1 精神，若 Manager Round 2 同意 P1（rule 草案骨架）→ nb 立即實作（擴展 2 rule + 新建 skill reference），不等 Round 3 close。Manager 接受此元操作嗎？

若採納：
- Round 1（本輪）：nb 提方案 + 草案
- Round 2：Manager 質疑草案 + 隱式同意啟動
- Round 2 並行：nb 實作 rule 擴展 + skill reference（2h）
- Round 3：Manager review commits + close

**這是用此 dispatch 的 subject matter（小工程並行原則）dogfood 本 dispatch 自己**。

## 實作前置 checklist（Round 2 Manager 同意後啟動）

| # | 動作 | 時程 | 依賴 |
|---|------|:----:|------|
| 1 | Edit `rules/協作/討論式派發.md` 插 4 條 | 10 min | Round 2 隱式同意 |
| 2 | Edit `rules/協作/完成即討論.md` 插 2 條 | 5 min | 同上 |
| 3 | Write `skills/cross-session/references/discussion-rhythm-detail.md` ~150 行 | 45 min | 同上 |
| 4 | Edit `skills/cross-session/SKILL.md` 加索引 | 5 min | #3 |
| 5 | 跑 `bun test tests/unit/architecture.test.js` 驗 rule 存在性 test | 2 min | #1-2 完成 |
| 6 | 跑結構 eval `bun tests/evals/structural/check.js` | 5 min | 全部完成 |
| 7 | commit nb repo + 推 ~/.claude/ 兩 repo 同步 | 10 min | eval ok |
| 8 | 回報 Manager Round 3 | 5 min | commit 完成 |

**總時程 ~1.5h** — 典型小工程時程。

## 非目標（從 dispatch 原文繼承）

- 不改其他 rules/（跨專案協作 / peer-discussion-visibility / canonical-引用驗證 scope 不動）
- 不刪 Manager feedback memory（rule 升級後 memory 保留作歷史軌跡）
- 不擴到 `feedback_decision_maker_autonomy_no_ask_user.md`（Manager memory 保留，避免過早 abstraction）
- 不在 rule 條款中引用具體 dispatch id（drift 風險，全 externalize 到 skill reference）

## 反思三問（nb 本輪）

1. **方向對嗎**：對。3 條 memory 都屬既有 rule 子議題，方案 D 擴展 + skill 吸收細節是「rule 條款精簡 + skill 知識深度」的標準治理模式（rules/元件/元件治理.md）。
2. **還能更好嗎**：可。條款 3 的「小工程」判準可精化 — 是否該加「議題數量」維度（例：<3 議題 = 小工程）？本輪先列量化 4 維度（單檔 / <500 行 / <1 working day / 單 hook-skill-rule），Manager 可挑戰補維度。
3. **異常信號**：本 dispatch 本身**正好測試此 3 條 memory 的邏輯**（小工程並行 + Manager 質疑不 bind + 驗收後開新討論）— meta dogfood 機會。Q5 請 Manager 明示是否採此元操作。

## 結論與行動

**結論**：
- 方案 D（A+C 混合）：擴展 2 rule 共 6 條增量 + 新建 skill reference
- rule 行數皆在 ≤50 上限（22 / 18）
- 無衝突，新條款是既有 Manager/User 側補強
- Round 2 建議採「小工程並行」dogfood

**具體行動**（可驗證）：
- 寫入 `/Users/sbu/projects/nova-brain/spec/討論/3-memory-升全域-rule-整合.md`（本檔）
- commit nb repo
- POST /api/cross-dispatch/complete xd-8o85 with summary=絕對路徑 + 方案 D + 6 條草案
- 等 Manager Round 2 質疑 → **若同意 P1（草案骨架）立即啟動實作**（不等 Round 3 close）

## Round 2 期望節奏（小工程並行 dogfood）

```
本 Round 1 (nb)   → Round 2 (Manager)              → Round 2 並行 (nb 實作)    → Round 3 (Manager review)
  方案 + 6 草案      質疑草案 + 隱式同意骨架         擴展 2 rule + skill ref   review commits + close
                                                     ↑ 本 dogfood 的關鍵點
```

若 Manager Round 2 有**結構性反對**（例：方案 B 才對、條款 3 判準需大改）→ 實作延後等 Round 3 共識。
若 Manager Round 2 只有**細節質疑**（例：條款用詞改一個字）→ nb 實作同時接受細節修改。
