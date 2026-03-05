# Overtone 製作規範

> 版本：v1.0 | 建立日期：2026-03-05

## 概述

製作規範定義 Overtone 每個元件和流程必須遵守的品質標準。

與設計原則（CLAUDE.md）平等互補：
- **製作原則**：管「怎麼做」— 每個元件的品質守衛標準
- **設計原則**：管「做什麼」— 架構方向與系統決策

新元件必須同時符合製作原則（品質）和設計原則（架構）。

---

## 製作原則（3 條）

### 1. 完全閉環

**定義**：每個流程必須有回饋路徑。資訊不能只流出不流回。

**可檢驗標準**：
- 每個 timeline event 必須有至少一個 consumer（被讀取或觸發後續行動）
- 每個 hook 錯誤必須被記錄和追蹤（不能只 console.error 後消失）
- 每個偵測結果必須有對應的行動建議（不只是報告問題）

**現有實踐**：
- `SubagentStop` hook：記錄 verdict → 觸發下一步提示 → 寫 state → emit timeline（完整閉環）
- `health-check.js`：12 項偵測各有對應說明（部分有建議行動）
- `baseline-tracker.js`：執行時間基線 → 比對偏差 → 寫入 session context
- `score-engine.js`：品質分數 → 反饋到 session systemMessage
- `failure-tracker.js`：失敗記錄 → 模式聚合 → 注入 session context（透過 session-start-handler）

**已知缺口**：
- Hook 錯誤（`safeRun` catch）只呼叫 `hookError()` 輸出到 console，無統計回饋路徑
- Dashboard / Telegram 目前為單向展示，遠端指令尚未回傳結果確認
- `intent_journal`（觀察資料）收集後無主動分析回饋，只被動查詢

**對應 health-check**：`checkClosedLoop`（已實作）

---

### 2. 自動修復

**定義**：每個元件必須定義失敗恢復策略。crash 不能只靠人工。

**可檢驗標準**：
- 每個 handler 模組有 try-catch 靜默失敗保護（不讓單點錯誤傳播）
- State 操作有不變量守衛（`enforceInvariants` + `sanitize`）
- 長期運行的元件有自動重啟機制或存活檢查

**現有實踐**：
- `hook-utils.js safeRun()`：統一錯誤捕捉，hook crash 不影響工具執行
- `updateStateAtomic()`：`?? current` fallback 防禦 + `enforceInvariants()`（4 規則）
- `sanitize(sessionId)`：SessionStart 時清理上一 session 殘留狀態（3 規則）
- `failure-tracker.js`：自動截斷過長的失敗記錄（`_trimIfNeeded`）
- `instinct.js` auto-compact：全域 instinct 記憶過長時自動壓縮
- JSONL 損壞行靜默跳過（`try-catch` per line parse）

**已知缺口**：
- Skill / Command 本身無失敗恢復策略定義（目前依賴 Main Agent 自行判斷）
- Dashboard server（`scripts/server.js`）crash 後無自動重啟機制
- Heartbeat daemon（`scripts/heartbeat.js`）crash 需手動 `bun scripts/heartbeat.js start` 重啟
- JSONL 損壞行目前只跳過，無修復嘗試（損壞記錄永久丟失）

**對應 health-check**：`checkRecoveryStrategy`（已實作）

---

### 3. 補全能力

**定義**：系統主動偵測缺口並建議補全。不只報告，要建議行動。

**可檢驗標準**：
- 每個 health-check finding 必須包含 action 建議（`action` 欄位非空）
- 新增元件時自動檢查原則合規（`manage-component.js` 整合）
- 偵測結果有修復優先級排序（P0 系統性問題 > P1 功能缺口 > P2 優化建議）

**現有實踐**：
- `health-check.js` 12 項檢查各有 `message` 說明（部分含修復步驟）
- `dead-code-scanner.js`：偵測未使用 export / 孤兒檔案，輸出具體路徑
- `manage-component.js`：建立元件時自動檢查 registry 一致性
- `docs-sync-engine.js`：偵測 status.md 數字偏差並自動修復（`fixDrift()`）
- `component-repair.js`：自動修復 frontmatter / registry 不一致

**已知缺口**：
- `health-check.js` 大多數 finding 只說「有問題」，缺乏具體 action 指引
- Workflow 模板覆蓋度未偵測（哪些場景缺乏對應 workflow）
- Agent prompt 品質未偵測（prompt 是否包含四模式：信心過濾 + 邊界清單 + 誤判防護 + 停止條件）
- Hook event 覆蓋度未偵測（新增 hook event 後對應 consumer 是否存在）

**對應 health-check**：`checkCompletionGap`（已實作）

---

## 設計原則（5 條，引用自 CLAUDE.md）

> 完整設計原則及其背景見 `docs/vision.md` 設計原則章節。

| # | 原則 | 說明 | 可檢驗標準 |
|---|------|------|-----------|
| 1 | **平台優先** | 並行、同步、錯誤隔離交給 ECC 原生能力，不自建底層機制 | 無自建 barrier/FIFO/slot；並行任務用 Task delegation 而非手動協調 |
| 2 | **狀態最小化** | 只記必要的：誰做了什麼、結果是什麼 | state 欄位有明確用途；無「記了但無人消費」的欄位 |
| 3 | **BDD 驅動** | 先定義行為（GIVEN/WHEN/THEN）再寫碼 | 大功能有 `specs/features/in-progress/{feature}/bdd.md`；測試與 BDD 對齊 |
| 4 | **Loop 預設** | 任務完成自動繼續下一個 | Stop hook 有 checkbox 偵測；workflow 完成後自動觸發下一 stage |
| 5 | **Agent 專職** | 18 個 agent 各司其職，Handoff 檔案傳遞 context | 每個 agent 有明確職責邊界；無「萬用 agent」；agent 間透過 Handoff 傳遞，不直接互動 |

---

## 原則關係

```
製作原則（how）        設計原則（what）
    ↓                      ↓
完全閉環  ←──────────→  Loop 預設
自動修復  ←──────────→  平台優先
補全能力  ←──────────→  BDD 驅動 + Agent 專職
```

- **製作原則**：品質守衛，定義「每個元件怎麼做才算合格」
- **設計原則**：架構方向，定義「系統整體往哪個方向做」
- **兩者互補**：設計原則決定做什麼，製作原則保證做得好

**新元件合規 checklist**：
- [ ] 有回饋路徑（完全閉環）
- [ ] 有失敗恢復策略（自動修復）
- [ ] 有缺口偵測/補全機制（補全能力）
- [ ] 不自建平台已有能力（平台優先）
- [ ] 最小化狀態記錄（狀態最小化）
- [ ] 有對應 BDD 規格（BDD 驅動）
- [ ] 職責清晰、邊界明確（Agent 專職）

---

## 缺口總覽

按優先級排序（P0 系統性 → P1 功能性 → P2 優化性）：

### P0：系統性缺口（影響可靠性）

| 缺口 | 原則 | 說明 | 建議行動 |
|------|------|------|---------|
| Hook 錯誤無統計回饋 | 完全閉環 | `safeRun` catch 後只 console.error，無追蹤 | 新增 hook-error-tracker，匯入 failure-tracker |
| Dashboard/Server 無自動重啟 | 自動修復 | server crash 需手動重啟 | 加 process supervisor 或 health-check restart |
| Heartbeat crash 需手動重啟 | 自動修復 | heartbeat daemon 無存活守衛 | daemon 加 self-restart loop 或 launchd 守護 |

### P1：功能性缺口（影響完整性）

| 缺口 | 原則 | 說明 | 建議行動 |
|------|------|------|---------|
| intent_journal 無分析回饋 | 完全閉環 | 觀察收集後無主動回饋路徑 | 定期分析 → 寫入 global-instinct |
| health-check finding 缺行動建議 | 補全能力 | 大多數 finding 只報告不建議 | 每個 check 加 `suggestedAction` 欄位 |
| Workflow 模板覆蓋度未偵測 | 補全能力 | 無法知道哪些場景缺 workflow | health-check 新增 checkWorkflowCoverage |
| Agent prompt 品質未偵測 | 補全能力 | 無法自動驗證 prompt 四模式合規 | validate-agents 加入 prompt 品質檢查 |
| Hook event 覆蓋度未偵測 | 補全能力 | 新增 event 後無 consumer 偵測 | health-check 新增 checkHookEventCoverage |
| JSONL 損壞行只跳過不修復 | 自動修復 | 損壞記錄永久丟失 | 加入損壞行備份與嘗試修復機制 |

### P2：優化性缺口（影響效率）

| 缺口 | 原則 | 說明 | 建議行動 |
|------|------|------|---------|
| Dashboard 遠端指令無結果回傳 | 完全閉環 | 指令傳送後無確認回饋 | 加 command acknowledgment 機制 |
| Skill/Command 無失敗恢復策略 | 自動修復 | 依賴 Main Agent 自行判斷 | skill 加 fallback 建議章節 |
| manage-component 原則合規整合 | 補全能力 | 新增元件未自動檢查製作原則 | 建立元件時執行合規 checklist |

---

*建立日期：2026-03-05*
*基於：PM Discovery — 核心製作規範探索（Handoff product-manager → developer）*
