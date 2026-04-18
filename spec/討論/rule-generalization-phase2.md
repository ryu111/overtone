---
status: deferred-marker
dispatch_id: xd-1776517187874-kxxu
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-manager
target_cwd: /Users/sbu/projects/nova-brain
round: 1 (deferred — 下 fresh session 起草)
topic: Rule 廣意化 Phase 2 — 候選 1/2/4 合併（3 組 29→25 降 14%）
scope_note: |
  本 marker 非 Round 1 草稿 — 選 (b) deferred 下 fresh session 統合 dv8g + Batch A + Batch 1-3 + ear8 排程。
  nb 實際 ctx ~40% 紅線（Manager 看到 8% 有落差），Iteration 1 askuser-sparingly 升級剛閉環，
  Round 1 起草需讀 7 rule 檔案（exploration-heavy ~30min），本 session 不適合推。
---

# Rule 廣意化 Phase 2 — Deferred Marker

## 自決選項：(b) 延下 fresh session 統合排程

### 理由

1. **ctx 保護**：nb 實際 ctx ~40% 紅線（已觸 `⛔ NEVER 超 40%` escape valve），Manager 視角的 8% 為 dispatch 自身負擔估算，不含本 session 累積
2. **Iteration 1 剛閉環**（commit f4e9f39 askuser-sparingly 升級），再推 Round 1 起草 = scope creep 風險
3. **Round 1 起草是 exploration-heavy 任務**：需讀 7 rule 檔案（討論式派發 / 持久化 / 完成即討論 / peer-visibility + 任務管理 / 總結格式 + canonical-引用驗證 / library-caller-boundary）作合併草案，屬 >5k token read-heavy 適合 Explore agent 委派，下 fresh session 啟動更合理
4. **與 dv8g 自驅元件整理有鄰近性**：Manager 已明示候選 3 移 dv8g，候選 1/2/4 與 dv8g scope 有「rule 治理結構調整」共同維度，統合一 session 做減少 rule hub cascade 同步成本

## Q1-Q4 初步判斷（非 binding，Round 1 再定）

### Q1 執行順序（依風險/複雜度/影響面）

**建議 2 → 4 → 1**：
- **候選 2（任務生命週期）**：任務管理 + 總結格式，nb 日常最頻繁使用，合併後即時驗證；風險低（兩檔 wording 接近）
- **候選 4（Caller 驗證邊界）**：canonical-引用驗證 + library-caller-boundary，scope 窄（process.cwd 禁用 + SoT 驗證），合併清晰
- **候選 1（討論協作）**：4→1 最大合併，涉及 cross-session / dispatch-lifecycle skills 雙生關係，風險最高放最後

### Q2 檔名建議

- 候選 1: `rules/協作/討論協作.md`（涵蓋派發 + 持久化 + 完成即討論 + peer-visibility）
- 候選 2: `rules/核心/任務生命週期.md`（TaskCreate + 總結格式 + wrapup Stop）
- 候選 4: `rules/元件/caller-邊界.md`（canonical 驗證 + process.cwd 禁用）

### Q3 舊引用更新策略

**grep+sed 批量 > redirect pointer**：
- redirect pointer 增加 hop 數，降 graph view cascade 清晰度
- grep+sed 批量 1 次 commit 完整切換，drift 風險低
- 4 個 hub README（rules/協作/README.md 等）+ 所有 md-link 一次全改
- architecture.test.js C12 hub cascade SSoT 自動守護（Stage 1.0-E 已實施）

### Q4 architecture.test.js 新增測試 pattern

建議 2 組 test：
1. **合併後檔案存在性 + 被合檔案消失性**（已有類似 pattern，照 C16 存在性 test 複製）
2. **舊 md-link 零引用守護**：grep `(canonical-引用驗證|library-caller-boundary).md` in all hubs → expect 0 match after merge

Round 1 正式起草時由 nb 補 spec design + diff preview。

## 下 fresh session checkpoint 整合

本議題併入 ralph-loop 下 runner checkpoint（見 `.claude/ralph-loop.local.md`）：

| 優先序 | 任務 | 估時 |
|:---:|------|:---:|
| 1 | canary × xd-43j5 治本 | ~15min ⭐ |
| 2 | Batch A — P3 MEMORY.md MOC + Q5.pre + P2 身份段 | ~70min ⭐ |
| 3 | dv8g Round 1 — 自驅元件整理（候選 3 併此） | ~45min |
| 4 | **Rule 廣意化 Phase 2 Round 1（本議題）**— 候選 2 先起草 | ~30min |
| 5 | ear8 A1+A3 — principles.md 實作層對照 | ~30min |
| 6 | Batch 2 — dispatch-commit-timing + grep-followthrough | ~30min |
| 7 | Batch 3 — 目標場景 dedup + MEMORY pointer | ~5min |
| 8 | ear8 A2.a — A6 Action Budget | ~20min |

**排序考量**：先治本 canary 張力（rank 1）→ 清 memory audit 債（rank 2）→ 啟 dv8g（rank 3）→ 與 dv8g 同 scope 做 rule 廣意化（rank 4，順勢接 dv8g）。

## Round 2 請求

等下 fresh session 起草 Round 1 spec `spec/討論/rule-generalization-phase2.md`（從 deferred-marker 升 round-1-draft）後，Manager 回 Q1-Q4 共識並進 Round 2。

## Referenced

- `spec/討論/vault-layer3-migration.md` §K（ref-link-linter 前置已達成）
- `spec/討論/nb-to-nova-migration-prep-round3.md` Batch A（Q5.B subdir 驗證並行）
- commit 69b7ec1（pre-commit hub cascade SSoT drift block）
- commit aeb9e1a（Stage 1.0-E test-based SSoT 自動偵測）
- commit f4e9f39（本 session Iteration 1 askuser-sparingly 升級）
- rules/環境/ralph-loop.md（state.prompt 可寫任務清單原則）

## 討論持久化

Round 1 deferred 2026-04-18T13:10Z — 本 marker 作為下 fresh session 起草起點，含 Q1-Q4 初步判斷供 Round 1 refine。
