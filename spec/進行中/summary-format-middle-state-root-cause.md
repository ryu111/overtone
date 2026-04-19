# Summary Format 中間態根因治本

**日期**：2026-04-20
**Depth**：D2（tag: rule-change + hook-module, diff ~50 行跨 3 元件）
**授權**：使用者當面糾正「這種等 user選擇的一律使用 askuser，我記得有這個行為」→ AskUserQuestion confirm 根因 + Recommended 選項

## 背景（根因）

本 session 兩輪輸出「## 接下來的建議」含 markdown 表格列 A/B/C 選項等 user pick（輸入 "A+B"）。違反 CLAUDE.md §詢問紀律「需要使用者選擇時一律使用 AskUserQuestion」。

表面：rules/核心/任務生命週期.md 有矛盾條款（「⛔ NEVER 機械套用 AskUserQuestion... 收尾建議用表格直接列」）。

**深層根因**：AI 完成任務後 default 框架是「報告 + 列 options 等 pick」（對話式 UX 烙印），對立於 Nova Harness「自決 or AskUserQuestion」二分法。矛盾條款給了中間態（markdown 表格列選項）合法性，AI 天然偏好此中間態（周到/避險），挑了便宜條款。

## 治本（消除中間態）

下一步必二擇一無第三條路：
1. **AI 自決**：直述「下一步：X」，無選項，直接做/等下輪
2. **AskUserQuestion**：真需 user 選 → 工具（tool-use），非 markdown

## Deliverables

### 1. rules/核心/任務生命週期.md
- 刪「收尾建議用表格直接列」條款
- 改「下一步」section header（原「接下來的建議」）
- 加「下一步二擇一」新段（MUST/NEVER）

### 2. hooks/modules/summary-format-guard.js
- 擴 HAS_NEXT_RE 接受「下一步」
- 加 PICK_UI_MARKERS 偵測（Recommended / ⭐ / ⚠️ / 選項）
- 檢查邏輯：「下一步」段含 pipe table ≥ 3 行 AND pick UI marker → block

### 3. nova-brain tests/unit/architecture.test.js
- 守護 rule 新條款存在
- 守護 hook 新 regex 存在

## 驗收
- bun test tests/unit/architecture.test.js 全 pass
- hook 模擬輸入：含「## 下一步」+ 表格 + Recommended → block
- hook 模擬輸入：含「## 下一步」+ 純陳述「下一步：X」→ allow

## 反思 persist
reflections.jsonl entry：trigger_type=correction, 外部研究=[agent decision ownership, ReAct vs reflection patterns]
