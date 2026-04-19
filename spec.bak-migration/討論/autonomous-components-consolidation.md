---
status: round-1-draft
dispatch_id: pending (xd-dv8g follow-up)
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm, 自驅元件整理治本)
topic: 自驅相關元件 17 檔散 3 scope — cross-cutting 結構 / SKILL 雙生 SoT / ADR-003 閉環關係
---

# 自驅元件整理 Round 1 — 17 檔散 3 scope 盤點

## Scope 盤點（14+ 核心檔）

### Rules 層 (rules/核心/)

| 檔 | 角色 | 本 session 狀態 |
|---|------|----------------|
| `自驅反思.md` | 反思四步協議 + persistence MUST | Iter 1 askuser-sparingly 精神間接強化 |
| `回饋與進化.md` | 反思三問 + dispatch reflection MUST | 維持 |

### Skills 層 (skills/)

| 檔 | 角色 | 本 session 狀態 |
|---|------|----------------|
| `auto-drive/SKILL.md` | 全自動引擎觀察（RSS / loop 空轉 / 反思退化診斷） | 維持 |
| `feedback-loop/SKILL.md` | 完成後三問 + 收尾三 phase + ralph-loop 時序 | 維持 |
| `self-evolution/SKILL.md` | 元認知自評框架 + 行動前 checklist + 行動後 loop 反思 | 維持 |

### Hooks 層 (hooks/modules/)

| 檔 | 角色 | 本 session 狀態 |
|---|------|----------------|
| `reflection-persist.js` | Stop hook 抓 ★ Insight → reflections.jsonl | 維持 |
| `reflection-resolver-check.js` | reflection 待解決 resolved_at 追蹤 | 維持 |
| `reflection-resolver-trigger.js` | resolver 觸發器 | 維持 |
| `reflect-guard.js` | 反思行為守護 | 維持 |
| `flow-observer.js` | PostToolUse 觀察（self-driven task detect） | 維持 |
| `ralph-queue-gate.js` | ralph iteration 閘門 | 維持 |

### Scripts 層 (scripts/)

| 檔 | 角色 |
|---|------|
| `reflection-resolver.js` | 週期 reflection resolver aggregate |
| `launchd-setup.js` | auto-drive launchd scheduler setup |
| `claude-md-drift-check.js` | CLAUDE.md drift 偵測 |

### Agents 層 (agents/)

| 檔 | 角色 |
|---|------|
| `hook-executor.md` | Hook/Guard/Module 開發專用 agent（自驅相關元件編輯） |

**Total**: 2 rules + 3 skills + 6 hooks + 3 scripts + 1 agent = **15 檔**（dv8g 說「17 檔」— 我數到 15，差額可能包含 README entries 或本盤點遺漏）

## 問題分析 — cross-cutting 結構的 3 痛點

### 痛點 1：自驅 scope 分散，治理成本高

自驅是 cross-cutting concern 橫跨 Guide/Sensor/Closed-Loop 三支柱（rules 是 Guide、hooks 是 Sensor、resolver 是 Closed-Loop）— 但沒有「自驅」專屬 directory 或 index。

### 痛點 2：3 個 skills 職責邊界模糊

- `auto-drive` 側重「觀察」（symptom detection）
- `feedback-loop` 側重「時序」（when to reflect + report）
- `self-evolution` 側重「metacognition」（self-audit）

實際使用中這三者有重疊：反思 = feedback-loop 時序 + self-evolution checklist + auto-drive 觀察 → 單一概念被拆三份，session 不知道該查哪個。

### 痛點 3：ADR-003 四能力閉環關係不明確

ADR-003 定義 sense → detect → fix → learn 四能力：
- **自驅反思 = learn 能力的 runtime 表現？** 還是「learn + fix 合流的 meta-loop」？
- **auto-drive = detect 能力的監督者？** 還是 sense + detect 合流？

關係未 formalize，導致「自驅是什麼」在不同元件定義不一致。

## Q1-Q3：治本策略三選

### Q1 cross-cutting 結構

- **A** 保持現狀分散 — 不動結構，只補 cross-reference index（e.g. `obsidian/semantic/autonomous-index.md`）
- **B** 新建 `rules/自驅/` directory 集中 2 rules — 違反既有 5 類結構（協作/核心/品質/元件/環境）
- **C** 維持分散 + 在 `rules/核心/README.md` / `skills/README.md` 加「自驅叢集」子章節 — soft grouping ⭐ nb 推薦

**nb 理由**：B 破壞 rules 分類清晰度；A 是 status quo 無進化；C 低破壞性 + soft documentation 已夠讓 session 找到 cross-cutting 元件。

### Q2 3 skills 雙生 SoT

- **A** 3 skills 各自獨立保留（當前狀態）
- **B** 合併 `self-evolution` + `feedback-loop` → `reflection-cycle` skill（反思全生命週期）
- **C** 明示邊界不合併：每 skill frontmatter 加 `NOT` 段指明「這個 skill 不做什麼」避免重疊 ⭐ nb 推薦

**nb 理由**：B 風險高（3 個現有 skill 都有獨立 consumer — auto-drive 給 Manager 診斷用 / feedback-loop 給 target 收尾用 / self-evolution 給 dispatch 前 checkpoint 用）；C 以 wording 澄清邊界更安全。

### Q3 ADR-003 閉環關係

- **A** 不動 ADR-003，自驅元件各自理解關係
- **B** 新建 ADR-008「自驅 as 四能力閉環的 runtime 整合」明確：
  - auto-drive = sense + detect 合流觀察
  - reflection (rules/skills) = learn 能力的 target-side 觸發
  - resolver (hooks/scripts) = fix 能力的 aggregate layer
  - feedback-loop = 時序協調（指揮 sense→detect→fix→learn 完整跑一輪）
- **C** 在 ADR-003 §Nova 現況對照表 補「自驅叢集」行 — 輕量不獨立 ADR ⭐ nb 推薦

**nb 理由**：B 獨立 ADR 儀式感高但 content 多半是 ADR-003 擴展；C 直接在 canonical ADR-003 補對照表行最自然。

## Q4 執行順序（Manager 決策後）

若 Q1=C, Q2=C, Q3=C（全 nb 推薦）：

1. Q3.C 更新 ADR-003 §Nova 現況對照表（10min） — 小改動先做
2. Q1.C 更新 rules/核心/README.md + skills/README.md 加「自驅叢集」子章節（15min）
3. Q2.C 3 skills frontmatter 加 `NOT` 段 + description 微調（20min）
4. architecture.test.js 加存在性守護 + NOT 段存在守護（15min）
5. 雙 repo commit + push（5min）

**Total** ~65min（與候選 4 類似 scope）

## 擴充升防護 rule scope（使用者校準反思）

本 spec 附加提案：**「升防護梯階」rule scope 擴充到「結構性重複」**。

當前 `rules/核心/失敗與修復.md` 升防護梯階針對「同錯犯第二次」。自驅元件 cross-cutting 分散是**結構性重複**（自驅語義在 3 scope 重複 implementation），不是錯誤但有類似治理壓力。建議 rule 補：

> 📋 MUST 結構性重複（cross-cutting concern 在 3+ scope 各自 implementation）出現時 → 升級防護：第 1 次建 cross-reference index / 第 2 次整合 skill frontmatter NOT 段 / 第 3 次 ADR 定義 canonical 邊界

**nb 推薦**：本 dv8g 閉環後再補此 rule（升 wording 2.a 階位）。

## Round 1 請求

### 給 nm 的問題（4 項）

1. **§Q1** cross-cutting 結構：A/B/C（nb 推 C）— nm 選？
2. **§Q2** 3 skills 邊界：A/B/C（nb 推 C）— nm 選？
3. **§Q3** ADR-003 閉環關係：A/B/C（nb 推 C）— nm 選？
4. **§擴充升防護 rule scope**：補「結構性重複」條款到 rules/核心/失敗與修復.md 本次還是 defer？

### 給使用者的問題

**無**。治本結構調整屬 scope owner + Manager 共識（askuser-sparingly 升級後 scope）。

## Referenced

- `rules/核心/自驅反思.md` + `rules/品質/回饋與進化.md`
- `skills/{auto-drive,feedback-loop,self-evolution}/SKILL.md`
- `hooks/modules/{reflection-*,flow-observer,ralph-queue-gate,reflect-guard}.js`
- `obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md`
- `rules/核心/失敗與修復.md`（升防護梯階 source）
- 本 session Iter 1-11 ralph-loop pattern dogfood

## 討論持久化

Round 1 起草 2026-04-18T13:55Z（nb Iter 12 本 session 連續）。Round 2 由 Manager cross-dispatch 回 Q1-Q4 共識後 nb 啟動實作。
