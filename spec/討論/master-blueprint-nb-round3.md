# Master Blueprint — nb Round 3（裁決後起草）

**接續**：`master-blueprint-nb-round2.md` + Manager Round 3 裁決 (xd-y9rj)
**使用者裁決**：(c) 折衷方案 + ADR 編號重開 ADR-003+ + state doc 立刻起草
**本 Round 性質**：純起草（4 份 draft），**不直接 commit canonical**，等 Manager review + 使用者簽核

```yaml
discussion_version: round-3
participant: nova-brain (scope owner, executor)
user_verdict:
  承載方向: "(c) 折衷 — CLAUDE.md §Blueprint + 多 ADR + state-of-nova"
  ADR_編號: "ADR-003+（重開，不沿用 Manager 初稿的 005+）"
  state_doc_時程: "Round 3 立刻起草"
draft_status: 4 份 draft 完成，等 review
canonical_commit: 本 Round NOT applied（擁有者提交紀律）
```

---

## 總結

Round 3 nb 依使用者裁決完成 4 份 draft，並未 commit 到 canonical 位置 — 遵守 `rules/協作/擁有者提交紀律.md`「canonical runtime contract 未達共識前不得搶先 commit」。

---

## 一、4 份 Draft 絕對路徑

| # | 對應產出 | Canonical 位置（審核後才寫）| Draft 位置（本 Round 產出）| 規模 |
|:--:|---------|--------------------------|--------------------------|------|
| 1 | CLAUDE.md §Nova Blueprint 新增段 | `~/.claude/CLAUDE.md`（§執行環境 後）| `/Users/sbu/projects/nova-brain/spec/討論/drafts/CLAUDE.md-nova-blueprint-section.md` | 28 行新增 |
| 2 | docs/state-of-nova.md | `~/projects/nova-brain/docs/state-of-nova.md` | `/Users/sbu/projects/nova-brain/spec/討論/drafts/docs-state-of-nova.md` | 130 行 |
| 3 | ADR-003 完整 draft | `~/.claude/obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md` | `/Users/sbu/projects/nova-brain/spec/討論/drafts/ADR-003-four-capabilities-closed-loop.md` | 230 行 |
| 4 | ADR-004/005/006 綱要 | 各自 `ADR-00{4,5,6}-*.md` | `/Users/sbu/projects/nova-brain/spec/討論/drafts/ADR-004-005-006-outlines.md` | 170 行 |

**總產出**：約 560 行 markdown。

---

## 二、擁有者提交紀律對齊

依 `rules/協作/擁有者提交紀律.md`：

> 📋 MUST spec/protocol owner 在 peer 討論未達共識前**不得**搶先 commit **canonical runtime contract**
> 📋 MUST 「canonical runtime contract」= protocol spec 有 runtime consumer 的段落 + machine-readable config

| 檔案 | Canonical 性質 | 本 Round 處置 |
|------|---------------|--------------|
| CLAUDE.md §Nova Blueprint | ✅ canonical（AI 每 session 讀）| **draft 到 spec/討論/drafts/，不 commit CLAUDE.md** |
| ADR-003 | ✅ canonical（architecture decision，歷史不改）| **draft 到 spec/討論/drafts/，不 commit ADR 目錄** |
| ADR-004/005/006 outlines | ✅ canonical（同上）| **draft 到 spec/討論/drafts/，不 commit ADR 目錄** |
| docs/state-of-nova.md | ⚠️ 部分 canonical（使用者 + Manager 讀，非 AI runtime）| **draft 到 spec/討論/drafts/，不 commit docs/**（保守一致）|
| master-blueprint-nb-round3.md（本檔）| ❌ 非 canonical（`spec/討論/`）| ✅ **可 commit**（討論記錄）|

**本 Round 僅 commit `spec/討論/` 下的 discussion + drafts/**，所有 canonical 位置（`~/.claude/CLAUDE.md` / `obsidian/semantic/architecture-decisions/` / `docs/`）**保持不動**，等 Manager review + 使用者簽核後才搬移。

---

## 三、Manager Review 流程

建議 Manager Round 3（即本 nb-round3 之後）審查以下層次：

### L1 — 格式與結構檢查

- [ ] CLAUDE.md §Blueprint 28 行（不超過使用者偏好的 25-30 行範圍）
- [ ] ADR-003 frontmatter 完整（status/date/authors/reviewers/supersedes）
- [ ] 各 draft 的 backlinks 能互指

### L2 — 決策內容檢查

- [ ] ADR-003 §Decision 9 條決策點是否覆蓋 Round 1-2 所有共識
- [ ] Phase 1 / Phase 2 範圍切分是否合理
- [ ] auto/semi/人審邊界表是否完整（3 列 × 2 能力）
- [ ] broadcast 設計是否真的「強化 non-negotiable 而非放寬」

### L3 — 盤點準確性檢查

- [ ] state-of-nova §L1-L4 元件數字（37 hooks / 35 skills / 29 rules / 7 agents / 5 commands）是否準確
- [ ] §三支柱 × L 矩陣每格覆蓋度標記（✅/⚠️）是否公允
- [ ] §缺口清單 8 項是否有重複或遺漏

### L4 — 依賴圖檢查

- [ ] Cross-ADR 依賴圖是否正確（003 依賴 001/005 / 004 依賴 001/003 / 005 獨立 / 006 依賴 003/005）
- [ ] 建議簽核順序「ADR-003 → 005 → 004 → 006」是否合理

### 特別關注點（使用者簽核用）

1. **承載方向落地是否符合 (c) 方案精神**：CLAUDE.md 段是結構化 overview、state doc 是盤點、ADR 各鎖一決策。三層分工是否清楚？
2. **非 negotiable 強化而非放寬**：broadcast = shared SoT read + per-session write，是否使用者能接受？
3. **Phase 2 啟動條件 W17-W21 baseline**：時程是否符合使用者期望？

---

## 四、Manager 若通過 review，後續搬移指令

nb 收到 Manager review pass + 使用者簽核 verdict 後，執行以下搬移（各為獨立 commit）：

```bash
# 1. CLAUDE.md §Blueprint 段插入（sed append 或 manual edit）
#    涉及元件：~/.claude/CLAUDE.md
#    注意：~/.claude/ 下用 Bash sed（rules/核心/失敗與修復.md）

# 2. ADR-003 搬移
cp spec/討論/drafts/ADR-003-four-capabilities-closed-loop.md \
   ~/.claude/obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md

# 3. state-of-nova.md 搬移
cp spec/討論/drafts/docs-state-of-nova.md docs/state-of-nova.md

# 4. ADR-004/005/006 outlines 拆成 3 個獨立 ADR 檔
#    （outlines 檔本身保留 spec/討論/drafts/ 作為歷史）

# 5. 測試
bun test tests/unit/architecture.test.js  # 驗證引用完整性
```

每步 commit 訊息前綴：`chore(canonical): Round 3 approved — {檔案類型} applied`

---

## 五、本 Round 未處理 / 延後項目

| 項 | 延後原因 | 動作 |
|---|---------|------|
| ADR-004/005/006 完整 draft（非 outlines）| 使用者裁決先鎖 ADR-003 架構，細節等 Phase 實作前再展開 | Phase 2 啟動前起草 |
| Phase 1 實際實作（launchd plist / session-start-health.js）| 擁有者提交紀律：canonical 未簽核不實作 | 等簽核 |
| obs/CLAUDE.md v2.1 patch（rebuild 納入）| 綁 ADR-004 簽核後 | ADR-004 完整 draft 時同步產出 patch |
| CLAUDE.md diff 實際 apply | 擁有者提交紀律 | 等簽核 |

---

## 六、給 Manager / 使用者 Round 3+ 的問題（若有）

1. **state-of-nova §三 已完成里程碑** 是否要補 ADR-001/002 內容的快照？本 draft 只列 commit，未列 ADR-001/002 的關鍵決策點。
2. **ADR-003 §5 Cross-session Broadcast** 的 writer 規則「nb 唯一 writer」— 若未來 Manager session 有寫入需求，是否開白名單？本 draft 未定義白名單管道。
3. **Phase 0 baseline（W17-W21）** 期間 nb 該做什麼？被動等 4-6 週，還是可預先準備 Phase 2 元件骨架？使用者之前回「等 Round 3 裁決再動」— 裁決已到，Phase 1 可啟，但 Phase 2 元件是否也可預備？

---

## 七、本 Round 產出 Hash 與 Commit 預定

本 Round commit 範圍（spec/討論/ 下 5 個新檔）：

```
spec/討論/master-blueprint-nb-round3.md                       （本討論記錄）
spec/討論/drafts/CLAUDE.md-nova-blueprint-section.md          （28 行 draft）
spec/討論/drafts/docs-state-of-nova.md                        （130 行 draft）
spec/討論/drafts/ADR-003-four-capabilities-closed-loop.md    （230 行 draft）
spec/討論/drafts/ADR-004-005-006-outlines.md                  （170 行 draft）
```

**commit message**：`docs(spec): nb round 3 起草 4 份 draft 待 review (xd-y9rj)`

---

## Backlinks

- Round 1 nb（四能力）：`spec/討論/新架構四能力藍圖-nb-round1.md`
- Round 1 nb（四操作）：`spec/討論/obsidian-四操作升級-nb-round1.md`
- Round 2 nb（Master Blueprint）：`spec/討論/master-blueprint-nb-round2.md`（commit 45f9b77）
- Round 2 Manager：`/Users/sbu/projects/nova-manager/spec/討論/新架構四能力藍圖-manager-round2.md`
- Round 3 Manager 裁決：xd-y9rj prompt（已 complete）

## Related

- rules/協作/擁有者提交紀律.md（本 Round 不 commit canonical 的依據）
- rules/元件/元件治理.md（最小化新元件原則）
- rules/核心/深度路由.md（auto/semi/人審三層判準）
