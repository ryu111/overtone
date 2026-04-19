# task-adapter.js -- 實作任務

## 深度路由：D2
**Executor 指示**：按 Phase 順序執行，Phase 內步驟為 sequential（同一檔案）。

---

## Phase 1：核心引擎（sequential）

### T1：純函式（~120 行）

**檔案**：`~/.claude/scripts/task-adapter.js`

- [ ] 建立檔案，加入 shebang + 模組說明註解
- [ ] 定義 `TASK_TYPE_MAP` 常數（12 種任務類型 + 中英關鍵詞）
- [ ] 實作 `classifyTask(description)` — 提取 tokens + 比對 TASK_TYPE_MAP + 回傳 `{ type, keywords }`
- [ ] 實作 `keywordOverlap(kwA, kwB)` — Jaccard similarity（交集 / 聯集），空集合回傳 0
- [ ] 實作 `decayConfidence(confidence, daysSinceLastSeen)` — 每 30 天 x0.8
- [ ] 實作 `selectBestPlan(plans)` — 按成功率降序 → lastUsed 降序 → avgDuration 升序

**驗收**：所有函式為 export，無 IO 操作，無副作用。

### T2：IO 邊界（~40 行）

**檔案**：`~/.claude/scripts/task-adapter.js`（接續 T1）

- [ ] 定義常數 `PATTERNS_FILE = ~/.claude/data/task-patterns.json`
- [ ] 實作 `loadPatterns(deps)` — 讀取 JSON，損壞時回傳空模型 `{ version: 1, patterns: {}, stats: {...} }`
- [ ] 實作 `savePatterns(data, deps)` — 確保 data/ 目錄存在 + 原子寫入 JSON
- [ ] 所有 fs 函式透過 deps 注入（existsSync, readFileSync, writeFileSync, mkdirSync）

**驗收**：loadPatterns 損壞 JSON 不 throw，回傳空模型。

### T3：主要 API（~130 行）

**檔案**：`~/.claude/scripts/task-adapter.js`（接續 T2）

- [ ] 實作 `lookupPattern(description, deps)` — classifyTask → 精確匹配 type → 模糊匹配 keywords（Jaccard >= 0.4）→ 衰減後信心 >= 0.6 才回傳
- [ ] 實作 `planForTask(description, context, deps)` — lookupPattern → 有結果用 selectBestPlan → 無結果用 matchTools + suggestDepth → 失敗用 fallback
- [ ] 實作 `recordOutcome(description, tools, depth, success, duration, deps)` — classifyTask → 找/建模式 → 更新 PlanRecord → 重算 confidence → 超 100 筆 prune
- [ ] 實作 `listPatterns(deps)` — loadPatterns → Object.values(patterns)
- [ ] 實作 `prunePatterns(deps)` — 過濾 confidence < 0.3 或 30 天未使用 → 保存 → 回傳 { removed, remaining }
- [ ] export 所有 API 函式

**驗收**：planForTask 的 deps 參數可注入 matchTools、suggestDepth、loadPatterns、savePatterns。

### T4：CLI 入口（~60 行）

**檔案**：`~/.claude/scripts/task-adapter.js`（接續 T3）

- [ ] `if (import.meta.main)` 區塊
- [ ] `plan "<描述>"` → 呼叫 planForTask → stdout JSON
- [ ] `list` → 呼叫 listPatterns → 格式化輸出
- [ ] `prune` → 呼叫 prunePatterns → 輸出清理結果
- [ ] `record "<描述>" --tools=id1,id2 --depth=D2 --success` → 呼叫 recordOutcome
- [ ] 無參數或錯誤參數 → 輸出用法說明 + exit 1

**驗收**：`bun task-adapter.js plan "建立 GitHub PR"` 輸出有效 JSON，exit 0。

---

## Phase 2：測試（sequential，依賴 Phase 1）

### T5：純函式測試

**檔案**：`~/projects/nova-brain/tests/unit/task-adapter.test.js`

- [ ] `classifyTask` 測試：
  - 英文 "fix bug in auth module" → type: "bug-fix"
  - 中文 "建立新功能" → type: "feature"
  - 混合 "security audit 安全" → type: "security"
  - 無匹配 "random text" → type: "general"
  - 空字串 → type: "general"
- [ ] `keywordOverlap` 測試：
  - 完全相同 → 1.0
  - 完全不同 → 0
  - 部分重疊 → 正確 Jaccard 值
  - 空陣列 → 0
- [ ] `decayConfidence` 測試：
  - 0 天 → 不衰減
  - 30 天 → x0.8
  - 60 天 → x0.64
  - 90 天 → x0.512
- [ ] `selectBestPlan` 測試：
  - 按成功率排序
  - 成功率相同 → 最近使用優先
  - 空陣列 → null
  - 單元素 → 該元素

### T6：整合測試

**檔案**：`~/projects/nova-brain/tests/unit/task-adapter.test.js`（接續 T5）

- [ ] `lookupPattern` 測試：
  - 精確匹配存在 + confidence >= 0.6 → 回傳 pattern
  - 精確匹配存在 + confidence < 0.6 → 回傳 null
  - 無精確匹配 + 模糊匹配 Jaccard >= 0.4 → 回傳
  - 無任何匹配 → null
  - 空 patterns → null
- [ ] `planForTask` 測試：
  - 已知類型 → source: "pattern"，包含 tools 和 depth
  - 未知類型（mock matchTools 成功）→ source: "exploration"
  - 未知類型（mock matchTools 失敗）→ source: "fallback"，depth 來自 suggestDepth
  - 空描述 → source: "fallback"
- [ ] `recordOutcome` 測試：
  - 新模式建立：patterns 中新增一筆
  - 更新現有模式：successCount +1
  - 失敗記錄：failCount +1
  - 連續失敗 3 次：該 PlanRecord 被清除
  - confidence 正確更新（成功 +0.1，失敗 -0.15）
- [ ] `prunePatterns` 測試：
  - 清除 confidence < 0.3
  - 清除 30 天未使用
  - 保留有效模式
  - 回傳正確的 removed / remaining

### T7：邊界條件測試

**檔案**：`~/projects/nova-brain/tests/unit/task-adapter.test.js`（接續 T6）

- [ ] loadPatterns 損壞 JSON → 回傳空模型
- [ ] loadPatterns 檔案不存在 → 回傳空模型
- [ ] recordOutcome 後 patterns 數量 > 100 → 自動 prune
- [ ] planForTask 全部依賴失敗 → 回傳 fallback 結果不 throw
- [ ] recordOutcome 重複呼叫相同參數 → 更新而非重複建立

---

## Phase 3：驗收（sequential，依賴 Phase 2）

### T8：全量測試 + 行數確認

- [ ] 執行 `bun test` 確認所有測試通過（含既有測試不迴歸）
- [ ] 確認 `task-adapter.js` 行數 <= 400 行
- [ ] CLI 驗收：`bun ~/.claude/scripts/task-adapter.js plan "建立新的 OS 腳本"` 輸出有效 JSON

---

## 依賴分析

```
Phase 1（sequential）: T1 → T2 → T3 → T4（同一檔案，依序累加）
Phase 2（sequential）: T5 → T6 → T7（同一測試檔案，依序累加）
Phase 3（sequential）: T8（依賴 Phase 1 + 2）
```

Phase 1 和 Phase 2 理論上可並行（不同檔案），但因 Phase 2 測試 import Phase 1 的程式碼，實務上建議 Phase 1 完成後再做 Phase 2。
