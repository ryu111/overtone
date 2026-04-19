# SessionStart 自動讀 handoff 設計討論

- 提出時間：2026-04-17
- source session：nova-brain
- 觸發使用者原話：「那是不是只要 sessionStart 都要求讀取 handoff 呢？這樣 handoff 指令也可以更簡單」
- 類型：討論式 spec（立場文件，非 implementation blueprint）
- 關聯既有 spec：`handoff-enhancement-design.md`（xd-vsja，P4 writer 強化）、`handoff-new-param.md`（xd-izqa，/handoff new 走 /clear）

## 0. 前置盤點

### 0.1 既有 handoff 鏈路（writer 側）

| 元件 | 角色 | 檔案 |
|------|------|------|
| flow-observer PreCompact | handoff writer 唯一入口 | `hooks/modules/flow-observer.js:697-733` |
| handoff-helpers 5 builders | section 聚合 | `hooks/modules/lib/handoff-helpers.js` |
| 輸出檔 | handoff 物化 | `/tmp/nova-handoff-<project>.md` |

**涵蓋 section**（xd-vsja 擴強後）：sessionQuote / recentSummary / recentCommits / progress / todos（pending dispatches）/ files / context / knowledge / ralphLoopState / autonomy / sequenceProgress。

### 0.2 既有 handoff 鏈路（reader 側）

**目前 reader 不存在**。SessionStart hook（`flow-observer.js:277-287`）只 persist `session_start` event 到 flow-events.jsonl，**不注入 handoff**。

handoff 目前靠兩條非自動路徑傳遞：
1. `/handoff`（compact mode）→ Claude Code compact summary 自帶濃縮資訊，handoff 檔僅供 post-compact 手動讀
2. `/handoff new`（clear mode，xd-izqa）→ `self-compact.js --mode=clear` 送完 `/clear` 後送 **continuation prompt** 提醒下輪讀 handoff

### 0.3 SessionStart source 四態語意（Claude Code 原生）

| source | 觸發 | 原生 context 狀態 |
|--------|------|-------------------|
| `startup` | 首次啟動 `claude` | 空 |
| `resume` | `claude -c` / `--resume` | Claude Code 自動 restore 完整對話 |
| `clear` | `/clear` | 空 |
| `compact` | `/compact` 後 | Claude Code 自動保留 compact summary |

hook input 已含此欄位，`flow-observer.js:283` 已讀取（僅 persist 到 events，未決策）。

---

## 1. 提議

**在 SessionStart hook 加 handoff auto-read，依 source 分 4 檔策略，取代 `/handoff new` 的 continuation prompt 環節**。

核心論點三條：

**論點 A — 值得做**：`/handoff new` 的 continuation prompt 是「自己送給自己的訊息」，和「SessionStart hook 注入 additionalContext」功能完全等價，但後者更可靠（hook 不會因 terminal race 漏送）且更統一（任何觸發 `/clear` 的路徑都自動銜接，不限 `/handoff new`）。

**論點 B — 不能無腦全讀**：handoff 檔是 PreCompact 寫的「當下快照」，過期會污染下游。`resume` 原生已 restore 對話、`startup` 可能隔數小時重開、`compact` 原生已有 summary。只有 `clear` 場景「context 剛清空 + handoff 剛產出」時間一致性 clean。

**論點 C — 簡化 `/handoff`**：若 SessionStart 負責注入，`/handoff new` 可去掉 continuation prompt 那步，`commands/handoff.md` 指令描述簡化。`/handoff`（compact）本身不變，因 compact source 另作決策。

---

## 2. source 四態決策表

| source | 是否讀 handoff | 原因 |
|--------|:------:|------|
| `clear` | ✅ **必讀** | context 剛清空，handoff 是下輪唯一狀態來源。取代 `/handoff new` 的 continuation prompt |
| `compact` | ⚠️ **條件讀** | Claude Code 原生有 compact summary，handoff 更詳細但有疊加風險。建議 **只注入 handoff 中 summary 沒有的結構化段**（pending dispatches / ralph-loop state / autonomy）|
| `resume` | ❌ **不讀** | 原生 restore 完整對話，注入 handoff = 雙份污染 |
| `startup` | ❌ **預設不讀** | handoff 可能隔數小時過期。例外：若 handoff mtime < 15min（使用者剛關 session 又重開）可讀。預設關閉，避免過期污染 |

### TTL 守衛

| source | TTL | 理由 |
|--------|:---:|------|
| clear | 30 min | `/clear` 後正常應立即重開，超過 30min 代表中途做別的事，handoff 已不代表當下 |
| compact | 10 min | compact 後通常 5 min 內有動作，10min 已用 compact summary 夠了 |
| startup | 15 min（選用，預設關閉）| 避免「隔夜開 session 讀到昨天 handoff」 |
| resume | — | 不讀 |

TTL 判定：`Date.now() - statSync(handoffPath).mtimeMs < TTL_MS`。

---

## 3. 檔路徑 convention

**沿用現有**：`/tmp/nova-handoff-<project>.md`，`<project>` = `basename(cwd)`。

**不改動原因**：
- writer（flow-observer PreCompact）已固定此路徑
- per-project 隔離已足夠（cwd 不同即 project 不同）
- `/tmp` 符合「臨時狀態」語意，重開機自動清

**不採用替代方案**：
- ❌ `~/.claude/data/handoff-<project>.md`（持久化）：違反 handoff「當下快照」語意，且會累積垃圾
- ❌ `~/.claude/projects/<cwd-hash>/handoff-latest.md`（per-cwd-hash）：增加複雜度，現 basename 已無衝突

---

## 4. 實作路徑

### 4.1 新增 hook 模組

**檔案**：`~/.claude/hooks/modules/handoff-auto-reader.js`

**職責**（單一）：SessionStart 時依 source 決策讀 handoff，輸出 additionalContext。

```js
// pseudo-code，非正式實作
export const on = {
  SessionStart: (input) => {
    const source = input?.source;
    const cwd = input?.cwd;
    const project = basename(cwd);
    const handoffPath = `/tmp/nova-handoff-${project}.md`;

    // Step 1: source 過濾
    if (source === 'resume') return null;
    if (source === 'startup' && !READ_ON_STARTUP) return null;

    // Step 2: 檔案存在
    if (!existsSync(handoffPath)) return null;

    // Step 3: TTL 守衛
    const ttlMs = { clear: 30*60_000, compact: 10*60_000, startup: 15*60_000 }[source];
    const age = Date.now() - statSync(handoffPath).mtimeMs;
    if (age > ttlMs) return null;

    // Step 4: 讀取 + source-specific 過濾
    let content = readFileSync(handoffPath, 'utf-8');
    if (source === 'compact') content = filterNonRedundantSections(content);

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `# 上輪 handoff（自動注入，source=${source}）\n\n${content}`,
      },
    };
  }
};
```

### 4.2 註冊

`hooks/hook-client.js` 的 `LOCAL_MODULES` 加：
```js
'SessionStart': [
  { path: 'hooks/modules/flow-observer.js', handlerKey: 'SessionStart' },
  { path: 'hooks/modules/handoff-auto-reader.js', handlerKey: 'SessionStart' },
  // ... 其他 SessionStart handlers
]
```

### 4.3 簡化 `/handoff new`

`~/.claude/scripts/self-compact.js --mode=clear` 目前流程：
1. spawn PreCompact hook 寫 handoff 檔
2. 送 `/clear`
3. **送 continuation prompt 提醒讀 handoff** ← 可移除

移除後流程剩 1+2。SessionStart hook source=clear 自動注入 handoff，效果等同。

`commands/handoff.md` 的 clear mode 描述可從「spawn PreCompact hook 寫 handoff 檔 → 送 `/clear` → 送 continuation prompt」簡化為「spawn PreCompact hook 寫 handoff 檔 → 送 `/clear`」。

---

## 5. 風險與反例

### 5.1 雙重注入風險（compact）

**情境**：source=compact 時，Claude Code 原生注入 compact summary + 我們 hook 注入 handoff → 兩份資訊衝突時 AI 該信哪個？

**對策**：compact source 只注入 handoff 中 **結構化段**（pending dispatches / ralph-loop state / autonomy sentinel），這些是 compact summary 不會涵蓋的「機器可讀狀態」。或乾脆 compact source 不注入（保守策略，Phase 1 預設）。

### 5.2 handoff 檔不存在

**情境**：首次使用 `/clear`（handoff 從未產生）或 handoff 被清掉。

**對策**：`existsSync(handoffPath)` fail-open（不報錯、不注入、不阻塞）。使用者該看到乾淨 session，不該看到 hook warning。

### 5.3 TTL 太緊導致該讀沒讀

**情境**：使用者 `/clear` 後 31 分鐘才重新輸入，handoff 被 TTL 擋掉。

**對策**：TTL 值 Phase 1 用保守值（30min clear），觀察 1 週使用者實際節奏，若常見抱怨「handoff 沒注入」則放寬到 1h。或改為 soft TTL（超過 TTL 仍注入但加警告「此 handoff 產生於 X 分鐘前，可能過期」）。

### 5.4 跨專案混淆

**情境**：A 專案 `/handoff new` 寫了 `/tmp/nova-handoff-A.md`，B 專案 SessionStart 誤讀 A 的 handoff。

**對策**：`basename(cwd)` 已 per-project 隔離，不同專案不會撞檔。但若兩專案 basename 同名（極少）會衝突 — 當前 writer 已是此風險，reader 沿用不新增風險。

### 5.5 Hook 輸出大小

**情境**：handoff 檔可能很長（幾 KB），SessionStart additionalContext 注入大量內容。

**對策**：依 `rules/元件/hook-discipline.md`「`additionalContext` ≤ 5000 bytes」— 讀取後 `truncate` 到 5000 bytes，尾段加 `... (+N lines, see /tmp/nova-handoff-<project>.md)` 提示使用者可自行讀完整檔。

---

## 6. 驗收條件

### 功能驗收

1. ✅ `/handoff new` 執行後 `/clear` → 新 session 的 SessionStart 收到 handoff 注入
2. ✅ `/clear`（未經 `/handoff new`）→ 依 handoff 是否存在 + TTL 決定是否注入
3. ✅ `claude -c` resume → SessionStart 不注入 handoff（對話已 restore）
4. ✅ `/compact` → 預設不注入 handoff（Phase 1 保守）
5. ✅ handoff 檔不存在 → 靜默跳過，無 hook 錯誤

### 結構驗收

1. ✅ 新檔 `hooks/modules/handoff-auto-reader.js` 通過 `tests/unit/architecture.test.js`（hooks/modules 接線完整性）
2. ✅ `hook-client.js LOCAL_MODULES.SessionStart` 含此模組
3. ✅ additionalContext 輸出 ≤ 5000 bytes（hook-discipline rule）

### 行為驗收

1. ✅ 新建 unit test：`tests/unit/hooks/handoff-auto-reader.test.js`
   - source=clear + 新 handoff → 注入
   - source=resume → 不注入
   - source=clear + TTL 過期 → 不注入
   - handoff 不存在 → fail-open
   - 注入 > 5000 bytes → truncate

---

## 7. 範圍界定（避免 YAGNI 違反）

**Phase 1 只做**：
- clear source 注入（主戰場）
- startup/compact/resume 按上表決策（startup/compact 預設不注入）
- TTL 硬編碼預設值

**Phase 2（待觀察驗證後）**：
- compact source 部分 section 疊加（需先釐清疊加收益）
- TTL 做成 settings.json 可調
- 過期 handoff 的 soft warning 模式

**Phase 3（可能不做）**：
- handoff 版本化（保留最近 N 份）— YAGNI，單份 latest 足夠

---

## 8. 反問使用者（待確認）

| # | 問題 | 我的建議 |
|---|------|---------|
| 1 | compact source Phase 1 要不要疊加？ | **不疊加**（保守，避免 summary + handoff 雙份污染）。Phase 2 觀察需求再做 |
| 2 | startup source 要不要啟用（15min TTL）？ | **預設關閉**，避免隔夜污染。使用者若想要「關了又開接續」體感可選擇性打開 |
| 3 | TTL 30min（clear）夠嗎？ | **先用 30min**，1 週後看 telemetry 調整 |
| 4 | continuation prompt 要不要同時保留（雙保險）？ | **移除**，避免 continuation prompt + SessionStart injection 雙注入 |

---

## 9. 下一步

- [ ] 使用者確認 §8 四個反問 → 收斂設計
- [ ] 移到 `spec/進行中/session-start-handoff-auto-read.md`
- [ ] 委派 planner 產出 tasks.md（因涉及新 hook 模組 + LOCAL_MODULES 改動 + test + 可能 `/handoff new` 修改，屬 D2 實作任務）
- [ ] 委派 hook-executor 實作 + skill-executor 修 commands/handoff.md
- [ ] reviewer 驗收
