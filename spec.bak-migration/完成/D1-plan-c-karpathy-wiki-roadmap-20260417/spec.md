# Plan C — Karpathy LLM Wiki v2 + Obsidian Substrate 長期路線圖草稿

> **狀態**：草稿（for Round 2 比較用），非承諾。
> **來源**：`spec/討論/vault-layer3-migration.md` Plan C 的展開。
> **建立日**：2026-04-17
> **前置討論**：xd-1776424881075-6shr（nova-manager → nova-brain Round 1）

---

## 動機（Why）

使用者 2026-04-17 提議「把核心維護轉向 Obsidian vault 當 L3 知識主幹」。Round 1 回覆中我提 Plan A/B/C 三選項，使用者目前選了「先擬 Plan C 長期路線圖草稿」給 Round 2 比較。

本 spec 為草稿，不執行前先讓 Manager / 使用者檢視。

### 業界對齊基準
- [Karpathy LLM Wiki v2 gist (rohitg00, 2026-04)](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)
- [Mindstudio AI Second Brain Claude Code + Obsidian](https://www.mindstudio.ai/blog/ai-second-brain-claude-code-obsidian-architecture)
- 四層記憶：working / episodic / semantic / procedural

---

## 核心設計

### Vault 新結構
```
~/obsidian-vault/nova/
├── AGENTS.md              # 既有，需更新路徑導覽
├── _index.md              # 既有
├── raw/                   # NEW — 原始資料池（Karpathy raw）
│   ├── reflections/       # reflections.jsonl 每日切片
│   ├── sessions/          # session wrapup 原文
│   └── discussions/       # spec/討論 歸檔前的 snapshot
├── wiki/                  # NEW — 編譯後知識頁（Karpathy compiled）
│   ├── concepts/          # 概念類（hook-discipline, canonical-verification...）
│   ├── entities/          # 元件類（具體 hook/skill 名）
│   └── decisions/         # 遷入自 semantic/architecture-decisions
├── procedural/            # NEW — symlink → ~/.claude/skills/（不實體搬）
├── semantic/              # 既有，wiki/ 成熟後逐步併入
│   ├── rules-background/  # 保留，承接 rules 尾端 WHY（Plan B 成果）
│   ├── architecture-decisions/
│   └── component-history/
├── episodic/              # 既有，維持不動
│   ├── incidents/
│   ├── reflections-archive/  # heartbeat 週月度蒸餾產物
│   └── decisions-archive/
├── working/               # 既有
└── discussions/           # 既有
```

### Raw → Compiled Pipeline（Karpathy pattern）
```
raw/reflections/2026-04-17.jsonl
    ↓ nightly heartbeat cron
    ↓ (LLM compile：提取 facts / 建 entity pages / lint 衝突)
wiki/concepts/hook-discipline.md        ← 可 cite 回 raw/ 原文
wiki/entities/reviewer-enforcer.md
    ↓ 蒸餾成熟（引用穩定 ≥ 30 天）
semantic/component-history/*.md（終態）
```

### Procedural Symlink 策略
- `vault/procedural/` 為 `~/.claude/skills/` 的 symlink
- Obsidian 使用者可在 vault 內瀏覽 skills，但編輯仍走 `~/.claude/` canonical
- 避免「procedural memory 遷 vault 破壞三層界線」爭議（見 Round 1 Q1 回覆）
- 保留 Anthropic Agent Skills 原生結構

---

## 里程碑（6 個月）

### M0 — 草稿對齊（Week 0，~3 天）
- [ ] 本 spec 完成，等 Round 2 共識
- [ ] Manager / 使用者挑戰、修訂方向
- [ ] 決定是否推進（若否 → 回退 Plan B）

### M1 — Infra 建置（Week 1-2，~1 週）
- [ ] `vault/raw/` `vault/wiki/` 資料夾建立 + README
- [ ] `vault/procedural/` symlink 建立（注意：git 要 `ln -s` 後 add，不會自動跟進）
- [ ] `scripts/vault-structure-lint.js` 驗證三目錄存在
- [ ] `tests/unit/vault-structure.test.js`

### M2 — Heartbeat Pipeline（Week 3-4，~2 週）
- [ ] `scripts/heartbeat-compile.js`：讀 raw/ → 產 wiki/
- [ ] 使用 local model（gemma-4-31b or haiku）做 compile，opus 做 lint
- [ ] cron：每日 02:00 執行
- [ ] 引用格式：wiki/ 每頁必附 raw/ source citation（URL or file path）
- [ ] 冪等性：同一 raw 多次 compile 結果 diff ≤ 5%

### M3 — rules 遷移（Week 5-6，~2 週）
- [ ] 29 條 rules 尾端 WHY → `vault/wiki/concepts/*.md`（Plan B 成果併入）
- [ ] rules stub 改指 wiki/（而非 skills references）
- [ ] `scripts/ref-link-linter.js` 擴展支援 vault/wiki/ 路徑
- [ ] architecture.test.js 新增 vault 引用鏈測試

### M4 — reflection 蒸餾（Week 7-10，~4 週）
- [ ] reflections.jsonl → `vault/raw/reflections/YYYY-MM-DD.md` 切片
- [ ] 週度 synthesis → `vault/episodic/reflections-archive/YYYY-WNN-synthesis.md`（已有雛形）
- [ ] 月度 distill → `vault/semantic/component-history/YYYY-MM-*.md`
- [ ] dashboard 顯示 heartbeat 健康度

### M5 — wiki 成熟化（Week 11-16，~6 週）
- [ ] wiki/ 內鏈密度 ≥ 平均 3 連結/頁
- [ ] `vault/_backlinks.md` 自動生成（每頁顯示誰引用）
- [ ] lint 規則：孤兒頁（無引用 + 超 60 天未更新）列淘汰候選
- [ ] 使用者驗收：Obsidian graph view 能看出主題聚類

### M6 — nb 職責重劃（Week 17-24，~7 週）
- [ ] docs/ 大部分遷入 vault/wiki/（docs/vision.md, docs/目標場景.md）
- [ ] nb 保留：tests/、scripts/、spec/、dashboard/
- [ ] nb 升級為 nova-observer：增 `scripts/vault-health-monitor.js`（raw/wiki 比例、compile 失敗率、孤兒頁）
- [ ] CLAUDE.md Blueprint 更新 role 為「Sensor + Observer + CI」（不再是 Brain）

---

## 成本總計

| 里程碑 | 工時（人天） | 累計 |
|--------|-------------|------|
| M0 | 3 | 3 |
| M1 | 5 | 8 |
| M2 | 10 | 18 |
| M3 | 10 | 28 |
| M4 | 20 | 48 |
| M5 | 30 | 78 |
| M6 | 35 | 113 |
| **合計** | **~113 人天** | **5-6 個月** |

**Round 1 給的估算 25-40 人天 低估**。修正後 **~113 人天**（含 heartbeat pipeline + wiki 成熟化 + 遷 docs + nb 重劃）。

---

## 風險清單

| 風險 | 機率 | 影響 | 緩解 |
|------|:---:|:---:|------|
| heartbeat cron LLM 成本爆炸 | 中 | 中 | 用 g4-26b 本地模型做 compile，opus 只做 lint |
| wiki 內容 drift（compile 不穩定） | 高 | 高 | 冪等性測試 + diff 閾值 5% 門檻 |
| procedural symlink git 追蹤坑 | 中 | 低 | M1 明文記錄 git add symlink 流程 |
| 使用者喪失耐心（6 個月太長）| 高 | 高 | 分階段交付，M3 結束就可看到 rules→vault 效果 |
| Anthropic Agent Skills 規格更新破壞 symlink | 低 | 高 | M6 前追蹤 skills API 變動 |
| vault 龐大後 Obsidian 索引慢 | 低 | 中 | M5 引入 `.obsidian/` workspace config 調參 |

---

## 與 Plan B 的關係

- Plan B 是 Plan C 的 **M3 子集**（只做 rules WHY 遷移 + ref linter）
- 如選 Plan C，M0-M3 路線已包含 Plan B 全部成果
- 如 Plan B 執行中發現問題，可降級停於 M3 不推進 M4+
- **建議**：先 commit 到 Plan B，M3 結束後 Round N 再決定是否續推 M4-M6

---

## 未解議題（回 Round 2 討論）

1. heartbeat compile 用哪個模型？g4-26b 成本最低但品質風險，opus 品質好但成本高 — 需試點驗證。
2. procedural symlink 在 git 內管理策略？`.gitattributes` + `ln -s` vs 各 project 獨立管理？
3. wiki/ 與 semantic/ 長期合併還是永久共存？Karpathy 原版只有 `wiki/`，Nova 是否保留 semantic/ 作過渡層？
4. Manager 角色是否需變動？vault 成熟後，Manager 是否從「質疑者」轉為「vault gardener」？

---

## 下一步（等 Round 2 共識）

- [ ] Manager 讀本草稿，提出挑戰
- [ ] 使用者回 RQ1（痛點具體化）後，決定 Plan B vs Plan C
- [ ] 若選 Plan C：M0 → M1 開工；若選 Plan B：本 spec 歸檔至 `spec/完成/`（未來參考）
- [ ] 若都不選：本 spec 刪除或歸檔 `spec/放棄/`

---

## 驗收條件（Spec 本身）

- [x] 結構完整（動機 / 設計 / 里程碑 / 成本 / 風險 / 未解議題）
- [x] 對齊 Karpathy LLM Wiki v2（raw → compiled）
- [x] 回應 Round 1 中 procedural 界線爭議（symlink 策略）
- [x] 成本估算完整（Round 1 粗估 25-40 修正為 113）
- [ ] Manager Round 2 回覆挑戰（待辦）
- [ ] 使用者選定方案（待辦）
