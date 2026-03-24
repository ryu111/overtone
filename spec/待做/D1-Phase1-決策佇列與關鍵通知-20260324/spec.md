# Phase1-決策佇列與關鍵通知

## 動機（Why）

## Phase 1：決策佇列 + 關鍵時刻通知（最高優先）

### 子任務
1. pending-decisions.jsonl 格式定義 + 讀寫 helper（~/.claude/scripts/lib/decisions.js）
2. context-injector.js 加 injectPendingDecisions() — SessionStart 注入待決定事項
3. heartbeat.js 加決策寫入點 — D3+/失敗3次/指標下降 → 寫入 pending-decisions.jsonl
4. nova-server SSE 廣播 notification 事件類型（sd:done, sd:circuit-break, sd:decision-pending, test:regression）
5. Nova Control App iOS — handleSSEEvent 加 8 種通知觸發（見 spec/change/通知觸發表.md）
6. Nova Control App macOS — 加 UNUserNotificationCenter 支援

### 驗收
- pending-decisions.jsonl 可讀寫
- context-injector 注入待決定 → Claude 先處理佇列再回答
- iOS 收到 SSE 通知事件 → 彈 local notification
- macOS 收到 SSE 通知事件 → 彈系統通知

### 依賴
無（Phase 1 獨立）

### 預估
D2，2-3 sessions

## 驗收條件

- [ ] <!-- 具體可驗證的條件 -->
