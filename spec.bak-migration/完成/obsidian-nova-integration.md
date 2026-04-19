# Obsidian + Nova 整合 D4 Spec

**日期**：2026-04-16  
**xd 來源**：xd-1776340244595-l4is（Round 3 最終架構對齊）  
**狀態**：awaiting Manager authorization

---

## 一、五個決策點的最終答案

### Q1：Vault 目錄結構

**結論：獨立目錄 `~/obsidian-vault/nova/`，不納入任何現有 repo**

理由：Obsidian 生成 `.obsidian/` 設定目錄（UI 偏好、外掛設定等），頻繁變更且與程式碼性質不同；混入 nova-brain 會製造 noise。

```
~/obsidian-vault/nova/
├── AGENTS.md                         # AI navigation guide（300 行以內）
├── README.md                         # 人工瀏覽 MOC 入口
│
├── working/                          # < 48h 的進行中草稿
│   └── session-YYYY-MM-DD.md         # wrapup 自動建立
│
├── episodic/                         # 有時序的事件記錄
│   ├── incidents/                    # xd-XXXX 事件記錄（從 rules/ 動機段抽出）
│   ├── reflections-archive/          # reflections.jsonl 月度蒸餾歸檔
│   └── decisions-archive/            # decisions.jsonl 重要決策歸檔
│
├── semantic/                         # 提煉後的通用知識
│   ├── rules-background/             # rules/ 動機段落的家
│   ├── architecture-decisions/       # ADR 架構決策記錄
│   └── component-history/            # 元件演進故事
│
└── discussions/                      # spec/討論/ 完成後的歸檔入口
```

---

### Q2：Method X + Obsidian 執行順序

**結論：Phase 0（vault 基礎）必須先，其後串/並行混合**

```
Phase 0（vault 初始化）           ← 必須最先，2h
    │
    ├── Phase 1-2-3（Method X，串行批次）    ~11h
    ├── Phase 4（蒸餾循環，並行）            ~6h
    └── Phase 5（MEMORY.md 重構，並行）      ~1h
```

理由：Phase 0 建立 vault 目錄後，Phase 1 rule stubs 才知道 vault 指標的正確路徑。Phase 4/5 只需 vault 存在，不依賴 Method X 進度。

**Pointer 策略（最關鍵設計決策）**：

Rule stubs 的 fat 依性質分流到不同目的地：

| Fat 類型 | 目的地 | 範例 |
|---------|--------|------|
| 程序性知識（如何做、決策樹）| `skills/*/references/*.md` | hook 擴展 checklist |
| 踩坑記錄（xd-XXXX 事件）| `~/obsidian-vault/nova/episodic/incidents/` | xd-2c4m hook 過度擴展 |
| 反例 vs 正例 table | `skills/*/references/*.md` | 多數 table 含操作指引 |
| 動機/背景說明 | `~/obsidian-vault/nova/semantic/rules-background/` | 為什麼設計這條規則 |
| 派生來源（xd id + commit）| `~/obsidian-vault/nova/episodic/incidents/` | 同 xd 踩坑記錄 |

**Rule stubs 的實際 pointer 格式**：
```markdown
詳見 `skills/hook-discipline/references/history.md`
踩坑記錄：`~/obsidian-vault/nova/episodic/incidents/xd-2c4m.md`
```

⛔ NEVER rule stub 只留一個 pointer——若同時有 skills/ 和 vault 目的地，兩個都列。

---

### Q3：蒸餾循環 MVP 設計

**結論：週跑 haiku script，sources = reflections + hook-errors，output = vault + 條件 cross-dispatch**

| 維度 | 決策 |
|------|------|
| 來源 | `~/.claude/data/reflections.jsonl`（主）+ `~/.claude/data/hook-errors.jsonl`（副） |
| 模型 | haiku（低成本，週跑適合） |
| 輸出 | `~/obsidian-vault/nova/episodic/reflections-archive/YYYY-WNN-synthesis.md` |
| 觸發 | CronCreate 每週日 02:00 + 手動 `bun ~/.claude/scripts/distillation-agent.js` |
| 升級 | 有未覆蓋 pattern（≥3 次 correction）→ cross-dispatch Manager 決定是否加 rule |

**重要性 score 標準**：
- `trigger_type = "correction"` + 觸發 ≥ 3 次 = **立即 cross-dispatch**
- `trigger_type = "autonomous"` + 觸發 ≥ 3 次 = 寫入 synthesis 但不 cross-dispatch
- 觸發 1-2 次 = 只寫入月度歸檔

**實作位置**：`~/.claude/scripts/distillation-agent.js`（standalone script，非 hook module，因為是排程批次而非 event-driven）

---

### Q4：MEMORY.md 拆分

**結論：MEMORY.md 保留「AI live context」，人工 MOC 遷至 vault README.md，AGENTS.md 放 vault root**

| 目的 | 之前 | 之後 |
|------|------|------|
| AI session 用 live reference | MEMORY.md（200 行） | MEMORY.md（≤80 行，只含 active 項目） |
| 人工瀏覽知識圖 | MEMORY.md 同檔 | vault README.md |
| Feedback 歷史 | memory/feedback_*.md | vault episodic/incidents/（漸進遷移） |
| Vault schema 手冊 | 不存在 | vault AGENTS.md（AI 讀取） |

**AGENTS.md 格式**（放置於 `~/obsidian-vault/nova/AGENTS.md`）：

```yaml
# Nova Vault — AI Navigation Guide
# Consulted by AI agents when reading vault context
vault_root: ~/obsidian-vault/nova/
last_updated: 2026-04-16

directories:
  working/:
    purpose: Active session context, ephemeral (<48h)
    use_when: Looking for in-progress drafts or session notes
    example: working/session-2026-04-16.md

  episodic/incidents/:
    purpose: Historical incident records (xd-XXXX events)
    use_when: Debugging similar issues or understanding why a rule exists
    naming: "{xd-id}-{short-name}.md"
    example: episodic/incidents/xd-2c4m-hook-overexpansion.md

  episodic/decisions-archive/:
    purpose: Important design decisions (importance >= 3)
    use_when: Understanding why an architecture choice was made

  semantic/rules-background/:
    purpose: Motivation and background for rules in ~/.claude/rules/
    use_when: Understanding the "why" behind a MUST/NEVER constraint
    naming: "{category}-{rule-name}-background.md"

  semantic/architecture-decisions/:
    purpose: ADR records for system architecture
    use_when: Before making structural changes to nova components

  discussions/:
    purpose: spec/討論/ completed discussions archived here
    use_when: Historical context for design decisions
```

**CLAUDE.md 加一行（在 nova 全域 CLAUDE.md 的環境資訊段）**：
```
知識背景庫：~/obsidian-vault/nova/（先讀 AGENTS.md）
```

---

### Q5：版本控制

**結論：獨立 git repo `ryu111/nova-knowledge`，obsidian-git 外掛自動備份**

| 項目 | 設定 |
|------|------|
| 本地路徑 | `~/obsidian-vault/nova/` |
| 遠端 | `git@github.com:ryu111/nova-knowledge.git` |
| obsidian-git auto-backup | 每 30 分鐘 |
| commit message 格式 | `vault: auto-backup {{date}}` |
| pull before push | true |
| branch | main |

**初始化指令**（Phase 0 執行）：
```bash
git init ~/obsidian-vault/nova/
cd ~/obsidian-vault/nova/
git remote add origin git@github.com:ryu111/nova-knowledge.git
```

**.gitignore 更新**（nova 和 nova-brain 兩個 repo 都需要）：
```
# vault 獨立 repo，不納入此 repo
~/obsidian-vault/
```
注意：用本地 `.gitignore` 寫絕對路徑無效，改用 `~/.gitignore_global`：
```bash
echo "*/obsidian-vault/" >> ~/.gitignore_global
git config --global core.excludesfile ~/.gitignore_global
```

---

## 二、完整執行計劃

### Phase 0：Vault 基礎建設（nb，~2h）

**目標**：建立 vault 目錄結構 + git repo + AGENTS.md + pilot 遷移 3 個 incident 驗證可行性

**步驟**：
1. `mkdir -p ~/obsidian-vault/nova/{working,episodic/incidents,episodic/reflections-archive,episodic/decisions-archive,semantic/rules-background,semantic/architecture-decisions,semantic/component-history,discussions}`
2. 初始化 git → remote `ryu111/nova-knowledge`
3. 寫 AGENTS.md（使用 Q4 格式）
4. 寫 README.md（人工 MOC 骨架）
5. Pilot 遷移 3 個 incident：
   - `xd-2c4m`（hook-discipline.md 動機）→ `episodic/incidents/xd-2c4m-hook-overexpansion.md`
   - `xd-ctz8`（hook-discipline.md 動機）→ `episodic/incidents/xd-ctz8-hook-output-size.md`
   - `xd-e71m`（library-caller-boundary.md 動機）→ `episodic/incidents/xd-e71m-vault-actor-cwd.md`
6. 更新 3 個 rules 加 vault pointer（不刪條款）
7. 在 `~/.claude/CLAUDE.md` 加 vault pointer 一行
8. 設定 `~/.gitignore_global`

**驗收條件**：
- [ ] `ls ~/obsidian-vault/nova/` 列出所有目錄
- [ ] `bun tests/unit/architecture.test.js` 全通過
- [ ] behavioral eval：問「為什麼 hook 不能用 universal threshold」→ AI 能 Read vault 並正確回答
- [ ] 3 個 rules 的 MUST/NEVER 條款均保留完整

---

### Phase 1：Method X Batch A（nb，~4h，Phase 0 完成後啟動）

**目標**：5 個 fattest rules 薄化到 6-11 行

**目標 rules**（依 Phase 1 掃描報告 Batch A 優先序）：
1. `rules/元件/AskUserQuestion全鏈路.md`（42 → 9 行）
2. `rules/元件/library-caller-boundary.md`（33 → 10 行）
3. `rules/協作/canonical-引用驗証.md`（27 → 9 行）
4. `rules/協作/peer-discussion-visibility.md`（37 → 10 行）
5. `rules/品質/benchmark-winner-selection.md`（47 → 12 行）

**每個 rule 的操作流程**：
1. 讀原始 rule，分類每段（保留 / skills / vault）
2. 建 skills/ 參考檔（程序性知識 fat）
3. 建 vault incidents/ 或 rules-background/（歷史/背景 fat）
4. 改寫 rule stub（只留條款 + pointer）
5. `bun tests/unit/architecture.test.js` 確認通過

**驗收條件**：
- [ ] 5 個 rules 每個 ≤ 12 行
- [ ] 無任何 MUST/NEVER/SHOULD 條款被刪除
- [ ] `bun tests/unit/architecture.test.js` 全通過
- [ ] rules 總行數 ≤ 1040

---

### Phase 2：Method X Batch B（nb，~3h，Phase 1 完成後啟動）

**目標 rules**：
1. `rules/品質/元件孵化.md`（53 → 18 行）
2. `rules/品質/測試規範.md`（38 → 13 行）
3. `rules/環境/工具選擇.md`（37 → 15 行）
4. `rules/環境/本地模型管理.md`（41 → 14 行）
5. `rules/元件/hook-discipline.md`（31 → 15 行）

**驗收條件**：
- [ ] 5 個 rules 薄化完成
- [ ] `bun tests/unit/architecture.test.js` 全通過
- [ ] rules 總行數 ≤ 850

---

### Phase 3：Method X Batch C（nb，~4h，Phase 2 完成後啟動）

**目標 rules**：
1. `rules/協作/完成即討論.md`（28 → 12 行）
2. `rules/協作/owner-commit-discipline.md`（47 → 12 行）
3. `rules/元件/模組架構.md`（49 → 13 行，縮模組表 → 指向）
4. 其餘 B 類 rule 中仍有可移出的派生來源段落
5. 任何 A 類 rule 中純歷史性的附錄段落（不含條款）

**驗收條件**：
- [ ] rules 總行數 ≤ 500（目標：從 1154 降至 ~400）
- [ ] `bun tests/unit/architecture.test.js` 全通過
- [ ] behavioral eval：5 個隨機規則情境測試，行為不退化

---

### Phase 4：蒸餾循環 MVP（nb，~6h，並行於 Phase 1-3）

**目標**：建立第一個 Closed-Loop 自我強化機制

**步驟**：
1. 建 `~/.claude/scripts/distillation-agent.js`
2. 實作邏輯：
   - 讀 `~/.claude/data/reflections.jsonl` 最近 30 天
   - 讀 `~/.claude/data/hook-errors.jsonl` 最近 30 天
   - haiku 執行 ConsolidateAgent 模式（找重複 ≥3 次的 pattern）
   - 輸出 `~/obsidian-vault/nova/episodic/reflections-archive/{YYYY-WNN}-synthesis.md`
   - 觸發條件：`correction` 類型 pattern ≥3 次 → POST cross-dispatch Manager
3. CronCreate 設定：週日 02:00（本地時間）
4. 用當前 reflections.jsonl 做 dry-run 驗證

**驗收條件**：
- [ ] dry-run 產出 ≥1 有意義的 pattern synthesis（非空檔案）
- [ ] synthesis 無明顯幻覺（每條 pattern 有原始 jsonl entry 佐證）
- [ ] CronCreate 已設定（`CronList` 可見）
- [ ] `tests/unit/architecture.test.js` 新增腳本存在性 test

---

### Phase 5：MEMORY.md 重構（nb，~1h，並行於 Phase 1-3，Phase 0 後啟動）

**目標**：MEMORY.md 只留 AI live context，人工 MOC 遷至 vault

**步驟**：
1. 讀 `~/.claude/projects/...*/memory/MEMORY.md`（nova-brain 專案）
2. 識別「人工 MOC」段落 → 移至 vault README.md
3. MEMORY.md 目標 ≤80 行
4. 在 MEMORY.md 加一行 vault pointer

**驗收條件**：
- [ ] nova-brain MEMORY.md ≤80 行
- [ ] vault README.md 存在且有 MOC 內容
- [ ] MEMORY.md 有 vault pointer 一行

---

## 三、預估工作量總覽

| Phase | 執行者 | 估計工時 | 依賴 | 可並行 |
|-------|--------|---------|------|--------|
| Phase 0 | nb | 2h | — | 無（必須最先） |
| Phase 1 | nb | 4h | Phase 0 | 與 4、5 並行 |
| Phase 2 | nb | 3h | Phase 1 | — |
| Phase 3 | nb | 4h | Phase 2 | — |
| Phase 4 | nb | 6h | Phase 0 | 與 1、2、3、5 並行 |
| Phase 5 | nb | 1h | Phase 0 | 與 1、4 並行 |

**總估計**：~20h 工作量  
**最短完成路徑**：Phase 0（2h）→ Phase 1+4+5 並行（6h）→ Phase 2（3h）→ Phase 3（4h）= **~15h 掛鐘時間**

---

## 四、元件責任分配

| Session | 角色 | 任務 |
|---------|------|------|
| **nb** | 主執行者 | Phase 0-5 全部執行 |
| **nm** | 授權者 + 品質閘 | 授權 Phase 0 開始；spot-check AGENTS.md；收 Phase 4 蒸餾報告 |
| **ns** | 不涉及 | MVP 不需 server 端 API；若後續 vault 需要 HTTP 接口再 dispatch |

---

## 五、風險評估

| 風險 | 可能性 | 緩解 |
|------|--------|------|
| vault pointer 在 AI context 中不生效（AI 不 Read） | 低 | Phase 0 behavioral eval 驗證，不通過則調整 CLAUDE.md pointer 寫法 |
| Method X 誤刪 MUST/NEVER 條款 | 低 | 每個 rule 操作前 grep 條款計數；驗收時逐條比對 |
| 蒸餾循環 haiku 幻覺 | 中 | dry-run 先手動 review；要求每條 pattern 必附 jsonl entry 佐證 |
| obsidian-git 自動備份衝突 | 低 | 只有一個 writer（本地），衝突概率極低 |

---

## 六、第一次授權請求

Manager 審閱後，請授權執行 **Phase 0**（vault 基礎建設，est. 2h）。  
Phase 0 驗收通過後，nb 將同時啟動 Phase 1 + Phase 4 + Phase 5。
