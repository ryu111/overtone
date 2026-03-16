# GitHub 自動化 — 技術設計

## 深度路由：D4
**理由**：3 個獨立 Skill 建立可完全並行（操作不同目錄、無檔案重疊），需要 planner 拆 phase + 3 個 executor 並行 + reviewer 品質審查。這是場景三的核心驗證 — 證明 Nova 能用 D4 並行架構從零建立跨領域能力。

---

## 技術摘要

- **方案**：人工撰寫 3 個高品質 SKILL.md + references/，再用 Judge + Acid Test 驗收
- **理由**：手動撰寫品質可控，比本地模型 forge 更可靠；同時保留 skill-forge 作為改善迴圈工具
- **取捨**：放棄全自動 forge（品質不穩定），換取 B 級品質保證

## 方案比較

| 維度 | 方案 A：手動撰寫 + Judge 驗收（選擇） | 方案 B：全自動 forge + improve 迴圈 |
|------|:----------------------------------:|:----------------------------------:|
| 品質可控度 | 高 — 人直接寫，確保 B 級 | 低 — 本地模型品質波動大 |
| 自動化程度 | 中 — 撰寫手動，驗收自動 | 高 — 全程自動 |
| 經驗遷移驗證 | 可 — 手動引用現有 Skill 知識 | 可 — detectCrossDomain 自動注入 |
| 7 天達成風險 | 低 — 3 天內完成 | 中 — improve 迴圈可能超時 |
| 場景三驗證完整度 | 高 — 涵蓋 D4 並行 + Judge + Acid Test | 更高 — 還涵蓋 forge 全流程 |
| **結論** | **選擇** — 穩定達成 7 天目標 | 備選 — 品質達標後可嘗試 |

方案 B 作為延伸目標：方案 A 完成後，嘗試用 forge 自動生成第 4 個 Skill 驗證全自動流程。

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | SKILL.md | `~/.claude/skills/pr-auto-review/` | ~120 | PR 自動審查知識域 |
| 2 | references/review-flow.md | `~/.claude/skills/pr-auto-review/references/` | ~80 | 審查流程詳細步驟 |
| 3 | references/gh-commands.md | `~/.claude/skills/pr-auto-review/references/` | ~40 | gh CLI PR 操作速查 |
| 4 | SKILL.md | `~/.claude/skills/issue-triage/` | ~120 | Issue 分類知識域 |
| 5 | references/triage-decision-tree.md | `~/.claude/skills/issue-triage/references/` | ~80 | 分類決策樹 |
| 6 | references/priority-matrix.md | `~/.claude/skills/issue-triage/references/` | ~50 | 優先序矩陣 |
| 7 | SKILL.md | `~/.claude/skills/release-notes/` | ~100 | Release Notes 生成知識域 |
| 8 | references/changelog-format.md | `~/.claude/skills/release-notes/references/` | ~60 | changelog 格式模板 |
| 9 | references/commit-classification.md | `~/.claude/skills/release-notes/references/` | ~40 | commit 分類規則 |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/agents/code-reviewer.md` | frontmatter skills 追加 `pr-auto-review` |
| 2 | `~/.claude/agents/executor.md` | frontmatter skills 追加 `issue-triage` |
| 3 | `~/.claude/agents/maintainer.md`（非 script） | frontmatter skills 追加 `release-notes`（若 agent 存在） |

### Skill 設計原則

3 個 Skill 都是**純知識域**（disable-model-invocation: true），遵循：
- 不直接呼叫 gh CLI — 只提供知識（何時用什麼命令、輸出怎麼解讀）
- 透過 agent frontmatter skills 注入
- 引用現有 Skill 而非複製（DRY）：
  - `pr-auto-review` 引用 `code-review` 的四維度框架
  - `issue-triage` 引用 `issue` 的 label 映射
  - `release-notes` 引用 `commit-convention` 的分類標準

### 跨領域經驗遷移設計

每個 Skill 的 SKILL.md 中加入「跨領域參考」章節，標注：
- Nova 開發中的**相似模式**（由 detectCrossDomain 或手動識別）
- 可遷移的**具體知識**（不只是「參考 xxx」，而是「從 xxx 學到 yyy」）

| 新 Skill | 相似模式 | 遷移自 | 遷移知識 |
|---------|---------|--------|---------|
| pr-auto-review | Read → Analyze → Grade → Report | code-review skill | 四維度框架 + 分級系統 + 信心過濾 |
| issue-triage | Read → Classify → Route → Act | issue skill + auto skill | label 映射 + 深度路由決策 |
| release-notes | Collect → Classify → Format → Publish | commit-convention skill | Conventional Commit 分類 + 模板格式 |

## 資料模型

- 儲存格式：無持久化。Skill 是靜態知識檔案，不產生運行時資料。
- 儲存位置：`~/.claude/skills/{name}/SKILL.md` + `references/`
- 清理策略：skill-janitor 定期健康度檢查

## 執行步驟

### Phase 0：環境預檢（sequential）

| 步驟 | 執行者 | 說明 |
|------|--------|------|
| 0.1 | Main | `gh auth status` 確認 gh CLI 可用 |
| 0.2 | Main | 確認 `bun ~/.claude/scripts/judge.js` 可執行 |
| 0.3 | Main | 確認 `bun ~/.claude/scripts/acid-test.js --help` 可執行 |

### Phase 1：3 個 Skill 建立（parallel — 3 executor）

每個 executor 獨立操作自己的 skill 目錄，無檔案重疊。

| 步驟 | Executor | 檔案 | 說明 |
|------|----------|------|------|
| 1A | executor-1 | `skills/pr-auto-review/` | 撰寫 SKILL.md + references/review-flow.md + references/gh-commands.md |
| 1B | executor-2 | `skills/issue-triage/` | 撰寫 SKILL.md + references/triage-decision-tree.md + references/priority-matrix.md |
| 1C | executor-3 | `skills/release-notes/` | 撰寫 SKILL.md + references/changelog-format.md + references/commit-classification.md |

**executor 注入 Skills**：
- executor-1：`[EXTRA_SKILLS: code-review, pr]` — 引用審查框架
- executor-2：`[EXTRA_SKILLS: issue, auto]` — 引用分類決策
- executor-3：`[EXTRA_SKILLS: commit-convention]` — 引用 commit 分類

**executor 指引**（每個 executor 收到的 prompt 包含）：
1. 讀取對應的現有 Skill（作為知識來源和格式參考）
2. 建立 `~/.claude/skills/{name}/` 目錄 + `references/` 子目錄
3. 撰寫 SKILL.md（遵循 skill-forge 的格式：frontmatter + 標題 + 消費者 + 速查 + 深度參考 + NEVER）
4. 撰寫 references/ 檔案
5. 在 SKILL.md 加入「跨領域參考」章節

### Phase 2：Judge 品質閘門（sequential — 串行評分 3 個 Skill）

| 步驟 | 執行者 | 說明 |
|------|--------|------|
| 2.1 | Main | `bun ~/.claude/scripts/judge.js score skill pr-auto-review` → 確認 >= 80 分（B 級）|
| 2.2 | Main | `bun ~/.claude/scripts/judge.js score skill issue-triage` → 確認 >= 80 分 |
| 2.3 | Main | `bun ~/.claude/scripts/judge.js score skill release-notes` → 確認 >= 80 分 |
| 2.4 | Main | 若任一未達標 → 讀取改善建議 → 委派 executor 修正 → 重新評分（最多 3 輪）|

### Phase 3：部署 + Agent 注入（sequential — 修改同一類型檔案）

| 步驟 | 執行者 | 說明 |
|------|--------|------|
| 3.1 | Main | 將 `pr-auto-review` 加入 code-reviewer agent 的 skills |
| 3.2 | Main | 將 `issue-triage` 加入 executor agent 的 skills |
| 3.3 | Main | 將 `release-notes` 加入適當 agent 的 skills |
| 3.4 | Main | `bun ~/.claude/scripts/tool-registry.js scan` 更新 tool-registry.json |

### Phase 4：Acid Test 端到端驗收（sequential）

| 步驟 | 執行者 | 說明 |
|------|--------|------|
| 4.1 | Main | `bun ~/.claude/scripts/acid-test.js --mock` 跑完整 6 Phase |
| 4.2 | Main | 確認所有 Phase 通過 |

### Phase 5：真實驗證（sequential）

| 步驟 | 執行者 | 說明 |
|------|--------|------|
| 5.1 | Main | 選一個真實 PR → 用 pr-auto-review 知識產出 review |
| 5.2 | Main | 選一個真實 Issue → 用 issue-triage 知識產出分類 |
| 5.3 | Main | 用最近 10 個 commit → 用 release-notes 知識產出 notes |

### Phase 6：審查（reviewer）

| 步驟 | 執行者 | 說明 |
|------|--------|------|
| 6.1 | reviewer（opus） | 審查 3 個 SKILL.md 品質（DRY、知識 delta、NEVER 區塊）|
| 6.2 | reviewer（opus） | 確認跨領域引用正確，無複製現有 Skill 內容 |
| 6.3 | reviewer（opus） | 確認 agent frontmatter 更新正確 |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | Skill 內容太泛（只是「用 gh CLI」而非具體知識 delta） | 中 | 高 | reviewer 審查 knowledge delta 充分性；每個 SKILL.md 必須有 3+ 個 Claude 不預設知道的具體知識點 |
| 2 | Judge 評分未達 B 級 | 中 | 中 | Phase 2 的 improve 迴圈（最多 3 輪）；手動修正作為 fallback |
| 3 | 跨領域偵測完全無匹配 | 低 | 低 | 手動在 SKILL.md 標注跨領域參考章節（不依賴 detectCrossDomain 自動結果）|
| 4 | 3 個 executor 並行寫入同一 agent file → 衝突 | 中 | 中 | Phase 3 deploy 步驟改為 sequential（Main 依序執行），不在 Phase 1 做 agent 注入 |
| 5 | Acid Test 的 seed 行為不匹配真實 Skill 結構 | 低 | 中 | Phase 4 前確認 Acid Test 可辨識手動建立的 Skill（非 forge 產出）|

**Pre-mortem 觸發重新設計的條件**：
- 無「高機率 + 高影響」情境 → 不觸發重新設計
- 情境 1（中+高）已有預防措施 → 可接受

## 測試策略

| 測試 | 驗收條件 |
|------|---------|
| Judge 評分 | 3 個 Skill 全部 >= 80 分（B 級）|
| Acid Test | 6 Phase 全部通過（--mock 模式）|
| 真實 PR review | 對 ryu111/overtone 任一 PR 產出 >= 1 個結構化 comment |
| 真實 Issue triage | 對 ryu111/overtone 任一 Issue 產出完整分類結果 |
| 真實 Release notes | 從最近 10 個 commit 產出分類後的 markdown |
| tool-registry | `tool-registry.json` 包含 3 個新 `skill:` 條目 |
| 跨領域偵測 | 至少 1 個 Skill 的模式被 detectCrossDomain 辨識 |

## 不做什麼

1. **不做 GitHub Actions 整合**：本次只建立知識型 Skill，CI/CD 整合是獨立且更大的需求（D3+）
2. **不做自動 merge/close**：安全敏感操作留給人類，本次 Skill 只提供「建議」不執行「動作」
3. **不做多 repo 泛化**：先聚焦 ryu111/nova 和 ryu111/overtone，泛化邏輯留後續
4. **不做全自動 forge**：方案 A 手動撰寫優先，全自動 forge 作為延伸目標

---

*建立日期：2026-03-16*
