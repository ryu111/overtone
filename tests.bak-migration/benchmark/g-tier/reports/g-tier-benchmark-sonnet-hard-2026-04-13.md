# g-tier-benchmark-sonnet-hard
生成時間: 2026-04-13T16:50:23.944Z

## 參數
- Model: sonnet
- Level: hard
- Sample count: 5

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| hard | 3 | 2 | 60.0% | 45.62 | 51.40 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | hard_01_rule_conflict | ✅ | 1958 | 38093 | 51.40 |  |
| 2 | hard_02_bdd_chain | ✅ | 615 | 16789 | 36.63 |  |
| 3 | hard_03_type_design | ❌ | 1432 | 27712 | 51.67 | must_match failed: /'draft'\|draft:/ |
| 4 | hard_04_arch_tradeoff | ✅ | 871 | 20369 | 42.76 |  |
| 5 | hard_05_root_cause | ❌ | 0 | 60318 | - | claude exit 143:  |
