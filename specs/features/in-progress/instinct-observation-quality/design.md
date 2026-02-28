# Design: instinct-observation-quality

## 技術摘要（What & Why）

- **方案**：在現有 Instinct 架構上做 6 項增量改進，不引入新模組，不改變 JSONL 格式
- **理由**：現有 `instinct.js` API（emit/confirm/contradict/query）已足夠，問題在於呼叫端（hooks）的觀察品質不足。修復點分散在 4 個 hook 檔案 + 2 個文件檔案，彼此獨立
- **取捨**：不新增 `user_corrections` 和 `repeated_workflows` 類型（需要跨 session 追蹤，超出 MVP 範圍）

## 關鍵技術決策

### 決策 1：agent_performance tag 粒度 — 按 agent 分

- **選項 A**（選擇）：`agent-{agentName}`（如 `agent-developer`、`agent-tester`） — 同一 agent 在不同 workflow 中的表現累積到同一 tag，更容易達到進化門檻
- **選項 B**（未選）：`stage-{stageKey}`（如 `stage-DEV`） — agent 和 stage 是 1:1 映射（registry.js），tag 本質相同但語意不如 agent 清晰；且未來若有多 agent 共用 stage 的場景（如 mul-dev），按 agent 分更準確

### 決策 2：workflow_routing 記錄時機 — 在 on-submit.js 有 currentState 時記錄

- **選項 A**（選擇）：僅在 `currentState && currentState.workflowType` 成立時記錄 — 首次 prompt 時 workflow 尚未初始化（由 /ot:auto skill 在後續決定），此時無法知道 workflow 類型，不記錄是正確行為。後續 prompt 時 currentState 已有 workflowType，此時記錄
- **選項 B**（未選）：在 `init-workflow.js` 中記錄 — 需要修改額外的檔案，且 init-workflow.js 是 Bash 工具呼叫的腳本，sessionId 傳遞較複雜。不值得為此改動
- **選項 C**（未選）：在 workflow override `[workflow:xxx]` 解析成功時也記錄 — 可以作為選項 A 的補充，在 validWorkflowOverride 存在時記錄。但 override 使用頻率極低，效益不大。省略

### 決策 3：search-tools 反面偵測的 command 匹配 — 掃描整個 command 字串

- **選項 A**（選擇）：用正規表達式 `/\b(grep|find|rg)\b/` 掃描整個 command 字串 — 覆蓋管道場景如 `cat file | grep pattern`、`find . -name "*.js" | xargs grep`
- **選項 B**（未選）：只檢查首 token — 會遺漏管道場景（`cat file | grep`），管道用法在實務中常見

### 決策 4：code fence 偵測 — 只支援標準三反引號

- **選項 A**（選擇）：只匹配 ``` 三反引號（含以上）開關 — 用 `/^```/` 匹配行首三反引號切換 `inCodeFence` 狀態，四反引號 ```````` 也會匹配（因為以三反引號開頭）
- **選項 B**（未選）：精確計數反引號做巢狀 code fence 追蹤 — 過度設計，.md 檔案中巢狀 code fence 極少見，且四反引號開頭的行也會被 `/^```/` 匹配到

## API 介面設計

### 子任務 1：instinct.js emit() 飽和閾值

```javascript
// 修改 emit() 方法，在 existing 分支中增加飽和檢查
emit(sessionId, type, trigger, action, tag) {
  const list = this._readAll(sessionId);
  const existing = list.find(i => i.tag === tag && i.type === type);

  if (existing) {
    // === 新增：飽和閾值 ===
    // confidence 已達 1.0 → 更新 lastSeen 但不追加 JSONL 行
    if (existing.confidence >= 1.0) {
      return existing;  // 直接回傳，不 append
    }
    // === 結束 ===

    // 原有邏輯...
    existing.confidence = this._clamp(existing.confidence + instinctDefaults.confirmBoost);
    existing.count = (existing.count || 1) + 1;
    existing.lastSeen = new Date().toISOString();
    existing.trigger = trigger;
    existing.action = action;
    this._append(sessionId, existing);
    return existing;
  }
  // ... 新建邏輯不變
}
```

**行為定義**：
- 當 `existing.confidence >= 1.0` 時，直接 return existing，不呼叫 `_append()`
- 不更新 `lastSeen`（避免阻止衰減機制正常運作）
- 不增加 `count`
- 不增加 `confidence`

### 子任務 2：post-use.js wording 偵測排除 code fence

```javascript
// 修改 detectWordingMismatch() 函式
function detectWordingMismatch(filePath) {
  // ... 前置檢查不變 ...

  const warnings = [];
  const lines = content.split('\n').slice(0, 1000);
  let inCodeFence = false;  // === 新增 ===

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // === 新增：code fence 狀態追蹤 ===
    // 匹配行首 ```（三個或以上反引號），切換 inCodeFence
    if (/^```/.test(line.trimStart())) {
      inCodeFence = !inCodeFence;
      continue;
    }
    // code fence 內的行跳過偵測
    if (inCodeFence) continue;
    // === 結束 ===

    // 原有排除邏輯（表格行）
    if (line.trimStart().startsWith('|')) continue;

    // ... 規則檢查不變 ...
  }
  return warnings;
}
```

**行為定義**：
- 遇到行首 ``` 時切換 `inCodeFence` boolean（toggle）
- `inCodeFence === true` 時跳過所有 wording 規則檢查
- ``` 本身那一行也跳過（continue 在 toggle 後）
- `trimStart()` 處理縮排場景（如 list item 內的 code fence）

### 子任務 3：on-stop.js 新增 agent_performance 觀察

```javascript
// 在 timeline emit 區塊後（約第 114 行），新增 instinct 觀察
// 需要在檔案頂部 require instinct：
const instinct = require('../../../scripts/lib/instinct');

// ... 在 timeline.emit(sessionId, 'stage:complete', ...) 之後 ...

// === 新增：agent_performance 觀察 ===
try {
  const perfTrigger = `${agentName} ${result.verdict} at ${actualStageKey}`;
  const perfAction = result.verdict === 'pass'
    ? `${agentName} 成功完成 ${actualStageKey}`
    : `${agentName} 在 ${actualStageKey} 結果為 ${result.verdict}`;
  instinct.emit(sessionId, 'agent_performance', perfTrigger, perfAction, `agent-${agentName}`);
} catch {
  // Instinct 觀察失敗不影響主流程
}
// === 結束 ===
```

**行為定義**：
- type: `'agent_performance'`
- trigger: `"{agentName} {verdict} at {stageKey}"`（如 `"developer pass at DEV"`）
- action: 依 verdict 區分描述
- tag: `"agent-{agentName}"`（如 `"agent-developer"`）
- 用 try/catch 包裹，觀察失敗不影響 hook 主流程
- 每次 agent 完成都記錄（無論 pass/fail/reject/issues）

### 子任務 4：on-submit.js 新增 workflow_routing 觀察

```javascript
// 在檔案頂部 require instinct：
const instinct = require('../../../scripts/lib/instinct');

// ... 在 systemMessage 賦值之前（約第 70 行之前），增加觀察記錄 ...

// === 新增：workflow_routing 觀察 ===
if (currentState && currentState.workflowType && sessionId) {
  try {
    const routingTrigger = userPrompt.slice(0, 80) || '(empty prompt)';
    const routingAction = `工作流選擇：${currentState.workflowType}`;
    instinct.emit(
      sessionId,
      'workflow_routing',
      routingTrigger,
      routingAction,
      `wf-${currentState.workflowType}`
    );
  } catch {
    // 觀察失敗不影響主流程
  }
}
// === 結束 ===
```

**行為定義**：
- 條件：`currentState && currentState.workflowType && sessionId`（三者都存在才記錄）
- type: `'workflow_routing'`
- trigger: 使用者 prompt 前 80 字元（空時為 `'(empty prompt)'`）
- action: `"工作流選擇：{workflowType}"`
- tag: `"wf-{workflowType}"`（如 `"wf-standard"`、`"wf-quick"`）
- 首次 prompt 時 currentState 為 null → 不記錄（正確行為）

### 子任務 5：search-tools 觀察改為反面糾正

```javascript
// post-use.js 修改兩處：

// 1. 移除 Pattern 2 正面記錄（刪除第 54-58 行）
// 刪除：
//   if (toolName === 'Grep' || toolName === 'Glob') {
//     observeSearchToolPreference(sessionId, toolName);
//   }

// 2. 在 Bash 分支中增加反面偵測（在 observeBashError 呼叫之後）
if (toolName === 'Bash') {
  // ... 既有 observeBashError 邏輯 ...

  // === 新增：search-tools 反面糾正 ===
  const command = (toolInput.command || '').trim();
  if (command && /\b(grep|find|rg)\b/.test(command)) {
    try {
      instinct.emit(
        sessionId,
        'tool_preferences',
        `Bash 中使用 grep/find：${command.slice(0, 80)}`,
        '建議改用 Grep/Glob 工具（而非 Bash grep/find）',
        'search-tools'
      );
    } catch {
      // 觀察失敗靜默處理
    }
  }
  // === 結束 ===
}

// 3. 刪除 observeSearchToolPreference 函式定義（第 145-159 行）
```

**行為定義**：
- 正面記錄（每次 Grep/Glob 使用）完全移除
- 反面記錄只在 Bash 指令中偵測到 `grep`/`find`/`rg` 時觸發
- 使用 word boundary `\b` 避免誤匹配（如 `fingerprint`）
- tag 維持 `'search-tools'` 不變（與既有觀察累積）
- exit_code=0 的 Bash grep 也記錄（不良工具選擇不以成敗區分）

### 子任務 6：evolve skill + confidence-scoring.md 文件同步

**evolve SKILL.md 修改**：
- 第 45 行 `V1 只收集 error_resolutions 和 tool_preferences 兩種 pattern` → 更新為：
  `V1 收集 4 種 pattern：error_resolutions、tool_preferences、agent_performance、workflow_routing`

**confidence-scoring.md 修改**：
- 第 101-107 行 V1 支援的觀察類型表格新增 3 行：

| 類型 | 說明 | 範例 |
|------|------|------|
| `error_resolutions` | 錯誤和其解決方式 | "MODULE_NOT_FOUND → 需要 bun install" |
| `tool_preferences` | 工具偏好 | "Bash grep/find → 建議改用 Grep/Glob" |
| `agent_performance` | Agent 執行表現 | "developer pass at DEV" |
| `workflow_routing` | 工作流選擇偏好 | "wf-standard — 標準功能" |
| `wording_mismatch` | 措詞不匹配偵測 | "💡 MUST → emoji-關鍵詞不匹配" |

## 資料模型

JSONL 格式不變。新增的觀察類型使用既有欄位：

```javascript
// agent_performance 觀察範例
{
  "id": "inst_xxx",
  "ts": "2026-02-28T...",
  "lastSeen": "2026-02-28T...",
  "type": "agent_performance",       // 新類型
  "trigger": "developer pass at DEV", // {agent} {verdict} at {stage}
  "action": "developer 成功完成 DEV",
  "tag": "agent-developer",           // agent-{agentName}
  "confidence": 0.3,
  "count": 1
}

// workflow_routing 觀察範例
{
  "id": "inst_yyy",
  "ts": "2026-02-28T...",
  "lastSeen": "2026-02-28T...",
  "type": "workflow_routing",          // 新類型
  "trigger": "請幫我實作登入功能...",    // 使用者 prompt 前 80 字
  "action": "工作流選擇：standard",
  "tag": "wf-standard",               // wf-{workflowType}
  "confidence": 0.3,
  "count": 1
}
```

儲存位置：`~/.overtone/sessions/{sessionId}/observations.jsonl`（不變）

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/instinct.js       ← 修改：emit() 飽和閾值（~3 行）
  plugins/overtone/hooks/scripts/tool/post-use.js ← 修改：code fence 排除 + search-tools 反面偵測（~20 行）
  plugins/overtone/hooks/scripts/agent/on-stop.js ← 修改：新增 agent_performance 觀察（~10 行）
  plugins/overtone/hooks/scripts/prompt/on-submit.js ← 修改：新增 workflow_routing 觀察（~12 行）
  plugins/overtone/skills/evolve/SKILL.md         ← 修改：更新 V1 觀察類型清單
  plugins/overtone/skills/evolve/references/confidence-scoring.md ← 修改：更新觀察類型表格

測試修改/新增：
  tests/integration/instinct.test.js              ← 修改：新增飽和閾值場景
  tests/integration/wording.test.js               ← 修改：新增 code fence 場景
  tests/integration/agent-on-stop.test.js         ← 修改：新增 instinct 觀察驗證
  tests/integration/post-use-bash.test.js         ← 修改：新增反面偵測場景（Bash grep）
  tests/integration/on-submit-instinct.test.js    ← 新增：workflow_routing 觀察測試
```

## 實作注意事項

- **on-stop.js 是同步腳本**：使用 `readFileSync` 讀 stdin，`instinct.emit()` 也是同步。新增的觀察呼叫不需要 async
- **instinct.emit() 的 try/catch**：所有新增的 hook 觀察呼叫都必須用 try/catch 包裹，觀察失敗不影響 hook 主流程
- **post-use.js 的 export 清單**：如果移除 `observeSearchToolPreference`，記得從 `module.exports` 中也移除（目前未匯出此函式，不受影響）
- **search-tools 反面偵測位置**：必須放在 `observeBashError` 呼叫之後、errorGuard 檢查之後。如果 errorGuard 不為 null（重大錯誤），已經 stdout.write + exit(0) 了，後續程式碼不會執行。反面偵測應該在所有 Bash 場景都執行，包括 exit_code=0 的情況，所以應獨立於 observeBashError 的 if 區塊
- **post-use.js 的 Bash 分支重構**：移除 Grep/Glob 正面記錄後，Bash 分支需要同時處理 errorGuard 和 search-tools 偵測。建議：先執行 errorGuard 邏輯（如有輸出則 exit），再執行 search-tools 偵測（作為獨立的 if 區塊）
- **JSONL 行數成長**：飽和閾值只擋 confidence >= 1.0 的重複 emit。正常場景下一個 tag 需要 8 次 confirm 才到 0.7（autoApply），14 次到 1.0。飽和後不再成長
