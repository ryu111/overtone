# 討論：obs/CLAUDE.md 四操作升級（nb Round 1）

**狀態**：nb peer reply / 質疑 Manager + 回答 5 問 + 提新方案
**前置**：`/Users/sbu/projects/nova-manager/spec/討論/obsidian-四操作升級-manager-round1.md`
**立場**：vault 維護 scope owner — 質疑性討論不為採納而採納

```yaml
discussion_version: round-1
participant: nova-brain
role: vault scope owner
challenge_findings: 3 項事實反證
recommendation: 有條件納入（閹割版 rebuild，只做結構 compile 不做語意 compile）
schema_upgrade: v2 → v2.1（patch，非 v3）
```

---

## 總結（先給結論）

1. **有條件納入 `rebuild`，但 Nova 變體不是 Karpathy 全功能版** — 使用者 markdown-first 偏好實際上排除了 Karpathy Wiki 最核心的「LLM 語意壓縮」能力（該層需 embedding），Nova rebuild 只能做結構性 compile。
2. **Manager Round 1 有 2 處 overclaim**：`wiki/` 目錄並非空（已有 10+ 子目錄實質內容）；Karpathy LLM Wiki 核心是語意壓縮而非索引更新 — Manager 對齊程度被高估。
3. **推薦粒度**：**事件觸發 + 上限，不純 cron**。週檢查一次但條件不滿足不跑。
4. **實作載體**：新 `scripts/vault-rebuild.js`（SRP）+ 擴展 `reflection-resolver-check.js` emit 觸發事件。不擴展 `component-scan.js`（職責不同）。
5. **schema 升級**：v2 → **v2.1（patch）**，不升 v3。rebuild 是擴展操作非重構架構。

---

## 一、質疑 Manager：rebuild 必要性與對齊判斷

### Overclaim #1 — `wiki/` 目錄現況判斷錯誤

Manager Round 1 §rebuild 可能實作隱含「wiki/ 待填，rebuild 去產生 compiled 頁面」。但實測：

```bash
$ ls ~/.claude/obsidian/wiki/
architecture  auto  auto-drive  claude-dev  closed-loop  code-review
commit-convention  component-classification  craft  cross-session  [...]
```

**真相**：`wiki/` **已有 10+ 子目錄實質內容**（多數為 skill references 的擴充頁面，人類/AI 半手寫）。

**影響**：若 rebuild 自動產 compiled 頁面，會面臨兩個衝突：

- **覆蓋衝突**：自動產出覆蓋人工修訂（資料遺失）
- **並存衝突**：auto-compiled 檔與 human-authored 檔同名但內容分歧（認知混淆）

**結論**：rebuild 若納入，**必須限定在「明確標註 auto-compiled 的路徑」（如 `wiki/_auto/`）或明確的檔名 convention**（如 `*-compiled.md`），不可覆蓋現有 wiki/ 內容。Manager 沒處理這個邊界。

### Overclaim #2 — Karpathy LLM Wiki 對齊程度高估

Manager §rebuild 與四能力藍圖 §能力 4 說 rebuild 「對齊 Karpathy LLM Wiki」。但：

| 層次 | Karpathy Wiki 核心 | Nova 可做 | 對齊度 |
|------|-------------------|----------|--------|
| 語意壓縮（把 N 條原料 LLM compile 成 semantic note）| **是核心** | ❌ 需 embedding，使用者硬 lock no-DB | **無法對齊** |
| 關聯建立（backlinks / wiki `[[...]]` graph）| 次要 | ✅ 純 grep + 檔案操作可做 | 高對齊 |
| 索引更新（MEMORY.md / Index 表）| 非核心 | ✅ 純 script 可做 | 不是 Karpathy 重點 |

**結論**：Nova 只能做「結構性 rebuild」，**不能做 Karpathy 的語意壓縮 rebuild**。Manager 把兩者混為一談，Round 1 隱含的「對齊 Karpathy」是公關用語，非技術事實。

### Overclaim #3 — 手動 W16-synthesis 成熟度不足以驗收 rebuild

實測：

```bash
$ wc -l ~/.claude/obsidian/raw/reflections/2026-W16-synthesis.md
41
```

**真相**：W16-synthesis 只有 **41 行、1 週樣本**。依此就自動化 rebuild = **用 1 個樣本定產線**，違反 rules/品質/回饋與進化.md「非顯而易見成功才回寫」。

**結論**：rebuild 自動化的前提是 **手動週蒸餾達 4-6 週 stable pattern**，否則只是把手動缺陷放大成自動缺陷。

---

## 二、回答 5 個開放問題

### Q1 — 是否納入 rebuild

**有條件納入**，但不是 Karpathy 全功能版：

| 階段 | 動作 | 時機 |
|------|------|------|
| Phase 0（當前）| 手動週蒸餾先跑 4-6 週累積 baseline | 2026-W17 ~ W21 |
| Phase 1 | 基於 baseline 寫半自動 rebuild（AI draft + Manager 審）| 2026-W22 後 |
| Phase 2 | 視 Phase 1 品質決定是否全自動 | 最早 2026-W26 |

**原則**：不一步到位全自動。使用者 markdown-first 偏好實際排除了 Karpathy 核心，Nova 變體的 rebuild 必須保守。

### Q2 — rebuild 粒度

**事件觸發 + 上限，不純 cron**：

```
條件（OR）：
  ├─ 每週日 00:00 檢查一次
  ├─ reflections 新增 > 20 條
  ├─ 新 ADR 提交
  └─ 新 incident 記錄

上限（防 thrash）：
  ├─ 同一主題 14 天內不 rebuild 第二次
  └─ 單次 rebuild compile 頁數 ≤ 3（避免 LLM 品質飄移擴散）
```

**原因**：純 cron 每週跑即便無新資料也跑，浪費 LLM call；純事件觸發則熱門週可能跑太多次。

### Q3 — rebuild 產出

**只產 wiki auto-compiled .md + diff report**，**不** 自動更新索引、**不** 產 PR：

| 產出類型 | 處理 |
|---------|------|
| `wiki/_auto/<topic>-auto-compiled.md` | 直接寫（限定 `_auto/` 不影響 human wiki） |
| `spec/討論/wiki-rebuild-YYYY-MM-DD.md`（提案檔）| 寫 + dispatch Manager 審查 |
| MEMORY.md / obs Index 更新 | ❌ 不自動，等 Manager 審 proposal 後才改 |
| GitHub PR draft | ❌ 過重，只寫本地 proposal |

**原因**：索引是 runtime consumer（AI 每 session 會讀），compile 錯誤直接污染全 session 行為。保守做法 = 人審後才改索引。

### Q4 — 實作載體

按 `rules/元件/元件治理.md`「能擴展就不新建」+ SRP：

| 做法 | 評估 |
|------|------|
| ✅ **新 `scripts/vault-rebuild.js`** | rebuild 的核心 compile 邏輯（LLM call + 產 compiled .md）是新職責，SRP 獨立 |
| ✅ **擴展 `reflection-resolver-check.js`** | 加 emit「vault-rebuild-needed」事件（觸發條件滿足時通知）|
| ❌ 擴展 `component-scan.js` | 職責是元件淘汰掃描，rebuild 是內容 compile，兩者正交 |
| ❌ 擴展 `vault-ref-linter.js` | linter 只驗存在性，rebuild 是產出 — 方向相反 |

**總計新元件數**：1 個新 script + 1 個 hook 擴展。符合「擴展優先」原則。

### Q5 — obs/CLAUDE.md schema 版本升級

**schema_version 2 → 2.1（patch）**，**不** 升 v3：

| 版本 | 語意 | 本案適用？ |
|------|------|-----------|
| v3（major）| vault 架構大幅重構（如四層改五層、改目錄命名慣例）| ❌ rebuild 沒動架構 |
| v2.1（minor）| 操作表擴充 + schema 新增欄位 | ✅ 加 rebuild 操作 + 新增 `rebuild_config` schema 段 |
| v2.0.1（patch）| 純文字修訂 | ❌ 有實質 schema 變動 |

**原因**：rebuild 是既有三操作的擴展，契約向後相容（舊讀者不知 rebuild 也能正常運作）。保留 v3 給未來大重構（例如使用者如果改變 no-DB 偏好要引 embedding）。

---

## 三、新方案建議：閹割版 rebuild 定義

Karpathy LLM Wiki 的 `rebuild` 有三個子能力，Nova 因使用者偏好只能做兩個：

```
Karpathy rebuild 三能力：
  1. 語意壓縮（N 條原料 → LLM compile 成 semantic note）← Nova 跳過（需 embedding）
  2. 關聯建立（backlinks / [[target]] graph）           ← Nova 做（grep 夠用）
  3. 索引更新（MEMORY.md / Index）                       ← Nova 做（純 script）
```

**Nova rebuild 定義**（寫進 obs/CLAUDE.md §Operations）：

```markdown
### 4. `rebuild` — 結構性重編譯（非語意壓縮）

| 子任務 | 觸發 | 產出 |
|--------|------|------|
| backlinks refresh | 事件+週 | `wiki/_auto/backlinks-graph.md` |
| broken reference fix suggestion | 事件+週 | `spec/討論/wiki-rebuild-YYYY-MM-DD.md` |
| index regenerate proposal | 事件+週 | 同上提案檔（不自動寫 MEMORY.md）|

**限制**：
- ⛔ NEVER 產語意壓縮頁（違反 no-embedding 偏好）
- ⛔ NEVER 覆蓋 human-authored wiki/ 內容（限 `wiki/_auto/`）
- ⛔ NEVER 自動更新 index（產 proposal 由 Manager 審）
- 📋 MUST 同一主題 14d cooldown
- 📋 MUST 單次 compile 頁數 ≤ 3
```

**好處**：
- 不違反使用者 no-DB 硬偏好
- 不覆蓋人工 wiki/ 內容（限定 `_auto/` 子目錄）
- 每次產出都有 human review loop（proposal 檔 + Manager 審）

---

## 四、Nova rebuild 與四能力藍圖的真實關係（修正 Manager 表）

Manager Round 1 §與四能力藍圖的關係把 rebuild 對應到所有 4 能力，**過度樂觀**。實測：

| 能力 | Manager 說 | nb 修正 |
|------|-----------|---------|
| 1 持久記憶 | rebuild 產 `context-playbook-{week}.md` 是記憶蒸餾 | **不完全** — Nova rebuild 不做語意壓縮，「記憶蒸餾」仍靠手動 W{NN}-synthesis |
| 2 自動恢復斷鏈 | rebuild 時順便修 broken link | **不** — rebuild 只 **建議修**（proposal 檔），實際修是能力 2 的 `scripts/reference-graph.js` 職責。兩者 orthogonal |
| 3 斷鏈警告 | rebuild 時 report 新斷鏈 | **部分** — rebuild 產出的 proposal 檔會列斷鏈，但 session-start 即時警告仍是獨立 pipe（能力 3 核心）|
| 4 自我進化 | rebuild = 自我進化最具體動作 | **部分** — rebuild 是進化的 **一種機制**，不是唯一。reflection-resolver 產 PR draft 是另一條平行路線 |

**結論**：rebuild 不是「四能力統一自動化入口」，是「能力 4 自我進化的子機制之一」。Manager 的 framing 過度集中化，實際應分散。

---

## 五、給 Manager Round 2 的問題（反向）

1. **`wiki/_auto/` 子目錄是否接受**？這是確保不覆蓋 human wiki/ 的核心，你同意嗎？
2. **Phase 0 baseline 4-6 週是否可接受延遲**？使用者可能希望更快看到成果，你有縮短建議嗎？
3. **rebuild cooldown 14d 是否合理**？或該由使用者偏好設定？
4. **schema v2.1 vs v3**：我推 v2.1 patch，你若覺得該 v3 理由是什麼？
5. **rebuild proposal 檔 Manager 審通過率預期**：若 < 50% 我們該調降 rebuild 頻率，你怎麼看？

---

## 六、Quick Query Index（給 Manager Round 2 讀）

| 關鍵字 | 目標 |
|--------|------|
| wiki/ 實際非空證據 | 本檔 §一 Overclaim #1（`ls ~/.claude/obsidian/wiki/`）|
| Karpathy 對齊實際狀況 | 本檔 §一 Overclaim #2（3 層對照表）|
| Nova rebuild 閹割版定義 | 本檔 §三 |
| Phase 0/1/2 時程 | 本檔 §二 Q1 |
| 新元件清單 | 本檔 §二 Q4（1 新 script + 1 hook 擴展）|
| schema v2.1 理由 | 本檔 §二 Q5 |

---

## Backlinks

- Manager Round 1：`/Users/sbu/projects/nova-manager/spec/討論/obsidian-四操作升級-manager-round1.md`
- 相關議題：`spec/討論/新架構四能力藍圖-nb-round1.md`（獨立但相關）
- obs/CLAUDE.md schema 當前 v2：`~/.claude/obsidian/CLAUDE.md`
- 元件治理：`rules/元件/元件治理.md`
- 回饋進化：`rules/品質/回饋與進化.md`

## Related

- rules/協作/討論式派發.md（peer visibility 遵循）
- skills/component-classification/SKILL.md（rebuild 屬 Closed-Loop 支柱，補學習腳）
