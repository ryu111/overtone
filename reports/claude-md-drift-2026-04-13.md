# CLAUDE.md 漂移掃描報告 — 2026-04-13

**掃描專案數**：14  |  **發現漂移**：9

## ⚠️ 發現漂移

### novaplay
路徑：`/Users/sbu/projects/novaplay`

- **[pattern_missing]** Phase: git log 用 Phase5 追蹤進度（3 個 commit），但 CLAUDE.md 完全沒提 Phase-pattern

### claude-workflow
路徑：`/Users/sbu/projects/claude-workflow`

- **[version_drift]** Version: CLAUDE.md 標 v0.8.0，git log 已到 v0.14.0

### block-world
路徑：`/Users/sbu/projects/block-world`

- **[pattern_missing]** Round/Revision: git log 用 R118 追蹤進度（41 個 commit），但 CLAUDE.md 完全沒提 R-pattern
- **[naming_drift]** CLAUDE.md 用 M-pattern (Milestone) 規劃，但 git log 用 R-pattern (Round/Revision) — 命名系統已改但文件未更新

### ai-media
路徑：`/Users/sbu/projects/ai-media`

- **[pattern_missing]** Phase: git log 用 Phase2 追蹤進度（3 個 commit），但 CLAUDE.md 完全沒提 Phase-pattern

### nova-server
路徑：`/Users/sbu/projects/nova-server`

- **[pattern_missing]** Phase: git log 用 Phase6 追蹤進度（5 個 commit），但 CLAUDE.md 完全沒提 Phase-pattern

### nova-quant
路徑：`/Users/sbu/projects/nova-quant`

- **[pattern_missing]** Phase: git log 用 Phase5 追蹤進度（5 個 commit），但 CLAUDE.md 完全沒提 Phase-pattern

### vibe
路徑：`/Users/sbu/projects/vibe`

- **[pattern_missing]** Phase: git log 用 Phase5 追蹤進度（4 個 commit），但 CLAUDE.md 完全沒提 Phase-pattern

### vibe-engine
路徑：`/Users/sbu/projects/vibe-engine`

- **[pattern_missing]** Phase: git log 用 Phase8 追蹤進度（3 個 commit），但 CLAUDE.md 完全沒提 Phase-pattern

### nova-manager
路徑：`/Users/sbu/projects/nova-manager`

- **[pattern_missing]** Milestone: git log 用 M8 追蹤進度（5 個 commit），但 CLAUDE.md 完全沒提 M-pattern
- **[progress_drift]** Phase: CLAUDE.md 寫到 Phase0，git log 已到 Phase6（落後 6）
- **[version_drift]** Version: CLAUDE.md 標 v1.0.0，git log 已到 v9.2.0

## ✅ 無漂移
- company-work
- everything-claude-code
- nova-brain
- nova-control
- discord-raffle