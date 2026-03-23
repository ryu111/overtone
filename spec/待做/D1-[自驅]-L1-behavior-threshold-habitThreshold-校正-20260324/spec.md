# [自驅] L1 behavior-threshold habitThreshold 校正

## 動機（Why）

現狀：behavior-threshold eval 94.4%（F1），habitThreshold=0.11 導致 2 個 FP（低信心行為誤判為建議候選）。根因：門檻值 0.11 太低，edit-agent 和 bash-edit 分別只有 conf=0.11 和 0.14 就觸發。方案：提高 habitThreshold 到 0.15-0.20，或在 cases 中將這 2 個標記為 expected negative。驗收：bun tests/evals/behavior-threshold/run.js metric >= 0.97

## 驗收條件

- [ ] <!-- 具體可驗證的條件 -->
