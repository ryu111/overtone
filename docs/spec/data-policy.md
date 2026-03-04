# Overtone 資料保留策略

> 版本：v1.0.0（2026-03-04）
> 用途：定義所有 Overtone 資料源的保留規則、清理機制與監控閾值。

## 概覽

Overtone 資料分為兩類：

- **Session-scoped**：與特定 session 綁定，session 過期後自動清理
- **Global-scoped**：跨 session 累積的學習資料，長期保存

---

## 資料源清單

### Session-scoped 資料（`~/.overtone/sessions/{sessionId}/`）

| 檔案 | 用途 | 寫入頻率 | 預期大小 |
|------|------|---------|---------|
| `workflow.json` | 工作流狀態（stages、activeAgents、featureName） | 每次 stage 更新 | < 50 KB |
| `timeline.jsonl` | 事件時間軸（stage 開始/結束、verdict） | 每次 agent stop | < 500 KB |
| `observations.jsonl` | Session 層觀察（instinct 暫存） | 不定期收集 | < 200 KB |
| `loop.json` | Loop 控制狀態（enabled、pendingTasks） | 每次 loop 觸發 | < 5 KB |
| `compact-count.json` | Context 壓縮計數 | 每次 compact | < 1 KB |

**保留期限**：超過 **7 天**（`DEFAULT_MAX_AGE_DAYS`）未更新的 session 目錄由 `cleanupStaleSessions()` 自動刪除。

**清理機制**：`session-cleanup.js` 的 `runCleanup()` 在 `SessionEnd` hook 觸發，保護當前 session 不被刪除。

---

### Global-scoped 資料（`~/.overtone/global/{projectHash}/`）

每個專案透過 `projectRoot` 的 SHA-256 前 8 字元 hash 隔離儲存。

| 檔案 | 用途 | 寫入頻率 | 預期大小 | 保留策略 |
|------|------|---------|---------|---------|
| `scores.jsonl` | 各 stage 品質評分記錄 | 每次 stage PASS | < 2 MB | 永久（聚合資料） |
| `failures.jsonl` | 失敗/reject 記錄 | 每次 fail/reject | < 500 KB | 永久（聚合資料） |
| `observations.jsonl` | 跨 session 高信心觀察（global instinct） | 每次 graduate | < 1 MB | 永久（學習資料），低信心條目由 `pruneGlobal()` 清理 |
| `baselines.jsonl` | Session 效能基準線 | 每次 session 完成 | < 500 KB | 永久（趨勢資料） |
| `execution-queue.json` | PM Discovery 執行佇列 | 每次 PM 寫入 | < 50 KB | 完成後保留（需手動清理） |

**清理機制**：
- `cleanupStaleGlobalDirs()`：超過 **30 天**（`DEFAULT_GLOBAL_MAX_AGE_DAYS`）未更新的 hash 目錄整體刪除（用於清理測試殘留或廢棄專案）
- `pruneGlobal()`（`global-instinct.js`）：清除 `confidence < 0.2` 的過時觀察，防止 `observations.jsonl` 無限膨脹
- `data.js gc`：手動觸發清理舊 session 和孤兒目錄

---

### 系統層資料（`~/.overtone/`）

| 檔案 | 用途 | 備注 |
|------|------|------|
| `heartbeat.pid` | Heartbeat daemon PID | Daemon 停止後自動清理 |
| `heartbeat-state.json` | Daemon 執行狀態 | Daemon 管理 |
| `dashboard.json` | Dashboard SSE 狀態 | 即時更新 |
| `config.json` | 使用者設定 | 永久保留 |
| `.current-session-id` | 當前 session ID | UserPromptSubmit 更新 |
| `*.tmp`, `*.bak`, `*.lock` | 暫存檔 | 超過 **1 小時**（`DEFAULT_ORPHAN_MAX_AGE_HOURS`）自動清理 |

---

## 保留期限摘要

| 資料類別 | 預設保留期限 | 常數名稱 | 定義位置 |
|---------|------------|---------|---------|
| Session 目錄 | 7 天 | `DEFAULT_MAX_AGE_DAYS` | `session-cleanup.js` |
| 暫存檔（.tmp/.bak/.lock） | 1 小時 | `DEFAULT_ORPHAN_MAX_AGE_HOURS` | `session-cleanup.js` |
| Global hash 目錄（孤兒） | 30 天 | `DEFAULT_GLOBAL_MAX_AGE_DAYS` | `session-cleanup.js` |
| Global JSONL 資料 | 永久 | — | 手動或 `data.js gc` |

---

## 大小警示閾值

| 資料源 | 警示閾值 | 說明 |
|--------|---------|------|
| Session timeline.jsonl | 1 MB | 單一 session timeline 超此值表示異常活躍 |
| Global observations.jsonl | 5 MB | 超過此值建議執行 `pruneGlobal()` |
| Global scores.jsonl | 10 MB | 超過此值建議執行 `data.js gc` |
| Global hash 目錄（整體） | 50 MB | 超過此值建議執行 `cleanupStaleGlobalDirs()` |

---

## 自動清理機制

### 1. SessionEnd hook 觸發清理
- `cleanupStaleSessions()`：清理超過 7 天的 session 目錄
- `cleanupOrphanFiles()`：清理超過 1 小時的暫存檔

### 2. 自動壓縮（auto-compaction）
- `global-instinct.js` 的 `_readAll()`：當 JSONL 原始行數超過唯一條目的 2 倍時，自動重寫壓縮

### 3. 手動清理指令
```bash
# 查看資料統計
bun scripts/data.js stats --global

# 清理孤兒 global hash 目錄（預設 30 天以上）
bun scripts/data.js gc --dry-run            # 預覽將清理的目錄
bun scripts/data.js gc                      # 執行清理
bun scripts/data.js gc --max-age-days 60    # 自訂保留天數
```

---

## 資料品質監控

`health-check.js` 的 `checkDataQuality` 函式掃描所有 global JSONL 檔案，驗證：

- 必填欄位是否存在（`ts`, `stage`, `agent` 等）
- 數值欄位是否在合理範圍（`confidence` 0-1、`overall` 0-5）
- 損壞行比例是否超過 10%

健康檢查執行：
```bash
bun scripts/health-check.js
```

---

## 設計原則

1. **保守刪除**：只刪除確定過期的資料，有 try/catch 保護
2. **Global 資料不自動清理內容**：global JSONL 屬於累積型學習資料，只清理整個孤兒目錄（即整個廢棄專案的資料），不逐行刪除
3. **Session 資料隨 session 消亡**：session 目錄是整個生命週期的快照，過期後整體刪除
4. **測試隔離**：每個測試使用 `makeTmpProject()` 產生隔離 hash 目錄，測試後由 `cleanupStaleGlobalDirs()` 清理孤兒
