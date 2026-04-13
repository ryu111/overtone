# cross-dispatch GET 疑似 destructive pop race

## 觀察
2026-04-13 本 session 在處理 dispatch 過程中連續 2 次收到通知但無法讀取：
- xd-1776088951626-xfoz: 通知到 → GET [] → `/api/cross-dispatch/status?id=xxx` 返回 Not Found
- xd-1776088972371-9aed: 通知到 → GET [] → content-length 0

兩次皆在 nova-brain session。

## 假設
`GET /api/cross-dispatch?target_cwd=...` 語意可能是 destructive pop：讀取後立即從 queue 移除。多 session 並行時會被其他 consumer 搶走，或 nova-server 內部 monitor 自己讀取後清空。

## 建議修法（Manager session）
1. GET 改為 peek 語意：返回 status=delivered 的 dispatch 而不從 queue 移除
2. 只有 POST /complete 才真正移除
3. 加 `consumed_by` 欄位追蹤誰讀取過

## 驗證
- 觸發 dispatch → 兩個 session 並行 curl → 兩個都能讀到同一 dispatch
- 一個 complete 後另一個再 curl 應不再出現

## Scope
nova-server repo（Manager 調度）— 不在 nova-brain scope 內，此 spec 為議題追蹤。
