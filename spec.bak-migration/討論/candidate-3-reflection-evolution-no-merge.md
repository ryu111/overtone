---
status: decision-documented
dispatch_id: xd-gykt iter 4
created: 2026-04-18
author: nova-brain (scope owner 自決)
verdict: close (C 不合併 + see_also 補齊)
---

# 候選 3「反思與進化」合併判斷 — C 不合併

## 候選範圍

- `rules/核心/自驅反思.md`（22 行 + see_also）— 反思四步協議 + persistence 規範
- `rules/品質/回饋與進化.md`（17 行 + see_also）— 反思三問 + 具體行動 + dispatch 監控

## 決議：C 不合併

### 三層理由

1. **跨分類風險**：兩 rule 分別 anchor 不同分類語意
   - 核心（behavior rule）= 行為規範「必須做」
   - 品質（quality rule）= 產出標準「做到什麼程度」
   - 合併必破壞 5-分類 SSoT（協作/核心/品質/元件/環境）清晰度

2. **dv8g Q1.C 先例**（e13b66a 2026-04-18）：
   - 上 session 確立「cross-cutting concern 先 soft grouping 不新建 directory/頂層分類」原則
   - 自驅叢集 15 檔散 5 scope 採 soft grouping + NOT 段 + ADR-003 §8.5 映射表
   - 本候選 3 同精神 — 不合併，用 see_also cross-reference

3. **結構性重複 rule 治理梯階已備**（e829ce4）：
   - rules/核心/失敗與修復.md 第 3 次升級條款為「新建或擴充 ADR 定義 canonical 邊界」
   - 目前本候選 3 仍在第 1 次（建 cross-reference index）階段
   - 未來若出現第 3 個反思相關 rule 散在不同分類才升級到 ADR，非「有關聯就合併」

## 實施：see_also 補齊（~5min）

iter 4 實作動作：

```bash
# rules/核心/自驅反思.md 末尾加
> **See also**: [../品質/回饋與進化.md](../品質/回饋與進化.md) — 同自驅叢集 (ADR-003 §8.5 learn 能力)

# rules/品質/回饋與進化.md 末尾加
> **See also**: [../核心/自驅反思.md](../核心/自驅反思.md) — 同自驅叢集 (ADR-003 §8.5 learn 能力)
```

兩 rule 透過雙向 md-link 互見，Obsidian Graph view 可視化 learn 能力叢集。

## 驗收

- 兩 rule 末尾各加 1 行 `> **See also**: ...` md-link
- architecture.test.js 無需新測試（hub cascade 守護已涵蓋 md-link）
- 本 session commit 後 Manager 自動可見雙向 link

## Manager Round 3 請求

- **ack** C 不合併 + see_also 補齊方案
- 若有反駁要求強合併請明示反對 3 層理由的哪一條

## Persistence

- 源 dispatch：xd-gykt Round 2 Manager ack Q3 C 不合併 + see_also ~5min 並行
- 本檔為 scope owner 自決執行紀錄（Manager 已 ack 本方向不需再討論輪）
- verdict=close — 若 Manager 有反駁再開 Round 4
