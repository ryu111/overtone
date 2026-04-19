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
| P1 | Canary dispatch 機制 `hooks/modules/self-dispatch-canary.js` | D3 | 1 session | ✅ done（既存；iter 1 驗證鏈路健康） |
| P2 | arch test 守護 `paste-buffer -p` 全 repo | D2 | 30min | ✅ done iter 3-6（三軸閉環 vacuity/coverage/redundancy + exempt-as-constant drift detection；578 pass） |
| P3 | 修 `wrapup.js` `ata/reflections.jsonl` 拼字 bug + A1 smoke run | D1/D0 | 20min | ✅ iter 2 修 reflection-persist.js cwd `/data` normalize（commit 1a2d723）；P3 原描述拼字 bug 實際是 cwd normalize 缺失，根因已處理；A1 smoke run 下輪再補 |

### 中期（本月）— 3 項

| 優先 | 任務 | 深度 | 成本 | 狀態 |
|:----:|------|:----:|:----:|:----:|
| M1 | `skills/regression-prevention/SKILL.md` 收 L1/L2b/L4 + test-locks-bug 案例 | D2 | 0.5 session | ✅ done iter 7（184 行；+ 依賴 4 檔 external-ref 方法論；skills/README.md 索引 33→34） |
| M2 | fail-closed 模式稽核 + Manager view stale pattern 查 | D2 | 0.5 session | pending |
| M3 | nb `tmux.js` 反向同步 ns 5 步 pattern（加 C-a C-k + load-buffer） | D2 | 0.5 session | pending |

## 進度盤點（2026-04-19 iter 9）

- **已完**：P1（既存驗證）/ P2（iter 3-6）/ P3 根因（iter 2）/ M1（iter 7）= **4/7**
- **剩餘**：P0 F1（D3 最大項）+ M2 fail-closed 稽核（D2）+ M3 tmux 反向同步（D2）
- **adjacent 外部研究產出**：7 檔 external-ref 形成 arch test quality framework + event-sourcing + skill methodology 業界對齊

**建議 Wave1 後續**：P0 F1 最大不急可排 iter 10+ 單 session；M2 fail-closed 稽核 ROI 中等；M3 tmux 反向同步屬 ns→nb 反向知識同步，若 ns `ec19e52` 5 步仍是 canonical 該做。

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
