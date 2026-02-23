---
name: remote
description: 查看 Overtone Remote 連線狀態，管理 Telegram/Dashboard 遠端通知與控制。
disable-model-invocation: true
---

# Remote

Overtone Remote 讓你從外部平台監控和控制工作流。

## 已支援的 Adapter

| Adapter | 推送 | 控制 | 啟用方式 |
|---------|:----:|:----:|---------|
| **Dashboard** | SSE | REST API | 自動（隨 server 啟動） |
| **Telegram** | Bot API | 命令 | 設定 `TELEGRAM_BOT_TOKEN` |

## Dashboard 控制 API

```bash
# 查詢狀態
curl -X POST http://localhost:7777/api/sessions/{id}/control \
  -H 'Content-Type: application/json' \
  -d '{"command":"status"}'

# 停止 Loop
curl -X POST http://localhost:7777/api/sessions/{id}/control \
  -H 'Content-Type: application/json' \
  -d '{"command":"stop"}'

# 列出工作階段
curl -X POST http://localhost:7777/api/control \
  -H 'Content-Type: application/json' \
  -d '{"command":"sessions"}'
```

## Telegram 設定

1. 找 @BotFather 建立 Bot，取得 token
2. 設定環境變數：`TELEGRAM_BOT_TOKEN=your-token`
3. 可選：`TELEGRAM_CHAT_ID=your-chat-id`（不設定則在 Telegram 發 /start 自動學習）

### Telegram 命令

| 命令 | 說明 |
|------|------|
| `/start` | 註冊並開始接收通知 |
| `/status [id]` | 查看工作流狀態 |
| `/stop [id]` | 停止 Loop |
| `/sessions` | 列出所有工作階段 |
| `/help` | 顯示命令說明 |

省略 `[id]` 時自動使用最新的活躍 session。

## 推送事件

預設推送以下事件到 Telegram（避免洗頻）：
- `workflow:start` / `workflow:complete` / `workflow:abort`
- `agent:delegate` / `agent:complete` / `agent:error`
- `error:fatal`
- `session:start` / `session:end`

## 環境變數

| 變數 | 說明 | 預設 |
|------|------|------|
| `OVERTONE_PORT` | Dashboard 端口 | 7777 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token | （無則不啟用） |
| `TELEGRAM_CHAT_ID` | Telegram chat ID | （/start 自動學習） |

## 健康檢查

```bash
curl http://localhost:7777/health
# 回應包含 adapters 連線狀態
```
