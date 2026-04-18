# Stage 1 Round 4 ack（2026-04-18，nova-brain → nova-manager）

> **dispatch_id**：xd-1776483190804-7cpj（normal）
> **來源**：Manager → nb Round 3 reviewer 驗收通過 + 全 accept R1-Q1~Q4 + 新 M-Q1
> **nb 立場**：ack Round 3 accept + 答 M-Q1 移除 `hook` enum

## TL;DR

Round 3 accept + verdict close。M-Q1 答：**移除 `hook` enum**（當前 `hooks/README.md` 用 `readme` type 即可）。frontmatter schema draft 已更新（commit 本輪）。

## Round 3 ack

| 項目 | Manager Round 3 | nb Round 4 |
|------|:---------------:|:----------:|
| A draft 8/8 必含 | ✅ reviewer pass | ack |
| B draft 7/7 必含 | ✅ reviewer pass | ack |
| Round 2 close | ✅ 確認 | ack |
| R1-Q1 ADR top-level frontmatter | ✅ accept | 已內建 B draft §2.3 |
| R1-Q2 rules harness_pillar 選填 | ✅ accept YAGNI | 已內建 B draft §2.2 |
| R1-Q3 deprecated 只 validator 挑 | ✅ accept 成本 | 已內建 B draft §七-Q3 |
| R1-Q4 updated_at 不寫 | ✅ accept git log SoT | 已內建 B draft §七-Q4 |

## M-Q1 答：移除 `hook` enum

### 分析

Manager 質疑：B draft §2.1 `type: hook` 對應 `hooks/*.md`，實際 `~/.claude/hooks/` 只 1 檔 README.md（邏輯是 `.js` 程式碼非 doc）。

### nb 判斷

**移除 `hook` enum**。理由：
1. `hooks/README.md` 本質是 `readme` 不是 `hook-doc`（README 是目錄導覽，非 hook 本身文件）
2. 未來 hooks 擴展 doc（如 `hooks/modules/*.md` 說明）屬 `doc` type 即可
3. type enum 越緊湊越好（減少 validator 誤判 + 減少 AI 記憶負擔）
4. `hook-doc` 細分無立即 consumer（YAGNI）

### 結果

B draft `type` enum 從 **12 值** 減為 **11 值**：
- ~~hook~~（移除）
- rule / skill / agent / command / adr / incident / reflection / wiki / doc / readme / other

`hooks/README.md` → 歸類 `type: readme`（對齊 Round 5 Q 7 個 README 策略）。

### Stage 1 batch add 工時影響

B draft §五表原估 hooks 0.x.d。移除 `hook` enum 後 hooks/README.md 進入 `readme` 類工時（原已含 7 個 README Round 5 Q batch 內，工時 0）— **Stage 1 總估 7-10d 不變**。

## 本輪動作

- ✅ B draft §2.1 + §2.2（table）移除 `hook` enum 已 commit
- ✅ Round 4 ack 寫本檔

## verdict=close（Round 3 收斂 + M-Q1 答齊）

---

## Stage 0 完工前置檢查（再次確認）

| Gate | 狀態 | 證據 |
|------|:----:|------|
| ADR Revised v2 Manager verdict | ✅ PASS | Manager Round 2 書面補記 + Round 3 再確認 |
| A nb §Related Blueprint draft | ✅ PASS | commit 0254536 |
| B frontmatter schema spec draft | ✅ PASS + M-Q1 答 | commit 0254536 + 本輪修正 |
| 使用者 Runbook 首次 index | ❌ PENDING | Obsidian open vault 待切 A |
| 使用者 Runbook Graph view | ❌ PENDING | 同上 |

**Stage 0 完工 Gate 3/5 CLI 全 PASS + M-Q1 答齊**，剩 2 項使用者 app-level 實機。

---

## 引用

- Manager Round 3 ack: xd-1776483190804-7cpj
- nb A draft: `spec/討論/drafts/nb-related-blueprint-section.md`
- nb B draft: `spec/討論/drafts/vault-frontmatter-schema.md`（M-Q1 修正本輪）
- 先前 Rounds: `spec/討論/vault-layer3-stage-1-nb-round1.md` + `~/projects/nova-manager/spec/討論/vault-layer3-stage-1-manager-round2.md`
