# Phase3-多支線排程器

## 動機（Why）

## Phase 3：多支線排程器

### 子任務
1. heartbeat.json 加 branches[] 配置 — 6 條支線（品質守衛/基建/功能開發/Autoresearch/知識進化/L5產品）
2. heartbeat.js 從單迴圈改為排程器 — 每次 tick 選到期+最高優先的支線
3. branch-state.json — 各支線狀態（lastRun, consecutiveFails, cooldown）
4. 每條支線的 OODA prompt 模板 — buildBranchPrompt(branchName, snapshot)
5. 支線冷卻期 — 失敗後 2x interval 冷卻
6. 支線間互不阻塞 — A 失敗不影響 B

### 驗收
- heartbeat tick → 正確選擇到期支線
- 多支線輪替執行
- 單支線失敗後冷卻，其他支線正常
- bun test 全過

### 依賴
Phase 2 完成

### 預估
D2，3 sessions

## 驗收條件

- [ ] <!-- 具體可驗證的條件 -->
