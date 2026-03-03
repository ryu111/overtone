# Proposal：numeric-score-engine

## 功能名稱

`numeric-score-engine`（數值評分引擎）

## 需求背景（Why）

- **問題**：目前 SubagentStop 的 `parseResult` 只能輸出 pass/fail/reject/issues 四種二元結果。這告訴我們「過不過」，但不知道「做得多好」。grader agent 已存在，有三個評分維度（clarity / completeness / actionability），但目前只在 Main Agent 可選委派，沒有自動觸發機制，評分結果僅寫入 timeline，不回饋到 instinct 或 baseline。
- **目標**：建立一套通用的多維度數值評分機制，讓系統能夠量化每個 PASS stage 的品質，產出趨勢分析，並將低分觀察注入 instinct，作為持續學習的訊號。
- **優先級**：Level 2（持續學習）的第三項功能，前兩項（跨 session 記憶、效能基線）已完成，本功能是「品質量化」這個維度的補全，為未來自我修正提供數據基礎。

## 使用者故事

```
身為 Overtone 工作流系統
我想要在每個 PASS stage 後自動評估輸出品質（多維度數值）
以便了解系統品質趨勢，並在低分時主動學習改善
```

```
身為開發者
我想要在 Dashboard timeline 看到每個 stage 的品質分數
以便知道哪個 stage 品質薄弱、需要關注
```

## 範圍邊界

### 在範圍內（In Scope）

- 評分維度設定（在 registry 定義哪些 stage 觸發評分、每個維度的閾值）
- `score-engine.js`：評分結果儲存（JSONL 格式，類似 baselines.jsonl，按 project 隔離）
- SubagentStop hook 整合：PASS 結果自動觸發 grader 委派（透過 hook 回傳 prompt 提示 Main Agent）
- 閾值警告：低於閾值的維度 emit 警告訊息（顯示在 SubagentStop result）
- instinct 回饋：低分（overall < threshold）自動 emit instinct 觀察
- grader agent 更新：評分後將結果寫入新的全域 score store（而非只寫 timeline）

### 不在範圍內（Out of Scope）

- Dashboard 視覺化（分數趨勢圖）— 留到未來版本
- 分數影響 workflow 分支決策（如低分強制 RETRO）— 留到未來版本
- 新增評分維度（超出現有 clarity/completeness/actionability）— 架構設計時預留擴充點但不實作
- 評分結果影響 retry 邏輯 — 不在此次範圍

## 子任務清單

### 第一層：設計與設定（需先完成）

1. **定義評分設定（scoringConfig）**
   - 負責 agent：architect
   - 相關檔案：`plugins/overtone/scripts/lib/registry.js`、`plugins/overtone/scripts/lib/registry-data.json`
   - 說明：在 registry 新增 `scoringConfig`，定義（1）哪些 stage 觸發評分（建議：DEV、REVIEW、TEST、DOCS）、（2）overall 低分閾值（建議 3.0/5.0）、（3）評分維度清單。architect 決定 scoringConfig 的鍵值格式。

### 第二層：核心模組（可並行）

2. **實作 `score-engine.js`**（依賴任務 1）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/score-engine.js`（新建）
   - 說明：提供 `saveScore(sessionId, projectRoot, scoreRecord)`、`queryScores(projectRoot, filter)`、`getScoreSummary(projectRoot, stageKey, n)` 三個 API。儲存路徑：`~/.overtone/global/{projectHash}/scores.jsonl`。格式與 baselines.jsonl 一致（JSONL append-only，按 workflowType/stage 可查詢）。

3. **更新 `paths.js`**（依賴任務 1，可與任務 2 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/paths.js`
   - 說明：在 `global` 物件新增 `scores: (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'scores.jsonl')`。

### 第三層：整合（依賴第二層完成）

4. **更新 grader agent prompt**（依賴任務 2）
   - 負責 agent：developer（透過 manage-component.js）
   - 相關檔案：`plugins/overtone/agents/grader.md`
   - 說明：在現有 bash 寫入 timeline 的步驟後，增加呼叫 `score-engine.js saveScore` 的步驟。grader 完成後除了寫 timeline 也寫入全域 scores store。

5. **SubagentStop 整合：自動觸發評分 + 閾值警告**（依賴任務 1、2、3）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/agent/on-stop.js`、`plugins/overtone/scripts/lib/stop-message-builder.js`
   - 說明：PASS 且 stageKey 在 `scoringConfig.gradedStages` 清單時，在 stop-message-builder 的 PASS 分支加入「建議委派 grader 評分」提示訊息。同時讀取上一次同 stage 的分數，若 overall < threshold 則加入警告並 emit instinct 觀察（`low-score` 類型）。

6. **instinct 低分回饋**（依賴任務 5）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/agent/on-stop.js`
   - 說明：overall < 閾值時，呼叫 `instinct.emit(sessionId, 'quality_signal', trigger, action, tag)` 記錄低品質觀察。trigger = `${agentName} scored ${overall} at ${stageKey}`，action = `質量低於 ${threshold}，建議加強 ${lowDimensions.join(', ')}`，tag = `agent-${agentName}`。

### 第四層：測試（依賴第三層完成）

7. **score-engine 單元測試**（依賴任務 2、3）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/score-engine.test.js`（新建）
   - 說明：測試 saveScore/queryScores/getScoreSummary API，包含 JSONL 讀寫、projectHash 隔離、trim 機制。

8. **SubagentStop 整合測試**（依賴任務 5、6）
   - 負責 agent：tester
   - 相關檔案：`tests/integration/grader-score-engine.test.js`（新建）
   - 說明：驗證 PASS stage 時出現評分提示、低分時出現 instinct 觀察、非評分 stage 不觸發。

## 開放問題

留給 architect 決定：

1. **觸發時機**：每個 PASS stage 都觸發 vs 只在特定 stage（DEV, REVIEW, TEST）觸發？建議以 `scoringConfig.gradedStages` 清單控制，architect 決定預設清單。
2. **閾值數字**：低分閾值建議 3.0/5.0（overall 60%），architect 確認是否合理。
3. **grader 呼叫方式**：SubagentStop hook 無法直接啟動 Task — 只能在 result prompt 中提示 Main Agent「建議委派 grader」。architect 確認這個設計是否足夠，或是否需要另一個機制（如在 PreToolUse Task hook 攔截下一步委派時自動插入 grader）。
4. **score store 截斷策略**：scores.jsonl 按 stage+workflowType 分組，每組保留最新 N 筆（建議 50）。architect 確認是否與 baselines.jsonl 使用相同截斷策略。
5. **grader 模型保持 haiku**：評分是輕量任務，haiku 足夠。無需調整。
