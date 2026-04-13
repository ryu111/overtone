# g-tier-benchmark-compare-medium
生成時間: 2026-04-13T16:42:58.882Z
模型：31b / haiku / sonnet

## 對照表
| task | 31b | haiku | sonnet |
|------|:---:|:---:|:---:|
| med_01_multifile_api | ❌ 22.8 tok/s | ❌ - tok/s | ✅ 25.4 tok/s |
| med_02_naming_consistency | ✅ 23.7 tok/s | ✅ 31.4 tok/s | ✅ 6.8 tok/s |
| med_03_preserve_behavior | ✅ 23.1 tok/s | ✅ 46.1 tok/s | ✅ 3.8 tok/s |
| med_04_error_channel | ✅ 23.5 tok/s | ✅ 55.7 tok/s | ✅ 31.1 tok/s |
| med_05_config_read | ❌ 23.9 tok/s | ✅ 79.8 tok/s | ✅ 19.7 tok/s |
| med_06_hook_return_format | ✅ 23.9 tok/s | ✅ 26.1 tok/s | ✅ 6.1 tok/s |
| med_07_test_first | ✅ 24.0 tok/s | ✅ 41.1 tok/s | ✅ 3.7 tok/s |
| med_08_migration_shim | ✅ 24.2 tok/s | ✅ 55.5 tok/s | ✅ 17.8 tok/s |
| med_09_trace_import | ✅ 23.9 tok/s | ✅ 42.0 tok/s | ✅ 22.2 tok/s |
| med_10_locked_version | ❌ 23.8 tok/s | ✅ 83.9 tok/s | ❌ 19.1 tok/s |

## 總計
| model | pass | fail | pass% | avg tok/s |
|-------|-----:|-----:|------:|----------:|
| 31b | 7 | 3 | 70.0% | 23.67 |
| haiku | 9 | 1 | 90.0% | 51.29 |
| sonnet | 9 | 1 | 90.0% | 15.58 |
