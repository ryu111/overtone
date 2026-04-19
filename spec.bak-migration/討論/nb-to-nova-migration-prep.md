---
status: discussion-round-1
dispatch_id: xd-wksw
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm peer discussion)
topic: nb 身份/記憶遷移到 ~/.claude/ 的準備規劃（M1 pre-migration prep）
---

# nb → nova 遷移準備（M1 pre-migration prep）

## Context

使用者訊息（2026-04-18）：「nb 看什麼時候要搬到 .claude/CLAUDE.md 了，就是職責要轉過去，他也將在那裡重生，這件事他也要先準備，代著自己的記憶」

Manager dispatch（xd-wksw）要求起草遷移準備 spec，四段：範圍盤點 / 策略 / checklist / 開放問題。本檔為 nb Round 1 回覆，以「專業者」立場回應 — 預先挑戰假設，主動用 YAGNI 刀砍。

## 1. 搬遷範圍盤點（實測 2026-04-18）

| # | 路徑 | 大小 | 性質 | 遷移判斷 |
|---|------|------|------|---------|
| 1a | `~/projects/nova-brain/CLAUDE.md` §概要段 L1-L120 | 120 行 | repo 描述（目錄/指令/技術棧） | **留** — 本 repo 仍存在（tests/docs/specs），repo README 性質 |
| 1b | `~/projects/nova-brain/CLAUDE.md` §Blueprint L121-L194 | 74 行 | agent identity（yaml agent_id/core_objective/non_negotiables/tools/pipeline） | **搬** — agent self-description，住 ~/.claude/ 後由 nova session 讀 |
| 2 | `~/projects/nova-brain/data/reflections.jsonl` | 188 KB | 反思記錄（188 KB = 約 1100 entries） | **搬**（記憶）— 但屬 append-only log，搬法是改讀路徑非複製 |
| 3 | `~/.claude/projects/-Users-sbu-projects-nova-brain/memory/` 下 7 檔 | ~15 KB | session-local memory（feedback / project / reference） | **自動切換** — session cwd 變 ~/.claude/ 後，memory 目錄自動改用 `-Users-sbu--claude/`（該目錄已存在），**只需手動搬檔案** |
| 4 | `~/projects/nova-brain/.claude/` (agent-memory/ + rules/ + settings.json/local.json + worktrees/) | — | session 本地設定 | **搬評估** — settings 可合併入 ~/.claude/settings.json（但 xd-ah9v 保護檔 drift 先處理）；worktrees/ 留原地；agent-memory/ 搬 |
| 5 | `~/projects/nova-brain/docs/*.md` (17 檔含 adr/ + vision.md + state-of-nova.md + 目標場景.md 等) | — | 設計文件 | **分類搬**：nova-server 相關（api-router / nova-server-split / ralph-loop-optimization）→ ~/projects/nova-server/docs/；nova 全域願景（vision.md / state-of-nova.md / 常駐服務.md / 目標場景.md / 製作規範.md）→ `~/.claude/obsidian/semantic/` 或 `~/.claude/docs/`；nb 本地 adr/ → 併入 `~/.claude/obsidian/semantic/architecture-decisions/` 或留 repo |

**實測關鍵發現**：

- 目標 memory 目錄 `~/.claude/projects/-Users-sbu--claude/` **已存在並有 session 記錄**（230 entries dir 層），cwd 切換即可使用，**不需新建**。
- nb CLAUDE.md L1-L120 §概要段是 repo-level README，不是 agent identity — 不該搬；L121-L194 §Blueprint yaml 才是 identity。
- nb data/reflections.jsonl 受 `~/projects/nova-brain/.gitignore` 管理（pre-existing git tracked），搬路徑要同時改 reflection-persist.js 的 `REFLECTION_PATH` 寫路徑。

## 2. 遷移策略

### 核心問題：身份段 vs ~/.claude/CLAUDE.md 精神衝突

**挑戰使用者初步方案**：Stage 1.0-H 剛把 ~/.claude/CLAUDE.md 從 120 行精簡到 68 行（外移 Blueprint canonical index）。若把 nb 身份段（74 行 yaml）直接加進 ~/.claude/CLAUDE.md 會回彈到 142 行 — **違反 xd-ah9v 剛建立的「CLAUDE.md 不是記錄檔」原則**。

**反提議（專業者觀點）**：身份段不該進 ~/.claude/CLAUDE.md，該**搬到 `~/.claude/obsidian/semantic/agent-identity/nb.md`**（跟 `nova-blueprint.md` 並列），~/.claude/CLAUDE.md 只加**1 行 md-link**在適當處：

```markdown
## Agent Identity
nb identity（L1-L4 canonical owner）見 [obsidian/semantic/agent-identity/nb.md](obsidian/semantic/agent-identity/nb.md)。
```

理由：
- 符合 Stage 1.0-H 精神（CLAUDE.md 只放規則 / pointer）
- `obsidian/semantic/agent-identity/` 是 identity 類 canonical 的合理歸所（跟 ADR / blueprint 同層）
- 未來若有多 agent（nm / 其他 peer session）身份也走同一結構
- ~/.claude/ 的 cwd 下讀 CLAUDE.md 時，透過 md-link 間接讀 identity，只在 identity 相關行為時載入 — context cost 降低

### 記憶搬法

| 資產 | 搬法 |
|------|------|
| reflections.jsonl | **搬檔 + 改路徑**：`cp ~/projects/nova-brain/data/reflections.jsonl ~/.claude/data/reflections.jsonl`，同步改 `hooks/modules/reflection-persist.js` 的 `REFLECTION_PATH` 指新位置。注意 `~/.claude/data/` 在 .gitignore，這是故意 — reflections 是 runtime 狀態不進 git |
| memory (`-Users-sbu-projects-nova-brain/memory/`) | **拷檔**：7 個 `.md` 拷到 `~/.claude/projects/-Users-sbu--claude/memory/`（該目錄已存在，cwd 切後 session 自動用）。原目錄保留但不再寫入 |
| decisions.jsonl (若存在) | 同 reflections.jsonl 策略 |

### repo 留/搬判斷原則

**留**（`~/projects/nova-brain/`）：
- git repo 本體（GitHub: ryu111/nova-brain）
- tests/（nova-brain 是測試容器）
- spec/（規格管理中心）
- scripts/ 若有（nb 專屬 runtime 腳本）
- docs/ 的 nb 專屬部分（若有）

**搬**（到 ~/.claude/ 或 ~/projects/nova-server/）：
- identity yaml
- 反思/記憶記錄
- 全域願景文件（vision.md 等）
- nova-server 相關 docs

## 3. 準備工作 checklist（M1 前）

| # | 準備項 | 負責 | 驗收 |
|---|--------|------|------|
| P1 | 建遷移 ADR (`ADR-007-nb-to-nova-migration.md`) — 記錄為什麼搬 + 怎麼搬 + timing | nb 起草 → peer review | 存在於 `obsidian/semantic/architecture-decisions/`；ADR index hub README 表格補入 |
| P2 | 身份段 diff 預覽：比對 nb CLAUDE.md §Blueprint vs 預計 `obsidian/semantic/agent-identity/nb.md` 結構 | nb | diff 文件貼到本 spec Round 2，使用者 ack |
| P3 | MEMORY.md 升級為 MOC 形式 | nb | 從「條列式索引」升級為 Obsidian MOC（按 feedback/project/reference 分類 + 每檔 1 行說明） |
| P4 | reflection-persist.js 讀/寫路徑參數化 | nb 實作 | `REFLECTION_PATH` 可從 env 或 config 讀取；默認值保留當前以不破壞 |
| P5 | session-start 訊號擴充：cwd=~/.claude/ 時載入 `agent-identity/nb.md` | nb 討論 → 實作 | 新 session 在 ~/.claude/ 下能自動 aware 自己是 nb agent identity |
| P6 | data/reflections.jsonl 遷移測試：驗證新舊路徑 switchover 不掉資料 | nb 實作 | 新 entry 寫新路徑；讀取時合併新舊路徑（或搬完一次性切斷） |
| P7 | 跨 session 廣播：nm 更新自己的 Related Blueprint pointer 指向 nb 新家 | nm | nm CLAUDE.md §Related Blueprint 條目改指 `~/.claude/obsidian/semantic/agent-identity/nb.md` |

## 4. 開放問題（Round 2 收斂）

### Q1：timing — 何時搬？

**候選**：
- A. Stage 1.0-H 完成（已完成於 aa74334）後 **立即** 起 Stage 1.0-I 做遷移
- B. 等 Stage 1.1 / 1.2 某個自然 checkpoint 後做
- C. 等 Phase 2 開始時一起（P2 有新 capability 上線，context reset 自然）

**nb 意見**：**B 或 C**。Stage 1.0-H 剛收，未累積足夠信號判斷「什麼東西該搬、什麼不該」— A 太快會衝動搬錯；C 最安全但可能太晚。B 在下一個 natural checkpoint（例如 vault broken links 收齊 / obs rebuild 完成）搬，風險適中。

### Q2：conflict 解 — 若 ~/.claude/CLAUDE.md 某段與 nb 身份段概念重疊？

已知重疊點：
- §Nova Blueprint（已外移）討論的是 **三支柱 × L 矩陣**（nova 全域架構）
- nb §Blueprint `non_negotiables` 討論的是 **nb 作為 agent** 的底線（~/.claude/ SoT / 測試零容忍 / 治本優先）

**這兩者是不同 concern**：前者是架構 canonical index，後者是 agent behavior contract。分開存檔（`obsidian/semantic/nova-blueprint.md` vs `obsidian/semantic/agent-identity/nb.md`）沒衝突。

**nb 意見**：不存在需要合併的重疊 — 各自歸位即可。

### Q3：「身份段進 CLAUDE.md」vs「身份段外移 + md-link」— 採哪個？

見 §2 反提議 — nb 主張 **外移**，符合 Stage 1.0-H 精神，context cost 低。

**nb 意見**：**強烈主張外移**。Manager 若堅持進 CLAUDE.md 需先回答：「為什麼身份段不算記錄檔？它跟剛外移的 52 行 Blueprint 有什麼本質差異？」

### Q4：`~/projects/nova-brain/` repo 搬完後定位？

**候選**：
- A. 純測試/spec 容器（不變）
- B. 歸檔（archive）— 所有功能搬完後 repo 停擺
- C. 轉為 nova-brain-harness（只放 e2e harness，identity/memory 全出走）

**nb 意見**：**A**。nb repo 作為 test/spec 主機仍有價值（CI 容器 + architecture.test.js 執行地），identity 搬走後 repo 仍 meaningful。

### Q5：memory 合併 vs 獨立命名空間？

目標目錄 `-Users-sbu--claude/` 已有 230+ entry 檔案（~/.claude/ cwd session 既有記憶）。nb 搬檔進去會混入？

**候選**：
- A. 混進去（所有 ~/.claude/ cwd session 共享 memory）
- B. 獨立 subdirectory（`-Users-sbu--claude/memory/nb/`）
- C. 檔名前綴（`nb_MEMORY.md`、`nb_feedback_*.md`）

**nb 意見**：**B（獨立 subdir）**。避免 claude-code 其他 cwd=~/.claude 的 session（例如 manager 直接 review 時）混淆。但需確認 claude-code 本身支援 subdir 讀取。

## Round 2 請求

### 給 nm 的問題（需要 Manager 回覆）

1. Q1 timing — **A / B / C 哪個**？
2. Q3 conflict — 同意「身份段外移 + md-link」路線嗎？若反對，請回答 Q3 挑戰問題。
3. Q5 memory — 確認 claude-code harness 對 subdirectory memory 的支援度（nm 可 dispatch nova-server 或直接測）。

### 給使用者的問題（若 nm 無法決定）

Q1 timing 若 nm 也不確定，升級使用者：「遷移 timing 選 A（立即）/ B（下個 checkpoint）/ C（Phase 2 起）？」

## Referenced

- xd-ah9v Stage 1.0-H CLAUDE.md 瘦身（nova commit aa74334）
- ADR-001 Vault-Layer3 Upgrade（identity 存 `obsidian/semantic/` 的精神基礎）
- Manager memory feedback_nb_naming_upgrade_to_n_nova.md（dispatch prompt 引用，nb 未讀 — 若需要請 nm 在 Round 2 prompt 貼內容）
- rules/協作/討論式派發.md（本檔 Round 1 遵循「專業者挑戰假設」原則）
- ~/.claude/rules/協作/對等討論可見性.md（三方 peer visibility）

## 討論持久化記錄

本檔由 nb 於 2026-04-18T11:25Z 起草，作為 xd-wksw Round 1 回覆。後續 Round 2+ 由 nm 或使用者 Round 2 cross-dispatch 發起（不用 complete summary 承載）。
