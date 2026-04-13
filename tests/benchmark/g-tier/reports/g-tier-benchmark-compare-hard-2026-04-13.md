# g-tier-benchmark-compare-hard
生成時間: 2026-04-13T16:50:23.944Z
模型：31b / haiku / sonnet

## 對照表
| task | 31b | haiku | sonnet |
|------|:---:|:---:|:---:|
| hard_01_rule_conflict | ✅ 24.0 tok/s | ✅ 80.4 tok/s | ✅ 51.4 tok/s |
| hard_02_bdd_chain | ✅ 24.1 tok/s | ✅ 64.0 tok/s | ✅ 36.6 tok/s |
| hard_03_type_design | ✅ 24.1 tok/s | ✅ 125.8 tok/s | ❌ 51.7 tok/s |
| hard_04_arch_tradeoff | ❌ 24.1 tok/s | ✅ 77.6 tok/s | ✅ 42.8 tok/s |
| hard_05_root_cause | ❌ 24.0 tok/s | ✅ 85.8 tok/s | ❌ - tok/s |

## 總計
| model | pass | fail | pass% | avg tok/s |
|-------|-----:|-----:|------:|----------:|
| 31b | 3 | 2 | 60.0% | 24.06 |
| haiku | 5 | 0 | 100.0% | 86.69 |
| sonnet | 3 | 2 | 60.0% | 45.62 |
