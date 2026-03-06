---
feature: tts-voice-system
status: archived
workflow: standard
created: 2026-03-06T01:33:34.536Z
archivedAt: 2026-03-06T01:45:32.090Z
---
## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [x] DOCS

## Tasks

## Dev Phases

### Phase 1: 底層模組建立 (parallel)
- [ ] 建立 tts.js — macOS say 封裝（speak / speakBackground / listVoices + CLI 入口） | files: plugins/overtone/scripts/os/tts.js
- [ ] 建立 tts-templates.js — 事件鍵模板映射（getTemplate / getDefinedKeys） | files: plugins/overtone/scripts/lib/tts-templates.js

### Phase 2: 策略引擎建立 (sequential)
- [ ] 建立 tts-strategy.js — shouldSpeak / buildSpeakArgs / readTtsConfig + TTS_LEVELS 定義 | files: plugins/overtone/scripts/lib/tts-strategy.js

### Phase 3: Hook 整合 (parallel)
- [ ] 整合 agent-stop-handler.js — agent:complete / agent:error 觸發 TTS | files: plugins/overtone/scripts/lib/agent-stop-handler.js
- [ ] 整合 session-stop-handler.js — workflow:complete 觸發 TTS | files: plugins/overtone/scripts/lib/session-stop-handler.js
- [ ] 整合 on-notification.js — notification:ask 觸發 TTS | files: plugins/overtone/hooks/scripts/notification/on-notification.js

### Phase 4: 單元測試 (parallel)
- [ ] 撰寫 tts.test.js — OS 層測試（speak/speakBackground/listVoices + 平台守衛） | files: tests/unit/tts.test.js
- [ ] 撰寫 tts-templates.test.js — 模板插值與邊界測試 | files: tests/unit/tts-templates.test.js
- [ ] 撰寫 tts-strategy.test.js — shouldSpeak level 邊界 + buildSpeakArgs + readTtsConfig 預設值 | files: tests/unit/tts-strategy.test.js
