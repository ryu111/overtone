# Wave 1 + Silent Regression 合併執行 spec

- **觸發**：/ask 使用者勾選 7 項（短期 4 + 中期 3）
- **日期**：2026-04-17
- **授權鏈**：
  - Wave 1 — Manager Round 8 採納（xd-1776385791431-r1im）
  - Silent regression 4 行動 — Manager Round 2 採納（xd-1776390507819-lcqe + xd-1776390660212-jys3）
  - Layer 4 S1 已閉環（d53f947 + 435ec58）

## 執行順序（P0 → P2）

### 短期（本週）— 4 項

| 優先 | 任務 | 深度 | 成本 | 狀態 |
|:----:|------|:----:|:----:|:----:|
| P0 | F1 reflection-resolver Stop hook B+6h debounce + nm 跳過 | D3 | 1 session | pending |
| P1 | Canary dispatch 機制 `hooks/modules/self-dispatch-canary.js` | D3 | 1 session | pending |
| P2 | arch test 守護 `paste-buffer -p` 全 repo | D2 | 30min | pending |
| P3 | 修 `wrapup.js` `ata/reflections.jsonl` 拼字 bug + A1 smoke run | D1/D0 | 20min | pending |

### 中期（本月）— 3 項

| 優先 | 任務 | 深度 | 成本 | 狀態 |
|:----:|------|:----:|:----:|:----:|
| M1 | `skills/regression-prevention/SKILL.md` 收 L1/L2b/L4 + test-locks-bug 案例 | D2 | 0.5 session | pending |
| M2 | fail-closed 模式稽核 + Manager view stale pattern 查 | D2 | 0.5 session | pending |
| M3 | nb `tmux.js` 反向同步 ns 5 步 pattern（加 C-a C-k + load-buffer） | D2 | 0.5 session | pending |

## 關鍵參考

- **F1 設計草圖**：見 `spec/討論/llm-wiki-nova-integration-round7.md` L41-55
- **Canary 設計草圖**：見 `spec/討論/silent-regression-prevention.md` L99-115
- **S1 已閉環參考**：nova commit `d53f947`（wrapup-guard.js Stop → spawnSelfCompactIfNeeded + ctx gate）
- **ns ec19e52 pattern**：5 步 tmux send（C-a C-k / load-buffer / paste-buffer -p / sleep 100ms / send-keys Enter）

## ctx 策略

ctx 當前 43%。每做完一個短期 P 段（P0 最大，預估 +8%）若 ctx > 55% 則 spawn self-compact 讓下 session 續跑。S1 ctx gate 已閉環 = Stop 時自動觸發 `spawnSelfCompactIfNeeded`，不用手動。

## 執行規則

- 每個 P 項完成後：git commit + push + TaskUpdate completed
- 跨 scope 需求：即時 dispatch（ns/nm/nc）不阻塞
- 若 ns 遺留議題（remote/actions.js 同 bug）被觸發再派，不 proactive
