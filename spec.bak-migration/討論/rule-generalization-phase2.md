---
status: round-1-draft
dispatch_id: xd-1776517187874-kxxu
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-manager
target_cwd: /Users/sbu/projects/nova-brain
round: 1 (nb → nm, 候選 2 詳細 + 候選 4/1 skeleton)
topic: Rule 廣意化 Phase 2 — 候選 1/2/4 合併（3 組 29→25 降 14%）
supersedes: deferred-marker (2026-04-18T13:10Z)
---

# Rule 廣意化 Phase 2 — Round 1 草稿

## Q1-Q4 確定判斷

### Q1 執行順序：2 → 4 → 1

- **候選 2（任務生命週期）**：nb 日常最頻繁使用，合併後即時驗證；風險低（wording 接近）
- **候選 4（Caller 驗證邊界）**：scope 窄（process.cwd 禁用 + SoT 驗證），合併清晰
- **候選 1（討論協作）**：4→1 最大合併，涉及 cross-session / dispatch-lifecycle skills 雙生關係，風險最高

### Q2 檔名決定

- 候選 1: `rules/協作/討論協作.md`（派發 + 持久化 + 完成即討論 + peer-visibility 4→1）
- 候選 2: `rules/核心/任務生命週期.md`（任務管理 + 總結格式 2→1）
- 候選 4: `rules/元件/caller-邊界.md`（canonical-引用驗證 + library-caller-boundary 2→1）

### Q3 舊引用更新策略：grep+sed 批量（非 redirect pointer）

- grep+sed 批量 1 次 commit 完整切換，drift 風險低
- 4 個 hub README（rules/協作/README.md、rules/核心/README.md、rules/元件/README.md、rules/環境/README.md）+ 所有 md-link 一次改
- architecture.test.js C12 hub cascade SSoT 自動守護（Stage 1.0-E 已實施）
- 舊檔案 `git rm`（不留 redirect pointer，避免增加 hop 數降低 graph clarity）

### Q4 architecture.test.js 新增守護 pattern（2 組）

```js
// A. 合併後檔案存在性
it("rules/核心/任務生命週期.md 存在", () => {
  expect(existsSync(join(CLAUDE_DIR, "rules/核心/任務生命週期.md"))).toBe(true);
});

// B. 被合檔案消失性（防 drift 舊檔復辟）
it("舊任務管理.md + 總結格式.md 已刪除", () => {
  expect(existsSync(join(CLAUDE_DIR, "rules/核心/任務管理.md"))).toBe(false);
  expect(existsSync(join(CLAUDE_DIR, "rules/環境/總結格式.md"))).toBe(false);
});

// C. 舊 md-link 零引用（grep 全 hub 和 skills）
it("舊 rule 名稱不在任何 hub README / CLAUDE.md 出現", () => {
  const oldNames = ["任務管理.md", "總結格式.md"];
  const hubs = ["CLAUDE.md", "rules/核心/README.md", "rules/環境/README.md"];
  for (const hub of hubs) {
    const content = readFile(join(CLAUDE_DIR, hub));
    for (const name of oldNames) {
      expect(content).not.toMatch(new RegExp(`\\[.*\\]\\(.*${name}\\)`));
    }
  }
});
```

## 候選 2 詳細合併草案（本 Round 聚焦）

### 合併前狀態

- `rules/核心/任務管理.md` 11 行（TaskCreate 時機 + task lifecycle）
- `rules/環境/總結格式.md` 27 行（輸出結構 + 收尾流程，含本 session Iteration 1 askuser-sparingly 升級）
- 合計 38 行 — 合併後預估 ~45 行（加 section headers 幫讀）

### 合併後 rule content 草案：`rules/核心/任務生命週期.md`

```markdown
---
name: 任務生命週期
description: session 任務完整生命週期 — TaskCreate 建立 → 執行 → 總結輸出 → wrapup 收尾
type: rule
supersedes: [rules/核心/任務管理.md, rules/環境/總結格式.md]
---

## 任務生命週期

### 任務建立（TaskCreate）

📋 MUST 開始任務前先用 TaskCreate 列出所有已知步驟（subject 描述行為「修復 X」非「step 1」）。執行中發現新子任務立即追加。
⛔ NEVER 完全不建 task 就執行多步驟任務 — 使用者無法追蹤進度。
📋 MUST D2+ 任務同時在 `spec/進行中/` 建 spec 備份 — TaskCreate 在 compact/session 重建後消失。
⛔ NEVER D2+ 只靠 TaskCreate 追蹤。
⛔ NEVER 事後補建 task — TaskCreate 必須在工作開始前。

### 狀態生命週期

📋 MUST task 狀態 pending → in_progress → completed → deleted（只在 Stop 時清 completed 保持下 session 乾淨）。
⛔ NEVER 任務完成後直接 deleted — 必須先 completed 讓使用者看到成果。

### 完成輸出（總結格式）

📋 MUST 每次任務結束時直接輸出結構化總結，不問「要做總結嗎？」；持續執行直到所有任務完全完成。

格式：「## 本次完成」→ 任務明細（markdown 表格 `# | 任務 | 動作/根因 | 證據 | 影響`）→ 副作用與關聯改動 → ★ Insight（1-3 條含 WHY）→ 接下來的建議（/ask 流程）。

📋 MUST 任務明細用 markdown 表格（≥ 3 行 pipe line：header + separator + ≥ 1 data row）。
📋 MUST 本次完成必含「任務明細 / 副作用與關聯改動 / ★ Insight」三段。
⛔ NEVER 用「修好了 / 閉環了 / OK」當任務描述 — 必須含根因 + 證據。
⛔ NEVER 省略 ★ Insight — 即使只 1 條也要寫。
📋 MUST /ask 收尾「給使用者的建議」前先判斷 scope — 技術實作 / 流程選擇 / review 時機 scope owner 自決或 Manager cross-dispatch 討論；AskUserQuestion 限產品方向 / 不可逆動作 / non-negotiable 邊界 / user 唯一寫入權 scope。
⛔ NEVER 機械套用 AskUserQuestion 問技術/流程小事 — 收尾建議用表格直接列（附 ⭐ 推薦 / ⚠️ 條件標記）。

### 收尾流程（wrapup）

📋 MUST 輸出總結後執行快速三問（方向對？還能更好？有異常信號？）→ 產出結論+行動，再跑 wrapup。
📋 MUST 輸出「本次完成」後並行：前景 /ask + cross-dispatch 回報 Manager、背景 Bash 直接執行 `bun wrapup.js`（run_in_background=true）。
📋 MUST 收尾 git push 涵蓋所有有變更的 repo。
⛔ NEVER 只列完成項不列建議；⛔ NEVER 有工作的 session 未執行收尾就結束。
📋 MUST 收尾失敗寫 status: partial，不阻擋退出。
📋 MUST `<promise>DONE</promise>` 在 wrapup 完成通知後才輸出。（✓ wrapup-guard.js Hook 守護）

三個入口時機、task 不需建場景：[obsidian/wiki/nova-pm/task-lifecycle-detail.md](obsidian/wiki/nova-pm/task-lifecycle-detail.md)
收尾 Phase ABC 細節：[skills/feedback-loop/SKILL.md](skills/feedback-loop/SKILL.md)
```

### 合併後 hub README 更新

1. `rules/核心/README.md`：
   - `- [任務管理.md](任務管理.md) — TaskCreate 時機與 D2+ spec 備份` **移除**
   - 加 `- [任務生命週期.md](任務生命週期.md) — TaskCreate + 執行 + 總結輸出 + wrapup 收尾完整生命週期`
   - 條數 6→6（不變 — 本類新增 1 +接收 1）

2. `rules/環境/README.md`：
   - `- [總結格式.md](總結格式.md)` **移除**
   - 條數 6→5

3. `CLAUDE.md` §核心原則 若有直接引用（目前無，但 grep 驗）

### 行數統計

- 合併後草案（去 frontmatter 5 行）：~50 行（rule body）— 剛好貼 ≤50 line 上限。若超需外移一部分 detail 到 skills/
- 預估精簡後 **47-48 行**（壓縮 section header 語氣、合併重複語氣）

### Risk / Rollback

| 風險 | 機率 | 影響 | mitigation |
|------|:----:|:----:|-----------|
| 合併後行數超 50（規則違反） | 中 | 中 | Round 2 若 Manager 發現可精簡到 45 以下；或外移 sub-section 到 skills/ |
| 舊 md-link 有漏抓 | 低 | 低 | grep -rn `(任務管理|總結格式)\.md` in `~/.claude/` 全掃 + architecture.test.js C hub cascade 自動守護 |
| rules/核心/任務管理.md 有外部引用（nova-brain / 其他 project） | 中 | 中 | 先在本 repo grep 全部匹配；nova-brain spec/ 若有引用同步更新 |

**Rollback 計畫**：Batch D 執行若 architecture.test.js fail → `git revert` 雙 repo 原子性回滾。

## 候選 4 skeleton（留下 round 展開）

- 合併 `rules/協作/canonical-引用驗證.md`（行數 pending）+ `rules/元件/呼叫者邊界.md`（行數 pending） → `rules/元件/caller-邊界.md`
- 共同維度：資料邊界驗證（canonical SoT 驗證 + process.cwd 禁用 caller 身份推測）
- Round 2 Manager ack 候選 2 後再展開

## 候選 1 skeleton（留下 round 展開）

- 合併 `rules/協作/討論式派發.md` + `討論式派發持久化.md` + `完成即討論.md` + `對等討論可見性.md` 4→1
- 共同維度：cross-session 討論協作完整生命週期（派發 → 持久化 → 完成 → peer visibility）
- Round 3+ 展開（高複雜度）

## 下 fresh session checkpoint 整合（更新版）

排程刷新（Iteration 2-4 已完成本 session）：

| 優先序 | 任務 | 狀態 | 估時 |
|:---:|------|:---:|:---:|
| ~~1~~ | ~~canary × xd-43j5 治本~~ | ✅ Iter 2 完成 (5caf32a + 3311656) | - |
| ~~Batch 1~~ | ~~askuser-sparingly 升級~~ | ✅ Iter 1 完成 (f4e9f39) | - |
| ~~Batch 2~~ | ~~dispatch-commit-timing + grep-followthrough~~ | ✅ Iter 3 完成 (391e7de) | - |
| ~~Batch 3~~ | ~~目標場景 dedup~~ | ✅ Iter 4 查證無重複 skip | - |
| **4a** | **候選 2 實作（本 spec accept 後）** | Round 2+ | ~45min |
| **5** | ear8 A1+A3 — principles.md 實作層對照 | deferred | ~30min |
| **6** | Batch A — P3 MEMORY.md MOC + Q5.pre + P2 身份段 | deferred | ~70min ⭐ |
| **7** | dv8g Round 1 — 自驅元件整理（候選 3 併此） | deferred | ~45min |
| **8** | 候選 4 實作 | 候選 2 完成後 | ~30min |
| **9** | 候選 1 實作 | 候選 4 完成後 | ~60min |
| **10** | ear8 A2.a — A6 Action Budget dispatch schema | deferred | ~20min |

**本 session 產出**：commits 5caf32a (nova) / 3311656 / c3a2739 / 391e7de (nb) 共 4 commits，含 askuser-sparingly / canary 治本 / test drift fix / Batch 2 rule 升級 + 本 spec 升 round-1-draft。

## Round 2 請求

### 給 nm 的問題（3 項）

1. **§候選 2 合併草案**：nm 同意 45-50 行合併後規模？若需壓縮到 ≤40 需指出哪些 section 可外移 skills/。
2. **§Q3 grep+sed 批量 vs redirect pointer**：nm 是否同意不留 redirect pointer（graph clarity 考量）？
3. **§Q4 architecture.test.js 3 組 test pattern**：是否完整？是否需加 d) 新 rule 被 hub README md-link 引用的正向守護（如 `rules/核心/README.md` 含 `](任務生命週期.md)`）？

### 給使用者的問題

**無**。合併細節屬 scope owner + Manager 共識技術判斷（參 rules/環境/總結格式.md askuser-sparingly 升級）。

## Referenced

- commit 69b7ec1（pre-commit hub cascade SSoT drift block）
- commit aeb9e1a（Stage 1.0-E test-based SSoT 自動偵測）
- commit f4e9f39（本 session Iteration 1 askuser-sparingly 升級）
- commit 5caf32a / 3311656（本 session Iteration 2 canary 治本）
- commit c3a2739（本 session Iteration 2b 3 rule test drift fix）
- commit 391e7de（本 session Iteration 3 Batch 2 rule 升級）
- rules/環境/ralph-loop.md（state.prompt 可寫任務清單原則）
- spec/討論/vault-layer3-migration.md §K（ref-link-linter 前置已達成）

## 討論持久化

Round 1 起草 2026-04-18T13:15Z（nb Iteration 4，本 session），從 deferred-marker 升 round-1-draft。Round 2 由 Manager cross-dispatch 回 3 問題後 nb 啟動候選 2 實作。
