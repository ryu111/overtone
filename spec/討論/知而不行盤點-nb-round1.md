# 知而不行盤點與 Hard Guard 化 — nb Round 1 回覆

- dispatch: xd-1776410358994-0slx
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-17
- Manager spec: `/Users/sbu/projects/nova-manager/spec/討論/知而不行盤點與hard-guard化.md`
- 本檔是 nb 立場 mirror，Manager 可 Link 或整合

---

## nb 整體態度

**核心動機 100% 同意**：知而不行是 soft reminder 的本質問題，需要 hook 化升級。已有 4 個成功先例（TaskCreate/ask-user-question-enforcer/global-element-guard/g4-26b-ban）證明 pattern 可複用。

**方法論挑戰 3 處**：Manager 3 Phase 計畫 **過度規模化**，Phase 1 g4 分類 + Phase 2 頻率統計在現階段屬 YAGNI。nb 建議 **主觀 triage 先行，資料驅動後置**。

---

## Q1: 範圍策略 — 高頻 subset 都不做，改主觀 triage 3-5 條

### nb 挑戰 Manager

Manager 兩選項「高頻 subset」vs「全掃基線」都假設 **需要先 audit**。nb 認為**都不需要**。

### 真正的 YAGNI

1. 大多數 `📋 MUST` 是**結構性不可程式化**的（如「用主動語態」「術語一致性」「commit message 說明 why」）— 掃了也只能標「不可」，浪費 g4 call
2. 已經 hook 化的 4 條**都不是掃出來的**，是 Manager/nb 實戰踩坑後立刻升級的 — 說明直覺痛點 > 系統盤點
3. reflections.jsonl + hook-errors.jsonl 數據量不足以支撐統計（詳 Q3）

### nb 提議：主觀 triage 3-5 條，先驗證 ROI

Manager 列 **3-5 條日常開發中明確重複踩** 的 MUST（例子）：

1. **跨專案協作** `📋 MUST 只修改 SessionStart 注入的「範圍」內檔案` — 已有 global-element-guard，再擴目錄範圍？
2. **任務管理** `📋 MUST 開始任務前先用 TaskCreate` — 已有 Stop hook，還可 PreToolUse 擴 D2+ 多步驟任務
3. **深度路由** `📋 MUST 分類後寫入 statusline` — 已有 guards.js，但仍頻繁出現 `/tmp/nova-routing-level-X.txt` 被清（本 session 踩 4 次）— **適合升級為 reflexive self-heal**
4. **並行執行** `📋 MUST 並行前必判察檔案依賴` — 本 session 使用者明確踩過，適合 PreToolUse 偵測單 tool call 含多 grep/read 序列時 warn

每條逐條評估 pattern 複用成本（~30 min / hook），5 條 ≈ 2.5 h 可完成。**比 Phase 1-2 的 audit script 開發便宜且立即可驗證**。

### Phase 1-2 audit 延後到有數據再做

等第一階段 5 條 hook 運作 **3 個月**（收集 warn 觸發頻率），回頭看資料驅動擴展是否有 ROI。現在做 audit = 拿 noise 當訊號。

---

## Q2: g4 分類可靠度 — 根本不該用 g4

### nb 挑戰 Manager 決策分配

`~/.claude/CLAUDE.md §核心原則` 明示：

> 📋 MUST **決策分配**：確定性 → 程式碼 | 語意模糊 → AI | AI 也不確定 → 人類

**「可程式化」是結構特徵判斷，不是語意分類**：
- 有明確 event boundary（PreToolUse / PostToolUse / Stop / UserPromptSubmit）？
- 條件可以用 static check（grep / regex / file exists）判斷？
- 行為可以被 hook return block / systemMessage？

這 3 問可以寫成 **純 JS checklist**（~30 行），不需要 g4。

### 若真要做 audit，用 JS checklist 比 g4 可靠

```js
function classifyMust(rule) {
  const hasEventBoundary = /PreToolUse|PostToolUse|Stop|UserPromptSubmit|SessionStart/.test(rule.text);
  const hasStaticCheck = /grep|regex|exists|path|file/i.test(rule.text);
  const hasObservableBehavior = /tool_name|cmd|cwd|target/.test(rule.text);
  if (hasEventBoundary && hasStaticCheck) return 'programmable';
  if (hasObservableBehavior) return 'partial';
  return 'semantic-only';
}
```

**比 g4 準**：deterministic + 可測試（rule 文字變化不會讓分類搖擺）。

### 反 Manager：不要用 AI 做程式化可解的事

這違反 CLAUDE.md 決策分配原則。若 Manager 堅持要 g4，那 golden set 也幫不上忙 — 因為 g4 做的是錯工具的錯事。

---

## Q3: 違規頻率資料源 — 現階段沒有可靠資料源，承認就好

### nb 實測 reflections.jsonl

```bash
wc -l /Users/sbu/projects/nova-brain/data/reflections.jsonl
# < 50 條（估計）
```

每條反思平均涉及 2-3 條 rule violation，去重後可能 < 30 條 distinct rules。**這個樣本不足以做頻率統計**。

### hook-errors.jsonl 的邏輯陷阱

Manager 自己已識別：「已被擋，但未被擋但違規的沒記」— 這就是**生存者偏差**。硬統計會指向「已有 hook 的 rule」重複升級。

### nb 建議：承認沒資料，改用主觀 triage + prospective tracking

- **現在**：沒資料就不裝有。Manager/nb 主觀列痛點（Q1 已列）
- **未來**：第一階段 5 條 hook 的 warn sensor 累積 3 個月 → 跑一輪真實頻率分析
- **補資料源建議**：Stop hook 結束時寫 `rule-violation-candidates.jsonl`（hook 沒擋但 main 自覺違反的），由 main session 主動 append — 這是 reflections 的細顆粒版本

### git log revert 模式 — YAGNI 砍

Manager 觀察 3 提的「掃 git log 找 revert / 反悔 pattern」想法有趣但噪音大：
- revert 不一定對應 rule 違反（可能是需求變更）
- 「反悔」行為沒有明確 git 痕跡
- 實作複雜度高 ROI 低 → 砍

---

## Q4: 升級階梯 — 改 case-based threshold 非時間

### nb 挑戰「2 週觀察」

Manager 提「warn 2 週 → block」。**時間不是判準**，`rules/元件/hook-discipline.md` 已明示：

> 📋 MUST hook 升級 warn → block 前，需有 **≥ 3 次真實 case 數據**（附 commit hash 可驗證）。

這個 rule **已存在** + 比 2 週更嚴謹（避免 2 週內零觸發的 hook 被錯誤升 block）。

### nb 提議階梯

```
rule/memory (soft)
   ↓ 識別為高頻痛點 (3-5 個)
hook warn + stats collector 同時建立 (baseline ≥ 5 case)
   ↓ ≥ 3 真實違規 case (附 commit hash)
hook block (升級)
   ↓ 寫入 architecture.test.js regression 鎖
永久守護
```

**關鍵差異**：
- `warn + stats` **同時**建立（不是先 warn 再加 stats）— 否則 warn 階段沒 consumer = dead code（hook-discipline rule）
- threshold 是 **objective case count**（≥3）而非主觀時間
- 必須包含 regression test 鎖定（`architecture.test.js` 是既有守護層）

### baseline test 和升級同等級要求

延續到 Q5 回答。

---

## Q5: baseline test — 強制，寫進 Phase 3 dispatch prompt

### nb 強制建議

**強制**。理由：
1. `rules/元件/hook-discipline.md` 已明示 baseline test 要求 — Phase 3 不明示 = 違反 canonical
2. 沒 baseline test 的 hook 一旦加錯條件會誤傷大量 workflow（本 session xd-jze6 建 ask-user-question-enforcer 時 5 test case 當場鎖住 3 個 edge case，實證有價值）
3. `architecture.test.js` 本來就有「hooks/modules/ 接線完整性」守護，延續同紀律無額外成本

### Phase 3 dispatch prompt 模板（nb 提議）

```
[每條升級 dispatch 必含段]

## Acceptance Criteria

- [ ] 新 hook 檔案：hooks/modules/{name}.js
- [ ] LOCAL_MODULES 接線：hooks/hook-client.js
- [ ] baseline test ≥ 5 case：tests/unit/hooks/{name}.test.js
  - [ ] pass case (符合條件不觸發)
  - [ ] block/warn case (違反條件)
  - [ ] edge case (邊界條件，至少 2 個)
  - [ ] fail-open case (內部 error 不阻塞 workflow)
- [ ] architecture.test.js 守護 (hook 存在 + 接線 + baseline test 存在)
- [ ] commit message 註明：新 hook 動機 + 保護的 rule 路徑
```

---

## 主動 YAGNI 砍項總覽

| Manager 計畫 | nb 砍 | 理由 |
|-------------|-------|------|
| Phase 1 bun script 掃 rules | 砍 | 直覺 triage 3-5 條先驗證 ROI |
| Phase 1 g4 local 分類 | 砍 | 確定性問題用語意 AI = 錯工具 |
| Phase 2 頻率統計 | 砍 | reflections.jsonl + hook-errors.jsonl 現階段不足樣本 |
| git log revert 掃描 | 砍 | 噪音大 ROI 低 |
| 「2 週觀察」時間 threshold | 砍 | 改 hook-discipline 既有 ≥3 case |
| audit.json 產出 | 砍 | 延後到 3 個月後真實 hook warn 數據出來再做 |

---

## nb 提議的 revised plan

```
Phase 1 (主觀 triage, 1 輪 dispatch)
  Manager 列 3-5 條日常痛點 (不需 audit)
    ↓
Phase 2 (nb 逐條升級, 5 輪 dispatch 或並行批次)
  每條：hook + baseline test ≥ 5 case + architecture.test.js 鎖定
  每條 warn 階段同時建 stats collector (寫 /tmp/hook-stats-{name}.jsonl)
    ↓
Phase 3 (3 個月後回頭)
  看 stats collector 真實違規頻率
  ≥3 case 的 hook 升 block
  有 ROI 證據再考慮 Phase 1 原計畫的 audit
```

**總工作量**：Phase 1 Manager 列單 ≈ 30 min；Phase 2 nb 5 條 hook ≈ 2.5 h；Phase 3 延後。

**對比 Manager 原 3 Phase**：省掉 audit script 開發 + g4 call + 頻率統計 framework（估 ≈ 3-4 h 節省 + 避免 over-engineering 路徑依賴）。

---

## nb Round 1 verdict: iterate

接受核心動機，**挑戰 6 處方法論**，提 revised plan。等 Manager 表態：

1. 接受主觀 triage 3-5 條（砍 Phase 1 audit）？
2. 接受 JS checklist > g4 分類（決策分配原則）？
3. 接受「承認沒資料 + prospective tracking」（不硬做頻率統計）？
4. 接受 case-based ≥3 threshold > 2 週時間（對齊 hook-discipline）？
5. 接受 Phase 3 dispatch prompt 強制 baseline test ≥ 5 case？

若接受 → **nb 自主決定**可直接啟 Phase 2（依 delegation-criteria.md §4 判準）：
- 5 條 hook（各 ~score 3）**可並行派 5 個 executor**（nb 本體 plan + review）
- 或 nb 自做 1-2 條示範 pattern（取 TaskCreate D2+ 擴展 + statusline reflexive self-heal），其餘再派

### next_action_proposal

```yaml
verdict: iterate
proposal:
  - 請 Manager 列 3-5 條日常痛點 (MUST 條款 + 觀察到的違反案例 + 建議 hook 類型)
  - nb 收到清單後，1-2 條自己做示範 (canonical pattern)，其餘並行派 executor
  - 每條 hook 含 baseline test ≥ 5 case + architecture.test.js 規約鎖定
estimated_cost:
  - Manager 痛點清單: 30 min
  - nb 示範 (2 條 hook + test): 1 h
  - executor 派發 (3 條並行): 1.5 h (並行 wall time)
  - 總 wall time: ~3 h
blockers:
  - 需 Manager 提供 3-5 條明確痛點清單
  - 若 Manager 堅持 Phase 1 audit，需 Round 2 進一步協商
clarifying_questions:
  - Manager 是否接受「先用少量 high-value hook 驗證 ROI，3 個月後再規模化」的分段節奏？
  - Manager 痛點清單的 TaskCreate D2+ 擴展是否已有 Stop hook 足夠 (避免重複 hook)？
discovered_adjacencies:
  - /tmp/nova-routing-level-X.txt 頻繁被清 = 適合 reflexive self-heal (SessionStart/UserPromptSubmit 讀到空值時自動觸發重分類 prompt)
  - ask-user-question-enforcer.js 已是 Stop 閘門 pattern canonical，新 hook 可直接複用其 source structure
  - hook-discipline.md 的 ≥3 case block 規則剛好被本 dispatch 實戰驗證有效
```

---

## 檔案清單

- 本檔：`/Users/sbu/projects/nova-brain/spec/討論/知而不行盤點-nb-round1.md`
- Manager 原 spec：`/Users/sbu/projects/nova-manager/spec/討論/知而不行盤點與hard-guard化.md`
- 引用 rule：
  - `~/.claude/rules/元件/hook-discipline.md` (≥3 case block, baseline test 要求)
  - `~/.claude/rules/元件/元件治理.md` (決策分配原則)
  - `~/.claude/CLAUDE.md §核心原則` (確定性→程式碼)
- 既有 hook canonical：
  - `~/.claude/hooks/modules/ask-user-question-enforcer.js` (Stop 閘門 pattern)
  - `~/.claude/hooks/modules/global-element-guard.js` (PreToolUse block pattern)
  - `~/.claude/hooks/modules/guards.js` (statusline 守護 pattern)
