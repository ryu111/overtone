# g-tier-benchmark-compare-easy
生成時間: 2026-04-13T16:24:08.647Z
模型：31b / haiku / sonnet

## 對照表
| task | 31b | haiku | sonnet |
|------|:---:|:---:|:---:|
| easy_01_simple_fn | ✅ 21.8 tok/s | ✅ 19.6 tok/s | ✅ 3.2 tok/s |
| easy_02_module | ❌ 24.1 tok/s | ❌ - tok/s | ✅ 12.2 tok/s |
| easy_03_refactor | ❌ 22.0 tok/s | ❌ 33.0 tok/s | ❌ 2.2 tok/s |
| easy_04_algo | ✅ 22.8 tok/s | ✅ 25.6 tok/s | ✅ 3.5 tok/s |
| easy_05_edit | ❌ 21.9 tok/s | ✅ 19.8 tok/s | ✅ 2.4 tok/s |
| easy_06_chunk | ✅ 23.7 tok/s | ✅ 54.1 tok/s | ✅ 50.4 tok/s |
| easy_07_raycast | ✅ 24.3 tok/s | ✅ 42.2 tok/s | ✅ 9.2 tok/s |
| easy_08_state | ✅ 24.3 tok/s | ✅ 27.5 tok/s | ✅ 17.7 tok/s |
| easy_09_fix_bug | ❌ 22.6 tok/s | ✅ 57.3 tok/s | ✅ 3.5 tok/s |
| easy_10_dayNight | ✅ 23.6 tok/s | ✅ 71.0 tok/s | ✅ 12.4 tok/s |

## 總計
| model | pass | fail | pass% | avg tok/s |
|-------|-----:|-----:|------:|----------:|
| 31b | 6 | 4 | 60.0% | 23.11 |
| haiku | 8 | 2 | 80.0% | 38.89 |
| sonnet | 9 | 1 | 90.0% | 11.66 |
