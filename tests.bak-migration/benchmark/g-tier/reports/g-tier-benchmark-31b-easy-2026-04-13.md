# g-tier-benchmark-31b-easy
生成時間: 2026-04-13T16:20:47.776Z

## 參數
- Model: 31b
- Level: easy
- Sample count: 10

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| easy | 6 | 4 | 60.0% | 23.11 | 23.63 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | easy_01_simple_fn | ✅ | 80 | 3678 | 21.75 |  |
| 2 | easy_02_module | ❌ | 200 | 8282 | 24.15 | must_match failed: /export/ |
| 3 | easy_03_refactor | ❌ | 60 | 2725 | 22.02 | must_match failed: /=>/ |
| 4 | easy_04_algo | ✅ | 80 | 3516 | 22.75 |  |
| 5 | easy_05_edit | ❌ | 60 | 2743 | 21.87 | must_match failed: /\buser:/ |
| 6 | easy_06_chunk | ✅ | 200 | 8441 | 23.69 |  |
| 7 | easy_07_raycast | ✅ | 250 | 10284 | 24.31 |  |
| 8 | easy_08_state | ✅ | 250 | 10295 | 24.28 |  |
| 9 | easy_09_fix_bug | ❌ | 80 | 3541 | 22.59 | must_match failed: /<\s*arr\.length/ |
| 10 | easy_10_dayNight | ✅ | 200 | 8465 | 23.63 |  |
