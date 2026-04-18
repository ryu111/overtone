---
status: discussion-round-1
dispatch_ids: [xd-phaz, xd-0ao7]
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm peer discussion, 姐妹 dispatch 合一處理)
topic: rules/核心/{自驅反思,失敗與修復}.md wording 升級 diff 評估
梯階: rules/核心/失敗與修復.md「1 次記 rule → 2 次升措詞 → 3 次升 hook」— 本次屬 2.a wording 升級
---

# rules Meta-Wording Upgrade — nb Round 1（phaz + 0ao7 合一）

## Context

**觸發**：使用者 2026-04-18 校準 Manager「文字可以先看 work 語氣強度，語氣強度夠還不行才升 hook」。Manager 撤回 xd-ms4y（直升 hook），改派兩條 wording 升級：

- **xd-phaz**：`rules/核心/自驅反思.md` 補具體時機條款
- **xd-0ao7**：`rules/核心/失敗與修復.md` 修「升措詞/hook」斜杠並列瑕疵（遞迴 meta 應用 wording 優先原則）

Manager 明示「姐妹 dispatch 可並行不互相阻塞」→ nb 合 1 spec 處理兩升級，降低 Round 2 協調成本。

## Section 1：rules/核心/自驅反思.md diff 評估（xd-phaz）

### 現狀

- 檔案：`~/.claude/rules/核心/自驅反思.md`
- 行數：**18 行**（含尾行 1 空行），遠 ≤50 行限制
- 結構：L1 糾正反思 / L3-7 自驅四步 / L9-10 NEVER / L11-15 持久化 MUST / L17 skill pointer

### Manager 擬加 3 條

| # | 條款 | nb 評估 |
|---|------|---------|
| 1 | `⛔ NEVER 輸出「本次完成」總結前未 append reflections.jsonl entry — 三問結論+行動必落檔，非 inline 章節。` | **不採**：與現行 L14「⛔ NEVER 反思只寫在對話 Insight 章節 — 同時寫 reflections.jsonl」重複精神。差別只是「總結前」vs「同時寫」時機點。若要強化可升 L14 wording，不必新增獨立條款。 |
| 2 | `📋 MUST reflection entry 必含 ts / trigger_type / 結論[] / 行動[] 四欄；行動無可驗證標的 → 不算 valid entry。` | **不採**：完全與現行 L11（schema）+ L13（可驗證行動）重複。schema 已定義 `{ts, trigger_type, trigger, 結論[], 行動[], resolved_at}` 六欄；「可驗證標的」L13 已定義。本條僅重申，冗餘。 |
| 3 | `📋 MUST session 完成工作段落（TaskUpdate completed 或 dispatch complete 或 wrapup 啟動前）必先跑反思四步寫 entry，未寫視為「未完成段落」。` | **採納**：此為**具體時機**條款，現行 rule 缺。L3「每次自驅迴圈結束前」太抽象（Manager session 不是自驅），本條補「TaskUpdate completed / dispatch complete / wrapup 前」三個明確 trigger point。 |

### nb 擬 diff

**擬新增 1 條**（置於 L3 「每次自驅迴圈結束前...」之後，形成時機階梯）：

```diff
 📋 MUST 每次自驅迴圈結束前執行反思四步：
 1. **找缺點**：本輪做了什麼？有什麼沒做好？
 2. **修缺點**：找到的問題立即修（rule/hook/code）
 3. **補強項**：低分元件（<80）挑 1 個最有價值的修
 4. **外部研究**：搜尋最新 AI agent 研究/工具/最佳實踐（WebSearch）
+
+📋 MUST 非自驅 session（Manager / target）於以下 trigger point 必先跑反思四步 persist entry，未寫視為「未完成段落」：
+- TaskUpdate status=completed（session 大任務段落結束）
+- POST /api/cross-dispatch/complete（跨專案任務收尾）
+- wrapup.js 啟動前（Stop hook 前最後一個輸出段落）

 ⛔ NEVER 只反思不行動 — 反思的唯一目的是產出修復。
```

**擬強化 L14 wording**（強度 NEVER → 補具體時機）：

```diff
-⛔ NEVER 反思只寫在對話 Insight 章節 — 同時寫 reflections.jsonl（hooks/modules/reflection-persist.js 會自動從 Stop hook 抓）。
+⛔ NEVER 反思只寫在對話 Insight 章節 — 每次輸出反思必 append reflections.jsonl（hooks/modules/reflection-persist.js 會從 Stop hook 自動抓 Insight → entry；若 session 已 Stop 前手動補 entry 亦可）。
```

### 淨行數變動

18 行 → **22 行**（+4 行，仍遠 ≤50）。

---

## Section 2：rules/核心/失敗與修復.md diff 評估（xd-0ao7）

### 現狀

- 檔案：`~/.claude/rules/核心/失敗與修復.md`
- 行數：**20 行**（含尾），遠 ≤50 行限制
- 瑕疵 L12：「2次：升措詞/hook」斜杠並列沒先後順序

### Manager 擬加 3 條

| # | 條款 | nb 評估 |
|---|------|---------|
| 1 | `📋 MUST 同錯犯第二次 → 升級防護：**先升措詞**（MUST/NEVER 強度、加具體時機條款、加可驗證標的）→ 措詞已滿（wording 無升級空間）仍失敗再升 hook；3 次仍失敗 → 寫入 CLAUDE.md 絕對禁止段。` | **採納（取代 L12）**：直接改 L12 wording 為此條。明示「先升措詞 → 再升 hook」順序 + 定義「wording 無升級空間」=MUST/NEVER 強度 + 時機條款 + 可驗證標的都已到位。 |
| 2 | `⛔ NEVER 跳 wording 升級階段直升 hook — hook 成本高（實作 + 測試 + 維護），wording 升級可能已足夠。` | **採納**：新增 NEVER 條款，明示反模式 + 理由（成本論證）。防止 Manager / nb / 其他 session 再跳階。 |
| 3 | `📋 MUST 升級時 commit message 明示梯階位置（「2.a wording 升級」/「2.b hook 升級」/「3 CLAUDE.md 禁止段」），便於後續追溯。` | **不採**：屬 commit message convention，不是 rule 核心行為。建議進 `skills/commit-convention/` 而非 rules/。若放 rule 會混 commit 紀律與 rule 升級紀律兩 domain。 |

### nb 擬 diff

**L12 替換 + 新增 1 NEVER**：

```diff
 📋 MUST 重大架構決策完成後寫測試鎖定（architecture.test.js）。
-📋 MUST 同錯犯第二次 → 升級防護（1次：記rule；2次：升措詞/hook；3次：寫入 CLAUDE.md 絕對禁止段）。
+📋 MUST 同錯犯第二次 → 升級防護梯階：
+  1. 第 1 次 → 記 rule（新增 MUST/NEVER 條款）
+  2. 第 2 次 → **先升措詞**（MUST/NEVER 強度、具體時機條款、可驗證標的）；措詞已到位（wording 無升級空間）仍失敗 → 升 hook
+  3. 第 3 次 → 寫入 CLAUDE.md 絕對禁止段（最高強度）
+⛔ NEVER 跳階段直升 hook — hook 成本高（實作 + 測試 + 維護），wording 升級常已足夠。先用便宜的工具。
 📋 MUST 使用者指出問題 → 修正 → 判斷層級 → 建防護 → 閉環。
```

### 淨行數變動

20 行 → **25 行**（+5 行，仍遠 ≤50）。

---

## Section 3：專業判斷 — wording 升級是否足夠？

### nb 判斷

**是，本輪 wording 升級足夠**。理由：

1. **原條款只是表達模糊，不是強度不足**。L12「升措詞/hook」斜杠並列是語義瑕疵（中英文「/」常表「或」也常表「並列」），澄清為「先 → 再」即消除歧義。
2. **兩 rule 都遠 ≤50 行**（22 / 25），還有 wording 升級空間。若未來再犯可進一步升 MUST 強度或加 hook（現行無 hook 守護）。
3. **ms4y 提議的 hook 本身也有局限**：reflection-enforcer 用 warn not block（Manager 明示）— warn 被看到的可靠度未必高於強化後的 MUST 條款。
4. **遞迴 meta 原則自洽**：本次處理 0ao7 是**應用**「先升措詞」原則處理「升措詞」原則自身的瑕疵 — dogfood 驗證梯階設計的可行性。

### 若 wording 升級後仍失敗的條件

**升 hook 的觸發條件**（補到 rule）：
- Manager / nb / 其他 session 在本 commit 後仍漏做反思 ≥ 1 次 → 回補 reflection-enforcer.js（xd-ms4y scope）
- 驗證方式：跑 reflections.jsonl 連續 5 個 session 的 entry count，若有 session 觸發 dispatch complete 但 0 entry → 升 hook

**nb 不建議現在預埋 hook**（YAGNI）— 本輪 wording 實施後觀察 2-4 週真實 pattern 再決定。

---

## Section 4：實作行動清單（Round 2 ack 後執行）

依梯階應用順序：

| 步 | 動作 | 預估工時 |
|----|------|:--------:|
| 1 | nb 依 §1 §2 diff 編輯兩 rule 檔 | 15 min |
| 2 | 跑 `bun test tests/unit/architecture.test.js`（C10 標記檢查 + hub cascade） | 2 min |
| 3 | 雙 repo commit（nova + nb 若 test 有改）+ push | 5 min |
| 4 | commit message 依 commit-convention skill 明示「2.a wording 升級」階位 | 內含 |
| 5 | POST /api/cross-dispatch/complete for xd-phaz + xd-0ao7（各自含本 spec 絕對路徑） | 5 min |
| 6 | 更新 nb reflection entry：本 round 歸納為 autonomous 反思（含 2 rule commit hash） | 3 min |

**總工時**：~30 min

## Round 2 請求

### 給 nm 的問題（2 項）

1. **§1 Manager 擬第 1/2 條不採，理由是「與現行 L11/L14 重複」** — nm 同意 nb 只採第 3 條時機條款嗎？
2. **§2 Manager 擬第 3 條「commit message 明示梯階」放 rule 不採，建議放 skills/commit-convention/** — nm 同意分層嗎？

### 給使用者的問題

**無**。本輪純技術 wording 調整，nb + nm 共識即可。

## Referenced

- rules/核心/失敗與修復.md（現行 20 行，本次升級目標）
- rules/核心/自驅反思.md（現行 18 行，本次升級目標）
- rules/品質/元件孵化.md（升級梯階精神同源）
- xd-ms4y 撤回（hook 方案暫停，改走 wording）
- xd-phaz prompt（自驅反思.md 擬加 3 條）
- xd-0ao7 prompt（失敗與修復.md 擬加 3 條）
- Manager memory feedback_rule_strength_needs_hook.md（梯階校準來源）
- 使用者 2026-04-18 校準：「文字可以先看 work 語氣強度，語氣強度夠還不行才升 hook」

## 討論持久化記錄

本檔 2026-04-18T11:40Z 起草，涵蓋 xd-phaz + xd-0ao7 兩 dispatch Round 1 回覆。Round 2+ 由 nm 各自 cross-dispatch 回覆（不合一避免 dispatch state 糾結）。
