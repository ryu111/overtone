# S14 Strategic Compact -- 技術設計

## 技術摘要（What & Why）

- **方案**：在 SubagentStop hook（on-stop.js）的 stage 完成時，讀取 transcript 檔案大小，超過閾值時透過 `result` 欄位向 Main Agent 建議執行 `/compact`
- **理由**：stage 切換是天然的 context 切割點，此時壓縮能最大化釋放空間且不中斷工作流
- **取捨**：使用 `result` 而非 `systemMessage`，因為 SubagentStop 的 stdout schema 不支援 `systemMessage`（見下方決策 1）

## 開放問題解答

### Q1: SubagentStop hook output 是否支援 `systemMessage`？

**答案：否。**

根據 `docs/reference/claude-code-platform.md` 第 186-189 行，SubagentStop stdout schema 為：
```
{ decision: "block", reason: "...", hookSpecificOutput: { continue: false, instruction: "..." } }
```

通用 stdout 欄位（第 82-88 行）雖有 `systemMessage`，但 SubagentStop 沒有文件支援它。
現有 on-stop.js 也僅使用 `result` 欄位輸出。

**結論**：compact 建議訊息附加到現有的 `result` 字串中，與其他提示訊息一起輸出。

### Q2: SubagentStop stdin 是否包含 `transcript_path`？

**答案：是。**

根據平台文件第 68-78 行，`transcript_path` 是 Hook 通用 stdin 欄位，所有 event 都包含。
statusline.js 已在使用 `input.transcript_path` 讀取檔案大小（第 225 行）。

**結論**：直接從 `input.transcript_path` 讀取 transcript 大小，使用 `statSync().size`。

### Q3: 「剛 compact 過」的計算方式

**答案：事件計數法。**

用 `timeline.count(sessionId, { type: 'session:compact' })` 與 `timeline.count(sessionId, { type: 'stage:complete' })` 計算最後一次 compact 後的 stage 完成數。

具體做法：查詢 `session:compact` 的最後一筆事件時間，再計算在該時間之後的 `stage:complete` 事件數。若自上次 compact 以來只完成了 0-1 個 stage，視為「剛 compact 過」，不建議。

## API 介面設計

### 函式：shouldSuggestCompact

```javascript
/**
 * 判斷是否應建議 Main Agent 執行 compact
 *
 * @param {object} params
 * @param {string} params.transcriptPath  - transcript 檔案路徑（來自 stdin）
 * @param {string} params.sessionId       - session ID
 * @param {object} [params.options]       - 可選覆蓋（測試用）
 * @param {number} [params.options.thresholdBytes] - 大小閾值（預設 5MB）
 * @param {number} [params.options.minStagesSinceCompact] - compact 後最少完成幾個 stage 才再建議（預設 2）
 * @returns {{ suggest: boolean, reason?: string, transcriptSize?: number }}
 */
function shouldSuggestCompact({ transcriptPath, sessionId, options = {} })
```

### 輸出型別

```typescript
interface CompactSuggestion {
  suggest: boolean           // true = 應建議 compact
  reason?: string            // 建議原因（用於 result 訊息）
  transcriptSize?: number    // 目前 transcript 大小（bytes）
}
```

### 邏輯流程

```
1. 若 transcriptPath 為空/undefined → return { suggest: false }
2. 讀取 transcript 檔案大小（statSync）
   - 若讀取失敗 → return { suggest: false }
3. 若 size < thresholdBytes（預設 5MB = 5_000_000）→ return { suggest: false }
4. 查詢 timeline：最後一次 session:compact 事件
   - 若有：計算該事件之後的 stage:complete 事件數
   - 若無：不需要 cooldown 檢查
5. 若自上次 compact 以來的 stage:complete 數 < minStagesSinceCompact（預設 2）
   → return { suggest: false }（剛 compact 過，不建議）
6. return { suggest: true, reason, transcriptSize: size }
```

### 錯誤處理

| 錯誤情況 | 行為 |
|---------|------|
| transcript 檔案不存在 | 靜默，suggest: false |
| statSync 失敗 | 靜默，suggest: false |
| timeline 查詢失敗 | 靜默，suggest: false |

所有失敗都靜默處理，不影響 on-stop.js 主流程。

## 資料模型

### Timeline 事件（新增）

```javascript
// registry.js timelineEvents 新增
'session:compact-suggestion': { label: 'Compact 建議', category: 'session' }
```

此事件在建議 compact 時 emit，用於追蹤建議頻率和可觀測性。

### 事件 payload

```javascript
{
  ts: '2026-03-01T12:00:00.000Z',
  type: 'session:compact-suggestion',
  category: 'session',
  label: 'Compact 建議',
  transcriptSize: 6_500_000,      // bytes
  stage: 'DEV',                    // 觸發時的 stage
  agent: 'developer'               // 觸發時的 agent
}
```

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/registry.js      -- 修改：timelineEvents 新增 'session:compact-suggestion'
  plugins/overtone/hooks/scripts/agent/on-stop.js -- 修改：stage pass 時加入 compact 建議邏輯

新增的檔案：
  tests/integration/compact-suggestion.test.js   -- 新增：整合測試
```

## 關鍵技術決策

### 決策 1：使用 `result` 而非 `systemMessage`

- **選項 A**（選擇）：將 compact 建議附加到現有 `result` 訊息
  - 優點：與 on-stop.js 現有架構完全一致，不引入新的輸出欄位
  - 優點：`result` 是已驗證可靠的 Main Agent 通訊管道
- **選項 B**（未選）：使用 `systemMessage` 欄位
  - 原因：SubagentStop 的 stdout schema 文件中無 `systemMessage` 支援，行為未定義

### 決策 2：shouldSuggestCompact 內嵌在 on-stop.js 而非獨立模組

- **選項 A**（選擇）：作為 on-stop.js 內的函式
  - 優點：邏輯簡單（~30 行），不值得獨立模組
  - 優點：直接存取已有的 `sessionId`、`input`、`timeline`
- **選項 B**（未選）：獨立為 `scripts/lib/compact-suggestion.js`
  - 原因：過度抽象，增加無必要的檔案和 require

### 決策 3：事件計數法判斷「剛 compact 過」

- **選項 A**（選擇）：事件計數法（最後 compact 後的 stage:complete 數）
  - 優點：精確反映工作量，不受時間影響
  - 優點：利用已有的 `timeline.latest()` + `timeline.query()` API
- **選項 B**（未選）：時間差法
  - 原因：不精確 -- 使用者可能暫停很久，實際工作量很少

### 決策 4：閾值常數放在函式參數預設值

- **選項 A**（選擇）：函式參數預設值 + options 覆蓋
  - 優點：測試方便（小閾值即可觸發）
  - 優點：不需要 config 系統支援
- **選項 B**（未選）：放入 registry 或 config-api
  - 原因：過度設計，閾值極少需要動態調整

### 決策 5：只在 pass 時建議，fail/reject/issues 不建議

- **選項 A**（選擇）：只在 `result.verdict === 'pass'` 時檢查
  - 優點：fail/reject 會觸發重試流程，此時 compact 會遺失重要 context
  - 優點：pass 是自然的切割點，下一個 stage 可以乾淨開始
- **選項 B**（未選）：所有 verdict 都檢查
  - 原因：compact 會移除 debug/review 的上下文，影響修復品質

## 在 on-stop.js 中的插入位置

在 `// ── 產生提示訊息 ──` 區塊內，pass 分支的最後（所有 stage 完成提示之後、grader 提示之前）：

```javascript
// 現有程式碼（約第 228 行）
} else {
  // PASS
  messages.push(`✅ ${stages[stageKey].emoji} ${stages[stageKey].label}完成`);
  // ... 其他 pass 訊息 ...

  // === 新增：Strategic Compact 建議 ===
  const compactSuggestion = shouldSuggestCompact({
    transcriptPath: input.transcript_path,
    sessionId,
  });
  if (compactSuggestion.suggest) {
    messages.push('');
    messages.push(`💾 Transcript 已達 ${formatSize(compactSuggestion.transcriptSize)}，建議執行 /compact 釋放 context 空間`);
    timeline.emit(sessionId, 'session:compact-suggestion', {
      transcriptSize: compactSuggestion.transcriptSize,
      stage: actualStageKey,
      agent: agentName,
    });
  }
}
```

### 輔助函式 formatSize

複用 statusline.js 的格式化邏輯（內嵌簡化版）：

```javascript
function formatSize(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)}KB`;
  return `${bytes}B`;
}
```

## 實作注意事項

給 developer 的提醒：

- `shouldSuggestCompact` 內部的所有操作必須用 try-catch 包裹，失敗時靜默回傳 `{ suggest: false }`，不可影響 on-stop.js 主流程
- `timeline.latest()` 使用反向掃描，效能良好（O(n) worst case，但通常很快找到）
- `timeline.query()` 需要過濾 ts > lastCompactTs 的 `stage:complete` 事件 -- 目前 API 不支援 ts 過濾，需要在呼叫端自行過濾
- `formatSize` 不要從 statusline.js import（statusline.js 是獨立腳本，不是 lib 模組）
- 測試使用 `Bun.spawnSync` 子進程模式（與 pre-compact.test.js 一致）
- 測試需要建立大於 5MB 的假 transcript 檔案觸發建議
