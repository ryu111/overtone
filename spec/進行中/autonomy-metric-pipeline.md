---
topic: Autonomy-Metric Pipeline — 客觀自驅把握度量化
status: in-progress
created: 2026-04-20
owner: nova-brain
depth: D2
milestones: [M1, M1.5, M2, M3, M4]
derived_from:
  - spec/討論/autonomy-metric-pipeline-round2-accept.md
  - ../../../../nova-manager/spec/討論/autonomy-metric-pipeline-nm-round1.md
  - ../../../.claude/obsidian/semantic/external-references/non-time-threshold-derivation-2026.md
harness_pillar: Sensor
---

# Autonomy-Metric Pipeline — 客觀自驅把握度量化

## 1. 背景與動機

### 1.1 當前痛點

AI 自驅 session（nova-brain ralph-loop active=true）目前對「自驅把握度」只能 AI 自述「85-90%」，屬 **subjective self-report**。使用者 2026-04-20 糾正兩次：

1. **「自驅把握 85-90% 無證據」**（iter #18-22 連 5 次缺外研反思的根因）— AI 自評無客觀基準 → Pareto 劣化被掩蓋
2. **「不要用天數去判斷，AI 的世界變化太多」**（2026-04-20）— 模型升級 / harness 演化 / pattern 變動快，time-based threshold 會 stale

### 1.2 目標

把 subjective 85-90% → **三維 session-internal metric**（objective、可驗證、event-sourced）+ **四 AND 判準 shadow → active 切換**（sample count / KS stability / iter diversity / depth entropy）。

對齊：
- `rules/核心/自驅反思.md §外部研究硬性條款`（守護自評空洞）
- `rules/品質/基準勝選判準.md`（多維不合成 composite）
- `rules/核心/agent-harness.md`（Sensor 支柱：寫狀態而不干預 Guide 決策）

### 1.3 非目標（Out of Scope）

- ⛔ 不做 composite autonomy score（違 Pareto 判準）
- ⛔ 不自動寫回 `config/component-lifecycle.json` 的 `auto_thresholds`（治理規則屬 non-reversible，需 Manager 審查）
- ⛔ 不用 time-based threshold（N 天窗 / P80 P95 固定值都禁用）
- ⛔ M1-M4 不跨 session 合成（Manager cross-session aggregate 留 M1.5 Phase 2）
- ⛔ 不 block 任何現有 flow（Sensor 支柱：warn-only，active 後也只 emit 不 block）

---

## 2. 架構決策

### 2.1 三層 metric vs composite — 為何不合成

| 維度 | 為何獨立 | 合成的風險 |
|---|---|---|
| `depth_distribution` | 衡量 task-type 多樣性（mental set 防護） | 單值平均會掩蓋 D0 adjacency cascade |
| `low_score_fix_rate` | 衡量反思→修復閉環效率 | 被高量的空 fix 稀釋 |
| `external_research_effectiveness` | 衡量外部 injection 是否帶入新資訊 | 與 depth 合成會被「大量 D2 + 零外研」誤拉高 |

**ADR**：遵循 Pareto 邊界判準，三維各自 shadow/active 切換、各自閾值、各自派生 warn。

### 2.2 KS test vs PSI — 選 KS 的理由

nm Round 1 原建議 PSI，nb Round 2 改 KS test（選項 A）：

| 屬性 | PSI | KS test |
|---|---|---|
| 設計語境 | reference vs production drift | 兩分布 identical 假設檢定 |
| bin 邊界敏感 | 是（需手動調 bin） | 無 |
| 小樣本 (n=50) robustness | 弱 | 強（Kolmogorov-Smirnov 理論對小樣本成熟） |
| 「自 vs 自」穩定性語境 | mismatch | 正好適用 |

**ADR**：M2 用 KS test，p-value > 0.05 連 5 snapshot 視為穩定（M=5 對齊外研 convergence criterion M=3-5 業界建議）。

### 2.3 Time vs Sample/PSI/Entropy — 為何禁 time-based

外研 `non-time-threshold-derivation-2026.md` 的四類非時間派生（sample window / PSI / adaptive threshold / convergence）皆可套用。time-based 三缺陷：

1. 早期 baseline 被晚期資料污染（世代混合）
2. 時間窗內樣本不足 → 統計不顯著
3. 時間窗過長 → baseline stale

**ADR**：全部判準 event-driven（sample count / PSI-stability equivalent / iter count / entropy），無任何 `days_since_*` 欄位。

### 2.4 Strangler Fig — Phase 1 nb scope

理由（nm Round 1 Q3 採納）：
1. nb 是當前唯一啟自驅 session → 放全域等於 private scope
2. 全域元件改動成本（Manager 審查 + arch test + eval gate）對 MVP 迭代期過重
3. 其他 session 日後啟自驅時需求可能 diverge → copy-adapt 勝 shared lib 強綁

Phase 1（M1-M4）：`~/projects/nova-brain/scripts/autonomy-metrics.js` + `~/projects/nova-brain/data/autonomy-metrics.jsonl` 全 self-contained。

---

## 3. M1 — 三維 metric + compute script + append-only jsonl

### 3.1 Input 來源決策（planner 第一步驗證產物）

**驗證結果**（2026-04-20 驗證）：
- `~/.claude/data/reflections.jsonl` 存在（15KB，nb session 寫入全域）
- `~/projects/nova-brain/data/reflections.jsonl` 存在（243KB，nb 自己的完整歷史）

**決策**：M1 script 讀 `~/projects/nova-brain/data/reflections.jsonl`（nb self-contained，對齊 strangler fig）。

**理由**：
- 全 self-contained 符 Phase 1 原則
- 243KB 版本為完整歷史（vs 全域 15KB 只含 recent entries）
- 未來 Phase 2 抽 lib 時再評估 input path 參數化

**Open Q3 決議**：見 §10，spec 明示 reader resilience（skip unparseable lines 容錯跨檔差異）。

### 3.2 三維 metric 精確計算公式

#### 3.2.1 `depth_distribution`

```
scope: 最近 N_DEPTH_WINDOW iter（預設 N_DEPTH_WINDOW = 20）
input: reflections.jsonl entries with field `depth` ∈ {D0, D1, D2, D3, D4}
output: {
  D0_ratio: <0-1 float>,
  D1_ratio: <0-1 float>,
  ...
  streak_D0_consecutive: <int>,  // 最近連續 D0 計數
  sample_size: <int>             // actual entries in window (may < N)
}
```

**計算**：
```
window = last N entries (若不足 N，用 all entries)
for each D_i in {D0..D4}:
  D_i_ratio = count(entry.depth == D_i) / len(window)
streak_D0 = 從 window 最後一筆往前數，連續 depth==D0 的筆數
```

**Edge case**：
- **空 window**（0 entries）→ 所有 ratio = 0, streak_D0 = 0, sample_size = 0（不計入 shadow threshold）
- **缺 depth 欄位** → skip entry + log warning（對齊 reader resilience §3.5）
- **depth 值不在 {D0..D4}** → skip entry + log warning

#### 3.2.2 `low_score_fix_rate`

```
scope: 最近 N_FIX_WINDOW iter（預設 N_FIX_WINDOW = 20）
input: reflections.jsonl entries with field `結論[]` and `行動[]`
output: {
  identified_low_score_count: <int>,  // 本 window 內反思提到 score<80 元件的總次數
  fixed_count: <int>,                  // 對應有 commit/修改行動的次數
  rate: <0-1 float>,                  // fixed_count / identified
  sample_size: <int>                  // identified_low_score_count
}
```

**識別邏輯**（每條 reflection entry）：
```
identified_low_score = entry.結論[] 或 entry.行動[] 中 match pattern:
  /score\s*[<≤]\s*8[0-9]/i  # "score < 80", "score≤85" 等
  OR /低分元件/
  OR /低分.*修/

fixed = entry.行動[] 中該元件有以下任一：
  - 含 commit hash pattern /[a-f0-9]{7,40}/
  - 含 file path /rules\/|skills\/|hooks\/modules\//
  - 含 verb /修正|重寫|刪除|替換/
```

**Edge case**：
- **identified = 0**（分母 0）→ `rate = null`（JSON null，非 NaN），`sample_size = 0` 明示不計入 shadow
- **identified > 0 但 fixed = 0** → rate = 0（真實低效，不豁免）
- **identified = fixed 且都 = 0** → 同 identified = 0 處理

#### 3.2.3 `external_research_effectiveness`

```
scope: 最近 N_ER_WINDOW iter（預設 N_ER_WINDOW = 20）
input: reflections.jsonl entries + filesystem `~/.claude/obsidian/semantic/external-references/*.md` mtime
output: {
  claimed_research_count: <int>,  // 反思聲稱做外研的次數
  actual_new_entries: <int>,      // 當 iter 對應時間段實際新建/meaningful update 的 ER 檔數
  effectiveness: <0-1 float>,     // actual / claimed
  sample_size: <int>              // claimed_research_count
}
```

**識別邏輯**：
```
claimed = entry.外部研究[] 非空 OR entry.結論/行動[] match /WebSearch|WebFetch|external-references/

actual:
  對每個 entry.ts：
    scan external-references/*.md 的 git log 或 mtime 位於 [entry.ts - 2min, entry.ts + 2min] 的檔數
    配合 diff check：≥ 50 字新增或 Sources 段有新增（meaningful update）
```

**實作簡化**（M1）：
```
對每個 claim=true 的 entry：
  expected_path = entry.外部研究[].external_ref_path
  if exists(expected_path) && git log 或 mtime window 匹配：actual_count++
```

**Edge case**:
- **claimed = 0** → `effectiveness = null`, `sample_size = 0`
- **claimed > 0 且 actual = 0** → effectiveness = 0（空洞反思，rule 定義的無效反思）
- **actual > claimed**（該 iter 外研超預期）→ cap 在 1.0（effectiveness ≤ 1.0）

### 3.3 `scripts/autonomy-metrics.js compute` CLI 介面

```bash
# 基本計算（讀 nb reflections.jsonl，輸出到 stdout JSON）
bun ~/projects/nova-brain/scripts/autonomy-metrics.js compute

# 指定 window
bun ~/projects/nova-brain/scripts/autonomy-metrics.js compute --window=30

# 寫入 jsonl（append 一筆 snapshot）
bun ~/projects/nova-brain/scripts/autonomy-metrics.js compute --append

# 指定 input path（測試用）
bun ~/projects/nova-brain/scripts/autonomy-metrics.js compute --input=/tmp/test-reflections.jsonl

# 顯示當前 shadow/active state
bun ~/projects/nova-brain/scripts/autonomy-metrics.js state

# 列 shadow 判準進度
bun ~/projects/nova-brain/scripts/autonomy-metrics.js progress
```

Exit code：
- 0 = success
- 1 = input file missing / unreadable
- 2 = parse error > 50% entries
- 3 = argv invalid

### 3.4 `data/autonomy-metrics.jsonl` Schema

每行一個 JSON snapshot（append-only，POSIX 原子 append 保證）：

```json
{
  "ts": "2026-04-20T04:30:00Z",
  "iter_id": "<sha256 first 8 chars of ts+session>",
  "session": "nova-brain",
  "schema_version": 1,
  "trigger": "reflection-persist|manual|scheduled",

  "depth_distribution": {
    "D0_ratio": 0.25,
    "D1_ratio": 0.40,
    "D2_ratio": 0.25,
    "D3_ratio": 0.10,
    "D4_ratio": 0.00,
    "streak_D0_consecutive": 2,
    "shannon_entropy": 1.38,
    "sample_size": 20
  },

  "low_score_fix_rate": {
    "identified_low_score_count": 5,
    "fixed_count": 3,
    "rate": 0.6,
    "sample_size": 5
  },

  "external_research_effectiveness": {
    "claimed_research_count": 4,
    "actual_new_entries": 3,
    "effectiveness": 0.75,
    "sample_size": 4
  },

  "meta": {
    "window_size": 20,
    "reflections_read": 20,
    "reflections_skipped": 0,
    "compute_duration_ms": 45
  }
}
```

**必填欄位**：`ts`, `iter_id`, `session`, `schema_version`, `trigger`, 三維 metric 各自 object（即使 sample_size=0 也要有 object）

**Optional**：`meta`（診斷用）

**寫入保證**：
- `fs.appendFileSync(path, json + '\n', 'utf-8')` 單次 syscall POSIX 原子
- 寫入前 `JSON.stringify` 驗 valid
- crash-safe：crash 只會漏寫本筆，不會腐蝕其他筆

### 3.5 Reflection-persist Hook 整合點

**Canonical location**（2026-04-20 驗證）：`~/.claude/hooks/modules/reflection-persist.js`

**Integration trigger**：Stop hook 抓 Insight 寫 reflections.jsonl **完成後**（hook 模組已寫入 reflection entry），autonomy-metrics compute append 一筆 snapshot。

**實作模式**（Phase 1 避免改 hook）：
- M1 scope：不動 reflection-persist.js
- 由 autonomy-metrics.js 提供 `compute --append` 作為 standalone CLI
- 由 Stop hook 或 wrapup.js 額外觸發 `bun autonomy-metrics.js compute --append`（run_in_background=true）

**Phase 2 考慮**：若證實 M1 穩定，可把 autonomy-metrics compute 整合進 reflection-persist.js 的 `on` handler（新增 emit 一個 metric snapshot 事件）。**本 spec 不做**。

**輸入輸出**：
- **輸入**：reflection-persist.js 剛 append 的 entry（或 autonomy-metrics 自己 re-read jsonl 最新 N 筆）
- **輸出**：`data/autonomy-metrics.jsonl` append 一行 snapshot
- **失敗處理**：compute script 失敗 → log to stderr + hookError emit，**不 block** reflection-persist 流程（Sensor 支柱紀律）

### 3.6 M1 驗收判準

- [ ] `scripts/autonomy-metrics.js` 實作三維 compute + CLI 四命令
- [ ] `data/autonomy-metrics.jsonl` append-only 機制 + schema 驗證
- [ ] Unit test：三維計算 happy path + 4 個 edge case（空 window / 缺欄位 / 分母 0 / claim > actual cap）
- [ ] Integration test：讀 real `~/projects/nova-brain/data/reflections.jsonl` 跑一次 compute 無 error
- [ ] 手動跑 5 次 compute --append，檢查 jsonl 格式一致、ts 單調遞增
- [ ] `bun spec-tasks.js complete m1-autonomy-metric-core` 歸檔

---

## 4. M1.5 — Manager cross-session aggregate（Phase 2 entry gate）

### 4.1 觸發條件（non-同 sprint）

M1.5 只有以下 AND 成立才啟動：

1. M1 在 nb 穩定運轉 ≥ 100 snapshot（非時間，是 sample count）
2. Manager 透過 cross-dispatch 明示啟動 M1.5 pipeline
3. 至少有 2 個 session 可提供 cross-session 驗證資料（reviewer findings / dispatch history / decisions）

### 4.2 Ownership

- **nb 側**：提供 session-internal metric 作 leading indicator（無變動）
- **nm 側**：新增 cross-session aggregate pipeline（Manager scope）
  - 路徑：`~/projects/nova-manager/scripts/cross-session-autonomy-aggregate.js`
  - 輸入：reviewer-findings.jsonl + dispatch history + decisions.jsonl + git log
  - 輸出：`~/projects/nova-manager/data/cross-session-autonomy-aggregate.jsonl`
  - 維度：
    - `dispatch_verdict_distribution`（pass/iterate/fail 比率）
    - `reviewer_iteration_count`（peer 驗收 round 數）
    - `post_acceptance_rework_rate`（pass 後 7d 內同檔再改比率 = false close indicator）

### 4.3 互驗機制（leading vs lagging）

**合成反模式（禁用）**：
```
autonomy_score = 0.5 × session_internal + 0.5 × cross_session  # ⛔ 禁
```

**互驗模式（採納）**：
```
if session_internal.shadow_state == "active" AND cross_session.rework_rate > 0.3:
  emit WARN "self-eval echo chamber detected"
```

**session-internal 自評高但 cross-session 顯示 rework 高** = 正是本 spec 要解決的「85-90% 無證據」根因偵測。

### 4.4 M1.5 Scope Out

本 spec（planner 產出）只定義 M1.5 entry gate 和 ownership。實際 implementation spec 由 Manager 另起。

---

## 5. M2 — Shadow/Active 四 AND 判準實作

### 5.1 四 AND 判準（Round 2 確定版）

所有以下為 true → shadow → active：

```
1. snapshot.sample_count >= 50             # 每維度 metric 各自的 sample_size
2. ks_test_pvalue > 0.05 連 5 snapshot      # 分布穩定性
3. iter_count >= 20                          # 跨多場景覆蓋
4. shannon_entropy(depth_distribution) >= log(2) ≈ 0.693  # depth 多樣性
```

### 5.2 KS test 實作選擇

**選擇**：**批次計算**（非 Welford's online）

**理由**：
- KS test 需要兩組完整樣本（reference 前 50 筆 vs current 後 50 筆），不是 moment-based
- Welford 適用 mean/variance 類 moment statistic，KS 需 empirical CDF 比對
- n=50 批次 KS 計算成本 ~O(n log n)，每次 compute 一次，成本可忽略

**實作**：
```js
// scripts/lib/ks-test.js
function ksTest(sample1, sample2) {
  // sorted ECDF comparison
  // returns { statistic, pvalue }
}

// 使用：
const snapshots = readLastN(jsonl, 100);
const reference = snapshots.slice(0, 50).map(s => s.depth_distribution.D0_ratio);
const current   = snapshots.slice(50, 100).map(s => s.depth_distribution.D0_ratio);
const { pvalue } = ksTest(reference, current);
// pvalue > 0.05 → 分布穩定
```

**小樣本校正**：
- n < 35 時 KS test 的 p-value 用 Stephens (1970) correction
- n ≥ 50 用 asymptotic formula
- M1/M2 只在 n ≥ 50 後計算 KS，不處理小樣本期

**連 5 snapshot 追蹤**：
- 每次 compute 後把 KS p-value 寫入 jsonl 的 `ks_test` 欄位
- `state` 命令讀最後 5 筆 ks_test，全 > 0.05 即判斷穩定

### 5.3 Shannon entropy 計算

```js
// scripts/lib/shannon.js
function shannonEntropy(ratios) {
  // ratios: [D0_ratio, D1_ratio, ..., D4_ratio]
  return -ratios
    .filter(p => p > 0)  // 排除 0（log(0) undefined）
    .reduce((sum, p) => sum + p * Math.log(p), 0);
}
```

**Edge case**：
- 全部 D0（ratio = [1,0,0,0,0]）→ H = 0（最低 entropy，mental set 症狀）
- 完全均勻（ratio = [0.2,0.2,0.2,0.2,0.2]）→ H = log(5) ≈ 1.609（最高）
- **gate 判準 log(2) ≈ 0.693** = 至少兩類深度各 ≥ 某比例（保底非單一深度）

**必要但非充分**：這個 gate 只確保「至少兩類 depth 有非零佔比」，無法完全阻擋 D0+D1 adjacency（19 D0 + 1 D1 的 H = 0.286 低於 threshold 會擋；10 D0 + 10 D1 的 H = log(2) 剛好 pass）。**spec 明示這是必要非充分**，外加 streak_D0_consecutive <= 5 輔助（M3 hook 守護）。

### 5.4 Shadow → Active 切換原子性保證

**State 檔**：`~/projects/nova-brain/data/autonomy-metrics-state.json`

```json
{
  "state": "shadow" | "active",
  "since_snapshot_id": "<iter_id>",
  "transition_history": [
    {"from": "shadow", "to": "active", "ts": "2026-04-25T10:00:00Z", "trigger": "four-and-met"},
    {"from": "active", "to": "shadow", "ts": "2026-04-27T08:00:00Z", "trigger": "ks-failure-streak-3"}
  ],
  "schema_version": 1
}
```

**寫入原子性**：
- **atomic write**：write tmp + `fs.renameSync`（POSIX rename 原子）
- **不用** `fs.writeFileSync` 直接覆寫（FSEvents 不可靠，對齊 `rules/環境/自壓縮.md` flag 寫入教訓）
- helper：`atomicWrite(path, content)` 獨立 utility

**切換條件**（M2 code）：
```
shadow → active: 四 AND 全部 pass (per-dimension check, 三維 metric 各自判斷)
active → shadow: KS test pvalue <= 0.05 連 3 snapshot (re-baseline trigger)
```

### 5.5 Re-baseline 機制

**觸發**：active 狀態下 KS test 連 3 次 failure

**動作**：
1. state.json 寫入 `{ state: "shadow", transition_history 加 entry }`
2. 當期 auto-warnings 失效（M3 hook 讀 state 若 = shadow 即不 emit）
3. statusline 加 flag `↻ baseline rebuild`（M4）
4. **不刪除歷史 jsonl**（保留，作後續分析用）
5. emit timeline event `autonomy.rebaseline.triggered`

### 5.6 M2 驗收判準

- [ ] `scripts/lib/ks-test.js` + unit test（已知分布 ground truth：uniform vs uniform p>0.05、uniform vs skewed p<0.05）
- [ ] `scripts/lib/shannon.js` + unit test（edge case: 全 0、完全均勻、單一非零）
- [ ] Shadow → active 切換 integration test（構造 50+ 筆 mock snapshot 驗四 AND）
- [ ] Active → shadow rollback test（構造 KS failure streak）
- [ ] state.json atomic write test（race condition mock）
- [ ] `bun spec-tasks.js complete m2-autonomy-shadow-active` 歸檔

---

## 6. M3 — Hook 守護 + arch test

### 6.1 `hooks/modules/autonomy-metric-guard.js`

**歸屬**：Sensor 支柱（寫狀態而不干預 Guide）

**Event**：**Stop**（session 收尾，讀完整 metric 做最終 emit）

**不選 PreToolUse/PostToolUse 的理由**：
- PreToolUse 會 fire 過於頻繁（每個 tool call），read jsonl + compute 成本太高
- PostToolUse 只對特定 tool 有意義（reflect 時），Stop 更 coarse-grained 符合「snapshot on segment end」語意

**Implementation**：
```js
// hooks/modules/autonomy-metric-guard.js
import { readLastN, computeDerivedThresholds } from '../../../projects/nova-brain/scripts/autonomy-metrics.js';

export const on = {
  Stop: async (payload) => {
    const state = readStateFile();
    if (state.state === 'shadow') {
      // Shadow mode: 只 emit progress，不 warn
      return { systemMessage: `Shadow progress: sample=${state.sample_count}/50` };
    }
    // Active mode: 派生閾值警告
    const snapshots = readLastN(JSONL_PATH, 20);
    const thresholds = computeDerivedThresholds(snapshots);  // mean ± 2 × std_dev

    const warnings = [];
    for (const dim of ['depth_distribution', 'low_score_fix_rate', 'external_research_effectiveness']) {
      const latest = snapshots[snapshots.length - 1][dim];
      if (isOutlier(latest, thresholds[dim])) {
        warnings.push(`${dim} outlier: ${JSON.stringify(latest)} (threshold: ${JSON.stringify(thresholds[dim])})`);
      }
    }

    if (warnings.length > 0) {
      return {
        systemMessage: `autonomy-metric warn:\n${warnings.join('\n')}`,
        // ⚠️ warn-only, not block (Sensor 紀律)
      };
    }
  }
};
```

### 6.2 閾值派生：`mean ± k × std_dev`（k=2）多維各自

對齊外研 §3「Adaptive threshold from reference variability」：

```
scope: 最近 N_THRESHOLD_WINDOW = 20 snapshot（不含本筆）
for each metric_dimension:
  values = snapshots[-20:].map(s => s[dim].rate_or_ratio)
  mean = arithmetic mean
  std = sample std dev (n-1 denominator)
  lower = mean - 2 * std
  upper = mean + 2 * std
  outlier if current_value < lower OR current_value > upper
```

**多維各自派生**（對齊 Pareto，**不**跨 domain 平均）：
- `depth_distribution` → 看 `D0_ratio` 和 `streak_D0_consecutive` 各自派生
- `low_score_fix_rate.rate` 獨立派生
- `external_research_effectiveness.effectiveness` 獨立派生

**k=2 選擇**：業界常用 1.5-3（外研 §3），k=2 對應 ~95% confidence interval（若正態），保守起步。

### 6.3 hook wire

**更新 `hooks/hook-client.js` `LOCAL_MODULES`**：
```js
const LOCAL_MODULES = [
  // ... existing
  'autonomy-metric-guard.js',
];
```

⛔ NEVER 漏加 — 對齊 `rules/元件/模組架構.md` hook 接線完整性守護。

### 6.4 Arch test 守護項

在 `~/projects/nova-brain/tests/unit/architecture.test.js` 新增：

```js
describe('autonomy-metric pipeline', () => {
  test('jsonl schema 必填欄位', () => {
    // jsonl 每行必含 ts, iter_id, session, schema_version, trigger, 三維 object
  });

  test('state.json schema', () => {
    // state ∈ {shadow, active}, transition_history 為 array
  });

  test('autonomy-metric-guard.js wired in LOCAL_MODULES', () => {
    const clientCode = readFileSync('hooks/hook-client.js', 'utf-8');
    expect(clientCode).toMatch(/autonomy-metric-guard\.js/);
  });

  test('禁止直接寫 config/component-lifecycle.json 的 auto_thresholds', () => {
    const script = readFileSync('scripts/autonomy-metrics.js', 'utf-8');
    expect(script).not.toMatch(/component-lifecycle\.json.*auto_thresholds/);
    // also check no writeFileSync 對應路徑
  });

  test('spec 存在且 frontmatter 正確', () => {
    // existence test: spec/進行中/autonomy-metric-pipeline.md
  });
});
```

### 6.5 M3 驗收判準

- [ ] `hooks/modules/autonomy-metric-guard.js` 實作 Stop handler
- [ ] `hooks/hook-client.js` LOCAL_MODULES 加入
- [ ] Unit test: threshold derivation (mean ± 2σ) happy path + edge (n<20 disable)
- [ ] Integration test: Stop hook 實機觸發，shadow 只 emit progress，active emit warn
- [ ] `tests/unit/architecture.test.js` 5 項新增全綠
- [ ] warn-only 驗證：確認不 block 任何 tool call
- [ ] `bun spec-tasks.js complete m3-autonomy-guard-hook` 歸檔

---

## 7. M4 — Statusline + daily-report trend

### 7.1 Statusline Component 介面

**位置**：`~/.claude/statusline.sh` 或對應 statusline component（視 nb statusline 架構決定）

**Shadow 期**：
```
⚡️ Nova  Shadow (sample=37/50)  ...
```

**Active 期（四 AND 滿足後）**：
```
⚡️ Nova  🟢 Autonomy  ...       # 三維全在 mean±2σ 內
⚡️ Nova  🟡 Autonomy↓depth     # depth_distribution 漂移
⚡️ Nova  🔴 Autonomy×ER        # external_research_effectiveness 異常
```

**Re-baseline 期**：
```
⚡️ Nova  ↻ baseline rebuild    # active → shadow rollback 中
```

**資料來源**：
```bash
bun ~/projects/nova-brain/scripts/autonomy-metrics.js state
# 輸出 JSON，statusline shell script parse
```

### 7.2 為何不暴露 raw 數字（採納 E1）

**Metric theater 反模式**：
- `fix_rate=0.6` 沒 baseline 無法判斷好壞
- 使用者看到數字會誤以為客觀但實則無 context

**採納**：Shadow 期顯示進度（sample=X/50），Active 期顯示 traffic light（🟢/🟡/🔴），完整 trend 留 daily-report。

### 7.3 Daily-report Section

**位置**：`~/projects/nova-brain/scripts/daily-report.js`（若存在）或新增 section

**格式**：
```markdown
## Autonomy Metrics（7 日 window）

| 維度 | 本日 | 7日 mean | 7日 std | ±2σ range | 狀態 |
|---|---|---|---|---|---|
| depth.D0_ratio | 0.25 | 0.20 | 0.08 | [0.04, 0.36] | 🟢 |
| low_score_fix_rate | 0.60 | 0.55 | 0.15 | [0.25, 0.85] | 🟢 |
| external_research_effectiveness | 0.30 | 0.65 | 0.20 | [0.25, 1.0] | 🔴 |

**Trend insight**: external-research 顯著低於 baseline，可能 iter 被 D0 adjacency 佔據。
```

### 7.4 M4 驗收判準

- [ ] Statusline component 讀 state.json + jsonl tail 生成三狀態輸出
- [ ] Daily-report 新增 autonomy-metrics section
- [ ] E2E 測試：手動 mock 構造 shadow → active → rebaseline 三狀態 statusline 正確
- [ ] 驗證 raw 數字**不**暴露在 statusline（只 traffic light / progress）
- [ ] `bun spec-tasks.js complete m4-autonomy-statusline-dailyreport` 歸檔

---

## 8. 測試策略

### 8.1 Unit 測試（Testing Trophy 底層）

| 測試對象 | 檔案 | 邊界案例 |
|---|---|---|
| 三維 metric compute | `tests/unit/autonomy-metrics.test.js` | 空 window / 缺欄位 / 分母 0 / claim > actual cap |
| KS test | `tests/unit/ks-test.test.js` | uniform vs uniform (p>0.05) / skewed (p<0.05) / n<10 error |
| Shannon entropy | `tests/unit/shannon.test.js` | 全 0 depth / 單一非零 / 完全均勻 |
| Threshold derivation | `tests/unit/threshold-derivation.test.js` | n<20 disable / n=20 mean±2σ / outlier detection |
| State transition | `tests/unit/autonomy-state.test.js` | shadow→active, active→shadow atomic |

### 8.2 Integration 測試（Trophy 主體）

| 測試對象 | 範圍 |
|---|---|
| `scripts/autonomy-metrics.js compute` | 讀 real reflections.jsonl subset → write jsonl → 無 error |
| `compute --append` 併發安全 | 多次並行呼叫 verify no interleaved line |
| Hook integration | mock Stop hook payload → guard.js emit warn 驗證 |
| Shadow → active pipeline | 構造 50+ mock snapshot → 驗四 AND → verify state transition |

### 8.3 Arch test（存在性 + SoT wire）

見 §6.4，5 項全部必 pass。

### 8.4 Red-team / 偏離偵測

- **Mock self-eval echo chamber**：構造 session internal 高但 cross-session（待 M1.5）rework 高的 fixture → 驗 M1.5 互驗機制能偵測
- **Mock D0 adjacency cascade**：構造 19 D0 + 1 D1 entries → 驗 shannon_entropy gate block shadow→active

### 8.5 測試紀律對齊

- 📋 MUST `rules/品質/測試規範.md`：測行為不測實作
- 📋 MUST `skills/nova-test/SKILL.md` Testing Trophy
- ⛔ NEVER `test.skip()` 繞過失敗測試
- 每個 milestone 驗收前跑 `bun test` 全綠

---

## 9. Rollout 計劃

### 9.1 實作順序

```
M1（~3 iter）: 三維 compute + jsonl + CLI → unit test 全綠
  ↓
M2（~2 iter）: KS test + shannon + state transition → integration test 全綠
  ↓
M3（~2 iter）: guard hook + LOCAL_MODULES wire + arch test
  ↓
M4（~1 iter）: statusline + daily-report
  ↓
進 Phase 2 entry gate 監控期（M1 積累 ≥ 100 snapshot）
  ↓
M1.5（Manager 另起 spec）: cross-session aggregate
```

**累計預估**：8 iter（D1 小任務），若遇阻塞升 D2。

### 9.2 各 milestone 驗收判準（summary）

| Milestone | 執行者 | 驗收者 | 驗收點 |
|---|---|---|---|
| M1 | executor | reviewer | unit + integration test 全綠 + jsonl 5 筆手驗 |
| M2 | executor | reviewer | KS/entropy ground truth + shadow→active e2e test |
| M3 | hook-executor | reviewer | arch test 5 項 + Stop hook 實機觸發 |
| M4 | executor | Main | statusline 三狀態視覺驗證 |
| M1.5 entry | Main | Manager cross-dispatch | 累計 ≥ 100 snapshot 驗證後 cross-dispatch |

### 9.3 不可逆風險評估

| 風險 | 可逆性 | 緩解 |
|---|---|---|
| autonomy-metrics.jsonl schema 錯誤 | 部分可逆（`schema_version` 欄位） | M1 凍結 schema_version=1，未來升版走 ADR |
| state.json 檔損壞 | 可逆（reset to shadow） | atomic write + `schema_version` + rebuild from jsonl |
| 自動寫回 auto_thresholds 禁令如何實施 | **結構性禁令** | arch test §6.4 第 4 項 grep ban + 無任何 writeFileSync 對應 path |
| KS test 連 3 失敗造成頻繁 rebaseline | 可逆（人工暫停 active mode） | Phase 2 觀察後調 streak 閾值 |
| Shadow 期過長不進 active | 不影響（shadow 模式不干預） | 四 AND 判準自然 gate，不強推 |

**結構性禁令實施**：
```js
// tests/unit/architecture.test.js
test('autonomy pipeline 禁寫回 component-lifecycle auto_thresholds', () => {
  const files = glob.sync('scripts/autonomy-*.js');
  for (const f of files) {
    const code = readFileSync(f, 'utf-8');
    expect(code).not.toMatch(/component-lifecycle\.json/);  // 連讀都不讀 (M1 scope)
  }
  // 未來 M1.5 可能要讀 allowlist_notes（Event Sourcing read-only），屆時放寬但明示 read-only
});
```

---

## 10. Open Questions

### Open Q1：`depth_distribution` window N 大小

**問題**：最近 N iter 的 N 預設 20，但與 shadow 判準的 `iter_count >= 20` 是否耦合？

**暫定**：M1 預設 `N_DEPTH_WINDOW = 20`（與 iter_count threshold 對齊避免 inconsistency）。**Open**：M2 執行後觀察是否需解耦（例如：metric window = 20 但 shadow stability window = 50）。

**決定者**：executor 實作 M1 時按預設，M2 若發現 tension 則 cross-dispatch Manager 升 D2 討論。

### Open Q2：`low_score_fix_rate` 分母定義

**問題**：`identified_low_score` 計數是「每條反思 entry 是否提到」還是「元件級別去重」？

**例**：同一元件在 iter 1/2/3 三次被識別為 low_score，但只在 iter 5 被修 → identified = 3 fixed = 1 rate = 0.33？還是 identified = 1 fixed = 1 rate = 1.0？

**建議方案**：**元件級別去重**（identified = 1, fixed = 1），理由：
- 避免重複識別同一元件拖低 rate
- 「修了沒修」是元件級狀態非 entry 級
- 對齊 rule 語意「低分元件 <80 → 修」

**Open**：spec 暫定**元件級**但需 executor 在 M1 實作時決定 identification key（element path? element name?）。

**決定者**：executor 實作時 cross-dispatch Main 快速確認（< 5 min decision，不值得另起 D2）。

### Open Q3：`external_research_effectiveness` 時間窗精度

**問題**：「entry.ts 前後 2min 視為同 iter」的 2 分鐘窗夠嗎？

**場景**：反思四步可能跨 5 min（研究 → 寫 ER 檔 → 回來 persist reflection），2 min 可能漏抓。

**暫定**：M1 用 `ts_window_ms = 300000`（5 分鐘，涵蓋典型反思時長）。

**Open**：M2 觀察實際 ts 分布後調整（可能需要「entry.外部研究[].external_ref_path 的檔案存在即 match」而非時間窗）。

**決定者**：M1 executor 用 5 min 起步，M2 調整。

### Open Q4：M1.5 Manager cross-dispatch 觸發時機

**問題**：「M1 穩定運轉 ≥ 100 snapshot」的判準由誰檢查？

**候選**：
- (a) nb 自己累計到 100 後 cross-dispatch Manager 提議 M1.5
- (b) Manager 定期 poll nb state 判斷

**暫定**：**(a)** — nb 在 autonomy-metrics.jsonl 累計到 100 筆時由 Stop hook emit 一個 `autonomy.milestone-100-reached` 事件 + Manager 監聽

**Open**：Manager 是否願意處理此 event？需 nb → nm cross-dispatch 確認 Manager scope 接納。

**決定者**：Manager（M1 完成後 cross-dispatch nm 詢問）。

---

## 11. 自評（完成前自評，對齊 planner rules）

### 11.1 這個設計最大的風險是什麼？如何緩解？

**最大風險**：**KS test 在 rate metric 聚集場景（n=50 但大量 tied values）產生假穩定**。例如 `low_score_fix_rate` 若長期徘徊在 0, 0.5, 1 三值附近（rate-based 小分母本質），KS 的 empirical CDF 會出現 step 使 p-value 對 ties 敏感。

**緩解**：
1. spec §5.2 明示小樣本校正（Stephens 1970）
2. M2 integration test 專門構造 tied-value fixture 驗 KS 表現
3. Shannon entropy gate 是保底（即使 KS 假穩定，depth entropy 不 pass 也不升 active）
4. 四 AND 是 AND 非 OR，任一維失守 shadow 保留

### 11.2 有沒有更簡單的替代方案？為什麼選了這個？

**更簡單方案**：單一 composite autonomy score（如 `0.4 × depth_diversity + 0.3 × fix_rate + 0.3 × er_effectiveness`），單閾值判 shadow → active。

**為什麼不選**：違 `rules/品質/基準勝選判準.md` Pareto 邊界 — 合成會掩蓋劣化（e.g. 某維歸零但其他維高仍 pass）。nb Round 2 明確拒絕 composite。

**本 spec 的選擇**：三維各自 + AND gate，複雜度換取 Pareto 完整性。這個複雜度對 nb self-assessment 基建值得。

### 11.3 哪些假設如果錯了，設計會崩壞？

| 假設 | 若錯的影響 | 後備方案 |
|---|---|---|
| reflections.jsonl schema 穩定 | compute 讀不到欄位大量 skip | §3.5 reader resilience + log warning |
| Stop hook 每 segment 都 fire | snapshot 稀疏 → sample_count 慢 | M3 可加 manual compute trigger (CLI) |
| n=50 足夠 KS 小樣本 robust | 偽穩定 / 偽波動 | §5.2 Stephens correction + fixture test |
| 使用者能讀懂 traffic light 語意 | metric theater | §7.2 避免 raw 數字 + daily-report 補充 context |
| Shannon entropy log(2) gate 擋得住 adjacency | 10 D0 + 10 D1 恰好 pass | §5.3 明示必要非充分 + streak_D0_consecutive 輔助 |

---

## 12. 附錄 — 元件閉環 checklist（對齊 closed-loop skill）

M1-M4 完成後走 4 層閉環：

### Layer 1：元件依賴
- [ ] `scripts/autonomy-metrics.js` 消費者：hook + statusline + daily-report
- [ ] `hooks/modules/autonomy-metric-guard.js` 引用：LOCAL_MODULES wire
- [ ] `tests/unit/architecture.test.js` arch test 5 項

### Layer 2：資訊流
- [ ] reflection-persist → autonomy-metrics.js compute → jsonl append → guard read → statusline display
- [ ] 錯誤有追蹤：compute 失敗 emit hookError + console.error

### Layer 3：Spec 同步
- [ ] 本 spec 歸檔 spec/完成/autonomy-metric-pipeline.md（M4 全綠後）
- [ ] `spec/index.md` 新增 autonomy-metric section
- [ ] `rules/品質/回饋與進化.md` 引用 autonomy metric 作「反思四步持久化」補充
- [ ] `rules/核心/agent-harness.md` Sensor 支柱元件清單更新

### Layer 4：審查引用
- [ ] 反思四步 §外部研究硬性條款引用本 pipeline 作客觀化範例
- [ ] 外研 `non-time-threshold-derivation-2026.md` See also 引用本 spec

---

## See also

- [討論 Round 1](../../../../nova-manager/spec/討論/autonomy-metric-pipeline-nm-round1.md) — nm peer 4Q + 2E
- [討論 Round 2](../../討論/autonomy-metric-pipeline-round2-accept.md) — nb accept 全部
- [外研](../../../../.claude/obsidian/semantic/external-references/non-time-threshold-derivation-2026.md) — 非時間派生四類
- [Strangler Fig](../../../../.claude/obsidian/semantic/external-references/gradual-migration-strangler-fig-2026.md) — 漸進遷移
- [Mental Set](../../../../.claude/obsidian/semantic/external-references/ai-reflection-patterns-2026.md) — adjacency 症狀
- [Pareto 判準](../../../../.claude/rules/品質/基準勝選判準.md) — 多維不合成
- [元件孵化](../../../../.claude/rules/品質/元件孵化.md) — Manager config ownership
- [Agent Harness](../../../../.claude/rules/核心/agent-harness.md) — Sensor 支柱

## Backlinks

- Round 2 accept § Next Action §3「Dispatch planner agent 產 spec」→ 本檔
