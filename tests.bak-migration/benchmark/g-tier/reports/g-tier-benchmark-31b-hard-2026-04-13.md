# g-tier-benchmark-31b-hard
生成時間: 2026-04-13T16:45:45.186Z

## 參數
- Model: 31b
- Level: hard
- Sample count: 5

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| hard | 3 | 2 | 60.0% | 24.06 | 24.08 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | hard_01_rule_conflict | ✅ | 800 | 33384 | 23.96 |  |
| 2 | hard_02_bdd_chain | ✅ | 600 | 24863 | 24.13 |  |
| 3 | hard_03_type_design | ✅ | 800 | 33224 | 24.08 |  |
| 4 | hard_04_arch_tradeoff | ❌ | 1000 | 41462 | 24.12 | must_match failed: /推薦\|建議/ |
| 5 | hard_05_root_cause | ❌ | 800 | 33343 | 23.99 | must_match failed: /根因\|root/ |
