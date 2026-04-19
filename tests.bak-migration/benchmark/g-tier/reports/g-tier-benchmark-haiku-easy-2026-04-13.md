# g-tier-benchmark-haiku-easy
生成時間: 2026-04-13T16:22:41.303Z

## 參數
- Model: haiku
- Level: easy
- Sample count: 10

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| easy | 8 | 2 | 80.0% | 38.89 | 33.00 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | easy_01_simple_fn | ✅ | 276 | 14063 | 19.63 |  |
| 2 | easy_02_module | ❌ | 0 | 14856 | - | claude exit 1:  |
| 3 | easy_03_refactor | ❌ | 240 | 7273 | 33.00 | must_not_match violated: /\bvar\s+double/ |
| 4 | easy_04_algo | ✅ | 240 | 9373 | 25.61 |  |
| 5 | easy_05_edit | ✅ | 193 | 9731 | 19.83 |  |
| 6 | easy_06_chunk | ✅ | 777 | 14372 | 54.06 |  |
| 7 | easy_07_raycast | ✅ | 484 | 11461 | 42.23 |  |
| 8 | easy_08_state | ✅ | 230 | 8377 | 27.46 |  |
| 9 | easy_09_fix_bug | ✅ | 536 | 9361 | 57.26 |  |
| 10 | easy_10_dayNight | ✅ | 1040 | 14657 | 70.96 |  |
