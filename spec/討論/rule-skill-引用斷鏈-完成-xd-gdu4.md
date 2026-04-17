---
source: nova-manager
dispatch_id: xd-1776421642567-gdu4
priority: low
type: 討論式 → 實作
target: nova-brain
round: 2
status: complete
depth: D1
---

# Rule→Skill 引用斷鏈修復完成 — xd-gdu4 Round 2 回覆

## 執行摘要

Manager Round 2 授權動工 3 條 + discovered adjacency 1 條 + architecture test 挑戰 1，全部完成並 commit + push 雙 repo。

## 動工 checklist 結果

| 條 | Manager 指示 | 實際動作 | 狀態 |
|----|-----------|---------|------|
| 1a | `nova-eval/benchmark-winner-detail.md` 從 `_archived/` 取回 | `git mv skills/_archived/nova-eval skills/nova-eval`（含 SKILL.md + references/）| ✅ |
| 1b | `lb-phase-b-reflection.md` rule 刪引用 | `sed -i ''` 刪 `rules/品質/benchmark-winner-selection.md:12` 的「；派生來源：...」| ✅ |
| 2 | `multi-tier-routing` rule 改指 `auto` | `sed -i ''` 改 `rules/核心/深度路由.md:23` multi-tier-routing → auto | ✅ |
| Discovered | config-sot/onboard/model-cascade grep 殘留 | 發現 `rules/環境/工具選擇.md:18` 引用 `model-cascade`，同 1a 邏輯 git mv 取回 active | ✅ |
| 挑戰 1 | architecture test 補 rule→skill 存在性 | `tests/unit/architecture.test.js` 新 it block 掃全域 rules + 5 子目錄 | ✅ |

## Commit Hashes

| Repo | Hash | 內容 |
|------|------|------|
| `~/.claude/` (nova) | **6875a1e** | 2 rules 修 + 2 skills _archived→active |
| `~/projects/nova-brain/` | **528dde4** | architecture test 新 it block |
| `~/projects/nova-brain/` | **16a394d** | 補救 test-locks-bug（見下） |

## test-locks-bug 補救

跑 full `bun test` 抓到 `tests/unit/benchmark-winner-rule.test.js` 的 `it("含派生來源指向 lb phase-b-reflection")` fail — 該 test 當初鎖定幽靈引用存在，屬 nova-test skill 的 test-locks-bug 反模式。移除此 it（不是跳過，不是 skip）— rule 正確版本本就不該含幽靈。

## grep-ls 驗證輸出

```
=== rules/ skill 引用驗證（修復後）===
OK: skills/auto/SKILL.md
OK: skills/claude-dev/references/ask-user-question-chain.md
OK: skills/claude-dev/references/library-caller-boundary-detail.md
OK: skills/claude-dev/references/module-architecture.md
OK: skills/claude-dev/references/sse-events.md
OK: skills/component-classification/references/lifecycle-detail.md
OK: skills/component-classification/SKILL.md
OK: skills/cross-session/references/canonical-verification-detail.md
OK: skills/cross-session/references/discussion-dispatch-persistence-detail.md
OK: skills/cross-session/references/owner-commit-discipline-detail.md
OK: skills/cross-session/references/peer-discussion-detail.md
OK: skills/cross-session/SKILL.md
OK: skills/feedback-loop/references/protocols.md
OK: skills/feedback-loop/references/self-compact-detail.md
OK: skills/feedback-loop/SKILL.md
MISS: skills/hooks  ← 誤判：rule 句「rules/skills/hooks/agents/...」目錄列舉，Round 1 已撤回
OK: skills/local-model-dispatch/SKILL.md
OK: skills/model-cascade/SKILL.md          ← Discovered adjacency 取回
OK: skills/nova-eval/references/benchmark-winner-detail.md  ← 條 1a 取回
OK: skills/nova-pm/references/task-lifecycle-detail.md
OK: skills/nova-test/references/anti-patterns.md
OK: skills/nova-test/SKILL.md
OK: skills/pinchtab/references/browser-routing.md
OK: skills/wording/SKILL.md
```

實質 OK: **22 / 22**（`skills/hooks` 是目錄列舉非引用，grep 正則貪婪命中誤報）。

## architecture test 設計考量

我的 test regex 用「見|來源:」前綴精確匹配，避免誤抓「rules/skills/hooks/agents/」這種目錄列舉：

```js
/(?:見|來源[：:])\s*(?:全域\s*)?[`]?skills\/([^\s`」\n；;]+)/g
```

`bun test tests/unit/architecture.test.js` 441 pass / 0 fail 確認 regex 正確區分「引用」vs「列舉」。

## 測試驗證

```
$ bun test tests/unit/architecture.test.js tests/unit/benchmark-winner-rule.test.js
 445 pass
 0 fail
 573 expect() calls
```

## 挑戰 2 回應（歸檔流程 SOP）

Manager 挑戰 2「skill 歸檔流程 SOP」建議另派 — nb 同意延後。本輪 architecture test 已建立結構性防護（改了 skill 位置 test 會 fail），達到「實質守護」效果，SOP 文件可後續補。

## next_action_proposal

**verdict**: `close`
**proposal**: 無 — Round 2 完成 + 結構防護已建，本議題可關閉。
**blockers**: 無
**discovered_adjacencies**:
1. `rules/環境/工具選擇.md:18` 的 model-cascade 是本輪 discovered 殘留，已處理
2. Manager 挑戰 2（歸檔 SOP）建議另派 follow-up spec
3. `rule-audit.test.js` 和其他掃全域 rules 的 test 可套用同 pattern 擴展守護面

## 反思（本輪發現）

- **test-locks-bug 教訓**：xd-lzhn test 當初鎖 phase-b-reflection.md 引用，但該檔從未存在 — 鎖定 bug 當正確行為。這說明**存在性 test 不能只看字串匹配，要配合 target resolvable 驗證**。本輪 architecture test 新 it 正是補這種盲點。
- **Manager 列「MISSING」也要再驗證**：Manager 漏了 `skills/hooks` 目錄列舉這個誤判（本來 3 條，後撤回 1 條）— canonical-引用驗證 rule 再次命中。
