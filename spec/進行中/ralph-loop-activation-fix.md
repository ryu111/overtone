---
spec: ralph-loop-activation-fix
status: 規劃中
owner: nova (cwd=~/.claude)
created: 2026-04-19
trigger: 使用者糾正「我沒有要求 nm 自驅，但他自己自驅了，是不是在自驅跟非自驅之間沒有控制好」(2026-04-19 ~10:45 nb iter 15)
priority: high
estimated_effort: D2 ~1-2 session
---

# Ralph-loop Activation Default 修法

## 根因（3 層 design philosophy 衝突）

### 衝突 1: 語意 — 「ralph-loop」字面 vs 預設值

| 層 | 認知 |
|:--|:--|
| 使用者 mental model | 「ralph-loop / 自驅」= user 明示啟動才該轉迴圈 |
| 實作 mental model | `hooks/modules/ralph-loop.js:144` UserPromptSubmit 預設啟動 — 任何 user prompt 沒既存 state 檔 → 自動建 `active: true` |

**證據**：iter 15 末段使用者提交治理討論 prompt「我沒有要求 nm 自驅...」→ nb hook 在處理該 prompt 時又自動建了新 ralph-loop.local.md（session_id=d5995e..., started_at=2026-04-19T10:48:17）。**連治理討論 prompt 都被當自驅 trigger**。

### 衝突 2: 授權 — rule 7/24 紀律 vs 預設啟動

`rules/環境/ralph-loop.md` 7/24 持續運轉紀律：「⛔ NEVER 對話輸出『接下來的建議』列任何選項後選 graceful close」+「graceful close 僅限四場景（ctx>70% / quota / 使用者明示暫停 / spec 真空）」。

但**啟動條件是「任何 user prompt」自動進入**，未經 user 明示授權 → AI 被強制續 iter = AI 自我擴張 user 授權範圍。

### 衝突 3: 可控性 — 無 opt-out 機制

- 無 CLI / slash command「ralph-loop off」
- 使用者唯一停止方式：手動刪 `~/projects/X/.claude/ralph-loop.local.md`（或等 max_iterations 達成）
- 即使刪檔，下一輪 user prompt 又會自動重建

## Cascade 反模式（本次 nm/nb 案例）

```
2026-04-19 09:14  user → nb 早上 prompt → nb hook 自動建 active=true state
     ↓
nb iter 1-13      自驅執行衍生工作（spec frontmatter + arch test + ...）
     ↓
nb iter 14        user 對 nb 補新 prompt「還有 handoff 該回 tmp/nova...」+ nb 對 nm 邀討論
     ↓
2026-04-19 10:19  nm 收 nb dispatch（或被 user 啟動）→ nm hook 自動建 active=true
     ↓
nm iter 1-15      自驅執行 4 dispatch (xd-c73g/fooz/k796/z8v8) 給 nb
     ↓
nb iter 15        nb 處理 4 dispatch + spec + Round 1 — 全是 nm 衍生鏈，遠離 user 原 trigger
     ↓
user 介入        「我沒要求 nm 自驅」→ 真實表達衝突感受
```

**衍生鏈深度**：user「icon 顯示」單次 prompt → 4 層衍生 → 5 commits + spec + Round 1 討論。**AI 自行擴張授權範圍 100x+**。

## 修法（3 層 cascade）

### Layer 1: Hook 預設改 active=false（最關鍵，治本）

`hooks/modules/ralph-loop.js` UserPromptSubmit handler line 183-198：

**改前**（預設 active=true）：
```js
writeFileSync(ralphFile, [
  "---",
  "active: true",        // ⚠️ 預設啟動
  "iteration: 1",
  ...
].join("\n"));
```

**改後**（預設 active=false，明示信號才升 true）：
```js
const RALPH_TRIGGER_RE = /\b(ralph[-_]?loop|自驅|持續做|keep\s*(going|doing)|不停做|做完繼續|7\/24|loop\s*(on|start))\b/i;
const isExplicit = RALPH_TRIGGER_RE.test(userPrompt);
writeFileSync(ralphFile, [
  "---",
  `active: ${isExplicit ? "true" : "false"}`,  // 明示信號才 true
  "iteration: 1",
  ...
].join("\n"));
```

**效果**：使用者打字 ≠ 自驅啟動；要寫「持續做 X」「自驅 Y」「ralph-loop on」等明示信號才轉迴圈。

### Layer 2: Rule 啟動授權紀律（治本 + 文件化）

`rules/環境/ralph-loop.md` 加新段「啟動授權」（在 7/24 紀律之前）：

```markdown
## 啟動授權紀律（2026-04-19 user 糾正「我沒要求 nm 自驅」）

⛔ NEVER ralph-loop active=true 預設值 — UserPromptSubmit hook 必檢查 user prompt 含明示信號才升 active=true。
📋 MUST 明示信號白名單：「ralph-loop」「自驅」「持續做」「keep going/doing」「不停做」「做完繼續」「7/24」「loop on/start」(case insensitive)。
⛔ NEVER AI 收單次任務 prompt 自行決定轉自驅模式 — user 沒寫明示信號 = 該 prompt 為單次任務，完成後 graceful DONE 是正確行為，7/24 紀律不適用。
📋 MUST 自驅啟動後 user 可隨時 toggle off：(a) 寫 `/ralph-loop off` slash (b) 直接告訴 AI「停止自驅」(c) 手動刪 `.claude/ralph-loop.local.md`。
⛔ NEVER hook 在 active=false 後自動重建 active=true — 必須 user 重新 explicit 授權。
```

### Layer 3: Mode classification 加軸（治本 + structural）

`skills/auto/SKILL.md` decision tree 加新軸（D0-D4 + Domain 之外）：

```
任務分類軸：
  - 深度: D0/D1/D2/D3/D4
  - Domain: claude-dev / nova-test / nova-spec / ...
  - 持續性: 單次任務 (default) / 持續自驅 (要 user 明示信號)
```

對應 hook：
- 單次任務 → ralph-loop.local.md `active: false`，Stop hook 不 block
- 持續自驅 → `active: true`，Stop hook 啟 7/24 紀律

## 影響面

| Scope | 改動 |
|:--|:--|
| `hooks/modules/ralph-loop.js` | line 183-198 加 RALPH_TRIGGER_RE 檢查 + 動態 active 值 |
| `rules/環境/ralph-loop.md` | 加「啟動授權紀律」段（~10 行） |
| `skills/auto/SKILL.md` | decision tree 加「持續性」軸 |
| `commands/ralph-loop.md`（如存在）| 加 `off` subcommand |
| `tests/unit/architecture.test.js` | 加 RALPH_TRIGGER_RE 存在守護 + 預設 false 行為 test |
| obsidian/episodic/incidents/ | 紀錄本案 cascade 反模式 |

## 驗收條件

- ✅ hook 改後實機驗：user prompt 「實作 X」→ active=false；user prompt「持續做 X」→ active=true
- ✅ user prompt 含「ralph-loop on」明示信號 → active=true
- ✅ 既存 active=false state 檔被 user prompt 進來時不會被 hook 重建為 active=true
- ✅ rule 加新段，nb arch test 580 pass 不退步
- ✅ 治理段落結束 user 可主動 toggle off (`/ralph-loop off` 或對話「停止自驅」)
- ✅ 反思 entry 含 `external_references` 對應 ralph-loop / opt-in 設計業界紀律

## 風險與緩解

| 風險 | 緩解 |
|:----|:----|
| 改後 user 既存「打字進迴圈」習慣破壞 | rule 文件化 + slash help「打字預設單次，要持續寫 'ralph-loop on'」 |
| 明示信號正則漏網（user 寫「不要停 keep iterating」沒 match）| 啟動後對話有 5 句機會給 user 補「持續做」升級到 active=true |
| nm/nc/L5 各自 hook 也用同 ralph-loop.js | nb 改 hook 後 push 統一上 git，跨 session 同步 |
| 預設 false 後使用者真要自驅但忘了寫信號 | UserPromptSubmit hook 偵測 ≥ 5 個 imperative verb 或長度 > 200 字 prompt → suggest「想自驅嗎？回 'ralph-loop on'」 |

## 啟動時機

待 user 拍板後立即執行 Layer 1（hook 改 ~30min）+ Layer 2（rule 加段 ~10min）+ Layer 3（skill 加軸 ~15min）+ test ~15min ≈ 1-1.5h 一輪完成。

## Sources

- 使用者糾正 prompt (2026-04-19 ~10:45): "我沒有要求 nm 自驅，但他自己自驅了，是不是在自驅跟非自驅之間沒有控制好"
- `hooks/modules/ralph-loop.js:134-211` UserPromptSubmit handler
- `rules/環境/ralph-loop.md` 7/24 紀律段
- 對齊業界 opt-in vs opt-out design pattern（如 macOS «Privacy & Security» 預設禁，user 明示 grant）
