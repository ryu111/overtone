# g-tier-benchmark-sonnet-easy
生成時間: 2026-04-13T16:24:08.646Z

## 參數
- Model: sonnet
- Level: easy
- Sample count: 10

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| easy | 9 | 1 | 90.0% | 11.66 | 9.21 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | easy_01_simple_fn | ✅ | 21 | 6565 | 3.20 |  |
| 2 | easy_02_module | ✅ | 107 | 8754 | 12.22 |  |
| 3 | easy_03_refactor | ❌ | 17 | 7697 | 2.21 | must_not_match violated: /\bvar\s+double/ |
| 4 | easy_04_algo | ✅ | 35 | 10089 | 3.47 |  |
| 5 | easy_05_edit | ✅ | 21 | 8915 | 2.36 |  |
| 6 | easy_06_chunk | ✅ | 562 | 11157 | 50.37 |  |
| 7 | easy_07_raycast | ✅ | 90 | 9767 | 9.21 |  |
| 8 | easy_08_state | ✅ | 92 | 5197 | 17.70 |  |
| 9 | easy_09_fix_bug | ✅ | 32 | 9095 | 3.52 |  |
| 10 | easy_10_dayNight | ✅ | 125 | 10105 | 12.37 |  |
