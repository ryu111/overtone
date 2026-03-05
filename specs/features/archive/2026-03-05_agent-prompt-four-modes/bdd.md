# Feature: Agent Prompt 四模式補齊

## 背景

14 個 agent 的 prompt 需補齊四模式要素（信心過濾、邊界清單（DO/DON'T）、誤判防護、停止條件）。
目標：`validate-agents.js` prompt 品質檢查從 23 個警告降為 0。

---

## Scenario: validate-agents.js 四模式 prompt 品質檢查應全部通過

GIVEN 14 個 agent 已透過 `manage-component.js update agent` 完成四模式補齊
WHEN 執行 `bun plugins/overtone/scripts/validate-agents.js`
THEN 「Prompt 品質檢查」區塊輸出「✅ 所有 agent prompt 包含四模式要素」
AND 終端輸出中不含任何「⚠️」prompt 品質警告
AND process.exit code 為 0

---

## Scenario: 類型 A agent 的誤判防護章節存在且位於正確位置

GIVEN architect、debugger、developer、planner、retrospective、tester 六個 agent
WHEN 讀取每個 agent 的 .md 檔案正文（frontmatter 之後的內容）
THEN 每個 agent 的正文包含「## 誤判防護」章節標題
AND 「## 誤判防護」章節出現在「## DON'T」章節之後
AND 「## 誤判防護」章節出現在「## 輸入」章節之前（若存在）
AND 每個章節下包含描述誤判情況的表格（至少 3 行）

---

## Scenario: 類型 B agent 同時具備信心過濾與誤判防護章節

GIVEN build-error-resolver、designer、doc-updater、e2e-runner 四個 agent
WHEN 讀取每個 agent 的 .md 檔案正文
THEN 每個 agent 的正文包含「## 信心過濾」章節（標題包含「80%」或「規則」等關鍵字）
AND 每個 agent 的正文包含「## 誤判防護」章節
AND 「## 信心過濾」章節出現在「## 誤判防護」章節之前
AND 兩個章節都出現在「## DON'T」章節之後

---

## Scenario: 類型 C agent（qa、refactor-cleaner、claude-developer）具備信心過濾與誤判防護

GIVEN qa、refactor-cleaner、claude-developer 三個 agent
WHEN 讀取每個 agent 的 .md 檔案正文
THEN qa 的正文包含「## 信心過濾」且提及「≥80%」或「FAIL」門檻
AND refactor-cleaner 的正文包含「## 信心過濾」且提及「≥90%」的刪除/重構門檻
AND claude-developer 的正文包含「## 信心過濾」且提及「閉環確認」
AND 三個 agent 的正文都包含「## 誤判防護」章節

---

## Scenario: security-reviewer 只加信心過濾（不加誤判防護）

GIVEN security-reviewer agent
WHEN 讀取其 .md 檔案正文
THEN 正文包含「## 信心過濾」章節
AND 信心過濾章節包含 Critical / Medium / Low 等級說明
AND 正文不需要包含「## 誤判防護」章節（security-reviewer 無此需求）

---

## Scenario: grader 加入精簡版邊界清單、信心過濾與誤判防護

GIVEN grader agent（maxTurns: 5 的輕量 agent）
WHEN 讀取其 .md 檔案正文
THEN 正文包含「## 信心過濾」章節
AND 信心過濾章節提及 clarity、completeness、actionability 三個評分維度
AND 正文包含「## 誤判防護」章節
AND grader 的 DON'T 行包含「不修改任何程式碼」和「MUST NOT 寫 Handoff」

---

## Scenario: 修改後所有 agent frontmatter 保持不變

GIVEN 14 個被修改的 agent
WHEN 讀取每個 agent 的 .md 檔案 frontmatter（YAML 頭部）
THEN name、model、permissionMode、color、maxTurns 欄位與修改前相同
AND skills、disallowedTools、tools 等欄位與修改前相同
AND frontmatter 格式為合法的 YAML（以 `---` 包圍）

---

## Scenario: 修改後原有的 DO/DON'T 內容仍然存在

GIVEN architect、debugger、developer、planner、retrospective、tester 六個類型 A agent
WHEN 讀取每個 agent 的 .md 檔案正文
THEN 每個 agent 原有的「## DO」章節內容不被覆蓋
AND 每個 agent 原有的「## DON'T」章節內容不被覆蓋
AND 停止條件章節（## 停止條件）仍然存在

---

## Scenario: validate-agents.js 結構驗證仍然全部通過（無 errors）

GIVEN 14 個 agent 已完成四模式補齊
WHEN 執行 `bun plugins/overtone/scripts/validate-agents.js`
THEN totalErrors 為 0（validate-agents.js 以 exit 0 結束）
AND 所有 agent 的 frontmatter 必填欄位驗證通過（name/description/model/permissionMode/color/maxTurns）
AND model 與 registry agentModels 一致
AND permissionMode 全部為 bypassPermissions

---

## Scenario: 章節順序符合設計規範（DO → DON'T → 信心過濾 → 誤判防護）

GIVEN 具備信心過濾和誤判防護的 agent（類型 B、C、grader）
WHEN 解析 agent 正文中各章節的出現位置（字元偏移量）
THEN 「## DO」出現在「## DON'T」之前
AND 「## DON'T」出現在「## 信心過濾」之前（若存在）
AND 「## 信心過濾」出現在「## 誤判防護」之前
AND 「## 誤判防護」出現在「## 輸入」之前（若存在）
AND 「## 輸入」出現在「## 輸出」之前（若存在）
AND 「## 停止條件」為最後一個主章節

---

## Scenario: 全量測試套件執行後仍通過（回歸驗證）

GIVEN 14 個 agent 的 prompt 已完成修改
WHEN 從專案根目錄執行 `bun test`
THEN 所有既有測試仍通過（總數不少於修改前）
AND 不得有新的測試失敗項目
AND config-api 相關測試（agent 結構驗證）仍全部通過
