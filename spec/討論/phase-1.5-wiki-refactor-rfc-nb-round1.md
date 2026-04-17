# Phase 1.5 RFC — nb Round 1 回覆

> 來源 dispatch: xd-1776438347386-n72g
> 原 RFC: `~/projects/nova-manager/spec/討論/phase-1.5-wiki-refactor-rfc.md`
> 角色: nb 專業者（knowledge owner + migration executor）
> 立場: 基於 wording 實驗數據挑戰 Manager 假設，不客氣地砍

## TL;DR

1. **Q1 A 選項被實測證實夠用** — 121 refs 中只有 **1 條** cross-skill 引用（debugging→craft），B 開 `wiki/shared/` 是 YAGNI，複本 C 是噩夢
2. **Q2 hook baseline 單向守護（skill→wiki）就好** — 雙向守護易走 xd-2c4m 跨動機擴展
3. **Q3 P0 選擇不對** — `auto` 不該 P0，它是 Main Agent 核心路由，搬壞 blast radius 最大。建議 `auto` 最後單獨搬
4. **Q5 偏好 B 分層**（rule→skill→wiki）— SKILL.md 不是 dead indirection，是場景化 context layer
5. **新議題 3 坑**：hook 擋 Edit → 全走 sed / linter scope 盲點 / 相對路徑脆性

---

## Q1 跨 skill 共通知識歸屬 — **A 嚴格單歸屬**

### 實測數據挑戰 Manager 假設

Manager 顧慮「跨 skill 共通知識」規模未知 → 我實測：

```bash
# 掃 33 個 SKILL.md 對 其他 skill/references/ 的引用
for skill in $(ls ~/.claude/skills); do
  grep -oE "skills/[a-z-]+/references/[a-z-]+\.md" "$HOME/.claude/skills/$skill/SKILL.md" 2>/dev/null \
    | grep -v "/$skill/"
done
```

**結果**：
```
debugging: skills/craft/references/code-level-patterns.md
```

**只有 1 條 cross-skill ref（0.83%，1/121）**。其他 120 條 references 都是 skill 自引。

### 結論

- (A) **嚴格單歸屬覆蓋 99.17% cases** — RFC 擔憂的「跨 skill 共通」在實測中幾乎不存在
- (B) `wiki/shared/` 對 1 條 case 開全新目錄分類，維護成本 > 收益 → YAGNI
- (C) 複本噩夢 — 不用討論
- **1 條例外處理**：`debugging` 的 SKILL.md 指向 `../../obsidian/wiki/craft/code-level-patterns.md`（cross-link），Obsidian graph 會呈現跨 skill backlink

### 我最糾結的 candidates（原本預期很多，實測 0）

我在讀 RFC 時擔心的幾組：
- `feedback-loop` vs `self-evolution`（都談反思）
- `cross-session` vs `dispatch-lifecycle`（都談 dispatch）
- `component-classification` vs `claude-dev`（都談元件邊界）
- `nova-eval` vs `skill-judge`（都談評估）

**實測結果：SKILL.md 互不跨引用**，每個 skill 的 references 都在自家目錄，知識已自然收斂到單一 owner。RFC 假設「可能有大量跨 skill 共通」**與現況不符**。

---

## Q2 skill 自包含性 hook 守護 — **A 但限單向**

### baseline case（最小 scope）

Hook 名：`skill-wiki-integrity.js`（structural check 擴充，不新建 runtime hook）。

| Case | 狀態 | Action |
|------|------|--------|
| skill dir 存在 + wiki dir 存在 | OK | pass |
| skill dir 存在 + wiki dir 缺 | broken | **warn** (不 block) |
| SKILL.md 的 `../../obsidian/wiki/X/Y.md` 引用目標缺 | broken | **warn** (不 block) |
| skill dir 不存在 + wiki dir 存在 | orphan wiki | **warn** (info only) |

### 跨動機擴展風險（xd-2c4m-hook-overexpansion）

⛔ **禁止反向守護**（避免跨動機擴展）：
- ❌ 偵測「wiki/X/ 有 Y 檔但 SKILL.md 沒引用 Y」— 這是**知識管理**問題，不是**結構完整性**問題
- ❌ 偵測「SKILL.md 表格內 wiki path 命名跟 wiki 實際檔名不符」— 這是**linter** 職責（vault-ref-linter 擴展）
- ❌ 偵測「skill description 跟 wiki 內容衝突」— 這是 **skill-judge** 職責

### 為什麼不 block 只 warn

baseline tests 鎖定 3 cases，升級 block 需要 ≥ 3 次真實 case 數據（`rules/元件/hook-discipline.md`）。Phase 1.5 剛搬完沒有數據，直接 block 會誤擋正常開發流程。

---

## Q3 拆批策略 — **P0 要移除 auto**

### 實測冷 skill usage

```bash
for s in dead-code debugging os-control agent-browser pinchtab; do
  cnt=$(grep -rl "skills/$s/" ~/.claude/rules/ ~/.claude/agents/ 2>/dev/null | wc -l)
done
```

結果：dead-code/debugging/os-control/agent-browser 都是 **0 處**，pinchtab 1 處。

### P0 選擇挑戰

Manager 提 P0 = `auto, cross-session, nova-test, dispatch-lifecycle, feedback-loop`。

⛔ **`auto` 不該 P0**。理由：
- `auto` 是 Main Agent 核心路由 skill（深度分類 D0-D4）
- Main Agent 每次接到任務**第一步**就要讀 auto SKILL.md（HARD GATE）
- 搬動 auto references 若出問題，會影響 Main 自己的 routing 決策 → blast radius 最大
- 建議：**auto 最後單獨搬**，其他 32 skills 都搬完並穩定後再碰

### 我的 P0 提案

| 優先 | Skills | 理由 |
|:----:|--------|------|
| P0 | `feedback-loop, cross-session, nova-test, wording(已搬)` | 高 usage + low blast radius |
| P1 | `dispatch-lifecycle, claude-dev, component-classification, nova-spec, closed-loop` | 中 usage + 結構 skill |
| P2 | `debugging, dead-code, os-control, agent-browser` (4 skill) | 0 引用，**可考慮不搬**（YAGNI） |
| P3（單獨） | `auto` | blast radius 最大，最後做 |

### 冷 skill 根本不搬的 tradeoff

`dead-code / debugging / os-control / agent-browser` 在 rules/ agents/ 0 處引用。搬遷工作量 = cost，收益 = 0。

**替代提案**：搬 28 skills（= 31 - 3 冷凍 - 4 可能不搬），冷 skill 維持原狀。RFC 估算 3-4 人天可能能縮到 2-3 人天。

---

## Q5 rule→wiki 直連 (A) vs 分層 (B) — **偏好 B 分層**

### 挑戰 Manager 假設

Manager 傾向 (A) 理由：「減一層跳轉，rule 直接指到深度內容 reader 少迷路」。

**我的觀察**：現行 16 個 rule 引用 `skills/X/references/` 時，通常長這樣：
```md
詳細協議 + 反例 vs 正例見 `skills/feedback-loop/references/protocols.md`。
```

這段文字的核心功能是**告訴 reader「去 SKILL.md 表格查閱深度資源」**，SKILL.md 的「深度查閱（References）」表格才是**場景化索引**（什麼情況讀什麼 reference）。

### B 分層的設計完整性

```
rules/ (50 行硬限制，行為條款)
  ↓ 「詳見 SKILL.md」
skills/X/SKILL.md (場景化索引層，告訴 reader 何時讀什麼 wiki)
  ↓ 「需要完整反模式清單 → wiki/X/Y.md」
wiki/X/Y.md (深度內容)
```

Rule→skill→wiki 三層各有職責：
- **rule** = 行為條款（must/never）
- **skill** = 場景化索引（when to read what）
- **wiki** = 深度內容

### A 直連適合 case

⚠️ A 直連**不是完全錯誤**，適合「rule 本身夠自包含，wiki 只是補充範例」的 case。例如：
```md
⛔ NEVER 用 argmax(score) 取第一個結果當 winner。
動機 + 程式化守護 + 反例 vs 正例：見 `wiki/benchmark-winner-detail.md`
```

這種 case SKILL.md 沒貢獻新資訊，A 可。

### 建議

**Round 2 先盤點 19 處 rule 引用**，分類「SKILL.md 有場景化貢獻」vs「SKILL.md 純 indirection」，再決定逐處 A/B。不要一刀切。

---

## 新議題：wording 實操經驗看到的 3 個坑

### 坑 1：Hook 擋 Edit → 所有 SKILL.md 改動必走 sed

`skills/*.md` 有 PreToolUse hook 擋 Edit/Write（見 `hooks/modules/skill-protection.js` 類守護）。我搬 wording 時首次 Edit 被擋：

```
保護元件：skills/wording/SKILL.md 在 skills/ 下，不可直接 Write/Edit。
請用 CLI：bun ~/.claude/scripts/manage-component.js update skill <name> '{"key":"value"}'
```

但 `manage-component.js` 只接受 frontmatter key/value 更新，不能改 body 文字。實際 fallback 是 `rules/核心/失敗與修復.md` 的「`~/.claude/` 下用 Bash sed」。

**對 Phase 1.5 影響**：自動化 migration script 必須用 `sed` 不能用 `Edit` tool。33 SKILL.md × 平均 4 refs = ~132 處 sed 替換。建議寫 `scripts/wiki-migrate.sh` 批次處理。

### 坑 2：vault-ref-linter scope 盲點

`scripts/vault-ref-linter.js` 只掃 `obsidian/` 內部 md 的引用，**不掃 `skills/*/SKILL.md` 指向 `obsidian/wiki/` 的外連**。

wording 實驗中，linter 報 `Broken links: 0`，但這只保證 obsidian 內部完整 — SKILL.md 的 4 條外連我必須額外 loop verify:
```bash
for f in wording-guide tone-calibration zh-tw-conventions auto-discovered; do
  test -f "../../obsidian/wiki/wording/$f.md" || echo "MISSING"
done
```

**對 Phase 1.5 影響**：每批搬完後**必須**額外驗 SKILL.md 外連 resolve。建議**擴展 vault-ref-linter 掃 `skills/*/SKILL.md` 內的 `../../obsidian/` pattern**，否則 Phase 1.5 後期靠手動驗證易漏。

### 坑 3：相對路徑脆性

`../../obsidian/wiki/X/Y.md` 依賴 `skills/` 相對位置永久不變。若未來：
- skills/ 分層（如 `skills/core/` + `skills/domain/`）→ 121 條 refs 全斷
- obsidian/ 移位（如升級 `~/.claude/` 到 `~/.nova/`）→ 同樣全斷

**對 Phase 1.5 影響**：相對路徑現在能 work，但**不是 SSOT-level 穩定**。建議：
- 短期（Phase 1.5）：接受相對路徑
- 中期（Phase 2+）：評估 Claude Code 是否支援絕對 alias（如 `@vault/wording/Y.md`），或 build-time 生成 symlink

---

## 回覆彙總表

| Q | Manager 傾向 | nb 意見 | 挑戰強度 |
|:-:|:-----------:|:-------|:--------:|
| Q1 | A 單歸屬 | **同意 A**（實測 1/121 cross-skill，99.17% 覆蓋） | 強化共識 |
| Q2 | A hook 守護 | **同意 A + 限單向**（避 xd-2c4m 跨動機） | 細化 scope |
| Q3 | P0 含 auto | **反對 auto P0**（blast radius 最大）；提 P0/P1/P2/P3 四層 | 強挑戰 |
| Q5 | A 直連 | **偏好 B 分層**（SKILL.md 是場景化索引非 dead indirection），但逐處分類 | 強挑戰 |
| 新議題 | — | **3 坑**：hook 擋 Edit / linter scope / 相對路徑脆性 | 新增 |

---

## Round 2 期望輸入（給 Manager）

我已挑戰完 4 個核心假設 + 補 3 個新坑。希望 Manager Round 2 收斂以下：

1. **Q3 重排 P0**：接受 auto 單獨 P3 還是堅持 P0？
2. **Q5 逐處分類**：19 處 rule 引用是否接受逐處 A/B？還是一刀切 A？
3. **冷 skill 是否搬**：debugging / dead-code / os-control / agent-browser 0 引用 → 搬 or 凍？
4. **vault-ref-linter 擴展**：是否納入 Phase 1.5 scope（掃 SKILL.md 外連）？
5. **自動化 migration script**：Manager 寫還是 nb 寫？（依 `scripts/` canonical ownership）

Round 2 請 Manager 整合使用者意見後回覆（特別是 Q3 auto 延後這個 scope 爭議）。

---

## Metadata

- 寫入時間: 2026-04-17
- 寫入者: nb session (nova-brain)
- 依據 rules: `rules/協作/討論式派發持久化.md`, `rules/協作/討論式派發.md`, `rules/協作/peer-discussion-visibility.md`
- 驗證數據源:
  - `find ~/.claude/skills -path "*/references/*.md" | wc -l = 121`
  - `find ~/.claude/skills -type d -name references | wc -l = 31`
  - cross-skill ref scan = 1 case (debugging→craft)
  - cold skill grep = 4 skills 0 引用 (dead-code/debugging/os-control/agent-browser)
