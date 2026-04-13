# g-tier-benchmark-sonnet-medium
生成時間: 2026-04-13T16:42:58.882Z

## 參數
- Model: sonnet
- Level: medium
- Sample count: 10

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| medium | 9 | 1 | 90.0% | 15.58 | 19.11 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | med_01_multifile_api | ✅ | 266 | 10466 | 25.42 |  |
| 2 | med_02_naming_consistency | ✅ | 66 | 9733 | 6.78 |  |
| 3 | med_03_preserve_behavior | ✅ | 34 | 8929 | 3.81 |  |
| 4 | med_04_error_channel | ✅ | 411 | 13211 | 31.11 |  |
| 5 | med_05_config_read | ✅ | 190 | 9627 | 19.74 |  |
| 6 | med_06_hook_return_format | ✅ | 56 | 9217 | 6.08 |  |
| 7 | med_07_test_first | ✅ | 33 | 8855 | 3.73 |  |
| 8 | med_08_migration_shim | ✅ | 249 | 13977 | 17.81 |  |
| 9 | med_09_trace_import | ✅ | 182 | 8206 | 22.18 |  |
| 10 | med_10_locked_version | ❌ | 262 | 13713 | 19.11 | must_not_match violated: /useTransition/ |
