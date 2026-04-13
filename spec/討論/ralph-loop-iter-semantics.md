# ralph-loop iteration 欄位語義誤用討論

## 背景

Cross-dispatch xd-zq6a (2026-04-14) Manager 觀察：多個 target session 把 ralph-loop.local.md 的 `iteration: N` 當成「自驅迴圈第 N 輪業務進度」來使用，但使用者當日糾正 Manager：iter 實際是「Claude 在本 loop 內意外掉出 Stop → ralph-loop 外殼喚醒重跑」的累計次數，不是業務迭代次數。

任務：盤點、根因分析、提 2-3 方案（討論式 dispatch，不實作）。

## 盤點（所有把 iter 當進度用或易誤讀的位置）

- **`~/.claude/hooks/modules/ralph-loop.js:150`** 啟動注入文案：`🔁 Ralph-loop 已啟動（iteration 1）：${preview}` — 沒說清楚 iter 語義是什麼，目前長得像「loop 第 1 輪」，誘導誤讀。
- **`~/.claude/skills/auto-drive/SKILL.md:44`** 故障排查表列：`Loop 空轉（iteration++ 但無有效產出）` — 把 iteration 當進度指標描述（技術上不錯但語感上強化了「iter = 進度」的錯誤印象）。
- **`~/projects/nova-brain/.claude/ralph-loop.local.md`** 自身 YAML frontmatter 欄位名 `iteration: N` — 欄位命名本身歧義，業界常把 iteration 當業務輪數。

實質行為（`hooks/modules/ralph-loop.js:250` 原始碼確認）：Stop handler 未匹配 promise → `iteration++` → block 餵回 prompt。所以 iter 嚴格定義是「Stop 被擋下後被 ralph 強制接續」累計次數，不是「完成 N 輪有效業務任務」。

CLAUDE.md / `rules/` 內 grep 無「iteration 是進度」字面描述（grep 空）— 誤解來自欄位名 + 啟動文案 + skill 描述語感，並非文件明確說錯。

## 根因假設

**欄位名歧義是主要**。`iteration` 在 agile/ralph 文獻常指「業務迭代進度」語感，但 ralph-loop 實際用法是 `stop_recovery_count`。命名歧義 × 文案語感誘導 × 無程式化語意鎖定（test 無斷言、JSDoc 無明確定義）= 誤用結構性漏洞。

## 方案 A：改欄位名 + migration

**改動**：`iteration` → `stop_recoveries`（或 `recovered_count`）；另開 `loop_rounds` 欄位給將來真的業務輪數（YAGNI 視需求）。

**範圍**：
- `hooks/modules/ralph-loop.js` parser/writer/reader 3 處
- test 3 處
- `CLAUDE.md` / `skills/auto-drive/SKILL.md` 2 處文案
- 所有 target session 的 `ralph-loop.local.md` state 檔需 migrate（手動 grep+sed 或讀舊 → 寫新）

**成本**：高。Public-facing（多 session 共享 state 格式）。

**覆蓋面**：最高 — 欄位名自身變清楚，未來誤讀機率最低。

**Tradeoff**：既有 ralph session 的 state 檔讀不到舊欄位會重置 count → 可接受（next tick 重算）。但一次性 migration 成本對單點內部狀態不成比例。

## 方案 B：只改文案 + CLAUDE.md 澄清

**改動**：
- 啟動文案改為「`Ralph-loop 已啟動（stop-recovery 計數=1）`」
- `ralph-loop` skill 或 rule 的 README 段寫明「iteration 語義說明」

**範圍**：2 檔改動。

**成本**：低。

**覆蓋面**：中 — 欄位名仍歧義，未來新 session 或外部讀者仍可能誤讀。

**Tradeoff**：無結構鎖定，反模式復發機率高。

## 方案 C：A 的輕量版 — 保留欄位 + 加 JSDoc + 補 test 鎖語意（推薦）

**改動**：
1. `hooks/modules/ralph-loop.js` `parseFrontmatter` 加 JSDoc：
   ```
   @property {number} iteration - Stop 被擋下後累計恢復次數（stop-recovery count）。
                                   不是業務迭代進度。promise 匹配時不變，未匹配時 ++。
   ```
2. 補 test 斷言：
   - `promise 匹配 → iteration 不變 → ralphFile 被刪`
   - `promise 未匹配 → iteration++ → ralphFile 被寫回`
3. 啟動文案改「`Ralph-loop 已啟動（stop-recovery 0/100）`」
4. `skills/auto-drive/SKILL.md:44` 誤用處改寫為「`Loop 空轉（stop-recovery 累積但 promise 仍未匹配）`」

**範圍**：1 code 檔 + 1 test + 2 文案檔。

**成本**：中（1h 以內）。

**覆蓋面**：高 — JSDoc 是 code-level 鎖定（IDE/LSP 會看到），加上 test 鎖行為，未來改動有程式化守護。

**Tradeoff**：欄位名本身仍叫 iteration，但語義被鎖定且有測試防 drift。保留 state 檔向後相容。

## 推薦

**方案 C**。

理由：
- 方案 A 的完整 migration 成本不成比例（欄位名只是 ralph 單點內部狀態，非 public API）
- 方案 B 成本低但無程式化守護，重蹈覆轍機率高
- 方案 C 透過 JSDoc + test 鎖定語義，同時修好誤用文案，cost/coverage 比最佳
- 若 Manager 未來真的需要「業務輪數」欄位，另開 `loop_rounds` 即可（YAGNI，先不做）

## Clarifying Questions

1. **Manager 預期未來需要「真正的業務迭代進度」欄位嗎？** 如果有，方案 A 的投資報酬率會提高（一次改到位）。如果只是為了修正誤解，方案 C 夠用。
2. **使用者糾正時有無提到具體誤用場景？** 想確認盤點是否漏了什麼位置（例如 Manager 自己寫 state.prompt 時把 iter 當進度 replay 的案例）。

---
**來源**：xd-zq6a discussion body（原本只存在 cross-dispatch API summary 欄位，xd-1xos 指出這是 class bug 所以持久化到本檔）。
