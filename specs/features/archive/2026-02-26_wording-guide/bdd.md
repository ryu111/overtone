# Feature: 措詞正確性優化 — PostToolUse Hook 偵測 + wording-guide 文件

## 背景

Overtone 的 Agent prompt 使用 emoji 搭配強度關鍵字來標示規則強度，
例如 `📋 MUST`（強規則）、`💡 should`（軟引導）、`⛔ NEVER`（硬阻擋）。

錯誤的搭配（如 `💡 MUST`、`📋 consider`、`⛔ should`）會造成指令強度混淆，
導致 agent 誤判規則的約束力。

`PostToolUse` hook 在每次 Edit/Write 工具操作 `.md` 檔案後，
掃描完整檔案內容，偵測三種 emoji-關鍵詞不匹配的 pattern，
並透過 Instinct 系統記錄觀察結果。

**三個 regex pattern（按不匹配種類）：**

| Pattern | 正確用途 | 錯誤搭配示例 |
|---------|---------|------------|
| `💡 MUST/ALWAYS/NEVER` | `💡` 是軟引導，不可搭配強制關鍵字 | `💡 MUST do X` |
| `📋 consider/may/could` | `📋` 是強規則，不可搭配建議關鍵字 | `📋 consider doing X` |
| `⛔ should/consider/may/prefer/could` | `⛔` 是硬阻擋，不可搭配軟語氣關鍵字 | `⛔ should avoid X` |

---

# Feature: PostToolUse Hook — 三個 Pattern 的正確觸發

## Scenario: 💡 搭配 MUST 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `💡 MUST validate all inputs before processing`
WHEN hook 掃描該檔案內容並套用第一個 regex pattern
THEN 偵測到不匹配，result 字串包含 `[Overtone 措詞檢查]`
AND result 包含違規行的行號
AND result 包含原始違規行的內容（`💡 MUST validate all inputs before processing`）
AND result 包含修正建議（將 `💡` 改為 `📋`，或將 `MUST` 改為 `should`）
AND hook 向 Instinct 系統 emit 一筆 type 為 `wording_mismatch`、tag 為 `emoji-keyword` 的觀察

---

## Scenario: 💡 搭配 ALWAYS 應觸發警告

GIVEN PostToolUse hook 接收到一個 Write 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `💡 ALWAYS run tests before committing`
WHEN hook 掃描該檔案內容
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `💡 ALWAYS run tests before committing`
AND result 包含修正建議

---

## Scenario: 💡 搭配 NEVER 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `💡 NEVER skip error handling`
WHEN hook 掃描該檔案內容
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `💡 NEVER skip error handling`

---

## Scenario: 📋 搭配 consider 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `📋 consider adding more tests`
WHEN hook 掃描該檔案內容並套用第二個 regex pattern
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `📋 consider adding more tests`
AND result 包含修正建議（將 `📋` 改為 `🔧`，或將 `consider` 改為 `MUST`）

---

## Scenario: 📋 搭配 may 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `📋 may use caching for performance`
WHEN hook 掃描該檔案內容
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `📋 may use caching for performance`

---

## Scenario: 📋 搭配 could 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `📋 could be improved by refactoring`
WHEN hook 掃描該檔案內容
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `📋 could be improved by refactoring`

---

## Scenario: ⛔ 搭配 should 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `⛔ should avoid committing secrets`
WHEN hook 掃描該檔案內容並套用第三個 regex pattern
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `⛔ should avoid committing secrets`
AND result 包含修正建議（將 `⛔` 改為 `💡`，或將 `should` 改為 `NEVER`）

---

## Scenario: ⛔ 搭配 prefer 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `⛔ prefer typed parameters over any`
WHEN hook 掃描該檔案內容
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `⛔ prefer typed parameters over any`

---

## Scenario: ⛔ 搭配 may 應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `⛔ may skip validation in some cases`
WHEN hook 掃描該檔案內容
THEN 偵測到不匹配，result 包含 `[Overtone 措詞檢查]`
AND result 包含原始行 `⛔ may skip validation in some cases`

---

## Scenario: 正常措詞（📋 MUST）不應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容只包含行 `📋 MUST validate inputs`
WHEN hook 掃描該檔案內容
THEN 沒有任何 pattern 被觸發
AND result 為空字串 `""`
AND hook 不向 Instinct 系統 emit 任何 `wording_mismatch` 觀察

---

## Scenario: 正常措詞（💡 should）不應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容只包含行 `💡 should consider caching`
WHEN hook 掃描該檔案內容
THEN 沒有任何 pattern 被觸發
AND result 為空字串 `""`

---

## Scenario: 正常措詞（⛔ NEVER）不應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容只包含行 `⛔ NEVER hardcode secrets`
WHEN hook 掃描該檔案內容
THEN 沒有任何 pattern 被觸發
AND result 為空字串 `""`

---

## Scenario: 正常措詞（🔧 consider）不應觸發警告

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容只包含行 `🔧 consider extracting this as a utility`
WHEN hook 掃描該檔案內容
THEN 沒有任何 pattern 被觸發
AND result 為空字串 `""`

---

# Feature: PostToolUse Hook — False Positive 防護

## Scenario: 說明文字中出現 MUST NOT 不應觸發（keyword 在解釋語境中）

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含行 `💡 如需使用 MUST NOT 的場景，請改用 ⛔ 標記`
WHEN hook 掃描該檔案內容
THEN 不應觸發任何警告（MUST NOT 出現在說明文字中，而非作為指令強度標記）
AND result 為空字串 `""`

---

## Scenario: 說明文字中討論 emoji 對應表不應觸發

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容包含如下說明行：`| 💡 軟引導 | should, prefer | 最佳實踐 |`
AND 該行是表格中的 emoji 對應說明，並非實際指令
WHEN hook 掃描該檔案內容
THEN 不應觸發警告（Markdown 表格中的說明行不是指令）
AND result 為空字串 `""`

---

## Scenario: 非 .md 檔案操作不觸發措詞偵測

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑為 `scripts/lib/instinct.js`（不以 `.md` 結尾）
AND 檔案內容包含字串 `// 💡 MUST handle error cases`
WHEN hook 處理此事件
THEN 不執行任何措詞掃描
AND result 為空字串 `""`
AND hook 不向 Instinct 系統 emit 任何 `wording_mismatch` 觀察

---

## Scenario: .ts 檔案操作不觸發措詞偵測

GIVEN PostToolUse hook 接收到一個 Write 工具操作事件
AND 操作的目標檔案路徑為 `src/types.ts`（不以 `.md` 結尾）
AND 檔案內容包含 `💡 MUST` 等字串
WHEN hook 處理此事件
THEN 不執行任何措詞掃描
AND result 為空字串 `""`

---

## Scenario: Bash 工具操作 .md 相關指令不觸發措詞偵測

GIVEN PostToolUse hook 接收到一個 Bash 工具操作事件（tool_name 為 "Bash"）
AND 指令為 `cat docs/guide.md`
AND 檔案讀取的輸出中包含 `💡 MUST`
WHEN hook 處理此事件
THEN 不執行任何措詞掃描（Bash 不屬於 Edit/Write 工具）
AND result 為空字串 `""`

---

## Scenario: Read 工具操作 .md 檔案不觸發措詞偵測

GIVEN PostToolUse hook 接收到一個 Read 工具操作事件（tool_name 為 "Read"）
AND 操作的目標檔案路徑以 `.md` 結尾
AND 工具回應中包含 `💡 MUST`
WHEN hook 處理此事件
THEN 不執行任何措詞掃描（Read 不屬於 Edit/Write 工具）
AND result 為空字串 `""`

---

## Scenario: Grep 工具操作不觸發措詞偵測

GIVEN PostToolUse hook 接收到一個 Grep 工具操作事件（tool_name 為 "Grep"）
AND 搜尋目標包含 `.md` 檔案
AND 搜尋結果包含 `💡 MUST` 的匹配行
WHEN hook 處理此事件
THEN 不執行任何措詞掃描（Grep 不屬於 Edit/Write 工具）

---

# Feature: PostToolUse Hook — 輸出格式

## Scenario: 有不匹配時 result 包含完整警告資訊

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案第 12 行內容為 `💡 MUST validate all inputs before processing`
WHEN hook 偵測到不匹配
THEN result 字串必須包含標頭 `[Overtone 措詞檢查]`
AND result 必須包含行號資訊（如 `第 12 行`）
AND result 必須包含原始行完整內容
AND result 必須包含修正建議（明確指出應改用哪個 emoji 或哪個關鍵字）

---

## Scenario: 單一檔案多處不匹配時 result 包含所有違規行

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案第 5 行為 `💡 MUST do X`
AND 檔案第 20 行為 `📋 consider doing Y`
AND 檔案第 35 行為 `⛔ should avoid Z`
WHEN hook 掃描該檔案
THEN result 包含三處違規的完整資訊（行號、原始行、修正建議各三條）
AND result 的開頭包含 `[Overtone 措詞檢查]`

---

## Scenario: 無不匹配時 result 為空字串

GIVEN PostToolUse hook 接收到一個 Edit 工具操作事件
AND 操作的目標檔案路徑以 `.md` 結尾
AND 檔案內容全部使用正確的 emoji-關鍵字搭配
WHEN hook 掃描該檔案
THEN result 為空字串 `""`
AND hook 不向 Instinct 系統 emit 任何 `wording_mismatch` 觀察

---

## Scenario: Instinct emit 的觀察格式

GIVEN PostToolUse hook 偵測到至少一處 emoji-關鍵字不匹配
WHEN hook 向 Instinct 系統 emit 觀察
THEN emit type 為 `"wording_mismatch"`
AND emit tag 為 `"emoji-keyword"`
AND emit 的 trigger 包含檔案路徑資訊
AND emit 的 action 描述偵測到的不匹配種類

---

# Feature: wording-guide.md — 文件存在性與完整性

## Scenario: wording-guide.md 文件必須存在

GIVEN 專案目錄為 `/Users/sbu/projects/overtone`
WHEN 檢查路徑 `docs/reference/wording-guide.md`
THEN 該檔案存在於檔案系統中
AND 檔案大小大於 0 bytes

---

## Scenario: wording-guide.md 包含決策樹章節

GIVEN wording-guide.md 檔案存在
WHEN 讀取檔案內容
THEN 內容包含決策樹相關章節（標題包含「決策樹」、「Decision Tree」或類似措詞）
AND 決策樹章節提供選擇 emoji 的明確判斷流程（如：若規則可違反 → 使用 `💡`）

---

## Scenario: wording-guide.md 包含反模式清單

GIVEN wording-guide.md 檔案存在
WHEN 讀取檔案內容
THEN 內容包含反模式相關章節（標題包含「反模式」、「Anti-pattern」或類似措詞）
AND 反模式清單明確列出至少三種錯誤搭配範例
AND 每個反模式說明為何這是錯誤的

---

## Scenario: wording-guide.md 包含場景範例庫

GIVEN wording-guide.md 檔案存在
WHEN 讀取檔案內容
THEN 內容包含場景範例相關章節（標題包含「範例」、「Example」、「場景」或類似措詞）
AND 範例庫提供正確搭配的具體使用情境（至少三個正確範例）
AND 範例庫包含可供對照的錯誤範例

---

## Scenario: wording-guide.md 包含完整的 emoji 強度對應表

GIVEN wording-guide.md 檔案存在
WHEN 讀取檔案內容
THEN 內容包含四個 emoji 的強度定義（`⛔`、`📋`、`💡`、`🔧`）
AND 每個 emoji 的定義包含：對應強度層級、允許使用的關鍵字清單、適用場景

---

# Feature: Code Reviewer Agent — 措詞審查整合

## Scenario: Code Reviewer 必須在審查 .md 檔案時執行措詞檢查

GIVEN code-reviewer agent 收到包含 .md 檔案變更的 developer Handoff
WHEN code-reviewer 執行 REVIEW 階段
THEN code-reviewer 必須對每個修改的 .md 檔案執行措詞正確性審查
AND 審查必須涵蓋三個 pattern：`💡+MUST/ALWAYS/NEVER`、`📋+consider/may/could`、`⛔+should/consider/may/prefer/could`
AND 發現不匹配時，在 Findings 中列出具體的違規行和修正建議

---

## Scenario: Code Reviewer 發現措詞問題時應 REJECT

GIVEN code-reviewer agent 審查的 .md 檔案包含 `💡 MUST` 不匹配
AND 信心度高於 80%（措詞不匹配是明確的規格違反）
WHEN code-reviewer 做出最終判定
THEN 判定結果為 REJECT
AND Handoff 的 Findings 包含：違規的 emoji-關鍵字搭配、行號、修正建議

---

## Scenario: Code Reviewer 僅審查 .md 檔案，不審查程式碼中的 emoji 字串

GIVEN code-reviewer agent 審查的變更包含 .js 檔案
AND .js 檔案中的程式碼字串包含 `"💡 MUST"` 作為測試資料
WHEN code-reviewer 執行措詞審查
THEN 不將 .js 檔案中的 emoji 字串視為措詞問題（程式碼中的字串不是指令）
AND 僅針對 .md 檔案執行措詞正確性審查
