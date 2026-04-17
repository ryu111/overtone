# ADR-001: Vault 升級為 nb 資產

- **Status**: Accepted
- **Date**: 2026-04-17
- **Driver**: User（唯一簽核權人）
- **Facilitator**: Manager（nova-manager）
- **Implementer**: nb（nova-brain）

---

## Context

Nova 面臨三重壓力：
1. **~/.claude/ 核心維護負擔**：rules 29 條、skills 32 個（references 125 檔）、docs 14 active 分散維護，清點與同步成本高。
2. **L5 客製化推不進**：缺乏統一知識圖譜支撐使用者引用與回溯。
3. **業界 2026 共識對齊**：Karpathy LLM Wiki v2 + Obsidian as memory substrate + 三層記憶（semantic / episodic / procedural）已成主流。

現況 `~/obsidian-vault/nova/` 19 檔骨架存在但內容薄（semantic/rules-background/ 只 1 檔、semantic/architecture-decisions/ 只 1 個 ADR、episodic/incidents/ 11 檔），且與 `~/.claude/` 為雙 git repo + 無引用鏈守護。

---

## Decision

### 1. Vault 路徑與 Obsidian 配置

- **vault 路徑**：`~/.claude/obsidian/`（原 `~/obsidian-vault/nova/` 19 檔 Phase 1 遷入）
- **Obsidian vault root**：`~/.claude/` 整根 + `.obsidianignore` 排雜訊
- **無 symlink**：skills 與 obsidian 同 tree 下不需 symlink
- **單一 git repo**：vault 歸 `~/.claude/` 子目錄，消除雙 repo 同步成本

### 2. Branch 策略

- **分支**：`feat/obsidian-vault`（short-lived）
- **Phase 1 完成後 merge**：Obsidian 實機驗證通過 → merge → reconfig Obsidian root
- **Obsidian 跨 branch 陷阱解法**：遷移期 Obsidian 仍掛舊 vault `~/obsidian-vault/nova/`，merge 後才切 root = `~/.claude/`
- **Legacy 處理**：遷前 tag `legacy-nova-vault-YYYYMMDD`，遷後 rename `~/obsidian-vault/nova.legacy-YYYYMMDD/`，觀察 2 週無 issue 後刪除

### 3. F1 七天凍結條款（必項）

Phase 1 啟動後 **7 天內不大方向變動**：
- **Allowed**：實作細節修訂、bug 修復、`.obsidianignore` 校準
- **Disallowed**：vault 路徑變更、Obsidian vault root 改動、三層記憶界線重劃

### 4. B 分期執行（Phase 0-2 + Phase 3 另案）

- **Phase 0-2**：17-23 人天 / 5-6 週 calendar（本 ADR 範圍）
- **Phase 3 清點**：9-13 人天另案（使用者於 Phase 2 merge 後另行決定）

### 5. YAGNI 砍 8 項（不做）

| # | 項目 | 砍掉理由 |
|---|------|---------|
| 1 | confidence scoring | Nova rules 命令性非概率性，不適用 |
| 2 | typed relational graph（uses/depends/contradicts）| 簡單 markdown link 足夠 |
| 3 | Graphify AST（71.5x 節省）| Python 依賴 + Nova 規模未達門檻 |
| 4 | forgetting curves | 與「永久記錄決策」rule 衝突，規模未達 |
| 5 | broken-link self-heal LLM 分支 | 成本/準確率不成比例，留 rename tracking + BROKEN 標記 |
| 6 | hot.md Phase 2 自動化 | 先手工 v0 驗證價值，Phase 3+ 再自動 |
| 7 | Stop distill LLM compile | Phase 2 只做 raw/sessions append，LLM compile 延後 |
| 8 | Karpathy raw → compiled wiki pipeline | Phase 2 不做，預留 wiki/ 目錄供 Phase 3+ |

### 6. nb Blueprint 擴展

`~/projects/nova-brain/CLAUDE.md` blueprint yaml 變更：

- `role`：加「+ Vault Linter（自動化）+ Raw Importer（批次）」
- `scope_comment`（新增段）：明示「ori 非獨立概念，`~/.claude/obsidian/` 是 nb 資產範圍一部分」
- `tools_allowed`：加 `write ~/.claude/obsidian/*`
- 對外角色仍為**討論者**（質疑 / 實測 / 挑戰）

Blueprint 實際 commit 時機：Phase 2 末（ref-link-linter 與 hooks 上線後）。

### 7. Vault 結構

```
~/.claude/
├── .obsidianignore         # Phase 0 Day 0 建立
├── .gitignore              # 擴充（排 .obsidian/ + .trash/）
├── CLAUDE.md               # .obsidianignore 保護不被 frontmatter 污染
├── README.md               # Obsidian 圖譜入口（人類導覽）
├── rules/                  # 29 條（未來 22 條合併候選，Phase 3 決）
├── skills/                 # 32 個（Anthropic 原生，原位保留）
├── hooks/ / agents/ / commands/
├── obsidian/               # vault 知識層（Phase 1 遷入）
│   ├── AGENTS.md           # AI 導覽（遷自 ~/obsidian-vault/nova/）
│   ├── hot.md / index.md / log.md   # Phase 2 v0 手工
│   ├── raw/
│   │   ├── reflections/    # Phase 1 批次 import
│   │   ├── sessions/       # Phase 2 Stop hook append
│   │   └── discussions/
│   ├── wiki/               # 預留 Phase 3+
│   ├── semantic/
│   │   ├── rules-background/        # Phase 1 補 15 條（P0 5 + P1 10）
│   │   ├── architecture-decisions/  # Phase 1 遷入 docs 6 檔 + 本 ADR
│   │   └── component-history/
│   ├── episodic/
│   │   ├── incidents/       # 遷入 11 檔
│   │   └── reflections-archive/
│   ├── working/
│   └── discussions/
└── projects/ / node_modules/ / cache/ ...  # .obsidianignore 排除
```

---

## Phase 分期

### Phase 0（3-5 人天 / 1 週 calendar）

- ADR 定稿 + Manager peer review + 使用者簽核
- Day 0 Obsidian 立即上線（本 dispatch 任務 B）
- docs/ 14 檔分類與 Manager 確認
- rules-background 15 條清單最終審核 + 1 條示範檔校準
- `~/.claude/` 7 個 README（本 dispatch 任務 C）
- Phase 1-2 sprint 切分

### Phase 1（6-8 人天 / 2-3 週 calendar）

- 建 `feat/obsidian-vault` branch + tag `legacy-nova-vault-YYYYMMDD`
- `~/obsidian-vault/nova/` 19 檔 rsync 遷入 `~/.claude/obsidian/`（`scripts/vault-migrate-to-claude.sh`）
- docs/ 6 檔遷 `~/.claude/obsidian/semantic/architecture-decisions/`
- 補齊 rules-background 15 條（P0 5 條優先）
- `scripts/reflections-import.js` 批次 import
- `scripts/vault-backlink.js` 產 `_backlinks.md`
- merge：Obsidian 關閉 → `git merge --no-ff` → rename legacy → Obsidian 重切 root

### Phase 2（7-9 人天 / 2-3 週 calendar）

- `scripts/ref-link-linter.js`（pre-commit hook 擋斷鏈 commit）
- `hooks/modules/vault-broken-link-warner.js`（PreToolUse 簡化版：rename tracking + BROKEN 標記）
- `vault/hot.md` v0 手工 + SessionStart hook 載入
- Stop hook 簡化 distill：`vault/raw/sessions/` append 不 compile
- architecture.test.js 擴展：vault 引用鏈鎖定
- Phase 2 merge 後 CLAUDE.md blueprint commit

### Phase 3（另案，9-13 人天 / 2-3 週 calendar）

- L1 自動化（embedding + TF-IDF + 引用圖）
- L2 g4-26b 批次 judge（只產候選組，不產 merge_draft）
- L3 人工 review + rule 廣意化執行（29 → 22，4 組合併）
- 使用者 Phase 2 merge 後另行決定是否啟動

---

## Consequences

### 正面

- rules → WHY（vault）+ HOW（skills）+ 條款（rules）三層分明，新知識歸類 decision tree 清晰
- 引用鏈雙機制守護（linter + backlink）— 治本
- docs/ 從孤島納入 vault backlink 圖，消除 drift
- reflections.jsonl 切片進 vault/raw/，Obsidian search 跨日查詢可用
- 單一 git repo 減少雙 repo 同步成本
- Obsidian 視覺化立即可用（Day 0 上線），輔助後續討論

### 負面

- `~/.claude/` vault 索引約 5400 md（post `.obsidianignore`），首次索引預期 < 30s 但需實測
- 新增 3 個 hook（SessionStart hot.md / pre-commit linter / PreToolUse warner）增加維護成本
- feat branch 期間 Obsidian 需掛舊 vault，切換有操作成本

### 中立

- nb 職責擴展至 vault linter + raw importer，對外仍是討論者
- CLAUDE.md blueprint role 增一段，不動 core_objective / non_negotiables

---

## Alternatives Considered

| 方案 | 否決理由 |
|------|---------|
| Plan A：125 refs 整批遷 vault | 破壞 procedural/semantic 界線 |
| Plan B 最精簡版 | rules 已 stub 化，無 WHY 可搬 |
| Plan C 膨脹版（Karpathy v2 全家桶 25-40d） | 膨脹超出使用者「快速治本」期待 |
| `~/obsidian-vault/nova/` + symlink | Symlink 跨 branch 陷阱 + 雙 repo 同步成本 |
| procedural 實體搬 skills/ → vault/ | 破壞 Anthropic Agent Skills 原生結構 |
| git submodule 替代 symlink | 引入 double-commit 複雜度 |

---

## 驗收條件

- [ ] Phase 0 完成：ADR 三方簽核 + Day 0 Obsidian 上線驗收 5 指標
- [ ] Phase 1 完成：feat branch merge + `~/.claude/obsidian/` 19 檔 + docs 6 檔 + rules-background 15 條
- [ ] Phase 2 完成：ref-link-linter 上線 + hot.md v0 + Stop append + architecture test 擴展通過
- [ ] F1 條款生效期間（Phase 1 啟動後 7 天）無大方向變動
- [ ] Legacy vault 觀察 2 週後安全刪除

---

## References

- 討論歷史完整記錄：`~/projects/nova-brain/spec/討論/vault-layer3-migration.md`（Round 1-5 learning log，不整合不歸檔）
- 遷移腳本：`~/projects/nova-brain/scripts/vault-migrate-to-claude.sh`（Phase 1 執行）
- nb blueprint 定位：`~/projects/nova-brain/CLAUDE.md` § Blueprint
