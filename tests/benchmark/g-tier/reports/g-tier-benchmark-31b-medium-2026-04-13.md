# g-tier-benchmark-31b-medium
生成時間: 2026-04-13T16:39:44.985Z

## 參數
- Model: 31b
- Level: medium
- Sample count: 10

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| medium | 7 | 3 | 70.0% | 23.67 | 23.91 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | med_01_multifile_api | ❌ | 400 | 17578 | 22.76 | must_not_match violated: /interface\s+User\s*\{/ |
| 2 | med_02_naming_consistency | ✅ | 200 | 8451 | 23.67 |  |
| 3 | med_03_preserve_behavior | ✅ | 200 | 8663 | 23.09 |  |
| 4 | med_04_error_channel | ✅ | 250 | 10660 | 23.45 |  |
| 5 | med_05_config_read | ❌ | 250 | 10457 | 23.91 | must_not_match violated: /http://localhost/ |
| 6 | med_06_hook_return_format | ✅ | 250 | 10455 | 23.91 |  |
| 7 | med_07_test_first | ✅ | 200 | 8322 | 24.03 |  |
| 8 | med_08_migration_shim | ✅ | 250 | 10324 | 24.22 |  |
| 9 | med_09_trace_import | ✅ | 276 | 11541 | 23.91 |  |
| 10 | med_10_locked_version | ❌ | 250 | 10504 | 23.80 | must_not_match violated: /useTransition/ |
