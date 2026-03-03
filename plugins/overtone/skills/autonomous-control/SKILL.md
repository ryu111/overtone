---
name: autonomous-control
description: 自主控制知識域 — heartbeat daemon 跨 session 執行能力索引
user-invocable: false
---

# Autonomous Control 知識域

心跳引擎（Heartbeat Daemon）的操作指引與 headless 環境行為規範。跨 session 自主執行能力的集中索引。

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 實作 heartbeat 相關功能、呼叫 session-spawner API |
| architect | 設計自主執行架構、評估佇列策略 |
| tester | 測試 heartbeat 行為、驗證 polling 邏輯 |
| debugger | 診斷 daemon 相關問題、追蹤 session 失敗原因 |

## Reference 索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/autonomous-control/references/heartbeat.md` | heartbeat CLI 使用方式、session-spawner API、headless 模式注意事項（AskUserQuestion 不可用、Telegram 通知替代螢幕、安全邊界） |