# Proposal: instinct-observation-quality

## 功能名稱

`instinct-observation-quality`（Instinct 觀察品質提升 — 方案 A MVP）

## 需求背景（Why）

- **問題**：Instinct 自我優化系統目前效果不佳。114 行觀察全是同一個 pattern（`tool_preferences:search-tools`），信號價值為零。`emit()` 在信心達 1.0 後仍持續追加 JSONL 行造成膨脹。`post-use.js` wording 偵測不排除 code fence 區塊導致誤報（audit-report #11）。V2 預留的觀察類型（`user_corrections`、`repeated_workflows`）未實作，evolve skill 從未被真正使用過。
- **目標**：讓 Instinct 產生多元、有價值的觀察信號。30 次 workflow 驗證後應累積至少 5 個不同 tag，且至少 1 個 tag 達到 skill 進化候選門檻。同時消除 JSONL 膨脹問題和 wording 誤報。
- **優先級**：Instinct 是 Overtone 自我優化的基礎。觀察品質不足代表進化機制完全失效，需在進一步功能開發前修復。

## 使用者故事

```
身為 Overtone 使用者
我想要 Instinct 系統能從工作流中自動收集多元觀察
以便 系統能學習並逐步進化 Skill 和 Agent
```

```
身為 Overtone 使用者
我想要 wording 偵測不會對 code fence 內的內容誤報
以便 正常的文件編輯不被干擾
```

## 範圍邊界

### 在範圍內（In Scope）

1. **`instinct.js` emit() 飽和閾值**：confidence >= 1.0 時不再追加新 JSONL 行（Must）
2. **`on-stop.js` 新增 `agent_performance` 觀察**：每次 agent 完成時記錄 pass/fail/reject（Must）
3. **`post-use.js` wording 偵測排除 code fence 區塊**：``` 包圍的區塊內不偵測（Must）
4. **`on-submit.js` 新增 `workflow_routing` 觀察**：記錄 workflow 選擇（Should）
5. **`post-use.js` search-tools 觀察改為反面糾正**：只在 Bash grep/find 時記錄，不在每次 Grep/Glob 時記錄（Should）
6. **`evolve` skill 更新**：更新 V1 支援的觀察類型清單（反映新增的 type）
7. **`confidence-scoring.md` 更新**：同步觀察類型文件
8. **測試**：所有變更需有對應測試覆蓋

### 不在範圍內（Out of Scope）

- V2 的 `user_corrections` 觀察類型（需要更複雜的 context 追蹤）
- V2 的 `repeated_workflows` 觀察類型（需要跨 session 分析）
- Instinct 全量載入效能優化（audit-report #9，獨立任務）
- evolve skill 的自動觸發機制
- registry.js 新增觀察類型常數（現有 type 為自由字串，無需 registry 約束）

## 子任務清單

### Phase 1：核心修復（序列）

1. **instinct.js emit() 飽和閾值**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/instinct.js`（第 85-115 行 emit 方法）
   - 說明：在 `emit()` 中，當找到 existing 且 `existing.confidence >= 1.0` 時，直接 return existing 不再追加新 JSONL 行。需更新 `lastSeen` 但不增加 count 或 confidence。
   - 測試：`tests/integration/instinct.test.js` 新增飽和場景測試

2. **post-use.js wording 偵測排除 code fence**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/post-use.js`（第 192-224 行 detectWordingMismatch）
   - 說明：在 `detectWordingMismatch()` 的 line 迴圈中，追蹤 code fence 狀態（遇到 ``` 行切換 inCodeFence boolean），code fence 內的行跳過偵測。
   - 測試：`tests/integration/wording.test.js` 新增 code fence 正面/負面測試

### Phase 2：新增觀察類型（可並行）

3. **on-stop.js 新增 `agent_performance` 觀察**（可與 4 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/agent/on-stop.js`（timeline emit 區塊後，約第 105-114 行之後）
   - 說明：在 timeline emit 之後，呼叫 `instinct.emit(sessionId, 'agent_performance', trigger, action, tag)`。trigger 格式：`{agent} {verdict} at {stage}`。tag 格式：`agent-{agentName}`（如 `agent-developer`、`agent-tester`）。只在有 verdict 時記錄。需要在檔案頂部 require instinct。
   - 測試：`tests/integration/agent-on-stop.test.js` 新增 instinct 驗證場景

4. **on-submit.js 新增 `workflow_routing` 觀察**（可與 3 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/prompt/on-submit.js`（workflow override 解析區塊後，約第 70 行之前）
   - 說明：當偵測到 workflow 選擇時（無論是 override 還是自動選擇），呼叫 `instinct.emit(sessionId, 'workflow_routing', trigger, action, tag)`。trigger：使用者 prompt 摘要（前 80 字元）。tag 格式：`wf-{workflowType}`（如 `wf-standard`、`wf-quick`）。只在有 currentState 且有 workflowType 時記錄。需要在檔案頂部 require instinct。
   - 測試：新增 `tests/integration/on-submit-instinct.test.js`

### Phase 3：修正現有觀察（依賴 Phase 1）

5. **search-tools 觀察改為反面糾正**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/post-use.js`（第 54-59 行和第 145-159 行）
   - 說明：移除 Pattern 2 的 Grep/Glob 正面記錄（第 54-58 行）。改為在 Bash 偵測區塊中（第 44 行分支），檢查 command 是否包含 `grep`/`find`/`rg` 指令，若是則記錄反面觀察：`instinct.emit(sessionId, 'tool_preferences', '使用 Bash grep/find 搜尋', '建議改用 Grep/Glob 工具', 'search-tools')`。
   - 測試：`tests/integration/post-use-bash.test.js` 新增反面偵測場景（Bash grep → 記錄觀察，Grep 工具 → 不記錄觀察）

### Phase 4：文件同步 + evolve skill 更新（可並行）

6. **evolve skill 更新**（可與 7 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/evolve/SKILL.md`（第 45 行 V1 限制說明）
   - 說明：更新 V1 觀察類型清單，加入 `agent_performance`、`workflow_routing`，移除「只收集 2 種 pattern」的限制說明。

7. **confidence-scoring.md 更新**（可與 6 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/evolve/references/confidence-scoring.md`（第 101-107 行 V1 觀察類型表格）
   - 說明：在 V1 支援的觀察類型表格中新增 `agent_performance`、`workflow_routing`、`wording_mismatch` 三個類型及其說明。

## 開放問題

1. **`agent_performance` tag 粒度**：是按 agent 分（`agent-developer`）還是按 stage 分（`stage-DEV`）？建議按 agent 分，因為同一 agent 在不同 workflow 的表現應累積。需 architect 確認。

2. **`workflow_routing` 記錄時機**：on-submit.js 在首次 prompt（無 currentState）時無法記錄 workflow 選擇，因為 workflow 是由 /ot:auto skill 在後續決定的。是否需要在 init-workflow.js 中加入觀察記錄？需 architect 決定。

3. **search-tools 反面偵測的 command 匹配**：Bash command 可能是 `grep -r "pattern" .`，也可能是管道 `cat file | grep pattern`。是否只檢查首個 token，還是掃描整個 command 字串？建議掃描整個 command 字串以覆蓋管道場景。需 architect 確認。

4. **code fence 偵測邊界**：是否要處理巢狀 code fence（如 ```` ```` 四反引號包 ``` 三反引號）？建議 MVP 只處理標準 ``` 三反引號，巢狀場景極少見。需 architect 確認。
