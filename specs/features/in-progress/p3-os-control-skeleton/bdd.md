# Feature: P3.0 OS Control 閉環骨架

> 範圍：os-control Skill 建立 + 5 個 Agent 整合 + pre-bash-guard 守衛 + hooks.json 更新
> 建立日期：2026-03-03
> 模式：spec（TEST:spec）

---

## Feature 1：os-control Skill 結構

### Scenario: os-control SKILL.md 存在且 frontmatter 包含必要欄位
GIVEN plugins/overtone/skills/ 目錄下尚未有 os-control 子目錄
WHEN developer 透過 createSkill API 建立 os-control skill
THEN plugins/overtone/skills/os-control/SKILL.md 檔案存在
AND SKILL.md frontmatter 的 name 欄位值為 "os-control"
AND SKILL.md frontmatter 包含 disable-model-invocation: true
AND SKILL.md frontmatter 包含 user-invocable: false

### Scenario: os-control SKILL.md 主體為精簡索引型（不超過 3000 字元）
GIVEN os-control SKILL.md 已建立且採用索引式設計（不含 reference 全文）
WHEN 讀取 SKILL.md 去除 frontmatter 後的主體內容
THEN 主體字元數不超過 3000
AND 主體包含 references 目錄下 4 個 reference 檔案的引用路徑

### Scenario: os-control 的 4 個 reference 檔案均存在
GIVEN os-control SKILL.md 的 references 清單定義了 4 個 reference 檔案
WHEN 驗證檔案系統
THEN plugins/overtone/skills/os-control/references/ 目錄存在
AND 該目錄下恰好存在 4 個 .md 檔案（os-capabilities.md、os-safety.md、applescript-guide.md、computer-use-fallback.md）
AND 4 個 reference 檔案均非空

### Scenario: os-control SKILL.md 的消費者表格列出 5 個 agent
GIVEN os-control SKILL.md 採用標準知識域索引格式（含消費者表格）
WHEN 讀取 SKILL.md 主體內容
THEN 內容包含消費者（Consumers）區塊
AND 消費者表格列出以下 5 個 agent：developer、debugger、build-error-resolver、e2e-runner、refactor-cleaner

### Scenario: validate-agents 驗證新 skill 後不報錯
GIVEN os-control SKILL.md 和 4 個 reference 檔案均已建立
WHEN 執行 bun scripts/validate-agents.js
THEN 驗證輸出不包含 os-control 相關的錯誤
AND 整體驗證結果為通過（exit code 0）

---

## Feature 2：Agent 整合

### Scenario: 5 個 agent 的 frontmatter skills 陣列均包含 os-control
GIVEN developer、debugger、build-error-resolver、e2e-runner、refactor-cleaner 5 個 agent .md 尚未包含 os-control
WHEN developer 透過 updateAgent API 將 os-control 加入各 agent 的 skills 陣列
THEN 5 個 agent .md 的 frontmatter 中 skills 陣列均包含 "os-control"

### Scenario: 已有 skill 不被覆蓋（developer 的 commit-convention 和 wording 仍存在）
GIVEN developer agent 原本的 skills 陣列包含 ["commit-convention", "wording"]
WHEN developer 將 os-control 加入 developer agent 的 skills 陣列
THEN developer agent 的 skills 陣列同時包含 "os-control"、"commit-convention"、"wording" 三個元素
AND skills 陣列元素總數正確（無重複、無遺漏）

### Scenario: validate-agents 在 5 個 agent 更新後通過
GIVEN 5 個 agent frontmatter 已加入 os-control
WHEN 執行 bun scripts/validate-agents.js
THEN 5 個 agent 的 skill 欄位驗證通過
AND 輸出顯示 skill 引用存在且一致（os-control/SKILL.md 可被查找到）

---

## Feature 3：pre-bash-guard 守衛

### Scenario: 黑名單命令送入守衛後回傳 deny 並附說明
GIVEN pre-bash-guard.js 已建立，內建 10 條黑名單 regex（含 \b 邊界）
WHEN 傳入 tool_input.command = "rm -rf /"
THEN 守衛輸出 hookSpecificOutput.permissionDecision = "deny"
AND 輸出包含 permissionDecisionReason 說明（含命令名稱和禁止原因）

### Scenario: 正常的開發命令送入守衛後回傳 allow
GIVEN pre-bash-guard.js 已建立，黑名單只覆蓋危險的系統指令
WHEN 傳入 tool_input.command = "bun test"
THEN 守衛輸出 permissionDecision = "allow"
AND 不包含 permissionDecisionReason（或 reason 為空）

### Scenario: 空 command 欄位送入守衛後回傳 allow
GIVEN pre-bash-guard.js 初始化並讀取 stdin
WHEN 傳入 tool_input.command = ""（空字串）
THEN 守衛輸出 permissionDecision = "allow"（空命令不阻擋）

### Scenario: 缺少 command 欄位的 tool_input 送入守衛後回傳 allow
GIVEN pre-bash-guard.js 初始化並讀取 stdin
WHEN 傳入 tool_input 物件中完全沒有 command 欄位
THEN 守衛輸出 permissionDecision = "allow"（防止守衛因缺欄位而崩潰或誤 deny）

### Scenario: 組合命令中若有子命令命中黑名單則整體 deny
GIVEN pre-bash-guard.js 的黑名單規則使用 \b 詞邊界做精準比對
WHEN 傳入 tool_input.command = "echo hello && rm -rf / && echo done"
THEN 守衛偵測到 "rm -rf /" 在命令字串中出現
AND 輸出 permissionDecision = "deny"
AND permissionDecisionReason 說明哪條規則被命中

### Scenario: 10 條黑名單規則逐一驗證 deny 行為
GIVEN pre-bash-guard.js 建立了以下 10 條黑名單：
  | 命令樣式                 | 預期 |
  | rm -rf /                | deny |
  | mkfs                    | deny |
  | dd if=foo of=/dev/sda   | deny |
  | kill -9 1               | deny |
  | killall -9 bash         | deny |
  | chmod 777 /             | deny |
  | passwd root             | deny |
  | visudo                  | deny |
  | iptables -F             | deny |
  | ifconfig eth0 down      | deny |
WHEN 分別傳入上述每條命令
THEN 每一條均回傳 permissionDecision = "deny"

### Scenario: node scripts/ 路徑的命令送入守衛後回傳 allow（非黑名單）
GIVEN pre-bash-guard.js 的黑名單僅覆蓋系統破壞性操作
WHEN 傳入 tool_input.command = "node scripts/health-check.js"
THEN 守衛輸出 permissionDecision = "allow"

---

## Feature 4：hooks.json 結構

### Scenario: hooks.json 的 PreToolUse 陣列包含 Bash 事件 matcher
GIVEN hooks.json 原本有 PreToolUse 事件但無 Bash matcher
WHEN developer 透過 createHook API 追加 Bash matcher
THEN hooks.json 的 hooks.PreToolUse 陣列中存在一個 entry，其 matcher 值為 "Bash"
AND 該 entry 的 hooks 陣列包含一個 command 指向 pre-bash-guard.js

### Scenario: hooks.json 維持官方三層嵌套格式（不退化為扁平格式）
GIVEN hooks.json 使用官方格式 { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
WHEN 驗證 hooks.json 結構
THEN 頂層有且僅有 "hooks" 欄位
AND hooks.PreToolUse 的值為陣列
AND 陣列每個元素含 hooks 子陣列（不是直接含 event/type/command 的扁平物件）

### Scenario: Bash matcher 的 command 路徑指向正確的守衛腳本
GIVEN hooks.json 中 Bash matcher entry 已建立
WHEN 讀取該 entry 的 hooks[0].command 值
THEN 路徑包含 "pre-bash-guard.js"
AND 路徑指向 plugins/overtone/hooks/scripts/tool/ 目錄下的檔案

### Scenario: hooks.json 新增 Bash matcher 後守衛測試通過（guard-coverage 仍通過）
GIVEN hooks.json 加入 Bash matcher 後，guard-coverage.test.js 會掃描 hook 整合覆蓋
WHEN 執行 bun test tests/unit/guard-coverage.test.js
THEN 測試全數通過，無新增失敗項目

---

## Feature 5：閉環驗證

### Scenario: buildSkillContext 能讀取 os-control SKILL.md 摘要
GIVEN os-control SKILL.md 已建立且 agent .md 的 skills 陣列含 "os-control"
WHEN pre-task.js 的 buildSkillContext 函式以 developer agent 為輸入執行
THEN 函式回傳非 null 的 skill context 字串
AND 回傳字串包含 "os-control" 相關內容（從 SKILL.md 摘要注入）

### Scenario: Agent 啟動時 prompt 中包含 os-control 知識摘要
GIVEN developer agent 的 skills 陣列已包含 "os-control"
AND pre-task.js 在 PreToolUse(Task) 事件中注入 skill context
WHEN 一個 developer subagent 被啟動（PreToolUse Task 事件觸發）
THEN pre-task.js 輸出的 updatedInput.prompt 包含 os-control SKILL.md 摘要內容
AND 摘要注入不超過 2400 字元上限（多 skill 時截斷規則生效）

### Scenario: 5 個 agent 啟動時均能獲得 os-control 注入（不因缺欄位而跳過）
GIVEN developer、debugger、build-error-resolver、e2e-runner、refactor-cleaner 均已更新 skills
WHEN 分別以 5 個 agent 類型觸發 buildSkillContext
THEN 5 個 agent 均回傳包含 os-control 內容的非空 skill context
AND 無任何 agent 因 os-control SKILL.md 不存在而靜默跳過（檔案已存在）

### Scenario: 整體測試套件在 P3.0 骨架建立後仍全數通過
GIVEN P3.0 建立前測試套件為 2695 pass / 0 fail（115 個測試檔）
WHEN developer 完成所有 5 項交付物後執行 bun test
THEN 測試結果 pass 數量大於等於 2695（新增測試後增加）
AND 測試結果 fail 數量為 0
AND 整合測試 tests/integration/pre-bash-guard.test.js 全數通過
