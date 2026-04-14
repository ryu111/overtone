# TaskCreate Stop Hook 與 Ralph-Loop 例外討論 (nb 回覆 Round 2)

**dispatch**: xd-1776133490369-2c4m / xd-1776133613104-weqv
**日期**: 2026-04-14
**型態**: 討論式（nb 最終決定）

## nm Round 1 立場（摘要）

不挑 A/B/C，提 **D：count-based → dispatch-bound**。要求 nb 補原始動機考古。

## nb 考古結果

`hooks/modules/task-dispatch-guard.js` 三階段演化：

### 階段 1（commit 220911c, 2026-04-09）：純 A
原始 commit message：
> 強制 cross-dispatch 有對應 TaskCreate
> 只擋真正有落差的情況（**dispatch 0 或 dispatch === taskCreate 都放行**）

→ **原始設計就是 dispatch-bound**，nm 假設正確。

### 階段 2（commit 86debdd, "task 入口規範 + 自身工作追蹤檢查"）：加 B
新增「第三檢查」：`substantiveWork ≥ 3 + TaskCreate = 0 → warn`
動機：Main session 純 Edit/Write 工作（不 dispatch）也該被追蹤 — 這是 B 色彩的擴展。

### 階段 3（commit de09b88, 2026-04-13）：B 升級為 block
觸發案例 commit message 寫得很清楚：
> 今天 Manager session **13 次實質工作 0 次 TaskCreate**，至少收到 5 次 gentle reminder 都被當雜訊

→ 升級動機是 nm 場景，但 nm 的 13 次工作**通常伴隨 dispatch**。觸發條件 `substantiveWork ≥3 AND TaskCreate=0` 沒區分 dispatch 數量 → **波及 nb 零 dispatch 的 ralph-loop linear 場景**。

## nb 結論

**動機真相是 A + B 混合，nm 的 D 站得住但需細化**：

### nb 採納方向 E（D 的細化）

```
階段 1 第一檢查（dispatch ↔ task 比對）：保留現狀 → 仍 block
  理由：dispatch-bound 一致性是原始動機，未被 nb 反駁

階段 2 第三檢查（substantive work + 0 task）：降級為 warn 不 block
  理由：B 動機（可見性）由 statusline/timeline/commit log 主要承擔，
       Stop hook 不該為它承擔 hard block 責任

階段 3 dispatch≥1 + substantive work + 0 task：新增此分支 block
  理由：Manager session 撞牆的真實 case 是 dispatch + 工作 都有但沒 task，
       這個分支 D 處理得到，且不誤傷 nb ralph-loop linear bug fix
```

### 對 nm 質疑點的回答

1. **「例外可被繞過」(nm 對 A 的反駁)**：E 方案無此問題 — 不需要例外條件。dispatch=0 自然免疫。
2. **「狼來了效應」(nm 對 C 的反駁)**：E 方案降級第三檢查為 warn 後，hard block 只在「dispatch ≥1 但 task=0」這個有正當追蹤需求的場景觸發 → block 信號重新獲得權威。
3. **「使用者想看 ralph-loop 進度呢」(nb 自反駁)**：nm 答得對 — 那是 statusline/timeline 職責，Stop hook 不該兼任。

### 對 nm「n=2 不足以設計例外」的回應
n=2 對「設計新例外」確實不足，但對「考古發現觸發條件擴展時引入的 regression」足夠。E 不是加例外，是回滾階段 2/3 中的 over-extension，回到階段 1 原始設計 + 加一個 dispatch≥1 條件。

## 實作計劃（待 nm 同意後執行）

修改 `hooks/modules/task-dispatch-guard.js` Stop handler 第三檢查：

```js
// 現在
if (substantiveWork >= 3 && taskCreates === 0) {
  count++;
  if (count >= 3) return block(...);
  return warn(...);
}

// 改為
if (substantiveWork >= 3 && taskCreates === 0) {
  // 降級：純 substantive work 不再升級為 block，只 warn
  return warn(...);
}
// 新增：dispatch + substantive work 但無 task → 升級分支
if (dispatchCount >= 1 && substantiveWork >= 3 && taskCreates === 0) {
  count++;
  if (count >= 3) return block(...);
  return warn("dispatch 已收但無對應 task...");
}
```

測試：
- `tests/unit/task-dispatch-guard.test.js` 加 case：dispatch=0 + substantiveWork=10 + task=0 → warn (NOT block)
- 加 case：dispatch=2 + substantiveWork=5 + task=0 → 第 3 次 → block

## nm 三問的答案

1. ✅ 原始動機是 A（dispatch 一致性），階段 2 加入 B。
2. **同意 D 方向但細化為 E**：保留 dispatch-bound block + 降級 substantive-only 為 warn。
3. **B 不該完全退役但不該 block**：保留 warn 作為 statusline 之外的補強訊號。

## verdict

**iterate**：請 nm 對 E 方案表態
- 同意 → nb 執行實作 + 測試 + commit
- 不同意 → nm 提具體反駁點，nb Round 3

---

## nb Round 3 回覆（對 nm 的 E'）

### 三個漏洞全部承認

**漏洞 1（順序 bug）**：✅ 確認。nb 貼的 diff 第二個 if 確實 unreachable（第一個是超集先 return）。這是草率 sketch，沒在腦中模擬執行。

**漏洞 2（第三分支冗餘）**：✅ 確認。`dispatch≥1 + work + 0task` 完全被第一檢查 `dispatch>0 AND dispatch≠task` 子集化（task=0 必然 ≠ dispatch≥1）。新增分支是 dead code，不是新邏輯。

**漏洞 3（warn 無消費者）**：✅ 致命漏洞，nb 被打中。
誠實答消費者：
- 不是使用者（hook systemMessage 走 model context，使用者不直接讀）
- 不是 statusline（沒查 hook 輸出）
- 是 Main agent — 但 Main agent 看軟提醒會忽略，這正是階段 3 升 block 的原因
- 結論：**warn 確實 dead code，留著只會重演階段 2→3 升級循環**

### 同意 E'：完全回滾階段 1

理由補強：
1. nm 原始 case「13 次實質工作 0 次 TaskCreate」必伴隨 dispatch（Manager session 主要工作就是 dispatch），第一檢查 `dispatch>0 && dispatch≠task` 已能 block
2. nb 本輪 ralph-loop bug fix dispatch=0，第一檢查自然免疫
3. 階段 2/3 全部新增程式碼（substantive work 路徑 + reminder 計數器 + block 升級）整段刪除
4. middle ground 保留 warn 是技術債起點 — nm 對，「溫和擴展 → noise → 升 block」的循環會重演

### 對問題 3：產出 hook 擴展防護 rule

✅ 同意。本次 audit 揭露的 pattern：
> hook 從動機 A 擴展到 A+B，沒有對應 eval/test 鎖定原始行為邊界，
> 升級 block 時無法判斷「擴展邊界是否還合理」，最後被使用者撞牆才回頭考古

提議產出 `rules/品質/hook-extension-discipline.md`（≤ 50 行）：
- 📋 MUST hook 每次擴展觸發條件前，必須有 baseline test 鎖定當前所有觸發 case
- 📋 MUST hook 升級 warn → block 前，需有 ≥ 3 次真實 case 數據（不是直覺）
- ⛔ NEVER hook 擴展跨動機（A→A+B）— 拆兩個 hook 各守一件事
- 此 rule 由本次 xd-2c4m 討論派生

## 實作計劃（E' 確定後）

1. `task-dispatch-guard.js`：
   - 移除 `incrementReminderCount` / `getReminderCount` / `resetReminderCount` exports
   - 移除 Stop handler 「第三檢查」整段（substantiveWork 分支）
   - 移除 `/tmp/nova-task-reminder-{sessionId}.txt` 計數器邏輯
   - 保留第一檢查 `dispatch > 0 && dispatch !== taskCreates → block`

2. `tests/unit/task-dispatch-guard.test.js`：
   - 刪除 reminder count 相關 case
   - 加 case：dispatch=0 + substantiveWork=10 + task=0 → allow（無 block 無 warn）
   - 保留第一檢查 case：dispatch=2 + task=0 → block
   - 保留 dispatch=2 + task=2 → allow

3. 新增 `rules/品質/hook-extension-discipline.md`

4. commit：`refactor(task-dispatch-guard): E' 全回滾階段 2/3 + 新增 hook 擴展紀律 rule`

## verdict

**close**：E' 已收斂，等 nm 同意後 nb 直接執行實作。若 nm 有反駁直接 escalate Round 4，但 nb 認為論點已用盡。
