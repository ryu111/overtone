# Proposal

## 功能名稱

`decision-point-index`

## 需求背景（Why）

- **問題**：Overtone 系統（18 agent + 23 skill + 11 hook）的控制流決策點散落在 6 個層次：registry.js（workflows/stages 定義）、SKILL.md（user gate 邏輯）、pre-task-handler.js（PreToolUse 阻擋/放行）、agent-stop-handler.js（SubagentStop 收斂/結果解析）、session-stop-handler.js（Stop hook 退出條件/loop 繼續）、hooks.json（事件觸發映射）。設計者無法在 30 秒內回答「某個 stage 結束後系統會做什麼」，也無法快速判斷新功能需不需要新增 user gate。
- **目標**：建立 `docs/spec/overtone-decision-points.md`，提供統一的控制流決策索引，涵蓋「自動決策」與「User Gate（使用者介入）」兩類，以及每個 workflow 的 stage 轉場摘要和 standard workflow 狀態圖。
- **優先級**：系統可觀察性，設計者 onboarding 和新功能評估都依賴這份索引。

## 使用者故事

```
身為 Overtone 設計者
當我要新增一個 hook 或 skill 時
我想要在 30 秒內判斷「這個改動是否會影響現有決策點」
以便決定是否需要更新 user gate 清單或狀態轉場表
```

```
身為 Overtone 設計者
當我被問到「standard workflow 的 REVIEW REJECT 後系統做什麼」
我想要從單一文件找到完整答案（含自動行為 + user gate 觸發條件）
以便不需要逐一翻讀 agent-stop-handler.js 和 session-stop-handler.js
```

```
身為 Overtone 設計者
當我要確認「discovery workflow 在哪個時間點需要詢問使用者」
我想要從 User Gate 索引直接定位到對應的決策條件
以便快速理解系統邊界
```

## 範圍邊界

### 在範圍內（In Scope）

- `docs/spec/overtone-decision-points.md`（新建）：統一決策點索引，包含：
  1. **User Gate 索引**（詳細 decision tree）：列出所有需要問使用者的時刻、觸發條件、對應 handler 位置
  2. **自動決策索引**（精簡表格）：hook 中的自動判斷（fail/reject 收斂、loop 繼續/退出、佇列推進等）
  3. **Stage 轉場摘要**（精簡表格）：18 個 workflow 的 stage 序列 + 分支條件
  4. **Mermaid 狀態圖**：standard workflow 的完整狀態轉移圖（含 fail/reject/retry 路徑）
- 資訊來源掃描：registry.js（workflows + stages + timelineEvents）、pre-task-handler.js（阻擋邏輯）、agent-stop-handler.js（收斂邏輯 + PM 特例）、session-stop-handler.js（退出條件清單 + loop 繼續條件 + 佇列接續）、pm/SKILL.md（discovery user gate）、workflow-core/references/failure-handling.md（fail/reject/retro 上限）

### 不在範圍內（Out of Scope）

- 程式化 Decision Registry（將決策點存入 JSON/可查詢結構，複雜度高，可列為 v2）
- health-check 整合 `checkDecisionPoints`（依賴程式化 Registry，延後至 v2）
- 所有 18 個 workflow 的完整 Mermaid 狀態機（只做 standard；其餘用表格摘要）
- timeline event 發射/消費完整索引（已有 registry.js timelineEvents，屬於可觀察性另一維度）
- 佇列控制流的完整觸發條件圖（session-stop-handler 佇列邏輯較複雜，用文字摘要即可）

## 子任務清單

依照執行順序列出：

1. **掃描所有決策點來源，建立原始資料清單**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/registry.js`、`plugins/overtone/scripts/lib/pre-task-handler.js`、`plugins/overtone/scripts/lib/agent-stop-handler.js`、`plugins/overtone/scripts/lib/session-stop-handler.js`、`plugins/overtone/skills/pm/SKILL.md`、`plugins/overtone/skills/workflow-core/references/failure-handling.md`、`docs/spec/overtone-工作流.md`、`docs/spec/overtone-agents.md`
   - 說明：逐一讀取上述檔案，整理出所有「if ... then ...」判斷點；分為 User Gate 類（AskUserQuestion 觸發、手動介入提示）和自動決策類（loop block/exit、stage 轉場、佇列推進）；這是文件撰寫的輸入資料

2. **撰寫 `docs/spec/overtone-decision-points.md`**（依賴 1 完成）
   - 負責 agent：developer
   - 相關檔案：`docs/spec/overtone-decision-points.md`（新建）
   - 說明：依據子任務 1 整理的資料，撰寫四個區塊：(a) User Gate 索引 — decision tree 格式，含觸發條件 + 所在 handler + 使用者看到的訊息格式；(b) 自動決策索引 — 表格格式，含決策點 / 條件 / 結果 / handler；(c) Stage 轉場摘要 — 按 workflow 類型分組，列 stage 序列和並行群組；(d) standard workflow Mermaid 狀態圖 — 節點為 stage，邊為 pass/fail/reject/block 條件

3. **更新 `docs/spec/overtone.md` 索引，加入新文件的引用**（依賴 2 完成）
   - 負責 agent：developer
   - 相關檔案：`docs/spec/overtone.md`
   - 說明：在規格索引文件中加入 `overtone-decision-points.md` 的引用條目，說明用途和讀取時機（新功能設計前、理解控制流時）

## 開放問題

- **Q1**：PM SKILL.md 的 discovery user gate（`AskUserQuestion` 呈現選項）和 failure-handling.md 的「使用者介入觸發條件」格式不同，索引應統一格式或保留原始措詞？建議 architect 在 design.md 中決定索引的 entry 格式規範。
- **Q2**：Mermaid 狀態圖的粒度：要不要把 retry loop（fail → debugger → developer → tester → retry）也畫出來，還是只畫主幹路徑加文字說明分支？複雜度差異大。
- **Q3**：session-stop-handler.js 的佇列接續邏輯（`queueCompleted + getNext + decision: block`）是否納入自動決策索引的「佇列控制流」子節，還是另立獨立區塊？
