# gap-discovery.js -- 實作任務

## 依賴分析

```
Phase 1（sequential）: T1 → T2 → T3（核心引擎，後步依賴前步的函式）
Phase 2（parallel）:   T4 + T5（測試 + 整合，依賴 Phase 1 完成）
```

---

## Phase 1：核心引擎（sequential）

### T1：4 個 Collector 函式

**檔案**：`~/.claude/scripts/gap-discovery.js`
**行數**：~150 行
**說明**：建立檔案骨架 + 4 個 collector 函式，每個負責一個數據源 → RawSignal[]

**步驟**：
1. 建立 gap-discovery.js，寫 JSDoc 型別定義（RawSignal, Suggestion, DiscoveryReport）
2. `collectFromGapAnalyzer(_mock)` — import analyzeGaps，Gap → RawSignal 映射
3. `collectFromCapabilityProbe(_mock)` — import getWeakCapabilities，WeakCapability → RawSignal
4. `collectFromScores(_mock)` — readFileSync scores.jsonl，過濾 F/C 級，Score → RawSignal
5. `collectFromRoadmap(_mock)` — readFileSync roadmap.md，regex 解析狀態欄位，Task → RawSignal

**驗收**：4 個 collector 函式可獨立呼叫，輸出格式統一為 RawSignal[]

---

### T2：合併層 + 主函式

**檔案**：`~/.claude/scripts/gap-discovery.js`（接續 T1）
**行數**：~120 行（累計 ~270）
**說明**：合併去重 + 信心計算 + 排序 + discoverGaps 主函式

**步驟**：
1. `normalizeElement(element)` — 統一 element 格式（去除 skills/、scripts/ 等前綴）
2. `calculateConfidence(signals)` — base(severity) + crossSourceBonus(+15/源)，上限 100
3. `mergeSignals(signals)` — 以 normalizedElement 分組 → 合併為 Suggestion
4. `derivePriority(score)` — score >= 70 → P1, >= 40 → P2, else P3
5. `deriveDepth(suggestion)` — 依 sources 數量和 impact 決定 D1-D3
6. `discoverGaps(options)` — Promise.all 收集 4 源 → mergeSignals → 排序截斷 → DiscoveryReport

**驗收**：`discoverGaps({ _mock: {...} })` 回傳正確的 DiscoveryReport

---

### T3：Notion 同步 + CLI 入口

**檔案**：`~/.claude/scripts/gap-discovery.js`（接續 T2）
**行數**：~80 行（累計 ~350）
**說明**：Notion dedup 過濾 + 同步建立 + CLI 入口

**步驟**：
1. `filterExistingNotion(suggestions, _deps)` — 查詢 Notion 待做+進行中，排除同名
2. `syncToNotion(suggestions, options, _deps)` — 按信心分級呼叫 createTask
3. CLI 入口 — argv 解析（--summary / --sync / --sources / --min-confidence）
4. Export：discoverGaps, syncToNotion, mergeSignals, calculateConfidence, collectFrom*

**驗收**：`bun gap-discovery.js --summary` 輸出人可讀摘要；`bun gap-discovery.js --sync` 執行完整流程

---

## Phase 2：測試 + 整合（parallel，依賴 Phase 1）

### T4：測試套件

**檔案**：`~/projects/overtone/tests/unit/gap-discovery.test.js`
**行數**：~200 行
**說明**：覆蓋所有純函式 + mock 整合測試

**測試項目**：
1. collectFromGapAnalyzer — mock _mockFindings → 正確 RawSignal
2. collectFromCapabilityProbe — mock boundary → 正確 RawSignal
3. collectFromScores — mock scores 內容 → 只取 F/C 級
4. collectFromRoadmap — mock roadmap 內容 → 正確解析狀態
5. mergeSignals — 同 element 合併、confidence 加成
6. calculateConfidence — 單源/多源/上限 100
7. derivePriority — P1/P2/P3 邊界值
8. deriveDepth — D1/D2/D3 條件
9. discoverGaps — 全 mock 端到端
10. discoverGaps — 部分源失敗仍回傳結果
11. syncToNotion — mock createTask，驗證按信心分級呼叫

**驗收**：`bun test gap-discovery` 全部通過

---

### T5：self-drive-prompt.md 整合

**檔案**：`~/.claude/data/self-drive-prompt.md`
**說明**：改寫 self-drive prompt，從手動讀 4 源改為呼叫 gap-discovery.js

**步驟**：
1. 改寫步驟 1-4：`bun ~/.claude/scripts/gap-discovery.js --summary` 取得缺口概覽
2. 改寫步驟 5：`bun ~/.claude/scripts/gap-discovery.js --sync` 自動建立任務
3. 保留人工判斷環節：AI 看到 summary 後可選擇覆蓋引擎建議

**驗收**：self-drive-prompt.md 內容已更新，引用 gap-discovery.js

---

## 總覽

| Task | 檔案 | Phase | 依賴 | 預估行數 |
|------|------|:-----:|------|:--------:|
| T1 | gap-discovery.js | 1 | 無 | ~150 |
| T2 | gap-discovery.js | 1 | T1 | ~120 |
| T3 | gap-discovery.js | 1 | T2 | ~80 |
| T4 | gap-discovery.test.js | 2 | T3 | ~200 |
| T5 | self-drive-prompt.md | 2 | T3 | ~30 |
