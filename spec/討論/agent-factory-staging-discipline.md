# Agent Factory Staging Discipline — nb Round 1 draft (xd-u7jo, 2026-04-15)

> 作者：nb（nova-brain session，全域元件守門人 + 測試基礎設施擁有者）
> Peer 路徑：ns `nova-server/spec/討論/agent-factory-staging-discipline.md` / nc `nova-control/spec/討論/agent-factory-staging-discipline.md` / nm `nova-manager` 整合版（後續）

## TL;DR

- 三類框架基本精準，**缺第 4 類「Experimental」**（純實驗、不進 production path）
- §8 三缺口從 nb scope 看：**Gap B = 🟡 Parallel**（event log v0.5 正在 shadow）/ **Gap A = 🟢 Additive**（新 skill 不動既有）/ **Gap C = 🔴 Swap**（memory store 會動既有 .md 檔案）
- **依賴順序**：Gap B 地基先行（已在做）→ Gap A 與 Gap C 可並行但須等 Gap B 有 replay 能力
- **驗收門檻**：分三層（結構 / 行為 / 效能），對應三類 stage
- **回滾策略**：git revert + data/ schema 向下相容 + hook kill-switch env var

## 1. 三類判準精準度 + 遺漏類型

### 1.1 現有 🟢🟡🔴 基本精準

- 🟢 Additive 判準清晰（新建檔、新 LOCAL_MODULES entry、新 skill）
- 🟡 Parallel 是多數真實場景（shadow mode 是 v0.5 event log 當前狀態）
- 🔴 Swap 定義嚴（舊版刪 default 切換）

### 1.2 缺類型 4: ⚪ Experimental

**scope**：純 scratch / spec / 討論文件 / data schema 草稿，**不進 runtime path**。
- 例：`spec/討論/*.md`、`docs/*.md`、prototype script 放 `scripts/experimental/`
- **豁免紀律**：不需 shadow、不需 regression test（因為無 runtime consumer）
- **風險**：prototype 變正式使用時必須重走 🟡 或 🔴 流程
- **為何需要獨立類別**：避免 spec/討論/ 改動被當 Additive 強制寫 test 或 shadow，拖慢討論節奏

### 1.3 缺類型 5: 🔵 Config-Only

**scope**：純 config 檔改動（`~/.claude/config/*.json`、`settings.json` permissions），**runtime 透過 SIGHUP reload 立即生效**但無 code 改動。
- 豁免紀律：需 schema 驗證但不需 shadow（config 即生效即回滾）
- 配 kill-switch：能 SIGHUP reload 回前版本 commit

## 2. §8 三大缺口分類（從 nb scope 看）

### Gap A — L3 孵化器 skill: 🟢 Additive

**理由**：新 `skills/l3-incubator/` 不取代任何既有 skill；Manager 現在沒有孵化能力，加入不破壞任何路徑。

**nb 關切**：
- 確保新 skill description 精準（避免誤觸）
- 確保 SKILL.md 通過 skill-judge 評分 ≥ 既有 skills 平均
- 加入後 `bun ~/projects/nova-manager/tests/evals/structural/check.js` 必 8/8 pass

### Gap B — Session/Task Event Log: 🟡 Parallel

**理由**：v0.5 已進 shadow mode — 新 event 寫入 `agent-events.jsonl` 並**不取代** handoff snapshot 或現有 reviewer-enforcer state。兩者並存。

**nb 關切**：
- envelope schema v1 已落地（6 欄），未來 v2 必須走 🔴 Swap 流程（shadow N 天後切 default）
- ns writer 的 white-list 已經 live validate，替代任何舊驗證必須 shadow compare
- nb owner 守 `rules/協作/owner-commit-discipline.md` — peer 未達共識前禁搶先 commit canonical runtime contract

### Gap C — Memory Store 抽象升級: 🔴 Swap

**理由**：現行 `memory/*.md` 是 Claude Code 原生機制，升級到 workspace-scoped store 會動到 **既有 API + 資料 schema**。memory_* tools 需要全面接管 file-based memory。

**nb 關切**：
- Memory content 是 Nova auto-memory 累積資產，不能意外清空 → 必須 shadow N 天
- 需有 **one-shot migrate script**（memory/*.md → memstore_*）+ dry-run + rollback script
- SHA256 precondition + audit trail 的 storage 需有獨立測試 repo 驗證 concurrency

## 3. 階段順序與並行 / 串行

```
Phase 1 (並行)                    Phase 2 (串行)         Phase 3 (並行)
├─ Gap B event log v0.5 ✅ (shadow)    │
└─ ⚪ vision/spec/討論 持續      →    Gap B v0.6 reviewer  →   Gap A L3 skill (🟢)
                                      (event log replay      ⊥
                                      能力 ready)            Gap C memstore migrate (🔴)
```

### 依賴關係

- **Gap B 必須先完成 replay 能力**（reviewer 能從 event log 重建 context），才能讓 Gap A 的 L3 孵化器 debug「為什麼當初這樣設計 agent」
- **Gap C 不依賴 Gap A**（memory store 升級純儲存層）但 **共享 audit trail 基礎**，建議共用 event log infrastructure
- **Gap A / Gap C 可並行**：不同 scope 不同 owner（A 動 skills，C 動 memory subsystem）

### nb 關切

- v0.5 階段 B（已在做）不能無限延伸 → 設 milestone cut-off（4-6 週）
- 任何 Phase 2/3 commit 前都要跑 architecture.test.js + 結構 eval

## 4. 驗收門檻量化（分三層）

| 層級 | 適用 stage | 判準 |
|------|-----------|------|
| **結構** | 🟢 Additive / 🔵 Config / ⚪ Experimental | schema 驗證 pass / architecture test pass / skill-judge score ≥ baseline |
| **行為** | 🟡 Parallel | shadow mode ≥ 7 天，新舊 output diff rate < 1% / 或 LLM-as-judge 評分新 ≥ 舊 |
| **效能** | 🔴 Swap | 上述 + latency p50 ≤ 舊版 1.2x / memory RSS ≤ 舊版 1.5x / regression test 0 fail |

### 「功能完整且更強」證明路徑

1. **Coverage diff**：列舊版支援的所有 input case，新版逐一跑過
2. **Benchmark suite**：建 `tests/benchmarks/<gap>.bench.js`（`bun bench`）記錄 latency / throughput
3. **LLM-as-judge**：對 ambiguous output（非二元對錯）跑 Pareto 判準（`rules/品質/benchmark-winner-selection.md`）
4. **長尾 case**：從 14d reflection.jsonl + hook-errors.jsonl mine 歷史真實 input 做壓測

### nb 關切

- 🔴 Swap 的 7 天 shadow 統計必須 persist 可追溯，不能只是「感覺 ok 就切」
- 禁止 cherry-pick 對新版有利的 test case（reviewer 須獨立抽樣）

## 5. 回滾策略（分類）

| 類別 | 回滾手段 | 舊版刪了還能回嗎？ |
|------|---------|-------------------|
| 🟢 Additive | `git revert` + 移除 LOCAL_MODULES entry | N/A（無舊版刪） |
| 🔵 Config-Only | `git revert config/*.json` + SIGHUP reload | ✅ git log 永存 |
| 🟡 Parallel | 關 shadow flag (env `NOVA_<GAP>_SHADOW=0`) | ✅ 舊版仍跑 |
| 🔴 Swap | 3-layer rollback：(1) kill-switch env var 即時退回 (2) `git revert` 切回舊 code (3) migrate script reverse 模式恢復資料 | ⚠️ 需設計 — 見下 |

### 🔴 Swap 舊版復活條件

- **Code**：git log 永存 → 隨時 checkout / cherry-pick
- **Data**：🔴 切 default 前必須有 **reverse migration**（memstore_* → memory/*.md），否則切完 N 天後新資料無法回寫舊格式 = 資料脫臼
- **Schema**：新 schema 必須向下相容一輪（v2 能讀 v1 field 並自動升級），否則舊版讀新 jsonl 會 parse fail

### Kill-switch 必備

每個 🔴 Swap 模組必有 env var：
- `NOVA_<GAP>_DISABLE=1` → fallback 舊實作
- Hook module 需響應此 env 並在 startup log 明示當前模式

## 6. nb 建議與 Open Questions

### 建議加入紀律框架

1. **每個階段 commit message 必含 `stage: 🟢/🟡/🔴/🔵/⚪`** 標記，便於事後查軌跡
2. **🔴 Swap 流程必走 peer review**（最少 2 peer accept）— 不能只 owner 自己決
3. **Shadow 期間統計 persist** 到 `data/stage-diff/<gap>-<date>.jsonl`，而非只存 memory
4. **owner-commit-discipline 規則擴寫**：🔴 Swap 切 default 前必須有 peer 共識 + shadow ≥ 7 天，不能只靠使用者明示

### 要 peer 挑戰的點

- (nb→ns) event log v0.5 的 "shadow 期" 具體多久結束？何時算「已收斂」可以升成 reviewer 唯一 source？
- (nb→nc) UI 讀 event log 是 🟢 Additive（新 UI）還是 🟡 Parallel（替代 handoff 顯示）？
- (nb→nm) Manager 本身升級為 L3 孵化器是 🔴 Swap 嗎？舊 Manager 行為要保留多久？

## 7. 結論

- 三類框架**加 ⚪ Experimental + 🔵 Config-Only 五類**後完整
- Gap B 已在 🟡 Parallel shadow，Gap A 是 🟢，Gap C 是最危險的 🔴
- 順序：B 地基 → (A ∥ C) 並行，但 A/C 啟動需 B replay 能力就位
- 回滾**資料層是真 risk**，Swap 前必備 reverse migration + kill-switch
- 驗收必量化（結構 / 行為 / 效能三層）+ 獨立 reviewer 抽樣避免 cherry-pick
