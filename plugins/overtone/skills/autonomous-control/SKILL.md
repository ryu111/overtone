---
name: autonomous-control
description: 自主控制知識域 — heartbeat daemon 跨 session 執行能力索引
user-invocable: false
---

# Autonomous Control 知識域

> 來源：Overtone 自主控制子系統

## 消費者

| Agent | 用途 |
|-------|------|
| architect | 設計自主執行流程時參考 heartbeat 和佇列機制 |
| debugger | 診斷自主執行失敗時查詢 spawner 防護和佇列狀態 |
| developer | 實作跨 session 任務時使用佇列 API 和 session spawner |
| tester | 驗證自主控制功能的行為規格 |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `./references/heartbeat.md` | Heartbeat daemon 使用指引：start/stop/status + 常駐模式 |
| 💡 `./references/queue-management.md` | 執行佇列管理：CLI 操作 + API 參考 + 生命週期 + 錯誤處理決策樹 |
| 💡 `./references/session-spawner.md` | Session Spawner：spawnSession API + 三層安全防護 + timeout 機制 |