---
spec: rule-audit-2026-04-19
status: 進行中
owner: nova (cwd=~/.claude)
created: 2026-04-19
trigger: 使用者訴求「今天做了很多事，但 rule 的條件擴充很快，需要清點看看是不是有冗餘」
priority: medium
estimated_effort: P0b 已做 15min / P2 ralph-loop 外移 40min 待決
methodology: Explore agent 全檔掃 + 主腦驗證 (agent 判斷率 ~40%)
---

# Rule 冗餘 Audit — 2026-04-19

## 背景

24h 內 ralph-loop.md +84 行 / 自驅反思.md +38 行 / 討論生命週期.md +27 行。
主因：5 次使用者糾正每次都新增 subsection 而非合併既有條款。

## Agent finding 驗證表

| ID | Agent 判斷 | 檔案 | 我的驗證 | 動作 |
|:--:|:--|:--|:--|:--|
| R1 | P0 active=true 檢查重複 | ralph-loop.md:5-7 vs 自驅反思.md:3,30 | ✗ 假重複 — ralph-loop = 啟動生命週期、自驅反思 = 反思內容，SRP 分離 | 不動 |
| R2 | P1 TaskCreate 重複 | 任務生命週期.md:14 vs ralph-loop.md:24 | ✗ 假重複 — 前者 iter 開始、後者 iter 結束，時點不同 | 不動 |
| R3 | P1 三問重複 | 討論生命週期.md:40-42 vs 回饋與進化.md:11 | ✗ 假重複 — 討論生命週期.md:42 已 point to 回饋與進化.md，非重複規約 | 不動 |
| **R4** | **P0 external-research 重複** | **自驅反思.md:4,22-33 vs 回饋與進化.md:13** | **✓ 真重複 — 兩處都規約「external-references 必寫」** | **合併（本次已做）** |

## 本次執行

**P0b R4 合併**（commit pending）：
- `rules/品質/回饋與進化.md:13` 原條文刪除，改為指向 `rules/核心/自驅反思.md §外部研究硬性條款`（canonical）
- 自驅反思.md 保留為 SoT（細節完整：硬性條款 + 無效反思定義 + pivot-mandatory + 豁免禁用語）

**arch test**：580 pass / 0 fail ✓
**hook drift**：`ralph-iter-scorer.js` grep `外部研究` 用 generic keyword 讀 reflection field，非 rule wording，無 drift

## 真議題：ralph-loop.md 過度擴張

agent 統計 24h +84 行 **7/24 持續運轉紀律** subsection 原 4 條 → 現 **11 條**（line 29-41）。
每次使用者糾正（iter 14-22 共 5 次）都新增 MUST/NEVER，未合併。

### 結構缺陷

- subsection 本身結構 OK（啟動授權 / 任務清單 / 下一目標 / 7/24 四段職責分離）
- 但 7/24 section 11 條密度過高，其中 iter 14-15 iteration 細節（ctx/quota evidence 禁用、self-rationalize fingerprint）是**業界一般 rule 不需的 Nova 特定 debug 痕跡**

### 治本方向（P2 — 待使用者決定）

| 方案 | 動作 | 影響 | ETA |
|:--|:--|:--|:--|
| 維持現狀 | 接受 11 條密度（每條都是真 iter 糾正產物，不可誤刪） | rule 繼續膨脹 | 0 |
| 外移背景 | 7/24 紀律 iter 14-15 debug 細節 → `obsidian/semantic/rules-background/ralph-loop-7-24-rationale.md`，rule 保留條款 + 指向 | rule 精簡 ~10 行 / 背景 preserved | 40 min |
| 硬砍 | 刪除 iter 14-15 糾正後 redundant 化的條款（需逐條驗證不誤刪） | rule 精簡 ~15 行 / 風險中（可能回退糾正） | 1h + review |

## Orphan rule 候選（agent 低 confidence）

| 檔案 | hook refs | 推測狀態 | 動作 |
|:--|:--|:--|:--|
| `rules/元件/AskUserQuestion全鏈路.md` | 0 | 可能 orphan 但 architecture test 6 鏈路測試仍依它定義 | 不動（test anchors rule） |
| `rules/環境/本地模型管理.md` | 0 | g4-26b dispatch 移到 skill，rule 保留 storage 路徑規範 | 不動（storage rule 仍必要） |
| `rules/品質/基準勝選判準.md` | 0 | skill-judge 未 grep wording 但 rule 仍規約流程 | 不動（流程 rule 不 mapped hook） |

全部保留 — agent 的 orphan 判斷基於 hook grep，忽略 architecture test / 流程規範等其他錨定方式。

## 建議

1. **立即**：P0b R4 合併已做，commit 後閉環
2. **下輪 iter 評估**：P2 外移 ralph-loop 7/24 iter 14-15 debug 細節到 rules-background/（我推薦 ⭐，但使用者決定時機）
3. **未來紀律**：使用者糾正觸發 rule 升級時，先 grep 既有 section 看能否**改寫既有條款**而非 append 新條款（防膨脹反模式）

## 未來可作為防止膨脹的 hook 守護

可加 `rules-bloat-guard.js`（PreToolUse on Edit rules/）：修 rule 新增 > 5 條 MUST/NEVER/SHOULD 時 warn「本次擴張 > 5 條，確認無可合併既有條款」。但此層級 hook 屬 P3，等看 iter 16+ 觀察頻率再決定。
