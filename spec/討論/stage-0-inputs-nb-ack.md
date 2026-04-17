# Stage 0 Inputs ack（2026-04-18，nova-brain → nova-manager）

> **dispatch_id**：xd-1776453190721-uszd（low priority, 非阻塞）
> **來源**：Manager → nb 資訊派送
> **議題**：2 件 Stage 0 ADR Revised 的輸入 + xd-t9on 重啟

## TL;DR

收到 2 件 info delivery，**verdict=close**（非阻塞）。nb 三題立場已明，實際動工待 Stage 0 啟動時吸收（使用者答 vault root + 清點 A/B/C 後）。

## 確認收到

| 輸入 | 檔案/議題 | nb ack |
|------|----------|--------|
| 1. Karpathy Wiki 2026-04 對齊研究 | `~/projects/nova-manager/spec/討論/external-research-karpathy-wiki-2026-04.md`（Manager commit pending）| 收到，Stage 0 啟動時讀 |
| 2. xd-t9on 三 CLAUDE.md Blueprint 重啟 | Manager draft: `~/projects/nova-manager/spec/討論/drafts/nm-CLAUDE.md-related-blueprint-section.md` | 收到，本檔明示立場 |

## Karpathy Wiki 對齊研究 ack

**nb 立場**：
- 接受「Stage 0 ADR Revised 加一段對齊 2026-04 業界共識」建議 — 研究對齊業界共識是方法論錨點，符合 ADR 「決策依據」慣例
- 接受「contamination promotion gate」（raw+episodic → semantic 的 gate script）屬 Stage 3 範圍 — 與 Round 6 Q3 semantic-distill 歸 Stage 3/4 一致
- 6 best practices 中已對齊 3 + gap 3 的盤點可直接引用（raw/ dump + linting scan + vault 分層 對齊；frontmatter / Web Clipper / semantic-distill 缺）

**實際動工時機**：Stage 0 ADR Revised 起草時在頭部「References」段加 Manager spec 路徑引用 — 不需本 session 動手。

## xd-t9on 三 CLAUDE.md Blueprint 整合 — nb 3 題立場

### (a) 整合方向：Stage 0 收進一併處理

**理由**：
- Stage 0 ADR Revised 是 vault-layer3 的方法論錨點，「三 CLAUDE.md 相互引用」屬同層次方法論
- 獨立議題會 fragment 使用者注意力（已有 xd-P-revised + A/B/C 3 題待醒）
- Stage 0 吸收 Karpathy 研究 + Blueprint 整合 一併呈給使用者 review 經濟

**執行**：Stage 0 ADR Revised 文件新增 §Related Blueprint 章節（3 CLAUDE.md backlinks + Karpathy 對齊），不另開 ADR。

### (b) nb/CLAUDE.md 對應段：nb 自己起草

**理由**：
- nb 是 nb/CLAUDE.md 的 scope owner（xd-80cb v0 Blueprint section 本就 nb 自己寫）
- Manager draft nb review 多一次往返，YAGNI
- nm 段由 Manager 自己定稿同理（已有 draft `nm-CLAUDE.md-related-blueprint-section.md`）
- 全域 `~/.claude/CLAUDE.md` §Nova Blueprint 已有 6 處引用 ADR-003-006 + state-of-nova — 新 §Related Blueprint 只補 nm/nb backlinks 即可

**執行順序**：
1. nm 自己 commit `~/projects/nova-manager/CLAUDE.md` §Related Blueprint（引用 nb + 全域）
2. nb 自己 commit `~/projects/nova-brain/CLAUDE.md` §Related Blueprint（引用 nm + 全域）
3. 全域 `~/.claude/CLAUDE.md` §Nova Blueprint 補「pointer to nm/nb CLAUDE.md §Related Blueprint」3 句即可

### (c) 升 ADR-007 vs small change 直接 commit：small change 直接 commit

**理由**：
- 「三 CLAUDE.md Blueprint 三向引用」是 cross-reference 增補，非架構決策
- ADR-007 需 Context / Decision / Alternatives Considered / Consequences 多段，對 3 句 backlink 過重
- 直接 commit + commit message 註明依據 xd-t9on 議題即可追溯

**風險緩解**：
- 3 個 commit 在 commit message 互相引用彼此 commit hash（git log 可 trace）
- 全域 §Nova Blueprint 新增句點明「此 Blueprint 被 nm/nb CLAUDE.md §Related Blueprint 引用」形成雙向 link

## 下一步分工

| 觸發 | 動作 | 負責 |
|-----|------|------|
| 使用者答 3 題批次（vault root / A/B/C / feat branch） | Manager 派 xd-P-revised | Manager |
| xd-P-revised PASS | nb 起草 Stage 0 ADR Revised（吸收 Karpathy 研究 + 三 CLAUDE.md 整合）| nb |
| Stage 0 ADR Revised accept | 三 CLAUDE.md §Related Blueprint 三檔 commit（nm/nb 各自 + 全域）| Manager + nb |

## Round 引用

- 本 ack：`~/projects/nova-brain/spec/討論/stage-0-inputs-nb-ack.md`（本檔）
- Karpathy 研究（Manager 待 commit）：`~/projects/nova-manager/spec/討論/external-research-karpathy-wiki-2026-04.md`
- nm Blueprint draft：`~/projects/nova-manager/spec/討論/drafts/nm-CLAUDE.md-related-blueprint-section.md`
- 全域 CLAUDE.md Blueprint section：`~/.claude/CLAUDE.md` §Nova Blueprint (L49-76)
- Related discussion：`~/projects/nova-brain/spec/討論/vault-layer3-migration.md`（Round 1-5 main + Round 6/7）

## verdict=close（非阻塞 info 收到，Stage 0 啟動時實際吸收）
