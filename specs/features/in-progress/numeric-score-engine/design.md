# Design：numeric-score-engine

## 技術摘要（What & Why）

- **方案**：新增 `score-engine.js` 純函式庫（對齊 baseline-tracker.js 模式），設定放在 `registry.js` 常數（非 registry-data.json），SubagentStop 的 `stop-message-builder.js` 在 PASS 分支插入評分提示。
- **理由**：scoringConfig 是程式碼邏輯需要的靜態常數（不需 config-api 動態修改），與 baselineDefaults / instinctDefaults 等同層級。grader 觸發採「hook 提示 Main Agent」而非 hook 直接委派，符合「Hook 做守衛，Main Agent 做決策」哲學。分數寫入由 grader agent 的 Bash 工具完成（extend 現有寫 timeline 的模式），SubagentStop hook 解析 grader Handoff 時讀取 scores.jsonl 做閾值警告。
- **取捨**：grader 是非同步建議，不阻擋 workflow 推進。若 Main Agent 跳過委派，只損失該次評分數據，系統不受影響。

## API 介面設計

### score-engine.js

```javascript
// plugins/overtone/scripts/lib/score-engine.js

/**
 * 儲存一筆評分記錄（JSONL append-only）
 *
 * @param {string} projectRoot - 專案根目錄絕對路徑
 * @param {ScoreRecord} record - 評分記錄
 * @returns {void}
 */
function saveScore(projectRoot, record)

/**
 * 查詢評分記錄
 *
 * @param {string} projectRoot
 * @param {ScoreFilter} [filter]
 * @returns {ScoreRecord[]}
 */
function queryScores(projectRoot, filter)

/**
 * 取得特定 stage 的最近 N 筆評分摘要（平均值）
 *
 * @param {string} projectRoot
 * @param {string} stageKey - 如 'DEV'、'REVIEW'、'TEST'
 * @param {number} [n] - 取最近幾筆，預設 scoringDefaults.compareWindowSize
 * @returns {ScoreSummary}
 */
function getScoreSummary(projectRoot, stageKey, n)
```

### 輸入型別

```javascript
// ScoreRecord — 儲存格式（JSONL 每行）
{
  ts: string,           // ISO 8601 timestamp
  sessionId: string,    // session ID
  workflowType: string, // 'quick' | 'standard' | ...
  stage: string,        // 'DEV' | 'REVIEW' | 'TEST'
  agent: string,        // 'developer' | 'code-reviewer' | 'tester'
  scores: {
    clarity: number,        // 整數 1-5
    completeness: number,   // 整數 1-5
    actionability: number,  // 整數 1-5
  },
  overall: number,      // 小數 2 位，(clarity+completeness+actionability)/3
}

// ScoreFilter — queryScores 過濾條件
{
  stage?: string,        // 篩選特定 stage
  workflowType?: string, // 篩選特定 workflow 類型
  limit?: number,        // 最多返回幾筆（從最新開始）
}

// ScoreSummary — getScoreSummary 回傳
{
  sessionCount: number,
  avgClarity: number | null,
  avgCompleteness: number | null,
  avgActionability: number | null,
  avgOverall: number | null,
}
```

### 錯誤處理

| 錯誤情況 | 處理方式 |
|---------|---------|
| scores.jsonl 不存在 | 回傳空陣列（同 baseline-tracker 模式） |
| 單行 JSON 解析失敗 | 跳過該行，繼續處理（靜默容錯） |
| 寫入 IO 錯誤 | 拋出例外，由呼叫方（grader Bash）捕捉 |

## 資料模型

### scores.jsonl 格式

```jsonl
{"ts":"2026-03-03T10:00:00.000Z","sessionId":"abc123","workflowType":"quick","stage":"DEV","agent":"developer","scores":{"clarity":4,"completeness":5,"actionability":3},"overall":4.00}
{"ts":"2026-03-03T10:05:00.000Z","sessionId":"abc123","workflowType":"quick","stage":"REVIEW","agent":"code-reviewer","scores":{"clarity":3,"completeness":4,"actionability":4},"overall":3.67}
```

儲存位置：`~/.overtone/global/{projectHash}/scores.jsonl`

截斷策略：每種 `stage` 最多保留最新 `scoringDefaults.maxRecordsPerStage`（50）筆，超過時原子寫回（對齊 baseline-tracker._trimIfNeeded 模式）。

### scoringConfig（registry.js 新增常數）

```javascript
// 哪些 stage 觸發評分建議
const scoringConfig = {
  // PASS 後觸發 grader 評分提示的 stage 清單
  gradedStages: ['DEV', 'REVIEW', 'TEST'],

  // overall 低分閾值（低於此值 → emit instinct quality_signal）
  lowScoreThreshold: 3.0,
};

// 評分相關預設值（與 baselineDefaults 同層級）
const scoringDefaults = {
  compareWindowSize: 10,     // getScoreSummary 取最近幾筆
  maxRecordsPerStage: 50,    // 每種 stage 最多保留幾筆
};
```

## 檔案結構

### 新增檔案

| 路徑 | 用途 |
|------|------|
| `plugins/overtone/scripts/lib/score-engine.js` | 評分儲存核心模組（saveScore / queryScores / getScoreSummary） |
| `tests/unit/score-engine.test.js` | score-engine.js 單元測試 |
| `tests/integration/grader-score-engine.test.js` | SubagentStop 整合測試（評分提示 + instinct 回饋） |

### 修改檔案

| 路徑 | 修改內容 |
|------|---------|
| `plugins/overtone/scripts/lib/registry.js` | 新增 `scoringConfig`、`scoringDefaults` 常數並 export |
| `plugins/overtone/scripts/lib/paths.js` | `global` 物件新增 `scores: (projectRoot) => ...` |
| `plugins/overtone/agents/grader.md` | 在 Bash 寫入 timeline 後增加 Node.js CLI 呼叫寫入 scores.jsonl |
| `plugins/overtone/scripts/lib/stop-message-builder.js` | PASS 分支插入評分提示訊息（含閾值警告 + instinct 回饋） |
| `plugins/overtone/hooks/scripts/agent/on-stop.js` | 傳遞 `scoringConfig` 給 buildStopMessages，新增 instinct quality_signal emit |

## 各元件整合設計

### A. registry.js 擴展

`scoringConfig` 放在 `registry.js`（非 registry-data.json），原因：
- 維度清單和閾值是程式邏輯需要的靜態定義，不需要 config-api 動態修改
- 對齊 `instinctDefaults`、`baselineDefaults` 等同層級的常數位置

```javascript
// registry.js 新增，放在 baselineDefaults 之後
const scoringConfig = {
  gradedStages: ['DEV', 'REVIEW', 'TEST'],
  lowScoreThreshold: 3.0,
};

const scoringDefaults = {
  compareWindowSize: 10,
  maxRecordsPerStage: 50,
};

// module.exports 新增：
// scoringConfig,
// scoringDefaults,
```

### B. paths.js 擴展

```javascript
// global 物件新增一個 key
const global = {
  dir:          (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot)),
  observations: (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'observations.jsonl'),
  baselines:    (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'baselines.jsonl'),
  scores:       (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'scores.jsonl'), // 新增
};
```

### C. score-engine.js 結構

對齊 `baseline-tracker.js` 模式（同樣是 JSONL append-only，同樣有 _trimIfNeeded）：

```javascript
// 內部工具：讀取所有記錄
function _readAll(projectRoot)  // → ScoreRecord[]

// 內部工具：截斷超過上限的記錄（按 stage 分組）
function _trimIfNeeded(projectRoot)

// 公開 API
module.exports = { saveScore, queryScores, getScoreSummary };
```

### D. grader agent prompt 更新

grader 現有步驟 3（Bash 寫 timeline）之後，新增步驟 4：

```bash
# 步驟 4：寫入全域 scores store
node -e "
const se = require('~/.claude/plugins/overtone/scripts/lib/score-engine');
// 注意：路徑使用 CLAUDE_PLUGIN_ROOT 環境變數
se.saveScore(process.env.CLAUDE_PROJECT_ROOT || process.cwd(), {
  ts: new Date().toISOString(),
  sessionId: '實際SESSION_ID',
  workflowType: '實際WORKFLOW_TYPE', // 從 task prompt 提取或留空
  stage: '實際STAGE',
  agent: '實際AGENT',
  scores: { clarity: C, completeness: CO, actionability: A },
  overall: OO,
});
"
```

實際設計：grader prompt 改為呼叫 Node.js script（使用 `$CLAUDE_PLUGIN_ROOT` 路徑），輸入由 Main Agent 在委派 Task 時注入。

grader 完成後的輸出格式維持：
```
GRADER 完成：clarity=C completeness=CO actionability=A overall=OO
```
SubagentStop hook 對 grader 輸出的 parseResult 永遠回傳 `pass`（現有行為）。

### E. stop-message-builder.js 整合

buildStopMessages 的參數新增：

```javascript
// 新增參數（ctx 物件擴展）
ctx.scoringConfig    // registry.scoringConfig（gradedStages + lowScoreThreshold）
ctx.lastScore        // ScoreSummary | null（由 on-stop.js 呼叫 score-engine.getScoreSummary 取得）
```

PASS 分支邏輯（在現有 PASS 訊息後插入）：

```javascript
// 在 PASS 分支，推送下一步訊息後：
if (scoringConfig && scoringConfig.gradedStages.includes(stageKey)) {
  // 評分建議
  messages.push(`🎯 建議委派 grader 評分：STAGE=${stageKey} AGENT=${agentName} SESSION_ID=${sessionId}`);

  // 閾值警告（若有上一次分數且低於閾值）
  if (lastScore && lastScore.avgOverall !== null && lastScore.avgOverall < scoringConfig.lowScoreThreshold) {
    messages.push(`⚠️ ${stageKey} 歷史平均分偏低（${lastScore.avgOverall.toFixed(2)}/5.0），建議關注品質`);
    // instinct 回饋作為 stateUpdates 副作用傳遞給 on-stop.js
    stateUpdates.push({
      type: 'emitQualitySignal',
      agentName,
      stageKey,
      avgOverall: lastScore.avgOverall,
      threshold: scoringConfig.lowScoreThreshold,
    });
  }
}
```

### F. on-stop.js 整合

在組裝 buildStopMessages 的輸入前：
```javascript
// 取得上一次同 stage 的分數摘要
let lastScore = null;
try {
  const scoreEngine = require('../../../scripts/lib/score-engine');
  const { scoringConfig } = require('../../../scripts/lib/registry');
  if (scoringConfig.gradedStages.includes(stageKey)) {
    lastScore = scoreEngine.getScoreSummary(projectRoot, stageKey);
  }
} catch { /* 靜默 */ }
```

執行 stateUpdates 副作用時新增：
```javascript
if (upd.type === 'emitQualitySignal') {
  const trigger = `${upd.agentName} 歷史平均 ${upd.avgOverall.toFixed(2)} at ${upd.stageKey}`;
  const action = `${upd.stageKey} 品質低於閾值 ${upd.threshold}，建議加強產出品質`;
  instinct.emit(sessionId, 'quality_signal', trigger, action, `quality-${upd.agentName}`);
}
```

### G. instinct type 擴展

instinct.js 的 `emit` 已接受任意 type 字串，`quality_signal` 是新的 type 值。不需要修改 instinct.js 本身（type 是自由字串，沒有 enum 驗證）。

## 開放問題（供 developer 在實作時決定）

1. **grader Bash 腳本路徑**：grader.md 中的 `node -e` 呼叫需要 `score-engine.js` 的絕對路徑。建議使用 `$CLAUDE_PLUGIN_ROOT/scripts/lib/score-engine.js`，但需確認 grader 執行環境是否有此環境變數。若無，改用 `$(dirname "$0")/../../scripts/lib/score-engine.js` 相對路徑。

2. **workflowType 注入方式**：grader 被委派時，Main Agent 的 Task prompt 需包含 workflowType。建議 stop-message-builder 在評分建議訊息中一併提供（`WORKFLOW_TYPE=${workflowType}`），grader prompt 解析時使用。

3. **grader SubagentStop 的 instinct 呼叫**：grader 結束後，on-stop.js 目前會對 grader 也呼叫 `instinct.emit('agent_performance', ...)`。需確認 `agentToStage` 映射對 grader 的處理（現有程式碼在 `stageKey` 不存在時直接 `exit0()`），grader 不在 stages 中，所以現有程式碼已正確跳過，不需修改。
