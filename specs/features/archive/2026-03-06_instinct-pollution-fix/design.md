---
feature: instinct-pollution-fix
status: in-progress
phase: ARCH
created: 2026-03-06
---

# Design: instinct-pollution-fix

## 技術方案摘要

在 `archiveKnowledge` 的 fragment 迴圈中加入來源路徑過濾。過濾邏輯以 **content 路徑特徵偵測** 為主（方案 a）：掃描 fragment.content 是否含有「非 Overtone 的外部專案路徑特徵」。外部知識降級為 instinct gap-observation，不進入 skill-router 路由。同時清理 `auto-discovered.md` 中已存在的污染條目。

### 決策依據

| 方案 | 評估 | 結論 |
|------|------|------|
| (a) 掃描 content 路徑模式 | 路徑資訊在 content 中，可靠且無需改呼叫介面 | **採用** |
| (b) externalPaths 參數 | 需修改 agent-stop-handler.js 呼叫點，違反 Out of Scope | 否決 |
| (c) 以 agent 名稱推斷 | 不可靠（developer agent 可操作任何專案） | 否決 |

---

## API 介面

### `archiveKnowledge(agentOutput, ctx, _deps?)`

**修改點**：增加可選的第三個參數 `_deps`（測試用依賴注入），函式簽章：

```javascript
/**
 * @param {string} agentOutput
 * @param {object} ctx
 * @param {string} ctx.agentName
 * @param {string} ctx.actualStageKey
 * @param {string} ctx.projectRoot
 * @param {string} [ctx.sessionId]
 * @param {object} [_deps] - 測試用依賴注入
 * @param {object} [_deps.instinct] - 覆蓋 instinct 模組（預設 require('./instinct')）
 * @returns {{ archived: number, errors: number, skipped: number }}
 */
function archiveKnowledge(agentOutput, ctx, _deps = {})
```

**回傳值新增 `skipped` 欄位**：記錄因來源過濾而略過的 fragment 數量（可觀測性）。

### 內部函式：`_isExternalFragment(fragment, pluginRoot)`

```javascript
/**
 * 判斷 fragment 是否來自外部專案（非 Overtone 自身知識）。
 *
 * 判斷邏輯：
 * 1. 若 content 含有 `projects/<外部專案>/` 路徑模式（非 overtone）→ 外部
 * 2. 若 content 無任何路徑特徵 → 保守判定為 Overtone 知識（歸檔）
 * 3. 若 content 含 `plugins/overtone/` → Overtone 知識（歸檔）
 *
 * @param {object} fragment - { type, content, source, keywords }
 * @param {string} pluginRoot - Overtone plugin 根目錄絕對路徑
 * @returns {boolean} true = 外部知識（應略過歸檔）
 */
function _isExternalFragment(fragment, pluginRoot)
```

**具體判斷規則**：

```javascript
// 外部專案路徑特徵（projects/ 下非 overtone 的子目錄）
const EXTERNAL_PATH_PATTERN = /\bprojects\/(?!overtone[\\/])[^\s\/]+[\/\\]/i;

// Overtone 路徑特徵（明確是本專案）
const OVERTONE_PATH_PATTERN = /plugins\/overtone\//i;

function _isExternalFragment(fragment) {
  const content = fragment.content || '';
  // 有外部 projects/ 路徑 → 外部
  if (EXTERNAL_PATH_PATTERN.test(content)) return true;
  // 無路徑特徵，或有 Overtone 路徑 → 非外部（歸檔）
  return false;
}
```

### 過濾後的處理流程

```
for fragment of fragments:
  if _isExternalFragment(fragment):
    if sessionId:
      instinct.emit(sessionId, 'knowledge_gap', trigger, action, tag)
    skipped++
    continue  ← 不進入 routeKnowledge
  // 原有路由邏輯...
  routeKnowledge → writeKnowledge
  archived++
```

---

## 資料模型

### fragment 物件（不變）

```typescript
interface Fragment {
  type: 'findings' | 'context';
  content: string;           // Handoff 區塊的純文字，可能含路徑
  source: string;            // `${agentName}:${stageName} Findings` 格式
  keywords: string[];
}
```

### 回傳值（擴充）

```typescript
interface ArchiveResult {
  archived: number;   // 成功歸檔的 fragment 數
  errors: number;     // 歸檔失敗的 fragment 數
  skipped: number;    // 因來源過濾略過的 fragment 數（新增）
}
```

---

## 清理策略

### 污染條目識別標準

掃描所有 `plugins/overtone/skills/*/references/auto-discovered.md`，刪除含有以下特徵的 `---` 區塊：
- 條目 source 標記含 `product-manager:PM`、`planner:PLAN` 且 content 含 `md-blog`、`kuji` 等外部專案路徑
- 具體：任何 content 含 `projects/md-blog/`、`projects/kuji/` 的條目

### 確認污染條目（目前）

`plugins/overtone/skills/claude-dev/references/auto-discovered.md`：
- `2026-03-06 | product-manager:PM Findings`（含 md-blog MVP 需求、外部專案 BDD）
- `2026-03-06 | planner:PLAN Findings`（含 `projects/md-blog/` 路徑的子任務分解）

### 清理方式

手動精確刪除（developer 執行）：刪除兩個完整的 `---...---` 區塊，保留所有 Overtone 自身知識條目。

---

## 檔案結構

### 修改的檔案

| 檔案 | 變更內容 |
|------|----------|
| `plugins/overtone/scripts/lib/knowledge/knowledge-archiver.js` | 加入 `_isExternalFragment` 函式 + 在 fragment 迴圈加過濾邏輯 + 增加 `_deps` 參數 + 回傳新增 `skipped` 欄位 |
| `plugins/overtone/skills/claude-dev/references/auto-discovered.md` | 移除兩個外部專案污染條目 |
| `tests/unit/knowledge-archiver.test.js` | 新增 3 個 scenarios 覆蓋來源過濾邏輯 |

### 不修改的檔案

- `knowledge-searcher.js` — 過濾在 archiver 層，不影響提取邏輯
- `skill-router.js` — 路由邏輯不變
- `agent-stop-handler.js` — 呼叫點介面不變（`_deps` 是可選第三參數，向後相容）

---

## 測試設計

### Scenario A：外部路徑知識 → archived = 0, skipped = 1

```
GIVEN agentOutput 含 ### Findings 區塊，content 含 `projects/md-blog/src/parser.js`
WHEN 呼叫 archiveKnowledge
THEN archived = 0, skipped = 1, errors = 0
```

### Scenario B：Overtone 路徑知識 → archived > 0（回歸）

```
GIVEN agentOutput 含 ### Findings 區塊，content 含 `plugins/overtone/scripts/lib/`
WHEN 呼叫 archiveKnowledge
THEN archived > 0（正常歸檔），skipped = 0
```

### Scenario C：外部知識 + sessionId → instinct.emit 被呼叫

```
GIVEN agentOutput 含外部路徑知識片段，ctx.sessionId 存在
WHEN 呼叫 archiveKnowledge（注入 mock instinct）
THEN mock instinct.emit 被呼叫（type = 'knowledge_gap'），archived = 0
```

### Mock 策略

```javascript
// Bun 測試中使用 _deps 注入（現有 OS 腳本 pattern）
let emitCalled = false;
let emitArgs = null;
const mockInstinct = {
  emit: (...args) => { emitCalled = true; emitArgs = args; return {}; }
};

const result = archiveKnowledge(agentOutput, ctx, { instinct: mockInstinct });
expect(emitCalled).toBe(true);
expect(emitArgs[1]).toBe('knowledge_gap');
```

---

## Open Questions 回答

### Q1：過濾條件精確定義

採用方案 (a)：掃描 fragment.content 中的路徑特徵。
- 外部判斷：content 含 `projects/<非overtone子目錄>/` 路徑模式
- regex：`/\bprojects\/(?!overtone[\\/])[^\s\/]+[\/\\]/i`
- 不含路徑特徵的 fragment 保守歸檔（不誤傷純文字知識）

### Q2：其他 domain 污染掃描

developer 在 Phase 1 應掃描全部 15 個 auto-discovered.md，但根據路由機制（PM 和 PLAN 的 Findings 含 Markdown/build-system 關鍵詞，可能路由到 build-system 或 dead-code domain），建議一起確認。清理仍手動執行，不需自動化腳本。

### Q3：mock 策略

使用 `_deps` 注入（現有 scripts/os/ 的 pattern）。`archiveKnowledge` 增加可選第三參數 `_deps = {}`，允許測試覆蓋 `instinct` 模組。呼叫方（agent-stop-handler.js）不傳此參數，行為不變。
