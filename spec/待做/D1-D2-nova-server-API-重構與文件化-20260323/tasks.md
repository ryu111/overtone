# 任務拆分

## 依賴分析

```
Phase 1（sequential）: T1 API 文件
Phase 2（sequential, 依賴 Phase 1）: T2 遷移 + T3 新增端點
Phase 3（sequential, 依賴 Phase 2）: T4 驗證 + T5 文件部署
```

## Phase 1：API 文件

### T1：產出 api-reference.md
- **執行者**：executor
- **檔案**：`~/.claude/docs/api-reference.md`
- **內容**：全部 37 個端點的完整參考（Method + Path + 分類 + Request/Response JSON schema + curl 範例 + 消費者標記）
- **完成條件**：文件涵蓋所有端點，每個端點有可執行的 curl 範例

## Phase 2：路由重構

### T2：遷移 6 個 handler 到 api-router.js + server.js 瘦身
- **執行者**：executor
- **修改**：
  - api-router.js：handleDashboardApi 新增 ctx 參數，遷入 hook-errors、daily-logs、graph、config、sessions、sessions/:id/events
  - server.js：建立 apiContext 物件，移除遷出的 handler，所有 /api/* 統一轉發
- **完成條件**：server.js <= 200 行；`bun test` 通過

### T3：新增缺失端點
- **執行者**：executor
- **修改**：api-router.js 新增 POST /api/heartbeat/toggle、POST /api/terminal/interrupt
- **完成條件**：curl 測試兩端點回傳正確；`bun test` 通過

## Phase 3：驗證 + 部署

### T4：整合驗證
- **執行者**：executor
- **動作**：
  - `bun test` 全數通過
  - curl 驗證 10 個代表性端點
  - PinchTab text 驗證 Dashboard 各 tab
- **完成條件**：0 fail、Dashboard 正常

### T5：文件部署
- **執行者**：executor
- **動作**：複製 api-reference.md 到 `~/projects/nova-control/docs/`
- **完成條件**：`cat ~/projects/nova-control/docs/api-reference.md` 可讀
