# Gap Analyzer — 任務追蹤

## 深度路由：D2
planner → executor

## 子任務依賴分析

```
Phase 1（sequential）: gap-analyzer.js 核心實作
Phase 2（sequential，依賴 Phase 1）: 單元測試
Phase 3（sequential，依賴 Phase 2）: CLI 驗收
```

## Phase 1：核心實作

- [ ] T1.1 建立 `~/.claude/scripts/gap-analyzer.js` — GAP_MAP 映射表（16 個 finding.type + FALLBACK_GAP）
- [ ] T1.2 實作 `calculatePriority(severity, impactFactor)` 純函式 — 公式：`severityWeight * 60 + impactFactor * 40`
- [ ] T1.3 實作 `extractFiles(finding)` — 從 element 路徑解析相關檔案
- [ ] T1.4 實作 `findingToGap(finding)` 純函式 — 查 GAP_MAP + 計算 priority + 組裝 Gap 物件
- [ ] T1.5 實作 `analyzeGaps(options?)` — import health-check `runAll()` + 轉換 + 排序 + 統計
- [ ] T1.6 實作 CLI 入口 — argv 解析（`--summary` / `--category=X` / `--all` / `--checks`）+ stdout JSON + stderr 摘要
- [ ] T1.7 export `{ analyzeGaps, findingToGap, calculatePriority, GAP_MAP }`

## Phase 2：單元測試

- [ ] T2.1 建立 `~/projects/overtone/tests/unit/gap-analyzer.test.js`
- [ ] T2.2 GAP_MAP 完整性：斷言覆蓋 health-check 所有 16 個已知 finding.type
- [ ] T2.3 `findingToGap` 正常路徑：每個 type 產出正確 category + repairHint + priority
- [ ] T2.4 `findingToGap` fallback：未知 type → category "unknown"
- [ ] T2.5 `calculatePriority` 邊界：critical/1.0 → 100, info/0.0 → 12, warning/0.5 → 56
- [ ] T2.6 `analyzeGaps` 整合：mock health-check，驗證 gaps 按 priority 降序 + stats 正確
- [ ] T2.7 `analyzeGaps` 錯誤路徑：health-check throw → 回傳含 error 的 GapReport
- [ ] T2.8 `bun test gap-analyzer.test.js` 全部通過

## Phase 3：CLI 驗收

- [ ] T3.1 `bun ~/.claude/scripts/gap-analyzer.js` — stdout 輸出合法 JSON
- [ ] T3.2 `bun ~/.claude/scripts/gap-analyzer.js --summary` — stderr 輸出人可讀摘要
- [ ] T3.3 確認程式碼 400 行以內

## 完成定義

- [ ] `bun test gap-analyzer.test.js` 全部通過
- [ ] 每個 finding.type（16 個）都有映射
- [ ] `findingToGap` 確定性：同一 Finding → 同一 Gap
- [ ] 程式碼 400 行以內、零外部依賴

## 進度追蹤

| Phase | 狀態 | 日期 |
|:-----:|:----:|------|
| 1 | 待執行 | — |
| 2 | 待執行 | — |
| 3 | 待執行 | — |
