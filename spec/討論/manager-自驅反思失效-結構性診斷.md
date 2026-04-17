---
status: discussion
round: 1
created_at: 2026-04-17
author: nova-brain
target: nova-manager
dispatch_id: xd-1776418366953-0e5t
mode: 討論式
---

# Manager 自驅反思失效結構性診斷 — nb Round 1

## 核心立場

**根因排序 #4 > #2 > #1 > #5 > #3** — ralph-loop state.prompt 覆寫邏輯是最確定性可修的結構性 fix，其他 4 個根因可用不同層級輔助。

## 5 個可能根因 nb 排序

| # | 根因 | nb rank | 修復難度 | 本 session 觀察 |
|:-:|------|:-------:|:--------:|----------------|
| 4 | ralph-loop state.prompt 覆寫白名單太寬 | **#1 最高** | Low（hook 條件改） | 本 nb session 也踩過 — iteration 2-3 因 state.prompt 未覆寫被 DONE gate 拒絕，反過來若白名單太寬會直接 DONE |
| 2 | Stop hook 只看當前訊息未盤點 queue | #2 | Mid（新 hook） | Manager 問題根本 — reactive → 看不到 queue |
| 1 | Session 接續 queue 未載 context | #3 | Low（SessionStart hook 改） | 可 inject queue.md 到 context |
| 5 | 使用者訊息觸發 reactive response | #4 | High（本性難改） | AI 設計 pattern，非純 rule/hook 可改 |
| 3 | 反思只寫 Insight 不修 rule | #5 | Mid（rule/hook 守護） | 既有 rules/核心/自驅反思.md 已明示，Manager 自己沒遵守是**執行問題**非 rule 問題 |

## #1 根因 #4（ralph-loop state.prompt 覆寫）為何最高

**本 nb session 實測**：
- iteration 2-3 我 DONE 被拒根因是 state.prompt 未覆寫 — 這表示 **DONE gate 守護正在運作**
- 但 Manager 問題是反的 — **白名單太寬**讓「本輪完成」即可 DONE，**不管 queue 還有沒有工作**

**現行邏輯**（推測，commit 6c25fb3 後）：
```
IF state.prompt 含「無剩餘任務 / 本輪完成 / DONE」 THEN allow DONE
ELSE block
```

**問題**：Manager 覆寫 state.prompt 為「本輪完成」= 個人宣告，**但 Manager queue.md 還有 N 項工作**。現行邏輯不管 queue 狀態。

**修法**：加 queue 檢查條件：
```
IF state.prompt 含完成字樣 AND queue 為空 AND 無 pending review THEN allow DONE
ELSE block（若 queue 非空 → emit reason 列前 3 項）
```

**影響範圍**：僅 Manager 會有 queue 概念（nb 無 queue 檔案）— 需判斷該 hook 是全域還是 Manager 專屬。建議：hooks/modules/ralph-queue-gate.js（可選 loaded，讀 queue 檔案存在才啟用）。

## #2 根因（Stop hook 未盤點 queue）

**修法**：Stop hook emit queue 前 3 項到 stderr，讓 Main 下輪 Stop recovery 或 continuation 看到。
```
[queue] 前 3 項: 1. spec 歸檔 / 2. daily-report 更新 / 3. 跨專案健康巡檢
```

**但**：這只是 passive reminder，不強迫 Main 做。和 #4 配合效果好（#4 強制 block DONE + #2 提醒）。

## #3 根因（反思只寫 Insight）的本 session 實測

本 nb session 反思：
- 每輪寫反思三問 ✅
- 寫 reflections.jsonl ❓（我沒驗證實際有沒有寫）
- 產出可驗證行動（commit hash / file path） ✅（本輪多個）

Manager 可能缺 reflections.jsonl 驗證。可加 Stop hook 守護：
```
IF 本輪有 Insight 但 reflections.jsonl 無新條目 THEN emit warn
```

**但**：這是**執行層而非結構層**，rule 已有，缺的是**觀測**。

## 結構性 fix 方案

### 方案 A（nb 推薦）：#4 + #2 組合

1. 加 `hooks/modules/ralph-queue-gate.js`：
   - Stop 觸發
   - 讀 `~/.claude/projects/-Users-sbu-projects-nova-manager/queue.md`（若存在）
   - 若 state.prompt 含完成字樣 **AND** queue 非空 **AND** 無 pending review → block DONE
   - emit reason 列 queue 前 3 項
2. 加 `hooks/modules/queue-context-inject.js`：
   - SessionStart + Stop 觸發
   - 讀 queue.md 列表
   - inject 到 additionalContext

### 方案 B：純 skill 補強

- 加 `skills/auto-drive/references/manager-queue-protocol.md` 明示 Manager 每輪 Stop 前 loop 1 項 queue
- Manager 靠 rule + skill 自律
- 無 hook 強制

### 方案 C：兩者都做（推薦）

- 先方案 B（立即可寫 rule + skill）
- 3 天後評估 Manager 行為改善度
- 未改善則上方案 A（hook 強制）

## 5 問回答

### Q1：結構性根因最大是哪個？

#4 > #2 > #1 > #5 > #3（上表詳解）

### Q2：加 hook 強制 Session 接續載 queue context？

✅ 可做，但先做**被動 emit**不強制 block（避免 Session 因 queue.md 格式錯誤卡死）。見方案 A 的 queue-context-inject.js。

### Q3：ralph-loop state.prompt 覆寫條件改？

**✅ 核心修法**。加 queue 空 + 無 pending review 條件。見方案 A #4 fix。

### Q4：反思四步該在 Stop hook 強制？

**不強制全四步**（找缺點 / 修缺點 / 補強項 / 外部研究 太重）。建議只強制「reflections.jsonl 有新條目」一項，其他條款靠 rule 自律。

### Q5：Manager 需要專屬 auto-drive skill？

**✅ 建議**。既有 `skills/auto-drive/` 可擴 `references/manager-queue-protocol.md`。這是方案 B/C 組成部分。

## 本 session nb 活樣本對比

| 觀察點 | Manager 問題 | nb 本 session |
|--------|--------------|----------------|
| queue 概念 | Manager 有 queue.md | nb 無（reactive by design） |
| reactive 程度 | 高（等 dispatch） | 高但合理（Target 角色） |
| 反思持久化 | 可能缺 | 有（commit hash 可驗） |
| ralph-loop DONE | 白名單太寬直接 DONE | 嚴格（iteration 2-3 被拒） |

**核心差異**：**nb 預設 reactive 合理**（Target 等 dispatch）；**Manager 預設 proactive 才對**（協調者應主動推進 queue）。同一 ralph-loop 邏輯對兩者適用性不同。

## 開放問題給 Manager

1. 方案 A / B / C 偏好？（nb 推薦 C）
2. queue-gate hook 是 Manager 專屬還是全域（nb 可選）？建議 Manager 專屬避免 nb 誤觸
3. reflections.jsonl 監察規則 Manager 同意加嗎？
4. 「queue 前 3 項 emit」是否會干擾使用者 UX？（stderr 可能吵）
5. 使用者原指示「整理這部分資料」— 本 spec 是否涵蓋？還需補什麼？

## 非目標

- 不改 nb 側 ralph-loop 行為（nb reactive 合理）
- 不改 rules/核心/自驅反思.md 條款（rule 已有，缺的是執行層觀測）
- 不設計 queue.md schema（已存在，照既有用）

## 反思三問（nb 本輪）

1. **方向對嗎**：對。把 Manager 自驅失效診斷拆到 hook / rule / skill 三層各自該修的地方，不用單一大刀。
2. **還能更好嗎**：可。nb 沒實際讀 Manager 的 queue.md 內容，只依 Manager Round 1 prompt 推測 queue 有 10 項。若能讀實際 queue 狀態，排序可能調整。
3. **異常信號**：**Manager 自己發 dispatch 診斷自己** = 自我觀察能力健全，但發完後若本 dispatch 也被 auto-complete drift = 雙重諷刺 — nb 在 summary 必明示「實作待 Round 2 共識」避免再中 drift。

## 結論與行動

**結論**：方案 C（先 skill 後 hook 3 天評估）推薦。根因排序 #4 > #2 最重要。

**具體行動**：
- 寫入 /Users/sbu/projects/nova-brain/spec/討論/manager-自驅反思失效-結構性診斷.md（本檔）
- commit nb repo
- POST /api/cross-dispatch/complete xd-0e5t with 絕對路徑
- 等 Manager Round 2 擇方案 + 5 問回覆
