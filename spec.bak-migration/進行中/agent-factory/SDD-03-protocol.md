# SDD-03 Cross-Dispatch Protocol §8 Staging 章節擴充

> **Status**: Draft (Round 4 initial canonical)
> **Owner (draft)**: nb（protocol owner）
> **Target file**: `~/.claude/docs/protocols/cross-dispatch-protocol.md` 加 §8（staging discipline index）+ §9（event log integration）
> **Dependency**: SDD-01 階段紀律

## 1. 目的

既有 cross-dispatch protocol 有 §1-§7（含 event types canonical）但**缺 staging 紀律入口**。各方改 canonical 沒有統一分類語言，導致 v0.5 多次 §7 擴充搶先 commit。本 SDD 提議加兩段：

- **§8 Staging Discipline Index** — cross-dispatch 事件自身的階段分類 + 指向 SDD-01
- **§9 Event Log Integration** — cross-dispatch 與 Gap B event log 的關係定義

## 2. §8 Staging Discipline Index (new)

### 2.1 Dispatch 自身的階段分類

cross-dispatch 行為變更（API schema / event type / 路由邏輯）的改動**本身**適用六類紀律：

| 改動類型 | 預設分類 | 例 |
|---|---|---|
| 加新 event type | 🔵 Contract-only | v0.5 `hook.blocked` / `hook.reviewer_verdict` |
| 加 payload optional field | 🔵 Contract-only | `dispatch.completed` 加 source_cwd/target_cwd |
| 改 payload required field | 🔴 Swap（需 reverse migration） | 罕見，v0.5 未發生 |
| 加 API endpoint | 🟢 Additive | 新 `/api/events` |
| 加 priority enum 值 | 🔵 Contract-only | urgent/normal/low 之外 |
| 改 reviewer 驗收邏輯 | 🟡 Parallel → 🔴 Swap | 需 shadow 比對新舊 verdict |

### 2.2 引用 SDD-01

本協議的 staging 紀律 source of truth 在 **SDD-01 階段紀律**（最終落地 `rules/協作/階段紀律.md`）。本章僅列 cross-dispatch 特定對應。

### 2.3 Canonical 路徑守護

以下路徑受 SDD-01 §5 canonical 白名單守：
- `~/.claude/config/event-types/*.json`
- `~/.claude/config/hook-block-reason-codes.json`
- `~/.claude/docs/protocols/cross-dispatch-protocol.md`（本檔自守）

## 3. §9 Event Log Integration (new)

### 3.1 事件關係圖

```
cross-dispatch API 事件（§7 canonical 12 event types）
      │
      ▼
ns agent-event-writer.js（Gap B v0.5, producer only）
      │
      ▼
~/.claude/data/agent-events.jsonl（append-only）
      │
      ├─→ reviewer agent（Gap B v0.6+ consumer, 🟡 Parallel 啟動點）
      ├─→ nc UI derived view（v0.6+）
      └─→ replay / crash recovery（v0.6+）
```

### 3.2 與 handoff 的關係

| 階段 | Event log 狀態 | handoff 狀態 |
|---|---|---|
| v0.5（當前） | 🟢 Additive（writer 運行無 consumer） | 原 SoT，未動 |
| v0.6+（reviewer consumer 就位） | 🟡 Parallel（與 handoff 並存 + shadow diff） | 仍 SoT |
| future（🔴 Swap 達標） | 🔴 default source | legacy/，M+2 刪 |

### 3.3 Envelope schema

envelope 6 欄（v1, 收斂於 v0.5）：
```json
{
  "schema_version": 1,
  "timestamp": 1776XXX,
  "actor_cwd": "/Users/sbu/projects/nova-brain",
  "correlation_id": "<session_id or dispatch_id>",
  "source_agent": "nova-brain",
  "target_agent": "nova-server",
  "event_type": "<namespace>.<name>",
  "payload": { /* per event type */ }
}
```

**schema_version 升級紀律**：v2 屬 **🔵 的 🔴 子類**（ns R4 一致性確認）— 同時屬 Contract-only（schema 改動）與 Swap（不可並存），走最嚴紀律：reverse migration（v2 → v1 降級讀）+ 三方 peer sign-off + shadow ≥ 14d + 使用者明示授權（升級五件套全套）。SDD-01 §8 升級五件套對此 case 全部生效。

### 3.4 Agent source identification

- envelope `source_agent` = `basename(actor_cwd)`（cwd-derived slug，不保證是 registered agent）
- HTTP header `X-Nova-Source-Agent` 優先於 body（於 hook-client.js emit 時）
- ns writer 提供 `agentSlugFromCwd()` 並 JSDoc 註明 consumer **不該做 agent-specific 邏輯**（只用於 display / log / filter，驗證走 `readProjects()`）

### 3.5 Payload 白名單載入

ns writer 啟動時 SIGHUP reload `~/.claude/config/event-types/*.json`，按 `payload_fields` 做 live validation。新增 event type 屬 🔵 Contract-only，必走 producer + consumer 同步 commit 或 draft→canonical 兩階段。

## 4. 待定

- **§9.3 envelope v2**：是否預留 `parent_correlation_id`（trace 鏈）待使用者決策
- **§9.4 retention policy**：event log 無限 append 或週/月 rotate？待 nc UI + ns 討論

## 5. 實作順序

1. 本 SDD 通過三方 accept
2. 直接 append §8 + §9 至 `~/.claude/docs/protocols/cross-dispatch-protocol.md`
3. commit message 標 `stage: 🔵`（本身是 Contract-only 變更）
4. 不需 producer/consumer 同步 commit（純文件無 runtime consumer 載入）
