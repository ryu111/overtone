# Autoresearch 全域迭代優化

## Phase 1 — 今天就能做（有資料、有指標）

| # | 目標 | 狀態 | Baseline | 最終 |
|:-:|------|:----:|:--------:|:----:|
| 1 | Guard regex FPR | done | 93.3% | — |
| 2 | Judge 語意評分 prompt | pending | — | — |
| 3 | 行為分類 prompt | pending | — | — |
| 4 | 信心公式常數 | pending | — | — |
| 5 | 確定性評分權重 | pending | — | — |
| 6 | 行為門檻值 | pending | — | — |

## Phase 2 — 需標記 ground truth（半天建好）

| # | 目標 | 狀態 |
|:-:|------|:----:|
| 7 | Session 摘要 prompt | pending |
| 8 | F 級改善建議 prompt | pending |
| 9 | 根因分析 prompt | pending |
| 10 | 工具推薦 prompt | pending |
| 11 | 決策 prompt | pending |

## Phase 3 — 需基礎設施

| # | 目標 | 狀態 |
|:-:|------|:----:|
| 12 | 28 個 Skill description | pending |
| 13 | 3 個 Agent prompt | pending |
| 14 | Gap 優先級權重 | pending |
| 15 | Heartbeat 間隔 | pending |

## 閉環檢查

每個迭代完成後：
- [ ] eval cases + run.js 提交
- [ ] results.tsv 記錄最終結果
- [ ] 如果改了 guards/scripts → 確認測試通過
- [ ] 如果改了 skill/agent → 閉環檢查（元件依賴）
- [ ] 更新本 tasks.md 狀態
