# GitHub 自動化 — 場景三第一個跨領域任務

## 動機（Why）

- **問題**：場景三「新領域從零到穩定 < 7 天」是最後一個未通過的 E2E 達成條件。目前 4/5 已通過（D4 路由、跨領域偵測、經驗遷移、Acid Test），僅剩「真實跨領域任務」未驗證。
- **目標**：用 GitHub 自動化作為第一個真實跨領域，建立 3 個 Skill（pr-auto-review、issue-triage、release-notes），全部通過 Judge B 級品質閘門 + Acid Test 端到端驗證。
- **不做的代價**：場景三永遠停在 4/5，無法證明 Nova 具備「從零到穩定」的跨領域能力。R4 進度被阻塞。

## 範圍

### In-scope

- 3 個新 Skill 的完整建立、評分、部署流程
  - `pr-auto-review`：自動化 PR 審查流程（讀取 diff → 結構化分析 → 產出 review comment）
  - `issue-triage`：Issue 自動分類與優先序判定（讀取 issue → 分類 → 建議 label/assignee/深度）
  - `release-notes`：自動生成版本發行說明（讀取 git log → 分類變更 → 產出結構化 notes）
- 利用 `detectCrossDomain` 遷移 Nova 開發經驗到 GitHub 領域
- 每個 Skill 通過 Judge B 級（>= 80 分）品質閘門
- Acid Test 端到端驗收（seed → forge → judge → deploy → verify → cleanup）
- 用 `gh` CLI + Bash 組合，不需新 MCP

### Out-of-scope

- GitHub Actions / CI-CD 整合（獨立需求，不屬於本次）
- GitHub Webhook 即時觸發（本次用手動或心跳觸發）
- 跨 repo 操作（本次只操作 ryu111/nova 和 ryu111/nova-brain）
- PR merge 自動化（安全敏感，留給人類決策）
- Issue 自動關閉（需更多驗證策略）

## 使用者故事

1. 身為 Nova Main Agent，我想要在收到 PR review 請求時，自動讀取 diff 並產出結構化審查回饋，以便減少人工審查時間。

2. 身為 Nova Main Agent，我想要在新 Issue 建立時，自動分類其類型、嚴重程度、建議深度路由，以便心跳引擎能自動接手處理。

3. 身為 Nova Maintainer，我想要在版本發佈時，自動從 git log 生成結構化的 release notes，以便使用者清楚知道每個版本的變更。

## 行為規格

### 正常路徑

#### pr-auto-review

1. 接收 PR 編號 → `gh pr diff <n>` 取得 diff
2. `gh pr view <n> --json title,body,labels,files` 取得 metadata
3. 按 code-review skill 四維度分析 diff
4. 產出分級 review comments（MUST/SHOULD/COULD/NIT）
5. 用 `gh pr review <n> --comment --body "<review>"` 提交

#### issue-triage

1. 接收 Issue 編號 → `gh issue view <n> --json title,body,labels,comments`
2. 分析 Issue 內容：分類（bug/feature/question/docs）
3. 評估嚴重程度（P0-P3）和建議深度（D0-D4）
4. 建議 labels 和 assignee
5. 用 `gh issue edit <n> --add-label "<label>"` 更新

#### release-notes

1. 接收版本範圍 → `git log <from>..<to> --oneline`
2. 分類每個 commit：feat/fix/refactor/docs/chore
3. 按 Conventional Commit 格式整理
4. 產出結構化 release notes（Breaking Changes / Features / Fixes / Others）
5. 用 `gh release create <tag> --notes "<notes>"` 發佈

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| gh CLI 未認證 | 停止，輸出 `gh auth login` 指引 |
| PR/Issue 不存在 | 回傳 NOT_FOUND，不執行 |
| diff 超過 3000 行 | 截斷至前 3000 行，標註「部分審查」 |
| git log 為空 | 回傳空 release notes，不建 release |
| gh API rate limit | 等待 60 秒重試 1 次，仍失敗則停止 |

### 邊界條件

- 空 diff PR（只改文件） → 跳過 code quality 維度，只審查 content
- 無 label 的 Issue → 預設分類為 `question`，深度 D0
- 單一 commit 範圍 → release notes 仍正常生成
- 同一 PR 重複審查 → 檢查是否已有 review，有則更新而非新增

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| target | string | 是 | PR 編號 / Issue 編號 / 版本範圍 |
| repo | string | 否 | 預設當前 repo |

### 輸出

#### pr-auto-review 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| comments | array | `{level, file, line, message, why, fix}` |
| summary | string | 整體評估摘要 |
| verdict | string | approve / request-changes / comment |

#### issue-triage 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| type | string | bug / feature / question / docs |
| priority | string | P0-P3 |
| suggestedDepth | string | D0-D4 |
| suggestedLabels | array | 建議 labels |
| suggestedAssignee | string | 建議 assignee |

#### release-notes 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| version | string | 版本號 |
| sections | object | `{breaking, features, fixes, others}` |
| markdown | string | 完整 markdown 格式 |

### 儲存

- 格式：無持久化（每次即時生成）
- 位置：N/A（直接寫入 GitHub）

## 介面契約

3 個 Skill 都是知識域（disable-model-invocation: true），不直接呼叫。透過 Agent 注入使用。

消費方式：
- `pr-auto-review`：由 code-reviewer agent 消費（擴展現有 code-review skill）
- `issue-triage`：由 executor agent 消費（擴展現有 issue skill）
- `release-notes`：由 maintainer agent 消費（新增能力）

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 單次 PR review < 30 秒（不含 AI 推理時間） |
| 效能 | 單次 Issue triage < 10 秒 |
| 效能 | Release notes 生成 < 15 秒 |
| 安全 | 不在 review comment 中暴露內部路徑 |
| 相容性 | 支援 ryu111/nova 和 ryu111/nova-brain 兩個 repo |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | `cli:gh` | GitHub CLI — PR/Issue/Release 操作 |
| 上游 | `cli:git` | git log — release notes 資料來源 |
| 上游 | `skill:code-review` | 四維度審查框架 — pr-auto-review 引用 |
| 上游 | `skill:issue` | Issue 處理流程 — issue-triage 擴展 |
| 上游 | `skill:pr` | PR 建立知識 — pr-auto-review 引用 |
| 上游 | `skill:commit-convention` | Conventional Commit 規格 — release-notes 分類依據 |
| 上游 | `script:skill-forge` | forgeSkill + improveSkill + deploySkill |
| 上游 | `script:judge` | 品質評分 |
| 上游 | `script:acid-test` | 端到端驗收 |
| 上游 | `script:learner` | detectCrossDomain 經驗遷移 |
| 下游 | code-reviewer agent | 消費 pr-auto-review |
| 下游 | executor agent | 消費 issue-triage |
| 下游 | maintainer agent | 消費 release-notes |

## 驗收標準

- [ ] 3 個 Skill SKILL.md 存在於 `~/.claude/skills/` 且有完整 frontmatter
- [ ] 每個 Skill 有 `references/` 目錄（含 checklist 或流程參考）
- [ ] `pr-auto-review` 能對真實 PR 產出結構化 review（至少 1 個 MUST/SHOULD/COULD）
- [ ] `issue-triage` 能對真實 Issue 產出分類 + 優先序 + 深度建議
- [ ] `release-notes` 能從 git log 產出分類後的 markdown release notes
- [ ] 3 個 Skill 全部通過 Judge B 級（>= 80 分）品質閘門
- [ ] Acid Test 端到端通過（seed → forge → judge → deploy → verify → cleanup）
- [ ] `detectCrossDomain` 至少偵測到 1 個跨領域相似模式
- [ ] 整個流程（從零到 3 個 Skill 部署完成）在 7 天內完成
- [ ] tool-registry.json 包含 3 個新 Skill 條目

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| gh CLI 認證過期 | 低 | 高 | 執行前 `gh auth status` 預檢 |
| 本地模型生成品質不足 | 中 | 中 | 用 Claude API 作為 fallback；手動撰寫 SKILL.md 替代 forge |
| Judge 評分未達 B 級 | 中 | 中 | improveSkill 改善迴圈（最多 3 輪）|
| 跨領域偵測 similarity 不足 | 低 | 低 | 調整 threshold 或手動標注 crossDomainMatches |
| 3 個 Skill 修改同一 agent → 衝突 | 中 | 中 | 每個 executor 操作不同 agent，或 deploy 步驟序列化 |
