# TTS Voice System — 技術設計

## 技術摘要（What & Why）

- **方案**：三層模組架構 — `scripts/os/tts.js`（底層 macOS 封裝）+ `scripts/lib/tts-templates.js`（事件模板）+ `scripts/lib/tts-strategy.js`（策略引擎）
- **理由**：與現有 OS 腳本慣例（screenshot.js、notification.js）完全對齊；`sound.js` 已示範 spawn+detach 非阻塞模式；config 持久化走 `~/.overtone/tts.json`（獨立 JSON，不污染 workflow.json）
- **取捨**：三個獨立模組增加少量檔案數，換來可單元測試性、職責分離、以及 Hook 整合時可只 require strategy 層而不感知底層細節

## API 介面設計

### 模組 1: `scripts/os/tts.js`

```javascript
/**
 * tts.js — macOS TTS 能力
 *
 * 使用 macOS `say` 指令進行語音合成。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync, spawnSync } 供測試替換。
 *
 * CLI 入口：
 *   bun scripts/os/tts.js speak "文字" [--voice Alex] [--rate 200]
 *   bun scripts/os/tts.js speak-bg "文字" [--voice Alex] [--rate 200]
 *   bun scripts/os/tts.js list-voices
 */

/**
 * 語音朗讀（阻塞，等待完成）
 * @param {string} text - 朗讀文字（必填）
 * @param {object} [opts]
 * @param {string} [opts.voice]      - 語音名稱（預設系統語音）
 * @param {number} [opts.rate]       - 語速 wpm（預設 200）
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, voice: string, text: string }
 *           |{ ok: false, error: string, message: string }}
 */
function speak(text, opts = {}, _deps = {}) { ... }

/**
 * 語音朗讀（非阻塞，fire-and-forget）
 * 使用 spawn + detach，立即回傳不等待完成。
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.voice]
 * @param {number} [opts.rate]
 * @param {object} [_deps]
 * @param {Function} [_deps.spawn]
 * @returns {{ ok: true }|{ ok: false, error: string, message: string }}
 */
function speakBackground(text, opts = {}, _deps = {}) { ... }

/**
 * 列出可用語音
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, voices: Array<{ name: string, lang: string }> }
 *           |{ ok: false, error: string, message: string }}
 */
function listVoices(_deps = {}) { ... }

module.exports = { speak, speakBackground, listVoices };
```

**Error codes**：`UNSUPPORTED_PLATFORM` / `INVALID_ARGUMENT` / `COMMAND_FAILED`

### 模組 2: `scripts/lib/tts-templates.js`

```javascript
/**
 * tts-templates.js — TTS 事件模板
 *
 * 事件鍵 → 自然口語字串映射。
 * 純資料模組，不依賴任何外部模組。
 *
 * 模板字串使用 {key} 佔位符，由 interpolate() 替換。
 */

/**
 * 取得事件模板並插值
 * @param {string} eventKey - 事件鍵（如 'agent:complete'）
 * @param {object} [params] - 插值參數（如 { stage: 'DEV', agent: 'developer' }）
 * @returns {string|null} 插值後的字串，未知事件鍵回傳 null
 */
function getTemplate(eventKey, params = {}) { ... }

/**
 * 取得所有已定義的事件鍵
 * @returns {string[]}
 */
function getDefinedKeys() { ... }

// 模板定義（對齊 registry.js timelineEvents 分類）
const TEMPLATES = {
  // agent 類
  'agent:complete':    '{stage} 完成',
  'agent:error':       '{stage} 失敗',

  // stage 類
  'stage:complete':    '{stage} 階段完成',
  'stage:retry':       '{stage} 重試中',

  // workflow 類
  'workflow:complete': '工作流程完成',
  'workflow:abort':    '工作流程中斷',

  // loop 類
  'loop:complete':     '所有任務完成',

  // parallel 類
  'parallel:converge': '並行任務收斂',

  // session 類
  'session:start':     'Overtone 啟動',
  'session:compact':   '正在壓縮 context',

  // error 類
  'error:fatal':       '發生嚴重錯誤',

  // notification 類（Hook Notification 觸發）
  'notification:ask':  '需要你的決定',
};

module.exports = { getTemplate, getDefinedKeys };
```

### 模組 3: `scripts/lib/tts-strategy.js`

```javascript
/**
 * tts-strategy.js — TTS 策略引擎
 *
 * 決定「是否朗讀」+ 「朗讀什麼」。
 * 讀取 ~/.overtone/tts.json 取得 level/voice/enabled 設定。
 * 依賴注入：_deps = { readConfig } 供測試替換。
 */

// Level 定義
const TTS_LEVELS = {
  SILENT:   0,  // 靜音（完全不說話）
  CRITICAL: 1,  // 只說關鍵事件（error:fatal、workflow:complete、notification:ask）
  PROGRESS: 2,  // 加上進度事件（agent:complete、stage:complete、loop:complete）
  VERBOSE:  3,  // 全部（所有有模板的事件）
};

// 每個 level 涵蓋的事件鍵（累積式：level 2 包含 level 1）
const LEVEL_EVENTS = {
  1: ['error:fatal', 'workflow:complete', 'notification:ask', 'workflow:abort'],
  2: ['agent:complete', 'agent:error', 'stage:complete', 'stage:retry', 'loop:complete', 'parallel:converge'],
  3: ['session:start', 'session:compact'],
};

/**
 * 判斷是否應該朗讀
 * @param {string} eventKey - 事件鍵
 * @param {number} level    - TTS level（0-3）
 * @returns {boolean}
 */
function shouldSpeak(eventKey, level) { ... }

/**
 * 建構朗讀參數
 * @param {string} eventKey       - 事件鍵
 * @param {object} [context]      - 插值參數（如 { stage: 'DEV', agent: 'developer' }）
 * @param {object} [config]       - TTS 設定（voice、rate）
 * @returns {{ text: string, opts: { voice?: string, rate?: number } }|null}
 *   null 表示無模板（不應朗讀）
 */
function buildSpeakArgs(eventKey, context = {}, config = {}) { ... }

/**
 * 讀取 TTS 設定（預設值：level=1, enabled=false, voice=null, rate=200）
 * @param {object} [_deps]
 * @param {Function} [_deps.readConfig]  - (path) => object，預設讀 ~/.overtone/tts.json
 * @returns {{ enabled: boolean, level: number, voice: string|null, rate: number }}
 */
function readTtsConfig(_deps = {}) { ... }

module.exports = { shouldSpeak, buildSpeakArgs, readTtsConfig, TTS_LEVELS, LEVEL_EVENTS };
```

## 資料模型

### TTS 設定檔：`~/.overtone/tts.json`

```json
{
  "enabled": false,
  "level": 1,
  "voice": null,
  "rate": 200
}
```

| 欄位 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | 全局開關（false = 靜音，忽略 level） |
| `level` | number | `1` | TTS level（0-3，見 TTS_LEVELS） |
| `voice` | string\|null | `null` | macOS 語音名稱，null = 系統預設 |
| `rate` | number | `200` | 語速（wpm），macOS say 預設約 175-200 |

**讀寫原則**：
- 由 tts-strategy.js 的 `readTtsConfig()` 讀取（第一次不存在時回傳預設值）
- 不依賴 config-api.js（避免引入 config-api 的全部依賴）
- `~/.overtone/` 目錄由 paths.js 提供常數

### speakBackground() 回傳格式（成功）

```json
{ "ok": true }
```

### listVoices() 回傳格式（成功）

```json
{
  "ok": true,
  "voices": [
    { "name": "Alex", "lang": "en_US" },
    { "name": "Mei-Jia", "lang": "zh_TW" }
  ]
}
```

## Hook 整合方案

### 整合策略：strategy-first，fire-and-forget

Hook 整合的核心原則：
1. 只 require `tts-strategy`，不直接 require `tts.js`（降低 hook 對 OS 層的直接依賴）
2. `speakBackground()` 為主要呼叫方式（非阻塞，不影響 hook 效能）
3. 用 try/catch 包裹，任何 TTS 錯誤都不阻擋 hook 主流程

### 整合點設計

#### agent-stop-handler.js（SubagentStop）

```javascript
// 在 emit agent:complete 之後，使用 fire-and-forget
try {
  const ttsStrategy = require('./tts-strategy');
  const ttsConfig = ttsStrategy.readTtsConfig();
  if (ttsConfig.enabled && ttsStrategy.shouldSpeak('agent:complete', ttsConfig.level)) {
    const args = ttsStrategy.buildSpeakArgs('agent:complete', { stage: stageKey }, ttsConfig);
    if (args) require('../os/tts').speakBackground(args.text, args.opts);
  }
} catch { /* TTS 錯誤不影響主流程 */ }
```

**觸發條件**：`agent:complete` 或 `agent:error`（依 verdict 選擇事件鍵）

#### session-stop-handler.js（Stop hook）

觸發 `workflow:complete`（allCompleted=true 且 !hasFailedStage 時）和 `loop:complete`（佇列完成時）。

位置：在 `playSound(SOUNDS.HERO)` 的同一 if 區塊中，緊接音效播放之後。

#### on-notification.js（Notification hook）

觸發 `notification:ask`（elicitation_dialog 時）。

位置：在 `playSound(SOUNDS.GLASS)` 之後。

### Hook 整合位置總覽

| Hook | 整合位置 | 觸發事件鍵 | 條件 |
|------|----------|------------|------|
| agent-stop-handler.js | emit agent:complete 後 | `agent:complete` / `agent:error` | result.verdict 決定事件鍵 |
| session-stop-handler.js | playSound(HERO) 後 | `workflow:complete` | allCompleted && !hasFailedStage |
| on-notification.js | playSound(GLASS) 後 | `notification:ask` | type === 'elicitation_dialog' |

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/os/tts.js              -- macOS say 封裝（OS 層）
  plugins/overtone/scripts/lib/tts-templates.js   -- 事件鍵 → 口語字串映射（純資料）
  plugins/overtone/scripts/lib/tts-strategy.js    -- shouldSpeak + buildSpeakArgs（策略層）
  tests/unit/tts.test.js                          -- tts.js 單元測試
  tests/unit/tts-templates.test.js                -- tts-templates.js 單元測試
  tests/unit/tts-strategy.test.js                 -- tts-strategy.js 單元測試

修改的檔案：
  plugins/overtone/scripts/lib/agent-stop-handler.js    -- 新增 TTS fire-and-forget 呼叫
  plugins/overtone/scripts/lib/session-stop-handler.js  -- 新增 TTS fire-and-forget 呼叫
  plugins/overtone/hooks/scripts/notification/on-notification.js -- 新增 TTS 觸發
```

## 關鍵技術決策

### 決策 1: speakBackground() 為主要 Hook 整合方式

- **選擇**：Hook 整合一律用 `speakBackground()`（spawn + detach），不用 `speak()`（阻塞）
- **理由**：Hook 效能敏感，`speak()` 阻塞最長可達數秒（長文字 + 慢語速）；fire-and-forget 不影響 hook 回應時間；與 `sound.js` 的 `playSound()` 模式完全一致
- **未選方案**：background: boolean 作為 opts 參數——反而增加呼叫方的決策負擔，拆成兩個函式更清晰

### 決策 2: TTS 設定獨立 JSON 不走 config-api

- **選擇**：`~/.overtone/tts.json` 獨立 JSON，由 tts-strategy.js 直接讀寫
- **理由**：config-api.js 是元件管理 API（agent/hook/skill），不適合混入 runtime 使用者設定；TTS 設定是 user preference，類比 statusline 的 `statusline-state.json` 獨立管理模式
- **未選方案**：workflow.json 的 session-level 欄位——TTS 偏好是跨 session 的，不應存在 session 狀態中

### 決策 3: TTS Level 累積式設計（level 2 包含 level 1）

- **選擇**：LEVEL_EVENTS 定義每個 level 新增的事件鍵，shouldSpeak() 累積判斷（level >= N 則包含 N 的所有事件）
- **理由**：使用者直覺上 level 2 比 level 1「更多」；反向設計（level 1 是最多）會造成命名困惑
- **邊界**：level 0（SILENT）= enabled=false 的語意等同，但兩者都保留（enabled 是 quick toggle，level=0 是細粒度控制）

### 決策 4: 模板語言用 {key} 插值

- **選擇**：簡單的 `{key}` 佔位符替換，不引入模板引擎
- **理由**：模板字串短（5-15 字），插值參數最多 2-3 個；`{key}` 替換 30 行以下可以內嵌在 getTemplate() 中；不值得引入 Handlebars/Mustache 等依賴
- **插值參數**：`stage`（階段名稱）、`agent`（agent 名稱）——僅這兩個，夠用不過設計

## 測試策略概覽

### tts.test.js（單元測試）
- speak() — macOS 正常回傳 { ok: true, voice, text }
- speak() — 非 darwin 平台回傳 UNSUPPORTED_PLATFORM
- speak() — 空字串回傳 INVALID_ARGUMENT
- speak() — execSync 拋錯回傳 COMMAND_FAILED
- speakBackground() — spawn 被呼叫（透過 _deps 注入）
- speakBackground() — 非 darwin 回傳 UNSUPPORTED_PLATFORM
- listVoices() — 解析 `say -v ?` 輸出格式
- listVoices() — 空輸出回傳空陣列

### tts-templates.test.js（單元測試）
- getTemplate('agent:complete', { stage: 'DEV' }) 回傳 'DEV 完成'
- getTemplate('unknown-key') 回傳 null
- getTemplate('workflow:complete', {}) 回傳不含 {key} 的字串
- getDefinedKeys() 回傳非空陣列

### tts-strategy.test.js（單元測試）
- shouldSpeak('error:fatal', 1) === true
- shouldSpeak('agent:complete', 1) === false
- shouldSpeak('agent:complete', 2) === true
- shouldSpeak('session:start', 3) === true
- shouldSpeak('session:start', 2) === false
- shouldSpeak('any', 0) === false
- buildSpeakArgs('agent:complete', { stage: 'DEV' }, {}) 回傳 { text: 'DEV 完成', opts: {} }
- buildSpeakArgs('unknown', {}, {}) 回傳 null
- readTtsConfig() 無設定檔時回傳預設值（enabled: false, level: 1）
- readTtsConfig() 讀取自訂 _deps.readConfig 回傳值
