# Overtone 子系統

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：Specs 系統、Dashboard 監控、Remote 控制、Timeline 事件記錄、Config API、持久化系統
> 版本：v0.28.37

---

## Specs 系統整合

### 可選模式

/auto 判斷是否啟用 Specs 系統：

```
大功能（standard/full/secure）
  → 啟用 Specs 系統
  → PLAN 產出 proposal.md
  → ARCH 產出 design.md + tasks.md
  → DEV 按 tasks.md 執行

小任務（single/quick/debug）
  → 跳過 Specs 系統
  → 直接執行
```

### 目錄結構

```
{project_root}/
└── specs/
    └── features/
        ├── in-progress/<feature>/    # 進行中
        ├── paused/                   # 暫停
        ├── backlog/                  # 待辦
        └── archive/YYYY-MM-DD_<feature>/  # 已完成（扁平）
```

---

## Dashboard + Remote + Timeline

### Dashboard

- **保留完整功能**，資訊配合核心，不特別為 Dashboard 設計
- **提升穩定度**：SSE 自動重連、連線狀態追蹤、錯誤恢復
- **技術栈**：Bun + htmx + Alpine.js（29KB、無構建步驟）
- **自動啟動**：SessionStart hook 自動 spawn + 自動開瀏覽器
- **重複開啟保護**（v0.17.3）：probePort() 確認 port 7777 是否已有服務，避免重複啟動；OVERTONE_NO_DASHBOARD 環境變數可停用自動啟動；EADDRINUSE 時 graceful exit
- **三 Tab**：Overview（workflow 狀態 + agent 活動）、Timeline（事件流）、History（歷史統計 + pass@k）

### Remote 抽象化架構

```
Remote Core（核心引擎）
  ├─ EventBus：5 軸事件
  │    push / query / control / sync / interact
  │
  └─ Adapter Interface
       ├─ DashboardAdapter    WebSocket 雙向（V1）
       ├─ TelegramAdapter     Bot API 雙向（V1）
       ├─ SlackAdapter        V2
       ├─ DiscordAdapter      V2
       └─ WebhookAdapter      單向 fallback
```

### Timeline（26 種事件，13 分類）

| 分類 | 事件 | 說明 |
|------|------|------|
| **workflow** | start, complete, abort | 工作流生命週期（3） |
| **stage** | start, complete, retry | 階段生命週期（3） |
| **agent** | delegate, complete, error | Agent 執行紀錄（3） |
| **loop** | start, advance, complete | Loop 迭代（3） |
| **parallel** | start, converge | 並行群組（2） |
| **error** | fatal | 不可恢復錯誤（1） |
| **grader** | score | Grader 品質評分結果（1） |
| **specs** | init, archive, archive-skipped, tasks-missing | Specs 功能初始化、歸檔、歸檔略過、Tasks 遺失（4） |
| **session** | start, end, compact, compact-suggestion | Session 生命週期（4） |
| **system** | warning | 系統警告（1） |

儲存：`~/.overtone/sessions/{id}/timeline.jsonl`（append-only）。
顯示：中文、簡潔。

---

## Config API（v0.21.0 新增）

### 目的
統一管理 Overtone 三大元件的設定驗證與 CRUD 操作：agent、hook、skill。

### 架構

#### L1 驗證層
- `validateAgent(agent, model, schema)`：驗證 agent frontmatter
- `validateHook(hook, schema)`：驗證 hook 定義
- `validateSkill(skill, schema)`：驗證 skill 定義
- `validateAll(pluginRoot)`：一次驗證整個 plugin

返回 `{ valid: boolean, errors: string[], warnings: string[] }`

#### L2 結構化 API
- `createAgent(root, name, options)`：建立新 agent .md 檔
- `updateAgent(agentPath, update)`：更新 agent frontmatter + 內容
- `createHook(root, name, options)`：建立新 hook 定義
- `updateHook(hookPath, update)`：更新 hook
- `createSkill(root, skillName, options)`：建立新 skill 檔
- `updateSkill(skillPath, update)`：更新 skill

### 配套資料

- **registry-data.json**：將 stages 和 agentModels 常數 JSON 化，便於外部工具讀取
- **knownTools 常數**：13 個 Claude 已知工具列表（registry.js 匯出）
- **hookEvents 常數**：9 個 Overtone hook 事件列表（registry.js 匯出）

### 使用場景

1. **CLI 工具驗證**：`validate-agents.js` 改為調用 validateAll()
2. **外部工具整合**：其他工具可透過 config-api 驗證或更新 agent/hook/skill
3. **自動化檢查**：健康檢查系統可用 config-api 驗證元件一致性

---

## 持久化系統（Level 2 持續學習）

### 架構（三層）

```
全域層：~/.overtone/global/{projectHash}/
├─ observations.jsonl    # 跨 session 觀察記錄
├─ baselines.jsonl       # 效能基線歷史
├─ scores.jsonl          # 評分歷史
└─ failures.jsonl        # 失敗模式聚合（v0.28.27）

Session 層：~/.overtone/sessions/{sessionId}/
├─ workflow.json         # 工作流狀態（同步更新）
├─ timeline.jsonl        # 事件序列（append-only）
├─ observations.jsonl    # Session 內觀察記錄
└─ loop.json             # Loop 進度（迭代用）
```

### Module：global-instinct.js（v0.28.22）

**目的**：跨 session 長期記憶——高信心觀察自動畢業為全域知識。

**API**：
- `graduate(observations, threshold=0.85)`：篩選高信心（>85%）觀察畢業
- `queryGlobal(projectHash, query, opts)`：全域知識檢索
- `summarizeGlobal(observations)`：多觀察摘要
- `decayGlobal(observations, days=30)`：時間衰減（>30 days 權重 50%）
- `pruneGlobal(observations, maxSize=1000)`：超大檔案刪舊

**整合點**：
- `SessionStart hook`：注入 `~/.overtone/global/{projectHash}/observations.jsonl` 背景
- `SessionEnd hook`：自動畢業本 session 的高信心觀察

**資料格式**（JSONL）：
```json
{"id":"obs_xxx","timestamp":"2026-03-03T10:00:00Z","confidence":0.88,"projectHash":"abc123","content":"...","age_days":5}
```

### Module：baseline-tracker.js（v0.28.23）

**目的**：效能基線持久化——每 session 記錄關鍵指標（執行時間、測試通過率、lint error 數），支援趨勢分析。

**API**：
- `computeSessionMetrics(sessionId)`：計算關鍵指標（DEV 用時、TEST 通過率、lint error 數、stage 耗時分佈）
- `saveBaseline(projectHash, stage, metrics)`：儲存基線
- `getBaseline(projectHash, stage)`：查詢基線（最近 10 筆）
- `compareToBaseline(sessionId, stage)`：與歷史比較（返回 delta + 趨勢）
- `formatBaselineSummary(summary)`：可視化輸出

**設定**（registry.js）：
```javascript
baselineDefaults: {
  compareWindowSize: 10,        // 比較視窗（最近 N 筆）
  maxRecordsPerStage: 50        // 單 stage 最多保留筆數
}
```

**整合點**：
- `SubagentStop hook`：計算並保存本 stage 的指標
- `stop-message-builder.js`：加入趨勢對比的建議（例：「本次 DEV 比平均快 15%」）

### Module：score-engine.js（v0.28.24）

**目的**：通用多維度評分系統——取代 pass/fail 二元判斷，支援連續型評估（0-5 分）。

**API**：
- `saveScore(sessionId, stage, data)`：記錄評分（stage、score、dimensions、timestamp）
- `queryScores(sessionId, stage, opts)`：查詢歷史
- `getScoreSummary(projectHash, opts)`：彙總報告（含趨勢、維度對比）

**評分維度**（stage-specific）：
- **DEV**：功能完整度、程式碼品質、效能
- **REVIEW**：正確性、安全性、可維護性
- **TEST**：通過率、覆蓋率、邊界情況
- **PLAN**：需求完整度、可行性、風險識別
- **ARCH**：架構合理性、擴展性、技術選型
- **DEBUG**：根因分析深度、診斷準確度
- **RETRO**：問題發現覆蓋度、建議可行性

**設定**（registry.js）：
```javascript
scoringConfig: {
  gradedStages: ['DEV', 'REVIEW', 'TEST', 'PLAN', 'ARCH', 'DEBUG', 'RETRO'],
  lowScoreThreshold: 3.0      // < 3.0 算低分，觸發 quality_signal
},
scoringDefaults: {
  compareWindowSize: 10,
  maxRecordsPerStage: 50
}
```

**整合點**：
- `grader.md`：grader agent 執行後寫入 scores.jsonl
- `SubagentStop hook`：低分（<3.0）emit `quality_signal` 事件
- `stop-message-builder.js`：PASS 時提示是否委派 grader 評分

**資料格式**（JSONL）：
```json
{"sessionId":"s_xxx","stage":"DEV","score":4.2,"dimensions":{"completeness":4,"quality":4.5,"performance":4},"timestamp":"2026-03-03T10:00:00Z"}
```

### Module：failure-tracker.js（v0.28.57）

**目的**：卡點識別——跨 session 聚合失敗模式，自動識別重複卡點並注入改進建議。

**API**：
- `recordFailure(projectRoot, record)`：記錄 fail/reject 事件（record: { ts, sessionId, stage, agent, verdict, retryAttempt }）
- `recordResolution(projectRoot, record)`：記錄 stage 解決（record: { ts, sessionId, stage }），用於過濾同 sessionId+stage 的舊失敗
- `getFailurePatterns(projectRoot, window)`：聚合分析（byStage/byAgent/topPattern），自動排除已解決的失敗
- `formatFailureWarnings(projectRoot, stage, opts)`：生成 stage 相關失敗警告（pre-task 注入）
- `formatFailureSummary(projectRoot, opts)`：失敗摘要（週期、時間範圍、頻次）

**設定**（registry.js）：
```javascript
failureDefaults: {
  lookbackDays: 30,        // 往前查看 N 天的失敗記錄
  maxRecordsPerStage: 100   // 單 stage 最多保留筆數
}
```

**整合點**：
- `SubagentStop hook / agent-stop-handler.js`：fail/reject 時呼叫 recordFailure；pass 且本 session 曾有失敗時呼叫 recordResolution
- `SessionStart hook`：注入 `formatFailureSummary` 提醒本專案重複卡點
- `pre-task.js hook`：注入 `formatFailureWarnings` 提醒本 stage 的常見失敗

**資料格式**（JSONL）：
```json
{"sessionId":"s_xxx","stage":"DEV","agent":"developer","error":"linting failed: E123","timestamp":"2026-03-03T10:00:00Z","frequency":3}
```

### 路徑管理（paths.js）

新增全域路徑：
```javascript
global: {
  observations: {
    path: "~/.overtone/global/{projectHash}/observations.jsonl",
    append: true
  },
  baselines: {
    path: "~/.overtone/global/{projectHash}/baselines.jsonl",
    append: true
  },
  scores: {
    path: "~/.overtone/global/{projectHash}/scores.jsonl",
    append: true
  },
  failures: {
    path: "~/.overtone/global/{projectHash}/failures.jsonl",
    append: true
  }
}
```

---

## Timeline 事件擴充（26 種，v0.28.24）

新增 `grader:score` 事件分類：
| 分類 | 事件 | 說明 |
|------|------|------|
| **grader** | score | Grader 評分完成（維度評估結果） |
