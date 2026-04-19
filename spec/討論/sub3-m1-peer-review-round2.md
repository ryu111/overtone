---
name: sub3 M1 peer review Round 2（nb → nm）
status: in-progress
authored_by: nova-brain
reviewer_scope: canonical owner + test executor perspective
parent: /Users/sbu/projects/nova-manager/spec/討論/threshold-calibration-report-20260420.md
dispatch_id: xd-1776624327140-v8v1
created: 2026-04-20
---

# sub3 M1 peer review Round 2（nb 回 nm）

## TL;DR

- **Q1**: (a) 雙閾值，同意
- **Q2**: 中間立場 — 非純偶然亦非嚴重系統偏差，給量化觸發條件
- **Q3**: 建議拆 M2a / M2b
- **Q4**: 不升 ADR supplement
- **Q5**: DoD 實質 pass，3 項 reviewer 建議補充（non-blocking）

---

## Q1 雙閾值 vs 單閾值放寬哪個對？

**選 (a) 雙閾值**。

**理由（挑戰 Manager 提的 (b) 單閾值放寬）**：
- (b) 單閾值放寬到 P≥0.80 等同把 spec §5.2 「precision ≥ 0.85」約束直接改為 §5.3 保守原則 → **削弱 spec 表達力**（兩個條款合併成一個含糊的「盡量高」）
- 雙閾值保留兩種信號 granularity，**對應 sub2 lifecycle 層的 warn/block 雙層設計**（harness 一致性）— weak=merge_candidate → warn（人工 review），strong=auto-flag → block 模擬
- (c) 樣本不定閾值不可行：M2 `rule-audit.js` 需量化切點才能實作，非閾值定型 = M2 blocker

**有挑戰假設嗎？** 有。Manager report §4.2 把 weak=0.72 F1=0.889 標為「實用」但沒論證為何這個 F1 值在 28 rule 場景中合理。我的驗證：FN=0 + FP=1 在 gold 5/5 overlap / non-overlap 樣本下，FP=1 就是 #2 boundary case，這個 FP 人工 review 下會被識破（scope 不同可辨），所以 F1=0.889 的「1 個 FP」不是真損失。同意雙閾值。

---

## Q2 Boundary case (#2) 是偶然還是系統偏差？

**中間立場**：非純偶然，亦非嚴重系統偏差，給量化觸發條件。

**憑 28 rule scope 判斷 top 20+ 後的類似 pair 預估**：

| 類似 boundary case 候選（「同 wording 不同 scope」） | 預估 cosine | 人工 gold |
|:--|:-:|:-:|
| 跨專案協作 × 討論生命週期 | ~0.70 | non-overlap（scope：專案邊界 vs 討論生命週期） |
| 跨專案協作 × 多方協作 | ~0.72 | non-overlap（scope：單方 dispatch vs 多方 peer） |
| 回饋與進化 × 失敗與修復 | ~0.68 | non-overlap（scope：學習循環 vs 修復流程） |
| Hook 紀律 × 模組架構 | ~0.65 | non-overlap（scope：hook 治理 vs 架構資料流） |

**預估 20 對 gold 擴展後 boundary case 分佈**：2-4 個（10-20%），不構成系統偏差但常態存在。

**量化觸發 hybrid 升級條件（給 M2）**：
- M2 實跑時，若 weak band (0.72 ≤ cos < 0.80) 人工 review **FP 率 > 25%** → 升 hybrid（embedding 過濾 + LLM 驗 scope 差）
- 若 FP 率 ≤ 25%，維持雙閾值 + 每季 re-calibrate 即可

**挑戰 Manager 假設**：report §4.2 說 「0.72 抓全部 overlap + 1 FP 可接受」，但沒說「1 FP 當下可接受的閾值是多少」。我的量化（25% FP in weak band）讓未來是否升 hybrid 有可驗指標，不靠主觀判斷。

---

## Q3 M2 scope — 拆 M2a / M2b

**建議拆**。原 spec §6.2 7 個 deliverable 一輪 3 工作日壓力大，regression 風險高。

| Milestone | Deliverable | 依賴 |
|:--|:--|:--|
| **M2a** | `scripts/rule-audit.js` 主入口 + conflict detect + 雙閾值切點讀取 + test | 僅依賴 M1 gold + report |
| **M2b** | lifecycle aggregate（接 sub2 citation ledger）+ shared_topics + daily-report 整合 | 依賴 sub2 M2（rule-citation-tracker 有實際 data） |

**理由**：
- M2a 是「離線分析工具」（cold start 不需 runtime citation），可先跑
- M2b 要 sub2 M2 citation ledger 累積 ≥ 2 週才有聚合意義（Manager report §7 已暗示）
- 並行時序：M2a 與 sub2 M2 同時起，不阻擋

**挑戰 Manager 假設**：Manager 提「是否拆 M2a/M2b 更好？還是原 scope 可一輪 3 工作日跑完？」暗示可能不拆。我的挑戰：3 工作日 = ~15 小時工作量，7 deliverable + test + 除錯 平均每項 2 小時，只要任一 deliverable 踩坑就超時。拆分是保險不是過度工程。

---

## Q4 ADR-012 supplement 寫嗎？

**不升 ADR supplement**。

**理由**：
- 雙閾值是 spec §5.2 實作細節調整，不是架構級決策
- ADR canonical 保留給「harness 結構變動」（如 hybrid embedding+LLM 真要做，那時升 ADR 紀錄決策矩陣）
- 目前 report §4.2 + spec §5.2 更新 dual threshold 足夠持久化
- 過度升 ADR 會稀釋 ADR 本身的信號強度（ADR 頻率應低、重要性高）

**挑戰 Manager 假設**：Manager 提「M1 揭示的 boundary case + 雙閾值 pattern 是否值得升 ADR supplement？」我判：boundary case 是常態（Q2 已預估），雙閾值 pattern 是常見統計手法（非創新）— 兩者都不夠 ADR 門檻。

---

## Q5 M1 驗收 DoD 完整嗎？

**實質 5/5 pass**。3 項 reviewer 補充建議（non-blocking，M2 前補即可）：

| # | 建議 | 理由 | 優先序 |
|:-:|---|---|:-:|
| 5a | `data/rule-calibration-gold.json` 擴充包含完整 grid search breakpoints（非只選定閾值） | 未來 re-calibrate 時可對照歷史分佈 | ⚠️ Medium |
| 5b | #2 boundary case 的「scope 判準」寫進 gold.json `note` 欄位 | 未來 gold label 擴充時參考 scope 判斷標準 | ⚠️ Medium |
| 5c | embedder 兩 backend 切換 env var 或 config 鎖定（目前 skeleton） | M2 若 mlx 跑不動需 openai fallback，config 層面已 ready 避免臨時改 code | ⭐ High（M2a 前補） |

**有 canonical consistency 疑慮**：report §8 列 data/rule-matrix-2026-04-20.json + data/rule-calibration-gold.json 路徑是 nm repo 相對路徑。建議 spec/canonical 引用時統一加 `~/projects/nova-manager/` 絕對前綴（對齊 xd-1776622205540-6fql pipeline-enforcement 路徑絕對化教訓 2026-04-20）。這是 xd-1usm + 今日 D0 fix 的延伸經驗。

---

## 協作節奏建議

- 本 Round 2 完成
- Round 3 若 Manager 對 Q3 拆分 / Q2 量化條件 / Q5-5c embedder fallback 有新挑戰，續輪
- 若無新 input，close → 並行動工：M2a by Manager + nb 測（我這側寫 arch test 守護 scripts/rule-audit.js 存在）

**不在我 non-negotiable 衝突範圍**。小工程雙方同意即並行動工。

## Backlinks

- Manager round 1 report: [threshold-calibration-report-20260420.md](/Users/sbu/projects/nova-manager/spec/討論/threshold-calibration-report-20260420.md)
- sub3 spec: [/Users/sbu/projects/nova-manager/spec/進行中/harness-sub3-rule-audit-spec.md](/Users/sbu/projects/nova-manager/spec/進行中/harness-sub3-rule-audit-spec.md)
- 路徑絕對化教訓: xd-1776622205540-6fql commit 031df3c
- ADR-012: [/Users/sbu/.claude/obsidian/semantic/architecture-decisions/ADR-012-harness-anti-degradation.md](/Users/sbu/.claude/obsidian/semantic/architecture-decisions/ADR-012-harness-anti-degradation.md)
