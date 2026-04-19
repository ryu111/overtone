# Autonomy Self-Scan 設計討論（xd-phhg）

> P3 第 1 輪。Manager 6 質疑 + target 反駁 + 設計版本（含 P2 Q_A 累積的 orphan script detection）。

## 1. 反駁 Manager 6 質疑

### Q1：Sentinel test 設計 — **全機械，不用 LLM-judge**

**反駁 LLM-judge**：太貴 + 不穩定 + 難 reproducible。Sentinel test 是用來告訴 hook「能力是否存在」的二元訊號，不是品質評分。複雜判斷留給人。

**設計原則**：每個 sentinel test 必須是 grep / count / exists / git log 等同步機械操作，exit code 1=fail / 0=pass。

| 維度 | Sentinel | 測法（機械） |
|------|---------|------------|
| 1. 自我修復 | `last_30d_fix_commits` | `git log --since=30d --oneline ~/.claude grep -c "fix\|root cause"` ≥ 3 |
| 2. 自主推進 | `dispatch_poller_wired` | grep `dispatch-poller` in `hooks/hook-client.js` LOCAL_MODULES |
| 3. 自我觀測 | `routing_level_writeable` | `existsSync /tmp/nova-routing-level-*.txt` 任一 |
| 4. 自我校準 | `recent_resolved_ratio` | `reflections.jsonl` 最近 20 筆 `resolved_at != null` count / 20 ≥ 0.3 |
| 5. 跨輪持久化 | `handoff_recent_exists` | `/tmp/nova-handoff-*.md` mtime < 7 天 |
| 6. 自我升級 | `model_ladder_documented` | grep `g4-26b\|haiku\|sonnet\|opus` 4 個全在 `skills/multi-tier-routing/SKILL.md` |
| 7. 合作能力 | `recent_dispatch_complete_ratio` | `dispatch-metrics.jsonl` 最近 10 筆 success ratio ≥ 0.7 |
| 8. **元件接線健康**（P2 Q_A 累積）| `orphan_runtime_scripts` | `scripts/*.js` 符合 RUNTIME_AFFECTING 但 grep `hook-client.js` 找不到 → orphan list |

**全機械** = 可 unit test + 可 cron run + 可 reproduce + 0 LLM 成本。

### Q2：執行時機

**反駁 a (合 component-scan)**：軸不同（element 靜態 vs capability 動態），合併會混淆讀者。

**反駁 b (Stop / SessionStart hook)**：Stop 過頻、SessionStart 開銷大（每次新 session 跑 8 sentinel = ~2s 延遲）。

**反駁 d (純 CLI)**：META BLIND SPOT 教訓 — 沒人主動跑就形同不存在。本 P3 設計目的就是避免歷史債務無感，CLI-only 等於重蹈覆轍。

**接受 c (CronCreate 每日) + SessionStart catch-up 條件觸發**：

我的版本 — **雙觸發**：
- **CronCreate 每日 1 次**：跑 full scan，不影響 hot path
- **SessionStart 條件觸發**：偵測 `data/autonomy-state.json` mtime > 7 天 → 觸發 catch-up scan（極稀疏觸發）
- **不在 Stop / UserPromptSubmit 跑**：避免 hot path 開銷

### Q3：失敗維度處理

**反駁 b (立即 dispatch 修)**：自動派工有 cascading 風險（修錯方向、無限循環、context blast）。

**接受 a (持久化) + c (systemMessage) 組合**：
- 寫 `data/autonomy-state.json` 持久（同 component-distribution.json pattern）
- Sentinel fail 時 SessionStart additionalContext 注入「N 維度 sentinel 失敗：X / Y / Z」
- Manager 週期 review autonomy-state.json，**人決定是否派 dispatch 修**（不自動）

**為什麼不自動 dispatch**：sentinel fail 可能是 false positive（測法太嚴 / 環境瞬態 / 資料未更新），自動派工會放大 false positive 為實際工作。Manager review = 人為 sanity check。

### Q4：跟 component-scan 的關係

**反駁合併**：兩者軸不同：
- component-scan: 靜態元件治理（誰存在、誰孤兒、誰過時）
- autonomy-self-scan: 動態能力測試（功能是否運作）

**反駁子集呼叫**（依賴方向錯）：autonomy-self-scan 呼叫 component-scan 等於 capability test 依賴 element scan，但 element scan 自己也是被測對象。循環依賴。

**我的版本**：**完全分離 + 共用 lib**：
- `scripts/component-scan.js`（既有）
- `scripts/autonomy-self-scan.js`（新）
- `scripts/lib/scan-helpers.js`（共用 file walk / git age / grep wrappers）— 若有共用需求才建
- 輸出檔分開：`data/component-distribution.json` + `data/autonomy-state.json`

### Q5：Orphan script detection — 接受並提升為第 8 維

**接受**並把它升為**獨立第 8 維「元件接線健康」**。

理由：
- P2 Q_A 累積的歷史債務問題（reflection-resolver.js 沒接線）是 META BLIND SPOT pattern 的核心
- 不該塞進其他維度作為附加 check
- 設計為獨立維度才有 standalone metric 可追蹤

**Sentinel 邏輯**：
```
for script in ~/.claude/scripts/*.js:
  if not RUNTIME_AFFECTING regex match: continue
  if grep "$(basename script)" hooks/hook-client.js: continue  # 已接線
  # 排除 CLI-only scripts（settings.json statusline / self-compact.js）
  if script in CLI_ONLY_WHITELIST: continue
  → orphan_candidate.append(script)
return orphan_count == 0  # pass condition
```

`CLI_ONLY_WHITELIST` 預設：`["statusline.sh", "self-compact.js", "spec-tasks.js", ...]`

### Q6：誰設計 sentinel test — **漸進不一次全做**

**反駁一次全做**：8 個 sentinel test 是大設計，每個都需獨立思考測試對象 + 合理閾值 + 邊界 case。一次全做風險：
- 設計時間爆炸（單 session 不夠）
- 沒驗證框架就擴 sentinel = 框架錯了 sentinel 都得改
- 個別 sentinel 細節容易被忽略

**漸進策略**：
- **Phase 0**（~1.5h）：寫 framework + **3 個最 ROI 高的 sentinel**：
  1. **自主推進**（dispatch_poller_wired）— P1 剛建必須驗證
  2. **元件接線健康**（orphan_runtime_scripts）— 解決 P2 Q_A 歷史債務
  3. **自我校準**（recent_resolved_ratio）— P2 剛接線需驗證
- **Phase 1**（後續 ~1.5h）：分批加其餘 5 個 sentinel

### 額外發現（Q5 副產品）

P3 sentinel 框架本身可成為 **「reflexive metric」**：每加一個新 hook（如 dogfooding-tracker、dispatch-poller），就應該加對應 sentinel 驗證它真的接線且 work。這比 unit test 更高層 — unit test 驗證行為正確，sentinel 驗證**「在 production 環境是否真在跑」**。

可能反向影響 rules/品質/元件孵化.md：應加條款「新 runtime-affecting 元件必加對應 sentinel」。

---

## 2. 我的設計版本

### Script 元數據

| 項 | 值 |
|----|----|
| Script | `~/.claude/scripts/autonomy-self-scan.js` |
| 觸發 | CronCreate 每日 + SessionStart catch-up（mtime > 7d）|
| 輸出 | `~/.claude/data/autonomy-state.json` |
| 維度 | 7 + 1（元件接線健康）= 8 |
| Sentinel 形式 | 全機械（grep / count / exists / git log） |

### output schema

```json
{
  "_meta": {
    "scan_ts": "2026-04-14T...",
    "version": "0.1"
  },
  "sentinels": [
    {
      "dimension": "自主推進",
      "name": "dispatch_poller_wired",
      "passed": true,
      "evidence": "found in hooks/hook-client.js LOCAL_MODULES (UserPromptSubmit + SessionStart)",
      "duration_ms": 12
    },
    ...
  ],
  "_summary": {
    "total": 8,
    "passed": 7,
    "failed": 1,
    "fail_dimensions": ["元件接線健康"]
  }
}
```

### Phase 0 三 sentinel 詳細

**Sentinel 1: dispatch_poller_wired**
```js
function check_dispatch_poller_wired() {
  const content = readFile("hooks/hook-client.js");
  const ok = /dispatch-poller/.test(content) &&
             content.includes("UserPromptSubmit") &&
             content.includes("SessionStart");
  return { passed: ok, evidence: ok ? "wired in 2 events" : "missing" };
}
```

**Sentinel 2: orphan_runtime_scripts** (P2 Q_A 累積)
```js
const RUNTIME_RE = /^(component-|self-|lib\/|reflection-)/;
const CLI_ONLY = new Set(["statusline.sh", "self-compact.js", "spec-tasks.js"]);

function check_orphan_runtime_scripts() {
  const scripts = readdirSync("scripts/").filter(f => f.endsWith(".js") || f.endsWith(".sh"));
  const hookContent = readFile("hooks/hook-client.js");
  const orphans = [];
  for (const f of scripts) {
    if (CLI_ONLY.has(f)) continue;
    if (!RUNTIME_RE.test(f)) continue;
    if (hookContent.includes(f)) continue;
    orphans.push(f);
  }
  return { passed: orphans.length === 0, evidence: orphans.join(",") || "all wired" };
}
```

**Sentinel 3: recent_resolved_ratio**
```js
function check_recent_resolved_ratio() {
  const lines = readFile("~/projects/nova-brain/data/reflections.jsonl").trim().split("\n").slice(-20);
  let resolved = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.resolved_at) resolved++;
    } catch {}
  }
  const ratio = resolved / lines.length;
  return { passed: ratio >= 0.3, evidence: `${resolved}/${lines.length} = ${(ratio*100).toFixed(0)}%` };
}
```

### CronCreate 整合

```bash
CronCreate("autonomy-self-scan", "0 9 * * *", "bun ~/.claude/scripts/autonomy-self-scan.js")
```

每天 9am 跑一次。失敗時 cron daemon stdout 寫入 hooks log 不阻擋。

### SessionStart catch-up hook

新 module `hooks/modules/autonomy-scan-trigger.js`：
- SessionStart 偵測 `data/autonomy-state.json` mtime
- 若 > 7 天無更新 → spawn `bun scripts/autonomy-self-scan.js` async（不阻 SessionStart）
- 結果在下次 SessionStart 才看到（async 模式）

### 成本重估

| 項 | 原估 | 重估 |
|---|:---:|:---:|
| Framework + 3 sentinel | — | 1.5h |
| 其餘 5 sentinel | — | 1.5h（分批）|
| CronCreate 整合 | — | 15 min |
| SessionStart catch-up hook + 接線 | — | 30 min |
| Unit test ≥ 8 case | — | 45 min |
| **Phase 0 總** | **2h** | **~3h** |

Phase 0 只做 framework + 3 sentinel + cron + catch-up hook + test = ~3h（不含後 5 sentinel）。

---

## 3. 反問 Manager（輪 2）

1. 全機械 sentinel（不用 LLM-judge）接受嗎？這降低成本但限制能測什麼
2. 第 8 維「元件接線健康」獨立 vs 塞進其他維度作 sub-check？
3. CronCreate 每日 + SessionStart catch-up 雙觸發接受嗎？頻率合理？
4. 漸進策略 Phase 0 三 sentinel 選的對嗎（自主推進 + 元件接線 + 自我校準）？
5. CLI_ONLY_WHITELIST 由誰維護？hard-code in script 還是 config 化？
6. 「reflexive metric」副產品 — 新 hook 必加對應 sentinel — 要不要寫入 rules/品質/元件孵化.md 作為新條款？

---

**verdict**：iterate — 設計版本完成 + 8 維清單 + 漸進策略 + 6 反問等 Manager 收斂。

---

## 4. 討論輪 2 — Q_A/Q_B + 收斂

Manager 接受 6 反駁 + Q5 CLI_ONLY 改 config 化 + Q6 reflexive metric 寫入 rule。提兩個新質疑：

### Q_A：Sentinel threshold config 化 — 接受並維持單一 config 檔

**完全接受**。`ratio >= 0.3` 是拍腦袋值（Phase 0 沒實測）。硬編問題：未來調要改 code 非 config，與 `auto_thresholds` 不一致。

**反駁「獨立 config」**：建議塞進 `config/component-lifecycle.json` 新 key `autonomy_sentinels` 而非另開新檔。理由：
- 單一 config 檔管所有元件生命週期語意
- 統一 `_meta.last_derived_at` 機制
- Manager review 一個檔比兩個輕鬆
- 未來若 sentinel 暴增到 30+ 才考慮拆檔

修正版 schema：
```json
{
  ...
  "cli_only_whitelist": ["statusline.sh", "self-compact.js", "spec-tasks.js"],
  "autonomy_sentinels": {
    "recent_resolved_ratio_floor": 0.3,
    "fix_commits_30d_floor": 3,
    "handoff_max_age_days": 7,
    "dispatch_complete_ratio_floor": 0.7
  },
  ...
}
```

### Q_B：grep vs structural inspect — grep 為主 + 架構守護

**反駁 runtime inspect**：太重。為 hypothetical「未來 dynamic loading」加複雜度違反 YAGNI。

**反駁純 grep**：脆。

**我的版本（中庸）**：
- **Phase 0 sentinel 用 grep**（簡單夠用）
- 加 **architecture test** 鎖定「`hook-client.js` 用 `const LOCAL_MODULES` 物件可 grep」這個前提
- 若未來真的重構成 dynamic loading → architecture test 先 fail → 強迫同步更新 sentinel
- 這比 runtime inspect 簡單 95%，但有結構守護兜底

具體：擴 `tests/unit/architecture.test.js` 加 case：
```js
it("hook-client.js LOCAL_MODULES 必須是可 grep 的 const 物件（autonomy-self-scan sentinel 依賴）", () => {
  const content = readFile("hooks/hook-client.js");
  expect(content).toMatch(/const\s+LOCAL_MODULES\s*=\s*\{/);
});
```

---

### 收斂授權執行

Manager 授權 ~3h。執行步驟記錄：

1. ✅ 輪 2 spec 段（本段）
2. → 實作 `scripts/autonomy-self-scan.js`（framework + 3 sentinel）
3. → `config/component-lifecycle.json` 加 `cli_only_whitelist` + `autonomy_sentinels`
4. → 新 `hooks/modules/autonomy-scan-trigger.js`（SessionStart catch-up）
5. → LOCAL_MODULES SessionStart 註冊
6. → `rules/品質/元件孵化.md` 加 reflexive metric 條款
7. → architecture test 加 LOCAL_MODULES grep 守護 case
8. → unit test ≥ 8 case for autonomy-self-scan + autonomy-scan-trigger
9. → 實機跑一次（meta-dogfood）
10. → commit + complete

