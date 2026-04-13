# g-tier-benchmark-haiku-medium
生成時間: 2026-04-13T16:41:12.947Z

## 參數
- Model: haiku
- Level: medium
- Sample count: 10

## 結果總覽
| set | pass | fail | pass% | avg tok/s | median tok/s |
|-----|-----:|-----:|------:|----------:|-------------:|
| medium | 9 | 1 | 90.0% | 51.29 | 46.08 |

## 逐 task
| # | id | pass | tok | elapsed(ms) | tok/s | failure reason |
|---|----|:----:|----:|------------:|------:|----------------|
| 1 | med_01_multifile_api | ❌ | 0 | 10980 | - | claude exit 1:  |
| 2 | med_02_naming_consistency | ✅ | 230 | 7329 | 31.38 |  |
| 3 | med_03_preserve_behavior | ✅ | 242 | 5252 | 46.08 |  |
| 4 | med_04_error_channel | ✅ | 582 | 10440 | 55.75 |  |
| 5 | med_05_config_read | ✅ | 585 | 7335 | 79.75 |  |
| 6 | med_06_hook_return_format | ✅ | 177 | 6791 | 26.06 |  |
| 7 | med_07_test_first | ✅ | 325 | 7902 | 41.13 |  |
| 8 | med_08_migration_shim | ✅ | 916 | 16504 | 55.50 |  |
| 9 | med_09_trace_import | ✅ | 386 | 9181 | 42.04 |  |
| 10 | med_10_locked_version | ✅ | 524 | 6247 | 83.88 |  |
