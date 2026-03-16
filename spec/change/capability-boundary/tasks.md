# 能力邊界感知 — 任務清單

## 子任務依賴分析

```
Phase 1（sequential）: T1 → T2 → T3（核心模組 + CLI + 單元測試）
Phase 2（parallel）: T4 + T5（各自修改不同檔案）
Phase 3（sequential）: T6（整合驗證，依賴 Phase 1+2）
```

---

## Phase 1：capability-probe.js 核心

### T1：核心純函式 + 資料模型

**執行者**：executor
**檔案**：`~/.claude/scripts/capability-probe.js`
**行數**：~150 行

- [ ] 實作 `classifyStrength(cap)` 純函式（4 種分類）
- [ ] 實作 `decayCount(count, daysSinceLastSeen)` 純函式
- [ ] 實作 `getBoundary(deps?)` 讀取 capability-boundary.json
- [ ] 實作 `saveBoundary(boundary, deps?)` 寫入 capability-boundary.json
- [ ] 實作 `getWeakCapabilities(deps?)` 過濾 weak + missing
- [ ] capability-boundary.json schema：version / capabilities / sessions
- [ ] 損壞 fallback：JSON.parse 失敗 → 回傳空模型 `{ version: 1, capabilities: {}, sessions: { total: 0, withGaps: 0 } }`

### T2：probeSession 主流程

**執行者**：executor（依賴 T1）
**檔案**：`~/.claude/scripts/capability-probe.js`
**新增行數**：~80 行

- [ ] 讀取 flow-events.jsonl，篩選最新 sid
- [ ] 從 prompt_submit 事件提取 intent 字串
- [ ] 呼叫 `matchTools(intent)` 取得 recommended + missing
- [ ] 從 tool_use 事件提取 actualTools
- [ ] 計算 coverage = |recommended ∩ actualTools| / |recommended|
- [ ] 偵測失敗信號（errors, blocks, fixKeywords from learner pattern）
- [ ] 更新 boundary：coverageHits / missingHits（失敗加倍）
- [ ] 衰減所有能力計數
- [ ] 門檻觸發：missingHits >= 3 → 寫入 improvements.jsonl
- [ ] 回傳 ProbeResult 物件

### T3：CLI 入口 + 單元測試

**執行者**：executor（依賴 T2）

**capability-probe.js CLI 部分**：~20 行
- [ ] `--summary`：人可讀摘要（stderr）
- [ ] `--weak`：只列 weak + missing
- [ ] `--json`：JSON 輸出（stdout）
- [ ] 無參數：執行 probeSession（SessionEnd 用途）

**capability-probe.test.js**：~150 行
- [ ] classifyStrength：4 種分類各 1 個 case
- [ ] decayCount：0 天（不衰減）、30 天（x0.8）、90 天（x0.51）
- [ ] probeSession（mock）：有缺口 → boundary missingHits 增加
- [ ] probeSession（mock）：無缺口 → coverageHits 增加
- [ ] probeSession（mock）：失敗信號 → missingHits 加倍
- [ ] 門檻觸發：missingHits >= 3 → improvements.jsonl 寫入驗證
- [ ] 空 events → 跳過不 crash
- [ ] boundary.json 損壞 → 從空模型重建

---

## Phase 2：整合現有模組（並行）

### T4：context-injector 整合

**執行者**：executor
**檔案**：`~/.claude/hooks/modules/context-injector.js`

- [ ] 新增 `injectCapabilityBoundary()` 函式
- [ ] 讀取 `~/.claude/data/capability-boundary.json`
- [ ] 只在有 weak 或 missing 能力時注入
- [ ] 格式：`--- 能力邊界 ---\n⚠️ 薄弱能力：{weak}\n❌ 缺失能力：{missing}\n`
- [ ] 在 SessionStart handler 的 contextParts 加入此來源

### T5：maintainer.js 觸發整合

**執行者**：executor
**檔案**：`~/.claude/scripts/maintainer.js`

- [ ] 在 SessionEnd Phase 增加 `import { probeSession } from './capability-probe.js'`
- [ ] 與 learner 並行呼叫（Promise.all）
- [ ] 5 秒 timeout 保護
- [ ] 失敗不影響 maintainer 其他 Phase

---

## Phase 3：端到端驗證

### T6：整合驗證

**執行者**：executor（依賴 T1-T5）

- [ ] `bun test` 全部通過（現有 658 + 新增 ~8 = ~666）
- [ ] 手動測試：`bun ~/.claude/scripts/capability-probe.js --summary` 輸出合理
- [ ] 確認 context-injector 有注入能力邊界（檢查 SessionStart hook stdout）
- [ ] 確認 improvements.jsonl 格式被 lifecycle-orchestrator 識別

---

## 估算

| 項目 | 行數 | 時間 |
|------|------|------|
| capability-probe.js | ~250 | Phase 1 主體 |
| capability-probe.test.js | ~150 | Phase 1 測試 |
| context-injector.js 修改 | ~25 | Phase 2 |
| maintainer.js 修改 | ~15 | Phase 2 |
| **合計** | ~440 | |
