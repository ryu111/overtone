# 知而不行 Phase 1 掃描摘要

- 掃描時間: 2026-04-15T11:00:14.652Z
- Rule files: 28
- MUST 條款總數: 175
- 輸出: `~/projects/nova-brain/spec/進行中/知而不行-Phase1-盤點.jsonl`

## Hook-able 初判分布

| 判定 | 數量 | 佔比 |
|---|---:|---:|
| y (可程式化) | 57 | 32.6% |
| maybe (需擴 hook / 狀態追蹤) | 108 | 61.7% |
| n (純語意判斷) | 10 | 5.7% |

## Top rule files (by MUST count)

| file | MUST 條款 |
|---|---:|
| `~/.claude/rules/品質/完成與閉環.md` | 11 |
| `~/.claude/rules/核心/深度路由.md` | 11 |
| `~/.claude/rules/協作/討論式派發.md` | 11 |
| `~/.claude/rules/品質/回饋與進化.md` | 10 |
| `~/.claude/rules/核心/失敗與修復.md` | 10 |
| `~/.claude/rules/環境/總結格式.md` | 10 |
| `~/.claude/rules/協作/跨專案協作.md` | 10 |
| `~/.claude/rules/元件/元件治理.md` | 10 |

## Phase 2/3 scope 預估

- **Phase 2 (歷史頻率 mining)**: 掃 `data/reflections.jsonl` + `/tmp/hook-errors.jsonl` 對 57 條 y 類關鍵字統計，預估 ~20 min（純 regex，無 LLM）
- **Phase 3 (候選 hard guard 升級)**: 從 y 類 + 違規頻率 ≥2 篩 top-5，每條預估 30-60 min（hook 實作 + unit test），合計 ~3-5h，建議再拆 3-5 子 dispatch

## 後續建議

- Manager 讀 JSONL 先抽樣 10 條驗證啟發式準確度，有偏差再迭代 classify 邏輯
- y 類比例若 >40%, Phase 3 可挑 top-3 高頻優先；若 <20% 需重新評估 hook 化 ROI
