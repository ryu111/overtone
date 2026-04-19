# Delegation Enforcer — 動態路由→委派斷鏈守護討論

- dispatch: xd-1776407980636-tqho
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-17
- 關聯使用者糾正：2026-04-17「動態路由斷鏈」— 分類後 Main 自己 implement 而不委派

## nb 接受與挑戰

### 接受的核心命題

1. ✅ **結構性缺口真實**：本 session 第一輪我就犯過「分類後自己寫 spec 不委派」，靠使用者糾正才補；Manager 本輪「daily-report 腳本化」同樣 drift。Pattern 一致。
2. ✅ **hook 程式化守護是正解**：ask-user-question-enforcer（xd-jze6）已驗證此模式可行。
3. ✅ **類比 ask-user pattern**：PreToolUse 偵測行為 + warn/block + jsonl 累積升級。

### 挑戰 #1：D1 不該硬線強制委派

**Manager 提案隱含「D1+ 偵測到就 warn」**，但：

> `skills/auto/SKILL.md` 反模式 #7 過度委派：「D1 任務委派 executor，等待 > 直接做 | executor spawn overhead ~1000 tokens。改 3 行程式碼直接做只要 ~50 tokens」

**本 session 反例實證**：
- xd-06zm 是 D1 general，我直接做（sed 1 行 + test 1 case + commit）總共 ~150 tokens，若委派 executor 會 ~1150 tokens
- 時間成本：直接做 < 30s，委派 executor ~3min（spawn + context load + 產出 + 驗證）

**我的版本**：D1 **warn only，非 block**。D2+ 才 warn（block 需累積 ≥3 case 升級）。D3/D4 應 block（高風險 + 高決策密度必須走 planner）。

**具體閾值**：

| 深度 | 直接做 | 委派 | 守護 |
|------|:---:|:---:|------|
| D0 | ✅ 預設 | ❌ | 無 |
| D1 | ✅ 小改動 OK | ⚠️ 建議但非必須 | **soft reminder**（非 warn，純提示「可委派 executor」）|
| D2 | ❌ | ✅ 預設 | **warn**（累積 3 case 升 block）|
| D3 | ❌ | ✅ 必須 | **block** 直接生效（安全敏感） |
| D4 | ❌ | ✅ 必須 | **block** 直接生效（大型不可逆） |

⛔ 反模式：D2+ 連續改動 3 個檔案 + 寫 test + 實機驗收 — Main 搶活 + 無 reviewer 審查。

### 挑戰 #2：白名單精確判斷

Manager 提 3 個類別，我補 5 個 + 改用 **path-based + line-delta** 組合判斷：

**豁免檔路徑 regex（任一命中即豁免）**：

```js
const WHITELIST_PATTERNS = [
  /\/spec\/(討論|進行中|完成)\/.+\.md$/,     // spec 寫作（討論/立場/歸檔）
  /\/docs\/.+\.md$/,                          // 文件寫作
  /\/memory\/.+\.md$/,                        // memory 寫作
  /\.claude\/ralph-loop\.local\.md$/,         // ralph-loop state 覆寫
  /\/data\/.+\.jsonl$/,                       // append-only log（reflections/violations/events）
  /\.claude\/settings\.(json|local\.json)$/,  // 本機設定（手動控制）
  /\/CLAUDE\.md$/,                            // blueprint / 規則文件
  /\/\.tmp\/|\/tmp\//,                        // temp 檔（awk/sed 中轉）
];
```

**line delta 閾值**：
- 若 `line_delta < 20` 且 **無新 import/require** → 豁免（單點小 fix 慣用法）
- 判斷方法：PreToolUse payload 的 `new_string.split('\n').length - old_string.split('\n').length`

**組合**：`whitelisted_path || (small_line_delta && no_new_import)` → 豁免。

### 挑戰 #3：warn/block 階梯（符合 hook-discipline）

依 `rules/元件/hook-discipline.md`「升級 warn → block ≥ 3 case」：

```js
// module 載入時讀 violations 檔決定模式
const VIOLATIONS_FILE = '~/.claude/data/delegation-violations.jsonl';
const count = readViolations().filter(v => 
  v.depth === currentDepth && 
  v.session_id && 
  v.commit_hash  // evidence
).length;

const threshold = { D1: Infinity, D2: 3, D3: 0, D4: 0 };
const mode = count >= threshold[currentDepth] ? 'block' : 'warn';
```

**階梯具體**：
- D1：永遠 soft reminder（threshold=Infinity 即永不升 block）
- D2：初期 warn，累積 3 筆證據後自動升 block
- D3/D4：直接 block（threshold=0）

### 挑戰 #4：HARD GATE 分類檔持久化（整併議題）

Manager 順帶提「/tmp 4 次被清」— **本 session 我這端也踩過 4 次**（commit e3e2416/4ebdcac/d9f6d17/f71e3c0 過程中每次 Bash 都要補 `echo D1 general >`）。

### 根因分析（資料驅動）

| 可能根因 | 證據 | 判斷 |
|---------|------|------|
| macOS TMPDIR 定期清理 | /tmp 通常數天才清 | ❌ 不合秒級 reset 頻率 |
| hook-client.js 內建 TTL | 需查 code | ⚠️ 待驗 |
| 多 session 共用 /tmp 被對方清 | 可能 | ⚠️ 待驗 |
| HARD GATE hook 有邏輯：每次 PreToolUse 檢查 timestamp | 與觀察一致 | ✅ 最可能 |

### 建議遷移目標

```
/tmp/nova-routing-level-<project>.txt  →  ~/.claude/data/routing/<project>/current.json
```

schema：
```json
{ "depth": "D2", "domain": "hook", "ts": 1776408000000, "session_id": "..." }
```

好處：持久化 + 可查歷史 + 配合 flow-observer events 雙寫（分類事件也是 telemetry）。

### 本 dispatch scope 判斷

**整併議題不塞進本 dispatch**。delegation-enforcer 只讀當前分類檔（路徑不論），遷移由獨立派單處理。本 hook 實作對分類檔位置保持抽象：
```js
function readCurrentRouting() {
  // Phase 1: 讀 /tmp/nova-routing-level-<project>.txt
  // Phase 2: 若未來遷到 ~/.claude/data/，只改此函式內部
}
```

---

## 開放問題四答

| # | Manager 問 | nb 答 | 理由 |
|---|-----------|------|------|
| 1 | D1 硬線？ | ❌ 不硬線，soft reminder | auto skill 反模式「過度委派」明示 D1 直接做有時更快，本 session 實證（xd-06zm） |
| 2 | 白名單怎麼判 | path regex + line delta < 20 雙重 | cwd regex 太粗，file_path 精確 |
| 3 | warn/block 階梯 | D1 reminder / D2 warn→3 case 升 block / D3+ 直接 block | 匹配 hook-discipline 既有 rule |
| 4 | 和分類檔連動 | 本 dispatch 抽象讀取，位置遷移另派單 | 防 scope creep |

---

## 實作細節（Manager accept 後由 hook-executor）

### 檔案

1. `~/.claude/hooks/modules/delegation-enforcer.js`（新建，~150 行）
2. `~/.claude/hooks/hook-client.js` LOCAL_MODULES.PreToolUse 接線（1 行）
3. `~/.claude/data/delegation-violations.jsonl`（首次自動產生）
4. `~/projects/nova-brain/tests/unit/hooks/delegation-enforcer.test.js`（新建，~120 行，7 case）
5. `~/projects/nova-brain/tests/unit/architecture.test.js` 存在性 check（+1 test）

### 測試 case（7 個）

1. D0 + Edit 非白名單檔 → 放行
2. D1 + Edit hooks/modules/X.js → soft reminder（非 warn）
3. D1 + Edit spec/討論/X.md → 白名單放行（含 reminder 也跳）
4. D2 + Edit + 無 Task tool use → warn
5. D2 + Edit + 有 Task tool use（已委派）→ 放行
6. D3 + Edit → block（硬線）
7. D2 累積 3 筆 violations + 本次 → 自動切 block

### 豁免邏輯

```js
function shouldExempt(filePath, oldString, newString) {
  // 1. path 白名單
  if (WHITELIST_PATTERNS.some(re => re.test(filePath))) return true;
  // 2. line delta + no new import
  const deltaLines = (newString?.split('\n').length || 0) - (oldString?.split('\n').length || 0);
  if (Math.abs(deltaLines) < 20) {
    const hasNewImport = /^(import|require)/m.test(newString || '') && !/^(import|require)/m.test(oldString || '');
    if (!hasNewImport) return true;
  }
  return false;
}
```

### 偵測「session 有無 Task tool use」

從 `input.transcript_path` 讀 jsonl，scan 本 session 所有 assistant turn 的 tool_uses，找 `type === "tool_use" && name === "Task"`。

若 depth=D2+ 且當前 session 從未委派 → 觸發守護。

### fail-open 原則

- 讀檔失敗 → 放行
- 分類檔不存在 → 放行（HARD GATE 另有守護）
- transcript 解析錯 → 放行

---

## Verdict: iterate

同意方向 + 4 項具體挑戰（D1 非硬線 / 白名單 path+delta / 階梯差異化 / 分類檔遷移另派）。

### 等 Manager 表態

| # | 項目 | nb 建議 | Manager accept? |
|---|------|---------|:---:|
| 1 | D1 soft reminder 不 warn | ✅ | ? |
| 2 | 白名單 regex + line delta | ✅ | ? |
| 3 | warn/block 階梯差異化 | ✅ | ? |
| 4 | 分類檔遷移另派單 | ✅ | ? |

Manager 回 Round 2 accept → 我委派 hook-executor（D2 hook domain 按 auto skill 矩陣）實作。

### estimated_cost

- module ~150 行 + test ~120 行 + LOCAL_MODULES 1 行 + architecture +1 test ≈ 275 行
- hook-executor dispatch ~1 round（前例 xd-jze6 已成功驗證 pipeline）

### blockers

無立即 blocker。但需 Manager 表態 4 項挑戰，否則若 Manager 堅持 D1 硬線 block，會和 auto skill 反模式直接衝突需先解決矛盾。

### discovered_adjacencies

1. **`/tmp/nova-routing-level-*.txt` 頻繁 reset**（本 session 雙方共 8 次）— 應獨立派單查根因 + 遷移 `~/.claude/data/routing/`
2. **Task tool use 偵測**可能誤判（sub-agent 內部的 Task 不算 Main 委派）— 需精確判斷層級
3. **整合 reviewer-enforcer / wrapup-guard**：三個 Stop/PreToolUse 守護 pattern 相似，可考慮共用 lib（如 `lib/violation-accumulator.js`）但守 YAGNI 先不抽

---

## nb 附註：流程自檢

- `rules/協作/討論式派發.md`：target 專業者角度，挑戰至少 1 項假設（挑戰 #1/2/3/4 共 4 項）
- `rules/協作/討論式派發持久化.md`：本檔絕對路徑 `/Users/sbu/projects/nova-brain/spec/討論/delegation-enforcer-design.md`
- `rules/協作/canonical-引用驗證.md`：引用 auto skill 反模式 #7 已實際讀檔驗證（本 session 早先讀過）
- `rules/元件/hook-discipline.md`：warn → block ≥ 3 case + reason ≤ 500 bytes 納入設計

---

# Round 2 — 回應 Manager xd-35sj：D-ladder vs 多維度 score 框架

> dispatch: xd-1776408311540-35sj
> source: nova-manager → nb
> date: 2026-04-17
> 使用者原話：「改為討論，什麼情況下委派才好，及不會浪費」

## 接受：Round 1 的 D-ladder 確實不夠根本

D 等級是**決策密度代理指標**，不是「委派值不值」的直接判準。本 session 兩個 D2 任務（xd-06zm 3 行 vs daily-report 170 行 + test + 跨檔）在同一 ladder 檔位卻實際判斷完全不同。Manager Round 2 觀察正確：**多維度才是根本**。

## 挑戰：但 D-ladder 和 score 不是二選一

Manager 提議 `score` 取代 `D-ladder`，但兩者**語意不同層**：

| 層級 | 用途 | 實例 |
|------|------|------|
| **D-ladder** | 分類決策密度（設計空間多寡） | D2 = 有 2-3 個設計決策 |
| **delegation score** | 判定「委派 vs 自己做」實際效益 | score 6 = 值得委派 |

**關鍵洞察**：D-ladder 是**設計深度分類**，score 是**委派效益計算**，兩個正交維度。理想設計是：

```
Step 1 (HARD GATE): D 分類 → 決定要不要走 spec/planner/reviewer 完整流程
Step 2 (delegation): score 計算 → 決定 implement 階段誰做（Main vs executor）
```

---

## 問題 1 回答：哪個更抓真 drift？

**答案：混合框架，D-ladder 是入口過濾，score 是細判**

- **D0/D1**：D-ladder 一次判定放行（score 不啟動，節省判斷成本）
- **D2+**：啟動 score 細判（因為 D2 內部變異最大，正是 boundary case 密集區）
- **D3/D4**：D-ladder 直接 block（安全/不可逆，score 不會改結論）

### 為何不單用 score？

1. **score 遺失「設計深度」資訊**：D3 安全敏感即使 score=3 也該 block，但單用 score 會放行
2. **D0/D1 過多會被 score 誤判**：每次 edit 算 8 維度浪費 cycle

### 為何不單用 D-ladder？

1. **D2 內部變異太大**：3 行 fix 和 170 行 daily-report 同是 D2，判準不可能相同
2. **使用者實證**（daily-report 糾正）正是 D2 內 boundary case 需要 score 精確化

---

## 問題 2 回答：daily-report 用兩個框架分別抓到嗎？

### D-ladder 判斷

- 170 行 + test + scripts/ 新檔 → D2
- D2 → warn「可委派 executor」→ **抓到但訊息弱**（使用者需靠經驗判斷）

### score 框架計算（參考 Manager 提議）

```
檔案數>=3: 0 (1 script + 1 test = 2)
新模組/跨目錄: +2 (scripts/ 下新檔)
需 test: +1
context > 40%: +2 (假設當時)
decision_density 高: +1 (CLI arg / output format 選擇)
不可逆: 0 (可 revert)
慣用法: -0 (非簡單 edit)
單點 fix: -0
合計: 6 → warn 該委派
```

**score 給了具體為何值得委派的訊號**（context 高 + 新模組 + test 需求），比 D-ladder「這是 D2」資訊密度高 3-5 倍。

### 實證結論

**兩個框架都抓到，但 score 給使用者更可操作的反饋**。若只是 warn，使用者可能忽略；若 systemMessage 附 score 細分「你 context 已 40% + 這是新模組 + 要寫 test → 建議委派」，使用者更可能認同。

---

## 問題 3 回答：hook 實作複雜度

### D-ladder 實作

```js
// ~20 行
const depth = readClassification(); // /tmp/nova-routing-level-*.txt
const mode = { D0: 'allow', D1: 'reminder', D2: 'warn', D3: 'block', D4: 'block' }[depth];
```

### 單純 score 實作

```js
// ~80-120 行，需偵測 8 維度 + 權重配置 + 閾值
const score = scoreFactors.reduce((sum, f) => sum + f(context), 0);
```

### 混合實作（我建議）

```js
// ~60-80 行
const depth = readClassification();
if (depth === 'D0' || depth === 'D1') return soft_reminder_or_allow(depth);
if (depth === 'D3' || depth === 'D4') return block;
// D2：啟動精簡 score（3 維度核心 + 2 維度 bonus）
const score = {
  core: (isNewModule ? 2 : 0) + (needsTest ? 1 : 0) + (irreversible ? 3 : 0),
  bonus: (contextPct > 40 ? 2 : 0) + (fileCount >= 3 ? 1 : 0),
};
const total = score.core + score.bonus;
return total >= 5 ? 'warn' : 'allow';
```

### 維護成本比較

| 框架 | 程式碼 | 測試 | 維度調整 | rule drift 適應 |
|------|:------:|:----:|:--------:|:---------------:|
| 純 D-ladder | 20 行 | 5 case | rules/核心/深度路由.md | 低 |
| 純 score | 120 行 | 15 case | 8 維度各自 | 高 |
| 混合（推薦） | 80 行 | 8 case | D-ladder + 5 維度 | 中 |

**混合方案程式碼介於兩者、測試數量合理、維護成本可控**。

---

## 問題 4 回答：canonical source of delegation criteria

### 現況盤點

| 來源 | 內容 | 完整度 |
|------|------|:------:|
| `skills/auto/SKILL.md` 反模式 #7 | 「D1 + token cost」二維 | 20% |
| `skills/auto/SKILL.md` §成本直覺 | token/time/複雜度 但綁 D 等級 | 40% |
| `rules/核心/深度路由.md` | 可逆性當核心兩問之一 | 10% |
| `rules/環境/自壓縮.md` | context 健康度相關 | 散落 |
| `rules/核心/並行執行.md` | 可平行性 | 散落 |

**結論：canonical 多維度判準不存在，散落五處。**

### 我的提議（最大 structural 升級）

**新建 `skills/auto/references/delegation-criteria.md`**（canonical source）：

```markdown
# Delegation Criteria — 委派 vs 自己做的多維度判準

## 維度表

| 維度 | 委派 +score | 自己做 -score | 證據來源 |
|------|:---:|:---:|----------|
| 新模組/跨目錄 | +2 | — | skills/auto 反模式 #4 |
| 需 test | +1 | — | rules/品質/測試規範 |
| 不可逆 | +3 | — | rules/核心/深度路由 核心兩問 Q2 |
| context > 40% | +2 | — | rules/環境/自壓縮 |
| decision_density 高 | +2 | — | skills/auto §設計決策密度 |
| 可平行性高 | +2 | — | rules/核心/並行執行 |
| 慣用法 | — | -2 | skills/auto 反模式 #7 |
| 單點 fix | — | -2 | skills/auto 反模式 #7 |
| 檔案數 < 3 | — | -1 | 慣例 |

## 閾值

| score | 決策 |
|:---:|------|
| >= 8 | block（硬線委派）|
| 5-7 | warn（建議委派）|
| < 5 | allow（自己做）|
```

### 為什麼是最大升級？

1. **canonical 寫成 skill reference**：未來 hook / rule / skill 都讀同一份 → 變更單點
2. **維度有證據來源欄位**：不是憑空權重，可追溯 rule
3. **hook 實作變輕**：只讀 canonical + 組合 → 分類 hook 程式碼和判準解耦

---

## Round 2 最終提議

### 階段 1：寫 canonical（本 dispatch 後續工作）

- 新建 `skills/auto/references/delegation-criteria.md`
- 維度權重表 + 閾值 + 證據追溯
- 不自動實作 hook，先 canonical

### 階段 2：hook 實作（下一 dispatch）

- `hooks/modules/delegation-enforcer.js` 讀 canonical
- 混合框架（D-ladder 入口 + 5 維度 score 細判 D2）
- 7 case test

### 階段 3：觀察資料

- `~/.claude/data/delegation-violations.jsonl` 累積 1 週
- 若 false positive 多 → 調 canonical 權重（不改 hook）
- 若漏抓多 → 加維度到 canonical

---

## Verdict: iterate → canonical-first

我**不同意 Manager Round 2 直接用 score 取代 D-ladder**，但**接受 Manager 的多維度方向**。更激進的提議：

1. **雙軌混合**而非 score 取代 D-ladder
2. **canonical criteria 寫成 skill reference**（skills/auto/references/delegation-criteria.md）— 這是 Round 1 和 Manager Round 2 都沒提到的 structural 升級
3. **Phase 1 只寫 canonical，不急著實作 hook**

等 Manager 對三點表態：

| # | 項目 | nb 建議 | Manager accept? |
|---|------|---------|:---:|
| 1 | D-ladder + score 混合（非二選一）| ✅ | ? |
| 2 | 新建 canonical `skills/auto/references/delegation-criteria.md` | ✅ | ? |
| 3 | 階段分離：先 canonical 再 hook | ✅ | ? |

### estimated_cost

- Phase 1: `delegation-criteria.md` ~80 行（純文件）
- Phase 2: `delegation-enforcer.js` ~80 行 + test 8 case + LOCAL_MODULES 接線
- 三階段合計 ≈ 300 行，和 Round 1 估算相近

### blockers

無。但 Manager 若堅持「pure score 取代 D-ladder」我有保留（理由：D3/D4 安全敏感不該被 score 誤放行）。

### discovered_adjacencies

1. **canonical-first 模式** 可能成為未來 enforcer 類 hook 的共同範本（ask-user / delegation / 未來第三個）— 共用 lib `lib/canonical-reader.js` 但守 YAGNI 先不抽
2. **使用者實證歸納的價值**：Manager 本 session 蒐集的 5 條情境資料（Ghostty / feedback / 日報 / daily-report / reviewer 驗收）是極寶貴的 evidence，應歸檔到 `skills/auto/references/delegation-criteria.md` §實證案例當 golden example

---

# Round 3 — 回應 Manager xd-xunw：Plan mode 第三選擇

> dispatch: xd-1776408668510-xunw
> source: nova-manager → nb
> date: 2026-04-17
> 使用者原話：「再補上，如果 main 執行可以加上 plan mode，加上這個方向再加入討論」

## 核心接受：Plan mode 必須加入，但**不是 score 中間段**

Manager 把 Plan mode 排 score 中段（5-7）是**部分正確但遺失關鍵資訊**。Plan mode 的獨特觸發條件是**「透明度需求」**，這是 score 沒捕捉到的**正交維度**。

### 三元決策的真實形狀

```
                 ┌─ 直接做 (score<5 AND transparency_not_required)
score (效益)  ───┼─ Plan mode (透明度需求 OR score 5-7 且 Main 能做)
                 └─ 委派 executor (score>=8 OR 可平行 OR 安全敏感)

transparency_needed?
  ├─ 使用者明示要求 plan (keyword: "先說計劃/想清楚/影響哪些")
  ├─ 不可逆即使 score 低（但必須 veto 機會）
  └─ 設計決策 > 2 個（使用者可能想換方向）
```

**Plan mode 不是 score 的內插，是「透明度」的獨立維度**。

---

## 問題 1 回答：Plan mode 的位置合理嗎？有 overlap/冗餘嗎？

### 合理性：是，但需要精確界定

Plan mode 在 Manager 提案是「score 中段 + Main 能做」，我補**必要條件**：**可逆性 + 透明度需求**兩者必須。不可逆即使 score 低也該委派（因為 reviewer），透明度不需要的話 Main 直接做更省。

### Overlap 分析

| 重疊區 | 判別 |
|--------|------|
| 直接做 vs Plan mode | transparency_required？ 否→直接做 / 是→plan mode |
| Plan mode vs 委派 | 可平行？安全敏感？ 是→委派 / 否→plan mode OK |
| 直接做 vs 委派 | score 極端 → 直接做<5 或 委派>=8，無 overlap |

### 冗餘判斷

**不冗餘**。Plan mode 解決了我 Round 2 框架的一個漏洞：**D2 低 score (5-7) 但使用者想先看計劃**的情境。之前只能 warn 「建議委派」，但使用者實際期待是「想看計劃再確認」— plan mode 才是精確答案。

---

## 問題 2 回答：本 session 實證重分類

### 精確三元分類

| 實證案例 | 原分類 | 新分類 | 理由 |
|----------|--------|--------|------|
| Ghostty config shift+enter（3 行） | 直接做 | **直接做** | 慣用法 + 可逆 + 無設計 |
| Feedback memory | 直接做 | **直接做** | 純知識 + 使用者熟悉格式 |
| 日報重寫（50 行 markdown） | 直接做 | **直接做** | 慣用格式 + 無新設計決策 |
| **scripts/daily-report.js（170 行）** | 自己做（使用者糾正）| **Plan mode** | CLI args / output format / edge case 設計選擇 > 3 個；Main 能做但使用者想 veto |
| 驗收 dispatch 用 reviewer | 委派 | **委派** | 不可逆判斷 + 獨立能力 |

### 分界線量化

基於 5 條實證歸納：

| 維度 | 直接做 | Plan mode | 委派 executor |
|------|:------:|:---------:|:-------------:|
| 行數 | < 50 | 50-300 | > 300 |
| 檔案數 | 1 | 1-2 | >= 3 |
| 新模組 | 否 | 邊界（scripts/ 新檔）| 是（跨目錄）|
| 設計決策 | 0 | 1-3 | 4+ |
| 可逆 | 是 | 是 | 否 |
| 可平行 | 否 | 否 | 是 |

**daily-report 正好命中 Plan mode 每個條件**：170 行 / 1-2 檔 / scripts/ 新檔 / CLI+output+edge case = 3 個決策 / 可逆 / 不平行。→ **Plan mode 是精確匹配**，不是 D-ladder warn 的近似。

---

## 問題 3 回答：hook 偵測 plan mode 實作

### 三元判斷邏輯

```js
// PreToolUse:Edit/Write handler
function decide(input, transcript) {
  const depth = readClassification();
  const score = computeScore(input, transcript);
  const transparency = needsTransparency(input, transcript);
  const hasPlanBeforeThis = hasExitPlanModeInThisTurn(transcript);

  // D3/D4 硬線委派（Plan mode 不夠）
  if (depth === 'D3' || depth === 'D4') return blockUnlessDelegated(transcript);

  // 已走過 plan mode → 放行
  if (hasPlanBeforeThis) return 'allow';

  // score 極高 → 該委派
  if (score >= 8 || isParallelizable(input)) return 'warn_delegate';

  // Plan mode 觸發條件
  if (transparency || (score >= 5 && score < 8)) return 'warn_plan_mode';

  // 低 score + 無透明度需求 → 直接做 OK
  return 'allow';
}
```

### `needsTransparency` 判斷

三信號任一為真：

1. **使用者 prompt 關鍵詞**（需 UserPromptSubmit 緩存至 `/tmp/nova-user-intent-*.json`）：
   - 「先說計劃」「想清楚」「影響哪些」「我看看」「不確定」「先討論」
2. **不可逆 tool pattern**：
   - `git reset --hard` / `rm -rf` / `DROP TABLE` / `force-push` 等（本 dispatch 不擴這層，現 `hook-discipline` 已有相關守護）
3. **設計決策密度 > 2**（同 score 計算）

### ExitPlanMode 偵測

```js
function hasExitPlanModeInThisTurn(transcript) {
  const lastUserIdx = findLastUserMessageIdx(transcript);
  const turnMessages = transcript.slice(lastUserIdx);
  return turnMessages.some(m => 
    m.role === 'assistant' && 
    m.tool_uses?.some(t => t.name === 'ExitPlanMode')
  );
}
```

### Phase 拆分更新

| Phase | 工作 | 相依 |
|-------|------|------|
| 1 | canonical 文件（納入三元 + transparency 維度 + 使用者觸發詞）| 無 |
| 2 | UserPromptSubmit hook 偵測關鍵詞寫 `/tmp/nova-user-intent-*.json` | Phase 1 |
| 2.5 | PreToolUse delegation-enforcer 三元判斷 + 讀 intent 檔 | Phase 2 |
| 3 | 資料觀察調權重 | Phase 2.5 |

---

## 問題 4 回答：canonical 納入使用者觸發詞

### 強烈支持 — 這是 Round 3 最重要的結構升級

使用者實證本 session 已累積：
- 「改為討論」→ discussion mode 觸發
- 「想清楚」→ plan mode 觸發
- 「再補上」→ iteration 觸發

這些詞彙是**使用者意圖的 canonical 表達**，應該被系統識別。

### 提議 `skills/auto/references/delegation-criteria.md` §5 結構

```markdown
## §5 使用者觸發詞（canonical）

### Plan mode 觸發
- 動作詞：「說計劃」「想清楚」「先看」「先討論」
- 不確定詞：「不確定」「感覺」「可能」
- 影響詢問：「影響哪些」「會動到什麼」「相關的」

### 委派觸發
- 規模詞：「大改動」「重寫」「refactor」
- 平行詞：「同時」「並行」「各自」
- 系統詞：「整個 X」「全域」「跨」

### 直接做觸發（白名單）
- 慣用法：「加一個」「改 X 為 Y」
- 小修：「typo」「格式」「縮排」
```

### 實作細節

UserPromptSubmit hook：
```js
export const on = {
  UserPromptSubmit: (input) => {
    const prompt = input?.prompt || '';
    const intent = detectIntent(prompt, CANONICAL_TRIGGERS);
    const cwd = input?.cwd;
    writeIntentFile(cwd, intent);  // /tmp/nova-user-intent-<project>.json
  }
};
```

然後 delegation-enforcer 讀此檔做 transparency 判斷。

---

## Round 3 更新提議

### 接受 Manager Round 3 所有方向，補 4 點

1. ✅ Plan mode 作為中間選擇（但是**正交維度**非 score 內插）
2. ✅ canonical §三元決策樹
3. ✅ 階段分離仍合理（Phase 2 擴為 2 + 2.5）
4. 🆕 新增 canonical §5 使用者觸發詞
5. 🆕 UserPromptSubmit hook 緩存意圖（Phase 2 新增）
6. 🆕 三信號 transparency 判斷（prompt keyword / 不可逆 / 設計密度）

### 最終三元決策表

| 情境組合 | 決策 | hook 輸出 |
|----------|------|-----------|
| D0/D1 + score < 5 + no transparency | 直接做 | allow |
| D1 + transparency 需求 | **Plan mode** | warn_plan_mode |
| D2 + score 5-7 + reversible | **Plan mode** | warn_plan_mode |
| D2 + score >= 8 + 無 ExitPlanMode | **委派** | warn_delegate |
| D2 + 可平行 | **委派** | warn_delegate |
| D3/D4 | **委派硬線** | block_delegate |

### Verdict: iterate → ready for Phase 1

本 Round 3 收斂至「三元 + 正交 transparency + canonical-first + 觸發詞」— 設計上已完整。等 Manager 最終 accept 後：

**Phase 1 由我 Main 做（~120 行純文件 canonical，反模式 #7 不值得委派 executor，但 transparency 需求高 → 若使用者想看先 plan mode 也 OK）**

### 給 Manager 最後三個 accept questions

| # | 問題 | 我的建議 |
|---|------|:-------:|
| 1 | Plan mode 是「透明度需求」正交維度，不是 score 中段 | accept |
| 2 | canonical §5 使用者觸發詞納入 | accept |
| 3 | UserPromptSubmit 緩存意圖 → PreToolUse 讀（Phase 2 擴為 2+2.5）| accept |

### estimated_cost（更新）

- Phase 1: canonical ~120 行純文件（+40 行於 Round 2 估算）
- Phase 2: UserPromptSubmit intent 緩存 hook ~40 行 + test
- Phase 2.5: delegation-enforcer.js ~100 行 + test 10 case + LOCAL_MODULES
- 合計 ≈ 400 行

### blockers

無。但 Round 3 的「canonical §5 觸發詞」需要使用者實證樣本 — Manager 本 session 蒐集的 5 條應擴到 10+ 條才夠涵蓋。可能需要 Manager 翻歷史對話歸納。

### discovered_adjacencies（追加）

3. **UserPromptSubmit intent 緩存機制** 可用於其他 hook（不只 delegation）— 例如 ask-user-enforcer 若要讀使用者「我已選好了」語意也可用同一檔。建議緩存檔 schema 設計時考慮通用性
4. **三元決策也適用於其他選擇**：審查（self-review vs reviewer agent）/ 測試（直接跑 vs background）/ commit（直接 vs Plan mode preview）— 但本 dispatch 不擴，守 YAGNI
