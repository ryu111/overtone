# Design: testing knowledge domain skill

## 技術摘要（What & Why）

- **方案**：建立 `skills/testing/` knowledge domain skill，將 4 處散布的 BDD/testing 知識合併為單一 domain
- **理由**：目前 testing 知識散布在 `auto/references/`（2 個）、`test/references/`（2 個）、`ref-test-strategy/`（1 個獨立 skill），維護困難且新增 reference 時不知道放哪裡
- **取捨**：搬遷後所有消費者（6 個 SKILL.md + 1 個 agent）的引用路徑需更新，一次性成本可接受

## 架構決策

### Q1: test-strategy.md 格式

**決策**：直接搬入 `testing/references/test-strategy.md`，移除 frontmatter（`---` 區塊），保留原始 h1/h2 層級不降級。

**理由**：
- references/ 下的檔案不是獨立 SKILL.md，不需要 frontmatter
- 現有 `auto/references/` 和 `test/references/` 的檔案都沒有 frontmatter，保持一致
- h1/h2 層級與其他 reference 檔案一致（如 bdd-spec-guide.md 用 `#` 開頭），不需降級

### Q2: bdd-spec-samples.md 歸屬

**決策**：搬入 `testing/examples/bdd-spec-samples.md`（保持 examples/ 子目錄）。

**理由**：
- bdd-spec-samples.md 是 testing 知識的一部分，歸入 testing domain 語意正確
- test/SKILL.md 的引用會更新為新路徑
- 保持 examples/ 與 references/ 分離的既有模式（test skill 原本就這樣分）

### Q3: testing/SKILL.md 載入策略

**決策**：方案 a — SKILL.md 只放摘要索引 + 引用路徑。

**理由**：
- 5 個 reference 加起來 668 行，全部內嵌會佔用大量 agent context
- tester agent 是 sonnet model（maxTurns: 50），context 珍貴
- 現有 pattern 已是索引式：pm/SKILL.md 有 5 個 reference 但只放路徑（`💡 ... 讀取 ...`）
- agent `skills` frontmatter 自動載入 SKILL.md 全文，索引式設計讓載入成本低（~50 行）

**SKILL.md frontmatter 設計**：
```yaml
---
name: testing
description: Testing knowledge domain。統整 BDD 方法論、測試策略、測試慣例等測試知識，供 tester 和 qa agent 預載。
disable-model-invocation: true
user-invocable: false
---
```

- `disable-model-invocation: true`：knowledge domain skill 不需要 model 自動呼叫
- `user-invocable: false`：不對使用者公開（由 agent skills frontmatter 自動載入）

### Q4: 測試新增範圍

**決策**：在 `tests/unit/platform-alignment-skills.test.js` 新增一個 describe block，驗證：
1. `testing/SKILL.md` 存在且 frontmatter 正確（name、disable-model-invocation、user-invocable）
2. `testing/references/` 下 5 個檔案皆存在
3. `testing/examples/bdd-spec-samples.md` 存在
4. 舊路徑 `ref-test-strategy/` 目錄已刪除
5. 舊路徑 `test/references/`、`test/examples/` 已清理（目錄或檔案不存在）

## 檔案結構

### 新增檔案

```
plugins/overtone/skills/testing/
  SKILL.md                          # knowledge domain skill 索引
  references/
    bdd-spec-guide.md               # 搬移自 auto/references/bdd-spec-guide.md
    test-scope-dispatch.md           # 搬移自 auto/references/test-scope-dispatch.md
    bdd-methodology.md              # 搬移自 test/references/bdd-methodology.md
    testing-conventions.md           # 搬移自 test/references/testing-conventions.md
    test-strategy.md                 # 內容搬移自 ref-test-strategy/SKILL.md（去掉 frontmatter）
  examples/
    bdd-spec-samples.md             # 搬移自 test/examples/bdd-spec-samples.md
```

### 刪除檔案/目錄

```
plugins/overtone/skills/ref-test-strategy/          # 整個目錄刪除
plugins/overtone/skills/test/references/             # 整個目錄刪除
plugins/overtone/skills/test/examples/               # 整個目錄刪除
```

### 修改檔案（引用路徑更新）

| 檔案 | 修改內容 |
|------|---------|
| `plugins/overtone/agents/tester.md` (L8-9) | `skills:` 從 `ref-test-strategy` 改為 `testing` |
| `plugins/overtone/agents/qa.md` | 新增 `skills:` frontmatter，值為 `testing` |
| `plugins/overtone/skills/auto/SKILL.md` (L93) | `test-scope-dispatch.md` 路徑改為 `testing/references/` |
| `plugins/overtone/skills/auto/SKILL.md` (L100) | `bdd-spec-guide.md` 路徑改為 `testing/references/` |
| `plugins/overtone/skills/standard/SKILL.md` (L100) | `bdd-spec-guide.md` 路徑改為 `testing/references/` |
| `plugins/overtone/skills/full/SKILL.md` (L124) | `bdd-spec-guide.md` 路徑改為 `testing/references/` |
| `plugins/overtone/skills/secure/SKILL.md` (L105) | `bdd-spec-guide.md` 路徑改為 `testing/references/` |
| `plugins/overtone/skills/refactor/SKILL.md` (L78) | `bdd-spec-guide.md` 路徑改為 `testing/references/` |
| `plugins/overtone/skills/test/SKILL.md` (L27-28) | 兩個引用路徑改為 `testing/references/` 和 `testing/examples/` |
| `tests/unit/platform-alignment-skills.test.js` | 新增 testing skill 驗證 + 更新 ref-test-strategy 相關斷言 |

## API 介面設計

不涉及 API — 純檔案搬遷和引用更新。

## SKILL.md 內容設計

```markdown
---
name: testing
description: Testing knowledge domain。統整 BDD 方法論、測試策略、測試慣例等測試知識，供 tester 和 qa agent 預載。
disable-model-invocation: true
user-invocable: false
---

# Testing Knowledge Domain

本 skill 統整 Overtone 的所有測試知識，作為 tester 和 qa agent 的預載知識庫。

## 快速索引

| 主題 | 檔案 | 用途 |
|------|------|------|
| BDD 行為規格指南 | references/bdd-spec-guide.md | GIVEN/WHEN/THEN 語法、spec/verify 雙模式、安全 BDD |
| BDD 完整方法論 | references/bdd-methodology.md | 宣告式寫法、Scenario Outline、Tag 分類、反模式 |
| 測試策略五階段 | references/test-strategy.md | Assess-Run-Improve-Validate-Report、flaky test、優先級 |
| 測試操作規範 | references/testing-conventions.md | 目錄結構、paths.js、命名規範、spec/verify 模式細節 |
| Test Scope 動態調度 | references/test-scope-dispatch.md | developer Handoff 的 Test Scope 區塊解析規則 |

## 範例

| 主題 | 檔案 | 用途 |
|------|------|------|
| BDD Spec 範例 | examples/bdd-spec-samples.md | CRUD、認證、錯誤處理三類完整範例 |

## 按需讀取

上述檔案不會自動載入。根據任務需要，使用以下路徑讀取：

- 撰寫 BDD spec 時：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md`
- BDD 最佳實踐：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-methodology.md`
- 測試執行策略：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-strategy.md`
- 操作規範和慣例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/testing-conventions.md`
- Test Scope 調度：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-scope-dispatch.md`
- BDD spec 範例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/examples/bdd-spec-samples.md`
```

## 關鍵技術決策

### 決策 1：knowledge domain skill vs. 純目錄

- **選擇 knowledge domain skill**：有 SKILL.md + frontmatter，可被 agent `skills` 欄位引用自動載入
- **未選純目錄**：無法透過 agent frontmatter 自動載入索引，每次都要手動指定路徑

### 決策 2：索引式 vs. 內嵌式 SKILL.md

- **選擇索引式**（~50 行）：agent 啟動時只載入索引，按需讀取 reference，節省 context
- **未選內嵌式**（~700 行）：agent context 珍貴，全部內嵌浪費；且 reference 更新時 SKILL.md 不需同步修改

### 決策 3：bdd-spec-samples.md 歸屬

- **選擇歸入 testing/**：testing domain 是 BDD 知識的統一入口
- **未選留在 test/**：會造成知識散布（test/ 是 workflow skill，testing/ 是 knowledge domain）

### 決策 4：qa agent 新增 skills 欄位

- **選擇新增**：qa 做行為驗證時需要 BDD 知識（對照 BDD spec 驗證），載入 testing 索引合理
- **qa.md 需新增 frontmatter**：`skills:\n  - testing`

## 實作注意事項

- `ref-test-strategy/` 刪除前確認 tester.md 已更新 skills 欄位，否則 agent 啟動會找不到 skill
- `test/references/` 和 `test/examples/` 刪除後，`test/SKILL.md` 的引用路徑必須先更新
- platform-alignment 測試中 `ref-test-strategy` 的存在性測試需改為**不存在**斷言
- 搬遷時檔案內容不做任何修改（除 test-strategy.md 去 frontmatter 外），確保語意不變
