# P2 批次整合 — iter 15 session 後 consolidated

**來源**：iter 12 inventory 整理 + 本 session 新發現項
**日期**：2026-04-19
**Scope**：nova 自己（~/.claude/），不需 cross-dispatch

## 批次清單

### P2-1: chain-integrity.js 方案 A 全拆 9 module
- **狀態 iter 28 ROI 評估**：**defer not actionable**
  - 當前主檔 497 行 / ref.js 拆出 133 行，total 630 行（兩檔合計）
  - 主檔離 650 上限 -153 行（24% 空間）
  - 無新 Phase 即將加入（spec 觸發條件皆未達）
  - 拆分成本 ~2h vs 無觸發信號 → ROI 低
- **未來 pick 條件**：主檔 > 600 行 OR 新 Phase 7 spec 提出 OR scanner 性能問題

### P2-2: SessionStart 快照 lag 分析
- **來源**：iter 15 前 deferred backlog（iter 16 候選）
- **現象**：SessionStart 注入 context 可能 lag（顯示的 reflection 數 vs 實際 jsonl 不符 — iter 15 審計發現 jsonl 只 2 entries，SessionStart 顯示 26）
- **根因假設**：SessionStart 讀 obsidian/raw/reflections/YYYY-MM-DD.md（rotated）而非 jsonl 即時
- **成本**：~30 min D1 調查 + 記錄 ADR
- **優先級**：medium（影響 session 感知準確度）

### P2-3: structural-invariants 升 AST-based
- **狀態 iter 19 ROI 量化**：**defer 至 FP > 5/month 才啟動**
  - 業界 AST FP rate 8-12% vs nova identifier-set 估 15-20%
  - 本 session 20 iter 實測 FP 2 次 = 10% 觸發率（不高於業界）
  - 成本 1-2h vs 減 FP 1/20 iter → ROI 未達
  - 詳見 `obsidian/semantic/external-references/ast-static-analysis-2026.md` § iter 19 ROI 量化
- **未來 pick 條件**：FP > 5/month OR 新類型 preserveExports/Declarations FP 新增 OR ESLint 官方 AST native integration 成熟

### P2-4: refactor-test-sync-guard hook POC
- **狀態 iter 19 判定**：**already covered by P2-6 + review-agent.js — close as YAGNI**
  - iter 16 P2-6 hasCrossRepoTest prefix match 已是 refactor-test drift 被動偵測
  - review-agent.js score + auto-append nudge 已起 warn 作用
  - 新 hook 會與既有功能重複
- **新 edge case（iter 19 發現 → P2-7）**：multi-function-in-one-test 類型（inject-learning-context.js 對應 inject-functions.test.js）prefix match 無法識別。

### P2-7: hasCrossRepoTest multi-function test 偵測（iter 19 新發現）
- **現象**：`inject-learning-context.js` 對應 test 是 `inject-functions.test.js`（多 inject 函式共用 test），prefix match 無法識別 → auto-append 誤報
- **成本**：~30 min D1 — 加 alias whitelist 或 test 檔 content scan 看 import
- **優先級**：low（干擾但不阻擋工作）

### P2-5: 白名單 filter 定期 audit 入 skills/claude-dev
- **來源**：iter 15 前 reflection deferred
- **目標**：Claude Code 新版持續加 slash commands（hooks/statusline/plugin/mcp），skills/claude-dev 需定期 audit 白名單是否涵蓋新能力
- **成本**：~15 min D1 + schedule（每 quarter 提醒）
- **優先級**：medium（避免白名單 stale）

### P2-6: reflection-persist auto-append 誤報（iter 15 新發現）
- **現象**：iter 15 commit f3585ae 實際**有**對應 test（nova-brain repo），但 auto-append 檢測「改 1 程式檔無 test」因為 ~/.claude 的 commit diff 無 test 檔
- **根因**：auto-append 邏輯不跨 repo 關聯，單看當 repo commit
- **成本**：~30 min D1 擴 auto-append 邏輯讀 cross-repo test map
- **優先級**：low（誤報不阻擋工作，但會干擾反思信號）

## 批次 dispatch 策略

- **P2 全項皆 nova 自己 scope**，不 cross-dispatch
- **優先級排序**：P2-5 > P2-2 > P2-6 > P2-1 > P2-4 > P2-3（medium → low → ROI-pending）
- **下 session pick 順序**：P2-5（最小 ROI 15 min）→ P2-2（影響認知準確度）→ 其他按需要

## 驗收標準（整體）

- 每項獨立 commit + baseline test（nova-brain）
- 完成後移至 spec/完成/
- 總成本估 ~4-5 hours across multi-session

## Related

- iter 12 inventory：data/reflections.jsonl + iter 1-10 deferred 匯總
- iter 10 refactor-test-drift-2026.md（P2-4 根源）
- iter 15 reflection-persist.js 審計（P2-6 根源）
