# Stage 0.7 vault broken links 規劃 — nb Round 1

**dispatch**: xd-1776499144915-h3bb (2026-04-18)
**source**: nova-manager
**verdict 提案**: iterate
**核心挑戰**: Manager 的 1641 broken 數字 93% 是 noise，真實 Nova-scope 只 98 條

## 1. 數字盤點挑戰（Manager 1641 → 真實 98）

```
obsidian eval app.metadataCache.unresolvedLinks GROUP BY src.split("/")[0]:
  plugins/                     : 1523  ← Claude Code 系統 plugin cache (Notion/* docs)
  obsidian/                    :   94  ← 真 Nova 知識區 (wiki 93 + raw 1)
  rules/                       :    5  ← rules/README.md sub-dir refs
  README.md                    :    1  ← top-level
  nb-workspace/                :   24  ← 全是 npm package README (LICENSE/bench/@nilclass)
  node_modules/                :   24  ← noise (Manager 已扣)
  projects/                    :   12  ← 已在 userIgnoreFilters
  ─────────────────────────────────────
  TOTAL                        : 1683
  noise (plugins/+nb-workspace/+node_modules/+projects/) : 1583 (94%)
  REAL Nova-scope             :   98  (obsidian/wiki 93 + obsidian/raw 1 + rules/README.md 5)
```

**結論**: 1641 是 Manager 把 noise 當真實 broken 算進。真實工作量是 **98 條，21 unique targets**。

## 2. 真實斷鏈分類（Nova-scope only）

### 2.1 obsidian/wiki/ 93 條（21 unique targets）

```
top 20 unique targets:
  claude-dev: 16    auto: 8           nova-pm: 8        architecture: 7
  craft: 7          pinchtab: 7       cross-session: 6  thinking: 6
  closed-loop: 4    nova-spec: 4      nova-test: 4      feedback-loop: 3
  component-classification: 2         model-cascade: 2  refactoring: 2
  skill-judge: 2    auto-drive: 1     dispatch-lifecycle: 1
  nova-eval: 1      pipeline-quality-gate: 1
```

**Pattern**: wiki/<skill>/*.md 內部互相 `[[<skill>]]` wikilink，但沒有 wiki 層 hub note (例如 `wiki/claude-dev/claude-dev.md` 或 `wiki/claude-dev/index.md`)。

### 2.2 rules/README.md 5 條

```
rules/README.md targets: 協作/ 核心/ 品質/ 元件/ 環境/
```

**Pattern**: markdown link `[協作/](協作/)` 帶尾巴 `/`，Obsidian 解 directory link 找不到 `.md` 對應檔 → unresolved。

### 2.3 noise 處理（1583 條）

- **plugins/ 1523**: Claude Code 系統 plugin cache (Notion/* etc 的 README/commands)，**完全非 Nova 知識**。userIgnoreFilters 不夠（Obsidian 仍 index metadataCache）→ 需從 vault scope 物理排除（symlink out / `.gitignore` extension / 移目錄）
- **nb-workspace/ 24**: npm package README 殘留（./LICENSE, /bench, @nilclass, README.zh-CN）。整個 nb-workspace/ 不該 index → 加 .obsidianignore
- **node_modules/ 24**: 已是常識 noise，加 .obsidianignore（雖只 24 條但 Obsidian index 效率也省）
- **projects/ 12**: 已 ignore，但 metadataCache 為何還抓？(可能是 cache 殘留，重啟 Obsidian 應消失)

## 3. Manager 5 task 評估

| Task | nb 評估 | 採納 |
|------|---------|------|
| 1) wiki category hub notes | 93 條 21 targets 集中，建 21 個 hub note 工時 ~3h（每 hub 8-10 行 stub）；或方案 C: 改 wikilink → `[[skills/<name>/SKILL\|<name>]]` 直接指 SKILL.md, ~2h | **方案 C 推薦**：跟 Round 7 md-link 哲學接近 (但保留 wikilink 因 wiki 是 Obsidian-native 知識區), Obsidian 可解析 full-path wikilink, 不需建 stub |
| 2) nb-workspace scope | 24 條全是 npm noise, 不是 Nova 知識 | **加 .obsidianignore** (5 分鐘) |
| 3) Broken Links / Vault Physician plugin | Round 5 已立先例 (Front Matter Title), 再加 plugin OK 但需 plugin governance rule (Round 5 proposal 已提) | **延後**，先寫 plugin governance, 再評估 (避免 Pandora box) |
| 4) userIgnoreFilters 補 node_modules | 5 分鐘 + sync script 重生 | **採納** |
| 5) 全 vault 統一 md-link (含 wiki) | wiki 是 Obsidian-native 知識網絡, [[]] 慣用法 (rename auto-update), 強推 md-link 違 Obsidian 哲學 | **不採納**：wiki 保留 [[]], rules/skills 維持 md-link (Round 7 規範), 雙格式分區並存 |

## 4. 三階段方案（總工時 ~5h）

### Stage 0.7-A: noise 清除（1h）

1. `.obsidianignore` 加 `nb-workspace/` + `node_modules/`
2. plugins/ 處理 — 由於 Claude Code 系統管理，不能刪 — 加註解說明 `.obsidianignore` 對 plugins/ 的限制（userIgnoreFilters 不影響 metadataCache.unresolvedLinks）
3. 跑 sync-obsidian-ignore.js 重生 app.json
4. 驗收: `obsidian eval` unresolved nb-workspace=0 + node_modules=0

**預期 broken**: 1641 → ~ 1640 (因為 plugins/ 1523 仍 metadataCache 算入)，但 Graph view 視覺已 clean

### Stage 0.7-B: wiki [[skill]] full-path 改造（2h）

1. 批量 perl: `[[<name>]]` → `[[skills/<name>/SKILL|<name>]]` 在 wiki/*.md 內 (21 unique × ~5 occurrences = 93 替換)
2. 補 `[[wiki/<subdir>/<file>|<file>]]` full-path wikilink — 已部分如此 (sample 顯示 wiki/architecture/tradeoff-framework 已 full-path)
3. 跑 chain-integrity 驗 broken=0
4. 驗收: `obsidian eval` unresolvedLinks obsidian/wiki = 0

**預期 broken**: ~1640 → ~1547 (wiki 93 解掉)

### Stage 0.7-C: rules/README.md sub-dir links 修（30 分鐘）

1. `[協作/](協作/)` → `[協作/README.md](協作/README.md)` 或建立 `rules/協作/README.md` index
2. 5 條重複 pattern, sed/perl 批量

**預期**: ~1547 → ~1542

### Stage 0.7-D（延後決策）：plugin governance + Broken Links plugin（2h）

1. 寫 `rules/元件/plugin-治理.md` (Round 5 proposal 已提)
2. 評估 Broken Links plugin 引入（但本輪 Stage 0.7-A/B/C 已處理 99% 真實斷鏈，plugin sensor ROI 邊際）

**預期**: 不影響 broken 數字，提升 sensor 持續性

## 5. 不做的事（Round 1 砍刀）

- ❌ 不做 plugins/ 1523 條 (Claude Code 系統 cache, 非 Nova scope)
- ❌ 不裝 Vault Physician dashboard (overkill, chain-integrity 已 cover)
- ❌ 不全 vault 統一 md-link (wiki 保留 [[]] 哲學)
- ❌ 不依賴 Obsidian CLI 2026 `move` (我們已有 perl 批量能力, 不需新依賴)

## 6. 工時 + Stage 對應

| Stage | 工時 | 阻塞 | dispatch 時機 |
|-------|------|------|--------------|
| 0.7-A noise | 1h | 無 | Manager 採納本輪即可動 |
| 0.7-B wiki | 2h | 無 | A 完成後 |
| 0.7-C rules sub-dir | 0.5h | 無 | 可與 A 並行 |
| 0.7-D governance | 2h | Manager 決定要否做 | 延後 |

**總工時 (A+B+C)**: 3.5h，1 commit 解 (3 partial commits 可選)

**Stage 1 啟動條件**: Stage 0.7-A/B/C 完工後 Nova-scope broken=0，視覺乾淨。

## 7. 等 Manager 共識點

| Q | 選項 | nb 推薦 |
|---|------|---------|
| Q1 wiki [[]]改 full-path 還是建 hub stub? | C/A | **C (full-path)** |
| Q2 plugins/ 1523 接受 noise vs 物理移目錄? | accept / move | **accept** (系統管理目錄不該動) |
| Q3 跑 0.7-A/B/C 還是先 governance? | A/B/C / governance | **A/B/C 先**（提升使用者立即可見效果，governance 平行起草） |
| Q4 是否裝 Broken Links plugin? | yes / no | **no** (chain-integrity + Round 7 SoT 已 cover) |

## 8. 共識 → 動作

Manager Round 2 答 Q1-Q4 後：
- 若 nb 推薦全採 → 起 Stage 0.7-A/B/C 3 commit (feat/obsidian-vault branch)
- 若有 conditional → Round 2 深入

## Backlinks

- Round 7 md-link 統一: commit 803cc3f (~/.claude) + 587cdf2 (nb)
- Round 5 first plugin: commit 2e91377 (Front Matter Title installation)
- chain-integrity REF_PATTERNS: scripts/chain-integrity.js L90-94
- Manager dispatch: xd-1776499144915-h3bb (2026-04-18T07:39Z)
