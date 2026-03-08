# Feature: fix-hook-output-format

修復 4 個 hook handler 的 output 格式，加上 `hookSpecificOutput.additionalContext`，
使 Claude 的 API 能正確接收 hook 注入的 context。

> PreCompact 不支援 hookSpecificOutput（已在 fix-hook-schema-validation 移除）。

---

## Scenario: SessionStart 有 msgs 時包含 hookSpecificOutput
GIVEN `buildStartOutput` 收到非空的 `msgs` 陣列
WHEN 函式組裝輸出物件
THEN `output.hookSpecificOutput` 存在
AND `output.hookSpecificOutput.hookEventName` 等於 `'SessionStart'`
AND `output.hookSpecificOutput.additionalContext` 等於 `systemMessage` 的值

## Scenario: SessionStart 無 msgs 時不包含 hookSpecificOutput
GIVEN `buildStartOutput` 收到空的 `msgs` 陣列
WHEN 函式組裝輸出物件
THEN `output.hookSpecificOutput` 不存在
AND `output.systemMessage` 不存在

## Scenario: UserPromptSubmit 有 systemMessage 時包含 hookSpecificOutput
GIVEN `handleOnSubmit` 收到一般使用者 prompt（非 `/ot:` 指令）
WHEN 函式組裝輸出物件且 `systemMessage` 有實質內容
THEN `output.hookSpecificOutput.hookEventName` 等於 `'UserPromptSubmit'`
AND `output.hookSpecificOutput.additionalContext` 等於 `systemMessage` 的值

## Scenario: UserPromptSubmit /ot: 指令時無 hookSpecificOutput
GIVEN `handleOnSubmit` 收到以 `/ot:` 開頭的 prompt
WHEN 函式提早返回
THEN 回傳 `{ result: '' }`
AND `hookSpecificOutput` 不存在

## Scenario: UserPromptSubmit [workflow:xxx] 覆寫時 additionalContext 包含覆寫資訊
GIVEN `handleOnSubmit` 收到含 `[workflow:quick]` 語法的 prompt
WHEN 解析出有效的 workflow 覆寫 key
THEN `output.hookSpecificOutput.additionalContext` 包含該 workflow 的名稱
AND `output.hookSpecificOutput.hookEventName` 等於 `'UserPromptSubmit'`

## Scenario: PostToolUseFailure CRITICAL_TOOLS 失敗時包含 hookSpecificOutput
GIVEN `handlePostUseFailure` 收到 Task/Write/Edit 工具失敗
AND `is_interrupt` 為 `false`
AND 有有效的 `session_id`
WHEN 函式組裝輸出物件
THEN `output.hookSpecificOutput.hookEventName` 等於 `'PostToolUseFailure'`
AND `output.hookSpecificOutput.additionalContext` 等於 `output.result` 的值

## Scenario: PostToolUseFailure 非 CRITICAL_TOOLS 失敗時無 hookSpecificOutput
GIVEN `handlePostUseFailure` 收到 Bash/Grep 等非重大工具失敗
WHEN 函式組裝輸出物件
THEN `output.result` 等於 `''`
AND `output.hookSpecificOutput` 不存在

## Scenario: PostToolUseFailure is_interrupt 時無 hookSpecificOutput
GIVEN `handlePostUseFailure` 收到任意工具失敗
AND `is_interrupt` 為 `true`
WHEN 函式提早返回
THEN `output.hookSpecificOutput` 不存在

## Scenario: PostToolUse Bash 重大失敗時包含 hookSpecificOutput
GIVEN `handlePostUse` 收到 Bash 工具的回應
AND `exit_code` 非零且 `stderr` 包含實質錯誤訊息（> 20 字）
AND 是重要的建構指令（如 `bun test`）
WHEN 函式偵測到重大 Bash 錯誤
THEN `output.hookSpecificOutput.hookEventName` 等於 `'PostToolUse'`
AND `output.hookSpecificOutput.additionalContext` 等於 `output.result` 的值

## Scenario: PostToolUse wording 不匹配時包含 hookSpecificOutput
GIVEN `handlePostUse` 收到 Write/Edit 工具操作了 `.md` 檔案
AND 該檔案內容存在 emoji-關鍵詞不匹配（wording-guide 定義的違規組合）
WHEN 函式偵測到 wording 問題
THEN `output.hookSpecificOutput.hookEventName` 等於 `'PostToolUse'`
AND `output.hookSpecificOutput.additionalContext` 等於 `output.result` 的值

## Scenario: PostToolUse 無副作用時無 hookSpecificOutput
GIVEN `handlePostUse` 收到 Bash 工具成功執行（exit_code=0）
WHEN 函式組裝輸出物件
THEN `output.result` 等於 `''`
AND `output.hookSpecificOutput` 不存在
