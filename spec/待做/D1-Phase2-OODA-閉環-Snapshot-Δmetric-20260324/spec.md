# Phase2-OODA-閉環-Snapshot-Δmetric

## 動機（Why）

## Phase 2：OODA 閉環基礎（Snapshot + Δmetric + 動態 Prompt）

### 子任務
1. Pre-task snapshot 收集 — bun test 結果 + scores.jsonl 最近平均 + error count → /tmp/pre-task-snapshot.json
2. Post-task snapshot 收集 — 同上結構 → /tmp/post-task-snapshot.json
3. Δmetric 計算 + reward signal → self-drive-history.jsonl
4. buildSelfDrivePrompt() 動態化 — 注入上輪結果摘要、品質趨勢、避免清單
5. evaluate() 函式 — reward > 0.3 成功 / < -0.1 回歸標記

### 驗收
- 每輪自驅前後有 snapshot
- history.jsonl 記錄 Δmetric + reward
- Prompt 包含上輪結果和趨勢方向

### 依賴
Phase 1 完成

### 預估
D2，2 sessions

## 驗收條件

- [ ] <!-- 具體可驗證的條件 -->
