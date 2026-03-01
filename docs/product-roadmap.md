# Overtone Product Roadmap

> 最後更新：2026-03-01 | 當前 Phase：2（外部驗證）

## 產品定位

> **Overtone — 裝上 Claude Code，就像有了一個開發團隊。**

## Phase 總覽

| Phase | 名稱 | 目標 | 狀態 |
|:-----:|------|------|:----:|
| 0 | 地基穩固 | 核心 pipeline 真的能用 | ✅ 完成 |
| 1 | 首次體驗 | 新使用者 5 分鐘內上手 | ✅ 完成 |
| 2 | 外部驗證 | 取得 5-10 個外部使用者回饋 | 🔵 進行中 |
| 3 | 成長方向 | 根據 Phase 2 回饋決定 | ⚪ 未定義 |

---

## 技術 Roadmap：核心強化

> 與 Phase 2 外部驗證**平行進行**的技術路線，目標是提升系統穩定性和效率。

### 優先順序

| 順序 | 模組 | 說明 | 狀態 |
|:----:|------|------|:----:|
| 1 | 核心強化 | 平台對齊 + 自動偵測 + 平台追蹤 | 🔵 進行中 |
| 2 | Dashboard | UI 強化、使用體驗 | ⚪ Pending |
| 3 | Remote | EventBus + Adapter 擴展 | ⚪ Pending |

### 核心強化

| 階段 | 名稱 | 說明 | 狀態 |
|:----:|------|------|:----:|
| S1 | 盤點遷移 + 效率優化 | 5 項平台能力採用 + Config API 統一設定管理（v0.20.0 + v0.21.0） | ✅ 完成 |
| S2 | 自動偵測機制 | health-check 新增 platform-drift 偵測項（第 6 項） | ✅ 完成 |
| S3 | 平台差異追蹤 | platform.md 標注 adopted/evaluated/n-a 狀態，增量式追蹤 | ✅ 完成 |
| S4 | 全面能力評估 | 9 項 ⚡ 能力 RICE 評估：4 採用 / 4 延後 / 1 不採用 | ✅ 完成 |
| S5 | Effort Level 分層 | 按 agent model 設定 thinking 深度（haiku:low / sonnet:medium / opus:high） | ✅ 完成 |
| S6 | Skill 動態注入 | `!`command`` 取代部分 on-submit hook 注入 workflow state | ✅ 完成 |
| S7 | TaskCompleted Hook | Task 完成前品質門檻硬阻擋（test pass + lint clean） | ✅ 完成 |
| S8 | Opusplan 混合模式 | planner 試點 Opus 規劃 + Sonnet 執行，降成本 | ✅ 完成 |
| S9 | 保留項目 | Worktree isolation、prompt/agent hook、sonnet[1m] 1M context | ⏳ 保留 |
| S10 | Agent Memory | 5 個 opus 判斷型 agent 啟用 `memory: local`（v0.23.0） | ✅ 完成 |
| S11 | CLAUDE.md 精簡 + argument-hint | SoT 引用取代重複內容（198→121 行，省 77 行）+ 3 skill argument-hint | ✅ 完成 |
| S12 | 音效通知 | macOS afplay 系統音效 — sound.js + Notification hook + error.flag 恢復偵測（v0.24.0） | ✅ 完成 |
| S13 | Status Line | CLI 底部雙行即時顯示 — workflow/agent + ctx%/5h/7d 用量 + compact 計數 + ANSI 變色警告（v0.25.0） | ✅ 完成 |
| S14 | Strategic Compact | SubagentStop hook 於 stage pass 時檢查 transcript 大小，超過閾值自動建議壓縮 + emit timeline 事件（v0.26.0） | ✅ 完成 |
| S15 | CBP 最佳實踐對齊 | `/ot:commit` utility skill + code-reviewer 四維度審查（Anthropic 官方 CBP 交叉比對啟發） | ⚪ 計畫中 |
| S16 | Agent Prompt 強化 | 16 個 agent 加上 `description` frontmatter + `<example>` 路由範例（CBP 啟發的備援路由信號） | ⚪ 計畫中 |
| S17 | 測試覆蓋率分析 | tester agent 覆蓋率分析能力（待 Bun 覆蓋率工具鏈成熟度驗證） | ⏳ 保留 |
| S18 | CI 環境感知 | Hook `isCI()` 守衛 + PR Auto-Review yaml + PR Security Scan yaml（GitHub Actions 整合，與 Phase 2 平行推進） | ⚪ 計畫中 |

### S15 詳細項目（CBP 最佳實踐對齊）

> 來源：Anthropic 官方 `awattar/claude-code-best-practices` 交叉比對分析

| # | 項目 | 類型 | 說明 | RICE |
|---|------|:----:|------|:----:|
| 15a | `/ot:commit` utility skill | 新 skill | diff 分析 + 拆分判斷 + conventional commit 自動化。引用 `ref-commit-convention`。workflow 外的快速 commit 工具 | 18.0 |
| 15b | code-reviewer 四維度審查 | prompt 增強 | Code Quality / Security / Performance / Observability 結構化審查。frontmatter 引用 `ref-pr-review-checklist`。Handoff 按維度分類 | 14.0 |

**已完成前置**：
- [x] `ref-commit-convention` reference skill 建立（v0.27.1）
- [x] `ref-pr-review-checklist` reference skill 建立（v0.27.1）
- [x] `ref-test-strategy` reference skill 建立（v0.27.1）
- [ ] ~~`ref-agent-prompt-patterns` reference skill~~ — 已刪除（v0.27.2），延後至 S16 決定
- [x] `.github/ISSUE_TEMPLATE/` + `pull_request_template.md` 建立

**排除項目**（RICE 過低或風險過高）：
- ~~CI/CD Hook 整合（RICE 0.33）~~ → 升級為 S18（Claude Code GitHub Actions 成熟度提升，重新評估 RICE 為 2.4）
- Scratchpad 模式（RICE 0.5，與 timeline.jsonl + Instinct 功能重疊）

### S16 詳細項目（Agent Prompt 強化）

> 來源：CBP 的 agent description `<example>` 路由技巧

| # | 項目 | 類型 | 說明 |
|---|------|:----:|------|
| 16a | Agent description frontmatter | prompt 增強 | 為 16 個 agent 加上 `description` + 1-2 個 `<example>` 路由範例，作為確定性映射的備援信號 |
| 16b | Agent prompt 六要素模板 | 關聯 | Agent prompt 寫作時參照六要素（Identity/Expertise/Methodology/Standards/Context/Examples）。ref-agent-prompt-patterns 已刪除（v0.27.2），S16 實作時重新決定知識載體 |

### S18 詳細項目（CI 環境感知）

> 來源：Claude Code GitHub Actions 能力分析 + Overtone agent prompt 資產復用
> 架構：方案 A（Full Plugin 載入），CI 中安裝完整 Overtone plugin，hooks 偵測 `$CLAUDE_CODE_REMOTE` 自動切換行為
> 定位：與 Phase 2 外部驗證平行推進，「裝上就有自動 PR review + 安全掃描」作為推廣賣點

| # | 項目 | 類型 | 說明 | 優先級 |
|---|------|:----:|------|:------:|
| 18a | `isCI()` 基礎設施 | hook 改造 | hook-utils.js 新增 `isCI()` 函式，on-start/on-stop/notification 加入 CI guard（跳過 Dashboard、StatusLine、音效、Loop） | Must |
| 18b | PR Auto-Review workflow | 新 yaml | `.github/workflows/pr-review.yml` — PR opened/sync 觸發，用 code-reviewer prompt + ref-pr-review-checklist 審查，inline comment 輸出 | Must |
| 18c | PR Security Scan workflow | 新 yaml | `.github/workflows/security-scan.yml` — PR opened/sync 觸發，用 security-reviewer prompt + OWASP 掃描，按嚴重度分類 | Must |
| 18d | CI Failure Analysis workflow | 新 yaml | CI 失敗 → 分析 log → 修復建議 comment | Should（Phase 3） |
| 18e | Doc Sync Check workflow | 新 yaml | 程式碼路徑變更 → 文件同步提醒 | Should（Phase 3） |
| 18f | @claude Interactive workflow | 新 yaml | PR/Issue 中 `@claude` → 互動回應 | Could（Phase 3） |
| 18g | Issue Auto-Triage workflow | 新 yaml | Issue 建立 → 自動分類 + 標籤 | Could（Phase 3） |

**影響範圍**：
- Overtone 18 個 workflow 模板 → **零影響**（CI 用 GitHub Actions yml，不佔 Overtone 配額）
- Hook 行為 → **微量改動**（4 個 hook 加 `isCI()` guard，核心邏輯不變）
- Agent prompt → **零改動**（CI 復用相同的 agent .md）
- 估計工作量：Must 項目 2-3 天

### S1 詳細項目

| # | 項目 | 類型 | 現況 → 目標 |
|---|------|:----:|-------------|
| 1a | `disallowedTools` | 遷移 | `tools` 白名單 → `disallowedTools` 黑名單（更簡潔、更可維護） |
| 1b | Agent `skills` 預載 | 新能力 | Agent 自行讀 reference → frontmatter `skills` 自動載入 |
| 1c | PreToolUse `updatedInput` | 新能力 | Main Agent 手動組裝 context → hook 自動注入 workflow state |
| 1d | `SessionEnd` hook | 新 hook | session 結束無通知 → 第 8 個 hook，完善生命週期 |
| 1e | `PostToolUseFailure` | 新 hook | tool 失敗無監控 → 第 9 個 hook，錯誤偵測回饋 |

---

## Phase 2: Validation（外部驗證）

**目標**：取得 5-10 個外部使用者的回饋，驗證「全自動 pipeline」是否真的是使用者想要的。

### Entry Criteria

- [x] Phase 0 + Phase 1 完成

### 核心工作

| # | 任務 | 說明 | 狀態 |
|---|------|------|:----:|
| 2-0 | 非 Overtone 專案實戰 | 在外部專案上用 standard workflow 完成一個真實功能（從 Phase 1 降級） | ⚪ |
| 2-1 | 發文推廣 | 在 r/ClaudeAI 或 Twitter/X 發文介紹 | ⚪ |
| 2-2 | 收集回饋 | 記錄安裝成功率、首次使用體驗、功能回饋 | ⚪ |
| 2-3 | 根據回饋決定 Phase 3 方向 | 分析回饋數據，定義下一階段目標 | ⚪ |

### 成功指標

| 指標 | 目標值 |
|------|--------|
| GitHub stars | ≥ 10 |
| 外部使用者完成安裝 | ≥ 3 人 |
| 首次使用者完成率（quick workflow） | ≥ 60% |
| 7 天留存率 | ≥ 30% |

### Exit Criteria

- [ ] 有外部回饋數據
- [ ] Phase 3 方向已決定

---

## Phase 3: Growth（成長方向）

**目標**：根據 Phase 2 回饋決定。本 Phase 的具體內容現在不定義。

| 可能方向 | 觸發條件 |
|---------|---------|
| 深化自動化 | 回饋：「自動化很棒但不夠穩」 |
| 簡化入門 | 回饋：「太複雜了，只想用 quick」 |
| 擴展平台 | 回饋：「想自己加 agent」 |
| 重新定位 | 回饋：「我不需要全自動」 |

---

## 分工模型（RACI）

| 角色 | 是誰 | 核心職責 |
|------|------|---------|
| **Product Owner** | 使用者 | 願景、最終決策、Go/No-Go、優先順序 |
| **PM Agent** | product-manager | 分析、建議、結構化、追蹤、drift 偵測 |
| **Architect** | architect agent | 技術可行性、架構決策 |
| **Developer** | developer agent | 實作 |

### RACI 矩陣

| 決策領域 | Product Owner | PM Agent | Architect | Developer |
|---------|:---:|:---:|:---:|:---:|
| 產品願景和定位 | **A/R** | C | I | I |
| 功能優先順序 | **A** | R | C | I |
| Go/No-Go 決策 | **A/R** | C | C | I |
| 需求探索和釐清 | C | **A/R** | I | I |
| 方案比較和分析 | A | **R** | C | I |
| MVP 範圍定義 | A | **R** | C | I |
| 成功指標設定 | A | **R** | I | I |
| 技術架構 | I | I | **A/R** | C |
| 實作細節 | I | I | C | **A/R** |
| Drift 偵測 | I | **A/R** | I | I |

> R=執行 A=當責 C=諮詢 I=通知

### 協作流程

```
使用者有新想法
    ↓
[1] 使用者描述需求（可以很模糊）
    ↓
[2] PM Agent: 五層追問 → 釐清問題 → 產出 Product Brief
    ↓
[3] 使用者: 確認/修改 Brief（Go/No-Go 決策點）
    ↓
[4] PM Agent: 建議 workflow 類型
    ↓
[5] Pipeline 自動執行: PLAN → ARCH → DEV → TEST → ...
    ↓
[6] PM Agent: 完成後 drift 偵測 — 交付物是否對齊原始目標？
```

**關鍵原則**：

- 使用者不需要懂產品管理理論。PM Agent 自動使用 RICE/MoSCoW/Kano，使用者只需回答「你想解決什麼問題」和「這方向對嗎」
- 使用者保留所有最終決策權。PM Agent 永遠是 advisory 角色
- 使用者可以隨時推翻 PM 的建議

---

## 失真防護

### 檢測清單（每次開發前自問）

| 檢查項 | 問題 | 失真信號 |
|--------|------|----------|
| 動機測試 | 這個功能是因為有人需要，還是因為我可以做？ | 答不出具體使用場景 |
| 複雜度測試 | 這會讓 Main Agent 的 SKILL.md 變長嗎？ | auto/SKILL.md 超過 120 行 |
| 外部驗證 | 有沒有任何非我本人的人要求過這個功能？ | 所有功能都是自己想的 |
| 10 次測試 | 這個 workflow 我連跑 10 次，成功幾次？ | 成功率低於 80% |

### 量化指標上限

| 指標 | 當前值 | 上限 |
|------|--------|------|
| auto/SKILL.md 行數 | 105 行 | ≤ 120 行 |
| Workflow 模板數 | 18 個 | ≤ 20 個 |
| Agent 數量 | 17 個 | 凍結，不新增 |
| Skill 數量 | 38 個（含 3 ref-*） | 無明確上限 |
| Reference Skill 數量 | 3 個 | 無明確上限 |

---

## 文件索引

| 文件 | 職責 | 更新頻率 |
|------|------|---------|
| `docs/product-brief.md` | 產品定位、目標用戶、差異化、MVP 範圍 | 每次 Phase 完成時 |
| `docs/product-roadmap.md` | Phase 計劃、成功指標、進度追蹤 | 每次 Phase 進入/退出時 |
| `docs/status.md` | 版本狀態、核心指標、近期變更 | 每次版本發布 |
| `docs/spec/overtone.md` | 技術規格索引 | 架構變更時 |

---

## 歷史記錄

<details>
<summary>Phase 0: Foundation（地基穩固）— ✅ 完成</summary>

**目標**：確認核心 pipeline 真的能用。507 個 tests 測的是「元件能跑」，不是「pipeline 好用」。

### Entry Criteria

- [x] v0.17.0 完成

### 核心工作

| # | 任務 | 說明 | 狀態 |
|---|------|------|:----:|
| 0-1 | single workflow 驗證 | 目標 ≥ 4 次，含至少 1 次「新功能」類型 | ✅ 4/4（100%） |
| 0-2 | quick workflow 驗證 | 目標 ≥ 5 次，含至少 1 次「新功能」類型 | ✅ 5/5（100%） |
| 0-3 | standard workflow 驗證 | 目標 ≥ 6 次，含至少 1 次「新功能」類型 | ✅ 6/6（100%） |
| 0-4 | 修復路由/Loop/Hook 問題 | 根據 0-1~0-3 發現的問題逐一修復 | ✅（9 次 0 問題） |
| 0-5 | auto/SKILL.md 認知負荷控制 | 確保 ≤ 120 行，必要時分層載入 | ✅ |

### 驗證記錄

| # | 日期 | Workflow | 任務 | 結果 | 人工介入 | 備註 |
|---|------|----------|------|:----:|:--------:|------|
| 1 | 2026-02-28 | standard | dashboard-duplicate-spawn-fix | ✅ 完成 | 0 次 | PM discovery → standard 全流程。599 tests pass，+11 新測試 |
| 2 | 2026-02-28 | standard | instinct-observation-quality | ✅ 完成 | 0 次 | 6 項品質改進（emit 飽和、code fence、agent_performance、workflow_routing、search-tools、confidence-scoring）。626 tests pass，+27 新測試 |
| 3 | 2026-02-28 | quick | specs-auto-archive-fix | ✅ 完成 | 0 次 | readTasksCheckboxes() Dev Phases 排除修復 + 歷史 feature 歸檔清理。629 tests pass，+3 新測試 |
| 4 | 2026-02-28 | single | cleanup-残留 | ✅ 完成 | 0 次 | spec 歸檔 + pm/SKILL.md 精簡（125→112 行）。629 tests pass |
| 5 | 2026-02-28 | quick | jsonl-perf-optimization | ✅ 完成 | 0 次 | instinct auto-compact + timeline latest() 反向掃描 + query() 快速路徑。655 tests pass，+26 新測試 |
| 6 | 2026-02-28 | standard | hook-error-handling | ✅ 完成 | 0 次 | hook-utils.js 統一錯誤處理 + 6 hook 重構 + post-use async→sync。667 tests pass，+12 新測試 |
| 7 | 2026-02-28 | single | skill-md-cognitive-load | ✅ 完成 | 0 次 | auto/SKILL.md 110→105 行精簡 + roadmap 0-5 完成。667 tests pass |
| 8 | 2026-02-28 | quick | spec-docs-sync | ✅ 完成 | 0 次 | 8 個 docs/spec/*.md 全面同步至 v0.17.7 + registry.js comment 修正。667 tests pass |
| 9 | 2026-02-28 | standard | precompact-hook | ✅ 完成 | 0 次 | 第 7 個 hook：PreCompact。buildPendingTasksMessage 共用函式 + on-start.js 重構。704 tests pass，+37 新測試 |
| 10 | 2026-02-28 | single | timeline-count | ✅ 完成 | 0 次 | 新功能：timeline.count() 事件計數函式（無 filter → 行數計數、有 filter → 解析計數）。722 tests pass，+18 新測試 |
| 11 | 2026-02-28 | single | wording-module-extraction | ✅ 完成 | 0 次 | post-use.js wording 邏輯提取為 wording.js 獨立模組（270→193 行）。722 tests pass |
| 12 | 2026-02-28 | quick | instinct-getbyid | ✅ 完成 | 0 次 | 新功能：instinct.getById() + CLI get 命令。731 tests pass，+9 新測試 |
| 13 | 2026-02-28 | quick | arch-doc-line-count-fix | ✅ 完成 | 0 次 | overtone-架構.md hook 行數修正至實際值（REVIEW+TEST 並行品質門檻通過）。731 tests pass |
| 14 | 2026-02-28 | standard | readme-rewrite | ✅ 完成 | 0 次 | 新功能：README 全面重寫「3 分鐘上手」+ docs/index.md 同步。731 tests pass |
| 15 | 2026-02-28 | standard | status-skill | ✅ 完成 | 0 次 | 新功能：第 31 個 skill /ot:status 系統狀態快照。731 tests pass |

### 成功指標

| 指標 | 目標值 |
|------|--------|
| quick workflow 完成率 | ≥ 80%（5 次中 ≥ 4 次完成） |
| standard workflow 完成率 | ≥ 80%（6 次中 ≥ 5 次完成） |
| 任務類型覆蓋 | 「新功能」≥ 2 次 |
| 人工介入頻率 | < 1 次/workflow |

### Exit Criteria

- [x] 15 次測試完成（single 4/4, quick 5/5, standard 6/6），完成率 100%
- [x] quick 和 standard 完成率均 ≥ 80%（實際：均 100%）
- [x] 任務類型含至少 2 次「新功能」（實際：4 次 — #10 timeline.count、#12 instinct.getById、#14 README、#15 status skill）
- [x] 發現的關鍵問題已修復（15 次 0 人工介入）

</details>

<details>
<summary>Phase 1: Onboarding（首次體驗）— ✅ 完成</summary>

**目標**：讓一個從未用過 Overtone 的人，在 5 分鐘內裝好並成功跑一次 quick workflow。

### Entry Criteria

- [x] Phase 0 完成

### 核心工作

| # | 任務 | 說明 | 狀態 |
|---|------|------|:----:|
| 1-1 | README 重寫 | 「3 分鐘上手」三步驟：安裝 → 第一次使用 → 看到結果。只展示 single/quick/standard | ✅（Phase 0 #14） |
| 1-2 | SessionStart banner 優化 | 清晰告知新使用者可以做什麼 | ✅ |
| 1-3 | plugin.json description 更新 | 改為「裝上 Claude Code，就像有了一個開發團隊」 | ✅ |
| 1-4 | ~~非 Overtone 專案實戰~~ | 降級至 Phase 2 前置（外部驗證範疇） | ➡️ Phase 2 |
| 1-5 | 規格文件同步 | 修正 agent 數量（15→17）、workflow 數量（15→18）、test 數量等不一致 | ✅（Phase 0 #13-#15） |

### Exit Criteria

- [x] README 完成重寫
- [x] 規格文件不一致全部修正
- [x] SessionStart banner + plugin.json description 更新

> 1-4（非 Overtone 專案實戰）降級至 Phase 2 前置任務，理由：外部專案驗證屬於「外部驗證」範疇，與 Phase 2 目標重疊。

</details>
