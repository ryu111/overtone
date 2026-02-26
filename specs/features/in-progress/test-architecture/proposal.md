# Proposal: test-architecture

## 功能名稱

`test-architecture`（測試架構重構 — 遷移到專案根目錄 + 動態調度機制）

## 需求背景（Why）

- **問題**：目前 13 個測試全部放在 `plugins/overtone/tests/`，沒有 unit/integration/e2e 分層，無法區分快速回饋（unit）和完整驗證（integration）的測試；測試與功能代碼在同一個 plugin 目錄下不利於跨模組管理
- **目標**：建立標準化測試目錄架構、命名規範、動態調度機制，讓 tester/e2e-runner/qa 各 agent 有明確的職責邊界和檔案位置
- **優先級**：測試基礎設施是其他功能品質的保障，越早建立規範越能避免技術債累積

## 使用者故事

```
身為 Overtone 使用者
我想要 測試自動按 unit/integration/e2e 分層管理，developer 在 Handoff 中標記測試範圍後自動調度對應 agent
以便 測試回饋更快、職責更清晰、不需手動判斷該跑哪種測試
```

## 範圍邊界

### 在範圍內（In Scope）

- 建立 `tests/` 根目錄架構（unit/integration/e2e/helpers/fixtures/reports）
- 遷移 13 個現有測試到對應目錄並修正 require 路徑
- 修改 4 個 agent prompt（developer, tester, e2e-runner, qa）
- 修改 4 個 skill（auto, test, e2e, qa）
- 建立 Test Scope 動態調度機制（developer Handoff → main agent 調度）
- 建立規範文件（testing-guide, testing-conventions, test-scope-dispatch）
- 更新 package.json / bunfig.toml 測試配置
- 測試遷移後全部 pass 驗證

### 不在範圍內（Out of Scope）

- 撰寫新測試（只遷移現有測試）
- 引入新的測試框架（仍用 bun:test）
- 建立 CI/CD pipeline
- 建立 coverage 報告機制（reports/ 目錄只是預留）
- E2E 測試框架選型（目前無 E2E 測試，e2e/ 只建立空目錄）

## 子任務清單

### Phase 1: 規範文件建立（sequential）

1. **建立規範文件**
   - 負責 agent: developer
   - 相關檔案:
     - `docs/reference/testing-guide.md`
     - `plugins/overtone/skills/test/references/testing-conventions.md`
     - `plugins/overtone/skills/auto/references/test-scope-dispatch.md`
   - 說明: 建立測試方法論、命名規範、Test Scope 調度規則

### Phase 2: 目錄建立 + 測試遷移（parallel — 可拆為 2 個 developer）

2. **建立目錄結構 + 遷移 unit 測試（2 個）**
   - 負責 agent: developer
   - 相關檔案:
     - `tests/unit/identify-agent.test.js` [新建]
     - `tests/unit/parse-result.test.js` [新建]
   - 說明: 建立 `tests/{unit,integration,e2e,helpers,fixtures,reports}` 目錄，遷移 2 個 unit 測試，修正 require 路徑

3. **遷移 integration 測試（11 個）**（可與 2 並行）
   - 負責 agent: developer
   - 相關檔案:
     - `tests/integration/utils.test.js` [新建]
     - `tests/integration/state.test.js` [新建]
     - `tests/integration/loop.test.js` [新建]
     - `tests/integration/instinct.test.js` [新建]
     - `tests/integration/timeline.test.js` [新建]
     - `tests/integration/specs.test.js` [新建]
     - `tests/integration/wording.test.js` [新建]
     - `tests/integration/session-stop.test.js` [新建]
     - `tests/integration/on-submit.test.js` [新建]
     - `tests/integration/agent-on-stop.test.js` [新建]
     - `tests/integration/server.test.js` [新建]
   - 說明: 遷移 11 個 integration 測試，修正 require 路徑

### Phase 3: 配置更新 + Agent/Skill 修改（parallel — 可拆為 2 個 developer）

4. **更新測試配置 + 刪除舊目錄**
   - 負責 agent: developer
   - 相關檔案:
     - `plugins/overtone/package.json` [修改]
     - `bunfig.toml` [新建] 或專案根 `package.json` [新建]
     - `.gitignore` [修改 — 加入 tests/reports/]
     - `plugins/overtone/tests/` [刪除]
   - 說明: 更新 bun test 掃描路徑，確保遷移後全部測試 pass，刪除舊測試目錄

5. **修改 Agent Prompts + Skills**（可與 4 並行）
   - 負責 agent: developer
   - 相關檔案:
     - `plugins/overtone/agents/developer.md` [修改]
     - `plugins/overtone/agents/tester.md` [修改]
     - `plugins/overtone/agents/e2e-runner.md` [修改]
     - `plugins/overtone/agents/qa.md` [修改]
     - `plugins/overtone/skills/auto/SKILL.md` [修改]
     - `plugins/overtone/skills/test/SKILL.md` [修改]
     - `plugins/overtone/skills/e2e/SKILL.md` [修改]
     - `plugins/overtone/skills/qa/SKILL.md` [修改]
   - 說明: 新增 Test Scope 格式、動態調度規則、測試存放路徑規範、刪除功能時的測試清理規則

### Phase 4: 文件同步（sequential）

6. **更新專案文件**
   - 負責 agent: developer
   - 相關檔案:
     - `CLAUDE.md` [修改 — 更新目錄結構、常用指令]
     - `docs/status.md` [修改]
   - 說明: 同步 CLAUDE.md 中的目錄結構描述、測試指令說明

## 開放問題

1. 測試的 `require` 路徑重寫策略：是用相對路徑 `../../plugins/overtone/scripts/lib/...` 還是建立 helpers/paths.js 統一管理？（交由 architect 決定）
2. `bunfig.toml` 放在專案根目錄還是 plugin 目錄？測試指令要從哪裡執行？（交由 architect 決定）
3. 現有測試中 `__dirname` 引用 hook 腳本路徑的修正策略（交由 architect 決定）
