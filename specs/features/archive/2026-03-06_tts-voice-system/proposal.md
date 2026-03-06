# Proposal: tts-voice-system

## 功能名稱

`tts-voice-system`

## 需求背景（Why）

- **問題**：Overtone 目前只有視覺通知（Dashboard）和音效通知（afplay 播放系統音效），缺乏語音輸出能力。使用者背對螢幕工作時，無法從語音得知 workflow 進度；長時間任務完成時只有 Hero.aiff 音效，資訊量不足。
- **目標**：讓 Overtone 能以口語說出工作進度（「開發階段完成了，準備進入審查」），使用者可配置語音通知等級（level 0-3），在最少干擾和最豐富資訊間自由調節。
- **優先級**：Layer 3 完成後的體驗增強，與既有 sound.js + notification.js 架構方向一致，複用度高。

## 使用者故事

```
身為 Overtone 使用者
我想要在 workflow 關鍵節點聽到語音播報
以便在背對螢幕時仍能掌握工作進度
```

```
身為 Overtone 使用者
我想要配置語音通知等級（level 0-3）
以便根據工作場景調節語音干擾程度
```

```
身為 Overtone 開發者
我想要透過 `bun scripts/os/tts.js` CLI 直接呼叫語音
以便在任意腳本中整合 TTS 能力
```

## 範圍邊界

### 在範圍內（In Scope）

- `scripts/os/tts.js` — 核心 TTS 模組（speak / listVoices / CLI 入口）
- macOS `say` 指令封裝：非阻塞（spawn + detach）、依賴注入、不 throw
- 平台檢測：darwin only，非 darwin 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM' }`
- 參數支援：voice（指定語音）、rate（語速）
- 中文語音自動偵測（從 listVoices 結果篩選 zh 語系語音）
- 空字串防禦：speak("") 回傳 `{ ok: false, error: 'INVALID_ARGUMENT' }`
- CLI 入口：`bun scripts/os/tts.js speak "文字"` 輸出 JSON 到 stdout
- `scripts/lib/tts-templates.js` — 自然口語模板（助理風格，中文）
- 事件語音策略三級過濾器（level 1-3 定義）
- 配置：透過現有 config-api 讀寫 `tts.level`（預設 0 = 關閉）
- Hook 整合：SubagentStop（stage 完成）、Stop（workflow 完成）、Notification（AskUserQuestion）觸發語音
- 單元測試：tts.js / tts-templates.js / hook 整合點

### 不在範圍內（Out of Scope）

- Windows / Linux TTS（非 macOS 平台不在此版本）
- 串流 TTS（長文本分段播放）
- 自訂語音模型（僅用 macOS 內建 `say` 指令）
- 語音辨識 / STT
- Dashboard UI 語音控制介面
- 多語系模板（此版本僅繁體中文）

## 驗收標準（BDD）

| 場景 | 條件 | 預期 |
|------|------|------|
| 基本播報 | macOS + speak("你好") | say 被呼叫，回傳 `{ ok: true }` |
| 指定語音 | speak("hello", { voice: "Alex" }) | say -v Alex 被呼叫 |
| 指定語速 | speak("test", { rate: 200 }) | say -r 200 被呼叫 |
| 非 macOS | speak("test") | `{ ok: false, error: "UNSUPPORTED_PLATFORM" }` |
| 空字串 | speak("") | `{ ok: false, error: "INVALID_ARGUMENT" }` |
| CLI | `bun scripts/os/tts.js speak "hello"` | JSON 輸出到 stdout |
| level=1 | workflow 完成 | 語音播報「workflow 完成」 |
| level=2 | stage 開始 | 語音播報 stage 名稱 |
| level=0 | 任何事件 | 不播報 |

## 子任務清單

1. **建立 tts.js 核心模組**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/os/tts.js`
   - 說明：仿照 notification.js 結構，封裝 macOS `say` 指令。speak() 使用 spawn + detach 非阻塞，listVoices() 用 `say --voice=?` 解析語音列表。依賴注入 `_deps = { spawn }` 供測試替換。CLI 入口解析 positional args（speak / list-voices）並輸出 JSON。

2. **建立 tts-templates.js 口語模板**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/tts-templates.js`
   - 說明：定義事件鍵 → 口語模板對應表（stage:completed, workflow:completed, ask:user 等）。模板函式接受參數（如 stageName）回傳自然口語字串。提供 `getTemplate(eventKey, params)` 統一入口，找不到 key 回傳 null（不播報）。

3. **建立事件語音策略模組**（依賴 1、2）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/tts-strategy.js`
   - 說明：定義三級策略（LEVEL_MAP）：level 1 = workflow:completed + ask:user + error:critical；level 2 = level 1 + stage:started + stage:completed；level 3 = level 2 + 所有通知管道。提供 `shouldSpeak(eventKey, level)` 判斷是否播報、`buildSpeakArgs(eventKey, params, level)` 組合 text + opts。從 config-api 讀取 `tts.level` 配置（預設 0）。

4. **Hook 整合 — SubagentStop + Stop + Notification**（依賴 3）
   - 負責 agent：developer
   - 相關檔案：
     - `plugins/overtone/scripts/lib/agent-stop-handler.js`
     - `plugins/overtone/scripts/lib/session-stop-handler.js`
     - `plugins/overtone/hooks/scripts/notification/on-notification.js`
   - 說明：在 agent-stop-handler.js 的 stage completed 路徑呼叫 tts-strategy（stage:completed / stage:started）；在 session-stop-handler.js 的 workflow 完成路徑呼叫（workflow:completed）；在 on-notification.js 的 elicitation_dialog 路徑呼叫（ask:user）。所有呼叫在 playSound 同一位置附近，保持非阻塞。

5. **單元測試**（依賴 1、2、3、4）
   - 負責 agent：tester
   - 相關檔案：
     - `tests/unit/os/tts.test.js`
     - `tests/unit/lib/tts-templates.test.js`
     - `tests/unit/lib/tts-strategy.test.js`
   - 說明：tts.js 測試覆蓋全 BDD 場景（依賴注入替換 spawn）；tts-templates.js 測試各事件鍵回傳正確字串；tts-strategy.js 測試 shouldSpeak 在各 level 下的過濾邏輯。

## 開放問題

- **中文語音自動偵測策略**：listVoices 結果中如何可靠識別繁體中文語音（zh-TW）？是否需要 fallback 到系統預設？（交 architect 決定）
- **config-api 整合方式**：tts.level 配置是讀 `~/.overtone/config.json` 的一級欄位還是巢狀 `tts.level`？現有 config-api 是否已支援巢狀讀寫？（交 architect 確認）
- **Hook 整合侵入度**：在 agent-stop-handler 和 session-stop-handler 直接 require tts-strategy，還是抽象為可注入的 side-effect hook？（交 architect 決定）
- **level=3 定義**：「所有通知管道的語音版本」在 PostToolUse hook 是否也需要整合？或只限 SubagentStop / Stop / Notification 三個 hook？（需 PM 確認）
