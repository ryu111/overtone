# Design — level2-integration-phase2

Agent 個體學習升級：跨 session 記憶 + score context 個人化 + grader 強制化

---

## 技術摘要（What & Why）

- **方案**：4 個獨立的精準修改（agent frontmatter + registry-data + pre-task score context + stop-message-builder 分支）
- **理由**：4 個子任務操作完全不同的檔案，無邏輯依賴，全部可並行執行；每個修改都是最小必要的局部改動，不破壞現有行為
- **取捨**：score context 仍為 stage-level 均值（非個人歷史），但透過加入 agentName 標註讓 agent 明白這是「自己在此 stage 的表現參考」；資料語意有輕微失真（實際是 stage 共享數據），但現階段實作成本最低，後續 Phase 3 若需要才升為 agent-level 追蹤

---

## Open Questions 決策

### Q1：registry-data.json 修改路徑

**決策**：使用 `manage-component.js update agent {name} '{"memory":"local"}'` 更新各 agent frontmatter，`updateAgent()` 中已有 `memoryChanged` 分支會自動同步寫入 `registry-data.json` 的 `agentMemory` 欄位（`config-api.js` L638-654）。不需要直接修改 registry-data.json。

透過 `manage-component.js` 更新 5 個 agent 的 `memory: local` 會同時：
1. 更新 `agents/{name}.md` frontmatter
2. 自動同步 `registry-data.json.agentMemory[name] = 'local'`

子任務 2（更新 registry-data.json）因此可以合併入子任務 1，不需要額外的直接 JSON 修改步驟。

### Q2：score context 語意備注

**決策**：標題改為 `[品質歷史 — {agentName}@{targetStage}（N 筆）]`，不加「此為 stage 整體平均」備注說明。理由：備注會增加 prompt 長度，且 agent 看到自己的名稱在標題中就足以理解「這是我的數據」，語意上已足夠引導。若後續 agent 混淆，再加備注即可。

### Q3：grader 強制化 workflow 清單

**決策**：納入 `product` 和 `product-full`。兩者均含 gradedStages（PLAN、ARCH、DEV、REVIEW、TEST），且是正式的 production workflow，品質把關需求比 quick/single 更高。強制清單：`['standard', 'full', 'secure', 'product', 'product-full']`。

---

## API 介面設計

### 子任務 1+2：manage-component.js update agent（現有 API）

```
bun scripts/manage-component.js update agent developer '{"memory":"local"}'
bun scripts/manage-component.js update agent tester    '{"memory":"local"}'
bun scripts/manage-component.js update agent debugger  '{"memory":"local"}'
bun scripts/manage-component.js update agent planner   '{"memory":"local"}'
bun scripts/manage-component.js update agent architect '{"memory":"local"}'
```

每次執行後 config-api.js 的 `updateAgent()` 自動：
- 寫入 `agents/{name}.md` frontmatter `memory: local`
- 寫入 `registry-data.json` `agentMemory[name] = "local"`

Developer 還需在每個 agent .md 的 body 加入「跨 Session 記憶」說明段落（格式參考 `code-reviewer.md` 第 23-43 行）。

### 子任務 3：pre-task.js score context 修改

```javascript
// 修改前（pre-task.js 第 327 行）
scoreContext = [
  `[品質歷史 — ${targetStage}（${summary.sessionCount} 筆）]`,
  ...
].join('\n');

// 修改後
scoreContext = [
  `[品質歷史 — ${agentName}@${targetStage}（${summary.sessionCount} 筆）]`,
  ...
].join('\n');
```

變數 `agentName` 在此作用域已存在（`targetAgent`），直接使用 `targetAgent` 即可（或建立 `agentName` alias）。

### 子任務 4：stop-message-builder.js grader 強制化

```javascript
// 修改前（stop-message-builder.js 第 151 行）
messages.push(`🎯 建議委派 grader 評分：STAGE=${stageKey} AGENT=${agentName} SESSION_ID=${sessionId}${workflowHint}`);

// 修改後
const MUST_GRADE_WORKFLOWS = ['standard', 'full', 'secure', 'product', 'product-full'];
const graderPrefix = workflowType && MUST_GRADE_WORKFLOWS.includes(workflowType)
  ? '📋 MUST 委派 grader 評分'
  : '🎯 建議委派 grader 評分';
messages.push(`${graderPrefix}：STAGE=${stageKey} AGENT=${agentName} SESSION_ID=${sessionId}${workflowHint}`);
```

---

## 資料模型

### registry-data.json agentMemory 欄位（修改後）

```json
{
  "agentMemory": {
    "code-reviewer":     "local",
    "security-reviewer": "local",
    "product-manager":   "local",
    "developer":         "local",
    "tester":            "local",
    "debugger":          "local",
    "planner":           "local",
    "architect":         "local"
  }
}
```

儲存位置：`plugins/overtone/scripts/lib/registry-data.json`
格式：JSON（透過 `manage-component.js update agent` 自動寫入）

### Agent frontmatter 變更（以 developer.md 為例）

```yaml
---
name: developer
# ... 現有欄位 ...
memory: local   # 新增此行
skills:
  - ...
---
```

---

## 檔案結構

```
修改的檔案（4 個，全部可並行）：

  plugins/overtone/agents/developer.md   ← 加 memory: local + 跨 Session 記憶段落
  plugins/overtone/agents/tester.md      ← 加 memory: local + 跨 Session 記憶段落
  plugins/overtone/agents/debugger.md    ← 加 memory: local + 跨 Session 記憶段落
  plugins/overtone/agents/planner.md     ← 加 memory: local + 跨 Session 記憶段落
  plugins/overtone/agents/architect.md   ← 加 memory: local + 跨 Session 記憶段落

  plugins/overtone/scripts/lib/registry-data.json  ← agentMemory 新增 5 個 agent
                                                      （透過 manage-component.js 自動寫入）

  plugins/overtone/hooks/scripts/tool/pre-task.js  ← score context 標題加入 agentName

  plugins/overtone/scripts/lib/stop-message-builder.js  ← grader 訊息強制化分支

新增的檔案：
  （無）
```

---

## 關鍵技術決策

### 決策 1：子任務 1+2 是否需要拆開

- **合併執行**（選擇）：`manage-component.js update agent` 呼叫 `config-api.js updateAgent()`，其中 `memoryChanged` 分支已自動同步 `registry-data.json`，一步完成兩件事。無需額外直接修改 registry-data.json。
- **分開執行**（未選）：先改 agent .md，再用 Write/Edit 改 registry-data.json — 後者受 guard 保護，直接修改可能被阻擋。

### 決策 2：MUST_GRADE_WORKFLOWS 常數位置

- **定義在 stop-message-builder.js 函式內**（選擇）：4 行 inline，語意明確，無需新增模組或修改 registry。
- **加入 registry.js**（未選）：增加 registry 複雜度，且 grader 強制化是 stop-message-builder 的本地邏輯，不需要被其他模組引用。

### 決策 3：agentName 變數來源

- **使用現有 `targetAgent`**（選擇）：`pre-task.js` 的 score context 區塊已在 `targetAgent` 的作用域內，直接使用即可，不需要新變數。
- **新增 agentName alias**（未選）：冗餘，增加閱讀負擔。

---

## 實作注意事項

給 developer 的提醒：

- `manage-component.js update agent` 受 PreToolUse(Write/Edit) guard 保護的是 `agents/*.md` 直接編輯，但 manage-component.js 透過 config-api 原子寫入是允許的路徑（guard 針對的是直接 Write/Edit 工具呼叫，不是 Bash 執行腳本）
- agent .md body 的「跨 Session 記憶」段落，需要 developer 手動用 Write 工具補充（manage-component.js 只更新 frontmatter），或使用 `update agent {name} '{"memory":"local","body":"...完整body..."}'` 一次性傳入完整 body
- 建議使用 `update agent {name} '{"memory":"local"}'`（只更新 frontmatter），然後手動補充 body 段落（Edit 工具修改 agent .md body 區塊，非 frontmatter）— 但 agent .md 受 Write/Edit guard 保護，必須使用 manage-component.js 的 `{"body":"..."}` 方式或確認 guard 邏輯是否允許
- 確認：pre-edit-guard.js 的攔截條件是 `agents/*.md`，所有直接 Write/Edit 都會被阻擋，body 必須透過 `manage-component.js update agent {name} '{"body":"..."}'` 更新
- pre-task.js 修改點在第 327 行（`品質歷史` 標題那一行），使用 `targetAgent` 變數（已在作用域內）
- stop-message-builder.js 修改點在第 151 行，`workflowType` 參數已從 ctx 解構（第 60 行）

---

## 測試重點

- `bun test` 全套通過（特別是 stop-message-builder.test.js 和 pre-task 相關測試）
- 手動驗證：`manage-component.js update agent developer '{"memory":"local"}'` 後，`registry-data.json` 的 `agentMemory` 是否包含 `developer: "local"`
- 手動驗證：grader 訊息在 workflowType=standard 時顯示 `📋 MUST 委派`，在 workflowType=quick 時顯示 `🎯 建議委派`
