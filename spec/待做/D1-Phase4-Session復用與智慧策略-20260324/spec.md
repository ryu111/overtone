# Phase4-Session復用與智慧策略

## 動機（Why）

## Phase 4：Session 復用 + 信心路由 + 任務優先級

### 子任務
1. 空閒 session 偵測 — findOrCreateSession 優先復用無人使用的 session
2. 信心路由表 — 任務類型 → 信心閾值（D0-D4、Skill修改、L5決策等）
3. pending-decision TTL + auto_resolve — low 3天/medium 5天/high 永不自動
4. 佇列去重 + 上限管理 — 最多 20 筆，超過時最舊 low auto_resolve
5. 任務優先級排序 — 影響度 40% + 歷史成功率 25% + 依賴性 20% + 新鮮度 15%
6. Telegram 推播整合 — high/critical 即時推播（via tg-notify.js）

### 驗收
- 有空閒 session → 復用（不開新 tab）
- D3 任務自動寫入 pending-decision
- TTL 過期 → auto_resolve
- 優先級排序正確

### 依賴
Phase 3 完成

### 預估
D2，2-3 sessions

## 驗收條件

- [ ] <!-- 具體可驗證的條件 -->
