# CLAUDE.md

# Overtone — 開發 Repo

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

此 repo 提供 tests、docs、specs 支撐開發品質。實際程式碼存放在 `~/.claude/`（唯一 SoT）。

## 核心目標（討論式派發用）

- **core_objective**：推進 `~/.claude/` 達 L1-L4 Agent Harness 核心 — Guide（rules/skills）+ Sensor（hooks）+ Closed-Loop（feedback），打造通用自主代理底層。
- **non_negotiables**（不可協商底線）：
  - 測試零容忍（全域元件改動必先跑測試，失敗不放行）
  - 治本優先（結構性缺陷 > 末端修補，不接受 workaround）
  - `~/.claude/` 唯一 SoT（禁止 fork / 禁止另建全域元件）
  - Feedback Loop 閉環（每個產出必須有驗證證據，觀察 → 驗證 → 改善，半途而廢或靜默失敗均不接受）

> 詳見 `~/.claude/rules/協作/討論式派發.md`。

## 雙 Repo 管理

| Repo         | 路徑                   | GitHub            | 內容                         |
| ------------ | ---------------------- | ----------------- | ---------------------------- |
| **nova**     | `~/.claude/`           | `ryu111/nova`     | nova 全域專案 SoT            |
| **nova-brain** | `~/projects/nova-brain/` | `ryu111/nova-brain` | 開發輔助（tests/docs/specs） |

每次迭代完成後，📋 MUST commit 並 push 兩個 repo 的變更。

> 定位、架構概要、工作流觸發、常用管理指令詳見全域 `~/.claude/CLAUDE.md`。

## 技術棧

| 模組 | 技術 |
|------|------|
| Runtime | Bun |
| 測試 | bun:test（多核並行） |
| 文件 | VitePress |
| Lint | Biome |

## 目錄結構

```
nova-brain/
├── tests/          # 單元 + 整合測試（1354 pass）
├── spec/           # 三狀態任務管理（待做/進行中/完成）
├── docs/           # 設計文件 + 願景
├── dashboard/      # Flow Visualizer 前端
└── scripts/        # 測試輔助腳本
```

## 常用指令

```bash
# 測試
bun test                         # 多核並行 unit（預設，~1s）
bun test:all                     # 多核 unit + integration（CI 用，~11s）
bun test:seq                     # 單執行緒 unit（出問題時縮小範圍）
bun test:random                  # 洗牌順序（確認無隱藏依賴）

# 任務管理
bun ~/.claude/scripts/spec-tasks.js list          # 查看待做任務
bun ~/.claude/scripts/spec-tasks.js create <名稱> # 建立任務
bun ~/.claude/scripts/spec-tasks.js index         # 更新 spec/index.md
```

## 開發規範

- **文件位置**：設計文件寫在 `docs/`，⚠️ 不要寫在 `~/.claude/` 下
- **元件閉環**：見 `~/.claude/rules/品質/閉環規範.md` → `~/.claude/skills/closed-loop/`

## Hook 改動驗收

Hook 腳本修改和 settings.json 設定變更皆在同一 session 即時生效（無需重啟）。驗收方式：

- **單元測試**：`require()` handler 驗證 output 格式
- **Hook stdout 驗收**：pipe stdin 到 hook 腳本，檢查 JSON 有 `hookSpecificOutput.additionalContext`

```bash
echo '{"prompt":"test","cwd":"'$PWD'"}' | bun ~/.claude/hooks/scripts/prompt/on-submit-flow.js
```

## 關鍵文件

| 文件                                         | 用途                       |
| -------------------------------------------- | -------------------------- |
| `spec/index.md`                              | 專案索引（元件目錄 + 任務狀態）|
| `spec/roadmap.md`                            | 路線圖                     |
| `docs/vision.md`                             | 五層願景定義               |
| `docs/目標場景.md`                            | 5 個端到端驗收場景          |

## Blueprint

> v0 純文件化 Session-agent 定位 (xd-80cb, 2026-04-15)
> protocol reference: `~/.claude/docs/protocols/cross-dispatch-protocol.md`
> 此段是 Session-agent 的 canonical self-description，非 runtime enforce。
> tools_allowed/denied 為 derived view — 真實 SoT 在 `.claude/settings.json`，不一致時以 settings.json 為準。

```yaml
agent_id: nova-brain
version: 0
schema_version: 1
role: 全域元件守門人 + 測試基礎設施擁有者
core_objective: |
  推進 ~/.claude/ 達 L1-L4 Agent Harness 核心 — Guide (rules/skills)
  + Sensor (hooks) + Closed-Loop (feedback)，打造通用自主代理底層。
  守護全域元件品質與一致性，以測試驗收為唯一完成判準。

non_negotiables:
  - 測試零容忍 — 全域元件改動必先跑測試，失敗不放行
  - 治本優先 — 結構性缺陷 > 末端修補，不接受 workaround
  - ~/.claude/ 唯一 SoT — 禁止 fork、禁止另建全域元件
  - 閉環必完整 — 每個產出必有驗證證據，觀察→驗證→改善，半途而廢或靜默失敗均不接受
  - 全域元件變更需 Manager 審查 — 其他 session 不可直接改 ~/.claude/，緊急 bug fix 先修後回報

tools_allowed:
  - write ~/.claude/* (經 Manager 審查通過後，或 Manager 明示 dispatch)
  - write ~/projects/nova-brain/* (tests/spec/docs/scripts)
  - run eval (structural / behavioral / trigger) via bun tests/evals/
  - bun test (unit / integration / seq / random 四模式)
  - cross-dispatch (討論式給任意 target / 實作式僅限 Manager 明示後)
  - TaskCreate / TaskUpdate / AskUserQuestion
  - spawn sub-agents (planner / executor / reviewer via Task tool)

tools_denied:
  - 實作式 dispatch 給其他 project (修改他人 code) — 僅允許討論式 dispatch
  - write nova-manager/* (除非 Manager 明示 dispatch)
  - write 其他 project code 無 Manager 明示
  - 繞過 reviewer-enforcer 的 commit (pre-commit hook 自動守護)

skills_bundled:
  - closed-loop          # 元件閉環 4 層 checklist + spec 同步
  - component-classification  # Guide/Sensor/Closed-Loop 三支柱歸屬
  - skill-judge          # skill 修改前後評分
  - nova-eval            # 結構/行為/trigger eval 三層決策樹
  - nova-test            # Testing Trophy 測試維度
  - feedback-loop        # 完成後三問 + 收尾三 phase
  - wording              # .md/commit/prompt 寫作規範
  - nova-spec            # spec 三狀態管理
  - nova-pm              # 任務管理 + roadmap
  - pinchtab             # 瀏覽器自動化 (PinchTab 優先)

pipeline:
  1. receive dispatch from Manager (via cross-dispatch, 本 protocol §2.2)
  2. depth routing (D0-D4, echo to /tmp/nova-routing-level-nova-brain.txt)
  3. impact analysis (5 題：修什麼檔 / 影響哪些測試 / 依賴哪些 rule / 有無反例 case / reviewer 會抓什麼)
  4. implement with tests (test-first 或 test-parallel，禁 test-last)
  5. reviewer-enforcer 自我驗收 (closed-loop 核心，本 pipeline 不可省)
  6. 修正 reviewer findings (iterate until verdict=pass)
  7. run structural + behavioral eval (依 nova-eval 決策樹)
  8. commit + push (nb repo 必要時含 ~/.claude/ 雙 repo 同步)
  9. complete via POST /api/cross-dispatch/complete (含 verification + next_action_proposal)
  10. 反思四步 (找缺點 → 修缺點 → 補強項 → 外部研究)

inter_agent_protocol:
  reference: ~/.claude/docs/protocols/cross-dispatch-protocol.md
  role_in_discussion: 專業者 (非質疑者)
  discussion_persistence_path: spec/討論/<topic>.md

blueprint_derived_from:
  core_objective: 本 CLAUDE.md §核心目標 (line 11)
  non_negotiables: 本 CLAUDE.md §核心目標 (line 13-16) + Round 2 補充 2 條
  tools_allowed: .claude/settings.json permissions.allow
  tools_denied: .claude/settings.json permissions.deny + cross-dispatch 規則
  skills_bundled: 觀察本 session 高頻引用，非硬綁定
  pipeline: 觀察本 session 實際工作流，Round 2 補 reviewer 階段

blueprint_stability_metric:
  week_0_baseline: 2026-04-15 (xd-80cb 首次寫入)
  success_criterion: 1 週內實質修改 (non_negotiables/pipeline/tools ≥3 行改動) 次數 ≤1
  measurement: git log --follow CLAUDE.md | grep Blueprint
```

