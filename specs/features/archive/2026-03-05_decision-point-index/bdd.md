# Feature: decision-point-index

> 此文件為 `docs/spec/overtone-decision-points.md`（控制流決策點索引）的 BDD 行為規格。
> 這是純文件任務，測試對象是文件本身的結構完整性、內容準確性與可查找性。

---

## Scenario: 文件存在且包含全部 5 個頂層 Section

GIVEN developer 已完成 `docs/spec/overtone-decision-points.md`
WHEN 讀取該文件的標題結構
THEN 文件包含「一、User Gate 索引」Section
AND 文件包含「二、自動決策索引」Section
AND 文件包含「三、Stage 轉場摘要」Section
AND 文件包含「四、Standard Workflow 狀態圖」Section
AND 文件包含「五、快速查找索引」Section

---

## Scenario: overtone.md 索引包含新文件引用

GIVEN developer 已修改 `docs/spec/overtone.md`
WHEN 搜尋該文件中的文件索引表格
THEN 存在指向 `overtone-decision-points.md` 的引用
AND 引用說明文字包含「控制流」或「決策點」關鍵字

---

## Scenario: User Gate 索引涵蓋全部 5 個 Gate（UG-01 ~ UG-05）

GIVEN 讀取「一、User Gate 索引」Section
WHEN 掃描所有 Gate entry
THEN 存在 UG-01（Discovery 模式使用者確認）
AND 存在 UG-02（規劃模式佇列確認）
AND 存在 UG-03（TEST FAIL 上限）
AND 存在 UG-04（REVIEW REJECT 上限）
AND 存在 UG-05（RETRO ISSUES 上限）

---

## Scenario: 每個 User Gate entry 包含必要欄位

GIVEN 讀取任一 User Gate entry（例如 UG-01）
WHEN 檢視 entry 格式
THEN 包含「觸發條件」欄位
AND 包含「觸發時機」欄位（指明 workflow / handler）
AND 包含「呈現方式」欄位
AND 包含「Handler 位置」欄位（含檔案路徑與行號）
AND 包含「使用者看到的選項」欄位（至少 2 個選項）

---

## Scenario: UG-03 重試上限條件與程式碼一致

GIVEN 讀取 UG-03（TEST FAIL 上限）entry
WHEN 對照 `plugins/overtone/skills/workflow-core/references/failure-handling.md` L31-32
THEN UG-03 記錄的觸發條件為 `failCount >= 3`
AND 文件說明停止後提示使用者介入（非自動修復）

---

## Scenario: UG-04 重試上限條件與程式碼一致

GIVEN 讀取 UG-04（REVIEW REJECT 上限）entry
WHEN 對照 `plugins/overtone/skills/workflow-core/references/failure-handling.md` L72-73
THEN UG-04 記錄的觸發條件為 `rejectCount >= 3`
AND 文件說明停止後提示使用者介入

---

## Scenario: UG-01 Discovery Gate 標示 AskUserQuestion 呈現方式

GIVEN 讀取 UG-01（Discovery 模式使用者確認）entry
WHEN 檢視「呈現方式」欄位
THEN 標示為「AskUserQuestion 多選項」
AND 選項清單包含「各建議方案」
AND 選項清單包含「繼續討論」
AND 選項清單包含「寫入佇列但不執行」

---

## Scenario: 自動決策索引 2.1 PreToolUse 阻擋表格格式正確

GIVEN 讀取「二、2.1 PreToolUse(Task) 決策」小節
WHEN 檢視表格結構
THEN 表格包含「決策點」欄
AND 表格包含「條件」欄
AND 表格包含「結果」欄
AND 表格包含「Handler」欄
AND 至少有一列描述「跳過必要前置階段 → deny」的決策

---

## Scenario: 自動決策索引 2.3 Stop hook 退出條件以優先順序排列

GIVEN 讀取「二、2.3 Stop hook 退出決策」小節
WHEN 檢視退出條件清單
THEN 第 1 項為「/ot:stop 手動退出 → exit」
AND 第 2 項為「iteration >= 100 → exit + 警告」
AND 第 3 項為「consecutiveErrors >= 3 → exit + 警告」
AND 第 4 項為「allStagesCompleted + 含失敗 stage → abort」
AND 第 5 項為「allStagesCompleted + 無失敗 → complete」
AND 存在 PM 互動模式特例（nextStage === 'PM' 時不阻擋 loop）
AND 最後一項為「其他（未完成）→ block + loop 繼續」

---

## Scenario: Stop hook 條件優先順序與 session-stop-handler.js 程式碼一致

GIVEN 讀取「二、2.3」小節的退出條件優先順序
WHEN 對照 `plugins/overtone/scripts/lib/session-stop-handler.js` L151-239
THEN 所有條件的順序與程式碼 if 判斷順序一致
AND PM 特例記錄在「loop 繼續」之前（對應程式碼 L228-239）

---

## Scenario: 自動決策索引 2.4 佇列控制流描述完整

GIVEN 讀取「二、2.4 佇列控制流」小節
WHEN 檢視內容
THEN 包含 PM stage 完成時自動解析佇列表格的說明（前置步驟）
AND 包含 workflow 完成後 completeCurrent + getNext 的邏輯說明
AND 包含「有下一項 → decision: 'block'，強制 loop 繼續」的說明
AND 包含「無下一項 → 正常退出」的說明

---

## Scenario: 佇列控制流描述與程式碼一致

GIVEN 讀取「二、2.4」的 PM 前置步驟說明
WHEN 對照 `plugins/overtone/scripts/lib/agent-stop-handler.js` L178-188
THEN 文件說明 PM stage pass 時觸發 `_parseQueueTable` 並寫入 execution-queue
WHEN 對照 `plugins/overtone/scripts/lib/session-stop-handler.js` L196-218
THEN 文件說明 queueCompleted + getNext 有結果時回傳 `decision: 'block'`

---

## Scenario: Stage 轉場摘要涵蓋 18 個 workflow

GIVEN 讀取「三、Stage 轉場摘要」Section
WHEN 計算所有 workflow 數量
THEN 共有 18 個 workflow 條目
AND 每個條目包含「Workflow 名稱」、「Key」、「Stages」序列
AND Stage 序列使用「→」連接
AND 並行 stage 使用「[REVIEW+TEST]」格式

---

## Scenario: Standard workflow 的 Stage 序列正確

GIVEN 讀取 Stage 轉場摘要中 standard workflow 的條目
WHEN 檢視 Stages 序列
THEN 序列為 PLAN → ARCH → TEST:spec → DEV → [REVIEW+TEST] → RETRO → DOCS

---

## Scenario: Mermaid 狀態圖語法有效

GIVEN 讀取「四、Standard Workflow 狀態圖」Section
WHEN 檢視 Mermaid 程式碼區塊
THEN 程式碼區塊標示為 `mermaid`
AND 使用 `stateDiagram-v2` 語法
AND 存在 `[*] --> PLAN` 起始轉場
AND 存在 `subgraph` 或 `state retry_loop` 包圍 retry 迴圈
AND 存在標示 User Gate UG-03 的轉場（failCount >= 3 → 終態）
AND 存在標示 User Gate UG-04 的轉場（rejectCount >= 3 → 終態）
AND 狀態圖終態 DOCS 連接至 `[*]`

---

## Scenario: Mermaid 圖包含並行分叉節點

GIVEN 讀取「四、Standard Workflow 狀態圖」的 Mermaid 程式碼
WHEN 檢視並行 quality gate 部分
THEN 存在表示並行分叉的語法（`<<fork>>` 或等效表示）
AND REVIEW 與 TEST_verify 在分叉後並行出現
AND 存在匯合節點（`<<join>>` 或等效表示）

---

## Scenario: 快速查找索引包含至少 7 個查找情境

GIVEN 讀取「五、快速查找索引」Section
WHEN 計算查找情境數量
THEN 共有至少 7 個查找情境
AND 包含「系統什麼時候會問使用者？」→ 對應「一、User Gate 索引」
AND 包含「Loop 什麼時候退出？」→ 對應「二、2.3」
AND 包含「佇列完成後系統做什麼？」→ 對應「二、2.4」
AND 包含「standard workflow 有哪些 stages？」→ 對應「三」
AND 包含「完整狀態轉移圖」→ 對應「四」

---

## Scenario: 30 秒可查找任意決策點（可查找性驗證）

GIVEN 文件已完成且「五、快速查找索引」存在
WHEN 使用者想知道「REVIEW REJECT 後系統做什麼？」
THEN 快速查找索引直接指向「二、2.2 SubagentStop 收斂決策」
WHEN 使用者想知道「discovery workflow 什麼時候暫停？」
THEN 快速查找索引直接指向「一、UG-01」
AND 每個情境到對應 Section 的導航不超過 1 次跳轉

---

## Scenario: 文件頂部包含版本與用途說明

GIVEN 讀取文件開頭
WHEN 檢視前 10 行
THEN 存在說明文字（blockquote 或段落）描述本文件用途
AND 說明文字包含「控制流」、「決策點」、「30 秒」或「索引」等關鍵字
