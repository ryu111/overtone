# g-tier-benchmark-haiku-hard
生成時間: 2026-04-13T16:47:40.663Z

## 參數
- Model: haiku
- Level: hard
- Sample count: 5

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| hard | 5 | 0 | 100.0% | 86.69 | 80.38 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | hard_01_rule_conflict | ✅ | 2009 | 24993 | 80.38 |  |
| 2 | hard_02_bdd_chain | ✅ | 910 | 14226 | 63.97 |  |
| 3 | hard_03_type_design | ✅ | 3526 | 28039 | 125.75 |  |
| 4 | hard_04_arch_tradeoff | ✅ | 1398 | 18023 | 77.57 |  |
| 5 | hard_05_root_cause | ✅ | 2590 | 30195 | 85.78 |  |
