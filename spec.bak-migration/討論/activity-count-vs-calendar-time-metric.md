# 度量維度：活動次數 vs 日曆時間

**日期**：2026-04-19
**觸發**：使用者自驅 Phase 2 缺口 D 時洞察
**狀態**：Proposal / Open（待更多場景驗證再升 ADR）

## 洞察原文

> 時間這件事，在這個 AI 的時代，時間很珍貴，或許次數計算會不會更佳

## 問題

Nova 系統多處用「日曆時間」當度量閾值：

| 元件 | 閾值 | 單位 |
|------|------|------|
| `component-lifecycle.json` | `age_grace_days` = 14 | 天 |
| `vault-backlink.js` | `--days` = 60 | 天 |
| `weekly-synthesis.js` | `過去 7 天` | 天 |
| `hooks/modules/*` cooldown | 5m / 10m / 60m | 分鐘 |

但在 AI 時代：
- 單天可產生 10-1000 次 tool call / 10-100 次 reflection / 50+ commits
- 單週可達數千次互動
- 「60 天」「14 天」的設計假設來自人類工作節奏（慢）

**結論**：日曆時間不再能合理代表「活動密度」或「成熟度」。

## 度量維度對照

| 維度 | 性質 | 適用場景 |
|------|------|---------|
| 日曆天/週 | 穩定 / 人類直覺 / Unix 原生 / 外部 tool 友善 | 人類日曆里程碑、跨時區協作 |
| 活動次數 | 貼近密度 / 需 counter 機制 / 不均勻 | AI 時代自動化任務閾值、蒸餾觸發 |
| 混合（OR / AND） | 任一滿足觸發 | 保守派需向後兼容 |

## 本次實作選擇

Phase 2 缺口 D `scripts/vault-distill.js` 採**純次數觸發**（`--threshold=20`）作為示範：
- 自上次 synthesis 起累積 reflections 達閾值 → 觸發
- `synthesis-index.jsonl` 追蹤累計計數（SoT）
- 檔案命名 `synthesis-NNN.md`（序號，不綁日曆週）

保留 `scripts/weekly-synthesis.js`（日曆週版）作人類日曆參考共存。

## 未來方向（Open Questions）

1. `component-lifecycle.json` 的 `age_grace_days` 是否改成 `usage_count_since_creation` 或混合？
2. `vault-backlink.js` 的 `--days=60` 是否改成 `--sessions-since=N`？需要追蹤每檔案最後被引用/讀取的 session 次數
3. Hook cooldown 維持時間軸合理（跨 process / 跨 session 統計次數成本高）
4. 此度量維度要升格 ADR-009 還是併入 ADR-003（四能力閉環 learn 章）？

## Related

- `scripts/vault-distill.js` — 首個次數觸發實作
- `scripts/weekly-synthesis.js` — 現有時間觸發實作（保留）
- `obsidian/raw/reflections/synthesis-index.jsonl` — 次數追蹤 SoT
- `config/component-lifecycle.json` — `age_grace_days` 候選遷移目標
