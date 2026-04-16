# Obsidian+CLI 作為 Nova 知識架構全面分析

> 作為 xd-1776339115396-libu (nova-manager dispatch) 的回應文件
> 討論脈絡：評估 Obsidian 在 Nova 整體知識架構中的角色，非單純評估「規則倉庫」用途

---

## 前言：問題的本質

Manager 的問題核心是：**Nova 的知識組織架構是否已達上限？** 現有的三層結構（CLAUDE.md → rules/ → skills/）承載了太多異質內容——操作規範、背景脈絡、歷史事件、設計理由、踩坑記錄——混在一起導致每層都過肥。

Obsidian 的問題不是「要不要用一個好工具」，而是「是否需要建立 Layer 3，以及 Obsidian 是否是最合適的載體」。

---

## 一、Nova 當前三層架構現狀

### 1.1 實際層次分布

| 層次 | 載體 | 當前行數 | 永遠在 context | 內容性質 |
|------|------|---------|:--------------:|---------|
| Layer 1 | CLAUDE.md + rules/ | ~1600 行 | 是 | 規範條款、禁止事項、必做事項 |
| Layer 2 | skills/ | 未計（~37 個目錄） | 否（AI 主動觸發） | 操作知識、決策樹、工作流 |
| Layer 3 | 不存在 | — | — | — |

### 1.2 Layer 1 的過肥問題

目前 rules/ 的實際內容分布，以 `hook-discipline.md` 為例：
- 核心條款（MUST/NEVER）：約 15 行
- 動機說明（為什麼這樣設計）：約 10 行
- 踩坑記錄（xd-2c4m、xd-ctz8）：約 8 行
- 反例正例表：約 10 行
- 派生來源：約 5 行

**核心條款只佔 30%**，其餘 70% 是背景知識——這些背景知識每次都被注入 context，但 AI 在執行任務時通常只需要條款本身。

全域規則 ~1154 行，真正的行為指令估計 400-500 行，其餘 600-700 行是背景知識佔用 Layer 1 空間。

### 1.3 Layer 3 內容的現實散落位置

以下內容性質上屬於 Layer 3（參考知識，不需永遠在 context），但目前無家可歸：

| 內容類型 | 當前位置 | 估計量 |
|---------|---------|--------|
| rules/ 動機段落 | rules/*.md | ~200 行 |
| rules/ 踩坑記錄 | rules/*.md | ~150 行 |
| rules/ 派生來源 | rules/*.md | ~100 行 |
| spec/討論/ 決策歷史 | spec/討論/*.md | ~50 個檔案 |
| memory/feedback_*.md | memory/ | ~44 個檔案 |
| skills/*/references/ | skills/ | 大量 |

---

## 二、skills/ 與 Obsidian 的本質差異

這是整個分析的核心判斷點。兩者不是競爭關係，而是承載不同性質知識。

### 2.1 skills/ = 程序性知識（Procedural Knowledge）

- **性質**：如何做、何時觸發、執行流程、決策樹
- **使用模式**：AI 在執行特定任務時主動 Read 載入
- **典型內容**：`component-classification/SKILL.md`、`feedback-loop/SKILL.md`
- **時效性**：會隨架構演進更新
- **例子**：「如何判斷一個新規則應歸屬 Guide/Sensor/Closed-Loop 三支柱哪一層」

### 2.2 Obsidian = 參考性知識（Reference/Contextual Knowledge）

- **性質**：為什麼這樣設計、歷史事件、背景脈絡、設計理由
- **使用模式**：需要深入理解某決策時查閱，或 AI 被要求「解釋為什麼」時使用
- **典型內容**：xd-2c4m 事件完整記錄、v0.5 event log 討論史
- **時效性**：歷史事件永遠有效，不需更新
- **例子**：「task-dispatch-guard 為什麼不能用 universal threshold — 因為 xd-2c4m 事件證明 noise 無法控制」

### 2.3 互補關係圖

```
Layer 1 (rules/)      Layer 2 (skills/)      Layer 3 (Obsidian)
┌──────────────┐      ┌──────────────┐       ┌──────────────────┐
│ MUST/NEVER   │      │ 決策樹        │       │ 為什麼這樣決定    │
│ 條款（精簡）  │ ←→  │ 操作流程      │  ←→  │ 歷史事件記錄      │
│ 指向 skill   │      │ 反例正例      │       │ 設計背景脈絡      │
│ 指向 vault   │      │ 指向 vault   │       │ 踩坑完整記錄      │
└──────────────┘      └──────────────┘       └──────────────────┘
永遠在 context         AI 主動觸發             純人工查閱/AI 按需 Read
```

---

## 三、Obsidian Vault 能扮演的 Layer 3 角色

### 3.1 可吸收的現有內容

**來自 rules/ 的背景知識**（可從規則本體抽離，只留條款）：

| rules 檔案 | 可移至 vault 的段落 | 留在 rules 的核心 |
|-----------|-------------------|-----------------|
| hook-discipline.md | 動機段、xd-2c4m/ctz8 記錄 | MUST/NEVER 條款 |
| owner-commit-discipline.md | 搶先 commit 事件完整史 | 共識判準表 |
| peer-discussion-visibility.md | v0.5 event log 事件 | 多方可見性規則 |
| benchmark-winner-selection.md | xd-jyeu/31cb bug 分析 | Pareto 四步規則 |
| library-caller-boundary.md | xd-e71m 完整事件 | 禁止推測 caller 條款 |

估計：rules/ 可瘦身 **40-50%**（600-700 行 → 300-350 行），且規則更清晰，背景脈絡更豐富。

**來自 spec/討論/ 的決策歷史**：

目前 spec/討論/ 有大量討論檔，但沒有分類組織。移至 Obsidian 後可建立：
- 架構決策記錄（Architecture Decision Records）
- 協議演進史（protocol v0.4 → v0.5 → v0.6）
- 多方討論紀錄（ns/nb/nc 討論原文）

**來自 memory/feedback_*.md**：

44 個 feedback 檔記錄了 bug patterns 和學習教訓，但在 memory/ 中難以檢索。移至 Obsidian 後可用 graph view 看出哪些 bug pattern 有關聯。

### 3.2 Obsidian 特有優勢

**Graph View**：nova 各元件的知識關係在 graph view 中一目了然。例如：
- `xd-2c4m` → 連結到 `hook-discipline rule` + `task-dispatch-guard 設計決策`
- `v0.5 event log` → 連結到 `owner-commit-discipline` + `peer-discussion-visibility` + `canonical-引用驗證`

這種關係在 rules/ 的純文本中完全不可見。

**人工維護友善**：Manager 或使用者可以直接在 Obsidian 桌面 app 瀏覽知識庫，不需要 CLI 命令。這是 skills/ 和 rules/ 做不到的——那些檔案純粹是給 AI 看的。

**Backlinks**：每個 vault 文件會自動顯示哪些其他文件引用了它，容易發現孤立知識。

---

## 四、分類原則：什麼進 Obsidian，什麼留 rules/skills

### 4.1 判斷樹

```
這段內容是：
│
├─ 行為規範（MUST/NEVER/SHOULD）？
│   └─ 是 → 留在 rules/（精簡版，不含背景）
│
├─ 操作流程 / 決策樹 / 工作流？
│   └─ 是 → 留在 skills/（Layer 2，AI 主動觸發）
│
├─ 歷史事件 / 踩坑記錄 / 為什麼設計這樣？
│   └─ 是 → 移至 Obsidian vault（Layer 3）
│
├─ 架構決策記錄？
│   └─ 是 → 移至 Obsidian vault（Layer 3）
│
└─ 討論過程 / 多方論點記錄？
    └─ 是 → 移至 Obsidian vault（Layer 3）
```

### 4.2 具體分類規則

**進 Obsidian 的內容特徵**：
- 以 xd-XXXX 編號開頭的事件記錄
- 「動機」、「派生來源」、「踩坑記錄」段落
- spec/討論/ 下的完整討論文件
- 反例表的詳細解釋（只留結論在 rules/）
- memory/feedback_*.md 的完整記錄

**留在 rules/ 的內容特徵**：
- MUST/NEVER/SHOULD/COULD 條款本身
- 判斷表格（門檻、等級、矩陣）
- 指向 skill 或 vault 的參考連結
- 規則本體不超過 50 行（現有規定）

**留在 skills/ 的內容特徵**：
- 操作流程圖
- 決策樹
- 觸發時機判斷
- 反例正例（簡潔版，詳版移 vault）

---

## 五、技術整合方案

### 5.1 Vault 目錄結構

```
~/obsidian-vault/nova/
├── README.md                      # vault 入口，說明使用方式
│
├── incidents/                     # 事件記錄（按 xd-id 索引）
│   ├── xd-2c4m-task-dispatch-guard.md
│   ├── xd-ctz8-hook-output-size.md
│   ├── xd-jyeu-benchmark-class-bug.md
│   ├── xd-e71m-vault-manager-actor.md
│   └── xd-ew0k-canonical-drift.md
│
├── architecture-decisions/        # 架構決策記錄（ADR 格式）
│   ├── ADR-001-three-pillar-harness.md
│   ├── ADR-002-cross-dispatch-protocol.md
│   ├── ADR-003-component-lifecycle.md
│   └── ADR-004-layer3-obsidian.md   # 本次決策
│
├── rules-background/              # rules/ 的背景知識（條款留 rules/，背景在這）
│   ├── hook-discipline-background.md
│   ├── owner-commit-discipline-background.md
│   ├── peer-discussion-background.md
│   └── benchmark-winner-background.md
│
├── discussions/                   # 遷移自 spec/討論/
│   ├── v0.5-self-assessment.md
│   ├── cross-component-convergence.md
│   ├── local-model-storage-rule.md
│   └── obsidian-cli-comprehensive.md  # 本文件最終歸宿
│
├── skill-deep-references/         # skills/*/references/ 的深層內容
│   ├── feedback-loop-protocols.md
│   ├── cross-dispatch-edge-cases.md
│   └── component-classification-examples.md
│
└── component-history/             # 元件生命週期歷史
    ├── hook-evolution.md
    ├── skill-judge-evolution.md
    └── reviewer-enforcer-evolution.md
```

### 5.2 rules/ 指向 vault 的 pointer 格式

規則精簡後，在底部加一行標準格式：

```markdown
### 參考

背景脈絡與事件記錄見 `~/obsidian-vault/nova/rules-background/hook-discipline-background.md`
```

這樣 AI 在需要理解「為什麼」時可以主動 Read vault 路徑，但正常執行任務時不需要載入。

### 5.3 skills/ 指向 vault 的格式

在 SKILL.md 的 references 段：

```markdown
## References

- 深層背景：`~/obsidian-vault/nova/skill-deep-references/feedback-loop-protocols.md`
- 相關事件：`~/obsidian-vault/nova/incidents/xd-2c4m-task-dispatch-guard.md`
```

### 5.4 Claude Read 路徑策略

**AI 何時主動 Read vault**：
1. 被問到「為什麼」某個規則這樣設計
2. 需要查閱某 xd-id 事件完整記錄
3. skills/ 裡的 reference 指向 vault 路徑

**AI 不需要 Read vault 的情況**：
- 正常任務執行（條款已在 Layer 1）
- 觸發 skill（skill 本身已在 Layer 2）

這確保 vault 是純 Layer 3——**按需讀取，不自動注入**。

---

## 六、版本控制方案

### 6.1 選項比較

| 方案 | 優點 | 缺點 | 適合性 |
|------|------|------|--------|
| A：整合進 ryu111/nova | 單一 repo | 背景知識與操作規範混在一起，nova repo 過肥 | 不推薦 |
| B：整合進 ryu111/nova-brain | 測試 repo 已有 spec/討論/ | nova-brain 定位是開發輔助，不是知識庫 | 次選 |
| C：獨立 ryu111/nova-knowledge | 關注點分離，vault 有自己的 git 歷史 | 第三個 repo 增加管理負擔 | 推薦 |
| D：不用 git，純本機 Obsidian | 零管理成本 | 無備份、跨機器無法同步 | 不推薦 |

### 6.2 推薦方案：ryu111/nova-knowledge

**理由**：

1. **關注點分離**：nova（操作規範）和 nova-brain（開發輔助）各有其定位，知識庫有獨立定位更清晰
2. **獨立 git 歷史**：知識演進和規範演進是不同節奏，分開 repo 才不會互相污染
3. **Obsidian git plugin**：可直接在 Obsidian 中 push/pull，不需要手動 git 操作
4. **未來可擴展**：如果其他專案（kuji、ai-media）也需要知識庫，可以用同一個 vault 的不同目錄

**Repo 結構**：
```
ryu111/nova-knowledge
├── nova/           # Nova 系統知識庫（本文件描述的內容）
├── .gitignore      # Obsidian workspace 設定排除
└── .obsidian/      # 可 commit 的 Obsidian 設定（theme、plugin config）
```

**Obsidian git plugin 設定**：
- Auto push interval: 60 分鐘（背景靜默同步，不干擾）
- Commit message: `vault: auto-sync {{date}}`
- Disable on mobile（不適用）

---

## 七、遷移成本與架構衝擊評估

### 7.1 規模盤點

| 類型 | 數量 | 估計遷移工時 |
|------|------|------------|
| rules/ 背景段落抽離 | 29 個 rules 檔 | 4-6 小時 |
| spec/討論/ 重組分類 | ~50 個檔案 | 2-3 小時 |
| memory/feedback_*.md 整理 | ~44 個檔案 | 2-3 小時 |
| skills/*/references/ 整理 | ~37 個 skill 目錄 | 6-8 小時 |
| rules/ 加 vault pointer | 29 個檔案 | 1-2 小時 |
| skills/ 加 vault pointer | ~37 個 SKILL.md | 1-2 小時 |
| **合計** | | **16-24 小時** |

這不是一次性工作，建議分批遷移：

**Phase 1（低風險，立即可做）**：spec/討論/ → discussions/，memory/feedback_*.md → incidents/
**Phase 2（中風險，需測試）**：rules/ 背景段落抽離 + vault pointer 加入
**Phase 3（高工作量）**：skills/*/references/ 整理分類

### 7.2 架構衝擊

**正面影響**：
- Layer 1 瘦身 40-50%，context 效率大幅提升
- rules/ 更可讀——每個規則只有條款，不混背景
- 歷史知識有正式歸宿，不再散落在 spec/討論/ 和 memory/

**潛在風險**：
- AI 需要正確理解「規則在 rules/，背景在 vault」的兩層模型——如果 AI 沒有 Read vault 的習慣，背景知識等於隱藏
- vault pointer 格式需要一致（建議寫進 wording skill 的範本）
- 第三個 repo 增加 commit+push 的收尾步驟（可用 Obsidian git plugin 自動化）

**緩解方案**：
- 在 CLAUDE.md 加一行全局說明：「Layer 3 知識庫路徑：`~/obsidian-vault/nova/`，詳見 README.md」
- 在 skills/wording/SKILL.md 加入 vault pointer 標準格式
- 第一批遷移後跑一輪 behavioral eval 確認 AI 能正確找到背景資訊

### 7.3 「第四個知識位置」問題

Manager 的核心顧慮：「是否創造了第四個知識位置（CLAUDE.md + rules/ + skills/ + Obsidian）」

nb 的立場：**這個顧慮成立，但可以用正確定位化解**。

關鍵在於定位清晰：
- CLAUDE.md：Agent 自我描述（身份、目標、邊界）
- rules/：行為規範（條款，AI 執行時遵循）
- skills/：操作知識（how-to，AI 執行時查閱）
- Obsidian vault：背景知識（why，AI 解釋時查閱，人工瀏覽）

四層不是四個競爭的位置，而是四個不同的用途。真正的問題是「有沒有內容重複存在兩個位置」——只要遷移徹底（rules/ 動機段落真的刪掉，不留副本），就不會重複。

---

## 八、與現有元件的關係

### 8.1 與 spec/討論/ 的關係

spec/討論/ 目前兼具「進行中討論」和「完成決策歸檔」兩個用途，導致難以清理。

引入 Obsidian 後，建議：
- **進行中討論**：繼續留在 spec/討論/（nova-brain repo）
- **完成決策**：遷移至 Obsidian vault discussions/（nova-knowledge repo）
- `rules/品質/完成與閉環.md` 的「spec/完成/」歸檔步驟可改為「→ Obsidian discussions/」

### 8.2 與 memory/ 的關係

memory/feedback_*.md 目前是 nova-brain 專有的學習記錄，但不易檢索。

引入 Obsidian 後：
- 繼續維持 MEMORY.md（主記憶，200 行上限）
- feedback_*.md 遷移至 vault incidents/（有 graph view 幫助找關聯）
- MEMORY.md 的 Feedback 索引段改指向 vault 路徑

### 8.3 與 rules/品質/元件孵化.md 的關係

元件孵化規則需要追蹤元件歷史，目前靠 config/component-lifecycle.json。

Obsidian 的 component-history/ 可以存放人類可讀的元件演進故事，機器可讀的部分繼續留在 JSON，兩者互補。

---

## 九、採納建議

### 9.1 nb 的立場

**建議採納，但分 Phase 執行，Priority 如下：**

**P0（立即）**：建立 ryu111/nova-knowledge repo + vault 基本目錄結構，把本次討論文件（obsidian-cli-comprehensive.md）作為第一個 discussions/ 文件遷入，驗證 workflow。

**P1（本週）**：spec/討論/ 已完成討論 → 遷移至 vault discussions/，清理 spec/討論/ 只保留進行中。memory/feedback_*.md → vault incidents/。

**P2（下週）**：挑選 5-6 個最肥的 rules/（hook-discipline、owner-commit-discipline、peer-discussion-visibility）做背景段落抽離試點，驗證 AI 能正確用 vault pointer 找到背景知識。

**P3（兩週後）**：依評估結果決定是否全面推進 rules/ 瘦身。

### 9.2 不建議做的事

- 不要把 Obsidian 當 rules/ 的替代品——操作規範永遠在 Layer 1
- 不要把 vault 設成自動注入（違反 Layer 3 純按需讀取的定位）
- 不要在 Obsidian 裡寫新的 MUST/NEVER 條款（那屬於 rules/）
- Phase 2/3 遷移前不要急著刪除 rules/ 背景段落，先確認 AI 能找到 vault

### 9.3 成功判準

遷移成功的客觀證據：
1. `bun test`：測試數量不減少，全數通過
2. `bun tests/evals/structural/check.js`：8/8 通過
3. 被問「為什麼 hook 不能用 universal threshold」時，AI 能正確 Read vault incident 記錄並回答
4. rules/ 平均行數從目前 ~40 行降至 ~25 行（背景段落移走後）

---

## 十、結論

Obsidian vault 對 Nova 的最大價值不是「管理規則」，而是**建立一個真正的 Layer 3：背景知識的正式歸宿**。

現狀是：rules/ 承載了它不該承載的東西（60-70% 是背景知識）；skills/ 同樣混入了深層歷史說明；spec/討論/ 和 memory/ 有寶貴知識但無組織。這些內容每次都隨 Layer 1 注入，佔用 context 空間，卻在大多數任務中無用。

Obsidian 不創造新問題，它解決一個既有問題：**Layer 3 的空缺讓 Layer 1 和 Layer 2 必須兼職承載不屬於它們的內容**。

三層（rules/skills/vault）+ CLAUDE.md 是完整的四維知識組織，每維有明確邊界，不競爭，不重複。

---

*nb 撰寫於 2026-04-16，作為 xd-libu 回應*
