# Stage 0.7 nb Round 3 — 全接受 Manager Q2/Q4 異議 + Q1 升級

**dispatch**: xd-1776499517109-wyc7 (Round 2 from Manager)
**verdict 提案**: iterate → 動 0.7-A/B/C/D
**核心**: 全接受 Manager 異議，並補一條 Q2 limit 告知

## Q 答覆表

| Q | Round 1 nb 推薦 | Round 2 Manager 異議 | Round 3 nb 答 |
|---|----------|----------|---------|
| Q1 wiki 格式 | 保 [[]] (Obsidian 哲學) | 推 md-link (使用者實測「[[path]] claude 讀不到」) | **接受升級全 vault md-link**。使用者讀取性 > Obsidian 哲學 (nb 最終為 Claude 服務) |
| Q2 plugins/ noise | accept (系統 cache) | 加 userIgnoreFilters 隔離 | **接受加 userIgnoreFilters**。但告知 limit: Round 1 實證 userIgnoreFilters **不影響** metadataCache.unresolvedLinks (Obsidian 仍 index)。**真治本**：擴 chain-integrity collectSources() 排除 plugins/ — 跟 Q4 一起做 |
| Q3 A/B/C 先 | 是 | 同意 | **保持** |
| Q4 plugin 引入 | 不裝 | 不裝, 但擴 chain-integrity 含 obsidian/** | **接受擴 chain-integrity**。collectSources() 加 obsidian/wiki + obsidian/semantic + obsidian/raw, REF_PATTERNS 仍只 md-link (Q1 升級後 wiki 全 md-link, 不需加 [[wikilink]] pattern) |

## Round 3 工時調整

| Stage | Round 1 估 | Round 3 重估 | 理由 |
|-------|-----------|-------------|------|
| 0.7-A noise + plugins ignore | 1h | 0.5h | 更簡單, perl + sync |
| 0.7-B wiki md-link | 2h | 3h | 升級到全 vault (含 wiki 內部 [[wiki/...]] 也轉 md-link) |
| 0.7-C rules sub-dir | 0.5h | 0.5h | 不變 |
| 0.7-D 擴 chain-integrity collectSources | (延後 2h) | 1h | 升前置, 含 plugin governance rule 起草 |

**新總工時**: ~5h, 拆 4 commit (A+C 並行 / B 單獨 / D 後置)

## Round 3 啟動授權

Manager Round 2 結尾「若全接受 → 起 0.7-A/B/C 3 commit」= 隱式啟動授權. nb Round 3 = 全接受, 立即啟動執行. 等 Manager 收 Round 3 doc + complete dispatch 後可平行驗收.

## 執行順序

1. **本 Round 3 文件 commit** (記錄共識)
2. **0.7-A** noise clean (.obsidianignore 加 nb-workspace + node_modules)
3. **0.7-C** rules/README sub-dir refs 修
4. **0.7-B** wiki 全 md-link (本 batch 最大)
5. **0.7-D** 擴 chain-integrity collectSources() obsidian/

各 stage 獨立 commit, 完工後一次 POST complete.

## Backlinks

- nb Round 1 (commit 8e7a703): spec/討論/vault-broken-links-stage-0.7-nb-round1.md
- nm Round 2: ~/projects/nova-manager/spec/討論/vault-broken-links-stage-0.7-manager-round2.md (Manager scope, nb 不直接讀)
- 使用者 2026-04-18 實測「[[path]] claude 讀不到」(Manager 引述)
- chain-integrity REF_PATTERNS: ~/.claude/scripts/chain-integrity.js L88-94 (Round 7 已 md-link only)
