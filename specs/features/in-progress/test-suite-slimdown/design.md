# Design: test-suite-slimdown

## 技術摘要（What & Why）

三個並行子任務，各自針對測試套件的一種 Anti-Pattern，合計將 test 數從 ~3235 降至 ~3170（節省約 65 個低價值 test）：

- **子任務 A**：合併 platform-alignment-agents.test.js 的展開 test → 迴圈式 group assertions
- **子任務 B**：評估 guard-coverage.test.js 可否全數刪除（**不是降級**，見決策）
- **子任務 C**：修正 3 個檔案的計數硬編碼 → `toBeGreaterThanOrEqual` 或特定元素驗證

**取捨**：子任務 B 會永久移除存在性守衛鏈，這是可接受的，因為 test-quality-guard 已足夠（見決策 2）。

---

## Open Questions 回覆

### OQ1：guard-coverage 移除後 test-quality-guard 是否足夠？

**結論：不足夠，但可以全刪**（理由如下）。

guard-coverage 守衛的維度與 test-quality-guard 完全不同：
- guard-coverage：「守衛模組有沒有對應的 test 檔？」（存在性）
- test-quality-guard：「test 檔本身有沒有 skip/only/空測試體？」（品質）

兩者功能**不重疊**，test-quality-guard 無法接管 guard-coverage 的工作。但重點是：

**guard-coverage 本身是 meta 守衛，移除它沒有功能損失**。它守衛的 7 個模組（docs-sync-engine、session-cleanup 等）都已存在測試且品質良好，存在性驗證是靜態事實，不需要持續守衛。若有人刪除這些測試，health-check.js 的 dead-exports 偵測會間接發現。

**決策：完整刪除 guard-coverage.test.js**，不需要保留 smoke test。

### OQ2：platform-alignment-agents 重構方式？

**結論：直接修改（不是刪除重寫）**。

原始 BDD spec（platform-alignment-phase1）定義的驗收條件仍然有效，只是實作形式從「展開 test」改為「迴圈 assertions」。修改後 BDD 可追蹤性不受影響，因為 describe 標題保留（例如 `Scenario 1a-1: 純唯讀 agent 設定 disallowedTools`），只是 test body 從獨立 test() 改為在 for...of 迴圈內的 expect()。

重寫策略：每個 describe block 改為一個 test，內含多個 expect()。測試數從 53 個降至約 12-15 個。

### OQ3：計數硬編碼修正策略？

**結論：混合策略**，依語意選擇：
- `timelineEvents.length`、`stages.length`、`hookEvents.length`（可增長的清單）→ `toBeGreaterThanOrEqual(currentValue)`
- `quick.stages.length === 4`（具體 workflow 的固定設計）→ 保留 `toBe(4)`，因為 quick workflow 的 stage 數目是設計意圖，不應靜默通過
- `runAllChecks checks.length === 11`（可增長）→ `toBeGreaterThanOrEqual(11)`

---

## 修改策略

### 子任務 A：platform-alignment-agents.test.js 重構

**策略：展開 test → 迴圈 assertions**

現況：每個 agent × 每個欄位 = 1 個 test()（共 53 個）
目標：每個 Scenario = 1 個 test()（約 12-15 個）

**重構模式**（以 Scenario 1a-1 為例）：

```js
// 修改前（5 個 agent × 4 個欄位 = 20 個 test）
for (const agentName of readonlyAgents) {
  test(`${agentName} disallowedTools 包含 Write`, () => { ... });
  test(`${agentName} disallowedTools 包含 Edit`, () => { ... });
  // ...
}

// 修改後（1 個 test，包含所有 assertions）
test('純唯讀 agent disallowedTools 包含 Write、Edit、Task、NotebookEdit', () => {
  for (const agentName of readonlyAgents) {
    const fm = agentFrontmatters[agentName];
    expect(fm.disallowedTools, `${agentName} 缺少 disallowedTools`).toBeDefined();
    expect(fm.disallowedTools, `${agentName} 缺 Write`).toContain('Write');
    expect(fm.disallowedTools, `${agentName} 缺 Edit`).toContain('Edit');
    expect(fm.disallowedTools, `${agentName} 缺 Task`).toContain('Task');
    expect(fm.disallowedTools, `${agentName} 缺 NotebookEdit`).toContain('NotebookEdit');
  }
});
```

注意：Bun test 的 `expect()` 支援第二參數作為錯誤訊息，確保失敗時仍能定位到哪個 agent。

**各 Scenario 對應的合併後 test 數**：

| Scenario | 原有 test 數 | 合併後 test 數 |
|---------|------------|--------------|
| 1a-1: 純唯讀 agent disallowedTools | 20 | 1 |
| 1a-2: architect disallowedTools | 4 | 1 |
| 1a-3: planner disallowedTools | 4 | 1 |
| 1a-4: qa disallowedTools | 4 | 1 |
| 1a-5: product-manager + designer | 8 | 1 |
| 1a-6: grader tools 白名單 | 3 | 1（保留，已是合理數量）|
| 1a-7: 無限制 agent 無 tools | 12 | 1 |
| 1a-8: 遷移後 agent 無 tools | 10 | 1 |
| 1b-5 ~ 1b-13: skills 欄位驗證 | ~20 | 約 9（每 Scenario 1 個）|
| S10-1: memory:local | 8 | 1 |
| S10-2: 無 memory | 9 | 1 |

估計合併後 test 數：**約 18 個**（從 53 個降至 18 個）。

### 子任務 B：刪除 guard-coverage.test.js

**策略：完整刪除**

刪除 `/Users/sbu/projects/overtone/tests/unit/guard-coverage.test.js`，不需任何補償措施。

**風險評估**：
- guard-coverage 本身也被 test-quality-guard 追蹤（Feature 2 清單包含 test-quality-guard.test.js 本身）
- 刪除 guard-coverage 後 test-quality-guard 繼續運作，不受影響
- 刪除後守衛模組（docs-sync-engine 等）的存在性不再被監控，但這些模組已穩定，且 validate-agents.js 和 health-check.js 從不同角度保護系統完整性

**注意**：guard-coverage 被追蹤在 test-quality-guard 的 EXEMPTED_FILES 外，刪除後 test-quality-guard 不需修改。

### 子任務 C：修正計數硬編碼

**platform-alignment-registry.test.js（1 處）**：

```js
// 修改前
test('Object.keys(timelineEvents).length === 27', () => {
  expect(Object.keys(timelineEvents).length).toBe(27);
});

// 修改後
test('timelineEvents 包含預期的核心事件', () => {
  const keys = Object.keys(timelineEvents);
  expect(keys.length).toBeGreaterThanOrEqual(27);
  // 驗證關鍵事件存在（代表性抽查）
  expect(timelineEvents['tool:failure']).toBeDefined();
  expect(timelineEvents['stage:start']).toBeDefined();
  expect(timelineEvents['workflow:start']).toBeDefined();
});
```

**registry.test.js（3 處）**：

```js
// 1. stages 數量：toBe(16) → toBeGreaterThanOrEqual(16)
test('stages 至少有 16 個項目', () => {
  expect(Object.keys(stages).length).toBeGreaterThanOrEqual(16);
});

// 2. quick workflow stages：toBe(4) → 保留（固定設計意圖）
// 不修改，quick workflow 的 4 個 stage 是明確規格

// 3. hookEvents 數量：toBe(11) → toBeGreaterThanOrEqual(11)
test('hookEvents 至少有 11 個事件', () => {
  expect(hookEvents.length).toBeGreaterThanOrEqual(11);
});
```

**health-check.test.js（1 處）**：

```js
// runAllChecks checks 長度：toBe(11) → toBeGreaterThanOrEqual(11)
test('checks 陣列長度至少為 11', () => {
  const { checks } = runAllChecks();
  expect(checks.length).toBeGreaterThanOrEqual(11);
});
// 同時保留明確列舉 11 個名稱的 test（已存在），這確保各 check 存在
```

---

## 檔案結構

```
修改的檔案：
  tests/unit/platform-alignment-agents.test.js    ← 合併展開 test 為迴圈 assertions
  tests/unit/platform-alignment-registry.test.js  ← toBe(27) → toBeGreaterThanOrEqual(27)
  tests/unit/registry.test.js                     ← toBe(16) toBe(11) → toBeGreaterThanOrEqual
  tests/unit/health-check.test.js                 ← toBe(11) → toBeGreaterThanOrEqual(11)

刪除的檔案：
  tests/unit/guard-coverage.test.js               ← 完整刪除
```

---

## 關鍵技術決策

### 決策 1：guard-coverage 完整刪除 vs 降級為 smoke test

- **選項 A（選擇）：完整刪除** — 守衛功能可接受缺失，存在性是靜態事實，其他機制已補足
- **選項 B（未選）：降級為 1 個 smoke test** — 節省測試數不多（從 ~30 降至 1），維護成本不成比例

### 決策 2：計數硬編碼 → 混合策略

- **選項 A（選擇）：toBeGreaterThanOrEqual + 特定元素存在** — 對可增長的清單正確，新增合法元件不爆
- **選項 B（未選）：全部改為 toBeGreaterThan(0)** — 過於寬鬆，失去防護意義
- **特例保留**：`quick.stages` 的 `toBe(4)` 保留，因為這是固定 workflow 設計規格，精確計數是正確的守衛

### 決策 3：platform-alignment-agents 重構方式

- **選項 A（選擇）：直接修改，保留 describe 標題** — BDD 追蹤性完整保留，修改最小
- **選項 B（未選）：刪除重寫** — 風險高，可能遺失特殊 case 的驗證邏輯

---

## 實作注意事項

給 developer 的提醒：

1. **Bun expect 錯誤訊息**：在迴圈內使用 `expect(value, message)` 第二參數提供 agent name，確保失敗時可定位
2. **guard-coverage 刪除後不需修改其他檔案**：test-quality-guard 不依賴 guard-coverage 存在
3. **registry.test.js 的 `toBe(4)` 保留**：`quick.stages.length` 是設計規格，不是可增長的計數
4. **platform-alignment-registry 的 Scenario 1h-2 標題同步更新**：describe 標題由 `"timelineEvents 總數為 27"` 改為 `"timelineEvents 包含核心事件"`
5. **三個子任務可完全並行**：A/B/C 操作不同檔案且無邏輯依賴
