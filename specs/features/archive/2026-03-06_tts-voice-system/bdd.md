# Feature: TTS Voice System

TTS 語音系統提供三層模組架構：OS 底層封裝（tts.js）、事件模板映射（tts-templates.js）、策略引擎（tts-strategy.js），以及與既有 Hook 的整合。

---

## 模組一：tts.js — macOS say 封裝

### Scenario: macOS 平台阻塞式朗讀成功
GIVEN 當前平台為 macOS（darwin）
AND execSync 注入 stub 不拋出例外
WHEN 呼叫 speak("你好")
THEN 回傳 `{ ok: true, voice: <string>, text: "你好" }`
AND execSync 被呼叫一次，指令包含 "say"

### Scenario: 指定語音朗讀
GIVEN 當前平台為 macOS
AND execSync 注入 stub
WHEN 呼叫 speak("hello", { voice: "Alex" })
THEN 回傳 `{ ok: true }`
AND execSync 被呼叫的指令包含 "-v Alex"

### Scenario: 指定語速朗讀
GIVEN 當前平台為 macOS
AND execSync 注入 stub
WHEN 呼叫 speak("test", { rate: 300 })
THEN 回傳 `{ ok: true }`
AND execSync 被呼叫的指令包含 "-r 300"

### Scenario: 非 macOS 平台朗讀回傳 UNSUPPORTED_PLATFORM
GIVEN 當前平台為非 darwin（例如 linux）
WHEN 呼叫 speak("test")
THEN 回傳 `{ ok: false, error: "UNSUPPORTED_PLATFORM", message: <string> }`
AND execSync 不被呼叫

### Scenario: 空字串朗讀回傳 INVALID_ARGUMENT
GIVEN 當前平台為 macOS
WHEN 呼叫 speak("")
THEN 回傳 `{ ok: false, error: "INVALID_ARGUMENT", message: <string> }`
AND execSync 不被呼叫

### Scenario: execSync 拋出例外回傳 COMMAND_FAILED
GIVEN 當前平台為 macOS
AND execSync 注入 stub 拋出 Error("say: command not found")
WHEN 呼叫 speak("hello")
THEN 回傳 `{ ok: false, error: "COMMAND_FAILED", message: <string> }`

### Scenario: 背景朗讀成功（非阻塞）
GIVEN 當前平台為 macOS
AND spawn 注入 stub，回傳帶有 unref() 的 child process
WHEN 呼叫 speakBackground("系統啟動")
THEN 回傳 `{ ok: true }`
AND spawn 被呼叫一次
AND unref() 被呼叫（確保 detach）

### Scenario: 背景朗讀非 macOS 平台回傳 UNSUPPORTED_PLATFORM
GIVEN 當前平台為非 darwin
WHEN 呼叫 speakBackground("test")
THEN 回傳 `{ ok: false, error: "UNSUPPORTED_PLATFORM", message: <string> }`
AND spawn 不被呼叫

### Scenario: listVoices 列出可用語音
GIVEN 當前平台為 macOS
AND execSync 注入 stub 回傳 "Alex   en_US  # Most people recognize\nMei-Jia  zh_TW  # ..."
WHEN 呼叫 listVoices()
THEN 回傳 `{ ok: true, voices: [{ name: "Alex", lang: "en_US" }, ...] }`
AND voices 陣列每個元素包含 name 和 lang 欄位

### Scenario: listVoices 空輸出回傳空陣列
GIVEN 當前平台為 macOS
AND execSync 注入 stub 回傳空字串
WHEN 呼叫 listVoices()
THEN 回傳 `{ ok: true, voices: [] }`

### Scenario: CLI speak 指令輸出 JSON
GIVEN CLI 環境（bun scripts/os/tts.js）
AND 當前平台為 macOS
WHEN 執行 `bun scripts/os/tts.js speak "hello"`
THEN stdout 輸出合法 JSON 且包含 `"ok": true`
AND exit code 為 0

### Scenario: CLI list-voices 指令輸出 JSON
GIVEN CLI 環境（bun scripts/os/tts.js）
WHEN 執行 `bun scripts/os/tts.js list-voices`
THEN stdout 輸出合法 JSON 且包含 `"voices"` 陣列
AND exit code 為 0

---

## 模組二：tts-templates.js — 事件模板映射

### Scenario: 已知事件鍵取得插值後模板
GIVEN 模板定義 'agent:complete' 為 '{stage} 完成'
WHEN 呼叫 getTemplate('agent:complete', { stage: 'DEV' })
THEN 回傳字串 "DEV 完成"
AND 回傳字串不包含任何 {key} 佔位符

### Scenario: 無插值參數的模板事件鍵
GIVEN 模板定義 'workflow:complete' 為 '工作流程完成'
WHEN 呼叫 getTemplate('workflow:complete', {})
THEN 回傳 "工作流程完成"
AND 回傳字串不包含 {key} 佔位符

### Scenario: 未知事件鍵回傳 null
GIVEN 模板庫中無 'unknown:event' 定義
WHEN 呼叫 getTemplate('unknown:event')
THEN 回傳 null

### Scenario: getDefinedKeys 回傳所有已定義事件鍵
WHEN 呼叫 getDefinedKeys()
THEN 回傳非空陣列
AND 陣列包含 'agent:complete'、'workflow:complete'、'notification:ask'
AND 陣列包含至少 12 個事件鍵

### Scenario: 多個參數插值正確
GIVEN 模板 'agent:error' 為 '{stage} 失敗'
WHEN 呼叫 getTemplate('agent:error', { stage: 'REVIEW', agent: 'code-reviewer' })
THEN 回傳 "REVIEW 失敗"
AND 回傳字串不包含 {stage} 或 {agent} 佔位符

---

## 模組三：tts-strategy.js — 策略引擎

### Scenario: level=1（CRITICAL）時 error:fatal 應觸發朗讀
GIVEN TTS level 為 1
WHEN 呼叫 shouldSpeak('error:fatal', 1)
THEN 回傳 true

### Scenario: level=1（CRITICAL）時 agent:complete 不觸發朗讀
GIVEN TTS level 為 1
WHEN 呼叫 shouldSpeak('agent:complete', 1)
THEN 回傳 false（agent:complete 屬於 level 2 事件）

### Scenario: level=2（PROGRESS）累積涵蓋 level 1 事件
GIVEN TTS level 為 2
WHEN 分別呼叫 shouldSpeak('error:fatal', 2) 和 shouldSpeak('agent:complete', 2)
THEN 兩者均回傳 true
AND shouldSpeak('session:start', 2) 回傳 false（session:start 屬於 level 3）

### Scenario: level=3（VERBOSE）涵蓋所有事件
GIVEN TTS level 為 3
WHEN 呼叫 shouldSpeak('session:start', 3)
THEN 回傳 true
AND shouldSpeak('session:compact', 3) 回傳 true

### Scenario: level=0（SILENT）任何事件均不觸發
GIVEN TTS level 為 0
WHEN 分別呼叫 shouldSpeak('error:fatal', 0)、shouldSpeak('workflow:complete', 0)
THEN 所有呼叫均回傳 false

### Scenario: buildSpeakArgs 回傳已插值的 text 和 opts
GIVEN 事件鍵 'agent:complete' 有對應模板
WHEN 呼叫 buildSpeakArgs('agent:complete', { stage: 'DEV' }, { voice: 'Mei-Jia', rate: 250 })
THEN 回傳 `{ text: "DEV 完成", opts: { voice: "Mei-Jia", rate: 250 } }`

### Scenario: buildSpeakArgs 對未知事件鍵回傳 null
GIVEN 事件鍵 'unknown:event' 無模板定義
WHEN 呼叫 buildSpeakArgs('unknown:event', {}, {})
THEN 回傳 null

### Scenario: readTtsConfig 無設定檔時回傳預設值
GIVEN ~/.overtone/tts.json 不存在
AND _deps.readConfig 注入 stub 拋出例外（file not found）
WHEN 呼叫 readTtsConfig({ readConfig: stubbedReadConfig })
THEN 回傳 `{ enabled: false, level: 1, voice: null, rate: 200 }`

### Scenario: readTtsConfig 讀取自訂設定並回傳
GIVEN ~/.overtone/tts.json 存在且內容為 `{ enabled: true, level: 2, voice: "Alex", rate: 300 }`
AND _deps.readConfig 注入 stub 回傳上述物件
WHEN 呼叫 readTtsConfig({ readConfig: stubbedReadConfig })
THEN 回傳 `{ enabled: true, level: 2, voice: "Alex", rate: 300 }`

---

## 模組四：Hook 整合

### Scenario: agent-stop-handler 在 enabled+shouldSpeak 條件成立時觸發 TTS
GIVEN ttsConfig.enabled 為 true
AND ttsConfig.level 為 2
AND 事件鍵為 'agent:complete'（屬於 level 2）
AND speakBackground stub 被注入
WHEN agent-stop-handler 處理 agent 完成事件
THEN speakBackground 被呼叫一次
AND 呼叫參數的 text 不為空字串

### Scenario: TTS disabled 時 Hook 不觸發朗讀
GIVEN ttsConfig.enabled 為 false
AND speakBackground stub 被注入
WHEN agent-stop-handler 處理 agent 完成事件
THEN speakBackground 不被呼叫

### Scenario: TTS 呼叫拋出例外時 Hook 主流程不受影響
GIVEN speakBackground stub 拋出 Error("TTS 失敗")
AND ttsConfig.enabled 為 true
WHEN agent-stop-handler 處理 agent 完成事件
THEN Hook 主流程繼續執行（不拋出、不回傳錯誤）
AND agent 狀態記錄正常完成
