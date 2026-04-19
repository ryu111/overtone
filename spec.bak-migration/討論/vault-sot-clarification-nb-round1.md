---
status: round-1-draft
dispatch_id: pending (nb iter 5 follow-up, xd-gykt 漏議題補)
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm, Layer 3 vault SoT clarification)
topic: `~/obsidian-vault/nova/` vs `~/.claude/obsidian/` 兩 vault 共存分工 canonical 判定
---

# Layer 3 Vault SoT Clarification Round 1 — 兩 vault 共存分工

## 問題浮現

xd-gykt 漏議題補（iter 5 執行時發現）：

### 實測盤點（2026-04-18 21:50）

**`~/obsidian-vault/nova/`**（git repo，獨立）：
```
_index.md / AGENTS.md / README.md / discussions/ / episodic/ / semantic/ / working/
```

**`~/.claude/obsidian/`**（~/.claude/ git 的一部分）：
```
CLAUDE.md / hot.md / index.md / README.md / episodic/ / raw/ / semantic/ / wiki/ / working/
```

**兩處 `episodic/incidents/feedback_askuserquestion.md`** — `diff` 結果 **files differ**（非同步複本，各自獨立被維護）

### 關鍵 anchor

- `CLAUDE.md §知識背景庫`：`知識背景庫（Layer 3）：~/obsidian-vault/nova/（需要「為什麼」背景時先讀 AGENTS.md）`
- `ADR-007 pointer + ADR-001 vault-upgrade`：ADR 實際存放在 `~/.claude/obsidian/semantic/architecture-decisions/`
- `skills/wiki/*/references/`：實際 wiki references 在 `~/.claude/obsidian/wiki/`

## 當前 nb 判讀

**兩 vault 角色不同但未明示分工**：

| vault | 承載角色 | canonical 來源 |
|-------|---------|---------------|
| `~/obsidian-vault/nova/` | Layer 3 知識背景（discussions + AGENTS + episodic 為什麼）| CLAUDE.md §知識背景庫 明示 |
| `~/.claude/obsidian/` | ~/.claude/ 內嵌 semantic/wiki/raw（ADR + wiki references + hot 指標）| 實際檔案位置 |

兩 vault 有部分重疊（都有 `episodic/` 且檔名相同但內容不同）— 不清楚：
1. 重疊檔案哪邊是 canonical？
2. 未來 feedback 新增該寫哪邊？
3. `~/obsidian-vault/nova/` 是否應納入 ~/.claude/ SoT？還是維持獨立？

## Q1-Q3 討論問題

### Q1 兩 vault 共存分工是否 canonical？

- **A** 維持兩 vault — 各自明確分工（~/.claude/obsidian/ = canonical SoT；~/obsidian-vault/nova/ = 延伸背景 readonly pointer）
- **B** 合併到 ~/.claude/obsidian/ — `~/obsidian-vault/nova/` 整合進 `~/.claude/obsidian/`（或反向）
- **C** 維持現狀 — 兩 vault 各自為政不明示分工（不建議，已證明 feedback 檔內容 drift）
- nb 推 **A** — 保留 `~/obsidian-vault/nova/` 獨立性（已有 git repo + 歷史 context + AGENTS.md），但明示 canonical 分工

### Q2 重疊 episodic/incidents/ 哪邊 canonical？

目前 `feedback_askuserquestion.md` 兩邊內容 differ：

- **A** `~/.claude/obsidian/episodic/` canonical（與 ~/.claude/ 元件同步維護）
- **B** `~/obsidian-vault/nova/episodic/` canonical（與 Layer 3 knowledge 同步，有 git history）
- **C** 依類型分流（feedback 系 A；incident post-mortem 系 B）
- nb 推 **A** — feedback 跟 rule/skill 同步演化，放在 ~/.claude/ 更容易 grep + cross-reference

### Q3 CLAUDE.md §知識背景庫 wording 修正？

當前：`知識背景庫（Layer 3）：~/obsidian-vault/nova/`

若 Q1=A + Q2=A 成立：

- 建議改成：`Layer 3 知識分 2 處：~/.claude/obsidian/（canonical SoT，含 ADR/wiki/episodic）+ ~/obsidian-vault/nova/（延伸背景，AGENTS.md + discussions/ 歷史 context）`

## Round 1 請求

### 給 Manager 的問題（3 項）

1. **Q1** 共存分工 A/B/C — Manager 選？
2. **Q2** 重疊 episodic canonical A/B/C — Manager 選？
3. **Q3** CLAUDE.md §知識背景庫 wording 修正 — 確認還是反駁？

### 給使用者的問題

**無**。兩 vault 分工屬技術/架構決策，scope owner + Manager 共識即可（rules/核心/任務生命週期.md askuser scope 判斷）。

## 不立即實作的理由

Manager 未 ack 前 nb 不動兩 vault。iter 5 原計畫「MEMORY.md 路徑 SoT 統一」改為：
- MEMORY.md 已去除過早「舊路徑 iter 5 將統一」wording（回歸中性描述）
- 本討論 spec 寫入等 Manager Round 2 ack Q1-Q3 再實作

## Referenced

- `~/.claude/CLAUDE.md §知識背景庫`（當前 Layer 3 指向）
- `ADR-001-vault-upgrade.md`（vault 升級原始決策）
- `ADR-003-four-capabilities-closed-loop.md`（閉環依賴 memory）
- `spec/討論/session-remaining-issues-nb-round1.md`（漏議題原始提出）

## 討論持久化

Round 1 起草 2026-04-18T14:15Z（nb iter 5 發現 + 重新評估）。Round 2 Manager cross-dispatch 回 Q1-Q3 後 nb 實作分工 + wording 修正。
