# Proposal：websocket-realtime（P3.5 WebSocket 優先）

## 背景

Overtone Phase 3 的閉環交付模型要求每個 P3.x 交付包含：腳本（能力）+ Reference（知識）+ SKILL.md 索引更新 + 測試。

本次需求針對 P3.5「聽說能力」中的 WebSocket 子項，在 P3.4（動得了）之前提前交付，為 Phase 4 交易場景（即時行情接收）鋪路。

## 問題陳述

- Agent 目前沒有能力建立 WebSocket 連線
- Phase 4 最終驗收場景：「研究幣安 API，WebSocket 接收即時價格」需要此能力
- `skills/os-control/SKILL.md` 的 `realtime.md` 條目目前標記 P3.4（尚未建立）

## 解決方案

新增 `plugins/overtone/scripts/os/websocket.js` — Bun 原生 WebSocket client CLI wrapper，讓 agent 透過 Bash tool 執行結構化的 WebSocket 操作。

同步建立 `skills/os-control/references/realtime.md` 參考文件，更新 SKILL.md 索引。

## 功能需求

### 1. websocket.js CLI（腳本層）

三個子命令，全部輸出 JSON（agent 可 parse）：

| 子命令 | 功能 | 逾時設計 |
|--------|------|---------|
| `connect <url>` | 建立連線，接收直到斷線 | 預設 30 秒 |
| `send <url> <message>` | 連線 → 發訊息 → 等待回應 → 斷線 | 預設 10 秒 |
| `listen <url> [--duration <ms>]` | 監聽指定時間的訊息流 | 預設 5000ms |

錯誤碼（統一模式，與 process.js/clipboard.js 一致）：
- `INVALID_ARGUMENT`：URL 或參數格式不合法
- `CONNECTION_FAILED`：WebSocket 連線失敗
- `TIMEOUT`：等待超時
- `SEND_FAILED`：訊息發送失敗

### 2. realtime.md（知識層）

`skills/os-control/references/realtime.md`：
- WebSocket 適用場景說明
- 三個子命令的 CLI 範例
- 輸出格式說明（agent 解析指引）
- 常見場景（幣安行情、IoT 訊號、即時通知）

### 3. SKILL.md 索引更新

更新 `skills/os-control/SKILL.md` 中 `realtime.md` 條目：
- 狀態從空白改為 P3.5 ✅
- 加入「實作即時通訊 → 讀取 realtime.md」的按需讀取指引（已有佔位符）

### 4. 測試

`tests/unit/websocket.test.js`：
- 依賴注入模式（`_deps = { WebSocket }` 供測試替換，與 Bun 原生 WebSocket 解耦）
- 覆蓋：正常連線、訊息接收、逾時處理、無效 URL、連線失敗

## 不做

- TTS/STT（延後到後續迭代）
- Guard 擴充（pre-bash-guard.js 已覆蓋 WebSocket URL 的危險模式偵測不需額外規則）
- 進階功能：重連邏輯、訊息佇列、Binary frame（Phase 4 視需求再加）

## 依賴與前提

- Bun 原生 WebSocket API（無需額外套件）
- 現有 `scripts/os/` 模式（process.js / clipboard.js 為範本）
- 現有 `skills/os-control/SKILL.md` 已有 `realtime.md` 的佔位索引

## 成功標準

1. `bun plugins/overtone/scripts/os/websocket.js connect wss://echo.websocket.org` 輸出 JSON 訊息流
2. `bun plugins/overtone/scripts/os/websocket.js send wss://echo.websocket.org '{"test":true}'` 回傳 JSON 含 response
3. 測試全部通過（含 mock WebSocket 的逾時/失敗情境）
4. SKILL.md 正確索引 realtime.md
